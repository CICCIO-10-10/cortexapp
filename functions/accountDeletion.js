'use strict';
/**
 * Cancellazione account completa (audit 2026-10: fase 1.2 contenimento F01 → fase 3).
 *
 * Ordine (ogni passo è ripetibile, il registro _accountDeletions/{uid} dice dove si è arrivati):
 *  1. accesso recente obbligatorio (operazione irreversibile);
 *  2. riferimenti economici salvati PRIMA di toccare i dati;
 *  3. abbonamenti: Google Play con rinnovo attivo → blocco (lo annulla l'utente dal
 *     Play Store); Stripe → annullato davvero, altrimenti blocco. Nessun dato toccato
 *     finché gli abbonamenti non sono sistemati;
 *  4. lucchetto _deletionLocks/{uid} (le regole impediscono di ricreare dati);
 *  5. eliminazione di tutti i dati riconducibili all'account (vedi purgeAccountData):
 *     Firestore, relazioni social, feedback/segnalazioni, partite, file su Storage,
 *     telemetria dei dispositivi indicati dal client;
 *  6. impronta HMAC dell'email (12 mesi) solo per impedire il riuso degli inviti con
 *     un account ricreato;
 *  7. token revocati e identità di accesso ELIMINATA (non solo disabilitata);
 *  8. passaggio finale automatico dopo 2 ore (scadenza massima dei token già emessi):
 *     ripete la pulizia per eventuali scritture arrivate da schede ancora aperte.
 * Un errore dopo il lucchetto lascia lo stato 'failed': l'utente può riprovare e, in
 * ogni caso, resumeAccountDeletions (job pianificato) completa il lavoro.
 */
const crypto = require('crypto');

const RECENT_AUTH_MS = 10 * 60 * 1000;
const FINAL_SWEEP_DELAY_MS = 2 * 3600e3;          // > durata massima di un ID token (1 h)
const RESUME_AFTER_MS = 15 * 60 * 1000;            // non riprendere richieste ancora in corso
const IDENTITY_RETENTION_MS = 365 * 864e5;         // impronta email: 12 mesi
const STRIPE_LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);
const VID_RE = /^[a-zA-Z0-9_-]{1,100}$/;
const MAX_VISITOR_IDS = 5;

// Compatibilità con il registro della fase 1.2 (stato 'core_deleted' + pending).
const PENDING_SCOPE = Object.freeze([]);
/** Cosa resta dopo la cancellazione, dichiarato all'utente e nel registro. */
const RETAINED = Object.freeze([
  'registro della richiesta di cancellazione (data, esito, riferimenti degli abbonamenti) come prova',
  'ricevute degli acquisti in-app (codice d’acquisto cifrato) per impedirne il riuso',
  'impronta cifrata dell’email per 12 mesi, solo per impedire il riuso degli inviti',
  'dati fiscali dei pagamenti presso Stripe o Google Play (obblighi di legge)',
]);

// Collezioni con un campo che punta all'utente: tutti i documenti vengono eliminati.
const OWNED_QUERIES = Object.freeze([
  ['userProfiles', 'uid'], ['publicDecks', 'ownerId'],
  ['follows', 'followerUid'], ['follows', 'followingUid'],
  ['friends', 'uid1'], ['friends', 'uid2'],
  ['friendRequests', 'fromUid'], ['friendRequests', 'toUid'],
  ['feedbacks', 'userId'], ['deckReports', 'reporterId'],
  ['duels', 'player1.id'], ['duels', 'player2.id'],
]);
// Documenti con id = uid (alcune collezioni sono storiche: le regole oggi le bloccano).
const OWNED_DOCS = Object.freeze(['profiles', 'leaderboard', 'referralLeaderboard', 'referrals', '_referralStats', '_referralClaims']);

class DeletionError extends Error {
  constructor(code, reason, message) { super(message); this.code = code; this.reason = reason; }
}

const toMillis = v => (v == null ? null : typeof v === 'number' ? v : typeof v.toMillis === 'function' ? v.toMillis() : null);

function sanitizeVisitorIds(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(v => typeof v === 'string' && VID_RE.test(v)))].slice(0, MAX_VISITOR_IDS);
}

/** Email normalizzata (minuscole; per Gmail senza punti né +alias) — solo per l'impronta. */
function normalizeEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return null;
  let [local, domain] = email.trim().toLowerCase().split('@');
  if (!local || !domain) return null;
  if (domain === 'gmail.com' || domain === 'googlemail.com') { local = local.split('+')[0].replace(/\./g, ''); domain = 'gmail.com'; }
  return local + '@' + domain;
}
/** HMAC dell'email normalizzata: senza la chiave del server non si risale all'indirizzo per tentativi. */
function identityHash(email, secret) {
  const norm = normalizeEmail(email);
  if (!norm || !secret) return null;
  return crypto.createHmac('sha256', String(secret)).update('cortex-deleted-identity|' + norm).digest('hex');
}

