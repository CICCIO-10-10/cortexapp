// Audit 2026-10 — Fase 1.2: contenimento F01 (cancellazione account).
// Server: functions/accountDeletion.js con Firestore/Stripe/Play simulati.
// Client: modules/gdpr.js eseguito in vm — il browser non cancella più nulla da solo.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { runAccountDeletion, PENDING_SCOPE } = require('../functions/accountDeletion.js');
const security = require('../functions/security.js');
const entitlements = require('../functions/entitlements.js');
const { createFakeFirestore } = require('./helpers/fakeFirestore.cjs');

const NOW = Date.parse('2026-10-03T12:00:00Z');
const recent = Math.floor(NOW / 1000) - 60;

function setup({ stripeSubs = [], stripeFails = false, play = null, playFails = false } = {}) {
  const f = createFakeFirestore({ now: () => NOW });
  const authCalls = [];
  f.admin.auth = () => ({
    revokeRefreshTokens: async uid => authCalls.push(['revoke', uid]),
    updateUser: async (uid, d) => authCalls.push(['update', uid, d]),
    deleteUser: async uid => authCalls.push(['delete', uid]),
  });
  const subs = stripeSubs.map(s => ({ ...s }));
  const stripeCalls = { list: 0, cancel: [] };
  const stripe = {
    subscriptions: {
      list: () => { stripeCalls.list++; if (stripeFails) throw new Error('stripe down'); return (async function* () { for (const s of subs) yield s; })(); },
      cancel: async id => { stripeCalls.cancel.push(id); subs.find(s => s.id === id).status = 'canceled'; },
    },
  };
  const deps = {
    db: f.db, admin: f.admin, security, entitlements, now: () => NOW,
    getStripe: () => stripe,
    readPlaySubscription: async () => { if (playFails) throw new Error('play down'); return play; },
  };
  const seedUser = (extra = {}) => {
    f.rows.set('users/U', { plan: 'student', email: 'u@example.com', ...extra });
    f.rows.set('users/U/decks/d1', { name: 'Mazzo' });
    f.rows.set('users/U/memory/m1', { x: 1 });
    f.rows.set('users/U/coachReports/w1', { x: 1 });
    f.rows.set('usage/U', { x: 1 });
    f.rows.set('usage/U/daily/2026-10-03', { calls: 3 });
    f.rows.set('profiles/U', { uid: 'U', isPublic: true });
    f.rows.set('userProfiles/ciccio', { uid: 'U', xp: 10 });
    f.rows.set('publicDecks/p1', { ownerId: 'U', name: 'Pubblico' });
    f.rows.set('publicDecks/p2', { ownerId: 'OTHER', name: 'Altro' });
    f.rows.set('users/OTHER', { plan: 'free' });
  };
  return { f, deps, authCalls, stripeCalls, subs, seedUser };
}
const run = (deps, authTime = recent) => runAccountDeletion({ uid: 'U', authTime, deps });

