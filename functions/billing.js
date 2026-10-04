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

const ENTITLING_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** Abbonamento "di riferimento" salvato (anche per documenti precedenti alla fase 4). */
function currentStripeRef(data, now, fresh = {}) {
  if (data.stripeSubscription && data.stripeSubscription.id) {
    // Se Stripe ha appena restituito anche l'abbonamento salvato, vale il suo stato attuale.
    const f = fresh[data.stripeSubscription.id];
    const rec = f ? { ...data.stripeSubscription, status: f.status } : data.stripeSubscription;
    return { rec, entitled: !!entitlements.stripeGrant(rec, now) };
  }
  if (typeof data.stripeSubscriptionId === 'string' && data.stripeSubscriptionId) {
    const legacyPaid = entitlements.PAID_PLANS.has(String(data.plan || '').toLowerCase()) && data.planSource !== 'google_play';
    return { rec: { id: data.stripeSubscriptionId, created: 0, plan: legacyPaid ? String(data.plan).toLowerCase() : null }, entitled: legacyPaid };
  }
  return null;
}

/**
 * Un abbonamento diverso da quello salvato lo sostituisce solo se dà diritti e il salvato no,
 * oppure se è più recente e dà diritti. Un vecchio abbonamento annullato non può togliere il
 * piano a quello nuovo (eventi fuori ordine o abbonamenti precedenti).
 */
function shouldAdoptStripe(cur, incoming, now) {
  if (!cur || !cur.rec.id || cur.rec.id === incoming.id) return true;
  if (!entitlements.stripeGrant(incoming, now)) return false;
  if (!cur.entitled) return true;
  return (incoming.created || 0) > (cur.rec.created || 0);
}

function cancelReasonFor(status) {
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  if (status === 'unpaid' || status === 'past_due') return 'payment_failed';
  return String(status || 'inactive').slice(0, 40);
}

/** Campi riassuntivi (plan, planSource, planCycle, win-back) coerenti con effectivePlan. */
function summaryFields(data, now, FieldValue, reason) {
  const ep = entitlements.effectivePlan(data, now);
  const paid = ep.trial ? 'free' : ep.plan;
  const out = {};
  if ((data.plan || 'free') !== paid) out.plan = paid;
  if (paid !== 'free' && ep.source && data.planSource !== ep.source) out.planSource = ep.source;
  if (paid !== 'free' && ep.source === 'stripe' && data.stripeSubscription && data.stripeSubscription.cycle && data.planCycle !== data.stripeSubscription.cycle) out.planCycle = data.stripeSubscription.cycle;
  const wasPaid = entitlements.PAID_PLANS.has(String(data.plan || '').toLowerCase());
  if (wasPaid && paid === 'free') {
    Object.assign(out, { planCycle: null, winbackEligible: true, canceledAt: FieldValue.serverTimestamp(), cancelReason: reason || 'inactive' });
    if (data.winbackEligible !== true) out.winbackShownAt = null;   // banner una volta per interruzione, non a ogni ciclo
  }
  if (!wasPaid && paid !== 'free' && (data.winbackEligible || data.canceledAt || data.cancelReason)) {
    Object.assign(out, { winbackEligible: false, canceledAt: null, cancelReason: null });   // accesso tornato (pagamento recuperato)
  }
  if (Object.keys(out).length) out.planUpdatedAt = FieldValue.serverTimestamp();
  return out;
}

