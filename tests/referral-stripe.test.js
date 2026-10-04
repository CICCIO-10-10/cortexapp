// Audit 2026-10 — Fase 1.3: referral solo lato server + filtro checkout Stripe.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { claimReferral, MONTHLY_REWARD_CAP } = require('../functions/referral.js');
const { subscriptionCheckoutGrant } = require('../functions/stripeBilling.js');
const stripeBilling = require('../functions/stripeBilling.js');
const { createFakeFirestore } = require('./helpers/fakeFirestore.cjs');

const NOW = Date.parse('2026-10-03T12:00:00Z');
const DAY = 86400e3;
const REFERRER = 'REFabcde12345xyz';
const CODE = REFERRER.slice(0, 8);
const google = { firebase: { sign_in_provider: 'google.com' }, email_verified: true };

describe('claimReferral', () => {
  let f;
  const claim = (uid, over = {}) => claimReferral({ uid, code: CODE, token: google, authCreatedMs: NOW - 3600e3, deps: { db: f.db, admin: f.admin, now: () => NOW }, ...over });
  beforeEach(() => { f = createFakeFirestore({ now: () => NOW }); f.rows.set('users/' + REFERRER, { plan: 'free' }); });

  it('premia una volta invitato e chi invita (7 giorni Student)', async () => {
    const r = await claim('newUser1');
    expect(r).toMatchObject({ status: 'rewarded', referrerRewarded: true });
    expect(f.rows.get('users/newUser1')).toMatchObject({ trialPlan: 'student', trialExpiresAt: NOW + 7 * DAY, referralProcessed: true });
    expect(f.rows.get('users/' + REFERRER)).toMatchObject({ trialPlan: 'student', trialExpiresAt: NOW + 7 * DAY, referralCount: 1, referralDaysEarned: 7 });
    expect(f.rows.get('_referralClaims/newUser1')).toMatchObject({ referrerUid: REFERRER, code: CODE });
  });

  it('ripetizioni e retry non danno altri giorni', async () => {
    await claim('newUser1');
    expect(await claim('newUser1')).toEqual({ status: 'already_claimed' });
    expect(await claim('newUser1')).toEqual({ status: 'already_claimed' });
    expect(f.rows.get('users/' + REFERRER)).toMatchObject({ referralCount: 1, referralDaysEarned: 7, trialExpiresAt: NOW + 7 * DAY });
  });

  it('richieste concorrenti: un solo premio', async () => {
    const out = await Promise.allSettled([claim('newUser2'), claim('newUser2')]);
    expect(out.filter(o => o.status === 'fulfilled' && o.value.status === 'rewarded').length).toBe(1);
    expect(f.rows.get('users/' + REFERRER).referralCount).toBe(1);
  });

  it('il campo refCode scritto dal client non conta: si usa il prefisso dell\'uid', async () => {
    f.rows.set('users/ATTACKER9999', { refCode: CODE }); // tenta di "rubare" il codice
    await claim('newUser3');
    expect(f.rows.get('_referralClaims/newUser3').referrerUid).toBe(REFERRER);
    expect(f.rows.get('users/ATTACKER9999').referralCount).toBeUndefined();
  });

  it('rifiuta: codice non valido/sconosciuto/ambiguo, auto-invito, reciproco, anonimo, email non verificata, account non nuovo, account in cancellazione', async () => {
    await expect(claim('u1', { code: 'bad code' })).rejects.toMatchObject({ reason: 'invalid_code' });
    await expect(claim('u1', { code: 'ZZZZZZZZ' })).rejects.toMatchObject({ reason: 'unknown_code' });
    f.rows.set('users/' + CODE + 'other', {});
    await expect(claim('u1')).rejects.toMatchObject({ reason: 'ambiguous_code' });
    f.rows.delete('users/' + CODE + 'other');
    await expect(claim(REFERRER)).rejects.toMatchObject({ reason: 'self_referral' });
    await expect(claim('u1', { token: { firebase: { sign_in_provider: 'anonymous' } } })).rejects.toMatchObject({ reason: 'anonymous' });
    await expect(claim('u1', { token: { firebase: { sign_in_provider: 'password' }, email_verified: false } })).rejects.toMatchObject({ reason: 'email_not_verified' });
    await expect(claim('u1', { authCreatedMs: NOW - 4 * DAY })).rejects.toMatchObject({ reason: 'not_new_account' });
    await expect(claim('u1', { authCreatedMs: NaN })).rejects.toMatchObject({ reason: 'not_new_account' });
    f.rows.set('_deletionLocks/' + REFERRER, {});
    await expect(claim('u1')).rejects.toMatchObject({ reason: 'account_deleting' });
    f.rows.delete('_deletionLocks/' + REFERRER);
    // reciproco: REFERRER aveva usato il codice di u1abcdefX
    const B = 'Bbbbbbbb0001';
    f.rows.set('users/' + B, {});
    f.rows.set('_referralClaims/' + REFERRER, { referrerUid: B });
    await expect(claimReferral({ uid: B, code: CODE, token: google, authCreatedMs: NOW, deps: { db: f.db, admin: f.admin, now: () => NOW } })).rejects.toMatchObject({ reason: 'mutual_referral' });
    expect(f.rows.get('users/' + REFERRER).referralCount).toBeUndefined();
  });

  it('limite mensile: oltre il tetto premia solo l\'invitato', async () => {
    for (let i = 0; i < MONTHLY_REWARD_CAP; i++) await claim('cap' + i);
    const extra = await claim('capExtra');
    expect(extra).toMatchObject({ status: 'rewarded', referrerRewarded: false });
    expect(f.rows.get('users/' + REFERRER).referralCount).toBe(MONTHLY_REWARD_CAP);
    expect(f.rows.get('users/capExtra').trialPlan).toBe('student');
  });

  it('il vecchio trigger è disattivato e il client non scrive più l\'attribuzione', () => {
    const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    expect(src).toMatch(/exports\.processReferral = functions\.firestore\s*\.document\('users\/\{uid\}'\)\s*\.onWrite\(async \(\) => null\);/);
    const boot = fs.readFileSync(new URL('../core/appBoot.js', import.meta.url), 'utf8');
    expect(boot).not.toMatch(/referredBy:\s*pendingRef/);
    expect(boot).toContain("httpsCallable('claimReferral')");
    const fb = fs.readFileSync(new URL('../services/firebase.js', import.meta.url), 'utf8');
    expect(fb).not.toMatch(/_init\.referredBy\s*=/);
    expect(fb).not.toMatch(/refCode:\s*uid\.slice\(0, 8\)/);
  });
});

