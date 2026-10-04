// Audit 2026-10 — Fase 4: diritti premium da Stripe e Google Play riconciliati.
// Stripe e Play sono simulati: nessun pagamento reale, nessuna rete.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const billing = require('../functions/billing.js');
const entitlements = require('../functions/entitlements.js');
const security = require('../functions/security.js');
const stripeBilling = require('../functions/stripeBilling.js');
const { createFakeFirestore, Timestamp } = require('./helpers/fakeFirestore.cjs');

const NOW = Date.parse('2026-10-04T12:00:00Z');
const DAY = 86400e3;
const sec = ms => Math.floor(ms / 1000);
const PRICES = { STRIPE_PRICE_STUDENT: 'price_student_m', STRIPE_PRICE_STUDENT_YEARLY: 'price_student_y', STRIPE_PRICE_PRO: 'price_pro_m' };
const priceMap = billing.priceMapFromEnv(PRICES);
const subObj = (id, status, { price = 'price_student_m', created = NOW - DAY, end = NOW + 20 * DAY, customer = 'cus_A', meta = {} } = {}) =>
  ({ id, object: 'subscription', status, customer, created: sec(created), metadata: meta, cancel_at_period_end: false,
     items: { data: [{ price: { id: price }, current_period_end: sec(end) }] } });

function fakeStripe(subs, customers = {}) {
  const calls = { retrieve: 0 };
  return { calls, subscriptions: { retrieve: async id => { calls.retrieve++; if (!subs[id]) throw Object.assign(new Error('No such subscription'), { type: 'StripeInvalidRequestError' }); return subs[id]; } },
    customers: { retrieve: async id => customers[id] || { id, metadata: {} } } };
}
const ev = (id, type, object) => ({ id, type, data: { object } });

