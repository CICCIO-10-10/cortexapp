/**
 * services/activation.js — Activation & retention tracking
 * Fonte di verita': Firestore (serverTimestamp + increment atomici + transaction).
 *
 * Definizione activation (06/10/2026, decisione del titolare — "scelta A"):
 *   ATTIVATO = primo ripasso completato (sessione arrivata in fondo con almeno una carta),
 *   su qualunque mazzo — anche gli errori del TOLC, che non usano l'AI — esclusi i mazzi demo.
 *   Origine in activation.activatedVia ('tolc_errors' | 'deck').
 * La regola precedente (>=3 card generate + >=3 studiate + >=1 valutata) resta misurata a
 * parte come activation.aiActivated, per confrontare i numeri con prima.
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
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      const u = firebase.auth().currentUser;
      // 16/10/2026: l'ospite usa l'AI con un accesso ANONIMO; senza questo controllo le sue tappe finivano
      // in users/{anonimo}.activation e la dashboard lo contava tra gli utenti attivati (le metriche da
      // Firebase Auth escludono invece gli anonimi). Per l'ospite le tappe restano solo sul dispositivo.
      return u.isAnonymous ? null : u.uid;
    }
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

function _localDay() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Incrementa un contatore di activation e valuta (una sola volta) la soglia.
 * @param {'cardsGenerated'|'cardsStudied'|'ratingsGiven'} field
 * @param {number} n
 */
export async function bumpActivation(field, n, ctx = {}) {
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

      // 04/10/2026: tappe di studio per account (vedi core/studyMilestones.js). Basate SOLO su
      // carte valutate / sessioni completate: aprire l'app o il refresh del token non contano.
      const day = _localDay();
      if (field === 'cardsStudied' && !cur.firstReviewCompletedAt) {
        activation.firstReviewCompletedAt = FV.serverTimestamp();
        activation.firstReviewDay = day;
      }
      if (field === 'ratingsGiven') {
        activation.lastStudyDay = day;
        if (cur.firstReviewDay && day > cur.firstReviewDay && !cur.studyReturnedAt) {
          activation.studyReturnedAt = FV.serverTimestamp();
          activation.studyReturnedDay = day;
        }
      }

      let activatedNow = false;
      const flow = ctx && typeof ctx.flow === 'string' ? ctx.flow : 'deck';
      if (!cur.activated && field === 'cardsStudied' && flow !== 'demo') {
        activation.activated = true;
        activation.activatedAt = FV.serverTimestamp();
        activation.activatedVia = flow === 'tolc_errors' ? 'tolc_errors' : 'deck';
        activatedNow = true;
      }
      // Regola precedente, solo per confronto (non decide più "attivato").
      if (!cur.aiActivated && gen >= T_GEN && stu >= T_STU && rate >= T_RATE) {
        activation.aiActivated = true;
        activation.aiActivatedAt = FV.serverTimestamp();
      }
      tx.set(ref, { activation }, { merge: true });
      return activatedNow;
    });

    if (didActivate) { try { track('activated', { flow: (ctx && ctx.flow) || 'deck' }); } catch (_) {} }
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
