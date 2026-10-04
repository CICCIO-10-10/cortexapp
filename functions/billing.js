'use strict';
/**
 * Pagamenti — riconciliazione dei provider (audit 2026-10, fase 4).
 *
 * Principio: un evento (webhook Stripe, notifica Play) è solo un SEGNALE. Lo stato vero
 * si rilegge dal provider e si salva per esteso (stripeSubscription / googlePlaySubscription);
 * plan/planSource restano un riassunto calcolato da entitlements.effectivePlan, che decide
 * per i gate. Così eventi ripetuti, fuori ordine o persi non lasciano uno stato sbagliato:
 * il prossimo segnale (o la riconciliazione giornaliera) riallinea tutto.
 *
 * Nessuna chiamata di rete qui dentro: Stripe/Play/Firestore arrivano come dipendenze.
 */
const entitlements = require('./entitlements');
const { PLAN_METADATA } = require('./stripeBilling');

const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const EVENT_MARKER_TTL_MS = 35 * 86400e3;
const STRIPE_SUB_EVENTS = new Set([
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed',
  'invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed',
]);

const idOf = v => (typeof v === 'string' ? v : (v && typeof v.id === 'string' ? v.id : null));
const secToMs = v => (Number.isFinite(v) ? v * 1000 : null);

/** Mappa prezzo Stripe → piano, dalle stesse variabili usate dal checkout. */
function priceMapFromEnv(env) {
  const m = {};
  const add = (id, plan, cycle) => { if (typeof id === 'string' && id) m[id] = { plan, cycle }; };
  add(env.STRIPE_PRICE_STUDENT, 'student', 'monthly');
  add(env.STRIPE_PRICE_STUDENT_YEARLY, 'student', 'yearly');
  add(env.STRIPE_PRICE_PRO, 'pro', 'monthly');
  return m;
}

/** Riassunto di un abbonamento Stripe (API vecchie e nuove: il periodo può stare sugli item). */
function summarizeStripeSubscription(sub, priceMap) {
  const s = sub && typeof sub === 'object' ? sub : {};
  const items = (s.items && Array.isArray(s.items.data)) ? s.items.data : [];
  let mapped = null;
  for (const it of items) { const pid = idOf(it && it.price); if (pid && priceMap[pid]) { mapped = priceMap[pid]; break; } }
  if (!mapped) {
    const meta = s.metadata && typeof s.metadata === 'object' ? s.metadata : {};
    if (Object.hasOwn(PLAN_METADATA, meta.plan || '')) mapped = PLAN_METADATA[meta.plan];
  }
  const periodEnd = secToMs(s.current_period_end) ?? (items.length ? secToMs(items[0] && items[0].current_period_end) : null);
  return {
    id: idOf(s), customerId: idOf(s.customer), status: typeof s.status === 'string' ? s.status : 'unknown',
    plan: mapped ? mapped.plan : null, cycle: mapped ? mapped.cycle : null, periodEnd,
    cancelAtPeriodEnd: !!s.cancel_at_period_end, created: secToMs(s.created),
    uidHint: (s.metadata && typeof s.metadata.uid === 'string' && UID_RE.test(s.metadata.uid)) ? s.metadata.uid : null,
  };
}

/**
 * Un abbonamento diverso da quello salvato sostituisce il salvato solo se dà diritti e il
 * salvato no, oppure se è più recente e dà diritti. Un vecchio abbonamento annullato non
 * può togliere il piano a quello nuovo (eventi fuori ordine o abbonamenti precedenti).
 */
function shouldAdoptStripe(current, incoming, now) {
  if (!current || !current.id || current.id === incoming.id) return true;
  const inc = entitlements.stripeGrant(incoming, now), cur = entitlements.stripeGrant(current, now);
  if (!inc) return false;
  if (!cur) return true;
  return (incoming.created || 0) > (current.created || 0);
}

