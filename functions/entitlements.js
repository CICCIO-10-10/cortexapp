'use strict';
/**
 * Diritti effettivi (piano) calcolati lato server — unica fonte per i gate
 * Gemini, TTS e Neural Duels.
 *
 * Fase 1 (audit 2026-10): applica la scadenza dei piani Google Play.
 * Limite noto, da chiudere in fase 4: senza RTDN la scadenza salvata è quella
 * letta all'ultima verifica; un rinnovo Play viene recepito solo quando qualcuno
 * richiama getEntitlements (il client lo fa all'avvio se vede il piano scaduto).
 */
const PAID_PLANS = new Set(['student', 'pro']);

/** Converte Timestamp Firestore / Date / numero / stringa ISO in millisecondi. */
function toMillis(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'string') { const n = Date.parse(value); return Number.isFinite(n) ? n : null; }
  if (typeof value._seconds === 'number') return value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6);
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  return null;
}

/**
 * @param {object|null} user  dati di users/{uid}
 * @param {number} now        epoch ms
 * @returns {{plan:'free'|'student'|'pro', source:string|null, expiresAt:number|null,
 *            paidExpired:boolean, trial:boolean, trialExpiresAt:number|null}}
 */
function effectivePlan(user, now = Date.now()) {
  const u = user && typeof user === 'object' ? user : {};
  const stored = typeof u.plan === 'string' ? u.plan.trim().toLowerCase() : 'free';
  const source = typeof u.planSource === 'string' ? u.planSource : null;
  let plan = PAID_PLANS.has(stored) ? stored : 'free';
  let expiresAt = null;
  let paidExpired = false;

  // Solo i piani Google Play hanno una scadenza registrata (planExpiresAt).
  // Se manca (es. vecchi documenti in cui un acquisto Sparks Play aveva
  // sovrascritto planSource) non si inventa una scadenza.
  if (plan !== 'free' && source === 'google_play') {
    expiresAt = toMillis(u.planExpiresAt);
    if (expiresAt !== null && expiresAt <= now) {
      plan = 'free';
      paidExpired = true;
    }
  }

  const trialExpiresAt = toMillis(u.trialExpiresAt);
  let trial = false;
  if (plan === 'free' && PAID_PLANS.has(u.trialPlan) && trialExpiresAt !== null && trialExpiresAt > now) {
    plan = u.trialPlan;
    trial = true;
  }
  return { plan, source, expiresAt, paidExpired, trial, trialExpiresAt };
}

module.exports = { PAID_PLANS, toMillis, effectivePlan };