describe('matrice dei diritti (effectivePlan)', () => {
  const ts = ms => Timestamp.fromMillis(ms);
  const stripeRec = (status, plan = 'student', end = NOW + 10 * DAY) => ({ id: 'sub_1', status, plan, periodEnd: end });
  it('free / trial / Student / Pro / scaduto', () => {
    expect(entitlements.effectivePlan({ plan: 'free' }, NOW).plan).toBe('free');
    expect(entitlements.effectivePlan({ plan: 'free', trialPlan: 'student', trialExpiresAt: NOW + DAY }, NOW)).toMatchObject({ plan: 'student', trial: true });
    expect(entitlements.effectivePlan({ plan: 'student', planSource: 'stripe', stripeSubscription: stripeRec('active') }, NOW).plan).toBe('student');
    expect(entitlements.effectivePlan({ plan: 'pro', planSource: 'stripe', stripeSubscription: stripeRec('trialing', 'pro') }, NOW).plan).toBe('pro');
    for (const st of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'])
      expect(entitlements.effectivePlan({ plan: 'student', planSource: 'stripe', stripeSubscription: stripeRec(st) }, NOW)).toMatchObject({ plan: 'free', paidExpired: true });
    expect(entitlements.effectivePlan({ plan: 'student', planSource: 'google_play', planExpiresAt: ts(NOW - 1) }, NOW)).toMatchObject({ plan: 'free', paidExpired: true });
  });
  it('pagamento in ritardo (past_due): 14 giorni dal primo ritardo, non dalla fine del periodo (che Stripe sposta avanti)', () => {
    const pd = since => ({ plan: 'student', planSource: 'stripe', stripeSubscription: { ...stripeRec('past_due', 'student', NOW + 360 * DAY), pastDueSince: since } });
    expect(entitlements.effectivePlan(pd(NOW - 3 * DAY), NOW)).toMatchObject({ plan: 'student', pastDue: true });
    expect(entitlements.effectivePlan(pd(NOW - 15 * DAY), NOW).plan).toBe('free');   // annuale: niente "un anno gratis"
  });
  it('piano concesso a mano (planSource diverso) resta anche con uno stato Stripe chiuso', () => {
    expect(entitlements.effectivePlan({ plan: 'pro', planSource: 'manual', stripeSubscription: stripeRec('canceled') }, NOW).plan).toBe('pro');
  });
  it('due provider insieme: vince il piano più alto; Play scaduto non toglie Stripe attivo', () => {
    const both = { plan: 'student', planSource: 'google_play', planExpiresAt: ts(NOW + DAY), googlePlaySubscription: { sku: 'cortex_student_monthly', expiresAt: ts(NOW + DAY) }, stripeSubscription: stripeRec('active', 'pro') };
    expect(entitlements.effectivePlan(both, NOW)).toMatchObject({ plan: 'pro', source: 'stripe' });
    const playGone = { ...both, planExpiresAt: ts(NOW - DAY), googlePlaySubscription: { sku: 'cortex_student_monthly', expiresAt: ts(NOW - DAY) }, stripeSubscription: stripeRec('active', 'student') };
    expect(entitlements.effectivePlan(playGone, NOW)).toMatchObject({ plan: 'student', source: 'stripe' });
  });
});

describe('webhook Stripe riconciliato', () => {
  let f, stripe, subs;
  const run = (event) => billing.handleStripeEvent({ db: f.db, admin: f.admin, stripe, event, priceMap, now: NOW, checkoutGrant: stripeBilling.subscriptionCheckoutGrant });
  const checkout = (sub = 'sub_1', over = {}) => ev('evt_co', 'checkout.session.completed', { id: 'cs_1', mode: 'subscription', status: 'complete', payment_status: 'paid', customer: 'cus_A', subscription: sub, metadata: { uid: 'U1', plan: 'student' }, ...over });
  beforeEach(() => {
    f = createFakeFirestore({ now: () => NOW });
    f.rows.set('users/U1', { plan: 'free', stripeCustomerId: 'cus_A' });
    subs = { sub_1: subObj('sub_1', 'active') };
    stripe = fakeStripe(subs);
  });

  it('checkout completato → Student, con lo stato riletto da Stripe', async () => {
    expect(await run(checkout())).toMatchObject({ status: 'applied', uid: 'U1', plan: 'student' });
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'student', planSource: 'stripe', planCycle: 'monthly', stripeSubscriptionId: 'sub_1', stripeSubscription: { id: 'sub_1', status: 'active', plan: 'student' } });
    expect(f.rows.get('stripeCustomers/cus_A')).toEqual({ uid: 'U1' });
  });

  it('pagamento fallito → free; poi pagamento recuperato (invoice.paid) → piano ripristinato', async () => {
    await run(checkout());
    subs.sub_1 = subObj('sub_1', 'unpaid');
    await run(ev('evt_f', 'invoice.payment_failed', { id: 'in_1', customer: 'cus_A', subscription: 'sub_1' }));
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'free', winbackEligible: true, cancelReason: 'payment_failed' });
    subs.sub_1 = subObj('sub_1', 'active');
    // forma delle API Stripe recenti: l'abbonamento sta in parent.subscription_details
    await run(ev('evt_p', 'invoice.paid', { id: 'in_2', customer: 'cus_A', parent: { subscription_details: { subscription: 'sub_1' } } }));
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'student', planSource: 'stripe' });
  });

  it('evento ripetuto: elaborato una volta sola', async () => {
    const e = checkout();
    await run(e);
    expect(await run(e)).toEqual({ status: 'duplicate' });
    expect(stripe.calls.retrieve).toBe(1);
  });

  it('evento vecchio dopo uno nuovo: conta lo stato attuale su Stripe, non il contenuto dell\'evento', async () => {
    await run(checkout());
    subs.sub_1 = subObj('sub_1', 'canceled');
    await run(ev('evt_del', 'customer.subscription.deleted', subs.sub_1));
    // arriva in ritardo un "updated" con dentro ancora active: Stripe dice canceled → resta free
    await run(ev('evt_old', 'customer.subscription.updated', subObj('sub_1', 'active')));
    expect(f.rows.get('users/U1').plan).toBe('free');
  });

  it('disdetta di un abbonamento vecchio non toglie il piano a quello nuovo', async () => {
    subs.sub_old = subObj('sub_old', 'canceled', { created: NOW - 60 * DAY });
    subs.sub_new = subObj('sub_new', 'active', { price: 'price_pro_m', created: NOW - DAY });
    await run(checkout('sub_new', { metadata: { uid: 'U1', plan: 'pro' } }));
    expect(await run(ev('evt_old_del', 'customer.subscription.deleted', subs.sub_old))).toMatchObject({ status: 'ignored', reason: 'older_subscription' });
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'pro', stripeSubscriptionId: 'sub_new' });
  });

  it('cambio piano dal portale (subscription.updated) → nuovo piano', async () => {
    await run(checkout());
    subs.sub_1 = subObj('sub_1', 'active', { price: 'price_pro_m' });
    await run(ev('evt_up', 'customer.subscription.updated', subs.sub_1));
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'pro' });
  });

  it('checkout Sparks sull\'endpoint abbonamenti: nessuna promozione a Student', async () => {
    const r = await run(ev('evt_sp', 'checkout.session.completed', { id: 'cs_sp', mode: 'payment', payment_status: 'paid', customer: 'cus_A', metadata: { uid: 'U1', sparks: '50', type: 'sparks' } }));
    expect(r).toMatchObject({ status: 'ignored', reason: 'not_subscription_mode' });
    expect(f.rows.get('users/U1').plan).toBe('free');
    expect(stripe.calls.retrieve).toBe(0);
  });

  it('cliente senza mapping: uid dai metadata dell\'abbonamento; nessun uid → ignorato senza errori', async () => {
    f.rows.set('users/U2', { plan: 'free' });
    subs.sub_2 = subObj('sub_2', 'active', { customer: 'cus_B', meta: { uid: 'U2', plan: 'student' } });
    expect(await run(ev('evt_c2', 'customer.subscription.created', subs.sub_2))).toMatchObject({ status: 'applied', uid: 'U2' });
    subs.sub_3 = subObj('sub_3', 'active', { customer: 'cus_X' });
    expect(await run(ev('evt_c3', 'customer.subscription.created', subs.sub_3))).toMatchObject({ status: 'ignored', reason: 'unknown_customer' });
    expect(f.rows.get('_stripeEvents/evt_c3')).toMatchObject({ status: 'ignored' });
  });

  it('past_due: la tolleranza parte dal primo evento in ritardo e non si azzera con gli eventi successivi', async () => {
    await run(checkout());
    subs.sub_1 = subObj('sub_1', 'past_due', { end: NOW + 360 * DAY });
    await run(ev('evt_pd1', 'invoice.payment_failed', { id: 'in_1', subscription: 'sub_1' }));
    const since = f.rows.get('users/U1').stripeSubscription.pastDueSince;
    expect(since).toBe(NOW);
    await billing.handleStripeEvent({ db: f.db, admin: f.admin, stripe, event: ev('evt_pd2', 'invoice.payment_failed', { id: 'in_2', subscription: 'sub_1' }), priceMap, now: NOW + 5 * DAY, checkoutGrant: stripeBilling.subscriptionCheckoutGrant });
    expect(f.rows.get('users/U1').stripeSubscription.pastDueSince).toBe(since);
    expect(entitlements.effectivePlan(f.rows.get('users/U1'), NOW + 15 * DAY).plan).toBe('free');
  });

  it('prezzo non più mappato: la disdetta dell\'abbonamento già noto viene comunque applicata', async () => {
    f.rows.set('users/U1', { plan: 'student', planSource: 'stripe', stripeCustomerId: 'cus_A', stripeSubscriptionId: 'sub_legacy' });   // documento pre-fase 4
    f.rows.set('stripeCustomers/cus_A', { uid: 'U1' });
    subs.sub_legacy = subObj('sub_legacy', 'canceled', { price: 'price_vecchio' });
    expect(await run(ev('evt_lg', 'customer.subscription.deleted', subs.sub_legacy))).toMatchObject({ status: 'applied', plan: 'free' });
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'free', cancelReason: 'canceled', stripeSubscription: { status: 'canceled', plan: 'student' } });
  });

  it('prezzo sconosciuto su un abbonamento attivo mai visto: nessun piano inventato', async () => {
    f.rows.set('stripeCustomers/cus_A', { uid: 'U1' });
    subs.sub_x = subObj('sub_x', 'active', { price: 'price_ignoto' });
    expect(await run(ev('evt_x', 'customer.subscription.created', subs.sub_x))).toMatchObject({ status: 'ignored', reason: 'unknown_price' });
  });

  it('pagamento recuperato: il banner di "ritorno" non resta acceso', async () => {
    await run(checkout());
    subs.sub_1 = subObj('sub_1', 'unpaid');
    await run(ev('evt_u', 'invoice.payment_failed', { id: 'in_1', subscription: 'sub_1' }));
    expect(f.rows.get('users/U1').winbackEligible).toBe(true);
    subs.sub_1 = subObj('sub_1', 'active');
    await run(ev('evt_ok', 'invoice.paid', { id: 'in_2', subscription: 'sub_1' }));
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'student', winbackEligible: false, canceledAt: null, cancelReason: null });
  });

  it('due abbonamenti attivi per lo stesso cliente: tiene il migliore e segnala il doppione (nessuna disdetta automatica)', async () => {
    subs.sub_1 = subObj('sub_1', 'active', { created: NOW - 2 * DAY });
    subs.sub_2 = subObj('sub_2', 'active', { price: 'price_pro_m', created: NOW - DAY });
    stripe.subscriptions.list = async () => ({ data: [subs.sub_1, subs.sub_2] });
    await run(checkout('sub_1'));
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'pro', stripeSubscriptionId: 'sub_2', stripeDuplicateSubscriptions: ['sub_2', 'sub_1'] });
    // il migliore viene disdetto: si passa all'altro ancora pagato, non a free
    subs.sub_2 = subObj('sub_2', 'canceled', { price: 'price_pro_m', created: NOW - DAY });
    await run(ev('evt_c', 'customer.subscription.deleted', subs.sub_2));
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'student', stripeSubscriptionId: 'sub_1' });
    expect(f.rows.get('users/U1').stripeDuplicateSubscriptions).toBeUndefined();
  });

  it('abbonamento pagato su un account già cancellato: segnalato per la gestione a mano', async () => {
    f.rows.set('_deletionLocks/U1', { lockedAt: 1 });
    await run(checkout());
    expect(f.rows.get('_billingAlerts/deleted_sub_1')).toMatchObject({ type: 'active_subscription_on_deleted_account' });
  });

  it('abbonamento inesistente su Stripe (404): ignorato e marcato, niente riconsegne infinite', async () => {
    const e = ev('evt_404', 'customer.subscription.updated', { id: 'sub_gone' });
    stripe.subscriptions.retrieve = async () => { throw Object.assign(new Error('No such subscription'), { code: 'resource_missing', statusCode: 404 }); };
    expect(await run(e)).toMatchObject({ status: 'ignored', reason: 'subscription_missing' });
    expect(f.rows.has('_stripeEvents/evt_404')).toBe(true);
  });

  it('Stripe non risponde: errore (il webhook risponde 500), nessun marker → la riconsegna viene elaborata', async () => {
    const e = ev('evt_r', 'customer.subscription.updated', { id: 'sub_missing' });
    stripe.subscriptions.retrieve = async () => { throw Object.assign(new Error('timeout'), { type: 'StripeConnectionError' }); };
    await expect(run(e)).rejects.toThrow();
    expect(f.rows.has('_stripeEvents/evt_r')).toBe(false);
  });

  it('account in cancellazione: nessun documento ricreato', async () => {
    f.rows.set('_deletionLocks/U1', { lockedAt: 1 });
    expect(await run(checkout())).toMatchObject({ status: 'ignored', reason: 'account_deleting' });
    expect(f.rows.get('users/U1').plan).toBe('free');
  });
});

