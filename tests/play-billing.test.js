// Audit 2026-10 — Fase 1.1: verifica Google Play su subscriptionsv2, acknowledgement
// recuperabile, ricevute esclusive, Sparks separati e scadenza nei gate.
// Esegue il codice REALE di functions/index.js (sezione Play) con Play API e
// Firestore simulati: nessuna rete, nessun servizio reale.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const security = require('../functions/security.js');
const entitlements = require('../functions/entitlements.js');
const { createFakeFirestore, Timestamp } = require('./helpers/fakeFirestore.cjs');

class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const NOW = Date.parse('2026-10-03T12:00:00Z');
const DAY = 86400e3;
const SUB = 'cortex_student_monthly';
const subV2 = (over = {}) => ({
  kind: 'androidpublisher#subscriptionPurchaseV2',
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  lineItems: [{ productId: SUB, expiryTime: new Date(NOW + 30 * DAY).toISOString(), latestSuccessfulOrderId: 'GPA.1', autoRenewingPlan: { autoRenewEnabled: true } }],
  ...over,
});

function loadPlaySection({ db, admin, api }) {
  const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const start = src.indexOf('// ── Google Play Developer API');
  const end = src.indexOf('/**\n * deleteUserAccount');
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const exports = {};
  vm.runInNewContext(src.slice(start, end), {
    exports, db, admin, security, entitlements, console: { error() {}, warn() {}, log() {} },
    process: { env: { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '{}' } },
    functions: { https: { onCall: fn => fn, HttpsError } },
    getGoogle: () => ({ auth: { GoogleAuth: class {} }, androidpublisher: () => api }),
    Date, JSON, Object, Number, Math, String, Promise, Error,
  });
  return exports;
}

function fakePlayApi() {
  const calls = { subGet: 0, subAck: 0, prodGet: 0, prodAck: 0, legacyGet: 0 };
  const state = { sub: subV2(), prod: { purchaseState: 0, acknowledgementState: 0, orderId: 'GPA.S1' }, ackFails: 0 };
  const api = {
    purchases: {
      // La 182.0.0 NON espone subscriptions.get: lo simuliamo identico (undefined).
      subscriptions: {
        acknowledge: async () => { calls.subAck++; if (state.ackFails-- > 0) throw Object.assign(new Error('ack'), { code: 503 }); state.sub = { ...state.sub, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }; },
      },
      subscriptionsv2: { get: async () => { calls.subGet++; return { data: state.sub }; } },
      products: {
        get: async () => { calls.prodGet++; return { data: state.prod }; },
        acknowledge: async () => { calls.prodAck++; if (state.ackFails-- > 0) throw Object.assign(new Error('ack'), { code: 503 }); state.prod = { ...state.prod, acknowledgementState: 1 }; },
      },
    },
  };
  return { api, calls, state };
}

