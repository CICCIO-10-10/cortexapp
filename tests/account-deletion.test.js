// Audit 2026-10 — Cancellazione account: contenimento F01 (fase 1.2) → cancellazione completa (fase 3).
// Server: functions/accountDeletion.js con Firestore/Stripe/Play/Storage/Auth simulati.
// Client: modules/gdpr.js eseguito in vm — il browser non cancella nulla sul server.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const del = require('../functions/accountDeletion.js');
const { runAccountDeletion, resumeAccountDeletions, identityHash, normalizeEmail, RETAINED, FINAL_SWEEP_DELAY_MS } = del;
const security = require('../functions/security.js');
const entitlements = require('../functions/entitlements.js');
const { claimReferral } = require('../functions/referral.js');
const { createFakeFirestore } = require('./helpers/fakeFirestore.cjs');

const NOW = Date.parse('2026-10-03T12:00:00Z');
const recent = Math.floor(NOW / 1000) - 60;
const SECRET = 'segreto-test';

function setup({ stripeSubs = [], stripeFails = false, play = null, playFails = false, secret = SECRET, sendConfirmation = null, authMissing = false, storageFails = false } = {}) {
  let clock = NOW;
  const f = createFakeFirestore({ now: () => clock });
  const authCalls = [];
  const authUsers = new Map([['U', { email: 'u@example.com' }]]);
  f.admin.auth = () => ({
    revokeRefreshTokens: async uid => { authCalls.push(['revoke', uid]); if (authMissing || !authUsers.has(uid)) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' }); },
    updateUser: async (uid, d) => authCalls.push(['update', uid, d]),
    deleteUser: async uid => { authCalls.push(['delete', uid]); if (authMissing || !authUsers.has(uid)) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' }); authUsers.delete(uid); },
    getUser: async uid => { if (!authUsers.has(uid)) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' }); return authUsers.get(uid); },
  });
  const subs = stripeSubs.map(s => ({ ...s }));
  const stripeCalls = { list: 0, cancel: [] };
  const stripe = {
    subscriptions: {
      list: () => { stripeCalls.list++; if (stripeFails) throw new Error('stripe down'); return (async function* () { for (const s of subs) yield s; })(); },
      cancel: async id => { stripeCalls.cancel.push(id); subs.find(s => s.id === id).status = 'canceled'; },
    },
  };
  const files = new Set(['users/U/avatar/a.jpg', 'users/U/recordings/r1.webm', 'users/OTHER/avatar/b.jpg', 'public/logo.png']);
  const storageCalls = [];
  const bucket = () => ({
    deleteFiles: async ({ prefix }) => { storageCalls.push(prefix); if (storageFails) throw new Error('storage down'); for (const p of [...files]) if (p.startsWith(prefix)) files.delete(p); },
  });
  const sent = [];
  const deps = {
    db: f.db, admin: f.admin, security, entitlements, now: () => clock,
    getStripe: () => stripe, bucket,
    identitySecret: () => secret,
    sendConfirmation: sendConfirmation ? async to => { sent.push(to); return sendConfirmation(to); } : null,
    readPlaySubscription: async () => { if (playFails) throw new Error('play down'); return play; },
  };
  const seedUser = (extra = {}) => {
    const rows = {
      'users/U': { plan: 'student', email: 'u@example.com', ...extra },
      'users/U/decks/d1': { name: 'Mazzo' }, 'users/U/memory/m1': { x: 1 }, 'users/U/coachReports/w1': { x: 1 },
      'usage/U': { x: 1 }, 'usage/U/daily/2026-10-03': { calls: 3 },
      'profiles/U': { uid: 'U', isPublic: true }, 'userProfiles/ciccio': { uid: 'U', xp: 10 },
      'publicDecks/p1': { ownerId: 'U', name: 'Pubblico' }, 'publicDecks/p2': { ownerId: 'OTHER', name: 'Altro' },
      'users/OTHER': { plan: 'free' }, 'profiles/OTHER': { uid: 'OTHER', isPublic: true },
      // relazioni e contenuti social
      'follows/U_OTHER': { followerUid: 'U', followingUid: 'OTHER' }, 'follows/OTHER_U': { followerUid: 'OTHER', followingUid: 'U' },
      'follows/OTHER_Y': { followerUid: 'OTHER', followingUid: 'Y' },
      'friends/OTHER_U': { uid1: 'OTHER', uid2: 'U' }, 'friends/U_OTHER': { uid1: 'U', uid2: 'OTHER' }, 'friends/OTHER_Y': { uid1: 'OTHER', uid2: 'Y' },
      'friendRequests/r1': { fromUid: 'U', toUid: 'Y', status: 'pending' }, 'friendRequests/r2': { fromUid: 'Y', toUid: 'U', status: 'pending' },
      'friendRequests/r3': { fromUid: 'OTHER', toUid: 'Y', status: 'pending' },
      'feedbacks/f1': { userId: 'U', alias: 'Ciccio', text: 'ciao' }, 'feedbacks/f2': { userId: 'OTHER', alias: 'O', text: 'x' },
      'deckReports/p2_U': { reporterId: 'U', deckId: 'p2', reason: 'spam spam' }, 'deckReports/p1_OTHER': { reporterId: 'OTHER', deckId: 'p1', reason: 'altro' },
      'duels/d1': { player1: { id: 'U', name: 'Ciccio' }, player2: null, status: 'waiting' },
      'duels/d2': { player1: { id: 'OTHER', name: 'O' }, player2: { id: 'U', name: 'Ciccio' }, status: 'finished' },
      'duels/d3': { player1: { id: 'OTHER', name: 'O' }, player2: { id: 'neurobot' }, status: 'finished' },
      // collezioni storiche e referral
      'leaderboard/U': { totalXP: 1 }, 'referralLeaderboard/U': { n: 1 }, 'referrals/U': { n: 1 },
      '_referralStats/U': { month: '2026-10', monthCount: 1 }, '_referralClaims/U': { referrerUid: 'OTHER', code: 'OTHERxxx' },
      '_referralClaims/Z': { referrerUid: 'U', code: 'Uxxxxxxx' },
      // telemetria anonima
      'journeys/vid1': { vid: 'vid1' }, 'journeys/vid1/events/e1': { type: 'x' }, 'analytics/presence/sessions/vid1': { page: 'app' },
      'journeys/vid2': { vid: 'vid2' }, 'analytics/presence/sessions/vid2': { page: 'app' },
    };
    for (const [k, v] of Object.entries(rows)) f.rows.set(k, v);
  };
  return { f, deps, authCalls, stripeCalls, subs, seedUser, files, storageCalls, sent, setClock: ms => { clock = ms; }, authUsers };
}
const run = (deps, { authTime = recent, email = 'u@example.com', visitorIds = ['vid1'] } = {}) =>
  runAccountDeletion({ uid: 'U', authTime, email, visitorIds, deps });

const GONE = ['users/U', 'users/U/decks/d1', 'users/U/memory/m1', 'users/U/coachReports/w1', 'usage/U', 'usage/U/daily/2026-10-03',
  'profiles/U', 'userProfiles/ciccio', 'publicDecks/p1', 'follows/U_OTHER', 'follows/OTHER_U', 'friends/OTHER_U', 'friends/U_OTHER',
  'friendRequests/r1', 'friendRequests/r2', 'feedbacks/f1', 'deckReports/p2_U', 'duels/d1', 'duels/d2',
  'leaderboard/U', 'referralLeaderboard/U', 'referrals/U', '_referralStats/U', '_referralClaims/U',
  'journeys/vid1', 'journeys/vid1/events/e1', 'analytics/presence/sessions/vid1'];
const KEPT = ['publicDecks/p2', 'users/OTHER', 'profiles/OTHER', 'follows/OTHER_Y', 'friends/OTHER_Y', 'friendRequests/r3',
  'feedbacks/f2', 'deckReports/p1_OTHER', 'duels/d3', 'journeys/vid2', 'analytics/presence/sessions/vid2', '_referralClaims/Z'];

describe('deleteUserAccount — cancellazione completa (fase 3)', () => {
  it('richiede un accesso recente e in quel caso non tocca nulla', async () => {
    const t = setup(); t.seedUser();
    await expect(run(t.deps, { authTime: recent - 3600 })).rejects.toMatchObject({ code: 'failed-precondition', reason: 'requires_recent_login' });
    await expect(run(t.deps, { authTime: NaN })).rejects.toMatchObject({ reason: 'requires_recent_login' });
    expect(t.f.rows.has('users/U')).toBe(true); expect(t.f.rows.has('_accountDeletions/U')).toBe(false); expect(t.authCalls).toEqual([]);
  });

  it('elimina tutti i dati riconducibili all\'account e nient\'altro; identità ELIMINATA', async () => {
    const t = setup({ stripeSubs: [{ id: 'sub_1', status: 'active' }, { id: 'sub_old', status: 'canceled' }] });
    t.seedUser({ stripeCustomerId: 'cus_1' }); t.f.rows.set('stripeCustomers/cus_1', { uid: 'U' });
    const r = await run(t.deps);
    expect(r).toMatchObject({ status: 'deleted', subscription: { stripe: 'canceled', stripeCanceledCount: 1, play: 'none' }, retained: [...RETAINED], confirmationEmail: 'disabled' });
    expect(t.stripeCalls.cancel).toEqual(['sub_1']);
    for (const p of [...GONE, 'stripeCustomers/cus_1']) expect(t.f.rows.has(p), p).toBe(false);
    for (const p of KEPT) expect(t.f.rows.has(p), p).toBe(true);
    // invito usato da Z con il codice di U: resta valido per Z ma senza riferimento a U
    expect(t.f.rows.get('_referralClaims/Z')).toEqual({ code: 'Uxxxxxxx', referrerDeleted: true });
    // file: solo quelli di U
    expect(t.storageCalls).toEqual(['users/U/']);
    expect([...t.files].sort()).toEqual(['public/logo.png', 'users/OTHER/avatar/b.jpg']);
    expect(t.authCalls).toEqual([['revoke', 'U'], ['delete', 'U']]);
    const rec = t.f.rows.get('_accountDeletions/U');
    expect(rec).toMatchObject({ status: 'deleted', stage: 'done', stripeCustomerId: 'cus_1', canceledStripeSubscriptions: ['sub_1'], finalSweepDone: false, finalSweepAfter: NOW + FINAL_SWEEP_DELAY_MS, identityFingerprint: 'stored' });
    expect(rec.pending).toBeUndefined();
    expect(t.f.rows.has('_deletionLocks/U')).toBe(true);
    // l'email non è salvata in chiaro da nessuna parte
    expect(JSON.stringify([...t.f.rows.entries()])).not.toContain('u@example.com');
    expect(t.f.rows.has('_deletedIdentities/' + identityHash('u@example.com', SECRET))).toBe(true);
  });

  it('senza chiave del server nessuna impronta (e lo registra)', async () => {
    const t = setup({ secret: null }); t.seedUser();
    await run(t.deps);
    expect([...t.f.rows.keys()].some(k => k.startsWith('_deletedIdentities/'))).toBe(false);
    expect(t.f.rows.get('_accountDeletions/U').identityFingerprint).toBe('skipped_no_secret');
  });

  it('id telemetria non validi o in eccesso ignorati', async () => {
    const t = setup(); t.seedUser();
    await run(t.deps, { visitorIds: ['../journeys', 'a b', 42, 'v1', 'v2', 'v3', 'v4', 'v5', 'v6'] });
    expect(t.f.rows.get('_accountDeletions/U').visitorIds).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);
    expect(t.f.rows.has('journeys/vid1')).toBe(true); // non indicato da questo dispositivo
  });

  it('se Stripe non risponde: nessun dato eliminato, esito "riprova", riferimenti conservati', async () => {
    const t = setup({ stripeFails: true }); t.seedUser({ stripeCustomerId: 'cus_1' });
    await expect(run(t.deps)).rejects.toMatchObject({ code: 'unavailable', reason: 'stripe_cancel_failed' });
    expect(t.f.rows.has('users/U')).toBe(true); expect(t.f.rows.has('follows/U_OTHER')).toBe(true);
    expect(t.f.rows.get('_accountDeletions/U')).toMatchObject({ status: 'blocked', stripeCustomerId: 'cus_1' });
    expect(t.f.rows.has('_deletionLocks/U')).toBe(false); expect(t.authCalls).toEqual([]); expect(t.storageCalls).toEqual([]);
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

  it('errore a metà (Storage): stato "failed", identità intatta; il retry riparte dai dati senza ricontattare Stripe', async () => {
    const t = setup({ stripeSubs: [{ id: 'sub_1', status: 'active' }], storageFails: true });
    t.seedUser({ stripeCustomerId: 'cus_1' });
    await expect(run(t.deps)).rejects.toMatchObject({ code: 'internal', reason: 'partial' });
    expect(t.f.rows.get('_accountDeletions/U')).toMatchObject({ status: 'failed', stripeCustomerId: 'cus_1' });
    expect(t.authCalls).toEqual([]);                       // l'utente può ancora riprovare
    t.deps.bucket = () => ({ deleteFiles: async () => {} });
    const r = await run(t.deps);
    expect(r.status).toBe('deleted');
    expect(t.stripeCalls).toMatchObject({ list: 1, cancel: ['sub_1'] });
    expect(r.subscription).toMatchObject({ stripe: 'canceled' });
  });

  it('errore in Firestore a metà: ripreso anche dal job se l\'utente non riprova', async () => {
    const t = setup(); t.seedUser();
    t.f.db.failNextRecursiveDelete = true;
    await expect(run(t.deps)).rejects.toMatchObject({ reason: 'partial' });
    expect(await resumeAccountDeletions({ deps: t.deps })).toMatchObject({ resumed: 0, skipped: 1 }); // troppo presto
    t.setClock(NOW + 20 * 60e3);
    expect(await resumeAccountDeletions({ deps: t.deps })).toMatchObject({ resumed: 1 });
    for (const p of GONE) expect(t.f.rows.has(p), p).toBe(false);
    expect(t.f.rows.get('_accountDeletions/U').status).toBe('deleted');
    expect(t.authCalls.at(-1)).toEqual(['delete', 'U']);
    // impronta calcolata anche nel job (email letta dall'identità prima di eliminarla)
    expect(t.f.rows.has('_deletedIdentities/' + identityHash('u@example.com', SECRET))).toBe(true);
  });

  it('il job NON riprende richieste ferme prima del lucchetto (abbonamenti da sistemare)', async () => {
    const t = setup({ stripeFails: true }); t.seedUser({ stripeCustomerId: 'cus_1' });
    await expect(run(t.deps)).rejects.toMatchObject({ reason: 'stripe_cancel_failed' });
    t.f.rows.set('_accountDeletions/U', { ...t.f.rows.get('_accountDeletions/U'), status: 'in_progress' });
    t.setClock(NOW + 3600e3);
    expect(await resumeAccountDeletions({ deps: t.deps })).toMatchObject({ resumed: 0, skipped: 1 });
    expect(t.f.rows.has('users/U')).toBe(true);
  });

  it('registri della fase 1.2 ("core_deleted" con residui): completati dal job, identità eliminata', async () => {
    const t = setup(); t.seedUser();
    for (const p of ['users/U', 'profiles/U', 'usage/U']) t.f.rows.delete(p);
    t.f.rows.set('_deletionLocks/U', { lockedAt: 1 });
    t.f.rows.set('_accountDeletions/U', { uid: 'U', status: 'core_deleted', subscription: { stripe: 'none', play: 'none' }, pending: ['x'], updatedAt: NOW - 86400e3 });
    expect(await resumeAccountDeletions({ deps: t.deps })).toMatchObject({ resumed: 1 });
    expect(t.f.rows.has('follows/OTHER_U')).toBe(false); expect(t.f.rows.has('feedbacks/f1')).toBe(false);
    expect(t.storageCalls).toEqual(['users/U/']);
    expect(t.f.rows.get('_accountDeletions/U')).toMatchObject({ status: 'deleted' });
    expect(t.f.rows.get('_accountDeletions/U').pending).toBeUndefined();
    expect(t.authCalls).toContainEqual(['delete', 'U']);
  });

  it('passaggio finale dopo 2 ore: elimina scritture arrivate da schede ancora aperte e il token Play', async () => {
    const t = setup({ play: { entitled: false, autoRenewing: false } });
    t.seedUser({ googlePlaySubscription: { sku: 'cortex_student_monthly', purchaseToken: 'tok' } });
    await run(t.deps);
    t.f.rows.set('follows/U_Y', { followerUid: 'U', followingUid: 'Y' });          // scrittura tardiva
    t.files.add('users/U/avatar/late.jpg');
    t.setClock(NOW + 3600e3);
    expect(await resumeAccountDeletions({ deps: t.deps })).toMatchObject({ swept: 0 });
    expect(t.f.rows.has('follows/U_Y')).toBe(true);
    t.setClock(NOW + FINAL_SWEEP_DELAY_MS + 60e3);
    expect(await resumeAccountDeletions({ deps: t.deps })).toMatchObject({ swept: 1 });
    expect(t.f.rows.has('follows/U_Y')).toBe(false);
    expect(t.files.has('users/U/avatar/late.jpg')).toBe(false);
    const rec = t.f.rows.get('_accountDeletions/U');
    expect(rec).toMatchObject({ finalSweepDone: true, playSubscription: { sku: 'cortex_student_monthly' } });
    expect(rec.visitorIds).toBeUndefined();
    expect(JSON.stringify(rec)).not.toContain('tok');
    expect(await resumeAccountDeletions({ deps: t.deps })).toMatchObject({ swept: 0 });   // una volta sola
  });

  it('impronte email scadute (12 mesi) eliminate dal job', async () => {
    const t = setup(); t.seedUser();
    await run(t.deps);
    const key = '_deletedIdentities/' + identityHash('u@example.com', SECRET);
    t.setClock(NOW + 366 * 864e5);
    expect(await resumeAccountDeletions({ deps: t.deps })).toMatchObject({ identitiesExpired: 1 });
    expect(t.f.rows.has(key)).toBe(false);
  });

  it('identità di accesso già assente: la cancellazione termina comunque', async () => {
    const t = setup({ authMissing: true }); t.seedUser();
    expect((await run(t.deps)).status).toBe('deleted');
  });

  it('richiesta ripetuta dopo il completamento: stesso esito, nessuna nuova azione', async () => {
    const t = setup({ stripeSubs: [{ id: 'sub_1', status: 'active' }] }); t.seedUser({ stripeCustomerId: 'cus_1' });
    await run(t.deps);
    const again = await run(t.deps);
    expect(again).toMatchObject({ status: 'deleted', alreadyProcessed: true });
    expect(t.stripeCalls.list).toBe(1);
  });

  it('email di conferma: solo se abilitata, una volta, indirizzo non salvato; un errore non cambia l\'esito', async () => {
    const t = setup({ sendConfirmation: async () => true }); t.seedUser();
    expect((await run(t.deps)).confirmationEmail).toBe('sent');
    expect(t.sent).toEqual(['u@example.com']);
    expect(t.f.rows.get('_accountDeletions/U').confirmationEmail).toBe('sent');
    expect(JSON.stringify([...t.f.rows.entries()])).not.toContain('u@example.com');
    const t2 = setup({ sendConfirmation: async () => { throw new Error('smtp'); } }); t2.seedUser();
    expect(await run(t2.deps)).toMatchObject({ status: 'deleted', confirmationEmail: 'failed' });
  });

  it('ricevute Play/Sparks conservate per l\'anti-riuso dopo la cancellazione', async () => {
    const t = setup(); t.seedUser({ googlePlayPurchases: [{ sku: 'cortex_sparks_50', purchaseToken: 'sp-tok' }] });
    await run(t.deps);
    expect(t.f.rows.get('_purchaseReceipts/' + security.hash('sp-tok'))).toMatchObject({ uid: 'U', migrated: true });
  });
});

describe('impronta email e inviti', () => {
  it('normalizzazione: maiuscole, punti e +alias Gmail equivalenti; altri domini invariati', () => {
    expect(normalizeEmail(' Mario.Rossi+cortex@GMail.com ')).toBe('mariorossi@gmail.com');
    expect(normalizeEmail('mario.rossi@googlemail.com')).toBe('mariorossi@gmail.com');
    expect(normalizeEmail('mario.rossi+x@libero.it')).toBe('mario.rossi+x@libero.it');
    expect(normalizeEmail('nonemail')).toBeNull();
    expect(identityHash('a@b.it', 'k1')).not.toBe(identityHash('a@b.it', 'k2'));
    expect(identityHash('a@b.it', null)).toBeNull();
    expect(identityHash('A@B.it', 'k1')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('account eliminato e ricreato con la stessa email: nessun nuovo premio d\'invito', async () => {
    const f = createFakeFirestore({ now: () => NOW });
    f.rows.set('users/REFabcde12345xyz', { plan: 'free' });
    f.rows.set('_deletedIdentities/' + identityHash('mario.rossi@gmail.com', SECRET), { expiresAt: NOW + 1000 });
    const token = { firebase: { sign_in_provider: 'google.com' }, email_verified: true, email: 'MarioRossi@gmail.com' };
    const isRecreatedIdentity = email => del.isRecentlyDeletedIdentity({ db: f.db, email, secret: SECRET, now: NOW });
    await expect(claimReferral({ uid: 'nuovo', code: 'REFabcde', token, authCreatedMs: NOW - 60e3, deps: { db: f.db, admin: f.admin, now: () => NOW, isRecreatedIdentity } }))
      .rejects.toMatchObject({ reason: 'recreated_account' });
    expect(f.rows.has('users/nuovo')).toBe(false);
    const other = { ...token, email: 'altra@gmail.com' };
    expect(await claimReferral({ uid: 'nuovo2', code: 'REFabcde', token: other, authCreatedMs: NOW - 60e3, deps: { db: f.db, admin: f.admin, now: () => NOW, isRecreatedIdentity } }))
      .toMatchObject({ status: 'rewarded' });
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

  function runConfirm({ callResult, callError, otherAccounts = [], idbKeys = [], legacy = 'u:U' }) {
    const start = src.indexOf('/** Cancella i dati locali di Cortex');
    const end = src.indexOf('// ─── Data Export (GDPR Art. 20)');
    const body = src.slice(start, end).replace(/\bexport /g, '');
    const ls = new Map([['cortex_user_v1', 'dati'], ['cx_vid', 'vid-dispositivo']]); let signedOut = false, authDeleted = false; const dbDeletes = [];
    const calls = { payload: null, deletedDbs: [], scopeDeletes: [], discarded: [] };
    const statusEl = { style: {}, innerHTML: '' }; const btn = { style: {}, textContent: '', disabled: false };
    const ctx = {
      window: {
        firebase: {
          auth: () => ({ currentUser: { uid: 'U', isAnonymous: false, delete: async () => { authDeleted = true; } }, signOut: async () => { signedOut = true; } }),
          functions: () => ({ httpsCallable: () => async (payload) => { calls.payload = payload; if (callError) throw callError; return { data: callResult }; } }),
          firestore: () => ({ collection: () => ({ doc: () => ({ delete: async () => dbDeletes.push(1) }) }) }),
        },
        showToast() {}, location: {},
      },
      document: { getElementById: id => (id === 'delete-confirm-input' ? { value: 'ELIMINA' } : id === 'gdpr-delete-status' ? statusEl : id === 'delete-confirm-btn' ? btn : null) },
      localStorage: { clear: () => ls.clear(), getItem: k => (ls.has(k) ? ls.get(k) : null) }, sessionStorage: { clear() {} },
      indexedDB: { deleteDatabase: name => { calls.deletedDbs.push(name); const r = {}; setTimeout(() => r.onsuccess && r.onsuccess(), 0); return r; } },
      otherAccountScopes: () => otherAccounts, listScopeKeys: async () => idbKeys, legacyScope: () => legacy,
      deleteScopeData: async s => calls.scopeDeletes.push(s), discardScopeLocal: s => calls.discarded.push(s),
      _t: () => ({}), t: k => k, setTimeout, Promise, String, Array, console: { error() {}, warn() {} },
    };
    vm.runInNewContext(body, ctx);
    return { run: () => ctx.window.__gdprConfirmDelete(), ls, statusEl, btn, calls, get signedOut() { return signedOut; }, get authDeleted() { return authDeleted; }, dbDeletes };
  }
  const OK = { status: 'deleted', subscription: { stripe: 'canceled' }, retained: ['registro della richiesta'] };

  it('errore del server: nessuna pulizia locale, nessuna eliminazione dell\'identità, messaggio reale', async () => {
    const h = runConfirm({ callError: Object.assign(new Error('Hai un abbonamento Google Play con rinnovo attivo…'), { code: 'functions/failed-precondition', details: { reason: 'play_subscription_active' } }) });
    await h.run();
    expect(h.ls.size).toBe(2); expect(h.authDeleted).toBe(false); expect(h.signedOut).toBe(false); expect(h.dbDeletes.length).toBe(0);
    expect(h.statusEl.innerHTML).toContain('Google Play');
    expect(h.statusEl.innerHTML).not.toContain('✅');
  });

  it('successo, nessun altro account sul dispositivo: invia l\'id telemetria, pulizia completa e logout, conservati dichiarati', async () => {
    const h = runConfirm({ callResult: OK });
    await h.run();
    expect(h.calls.payload).toEqual({ visitorIds: ['vid-dispositivo'] });
    expect(h.ls.size).toBe(0); expect(h.signedOut).toBe(true); expect(h.authDeleted).toBe(false);
    expect(h.calls.deletedDbs).toEqual(['cortex_db', 'cortex-audio', 'cortex_lessons']);
    expect(h.statusEl.innerHTML).toContain('Account eliminato');
    expect(h.statusEl.innerHTML).toContain('Abbonamento Stripe annullato');
    expect(h.statusEl.innerHTML).toContain('Conserviamo solo');
    expect(h.statusEl.innerHTML).not.toContain('Ancora da rimuovere');
  });

  it('dispositivo con un altro account: solo i dati di questo account, gli altri restano', async () => {
    const h = runConfirm({ callResult: OK, idbKeys: ['guest', 'u:U', 'u:B'] });
    await h.run();
    expect(h.calls.deletedDbs).toEqual([]);                       // nessun database intero eliminato
    expect(h.calls.scopeDeletes).toEqual(['u:U', 'all', 'legacy']); // U era anche proprietario dei dati storici
    expect(h.calls.discarded).toEqual(['u:U']);
    expect(h.ls.size).toBe(2);                                    // localStorage non svuotato per intero
    expect(h.statusEl.innerHTML).toContain('altri account');
  });

  it('risposta inattesa: trattata come errore, nessuna pulizia', async () => {
    const h = runConfirm({ callResult: { success: true } });
    await h.run();
    expect(h.ls.size).toBe(2); expect(h.signedOut).toBe(false);
  });
});

describe('client: pulizia locale per account (core/accountScope.js)', () => {
  const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const script = p => read(p).replace(/^import [\s\S]*?;\r?\n/gm, '').replace(/\bexport /g, '');
  function storage(seed = {}) {
    const m = new Map(Object.entries(seed));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
  }
  const ctxWith = seed => { const ctx = vm.createContext({ localStorage: storage(seed), console, JSON, Date, Math, Object, Array, String, Set, Map }); vm.runInContext(script('../core/accountScope.js'), ctx); return ctx; };

  it('trova gli altri account del dispositivo', () => {
    const ctx = ctxWith({ cortex_active_scope: 'u:A', 'cortex_scoped:u:B:mm_gstate': '1', 'cortex_scoped:guest:mm_gstate': '2', 'cortex_scoped:guest-archive:x': '3', cortex_legacy_scope: 'u:C' });
    expect(vm.runInContext("otherAccountScopes('u:A')", ctx).sort()).toEqual(['u:B', 'u:C']);
    expect(vm.runInContext("otherAccountScopes('u:Z')", ctx).sort()).toEqual(['u:A', 'u:B', 'u:C']);
  });
  it('account attivo eliminato: via i suoi dati e l\'identità, torna l\'ospite, B intatto', () => {
    const ctx = ctxWith({ cortex_active_scope: 'u:A', mm_gstate: 'A', cortex_uid: 'A', mm_user_id: 'A', mm_user_email: 'a@x.it', cx_vid: 'v',
      mm_lang: 'it', 'cortex_scoped:u:A:old': 'x', 'cortex_scoped:u:B:mm_gstate': 'B', 'cortex_scoped:guest:mm_gstate': 'G', cortex_legacy_scope: 'u:A' });
    vm.runInContext("ensureScopeInitialized(); discardScopeLocal('u:A')", ctx);
    const m = ctx.localStorage._m;
    expect(Object.fromEntries(m)).toEqual({ cortex_active_scope: 'guest', mm_gstate: 'G', mm_lang: 'it', 'cortex_scoped:u:B:mm_gstate': 'B', cortex_legacy_scope: 'guest' });
    expect(vm.runInContext('currentScope()', ctx)).toBe('guest');
  });
});
