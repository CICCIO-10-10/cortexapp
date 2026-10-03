'use strict';
/**
 * Cancellazione account — CONTENIMENTO F01 (audit 2026-10, fase 1.2).
 *
 * NON è ancora la cancellazione completa (fase 3). Questo tampone garantisce:
 *  - unico ingresso server (il browser non cancella più nulla da solo);
 *  - autenticazione recente richiesta (operazione irreversibile);
 *  - riferimenti economici letti e salvati PRIMA di rimuovere il documento utente;
 *  - abbonamento Stripe annullato davvero (o nessuna cancellazione se fallisce);
 *  - abbonamento Google Play con rinnovo attivo: si chiede all'utente di
 *    annullarlo dal Play Store (Cortex non lo annulla al posto suo);
 *  - esito veritiero e registro persistente in _accountDeletions/{uid}, così un
 *    errore a metà è riprendibile e i residui sono elencati, non nascosti.
 * L'account Auth viene DISABILITATO (non eliminato): la rimozione definitiva e la
 * pulizia dei residui elencati in `pending` arrivano con la fase 3.
 */
const RECENT_AUTH_MS = 10 * 60 * 1000;
const STRIPE_LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);
// Dati NON ancora gestiti dal tampone: dichiarati all'utente e salvati nel registro.
const PENDING_SCOPE = Object.freeze([
  'relazioni social (follow, amicizie, richieste)',
  'feedback e segnalazioni pubblicate',
  'file caricati (avatar, registrazioni)',
  'dati di navigazione anonimi (telemetria)',
  'eliminazione definitiva dell’identità di accesso',
]);

class DeletionError extends Error {
  constructor(code, reason, message) { super(message); this.code = code; this.reason = reason; }
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
 * @param {object} deps { db, admin, security, entitlements, getStripe, readPlaySubscription, now }
 *   readPlaySubscription(sku, token) → oggetto normalizzato (security.normalizePlaySubscription)
 * @returns {Promise<object>} esito serializzabile per il client
 */
async function runAccountDeletion({ uid, authTime, deps }) {
  const { db, admin, security, entitlements, getStripe, readPlaySubscription } = deps;
  const now = deps.now ? deps.now() : Date.now();
  const FieldValue = admin.firestore.FieldValue;

  if (!Number.isFinite(authTime) || now - authTime * 1000 > RECENT_AUTH_MS) {
    throw new DeletionError('failed-precondition', 'requires_recent_login', 'Per sicurezza, esci e rientra nell’account, poi ripeti l’eliminazione.');
  }

  const recordRef = db.collection('_accountDeletions').doc(uid);
  const userRef = db.collection('users').doc(uid);
  const [recordSnap, userSnap] = await Promise.all([recordRef.get(), userRef.get()]);
  const record = recordSnap.exists ? recordSnap.data() : {};
  const user = userSnap.exists ? userSnap.data() : {};

  if (record.status === 'core_deleted') {
    return { status: 'core_deleted', alreadyProcessed: true, subscription: record.subscription || {}, pending: record.pending || [...PENDING_SCOPE] };
  }

  // 1) Riferimenti economici salvati PRIMA di toccare qualsiasi dato.
  const stripeCustomerId = user.stripeCustomerId || record.stripeCustomerId || null;
  const playSub = user.googlePlaySubscription && typeof user.googlePlaySubscription.purchaseToken === 'string'
    ? { sku: user.googlePlaySubscription.sku, token: user.googlePlaySubscription.purchaseToken }
    : (record.playSubscription || null);
  await recordRef.set({
    uid, status: 'in_progress', stage: 'references_saved',
    stripeCustomerId, playSubscription: playSub, // token necessario per la riconciliazione in fase 3/4
    requestedAt: record.requestedAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const block = async (reason, message, code = 'failed-precondition') => {
    await recordRef.set({ status: 'blocked', stage: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new DeletionError(code, reason, message);
  };

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
  const subscription = { stripe: stripeOutcome, stripeCanceledCount: canceled.length, play: playOutcome };
  await recordRef.set({ stage: 'subscriptions_handled', subscription, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  // 4) Dati principali. Ogni passo è ripetibile: un retry riparte da qui.
  try {
    // Lucchetto letto dalle regole Firestore: da qui in poi nessun client (es. una
    // scheda ancora aperta) può ricreare users/profili/mazzi pubblici per questo uid.
    await db.collection('_deletionLocks').doc(uid).set({ lockedAt: FieldValue.serverTimestamp() });
    await security.retainLegacyReceipts(db, uid); // anti-riuso ricevute, separato dal profilo
    await db.recursiveDelete(userRef);                          // users/{uid} + decks, memory, coachReports…
    await db.recursiveDelete(db.collection('usage').doc(uid));  // quote giornaliere
    await db.collection('profiles').doc(uid).delete();
    await deleteQueryInChunks(db, db.collection('userProfiles').where('uid', '==', uid));
    await deleteQueryInChunks(db, db.collection('publicDecks').where('ownerId', '==', uid));
    if (stripeCustomerId) await db.collection('stripeCustomers').doc(stripeCustomerId).delete();
    await recordRef.set({ stage: 'core_data_deleted', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    // 5) Accesso bloccato: niente nuovi token; le regole rifiutano scritture dei
    //    token ancora validi grazie al marker _accountDeletions/{uid}.
    await admin.auth().revokeRefreshTokens(uid);
    await admin.auth().updateUser(uid, { disabled: true });
  } catch (err) {
    await recordRef.set({ status: 'failed', stage: 'core_data', error: String(err && (err.code || err.message) || 'unknown').slice(0, 120), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new DeletionError('internal', 'partial', 'Eliminazione avviata ma non completata. La richiesta è registrata: riprova, ripartirà da dove si è fermata.');
  }

  const pending = [...PENDING_SCOPE];
  await recordRef.set({ status: 'core_deleted', stage: 'done_containment', pending, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { status: 'core_deleted', subscription, pending };
}

module.exports = { runAccountDeletion, DeletionError, PENDING_SCOPE, RECENT_AUTH_MS };