/** Campi riassuntivi (plan, planSource, planCycle) coerenti con effectivePlan. */
function summaryFields(data, now, FieldValue) {
  const ep = entitlements.effectivePlan(data, now);
  const paid = ep.trial ? 'free' : ep.plan;
  const out = {};
  if ((data.plan || 'free') !== paid) out.plan = paid;
  if (paid !== 'free' && ep.source && data.planSource !== ep.source) out.planSource = ep.source;
  if (paid !== 'free' && ep.source === 'stripe' && data.stripeSubscription && data.stripeSubscription.cycle && data.planCycle !== data.stripeSubscription.cycle) out.planCycle = data.stripeSubscription.cycle;
  const wasPaid = entitlements.PAID_PLANS.has(String(data.plan || '').toLowerCase());
  if (wasPaid && paid === 'free') {
    Object.assign(out, { planCycle: null, winbackEligible: true, winbackShownAt: null, canceledAt: FieldValue.serverTimestamp() });
  }
  if (Object.keys(out).length) out.planUpdatedAt = FieldValue.serverTimestamp();
  return out;
}

/** Salva lo stato Stripe riletto e ricalcola il riassunto, in transazione. */
async function applyStripeSubscription({ db, admin, uid, summary, now = Date.now() }) {
  const FieldValue = admin.firestore.FieldValue;
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async tx => {
    const [snap, lock] = await Promise.all([tx.get(userRef), tx.get(db.collection('_deletionLocks').doc(uid))]);
    // Account in cancellazione o già cancellato: non si ricrea il documento utente.
    if (lock.exists) return { applied: false, reason: 'account_deleting' };
    if (!snap.exists) return { applied: false, reason: 'no_user' };
    const data = snap.data();
    if (!shouldAdoptStripe(data.stripeSubscription, summary, now)) return { applied: false, reason: 'older_subscription' };
    const rec = { id: summary.id, status: summary.status, plan: summary.plan, cycle: summary.cycle, periodEnd: summary.periodEnd, cancelAtPeriodEnd: summary.cancelAtPeriodEnd, created: summary.created, syncedAt: now };
    const next = { ...data, stripeSubscription: rec };
    const fields = summaryFields(next, now, FieldValue);
    if (fields.canceledAt && !['canceled', 'incomplete_expired'].includes(summary.status)) fields.cancelReason = 'payment_failed';
    tx.set(userRef, { stripeSubscription: rec, stripeSubscriptionId: summary.id, ...(summary.customerId ? { stripeCustomerId: summary.customerId } : {}), ...fields }, { merge: true });
    if (summary.customerId) tx.set(db.collection('stripeCustomers').doc(summary.customerId), { uid }, { merge: true });
    return { applied: true, plan: entitlements.effectivePlan({ ...next, ...fields }, now).plan };
  });
}

/** uid dell'abbonamento: mapping cliente → metadata abbonamento → metadata cliente. */
async function resolveStripeUid({ db, stripe, summary, hint }) {
  if (hint && UID_RE.test(hint)) return hint;
  if (summary.customerId) {
    const m = await db.collection('stripeCustomers').doc(summary.customerId).get();
    if (m.exists && UID_RE.test(String(m.data().uid || ''))) return m.data().uid;
  }
  if (summary.uidHint) return summary.uidHint;
  if (summary.customerId && stripe) {
    const c = await stripe.customers.retrieve(summary.customerId);
    const uid = c && !c.deleted && c.metadata && c.metadata.uid;
    if (typeof uid === 'string' && UID_RE.test(uid)) return uid;
  }
  return null;
}

function subscriptionIdFromEvent(event) {
  const o = (event && event.data && event.data.object) || {};
  if (String(event.type).startsWith('customer.subscription.')) return idOf(o);
  if (String(event.type).startsWith('invoice.')) {
    return idOf(o.subscription) || idOf(o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription)
      || idOf(((o.lines && o.lines.data) || []).map(l => l && l.parent && l.parent.subscription_item_details && l.parent.subscription_item_details.subscription).find(Boolean));
  }
  if (event.type === 'checkout.session.completed') return idOf(o.subscription);
  return null;
}

/**
 * Gestisce un evento del webhook abbonamenti già verificato (firma).
 * @returns {Promise<{status:string, reason?:string, uid?:string, plan?:string}>}
 * Lancia se Stripe/Firestore non rispondono: il webhook risponde 500 e Stripe riprova.
 */
