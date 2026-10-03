'use strict';
/**
 * Stripe — filtro dei checkout completati (audit 2026-10, fase 1.3).
 * Il webhook abbonamenti riceve TUTTI i checkout.session.completed dell'account
 * Stripe, compresi quelli degli Sparks (pagamento una tantum): prima ogni checkout
 * diventava plan 'student' senza scadenza. Ora si concede un piano solo a una
 * sessione di abbonamento coerente. Riconciliazione completa → fase 4.
 */
const PLAN_METADATA = Object.freeze({
  student: { plan: 'student', cycle: 'monthly' },
  student_monthly: { plan: 'student', cycle: 'monthly' },
  student_yearly: { plan: 'student', cycle: 'yearly' },
  pro: { plan: 'pro', cycle: 'monthly' },
});
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** @returns {{grant:true, uid, plan, cycle, customerId, subscriptionId} | {grant:false, reason:string}} */
function subscriptionCheckoutGrant(session) {
  const s = session && typeof session === 'object' ? session : {};
  const meta = s.metadata && typeof s.metadata === 'object' ? s.metadata : {};
  if (s.mode !== 'subscription') return { grant: false, reason: 'not_subscription_mode' };
  if (meta.type === 'sparks') return { grant: false, reason: 'sparks_checkout' };
  if (s.status && s.status !== 'complete') return { grant: false, reason: 'not_complete' };
  if (s.payment_status && !['paid', 'no_payment_required'].includes(s.payment_status)) return { grant: false, reason: 'not_paid' };
  if (typeof meta.uid !== 'string' || !UID_RE.test(meta.uid)) return { grant: false, reason: 'invalid_uid' };
  const mapped = Object.hasOwn(PLAN_METADATA, meta.plan || '') ? PLAN_METADATA[meta.plan] : null;
  if (!mapped) return { grant: false, reason: 'invalid_plan' };
  const customerId = typeof s.customer === 'string' ? s.customer : (s.customer && s.customer.id) || null;
  const subscriptionId = typeof s.subscription === 'string' ? s.subscription : (s.subscription && s.subscription.id) || null;
  if (!customerId) return { grant: false, reason: 'missing_customer' };
  if (!subscriptionId) return { grant: false, reason: 'missing_subscription' };
  return { grant: true, uid: meta.uid, plan: mapped.plan, cycle: mapped.cycle, customerId, subscriptionId };
}

module.exports = { subscriptionCheckoutGrant, PLAN_METADATA };