describe('Google Play: notifiche RTDN e riconciliazione', () => {
  const SKU = 'cortex_student_monthly', TOKEN = 'tok-play-1';
  let f;
  const play = (state, expiry) => security.normalizePlaySubscription({ subscriptionState: state, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    lineItems: [{ productId: SKU, expiryTime: new Date(expiry).toISOString(), autoRenewingPlan: { autoRenewEnabled: state === 'SUBSCRIPTION_STATE_ACTIVE' } }] }, SKU, NOW);
  const notify = (type, purchase, token = TOKEN) => billing.handlePlayNotification({ db: f.db, admin: f.admin, security, packageName: 'app.web.cortex_app.twa', now: NOW,
    readPurchase: async () => purchase, msg: { packageName: 'app.web.cortex_app.twa', subscriptionNotification: { notificationType: type, purchaseToken: token, subscriptionId: SKU } } });
  beforeEach(() => {
    f = createFakeFirestore({ now: () => NOW });
    f.rows.set('users/P1', { plan: 'student', planSource: 'google_play', planExpiresAt: Timestamp.fromMillis(NOW + 2 * DAY), googlePlaySubscription: { sku: SKU, purchaseToken: TOKEN, expiresAt: Timestamp.fromMillis(NOW + 2 * DAY) } });
    f.rows.set('_purchaseReceipts/' + security.hash(TOKEN), { uid: 'P1', sku: SKU });
  });

  it('rinnovo (RENEWED): nuova scadenza registrata senza riaprire l\'app', async () => {
    expect(await notify(2, play('SUBSCRIPTION_STATE_ACTIVE', NOW + 32 * DAY))).toMatchObject({ status: 'applied', plan: 'student', type: 'RENEWED' });
    expect(entitlements.toMillis(f.rows.get('users/P1').planExpiresAt)).toBe(NOW + 32 * DAY);
  });
  it('scadenza (EXPIRED) e sospensione (ON_HOLD): piano tolto subito, anche se l\'app non viene aperta', async () => {
    await notify(13, play('SUBSCRIPTION_STATE_EXPIRED', NOW - DAY));
    expect(f.rows.get('users/P1')).toMatchObject({ plan: 'free', winbackEligible: true, cancelReason: 'play_expired' });
    expect(entitlements.effectivePlan(f.rows.get('users/P1'), NOW).plan).toBe('free');
  });
  it('revoca/rimborso (REVOKED) con scadenza ancora futura: nessun diritto da subito', async () => {
    await notify(12, play('SUBSCRIPTION_STATE_EXPIRED', NOW + 20 * DAY));
    expect(entitlements.effectivePlan(f.rows.get('users/P1'), NOW).plan).toBe('free');
  });
  it('disdetta (CANCELED): accesso fino alla scadenza, poi stop', async () => {
    await notify(3, play('SUBSCRIPTION_STATE_CANCELED', NOW + 2 * DAY));
    expect(entitlements.effectivePlan(f.rows.get('users/P1'), NOW).plan).toBe('student');
    expect(entitlements.effectivePlan(f.rows.get('users/P1'), NOW + 3 * DAY).plan).toBe('free');
  });
  it('upgrade/riattivazione: il token nuovo collegato al vecchio passa allo stesso account', async () => {
    const p = { ...play('SUBSCRIPTION_STATE_ACTIVE', NOW + 30 * DAY), linkedPurchaseToken: TOKEN };
    expect(await notify(4, p, 'tok-nuovo')).toMatchObject({ status: 'applied', uid: 'P1', linked: true });
    expect(f.rows.get('_purchaseReceipts/' + security.hash('tok-nuovo'))).toMatchObject({ uid: 'P1', sku: SKU });
    expect(f.rows.get('users/P1').googlePlaySubscription.purchaseToken).toBe('tok-nuovo');
    // la scadenza del vecchio token non toglie più il piano
    await notify(13, play('SUBSCRIPTION_STATE_EXPIRED', NOW - DAY), TOKEN);
    expect(entitlements.effectivePlan(f.rows.get('users/P1'), NOW).plan).toBe('student');
  });
  it('ricevuta non ancora attribuita a un account: ignorata (la attribuisce l\'app)', async () => {
    expect(await notify(4, play('SUBSCRIPTION_STATE_ACTIVE', NOW + 30 * DAY), 'tok-sconosciuto')).toMatchObject({ status: 'ignored', reason: 'unclaimed_receipt' });
  });
  it('un abbonamento Play non abbassa un piano Stripe più alto', async () => {
    f.rows.set('users/P1', { ...f.rows.get('users/P1'), plan: 'pro', planSource: 'stripe', stripeSubscription: { id: 'sub_9', status: 'active', plan: 'pro', periodEnd: NOW + 20 * DAY } });
    await notify(2, play('SUBSCRIPTION_STATE_ACTIVE', NOW + 30 * DAY));
    expect(f.rows.get('users/P1')).toMatchObject({ plan: 'pro', planSource: 'stripe' });
  });
  it('Sparks rimborsati (voided): crediti tolti una volta sola, mai sotto zero', async () => {
    const T = 'tok-sparks';
    f.rows.set('_purchaseReceipts/' + security.hash(T), { uid: 'P1', sku: 'cortex_sparks_50' });
    f.rows.set('users/P1', { ...f.rows.get('users/P1'), sparksBalance: 30 });
    const voided = () => billing.handlePlayNotification({ db: f.db, admin: f.admin, security, packageName: 'app.web.cortex_app.twa', now: NOW, readPurchase: async () => null,
      msg: { packageName: 'app.web.cortex_app.twa', voidedPurchaseNotification: { purchaseToken: T, productType: 2 } } });
    expect(await voided()).toMatchObject({ status: 'applied', sparksRemoved: 30 });
    expect(await voided()).toMatchObject({ status: 'duplicate' });
    expect(f.rows.get('users/P1').sparksBalance).toBe(0);
  });
  it('notifica di prova e di un altro pacchetto: nessun effetto', async () => {
    const h = msg => billing.handlePlayNotification({ db: f.db, admin: f.admin, security, packageName: 'app.web.cortex_app.twa', readPurchase: async () => null, msg });
    expect(await h({ testNotification: { version: '1.0' } })).toEqual({ status: 'test' });
    expect(await h({ packageName: 'altro', subscriptionNotification: { purchaseToken: TOKEN } })).toMatchObject({ status: 'ignored', reason: 'package' });
  });
});

