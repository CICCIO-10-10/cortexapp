/**
 * services/activation.js — Activation & retention tracking
 * Fonte di verita': Firestore (serverTimestamp + increment atomici + transaction).
 *
 * Definizione activation (CONGELATA):
 *   >=3 card generate + >=3 card studiate + >=1 risposta valutata.
 *
 * Scrive SOLO su users/{uid}, campo `activation` (owner-locked dalle Security Rules;
 * NON tra i _billingProtetti, quindi l'update passa). Guest (no uid) -> no-op:
 * per loro restano solo gli eventi GA4 emessi altrove. Nessun dato personale nuovo:
 * solo contatori + timestamp. Non rompe mai il flusso utente (tutto in try/catch).
 */
import { track } from '../core/analytics.js';

const T_GEN = 3, T_STU = 3, T_RATE = 1;
const VALID = ['cardsGenerated', 'cardsStudied', 'ratingsGiven'];

function _uid() {
  try {
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser)
      return firebase.auth().currentUser.uid;
  } catch (_) {}
  return (typeof window !== 'undefined' && window._fbUserId) ? window._fbUserId : null;
}
function _db() {
  try {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length)
      return firebase.app().firestore();
  } catch (_) {}
  return null;
}
function _noTrack() {
  try { return localStorage.getItem('cortex_no_track') === '1'; } catch (_) { return false; }
}

/**
 * Incrementa un contatore di activation e valuta (una sola volta) la soglia.
 * @param {'cardsGenerated'|'cardsStudied'|'ratingsGiven'} field
 * @param {number} n
 */
export async function bumpActivation(field, n) {
  try {
    if (!n || n <= 0 || VALID.indexOf(field) === -1) return;
    if (_noTrack()) return;
    const uid = _uid(), db = _db();
    if (!uid || !db) return; // guest o firebase non pronto -> solo GA4 altrove
    const FV = firebase.firestore.FieldValue;
    const ref = db.collection('users').doc(uid);

    const didActivate = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = (snap.exists && snap.data() && snap.data().activation) ? snap.data().activation : {};
      const gen  = (cur.cardsGenerated || 0) + (field === 'cardsGenerated' ? n : 0);
      const stu  = (cur.cardsStudied  || 0) + (field === 'cardsStudied'  ? n : 0);
      const rate = (cur.ratingsGiven  || 0) + (field === 'ratingsGiven'  ? n : 0);

      const activation = {};
      activation[field] = FV.increment(n);
      activation.lastSeen = FV.serverTimestamp();
      if (!cur.firstSeen) activation.firstSeen = FV.serverTimestamp();

      let activatedNow = false;
      if (!cur.activated && gen >= T_GEN && stu >= T_STU && rate >= T_RATE) {
        activation.activated = true;
        activation.activatedAt = FV.serverTimestamp();
        activatedNow = true;
      }
      tx.set(ref, { activation }, { merge: true });
      return activatedNow;
    });

    if (didActivate) { try { track('activated', {}); } catch (_) {} }
  } catch (_) { /* silenzioso: mai rompere il flusso utente */ }
}

/**
 * Aggiorna lastSeen (e firstSeen una volta) per D1/D7. No-op per i guest.
 */
export async function touchSeen() {
  try {
    if (_noTrack()) return;
    const uid = _uid(), db = _db();
    if (!uid || !db) return;
    const FV = firebase.firestore.FieldValue;
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    const cur = (snap.exists && snap.data() && snap.data().activation) ? snap.data().activation : {};
    const activation = { lastSeen: FV.serverTimestamp() };
    if (!cur.firstSeen) activation.firstSeen = FV.serverTimestamp();
    await ref.set({ activation }, { merge: true });
  } catch (_) {}
}