async function handleStripeEvent({ db, admin, stripe, event, priceMap, now = Date.now(), checkoutGrant }) {
  if (!event || typeof event.id !== 'string') return { status: 'ignored', reason: 'invalid_event' };
  const markerRef = db.collection('_stripeEvents').doc(event.id);
  if ((await markerRef.get()).exists) return { status: 'duplicate' };

  let result;
  let subId = null, uidHint = null;
  if (event.type === 'checkout.session.completed') {
    const grant = checkoutGrant(event.data.object);
    if (!grant.grant) result = { status: 'ignored', reason: grant.reason };
    else { subId = grant.subscriptionId; uidHint = grant.uid; if (grant.customerId) await db.collection('stripeCustomers').doc(grant.customerId).set({ uid: grant.uid }, { merge: true }); }
  } else if (STRIPE_SUB_EVENTS.has(event.type)) {
    subId = subscriptionIdFromEvent(event);
    if (!subId) result = { status: 'ignored', reason: 'no_subscription' };
  } else {
    result = { status: 'ignored', reason: 'event_type' };
  }

  if (!result) {
    // Lo stato si rilegge sempre da Stripe: l'ordine degli eventi non conta.
    const sub = await stripe.subscriptions.retrieve(subId);
    const summary = summarizeStripeSubscription(sub, priceMap);
    const uid = await resolveStripeUid({ db, stripe, summary, hint: uidHint });
    if (!uid) result = { status: 'ignored', reason: 'unknown_customer' };
    else if (!summary.plan) result = { status: 'ignored', reason: 'unknown_price', uid };
    else {
      const r = await applyStripeSubscription({ db, admin, uid, summary, now });
      result = r.applied ? { status: 'applied', uid, plan: r.plan } : { status: 'ignored', reason: r.reason, uid };
    }
  }
  await markerRef.set({ type: String(event.type).slice(0, 60), status: result.status, reason: result.reason || null, processedAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: new Date(now + EVENT_MARKER_TTL_MS) });
  return result;
}

// ── Google Play ──────────────────────────────────────────────────────────────

/**
 * Salva lo stato Play riletto per un abbonamento già attribuito (ricevuta) e ricalcola il
 * riassunto. Gestisce rinnovo, scadenza, sospensione (on hold/pausa), revoca/rimborso:
 * senza diritto la scadenza registrata diventa "adesso", così i gate lo vedono subito.
 * Un token diverso da quello salvato lo sostituisce solo se dà diritto (nuovo acquisto/upgrade).
 */
async function applyPlayState({ db, admin, uid, sku, purchaseToken, purchase, now = Date.now() }) {
  const FieldValue = admin.firestore.FieldValue, Timestamp = admin.firestore.Timestamp;
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async tx => {
    const [snap, lock] = await Promise.all([tx.get(userRef), tx.get(db.collection('_deletionLocks').doc(uid))]);
    if (lock.exists) return { applied: false, reason: 'account_deleting' };
    if (!snap.exists) return { applied: false, reason: 'no_user' };
    const data = snap.data();
    const cur = data.googlePlaySubscription || null;
    if (cur && cur.purchaseToken && cur.purchaseToken !== purchaseToken && !purchase.entitled) return { applied: false, reason: 'other_token' };
    const expiry = purchase.entitled ? purchase.expiryMs : Math.min(Number.isFinite(purchase.expiryMs) ? purchase.expiryMs : now, now);
    const rec = { ...(cur && cur.purchaseToken === purchaseToken ? cur : {}), sku, purchaseToken, expiresAt: Timestamp.fromMillis(expiry), orderId: purchase.orderId || (cur && cur.orderId) || '', autoRenewing: !!purchase.autoRenewing, state: purchase.state || '', syncedAt: now };
    const playPlan = entitlements.PLAY_SKU_PLAN[sku];
    const next = { ...data, googlePlaySubscription: rec };
    const write = { googlePlaySubscription: rec };
    // planExpiresAt segue il piano Play corrente (se il riassunto è Play o lo diventa).
    if (data.planSource === 'google_play' || purchase.entitled) { next.planExpiresAt = Timestamp.fromMillis(expiry); write.planExpiresAt = next.planExpiresAt; }
    if (purchase.entitled && playPlan && (!entitlements.PAID_PLANS.has(String(data.plan || '')) || data.planSource === 'google_play')) { next.plan = playPlan; next.planSource = 'google_play'; write.plan = playPlan; write.planSource = 'google_play'; }
    const fields = summaryFields(next, now, FieldValue);
    if (fields.canceledAt) fields.cancelReason = 'play_' + String(purchase.state || 'inactive').replace('SUBSCRIPTION_STATE_', '').toLowerCase();
    tx.set(userRef, { ...write, ...fields }, { merge: true });
    return { applied: true, plan: entitlements.effectivePlan({ ...next, ...fields }, now).plan };
  });
}