describe('deleteUserAccount — contenimento F01', () => {
  it('richiede un accesso recente e in quel caso non tocca nulla', async () => {
    const t = setup(); t.seedUser();
    await expect(run(t.deps, recent - 3600)).rejects.toMatchObject({ code: 'failed-precondition', reason: 'requires_recent_login' });
    await expect(run(t.deps, NaN)).rejects.toMatchObject({ reason: 'requires_recent_login' });
    expect(t.f.rows.has('users/U')).toBe(true); expect(t.f.rows.has('_accountDeletions/U')).toBe(false); expect(t.authCalls).toEqual([]);
  });

  it('Stripe attivo: riferimenti salvati prima, abbonamento annullato davvero, dati principali eliminati, accesso disattivato', async () => {
    const t = setup({ stripeSubs: [{ id: 'sub_1', status: 'active' }, { id: 'sub_old', status: 'canceled' }] });
    t.seedUser({ stripeCustomerId: 'cus_1' }); t.f.rows.set('stripeCustomers/cus_1', { uid: 'U' });
    const r = await run(t.deps);
    expect(r).toMatchObject({ status: 'core_deleted', subscription: { stripe: 'canceled', stripeCanceledCount: 1, play: 'none' } });
    expect(r.pending).toEqual([...PENDING_SCOPE]);
    expect(t.stripeCalls.cancel).toEqual(['sub_1']);
    for (const p of ['users/U', 'users/U/decks/d1', 'users/U/memory/m1', 'users/U/coachReports/w1', 'usage/U', 'usage/U/daily/2026-10-03', 'profiles/U', 'userProfiles/ciccio', 'publicDecks/p1', 'stripeCustomers/cus_1'])
      expect(t.f.rows.has(p), p).toBe(false);
    expect(t.f.rows.has('publicDecks/p2')).toBe(true); expect(t.f.rows.has('users/OTHER')).toBe(true);
    const rec = t.f.rows.get('_accountDeletions/U');
    expect(rec).toMatchObject({ status: 'core_deleted', stripeCustomerId: 'cus_1', canceledStripeSubscriptions: ['sub_1'] });
    expect(t.f.rows.has('_deletionLocks/U')).toBe(true);
    expect(t.authCalls).toEqual([['revoke', 'U'], ['update', 'U', { disabled: true }]]); // disabilitato, NON eliminato
  });

  it('se Stripe non risponde: nessun dato eliminato, esito "riprova", riferimenti conservati', async () => {
    const t = setup({ stripeFails: true }); t.seedUser({ stripeCustomerId: 'cus_1' });
    await expect(run(t.deps)).rejects.toMatchObject({ code: 'unavailable', reason: 'stripe_cancel_failed' });
    expect(t.f.rows.has('users/U')).toBe(true); expect(t.f.rows.has('users/U/decks/d1')).toBe(true);
    expect(t.f.rows.get('_accountDeletions/U')).toMatchObject({ status: 'blocked', stripeCustomerId: 'cus_1' });
    expect(t.f.rows.has('_deletionLocks/U')).toBe(false); expect(t.authCalls).toEqual([]);
  });

  it('Google Play con rinnovo attivo: blocca e chiede di annullare dal Play Store, senza cancellare', async () => {
    const t = setup({ play: { entitled: true, autoRenewing: true } });
    t.seedUser({ planSource: 'google_play', googlePlaySubscription: { sku: 'cortex_student_monthly', purchaseToken: 'tok' } });
    await expect(run(t.deps)).rejects.toMatchObject({ code: 'failed-precondition', reason: 'play_subscription_active' });
    expect(t.f.rows.has('users/U')).toBe(true); expect(t.f.rows.has('_deletionLocks/U')).toBe(false);
  });

  it('Google Play non verificabile: nessuna cancellazione', async () => {
    const t = setup({ playFails: true });
    t.seedUser({ googlePlaySubscription: { sku: 'cortex_student_monthly', purchaseToken: 'tok' } });
    await expect(run(t.deps)).rejects.toMatchObject({ code: 'unavailable', reason: 'play_unverifiable' });
    expect(t.f.rows.has('users/U')).toBe(true);
  });

  it('Google Play già senza rinnovo: procede e lo dichiara', async () => {
    const t = setup({ play: { entitled: true, autoRenewing: false } });
    t.seedUser({ googlePlaySubscription: { sku: 'cortex_student_monthly', purchaseToken: 'tok' } });
    const r = await run(t.deps);
    expect(r.subscription.play).toBe('not_renewing');
    expect(t.f.rows.get('_accountDeletions/U').playSubscription).toEqual({ sku: 'cortex_student_monthly', token: 'tok' });
  });

  it('errore a metà: esito "parziale" registrato; il retry riprende senza annullare due volte Stripe', async () => {
    const t = setup({ stripeSubs: [{ id: 'sub_1', status: 'active' }] });
    t.seedUser({ stripeCustomerId: 'cus_1' });
    t.f.db.failNextRecursiveDelete = true;
    await expect(run(t.deps)).rejects.toMatchObject({ code: 'internal', reason: 'partial' });
    expect(t.f.rows.get('_accountDeletions/U')).toMatchObject({ status: 'failed', stripeCustomerId: 'cus_1' });
    // il documento utente esiste ancora: il retry ritrova i riferimenti anche dal registro
    const r = await run(t.deps);
    expect(r.status).toBe('core_deleted');
    expect(t.stripeCalls.cancel).toEqual(['sub_1']);
    expect(t.f.rows.has('users/U')).toBe(false);
  });

  it('richiesta ripetuta dopo il completamento: stesso esito, nessuna nuova azione', async () => {
    const t = setup({ stripeSubs: [{ id: 'sub_1', status: 'active' }] }); t.seedUser({ stripeCustomerId: 'cus_1' });
    await run(t.deps);
    const again = await run(t.deps);
    expect(again).toMatchObject({ status: 'core_deleted', alreadyProcessed: true });
    expect(t.stripeCalls.list).toBe(1);
  });

  it('ricevute Play/Sparks conservate per l\'anti-riuso dopo la cancellazione', async () => {
    const t = setup(); t.seedUser({ googlePlayPurchases: [{ sku: 'cortex_sparks_50', purchaseToken: 'sp-tok' }] });
    await run(t.deps);
    expect(t.f.rows.get('_purchaseReceipts/' + security.hash('sp-tok'))).toMatchObject({ uid: 'U', migrated: true });
  });
});