describe('Stripe: solo checkout di abbonamento validi concedono un piano', () => {
  const sub = (over = {}) => ({ id: 'cs_1', mode: 'subscription', status: 'complete', payment_status: 'paid', customer: 'cus_1', subscription: 'sub_1', metadata: { uid: 'U1', plan: 'student_yearly' }, ...over });
  it('matrice di casi', () => {
    expect(subscriptionCheckoutGrant(sub())).toEqual({ grant: true, uid: 'U1', plan: 'student', cycle: 'yearly', customerId: 'cus_1', subscriptionId: 'sub_1' });
    expect(subscriptionCheckoutGrant(sub({ metadata: { uid: 'U1', plan: 'pro' } }))).toMatchObject({ grant: true, plan: 'pro', cycle: 'monthly' });
    const cases = {
      not_subscription_mode: sub({ mode: 'payment', metadata: { uid: 'U1', sparks: '50', type: 'sparks' } }),
      sparks_checkout: sub({ metadata: { uid: 'U1', plan: 'student', type: 'sparks' } }),
      not_complete: sub({ status: 'open' }),
      not_paid: sub({ payment_status: 'unpaid' }),
      invalid_uid: sub({ metadata: { uid: '../users/admin', plan: 'pro' } }),
      invalid_plan: sub({ metadata: { uid: 'U1', plan: 'enterprise' } }),
      missing_customer: sub({ customer: null }),
      missing_subscription: sub({ subscription: null }),
    };
    for (const [reason, s] of Object.entries(cases)) expect(subscriptionCheckoutGrant(s), reason).toEqual({ grant: false, reason });
    expect(subscriptionCheckoutGrant(sub({ metadata: { uid: 'U1', plan: '__proto__' } }))).toEqual({ grant: false, reason: 'invalid_plan' });
    expect(subscriptionCheckoutGrant(null)).toEqual({ grant: false, reason: 'not_subscription_mode' });
  });

  function loadWebhook(f, event) {
    const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    const start = src.indexOf('exports.stripeWebhook =');
    const end = src.indexOf('// ─── Phase 13');
    const exports = {};
    // Fase 4: il webhook rilegge l'abbonamento da Stripe (simulato qui) tramite functions/billing.js.
    const stripeSub = { id: 'sub_1', status: 'active', customer: 'cus_1', created: 1, metadata: {}, items: { data: [{ price: { id: 'price_y' }, current_period_end: 2e9 }] } };
    vm.runInNewContext(src.slice(start, end), {
      exports, db: f.db, admin: f.admin, stripeBilling, billing: require('../functions/billing.js'), console: { log() {}, error() {} },
      functions: { https: { onRequest: fn => fn } }, getClientIp: () => '1.1.1.1', ipRateLimit: () => true,
      getStripe: () => ({ webhooks: { constructEvent: () => ({ id: 'evt_1', ...event }) }, subscriptions: { retrieve: async () => stripeSub }, customers: { retrieve: async () => ({}) } }),
      process: { env: { STRIPE_WEBHOOK_SECRET: 'x', STRIPE_PRICE_STUDENT_YEARLY: 'price_y' } },
    });
    return exports.stripeWebhook;
  }
  const res = () => ({ code: 200, status(c) { this.code = c; return this; }, send() { return this; }, json() { return this; } });

  it('webhook: un checkout Sparks non attiva Student (codice reale)', async () => {
    const f = createFakeFirestore({ now: () => NOW });
    const hook = loadWebhook(f, { type: 'checkout.session.completed', data: { object: { id: 'cs_s', mode: 'payment', payment_status: 'paid', customer: null, metadata: { uid: 'U1', sparks: '50', type: 'sparks' } } } });
    await hook({ headers: {}, rawBody: '' }, res());
    expect(f.rows.has('users/U1')).toBe(false);
    expect([...f.rows.keys()].some(k => k.startsWith('stripeCustomers/'))).toBe(false);
  });
  it('webhook: abbonamento valido attiva il piano con origine Stripe e id abbonamento', async () => {
    const f = createFakeFirestore({ now: () => NOW });
    f.rows.set('users/U1', { plan: 'free' });   // creato da createCheckoutSession prima del pagamento
    const hook = loadWebhook(f, { type: 'checkout.session.completed', data: { object: sub() } });
    await hook({ headers: {}, rawBody: '' }, res());
    expect(f.rows.get('users/U1')).toMatchObject({ plan: 'student', planSource: 'stripe', planCycle: 'yearly', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    expect(f.rows.get('stripeCustomers/cus_1')).toEqual({ uid: 'U1' });
  });
});