// Sezione reale di functions/index.js (checkout/portale) con Stripe simulato.
function loadStripeSection({ db, admin, stripe, env = {} }) {
  const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const start = src.indexOf('// ─── Phase 12: Stripe Integration');
  const end = src.indexOf('/**\n * verifyGooglePlayPurchase');
  const exports = {};
  class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  vm.runInNewContext('const PLAY_PACKAGE_NAME = () => "app.web.cortex_app.twa";\n' + src.slice(start, end), {
    exports, db, admin, entitlements, billing, stripeBilling, security, getStripe: () => stripe, getClientIp: () => '1.1.1.1', ipRateLimit: () => true,
    console: { error() {}, warn() {}, log() {} }, process: { env: { ...PRICES, ...env } },
    functions: { https: { onCall: fn => fn, onRequest: fn => fn, HttpsError } }, Date, Math, JSON, Object, String, Number, Promise, Error, encodeURIComponent,
  });
  return exports;
}

describe('checkout e "Gestisci abbonamento"', () => {
  let f, calls, stripe, fns;
  const ctx = uid => ({ auth: { uid, token: { email: uid + '@example.test' } }, app: {} });
  beforeEach(() => {
    f = createFakeFirestore({ now: () => NOW });
    calls = [];
    stripe = {
      customers: { create: async (p, o) => { calls.push(['customer', o && o.idempotencyKey]); return { id: 'cus_new' }; } },
      checkout: { sessions: { create: async (p, o) => { calls.push(['session', o && o.idempotencyKey, p.subscription_data]); return { url: 'https://checkout.stripe.test/s' }; } } },
      billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.test/p' }) } },
    };
    fns = loadStripeSection({ db: f.db, admin: f.admin, stripe });
  });

  it('doppio checkout: chiavi di idempotenza su cliente e sessione; uid e piano anche sull\'abbonamento', async () => {
    f.rows.set('users/U1', { plan: 'free' });
    await fns.createCheckoutSession({ plan: 'student' }, ctx('U1'));
    expect(calls[0]).toEqual(['customer', 'customer_U1']);
    expect(calls[1][1]).toMatch(/^checkout_U1_student_\d+$/);
    expect(calls[1][2]).toEqual({ metadata: { uid: 'U1', plan: 'student' } });
    expect(f.rows.get('stripeCustomers/cus_new')).toEqual({ uid: 'U1' });
  });
  it('un solo checkout aperto: le pagine di pagamento aperte prima per un altro piano vengono chiuse', async () => {
    f.rows.set('users/U1', { plan: 'free', stripeCustomerId: 'cus_1' });
    const expired = [];
    stripe.checkout.sessions.list = async () => ({ data: [
      { id: 'cs_pro', mode: 'subscription', metadata: { plan: 'pro' }, created: Math.floor(Date.now() / 1000) },
      { id: 'cs_same', mode: 'subscription', metadata: { plan: 'student' }, created: Math.floor(Date.now() / 1000) },
      { id: 'cs_sparks', mode: 'payment', metadata: { type: 'sparks' }, created: 1 } ] });
    stripe.checkout.sessions.expire = async id => { expired.push(id); };
    await fns.createCheckoutSession({ plan: 'student' }, ctx('U1'));
    expect(expired).toEqual(['cs_pro']);   // la stessa richiesta (doppio clic) resta: la ritorna l'idempotenza
  });
  it('account in cancellazione: niente checkout e niente documento ricreato', async () => {
    f.rows.set('_deletionLocks/U9', { lockedAt: 1 });
    await expect(fns.createCheckoutSession({ plan: 'student' }, ctx('U9'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(f.rows.has('users/U9')).toBe(false);
  });
  it('già abbonato (Stripe o Play): nessun secondo abbonamento', async () => {
    f.rows.set('users/U1', { plan: 'student', planSource: 'stripe', stripeSubscription: { id: 's', status: 'active', plan: 'student' } });
    await expect(fns.createCheckoutSession({ plan: 'pro' }, ctx('U1'))).rejects.toMatchObject({ code: 'already-exists' });
    f.rows.set('users/U2', { plan: 'student', planSource: 'google_play', planExpiresAt: Timestamp.fromMillis(Date.now() + DAY) });
    await expect(fns.createCheckoutSession({ plan: 'student' }, ctx('U2'))).rejects.toMatchObject({ code: 'already-exists' });
    expect(calls.length).toBe(0);
  });
  it('in trial si può comprare (il trial non è un abbonamento)', async () => {
    f.rows.set('users/U3', { plan: 'free', trialPlan: 'student', trialExpiresAt: Date.now() + DAY });
    await expect(fns.createCheckoutSession({ plan: 'student' }, ctx('U3'))).resolves.toMatchObject({ url: expect.any(String) });
  });
  it('Gestisci abbonamento: Play → pagina abbonamenti di Google Play; Stripe → portale', async () => {
    f.rows.set('users/P', { plan: 'student', planSource: 'google_play', planExpiresAt: Timestamp.fromMillis(Date.now() + DAY), googlePlaySubscription: { sku: 'cortex_student_monthly' } });
    expect(await fns.createPortalSession({}, ctx('P'))).toEqual({ provider: 'google_play', url: 'https://play.google.com/store/account/subscriptions?sku=cortex_student_monthly&package=app.web.cortex_app.twa' });
    f.rows.set('users/S', { plan: 'student', planSource: 'stripe', stripeCustomerId: 'cus_S' });
    expect(await fns.createPortalSession({}, ctx('S'))).toEqual({ provider: 'stripe', url: 'https://billing.stripe.test/p' });
  });
  it('il vecchio link al portale Stripe di TEST non c\'è più', () => {
    const gdpr = fs.readFileSync(new URL('../modules/gdpr.js', import.meta.url), 'utf8');
    expect(gdpr).not.toMatch(/billing\.stripe\.com\/p\/login\/test_/);
    expect(gdpr).toContain('window.manageSubscription()');
  });
});