async function deleteQueryInChunks(db, query, size = 400) {
  const snap = await query.get();
  for (let i = 0; i < snap.docs.length; i += size) {
    const batch = db.batch();
    snap.docs.slice(i, i + size).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.docs.length;
}

/**
 * Elimina tutti i dati riconducibili all'account. Idempotente: si può ripetere.
 * @returns {Promise<object>} conteggi per il registro (nessun contenuto personale)
 */
async function purgeAccountData({ uid, record = {}, deps }) {
  const { db, admin, security } = deps;
  const FieldValue = admin.firestore.FieldValue;
  const counts = {};
  await security.retainLegacyReceipts(db, uid);                   // anti-riuso ricevute, separato dal profilo
  await db.recursiveDelete(db.collection('users').doc(uid));      // + decks, memory, coachReports…
  await db.recursiveDelete(db.collection('usage').doc(uid));
  for (const col of OWNED_DOCS) await db.collection(col).doc(uid).delete();
  for (const [col, field] of OWNED_QUERIES) {
    const n = await deleteQueryInChunks(db, db.collection(col).where(field, '==', uid));
    if (n) counts[col] = (counts[col] || 0) + n;
  }
  // Inviti usati da altri con il codice di questo account: l'invito resta valido per
  // loro (anti-abuso), ma senza il riferimento all'account eliminato.
  const claims = await db.collection('_referralClaims').where('referrerUid', '==', uid).get();
  for (const d of claims.docs) await d.ref.set({ referrerUid: FieldValue.delete(), referrerDeleted: true }, { merge: true });
  if (claims.docs.length) counts.referralClaimsAnonymized = claims.docs.length;
  if (record.stripeCustomerId) await db.collection('stripeCustomers').doc(record.stripeCustomerId).delete();
  // File su Storage: avatar, registrazioni, allegati (tutto sotto users/{uid}/).
  if (deps.bucket) await deps.bucket().deleteFiles({ prefix: `users/${uid}/`, force: true });
  // Telemetria: i percorsi sono anonimi (id del dispositivo, non dell'account). Si
  // eliminano quelli dei dispositivi che il client ha indicato.
  for (const vid of sanitizeVisitorIds(record.visitorIds)) {
    await db.recursiveDelete(db.collection('journeys').doc(vid));
    await db.collection('analytics').doc('presence').collection('sessions').doc(vid).delete();
  }
  return counts;
}

async function deleteIdentity(admin, uid) {
  const auth = admin.auth();
  const ignoreMissing = e => { if (!e || e.code !== 'auth/user-not-found') throw e; };
  await auth.revokeRefreshTokens(uid).catch(ignoreMissing);
  await auth.deleteUser(uid).catch(ignoreMissing);
}

/**
 * Passi 4–7 (dopo la gestione degli abbonamenti). Usato dalla richiesta e dal job.
 */
async function completeDeletion({ uid, email, record, deps, now }) {
  const { db, admin } = deps;
  const FieldValue = admin.firestore.FieldValue;
  const recordRef = db.collection('_accountDeletions').doc(uid);
  try {
    await db.collection('_deletionLocks').doc(uid).set({ lockedAt: FieldValue.serverTimestamp() }, { merge: true });
    await recordRef.set({ stage: 'locked', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const counts = await purgeAccountData({ uid, record, deps });
    await recordRef.set({ stage: 'data_deleted', counts, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const secret = deps.identitySecret ? deps.identitySecret() : null;
    const h = identityHash(email, secret);
    if (h) await db.collection('_deletedIdentities').doc(h).set({ deletedAt: FieldValue.serverTimestamp(), expiresAt: now + IDENTITY_RETENTION_MS });
    await deleteIdentity(admin, uid);
    await recordRef.set({
      status: 'deleted', stage: 'done', identityFingerprint: h ? 'stored' : (email ? 'skipped_no_secret' : 'no_email'),
      retained: [...RETAINED], pending: FieldValue.delete(), error: FieldValue.delete(),
      completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      finalSweepAfter: now + FINAL_SWEEP_DELAY_MS, finalSweepDone: false,
    }, { merge: true });
  } catch (err) {
    await recordRef.set({ status: 'failed', error: String(err && (err.code || err.message) || 'unknown').slice(0, 120), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new DeletionError('internal', 'partial', 'Eliminazione avviata ma non completata. La richiesta è registrata: puoi riprovare ora; in ogni caso verrà completata automaticamente entro qualche ora.');
  }
  // Conferma via email: facoltativa (deps.sendConfirmation presente solo se abilitata),
  // l'indirizzo non viene salvato e un errore di invio non cambia l'esito.
  let confirmation = 'disabled';
  if (email && deps.sendConfirmation) {
    try { confirmation = (await deps.sendConfirmation(email)) ? 'sent' : 'failed'; } catch (_) { confirmation = 'failed'; }
    await recordRef.set({ confirmationEmail: confirmation }, { merge: true }).catch(() => {});
  }
  return confirmation;
}

/**
 * @param {object} p { uid, authTime, email, visitorIds, deps }
 *   deps: { db, admin, security, entitlements, getStripe, readPlaySubscription, bucket?, identitySecret?, sendConfirmation?, now? }
 * @returns {Promise<object>} esito serializzabile per il client
 */
async function runAccountDeletion({ uid, authTime, email = null, visitorIds = [], deps }) {
  const { db, admin, security, getStripe, readPlaySubscription } = deps;
  const now = deps.now ? deps.now() : Date.now();
  const FieldValue = admin.firestore.FieldValue;

  if (!Number.isFinite(authTime) || now - authTime * 1000 > RECENT_AUTH_MS) {
    throw new DeletionError('failed-precondition', 'requires_recent_login', 'Per sicurezza, esci e rientra nell’account, poi ripeti l’eliminazione.');
  }

  const recordRef = db.collection('_accountDeletions').doc(uid);
  const userRef = db.collection('users').doc(uid);
  const [recordSnap, userSnap, lockSnap] = await Promise.all([recordRef.get(), userRef.get(), db.collection('_deletionLocks').doc(uid).get()]);
  const record = recordSnap.exists ? recordSnap.data() : {};
  const user = userSnap.exists ? userSnap.data() : {};

  if (record.status === 'deleted') {
    return { status: 'deleted', alreadyProcessed: true, subscription: record.subscription || {}, retained: record.retained || [...RETAINED] };
  }

  // 1) Riferimenti economici e dispositivi salvati PRIMA di toccare qualsiasi dato.
  const stripeCustomerId = user.stripeCustomerId || record.stripeCustomerId || null;
  const playSub = user.googlePlaySubscription && typeof user.googlePlaySubscription.purchaseToken === 'string'
    ? { sku: user.googlePlaySubscription.sku, token: user.googlePlaySubscription.purchaseToken }
    : (record.playSubscription || null);
  const vids = sanitizeVisitorIds([...(record.visitorIds || []), ...sanitizeVisitorIds(visitorIds)]);
  await recordRef.set({
    uid, status: 'in_progress', stage: record.stage || 'references_saved',
    stripeCustomerId, playSubscription: playSub, visitorIds: vids,
    requestedAt: record.requestedAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const block = async (reason, message, code = 'failed-precondition') => {
    await recordRef.set({ status: 'blocked', stage: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new DeletionError(code, reason, message);
  };

  // Abbonamenti già gestiti in un tentativo precedente (lucchetto presente): si riprende dai dati.
  let subscription = record.subscription;
  if (!(lockSnap.exists && subscription)) {
    // 2) Google Play: Cortex non annulla l'abbonamento al posto dell'utente.
    let playOutcome = 'none';
    if (playSub && security.PRODUCTS[playSub.sku] && security.PRODUCTS[playSub.sku].plan) {
      let play;
      try { play = await readPlaySubscription(playSub.sku, playSub.token); }
      catch (_) { await block('play_unverifiable', 'Non riesco a verificare il tuo abbonamento Google Play. Nessun dato è stato eliminato: riprova tra qualche minuto.', 'unavailable'); }
      if (play.entitled && play.autoRenewing) {
        await block('play_subscription_active', 'Hai un abbonamento Google Play con rinnovo attivo. Annullalo dal Play Store (Pagamenti e abbonamenti → Abbonamenti), poi ripeti l’eliminazione. Nessun dato è stato eliminato.');
      }
      playOutcome = play.entitled ? 'not_renewing' : 'inactive';
    }

    // 3) Stripe: annulla davvero gli abbonamenti ancora attivi, altrimenti si ferma.
    const canceled = Array.isArray(record.canceledStripeSubscriptions) ? [...record.canceledStripeSubscriptions] : [];
    let stripeOutcome = stripeCustomerId ? 'no_active_subscription' : 'none';
    if (stripeCustomerId) {
      try {
        const stripe = getStripe();
        for await (const sub of stripe.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 100 })) {
          if (!STRIPE_LIVE_STATUSES.has(sub.status)) continue;
          await stripe.subscriptions.cancel(sub.id);
          canceled.push(sub.id);
          await recordRef.set({ canceledStripeSubscriptions: FieldValue.arrayUnion(sub.id) }, { merge: true });
        }
        if (canceled.length) stripeOutcome = 'canceled';
      } catch (_) {
        await block('stripe_cancel_failed', canceled.length
          ? 'Abbiamo annullato solo in parte i tuoi abbonamenti Stripe. Nessun dato è stato eliminato: riprova tra qualche minuto.'
          : 'Non riesco ad annullare il tuo abbonamento. Nessun dato è stato eliminato: riprova tra qualche minuto.', 'unavailable');
      }
    }
    subscription = { stripe: stripeOutcome, stripeCanceledCount: canceled.length, play: playOutcome };
    await recordRef.set({ stage: 'subscriptions_handled', subscription, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  // 4–7) Dati, impronta, identità.
  const confirmation = await completeDeletion({ uid, email, record: { ...record, stripeCustomerId, visitorIds: vids }, deps, now });
  return { status: 'deleted', subscription, retained: [...RETAINED], confirmationEmail: confirmation };
}

/**
 * Job pianificato: completa le cancellazioni rimaste a metà, esegue il passaggio
 * finale dopo 2 ore e scarta le impronte scadute. Non riprende mai una richiesta
 * ferma PRIMA del lucchetto (abbonamenti non sistemati): lì serve l'utente.
 */
async function resumeAccountDeletions({ deps, limit = 25 }) {
  const { db, admin } = deps;
  const now = deps.now ? deps.now() : Date.now();
  const FieldValue = admin.firestore.FieldValue;
  const out = { resumed: 0, resumeFailed: 0, swept: 0, skipped: 0, identitiesExpired: 0 };

  const stuck = await db.collection('_accountDeletions').where('status', 'in', ['failed', 'core_deleted', 'in_progress']).limit(limit).get();
  for (const doc of stuck.docs) {
    const rec = doc.data() || {};
    const uid = doc.id;
    const lock = await db.collection('_deletionLocks').doc(uid).get();
    const updated = toMillis(rec.updatedAt);
    if (!lock.exists || !rec.subscription || (updated !== null && now - updated < RESUME_AFTER_MS)) { out.skipped++; continue; }
    let email = null;
    try { email = (await admin.auth().getUser(uid)).email || null; } catch (_) {}
    try { await completeDeletion({ uid, email, record: rec, deps: { ...deps, sendConfirmation: null }, now }); out.resumed++; }
    catch (_) { out.resumeFailed++; }
  }

  const done = await db.collection('_accountDeletions').where('status', '==', 'deleted').where('finalSweepDone', '==', false).limit(limit).get();
  for (const doc of done.docs) {
    const rec = doc.data() || {};
    if (Number(rec.finalSweepAfter || 0) > now) continue;
    try {
      const counts = await purgeAccountData({ uid: doc.id, record: rec, deps });
      await deleteIdentity(admin, doc.id);
      // Il token d'acquisto Play non serve più (le ricevute anti-riuso sono separate).
      const play = rec.playSubscription && rec.playSubscription.sku ? { sku: rec.playSubscription.sku } : null;
      await doc.ref.set({ finalSweepDone: true, finalSweepAt: FieldValue.serverTimestamp(), finalSweepCounts: counts, playSubscription: play, visitorIds: FieldValue.delete() }, { merge: true });
      out.swept++;
    } catch (_) { out.resumeFailed++; }
  }

  const expired = await db.collection('_deletedIdentities').where('expiresAt', '<', now).limit(200).get();
  for (const d of expired.docs) { await d.ref.delete(); out.identitiesExpired++; }
  return out;
}

/** true se l'email appartiene a un account eliminato negli ultimi 12 mesi (per gli inviti). */
async function isRecentlyDeletedIdentity({ db, email, secret, now = Date.now() }) {
  const h = identityHash(email, secret);
  if (!h) return false;
  const snap = await db.collection('_deletedIdentities').doc(h).get();
  return snap.exists && Number(snap.data().expiresAt || 0) > now;
}

module.exports = {
  runAccountDeletion, resumeAccountDeletions, purgeAccountData, isRecentlyDeletedIdentity,
  identityHash, normalizeEmail, sanitizeVisitorIds,
  DeletionError, PENDING_SCOPE, RETAINED, RECENT_AUTH_MS, FINAL_SWEEP_DELAY_MS, OWNED_QUERIES, OWNED_DOCS,
};