/** Salva lo stato Stripe riletto e ricalcola il riassunto, in transazione. */
async function applyStripeSubscription({ db, admin, uid, summary, now = Date.now(), duplicates = [], fresh = {} }) {
  const FieldValue = admin.firestore.FieldValue;
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async tx => {
    const [snap, lock] = await Promise.all([tx.get(userRef), tx.get(db.collection('_deletionLocks').doc(uid))]);
    // Account in cancellazione o già cancellato: non si ricrea il documento utente.
    if (lock.exists) return { applied: false, reason: 'account_deleting' };
    if (!snap.exists) return { applied: false, reason: 'no_user' };
    const data = snap.data();
    const cur = currentStripeRef(data, now, fresh);
    const same = !!(cur && cur.rec.id === summary.id);
    // Prezzo non riconosciuto (es. un prezzo vecchio non più nelle variabili): per l'abbonamento
    // già noto si tiene il piano salvato; uno stato senza diritti si registra comunque (disdetta).
    const plan = summary.plan || (same ? cur.rec.plan : null);
    if (!plan && ENTITLING_STATUSES.has(summary.status)) return { applied: false, reason: 'unknown_price' };
    const incoming = { ...summary, plan };
    if (!shouldAdoptStripe(cur, incoming, now)) return { applied: false, reason: 'older_subscription' };
    const prevPastDue = same && cur.rec.pastDueSince ? cur.rec.pastDueSince : null;
    const rec = { id: summary.id, status: summary.status, plan, cycle: summary.cycle || (same ? cur.rec.cycle || null : null), periodEnd: summary.periodEnd, cancelAtPeriodEnd: summary.cancelAtPeriodEnd, created: summary.created,
      pastDueSince: summary.status === 'past_due' ? (prevPastDue || now) : null, syncedAt: now };
    const next = { ...data, stripeSubscription: rec };
    const fields = summaryFields(next, now, FieldValue, cancelReasonFor(summary.status));
    const extra = duplicates.length ? { stripeDuplicateSubscriptions: duplicates.slice(0, 5) } : (data.stripeDuplicateSubscriptions ? { stripeDuplicateSubscriptions: FieldValue.delete() } : {});
    tx.set(userRef, { stripeSubscription: rec, stripeSubscriptionId: summary.id, ...(summary.customerId ? { stripeCustomerId: summary.customerId } : {}), ...fields, ...extra }, { merge: true });
    if (summary.customerId) tx.set(db.collection('stripeCustomers').doc(summary.customerId), { uid }, { merge: true });
    return { applied: true, plan: entitlements.effectivePlan({ ...next, ...fields }, now).plan };
  });
}

/**
 * Tutti gli abbonamenti del cliente: si sceglie quello che dà il piano più alto (a parità il più
 * recente). Se più di uno dà diritti è un doppio abbonamento: si segnala per una verifica a mano
 * (nessuna disdetta o rimborso automatico).
 */
