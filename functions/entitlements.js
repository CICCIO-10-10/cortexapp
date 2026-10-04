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

// Fase 4 (audit 2026-10): stato Stripe salvato dal webhook riconciliato (functions/billing.js).
// 'past_due' = Stripe sta ritentando il pagamento: accesso mantenuto per una tolleranza
// definita (STRIPE_PAST_DUE_GRACE_MS dopo la fine del periodo), poi niente diritti anche se
// Stripe resta in past_due. Gli altri stati (canceled, unpaid, incomplete…) non danno diritti.
const STRIPE_ENTITLED = new Set(['active', 'trialing']);
const STRIPE_PAST_DUE_GRACE_MS = 14 * 86400e3;
const PLAY_SKU_PLAN = Object.freeze({ cortex_student_monthly: 'student', cortex_pro_monthly: 'pro' });
const RANK = { free: 0, student: 1, pro: 2 };

function stripeGrant(sub, now) {
  if (!sub || typeof sub !== 'object' || !PAID_PLANS.has(sub.plan)) return null;
  const end = toMillis(sub.periodEnd);
  if (STRIPE_ENTITLED.has(sub.status)) return { plan: sub.plan, source: 'stripe', expiresAt: null };
  if (sub.status === 'past_due' && (end === null || end + STRIPE_PAST_DUE_GRACE_MS > now)) return { plan: sub.plan, source: 'stripe', expiresAt: null, pastDue: true };
  return null;
}

/**
 * Diritti effettivi da TUTTI i provider (fase 4). Regola: vince il piano più alto tra
 * Stripe (stato riconciliato) e Google Play (scadenza); a parità resta l'origine salvata.
 * I documenti precedenti alla fase 4 (senza stripeSubscription) seguono la regola di prima.
 * @param {object|null} user  dati di users/{uid}
 * @param {number} now        epoch ms
 * @returns {{plan:'free'|'student'|'pro', source:string|null, expiresAt:number|null,
 *            paidExpired:boolean, trial:boolean, trialExpiresAt:number|null, pastDue:boolean}}
 */
function effectivePlan(user, now = Date.now()) {
  const u = user && typeof user === 'object' ? user : {};
  const stored = typeof u.plan === 'string' ? u.plan.trim().toLowerCase() : 'free';
  const source = typeof u.planSource === 'string' ? u.planSource : null;
  const grants = [];
  let paidExpired = false;

  // Stripe
  if (u.stripeSubscription && typeof u.stripeSubscription === 'object') {
    const g = stripeGrant(u.stripeSubscription, now);
    if (g) grants.push(g); else if (source === 'stripe' && PAID_PLANS.has(stored)) paidExpired = true;
  } else if (PAID_PLANS.has(stored) && source !== 'google_play') {
    // Legacy: piano Stripe/manuale senza stato riconciliato → come prima (nessuna scadenza).
    grants.push({ plan: stored, source, expiresAt: null });
  }

  // Google Play: scadenza registrata (planExpiresAt per il piano corrente Play, oppure
  // googlePlaySubscription.expiresAt se un altro provider ha scritto plan/planSource).
  const gp = u.googlePlaySubscription && typeof u.googlePlaySubscription === 'object' ? u.googlePlaySubscription : null;
  let playPlan = null, playExp = null;
  if (source === 'google_play' && PAID_PLANS.has(stored)) { playPlan = stored; playExp = toMillis(u.planExpiresAt); if (playExp === null && gp) playExp = toMillis(gp.expiresAt); }
  else if (gp && PLAY_SKU_PLAN[gp.sku]) { playPlan = PLAY_SKU_PLAN[gp.sku]; playExp = toMillis(gp.expiresAt); if (playExp === null) playPlan = null; }
  if (playPlan) {
    // Se la scadenza manca (vecchi documenti) non se ne inventa una.
    if (playExp === null || playExp > now) grants.push({ plan: playPlan, source: 'google_play', expiresAt: playExp });
    else if (source === 'google_play') paidExpired = true;
  }

  let best = null;
  for (const g of grants) {
    if (!best || RANK[g.plan] > RANK[best.plan] || (RANK[g.plan] === RANK[best.plan] && g.source === source && best.source !== source)) best = g;
  }
  let plan = best ? best.plan : 'free';
  if (best) paidExpired = false;

  const trialExpiresAt = toMillis(u.trialExpiresAt);
  let trial = false;
  if (plan === 'free' && PAID_PLANS.has(u.trialPlan) && trialExpiresAt !== null && trialExpiresAt > now) {
    plan = u.trialPlan;
    trial = true;
  }
  return { plan, source: best ? best.source : source, expiresAt: best ? best.expiresAt : (paidExpired ? toMillis(u.planExpiresAt) : null), paidExpired, trial, trialExpiresAt, pastDue: !!(best && best.pastDue) };
}

module.exports = { PAID_PLANS, toMillis, effectivePlan, stripeGrant, STRIPE_ENTITLED, STRIPE_PAST_DUE_GRACE_MS, PLAY_SKU_PLAN, RANK };