/** Tipi di notifica Play (RTDN) — solo per i log e i test. */
const PLAY_SUB_NOTIFICATION = Object.freeze({ 1: 'RECOVERED', 2: 'RENEWED', 3: 'CANCELED', 4: 'PURCHASED', 5: 'ON_HOLD', 6: 'IN_GRACE_PERIOD', 7: 'RESTARTED', 8: 'PRICE_CHANGE_CONFIRMED', 9: 'DEFERRED', 10: 'PAUSED', 11: 'PAUSE_SCHEDULE_CHANGED', 12: 'REVOKED', 13: 'EXPIRED', 20: 'PENDING_PURCHASE_CANCELED' });

/**
 * Notifica RTDN (messaggio Pub/Sub già decodificato). Il contenuto della notifica non basta
 * a decidere: si rilegge l'acquisto su Play. Solo ricevute già attribuite a un account
 * (l'attribuzione resta a verifyGooglePlayPurchase, chiamato dall'app dopo l'acquisto).
 */
async function handlePlayNotification({ db, admin, security, readPurchase, msg, packageName, now = Date.now() }) {
  if (!msg || typeof msg !== 'object') return { status: 'ignored', reason: 'invalid' };
  if (msg.testNotification) return { status: 'test' };
  if (msg.packageName && msg.packageName !== packageName) return { status: 'ignored', reason: 'package' };
  const sn = msg.subscriptionNotification, vn = msg.voidedPurchaseNotification;
  const token = (sn && sn.purchaseToken) || (vn && vn.purchaseToken) || null;
  if (typeof token !== 'string' || !token || token.length > 4096) return { status: 'ignored', reason: 'no_token' };
  const receiptRef = db.collection('_purchaseReceipts').doc(security.hash(token));
  const receipt = await receiptRef.get();
  if (!receipt.exists) return { status: 'ignored', reason: 'unclaimed_receipt', type: sn ? PLAY_SUB_NOTIFICATION[sn.notificationType] : 'VOIDED' };
  const { uid, sku } = receipt.data();
  const product = security.PRODUCTS[sku];
  if (!product || typeof uid !== 'string') return { status: 'ignored', reason: 'receipt' };

  if (product.plan) {
    const purchase = await readPurchase(sku, token);
    const r = await applyPlayState({ db, admin, uid, sku, purchaseToken: token, purchase, now });
    return { status: r.applied ? 'applied' : 'ignored', reason: r.reason, uid, plan: r.plan, type: sn ? PLAY_SUB_NOTIFICATION[sn.notificationType] : 'VOIDED' };
  }
  // Sparks rimborsati/annullati (voided): si tolgono i crediti una sola volta, senza andare sotto zero.
  if (vn && product.sparks) {
    const userRef = db.collection('users').doc(uid);
    const removed = await db.runTransaction(async tx => {
      const r = await tx.get(receiptRef), u = await tx.get(userRef);
      if (r.exists && r.data().voided) return null;
      const bal = Math.max(0, Number((u.exists && u.data().sparksBalance) || 0));
      const take = Math.min(bal, product.sparks);
      tx.set(receiptRef, { voided: true, voidedAt: admin.firestore.FieldValue.serverTimestamp(), sparksRemoved: take }, { merge: true });
      if (take > 0) tx.set(userRef, { sparksBalance: admin.firestore.FieldValue.increment(-take) }, { merge: true });
      return take;
    });
    return { status: removed === null ? 'duplicate' : 'applied', uid, sparksRemoved: removed || 0, type: 'VOIDED' };
  }
  return { status: 'ignored', reason: 'product_notification' };
}

module.exports = {
  priceMapFromEnv, summarizeStripeSubscription, shouldAdoptStripe, applyStripeSubscription, resolveStripeUid,
  subscriptionIdFromEvent, handleStripeEvent, applyPlayState, handlePlayNotification, summaryFields,
  STRIPE_SUB_EVENTS, PLAY_SUB_NOTIFICATION,
};