describe('normalizzazione subscriptionsv2', () => {
  it('ACTIVE con scadenza futura dà diritto; usa lineItems e non i campi legacy', () => {
    const n = security.normalizePlaySubscription(subV2(), SUB, NOW);
    expect(n).toMatchObject({ entitled: true, productMatches: true, acknowledged: false, orderId: 'GPA.1', autoRenewing: true });
    expect(n.expiryMs).toBe(NOW + 30 * DAY);
  });
  it('rifiuta stati senza diritto, prodotto diverso e scadenza passata', () => {
    for (const s of ['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'SUBSCRIPTION_STATE_UNSPECIFIED'])
      expect(security.normalizePlaySubscription(subV2({ subscriptionState: s }), SUB, NOW).entitled).toBe(false);
    expect(security.normalizePlaySubscription(subV2(), 'cortex_pro_monthly', NOW).entitled).toBe(false);
    const past = subV2({ lineItems: [{ productId: SUB, expiryTime: new Date(NOW - 1000).toISOString() }] });
    expect(security.normalizePlaySubscription(past, SUB, NOW).entitled).toBe(false);
    // I campi legacy v1 non devono bastare a concedere il piano.
    expect(security.normalizePlaySubscription({ paymentState: 1, expiryTimeMillis: String(NOW + DAY) }, SUB, NOW).entitled).toBe(false);
  });
  it('CANCELED resta valido fino alla scadenza; grace period concede una finestra breve', () => {
    expect(security.normalizePlaySubscription(subV2({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }), SUB, NOW).entitled).toBe(true);
    const grace = security.normalizePlaySubscription(subV2({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', lineItems: [{ productId: SUB, expiryTime: new Date(NOW - 1000).toISOString() }] }), SUB, NOW);
    expect(grace.entitled).toBe(true); expect(grace.expiryMs).toBe(NOW + 6 * 3600e3);
  });
  it('acknowledgement letto dall\'enum v2, non da un booleano', () => {
    expect(security.normalizePlaySubscription(subV2({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }), SUB, NOW).acknowledged).toBe(true);
    expect(security.normalizePlaySubscription(subV2({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' }), SUB, NOW).acknowledged).toBe(false);
  });
});

describe('verifyGooglePlayPurchase (codice reale, Play simulato)', () => {
  let fs_, play, fns;
  beforeEach(() => { fs_ = createFakeFirestore({ now: () => NOW }); play = fakePlayApi(); fns = loadPlaySection({ db: fs_.db, admin: fs_.admin, api: play.api }); });
  const ctx = uid => ({ auth: { uid } });

  it('abbonamento attivo: legge v2, attiva il piano con scadenza e conferma una volta', async () => {
    const r = await fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-1', sku: SUB }, ctx('A'));
    expect(r).toMatchObject({ success: true, plan: 'student', acknowledged: true });
    expect(play.calls).toMatchObject({ subGet: 1, subAck: 1 });
    const u = fs_.rows.get('users/A');
    expect(u).toMatchObject({ plan: 'student', planSource: 'google_play' });
    expect(u.planExpiresAt.toMillis()).toBe(NOW + 30 * DAY);
    expect(fs_.rows.get('_purchaseReceipts/' + security.hash('tok-1'))).toMatchObject({ uid: 'A', sku: SUB, ackState: 'acknowledged' });
  });

  it('conferma fallita: piano attribuito, ricevuta "pending", retry conferma senza duplicare', async () => {
    play.state.ackFails = 1;
    const first = await fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-2', sku: SUB }, ctx('A'));
    expect(first).toMatchObject({ success: true, acknowledged: false });
    expect(fs_.rows.get('_purchaseReceipts/' + security.hash('tok-2')).ackState).toBe('pending');
    const second = await fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-2', sku: SUB }, ctx('A'));
    expect(second).toMatchObject({ success: true, acknowledged: true });
    expect(fs_.rows.get('_purchaseReceipts/' + security.hash('tok-2')).ackState).toBe('acknowledged');
    expect(play.calls.subAck).toBe(2);
  });

  it('abbonamento scaduto o in attesa: nessun piano, nessuna conferma', async () => {
    play.state.sub = subV2({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' });
    await expect(fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-3', sku: SUB }, ctx('A'))).rejects.toMatchObject({ code: 'failed-precondition' });
    play.state.sub = subV2({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' });
    await expect(fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-3', sku: SUB }, ctx('A'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(play.calls.subAck).toBe(0); expect(fs_.rows.has('users/A')).toBe(false);
  });

  it('ricevuta già associata a un altro account: rifiutata', async () => {
    await fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-4', sku: SUB }, ctx('A'));
    await expect(fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-4', sku: SUB }, ctx('B'))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fs_.rows.has('users/B')).toBe(false);
  });

  it('SKU sconosciuto o token non valido: rifiutati prima di chiamare Play', async () => {
    await expect(fns.verifyGooglePlayPurchase({ purchaseToken: 'x', sku: 'cortex_free_lifetime' }, ctx('A'))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(fns.verifyGooglePlayPurchase({ purchaseToken: '', sku: SUB }, ctx('A'))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(play.calls.subGet + play.calls.prodGet).toBe(0);
  });

  it('errore Play: "unavailable" (ripetibile), nessuna scrittura', async () => {
    play.api.purchases.subscriptionsv2.get = async () => { throw Object.assign(new Error('boom'), { code: 500 }); };
    await expect(fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-5', sku: SUB }, ctx('A'))).rejects.toMatchObject({ code: 'unavailable' });
    expect(fs_.rows.size).toBe(0);
  });

  describe('Sparks (prodotti una tantum) verificati separatamente', () => {
    it('accredita una sola volta anche con retry e conferma fallita', async () => {
      play.state.ackFails = 1;
      const a = await fns.verifyGooglePlayPurchase({ purchaseToken: 'sp-1', sku: 'cortex_sparks_50' }, ctx('A'));
      expect(a).toMatchObject({ success: true, sparks: 50, acknowledged: false });
      const b = await fns.verifyGooglePlayPurchase({ purchaseToken: 'sp-1', sku: 'cortex_sparks_50' }, ctx('A'));
      expect(b).toMatchObject({ success: true, alreadyProcessed: true, acknowledged: true });
      expect(fs_.rows.get('users/A').sparksBalance).toBe(50);
      expect(play.calls).toMatchObject({ prodGet: 2, prodAck: 2, subGet: 0 });
    });
    it('acquisto in attesa/annullato non accredita', async () => {
      for (const purchaseState of [1, 2]) {
        play.state.prod = { purchaseState, acknowledgementState: 0 };
        await expect(fns.verifyGooglePlayPurchase({ purchaseToken: 'sp-' + purchaseState, sku: 'cortex_sparks_150' }, ctx('A'))).rejects.toMatchObject({ code: 'failed-precondition' });
      }
      expect(fs_.rows.has('users/A')).toBe(false);
    });
    it('un acquisto Sparks non cambia l\'origine di un abbonamento Stripe', async () => {
      fs_.rows.set('users/A', { plan: 'pro', planSource: 'stripe' });
      await fns.verifyGooglePlayPurchase({ purchaseToken: 'sp-9', sku: 'cortex_sparks_500' }, ctx('A'));
      expect(fs_.rows.get('users/A')).toMatchObject({ plan: 'pro', planSource: 'stripe', sparksBalance: 500 });
      expect(entitlements.effectivePlan(fs_.rows.get('users/A'), NOW).plan).toBe('pro');
    });
    it('ricevuta Sparks di un altro account: rifiutata', async () => {
      await fns.verifyGooglePlayPurchase({ purchaseToken: 'sp-x', sku: 'cortex_sparks_50' }, ctx('A'));
      await expect(fns.verifyGooglePlayPurchase({ purchaseToken: 'sp-x', sku: 'cortex_sparks_50' }, ctx('B'))).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });

  it('getEntitlements: piano Play scaduto ma rinnovato su Play viene aggiornato', async () => {
    await fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-r', sku: SUB }, ctx('A'));
    const u = fs_.rows.get('users/A');
    fs_.rows.set('users/A', { ...u, planExpiresAt: Timestamp.fromMillis(NOW - 1000) }); // scadenza salvata vecchia
    play.state.sub = subV2({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', lineItems: [{ productId: SUB, expiryTime: new Date(NOW + 60 * DAY).toISOString() }] });
    const e = await fns.getEntitlements({}, ctx('A'));
    expect(e).toMatchObject({ plan: 'student', paidExpired: false });
    expect(fs_.rows.get('users/A').planExpiresAt.toMillis()).toBe(NOW + 60 * DAY);
  });
  it('getEntitlements: scaduto anche su Play → free, senza cancellare dati', async () => {
    await fns.verifyGooglePlayPurchase({ purchaseToken: 'tok-e', sku: SUB }, ctx('A'));
    fs_.rows.set('users/A', { ...fs_.rows.get('users/A'), planExpiresAt: Timestamp.fromMillis(NOW - 1000) });
    play.state.sub = subV2({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' });
    const e = await fns.getEntitlements({}, ctx('A'));
    expect(e).toMatchObject({ plan: 'free', paidExpired: true });
    expect(fs_.rows.get('users/A').plan).toBe('student'); // il dato storico resta; decide effectivePlan
  });
});

describe('effectivePlan nei gate', () => {
  const ts = ms => Timestamp.fromMillis(ms);
  it('Play scaduto → free; Play valido → piano; Stripe senza scadenza → piano', () => {
    expect(entitlements.effectivePlan({ plan: 'student', planSource: 'google_play', planExpiresAt: ts(NOW - 1) }, NOW)).toMatchObject({ plan: 'free', paidExpired: true });
    expect(entitlements.effectivePlan({ plan: 'pro', planSource: 'google_play', planExpiresAt: ts(NOW + DAY) }, NOW).plan).toBe('pro');
    expect(entitlements.effectivePlan({ plan: 'pro', planSource: 'stripe', planExpiresAt: ts(NOW - DAY) }, NOW).plan).toBe('pro');
    expect(entitlements.effectivePlan({ plan: 'student' }, NOW).plan).toBe('student');
  });
  it('trial valido dopo un piano Play scaduto; valori sconosciuti → free', () => {
    expect(entitlements.effectivePlan({ plan: 'student', planSource: 'google_play', planExpiresAt: ts(NOW - 1), trialPlan: 'student', trialExpiresAt: NOW + DAY }, NOW)).toMatchObject({ plan: 'student', trial: true });
    expect(entitlements.effectivePlan({ plan: 'free', trialPlan: 'admin', trialExpiresAt: NOW + DAY }, NOW).plan).toBe('free');
    expect(entitlements.effectivePlan({ plan: 'ultra' }, NOW).plan).toBe('free');
    expect(entitlements.effectivePlan(null, NOW).plan).toBe('free');
  });
  it('i tre gate server usano effectivePlan (nessun calcolo del piano duplicato)', () => {
    const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    for (const fn of ['async function requireDuelPlan', 'exports.textToSpeechHttp']) {
      const body = src.slice(src.indexOf(fn), src.indexOf(fn) + 4000);
      expect(body).toContain('entitlements.effectivePlan(');
      expect(body).not.toMatch(/let plan = user(Data)?\.plan/);
    }
    // Gemini: il piano passa da aiQuota.charge → aiQuota.classify → entitlements.effectivePlan
    const gem = src.slice(src.indexOf('exports.callGeminiHttp'), src.indexOf('exports.callGeminiHttp') + 6000);
    expect(gem).toContain('aiQuota.charge(');
    expect(gem).not.toMatch(/let plan = user(Data)?\.plan/);
    expect(fs.readFileSync(new URL('../functions/aiQuota.js', import.meta.url), 'utf8')).toContain('entitlements.effectivePlan(');
  });
});

describe('compatibilità libreria Google Play', () => {
  it('il backend non chiama più purchases.subscriptions.get (assente in googleapis 182)', () => {
    const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/purchases\.subscriptions\.get\s*\(/);
    expect(src).not.toMatch(/endpoint\.get\(/);
    expect(src).toContain('purchases.subscriptionsv2.get(');
  });
  const lock = JSON.parse(fs.readFileSync(new URL('../functions/package-lock.json', import.meta.url), 'utf8'));
  const installed = fs.existsSync(new URL('../functions/node_modules/googleapis/package.json', import.meta.url));
  it('lockfile fissa googleapis alla versione verificata', () => {
    expect(lock.packages['node_modules/googleapis'].version).toBe('182.0.0');
  });
  it.skipIf(!installed)('la libreria installata espone i metodi usati (installazione da lockfile)', () => {
    const { google } = require('../functions/node_modules/googleapis');
    const a = google.androidpublisher({ version: 'v3' });
    expect(typeof a.purchases.subscriptionsv2.get).toBe('function');
    expect(typeof a.purchases.subscriptions.acknowledge).toBe('function');
    expect(typeof a.purchases.products.get).toBe('function');
    expect(typeof a.purchases.products.acknowledge).toBe('function');
    expect(a.purchases.subscriptions.get).toBeUndefined(); // motivo della migrazione
  }, 120_000); // il primo caricamento di googleapis su Windows può superare 20 s
});