describe('client: un solo percorso, nessuna cancellazione dal browser', () => {
  const src = fs.readFileSync(new URL('../modules/gdpr.js', import.meta.url), 'utf8');
  it('il codice del browser non elimina documenti né l\'identità', () => {
    expect(src).not.toMatch(/user\.delete\(\)/);
    expect(src).not.toMatch(/collection\('users'\)\.doc\([^)]*\)\.delete\(/);
    expect(src).not.toMatch(/collection\('usage'\)\.doc\([^)]*\)\.delete\(/);
    expect(src).toContain("httpsCallable('deleteUserAccount')");
    const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    expect(main).not.toMatch(/abbonamento verrà annullato/i);
    expect(main).toContain('window._deleteAccount = () => openDeleteAccountModal();');
  });

  function runConfirm({ callResult, callError }) {
    const start = src.indexOf('/** Cancella i dati locali di Cortex');
    const end = src.indexOf('// ─── Data Export (GDPR Art. 20)');
    const body = src.slice(start, end).replace(/\bexport /g, '');
    const ls = new Map([['cortex_user_v1', 'dati']]); let signedOut = false, authDeleted = false; const dbDeletes = [];
    const statusEl = { style: {}, innerHTML: '' }; const btn = { style: {}, textContent: '', disabled: false };
    const ctx = {
      window: {
        firebase: {
          auth: () => ({ currentUser: { uid: 'U', isAnonymous: false, delete: async () => { authDeleted = true; } }, signOut: async () => { signedOut = true; } }),
          functions: () => ({ httpsCallable: () => async () => { if (callError) throw callError; return { data: callResult }; } }),
          firestore: () => ({ collection: () => ({ doc: () => ({ delete: async () => dbDeletes.push(1) }) }) }),
        },
        showToast() {}, location: {},
      },
      document: { getElementById: id => (id === 'delete-confirm-input' ? { value: 'ELIMINA' } : id === 'gdpr-delete-status' ? statusEl : id === 'delete-confirm-btn' ? btn : null) },
      localStorage: { clear: () => ls.clear() }, sessionStorage: { clear() {} },
      indexedDB: { deleteDatabase: () => { const r = {}; setTimeout(() => r.onsuccess && r.onsuccess(), 0); return r; } },
      _t: () => ({}), t: k => k, setTimeout, Promise, String, Array, console: { error() {}, warn() {} },
    };
    vm.runInNewContext(body, ctx);
    return { run: () => ctx.window.__gdprConfirmDelete(), ls, statusEl, btn, get signedOut() { return signedOut; }, get authDeleted() { return authDeleted; }, dbDeletes };
  }

  it('errore del server: nessuna pulizia locale, nessuna eliminazione dell\'identità, messaggio reale', async () => {
    const h = runConfirm({ callError: Object.assign(new Error('Hai un abbonamento Google Play con rinnovo attivo…'), { code: 'functions/failed-precondition', details: { reason: 'play_subscription_active' } }) });
    await h.run();
    expect(h.ls.size).toBe(1); expect(h.authDeleted).toBe(false); expect(h.signedOut).toBe(false); expect(h.dbDeletes.length).toBe(0);
    expect(h.statusEl.innerHTML).toContain('Google Play');
    expect(h.statusEl.innerHTML).not.toContain('✅');
  });

  it('successo: pulizia locale e logout solo dopo l\'esito del server; residui dichiarati', async () => {
    const h = runConfirm({ callResult: { status: 'core_deleted', subscription: { stripe: 'canceled' }, pending: ['file caricati (avatar, registrazioni)'] } });
    await h.run();
    expect(h.ls.size).toBe(0); expect(h.signedOut).toBe(true); expect(h.authDeleted).toBe(false);
    expect(h.statusEl.innerHTML).toContain('Abbonamento Stripe annullato');
    expect(h.statusEl.innerHTML).toContain('Ancora da rimuovere');
  });

  it('risposta inattesa: trattata come errore, nessuna pulizia', async () => {
    const h = runConfirm({ callResult: { success: true } });
    await h.run();
    expect(h.ls.size).toBe(1); expect(h.signedOut).toBe(false);
  });
});