async function bestCustomerSubscription({ stripe, eventSub, priceMap, now }) {
  const base = summarizeStripeSubscription(eventSub, priceMap);
  let all = [base];
  if (base.customerId && stripe.subscriptions.list) {
    const page = await stripe.subscriptions.list({ customer: base.customerId, status: 'all', limit: 20 });
    const listed = ((page && page.data) || []).map(s => summarizeStripeSubscription(s, priceMap));
    all = listed.some(x => x.id === base.id) ? listed.map(x => (x.id === base.id ? base : x)) : [base, ...listed];
  }
  const entitled = all.filter(x => x.plan && ENTITLING_STATUSES.has(x.status))
    .sort((a, b) => (entitlements.RANK[b.plan] - entitlements.RANK[a.plan]) || ((b.created || 0) - (a.created || 0)));
  const best = entitled[0] || base;
  return { summary: best, duplicates: entitled.length > 1 ? entitled.map(x => x.id) : [], fresh: Object.fromEntries(all.map(x => [x.id, x])) };
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

const isMissing = err => !!err && (err.code === 'resource_missing' || err.statusCode === 404);

/** Rilegge da Stripe e applica per un utente (webhook e riconciliazione giornaliera). */
async function reconcileStripe({ db, admin, stripe, subId, uidHint, priceMap, now }) {
  const sub = await stripe.subscriptions.retrieve(subId);
  const { summary, duplicates, fresh } = await bestCustomerSubscription({ stripe, eventSub: sub, priceMap, now });
  const uid = await resolveStripeUid({ db, stripe, summary, hint: uidHint });
  if (!uid) return { status: 'ignored', reason: 'unknown_customer' };
  const r = await applyStripeSubscription({ db, admin, uid, summary, now, duplicates, fresh });
  if (duplicates.length) console.error('[Billing] più abbonamenti Stripe attivi per lo stesso utente: verifica a mano', uid.slice(0, 6), duplicates.join(','));
  if (!r.applied && r.reason === 'account_deleting' && ENTITLING_STATUSES.has(summary.status)) {
    // Pagato dopo la cancellazione dell'account: segnalato per la disdetta/il rimborso a mano.
    await db.collection('_billingAlerts').doc('deleted_' + summary.id).set({ type: 'active_subscription_on_deleted_account', subscriptionId: summary.id, customerId: summary.customerId || null, at: now }, { merge: true });
    console.error('[Billing] abbonamento attivo su account cancellato:', summary.id);
  }
  return r.applied ? { status: 'applied', uid, plan: r.plan, duplicates } : { status: 'ignored', reason: r.reason, uid };
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
    else { subId = grant.subscriptionId; uidHint = grant.uid; }
  } else if (STRIPE_SUB_EVENTS.has(event.type)) {
    subId = subscriptionIdFromEvent(event);
    if (!subId) result = { status: 'ignored', reason: 'no_subscription' };
  } else {
    result = { status: 'ignored', reason: 'event_type' };
  }

  if (!result) {
    // Lo stato si rilegge sempre da Stripe: l'ordine degli eventi non conta.
    try { result = await reconcileStripe({ db, admin, stripe, subId, uidHint, priceMap, now }); }
    catch (err) { if (isMissing(err)) result = { status: 'ignored', reason: 'subscription_missing' }; else throw err; }
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
    const fields = summaryFields(next, now, FieldValue, 'play_' + String(purchase.state || 'inactive').replace('SUBSCRIPTION_STATE_', '').toLowerCase());
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
async function handlePlayNotification({ db, admin, security, readPurchase, acknowledge = null, msg, packageName, now = Date.now() }) {
  if (!msg || typeof msg !== 'object') return { status: 'ignored', reason: 'invalid' };
  if (msg.testNotification) return { status: 'test' };
  if (msg.packageName && msg.packageName !== packageName) return { status: 'ignored', reason: 'package' };
  const sn = msg.subscriptionNotification, vn = msg.voidedPurchaseNotification;
  const token = (sn && sn.purchaseToken) || (vn && vn.purchaseToken) || null;
  if (typeof token !== 'string' || !token || token.length > 4096) return { status: 'ignored', reason: 'no_token' };
  const receiptRef = db.collection('_purchaseReceipts').doc(security.hash(token));
  const receipt = await receiptRef.get();
  if (!receipt.exists) {
    // Upgrade/riattivazione: Play crea un token nuovo collegato al vecchio (linkedPurchaseToken).
    // Se il vecchio è attribuito a un account, il nuovo passa allo stesso account; altrimenti
    // l'attribuzione resta a verifyGooglePlayPurchase (chiamato dall'app dopo l'acquisto).
    const sku0 = sn && sn.subscriptionId;
    if (sku0 && security.PRODUCTS[sku0] && security.PRODUCTS[sku0].plan) {
      const purchase = await readPurchase(sku0, token);
      // Il prodotto deve coincidere con quello restituito da Play (non solo con la notifica).
      const linked = purchase && purchase.productMatches && purchase.entitled && purchase.linkedPurchaseToken;
      const lr = linked ? await db.collection('_purchaseReceipts').doc(security.hash(linked)).get() : null;
      if (lr && lr.exists && typeof lr.data().uid === 'string') {
        const uid = lr.data().uid;
        const claimed = await db.runTransaction(async tx => {
          const r = await tx.get(receiptRef);
          if (r.exists && r.data().uid !== uid) return false;
          if (!r.exists) tx.set(receiptRef, { uid, sku: sku0, linkedFrom: security.hash(linked), ackState: purchase.acknowledged ? 'acknowledged' : 'pending', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          return true;
        });
        if (!claimed) return { status: 'ignored', reason: 'receipt' };
        const r = await applyPlayState({ db, admin, uid, sku: sku0, purchaseToken: token, purchase, now });
        // Senza conferma entro 3 giorni Google rimborsa e revoca: si conferma qui (ripetibile).
        if (!purchase.acknowledged && acknowledge) await acknowledge(sku0, token);
        return { status: r.applied ? 'applied' : 'ignored', reason: r.reason, uid, plan: r.plan, type: PLAY_SUB_NOTIFICATION[sn.notificationType], linked: true };
      }
    }
    return { status: 'ignored', reason: 'unclaimed_receipt', type: sn ? PLAY_SUB_NOTIFICATION[sn.notificationType] : 'VOIDED' };
  }
  const { uid, sku } = receipt.data();
  const product = security.PRODUCTS[sku];
  if (!product || typeof uid !== 'string') return { status: 'ignored', reason: 'receipt' };

  if (product.plan) {
    const purchase = await readPurchase(sku, token);
    const r = await applyPlayState({ db, admin, uid, sku, purchaseToken: token, purchase, now });
    if (purchase.entitled && !purchase.acknowledged && acknowledge) await acknowledge(sku, token);
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
  subscriptionIdFromEvent, handleStripeEvent, reconcileStripe, bestCustomerSubscription, isMissing, applyPlayState, handlePlayNotification, summaryFields,
  STRIPE_SUB_EVENTS, PLAY_SUB_NOTIFICATION,
};
