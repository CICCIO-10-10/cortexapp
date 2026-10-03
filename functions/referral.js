'use strict';
/**
 * Referral — attribuzione lato server (audit 2026-10, fase 1.3).
 *
 * Sostituisce il trigger processReferral, che si fidava di users/{uid}.referredBy
 * e di flag scrivibili dal browser (premi ripetibili all'infinito).
 *
 * Regole esplicite:
 *  - codice = primi 8 caratteri dell'uid di chi invita (stesso formato dei link
 *    già condivisi ?ref=XXXXXXXX). Il referrer si risolve DAL PREFISSO DELL'UID,
 *    non dal campo refCode scritto dal client (che resta solo informativo);
 *  - chi viene invitato: account non anonimo, email verificata, creato da meno di
 *    NEW_ACCOUNT_MS, un solo claim per sempre (_referralClaims/{uid}, creato in
 *    transazione → nessun doppio premio con retry o richieste concorrenti);
 *  - niente auto-invito, niente invito reciproco (A invita B e B invita A);
 *  - limite mensile di premi per chi invita (_referralStats/{referrerUid});
 *  - account in cancellazione esclusi.
 * Premi invariati rispetto al passato: 7 giorni Student a entrambi.
 */
const REWARD_DAYS = 7;
const DAY_MS = 86400e3;
const NEW_ACCOUNT_MS = 72 * 3600e3;
const MONTHLY_REWARD_CAP = 10;
const CODE_RE = /^[A-Za-z0-9]{8}$/;

class ReferralError extends Error {
  constructor(code, reason, message) { super(message); this.code = code; this.reason = reason; }
}
const monthKey = ms => new Date(ms).toISOString().slice(0, 7);

/**
 * @param {object} p { uid, code, token (decoded ID token), authCreatedMs, deps:{db, admin, now} }
 * @returns {Promise<{status:'rewarded'|'already_claimed', referrer?:string, trialExpiresAt?:number}>}
 */
async function claimReferral({ uid, code, token, authCreatedMs, deps }) {
  const { db, admin } = deps;
  const now = deps.now ? deps.now() : Date.now();
  const FieldValue = admin.firestore.FieldValue;
  const FieldPath = admin.firestore.FieldPath;

  if (typeof code !== 'string' || !CODE_RE.test(code)) throw new ReferralError('invalid-argument', 'invalid_code', 'Codice invito non valido.');
  const provider = token && token.firebase && token.firebase.sign_in_provider;
  if (!provider || provider === 'anonymous') throw new ReferralError('failed-precondition', 'anonymous', 'Accedi con un account per usare un invito.');
  if (!token.email_verified) throw new ReferralError('failed-precondition', 'email_not_verified', 'Verifica la tua email per usare un invito.');

  const claimRef = db.collection('_referralClaims').doc(uid);
  const existing = await claimRef.get();
  if (existing.exists) return { status: 'already_claimed' };

  if (!Number.isFinite(authCreatedMs) || now - authCreatedMs > NEW_ACCOUNT_MS) {
    throw new ReferralError('failed-precondition', 'not_new_account', 'Gli inviti valgono solo per account appena creati.');
  }

  // Referrer risolto dal prefisso dell'uid (documentId), non da campi client.
  const snap = await db.collection('users')
    .where(FieldPath.documentId(), '>=', code)
    .where(FieldPath.documentId(), '<', code + '')
    .limit(2).get();
  if (snap.docs.length !== 1) throw new ReferralError('not-found', snap.docs.length ? 'ambiguous_code' : 'unknown_code', 'Codice invito non trovato.');
  const referrerUid = snap.docs[0].id;
  if (referrerUid === uid) throw new ReferralError('failed-precondition', 'self_referral', 'Non puoi usare il tuo stesso invito.');

  const [referrerLock, myLock, reverseClaim] = await Promise.all([
    db.collection('_deletionLocks').doc(referrerUid).get(),
    db.collection('_deletionLocks').doc(uid).get(),
    db.collection('_referralClaims').doc(referrerUid).get(),
  ]);
  if (referrerLock.exists || myLock.exists) throw new ReferralError('failed-precondition', 'account_deleting', 'Invito non disponibile.');
  if (reverseClaim.exists && reverseClaim.data().referrerUid === uid) throw new ReferralError('failed-precondition', 'mutual_referral', 'Inviti reciproci non validi.');

  const month = monthKey(now);
  const statsRef = db.collection('_referralStats').doc(referrerUid);
  const userRef = db.collection('users').doc(uid);
  const referrerRef = db.collection('users').doc(referrerUid);

  return db.runTransaction(async tx => {
    const [claim, stats, me, referrer] = await Promise.all([tx.get(claimRef), tx.get(statsRef), tx.get(userRef), tx.get(referrerRef)]);
    if (claim.exists) return { status: 'already_claimed' };
    const s = stats.exists ? stats.data() : {};
    const monthCount = s.month === month ? Number(s.monthCount || 0) : 0;
    const rewardReferrer = monthCount < MONTHLY_REWARD_CAP;
    const meData = me.exists ? me.data() : {};
    const refData = referrer.exists ? referrer.data() : {};
    const myExpiry = Math.max(now, Number(meData.trialExpiresAt) || 0) + REWARD_DAYS * DAY_MS;

    tx.create(claimRef, { uid, referrerUid, code, rewardedReferrer: rewardReferrer, createdAt: FieldValue.serverTimestamp() });
    tx.set(userRef, { trialPlan: 'student', trialExpiresAt: myExpiry, referralRewardAt: FieldValue.serverTimestamp(), referralProcessed: true }, { merge: true });
    if (rewardReferrer) {
      const refExpiry = Math.max(now, Number(refData.trialExpiresAt) || 0) + REWARD_DAYS * DAY_MS;
      tx.set(referrerRef, { trialPlan: 'student', trialExpiresAt: refExpiry, referralCount: FieldValue.increment(1), referralDaysEarned: FieldValue.increment(REWARD_DAYS) }, { merge: true });
      tx.set(statsRef, { month, monthCount: monthCount + 1, total: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      tx.set(statsRef, { month, monthCount, cappedTotal: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return { status: 'rewarded', trialExpiresAt: myExpiry, referrerRewarded: rewardReferrer };
  });
}

module.exports = { claimReferral, ReferralError, REWARD_DAYS, NEW_ACCOUNT_MS, MONTHLY_REWARD_CAP };
