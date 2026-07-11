/**
 * functions/index.js
 * Cortex Gemini Proxy with Rate Limiting
 *
 * Config: usa process.env (da functions/.env) invece di functions.config() deprecato.
 * Le variabili sensibili (STRIPE_SECRET, GEMINI_KEY) vanno nel file .env (gitignored).
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { google } = require("googleapis");

admin.initializeApp();

const db = admin.firestore();

// ─── IP Rate Limiting (in-memory, per istanza Cloud Function) ─────────────────
// Protegge da abuse / DDoS su endpoint HTTP pubblici (webhook, ecc.).
// Per onCall autenticati il rate limiting per utente è già in Firestore.
const _ipBuckets = new Map();

function ipRateLimit(ip, { maxRequests = 20, windowMs = 60 * 1000 } = {}) {
  const now = Date.now();
  const bucket = _ipBuckets.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + windowMs; }
  bucket.count++;
  _ipBuckets.set(ip, bucket);
  // Pulizia: rimuovi IP con finestra scaduta
  if (_ipBuckets.size > 500) {
    for (const [key, val] of _ipBuckets) {
      if (now > val.resetAt) _ipBuckets.delete(key);
    }
  }
  return bucket.count <= maxRequests;
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
}

// Stripe: lazy init per accedere a process.env solo a runtime
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    const secret = process.env.STRIPE_SECRET;
    if (!secret) throw new Error('STRIPE_SECRET non configurata in .env');
    _stripe = require('stripe')(secret);
  }
  return _stripe;
}

/**
 * Cloud Function to proxy Gemini API calls.
 * Enforces a rate limit of 20 calls per hour per user.
 * 
 * callGeminiProxy({ model: string, contents: object, generationConfig: object })
 */
exports.callGeminiHttp = functions.https.onRequest(async (req, res) => {
  // ── CORS: accetta da cortexapp.it e cortex-app.web.app ──────────────────────
  const allowedOrigins = ['https://cortexapp.it', 'https://cortex-74a4e.web.app', 'https://cortex-74a4e.firebaseapp.com'];
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', 'https://cortexapp.it');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // IP Rate Limiting
  const ip = getClientIp(req);
  if (!ipRateLimit(ip, { maxRequests: 30, windowMs: 60 * 1000 })) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  // ── Auth: verifica Firebase ID Token ────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    res.status(401).json({ error: 'Unauthorized: missing token' });
    return;
  }
  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    res.status(401).json({ error: 'Unauthorized: invalid token' });
    return;
  }

  // ── Input validation ─────────────────────────────────────────────────────────
  const { model: modelName, contents, generationConfig } = req.body || {};
  if (!modelName || typeof modelName !== 'string' || modelName.length > 100) {
    res.status(400).json({ error: 'Parametro model non valido' });
    return;
  }
  if (!contents || typeof contents !== 'object') {
    res.status(400).json({ error: 'Parametro contents non valido' });
    return;
  }
  if (JSON.stringify(req.body).length > 50000) {
    res.status(400).json({ error: 'Payload troppo grande' });
    return;
  }

  // ── Rate Limiting / Quota Firestore (non-fatal) ──────────────────────────────
  // Admin bypass: nessun limite per l'account amministratore
  const isAdmin = uid === 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2';

  const userRef = db.collection("users").doc(uid);
  const today = new Date().toISOString().split('T')[0];
  const usageRef = db.collection("usage").doc(uid).collection("daily").doc(today);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 35);

  if (!isAdmin) try {
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const userData = userDoc.exists ? userDoc.data() : {};
      let plan = userData.plan || "free";
      if (plan === 'free' && userData.trialPlan && userData.trialExpiresAt) {
        if (userData.trialExpiresAt > Date.now()) plan = userData.trialPlan || 'student';
      }
      const usageDoc = await transaction.get(usageRef);
      const currentUsage = (usageDoc.exists ? usageDoc.data().calls : 0) || 0;
      const limits = { free: 25, student: 100, pro: Infinity };
      const limit = limits[plan] || limits.free;
      if (currentUsage >= limit) {
        const sparksBalance = (userDoc.exists ? userDoc.data().sparksBalance : 0) || 0;
        if (sparksBalance > 0) {
          transaction.update(userRef, { sparksBalance: admin.firestore.FieldValue.increment(-1) });
          transaction.set(usageRef, { calls: currentUsage + 1, lastUpdated: admin.firestore.FieldValue.serverTimestamp(), expiresAt }, { merge: true });
          return;
        }
        res.status(429).json({ error: 'PAYWALL_LIMIT_REACHED' });
        throw new Error('PAYWALL_SENT');
      }
      transaction.set(usageRef, { calls: currentUsage + 1, lastUpdated: admin.firestore.FieldValue.serverTimestamp(), expiresAt }, { merge: true });
    });
  } catch (err) {
    if (err.message === 'PAYWALL_SENT') return;
    console.error("Quota check error (non-fatal):", err.message || err);
  }

  // ── Gemini API Call (direct REST, no SDK) ───────────────────────────────────
  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_KEY non configurata' });
    return;
  }

  try {
    const rawConfig = generationConfig || {};
    const normalizedConfig = {};
    if (rawConfig.temperature !== undefined) normalizedConfig.temperature = rawConfig.temperature;
    if (rawConfig.maxOutputTokens !== undefined) normalizedConfig.maxOutputTokens = rawConfig.maxOutputTokens;
    const mimeType = rawConfig.responseMimeType || rawConfig.response_mime_type;
    if (mimeType) normalizedConfig.responseMimeType = mimeType;

    const normalizedContents = (contents || []).map(c => ({ role: c.role || 'user', parts: c.parts || [] }));

    // Try v1 first (stable), then v1beta fallback
    const apis = [
      `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    ];

    let text = null;
    let lastError = null;

    for (const url of apis) {
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: normalizedContents, generationConfig: normalizedConfig }),
      });
      const geminiData = await geminiRes.json();
      if (geminiRes.ok) {
        text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) break;
      } else {
        const errMsg = geminiData?.error?.message || geminiData?.error?.status || JSON.stringify(geminiData).slice(0, 200);
        lastError = `[${geminiRes.status}] ${errMsg}`;
        console.error(`Gemini ${url.includes('v1beta') ? 'v1beta' : 'v1'} error:`, lastError);
      }
    }

    if (!text) {
      throw new Error(lastError || 'Risposta vuota da Gemini');
    }

    res.status(200).json({ candidates: [{ content: { parts: [{ text }] } }] });
  } catch (err) {
    console.error("Gemini Proxy Error:", err.message);
    res.status(500).json({ error: 'Errore AI', details: (err.message || '').substring(0, 300) });
  }
});

/**
 * Sprint 5: Scheduled Reminders
 * Invia promemoria agli utenti ogni mattina alle 09:00.
 */
exports.dailyStudyReminder = functions.pubsub.schedule('0 19 * * *')
  .timeZone('Europe/Rome')
  .onRun(async (context) => {
    const usersSnap = await db.collection("users")
      .where("fcmToken", "!=", null)
      .get();

    if (usersSnap.empty) return null;

    const now = new Date();
    const messages = [];
    const staleTokenRefs = [];

    // FIX: i deck completi sono nelle sub-collection dopo la migrazione.
    // Usiamo decksMetadata (nel root doc) per il conteggio dueCount, evitando
    // di leggere ogni sub-collection (costoso in read Firestore a scala).
    // dueCount viene aggiornato da syncToCloud ogni volta che l'utente studia.
    usersSnap.docs.forEach((doc) => {
      const data = doc.data();
      const token = data.fcmToken;
      if (!token) return;

      let dueCount = 0;

      if (data.migratedToSubcollections && Array.isArray(data.decksMetadata)) {
        // Usa il dueCount pre-calcolato nei metadati (evita reads extra)
        dueCount = data.decksMetadata.reduce((sum, d) => sum + (d.dueCount || 0), 0);
      } else {
        // Fallback legacy: calcola dai deck completi nel root doc
        const decks = data.decks || [];
        dueCount = decks.reduce((sum, deck) => {
          const due = (deck.cards || []).filter(
            card => card.nextReview && new Date(card.nextReview) <= now
          ).length;
          return sum + (due > 0 ? 1 : 0); // conta i mazzi con almeno una card da ripassare
        }, 0);
      }

      if (dueCount > 0) {
        messages.push({
          _ref: doc.ref,
          token,
          notification: {
            title: '🧠 È ora di ripassare!',
            body: `Hai ${dueCount} ${dueCount === 1 ? 'mazzo' : 'mazzi'} pronti oggi. Mantieni il tuo streak!`
          },
          android: { notification: { icon: 'https://cortexapp.it/pwa-192x192.png', color: '#8b5cf6' } },
          webpush: { notification: { icon: 'https://cortexapp.it/pwa-192x192.png', badge: 'https://cortexapp.it/pwa-192x192.png' } }
        });
      }
    });

    if (messages.length === 0) return null;

    // sendEach: batch più efficiente, gestisce errori per token
    const fcmMessages = messages.map(m => ({ token: m.token, notification: m.notification, android: m.android, webpush: m.webpush }));
    const batchResponse = await admin.messaging().sendEach(fcmMessages);

    // Rimuovi token non validi
    batchResponse.responses.forEach((resp, i) => {
      if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
        staleTokenRefs.push(messages[i]._ref.update({ fcmToken: null }));
      }
    });

    if (staleTokenRefs.length > 0) await Promise.all(staleTokenRefs);
    return null;
  });

// ─── Phase 12: Stripe Integration ────────────────────────────────────────────

/**
 * Creates a Stripe Checkout Session for subscriptions.
 * usage: createCheckoutSession({ plan: 'student' | 'pro' })
 */
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  // App Check
  if (context.app == null) {
    console.warn('[Security] createCheckoutSession: App Check token mancante');
  }

  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Accesso richiesto.');
  }

  const uid = context.auth.uid;

  // Input validation
  const plan = data.plan;
  if (!plan || typeof plan !== 'string' || plan.length > 30) {
    throw new functions.https.HttpsError('invalid-argument', 'Piano non valido.');
  }
  const priceIds = {
    student:         process.env.STRIPE_PRICE_STUDENT,
    student_monthly: process.env.STRIPE_PRICE_STUDENT,          // alias mensile
    student_yearly:  process.env.STRIPE_PRICE_STUDENT_YEARLY,   // piano annuale €39,99
    pro:             process.env.STRIPE_PRICE_PRO
  };

  if (!priceIds[plan]) {
    throw new functions.https.HttpsError('invalid-argument', `Piano non valido: ${plan}`);
  }

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    let stripeCustomerId = userDoc.data()?.stripeCustomerId;

    // 1. Ensure Stripe Customer exists
    if (!stripeCustomerId) {
      const customer = await getStripe().customers.create({
        email: context.auth.token.email,
        metadata: { uid }
      });
      stripeCustomerId = customer.id;
      await db.collection('users').doc(uid).update({ stripeCustomerId });
    }

    // 2. Create Session
    const session = await getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceIds[plan], quantity: 1 }],
      success_url: 'https://cortexapp.it/app?upgrade=success',
      cancel_url:  'https://cortexapp.it/app?upgrade=cancel',
      metadata: { uid, plan }
    });

    return { url: session.url };
  } catch (err) {
    console.error('[Stripe] Session Error:', err);
    throw new functions.https.HttpsError('internal', err.message);
  }
});

/**
 * Stripe Webhook to handle lifecycle events.
 * Listens for: checkout.session.completed, customer.subscription.deleted
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  // Rate limiting: max 30 richieste/minuto per IP (Stripe manda da IP fissi, non è problema)
  const clientIp = getClientIp(req);
  if (!ipRateLimit(clientIp, { maxRequests: 30, windowMs: 60 * 1000 })) {
    return res.status(429).send('Too Many Requests');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error(`[Stripe] Webhook Signature Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;

  // A. Checkout Completato -> Attiva Piano
  if (event.type === 'checkout.session.completed') {
    const { uid, plan } = session.metadata;
    const customerId = session.customer;

    // Mapping Customer -> UID per gestire disdette future
    await db.collection('stripeCustomers').doc(customerId).set({ uid });

    // Normalizza: student_monthly e student_yearly sono entrambi 'student'
    const normalizedPlan = (plan || 'student').replace('_monthly', '').replace('_yearly', '');
    const isYearly = plan === 'student_yearly';

    await db.collection('users').doc(uid).set({
      plan: normalizedPlan,
      planCycle: isYearly ? 'yearly' : 'monthly',
      planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripeCustomerId: customerId
    }, { merge: true });

    console.log(`[Stripe] User ${uid} upgraded to ${normalizedPlan} (${isYearly ? 'yearly' : 'monthly'})`);
  }

  // B. Pagamento Fallito -> Downgrade a Free (carta scaduta, fondi insufficienti, ecc.)
  // Stripe invia questo evento quando un rinnovo fallisce definitivamente (dopo i retry)
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const customerId = invoice.customer;
    // Solo per failure definitive (non per primo tentativo — billing_reason = 'subscription_cycle')
    if (invoice.next_payment_attempt === null) {
      const mappingDoc = await db.collection('stripeCustomers').doc(customerId).get();
      if (mappingDoc.exists) {
        const { uid } = mappingDoc.data();
        await db.collection('users').doc(uid).update({
          plan: 'free',
          planCycle: null,
          winbackEligible: true,
          winbackShownAt: null,
          canceledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancelReason: 'payment_failed',
        });
        console.log(`[Stripe] invoice.payment_failed → user ${uid} downgraded to free`);
      }
    }
  }

  // C. Abbonamento Cancellato -> Torna a Free + win-back flag
  if (event.type === 'customer.subscription.deleted') {
    const customerId = session.customer;
    const mappingDoc = await db.collection('stripeCustomers').doc(customerId).get();

    if (mappingDoc.exists) {
      const { uid } = mappingDoc.data();
      await db.collection('users').doc(uid).update({
        plan: 'free',
        planCycle: null,
        winbackEligible: true,          // flag letto da appBoot.js al prossimo login
        winbackShownAt: null,           // verrà settato quando il banner è mostrato
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[Stripe] User ${uid} subscription revoked — win-back flag set`);
    }
  }

  res.json({ received: true });
});

// ─── Phase 13: Neural Sparks (micro-transazioni una-tantum) ──────────────────

/**
 * Crea una Stripe Checkout Session per acquisto Neural Sparks (one-time payment).
 * usage: createSparksSession({ pack: 'S' | 'M' | 'L' })
 * Pack S: 50 call  → price_SPARKS_S
 * Pack M: 150 call → price_SPARKS_M
 * Pack L: 500 call → price_SPARKS_L
 */
exports.createSparksSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
  }
  const uid = context.auth.uid;

  const sparksMap = {
    S: { price: process.env.STRIPE_PRICE_SPARKS_S, sparks: 50,  label: '50 Neural Sparks' },
    M: { price: process.env.STRIPE_PRICE_SPARKS_M, sparks: 150, label: '150 Neural Sparks' },
    L: { price: process.env.STRIPE_PRICE_SPARKS_L, sparks: 500, label: '500 Neural Sparks' },
  };

  const pack = sparksMap[data.pack];
  if (!pack) throw new functions.https.HttpsError('invalid-argument', 'Pack non valido. Usa S, M o L.');

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: pack.price, quantity: 1 }],
    success_url: 'https://cortexapp.it/app?sparks=success',
    cancel_url:  'https://cortexapp.it/app?sparks=cancel',
    metadata: { uid, sparks: String(pack.sparks), type: 'sparks' }
  });

  return { url: session.url };
});

/**
 * Webhook aggiornato: gestisce anche i pagamenti Neural Sparks.
 * Il campo sparksBalance viene incrementato su Firestore.
 * NOTA: questo è un webhook separato per i Sparks — il webhook principale
 * stripeWebhook gestisce gli abbonamenti. Se vuoi unificarli, leggi metadata.type.
 */
exports.sparksWebhook = functions.https.onRequest(async (req, res) => {
  // Rate limiting: max 30 richieste/minuto per IP
  const clientIp = getClientIp(req);
  if (!ipRateLimit(clientIp, { maxRequests: 30, windowMs: 60 * 1000 })) {
    return res.status(429).send('Too Many Requests');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_SPARKS_WEBHOOK_SECRET;

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { uid, sparks, type } = session.metadata || {};

    if (type === 'sparks' && uid && sparks) {
      const sparksCount = parseInt(sparks, 10);
      await db.collection('users').doc(uid).set(
        { sparksBalance: admin.firestore.FieldValue.increment(sparksCount) },
        { merge: true }
      );
    }
  }

  res.json({ received: true });
});

// ─── Stripe Customer Portal ───────────────────────────────────────────────────

/**
 * Crea una sessione Stripe Customer Portal per gestione/disdetta abbonamento.
 * Chiamata dal client quando l'utente preme "Gestisci abbonamento" nelle Impostazioni.
 *
 * Prerequisito: abilitare il Customer Portal dalla Dashboard Stripe:
 *   Dashboard → Settings → Billing → Customer portal → Activate
 *
 * usage: createPortalSession() → { url: string }
 * Il client reindirizza a url per far gestire l'abbonamento all'utente direttamente su Stripe.
 */
exports.createPortalSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Accesso richiesto.');
  }

  const uid = context.auth.uid;

  // Recupera il Stripe Customer ID salvato in Firestore al momento del checkout
  const userDoc = await db.collection('users').doc(uid).get();
  const stripeCustomerId = userDoc.data()?.stripeCustomerId;

  if (!stripeCustomerId) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Nessun abbonamento attivo trovato per questo account.'
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: 'https://cortexapp.it/app?section=settings',
    });

    return { url: session.url };
  } catch (err) {
    console.error('[Stripe] Portal session error:', err);
    throw new functions.https.HttpsError('internal', 'Errore creazione portale: ' + err.message);
  }
});

/**
 * verifyGooglePlayPurchase
 * Verifica un acquisto Google Play e attiva il piano su Firestore.
 *
 * Chiamato dal frontend dopo che l'utente ha completato il pagamento nella TWA.
 * Usa le Google Play Developer API con un Service Account.
 *
 * Variabili .env necessarie:
 *   GOOGLE_PLAY_PACKAGE_NAME=app.web.cortex_app.twa
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":...}
 */
exports.verifyGooglePlayPurchase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Accesso richiesto.');
  }

  const { purchaseToken, sku, plan } = data;
  const uid = context.auth.uid;

  if (!purchaseToken || !sku || !plan) {
    throw new functions.https.HttpsError('invalid-argument', 'purchaseToken, sku e plan sono obbligatori.');
  }

  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'app.web.cortex_app.twa';
  const serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    console.error('[GooglePlay] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON non configurato in .env');
    throw new functions.https.HttpsError('internal', 'Configurazione Google Play mancante.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new functions.https.HttpsError('internal', 'Service account JSON non valido.');
  }

  // Auth con Google Play Developer API
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  const androidPublisher = google.androidpublisher({ version: 'v3', auth });

  // Map SKU → piano interno
  const skuPlanMap = {
    'cortex_student_monthly': 'student',
    'cortex_pro_monthly':     'pro',
  };
  const activePlan = skuPlanMap[sku] || plan;

  // Controlla se è un abbonamento o un acquisto one-time (Sparks)
  const isSubscription = sku.includes('monthly');

  try {
    if (isSubscription) {
      // Verifica abbonamento
      const response = await androidPublisher.purchases.subscriptions.get({
        packageName,
        subscriptionId: sku,
        token: purchaseToken,
      });

      const purchase = response.data;

      // paymentState 1 = pagato, 2 = trial gratuito, 3 = pending upgrade
      if (purchase.paymentState !== 1 && purchase.paymentState !== 2) {
        throw new functions.https.HttpsError('failed-precondition', 'Abbonamento non attivo.');
      }

      // Acknowledge (obbligatorio entro 3 giorni o Google rimborsa)
      if (!purchase.acknowledgementState) {
        await androidPublisher.purchases.subscriptions.acknowledge({
          packageName,
          subscriptionId: sku,
          token: purchaseToken,
        });
      }

      const expiryMs = parseInt(purchase.expiryTimeMillis, 10);

      // Aggiorna Firestore
      await db.collection('users').doc(uid).set({
        plan: activePlan,
        googlePlaySubscription: {
          sku,
          purchaseToken,
          expiresAt: admin.firestore.Timestamp.fromMillis(expiryMs),
          orderId: purchase.orderId,
          autoRenewing: purchase.autoRenewing,
          activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        planSource: 'google_play',
        planExpiresAt: admin.firestore.Timestamp.fromMillis(expiryMs),
      }, { merge: true });

    } else {
      // Acquisto one-time (Sparks)
      const response = await androidPublisher.purchases.products.get({
        packageName,
        productId: sku,
        token: purchaseToken,
      });

      const purchase = response.data;

      // purchaseState 0 = completato
      if (purchase.purchaseState !== 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Acquisto non completato.');
      }

      if (!purchase.acknowledgementState) {
        await androidPublisher.purchases.products.acknowledge({
          packageName,
          productId: sku,
          token: purchaseToken,
        });
      }

      // Mappa SKU → quantità Sparks
      const sparksMap = {
        'cortex_sparks_50':  50,
        'cortex_sparks_150': 150,
        'cortex_sparks_500': 500,
      };
      const sparksAmount = sparksMap[sku] || 50;

      // Aggiunge Sparks al saldo utente atomicamente (campo sparksBalance = fonte di verità)
      await db.collection('users').doc(uid).set({
        sparksBalance: admin.firestore.FieldValue.increment(sparksAmount),
        googlePlayPurchases: admin.firestore.FieldValue.arrayUnion({
          sku,
          purchaseToken,
          orderId: purchase.orderId,
          purchasedAt: new Date().toISOString(),
        }),
        planSource: 'google_play',
      }, { merge: true });
    }

    console.log(`[GooglePlay] Acquisto verificato e attivato per uid=${uid}, sku=${sku}`);
    return { success: true, plan: activePlan };

  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('[GooglePlay] Verifica fallita:', err.message);
    throw new functions.https.HttpsError('internal', 'Verifica Google Play fallita: ' + err.message);
  }
});


/**
 * deleteUserAccount — GDPR Right to Erasure
 * Cancella tutti i dati dell'utente da Firestore e disabilita l'account Firebase Auth.
 * Chiamata solo dall'utente autenticato per cancellare sé stesso.
 */
exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Accesso richiesto.');
  }
  const uid = context.auth.uid;

  try {
    // 1. Cancella sub-collections (decks, memory)
    const deleteCollection = async (collPath) => {
      const snap = await db.collection(collPath).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      if (snap.docs.length > 0) await batch.commit();
    };

    await deleteCollection(`users/${uid}/decks`);
    await deleteCollection(`users/${uid}/memory`);

    // 2. Cancella document principale utente
    await db.collection('users').doc(uid).delete();

    // 3. Cancella profilo pubblico (leaderboard)
    const profileSnap = await db.collection('userProfiles')
      .where('uid', '==', uid).limit(1).get();
    if (!profileSnap.empty) {
      await profileSnap.docs[0].ref.delete();
    }

    // 4. Cancella mazzi pubblici condivisi
    const publicDecksSnap = await db.collection('publicDecks')
      .where('ownerId', '==', uid).get();
    const batch2 = db.batch();
    publicDecksSnap.docs.forEach(d => batch2.delete(d.ref));
    if (!publicDecksSnap.empty) await batch2.commit();

    // 5. Cancella stripeCustomers mapping
    const stripeDoc = await db.collection('users').doc(uid).get();
    const customerId = stripeDoc.data()?.stripeCustomerId;
    if (customerId) {
      await db.collection('stripeCustomers').doc(customerId).delete();
    }

    // 6. Disabilita (non cancella subito) l'utente Firebase Auth
    // La cancellazione definitiva avviene dopo 30 giorni per sicurezza
    await admin.auth().updateUser(uid, { disabled: true });

    console.log(`[GDPR] Account ${uid} cancellato su richiesta dell'utente.`);
    return { success: true };

  } catch (err) {
    console.error('[GDPR] deleteUserAccount error:', err);
    throw new functions.https.HttpsError('internal', 'Errore durante la cancellazione: ' + err.message);
  }
});


/**
 * processReferral — Trigger Firestore su users/{uid}
 * Quando un nuovo utente viene creato con un campo `referredBy` (codice ref),
 * assegna 7 giorni Student gratis a entrambi (referrer e referred).
 *
 * Il codice ref = prime 8 chars dello UID del referrer.
 * Sicurezza: viene eseguito solo una volta (flag `referralProcessed`).
 */
exports.processReferral = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null;

    // Solo se referredBy è appena stato impostato e non ancora processato
    if (!after.referredBy || after.referralProcessed) return null;

    // Non eseguire su update che non aggiungono referredBy per la prima volta
    const before = change.before.exists ? change.before.data() : {};
    if (before.referredBy) return null; // era già presente → skip

    const refCode = after.referredBy;
    console.log(`[Referral] User ${uid} referredBy code: ${refCode}`);

    try {
      // Trova il referrer: il suo UID inizia con il refCode (8 chars)
      // Usiamo una query su Firestore: l'UID è l'ID del documento, non un campo,
      // quindi cerchiamo tramite un campo `refCode` che salviamo al momento della registrazione.
      // Fallback: cerca tra tutti gli utenti il cui UID inizia con refCode.
      const referrerSnap = await db.collection('users')
        .where('refCode', '==', refCode)
        .limit(1)
        .get();

      if (referrerSnap.empty) {
        console.warn(`[Referral] No referrer found for code: ${refCode}`);
        // Marca come processato comunque per non ritentare
        await db.collection('users').doc(uid).update({ referralProcessed: true });
        return null;
      }

      const referrerDoc = referrerSnap.docs[0];
      const referrerId  = referrerDoc.id;

      if (referrerId === uid) {
        console.warn(`[Referral] Self-referral attempt by ${uid} — ignored`);
        await db.collection('users').doc(uid).update({ referralProcessed: true });
        return null;
      }

      const REWARD_DAYS = 7;
      const now = Date.now();
      const rewardMs = REWARD_DAYS * 24 * 60 * 60 * 1000;

      // Calcola data di scadenza del trial per referred user
      const referredTrialExpiry = now + rewardMs;

      // Per il referrer: estendi da oggi (o dalla scadenza esistente se è ancora attiva)
      const referrerData = referrerDoc.data();
      const existingExpiry = referrerData.trialExpiresAt || 0;
      const referrerBase   = Math.max(now, existingExpiry);
      const referrerExpiry = referrerBase + rewardMs;

      const batch = db.batch();

      // Aggiorna referred user
      batch.update(db.collection('users').doc(uid), {
        referralProcessed: true,
        trialPlan: 'student',
        trialExpiresAt: referredTrialExpiry,
        referralRewardAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Aggiorna referrer
      batch.update(db.collection('users').doc(referrerId), {
        referralCount: admin.firestore.FieldValue.increment(1),
        referralDaysEarned: admin.firestore.FieldValue.increment(REWARD_DAYS),
        trialPlan: 'student',
        trialExpiresAt: referrerExpiry,
      });

      await batch.commit();
      console.log(`[Referral] Reward granted: ${uid} ← ${referrerId} (${REWARD_DAYS} days each)`);
      return null;

    } catch (err) {
      console.error('[Referral] processReferral error:', err);
      return null;
    }
  });

/**
 * adminDashboard — Endpoint privato per il pannello admin di Cortex.
 * Restituisce dati Stripe (abbonamenti, pagamenti, MRR) + Firestore (utenti per piano, totale).
 * Auth: Bearer <DASHBOARD_SECRET> (da process.env.DASHBOARD_SECRET)
 * CORS: * (è un endpoint privato accessibile solo con il secret)
 */
exports.adminDashboard = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  // Auth con secret key
  const secret = process.env.DASHBOARD_SECRET;
  const authHeader = req.headers.authorization || '';
  if (!secret || authHeader !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const stripe = getStripe();

    // ── Stripe: abbonamenti + pagamenti in parallelo ──
    const [subsList, chargesList, balanceObj] = await Promise.all([
      stripe.subscriptions.list({ limit: 100, status: 'all', expand: ['data.items.data.price'] }),
      stripe.charges.list({ limit: 50 }),
      stripe.balance.retrieve(),
    ]);

    // MRR: somma di tutti gli abbonamenti attivi (unit_amount / 100 per €)
    const activeSubscriptions = subsList.data.filter(s => s.status === 'active' || s.status === 'trialing');
    const mrr = activeSubscriptions.reduce((sum, s) => {
      const price = s.items.data[0]?.price;
      if (!price) return sum;
      const amount = (price.unit_amount || 0) / 100;
      if (price.recurring?.interval === 'year') return sum + amount / 12;
      return sum + amount;
    }, 0);

    // Revenue totale dai charge riusciti
    const successfulCharges = chargesList.data.filter(c => c.paid && !c.refunded);
    const totalRevenue = successfulCharges.reduce((sum, c) => sum + c.amount / 100, 0);

    // Saldo disponibile Stripe
    const availableBalance = (balanceObj.available || []).reduce((s, b) => s + b.amount / 100, 0);

    // Pagamenti recenti (ultimi 10)
    const recentPayments = chargesList.data.slice(0, 10).map(c => ({
      id: c.id,
      amount: c.amount / 100,
      currency: c.currency.toUpperCase(),
      status: c.paid ? (c.refunded ? 'refunded' : 'paid') : 'failed',
      description: c.description || c.metadata?.plan || '—',
      date: c.created * 1000,
      email: c.billing_details?.email || '—',
    }));

    // Sub per piano (student/pro)
    const subsByPlan = { student: 0, pro: 0, trialing: 0, canceled: 0, other: 0 };
    subsList.data.forEach(s => {
      if (s.status === 'canceled') { subsByPlan.canceled++; return; }
      if (s.status === 'trialing') { subsByPlan.trialing++; return; }
      const priceId = s.items.data[0]?.price?.id || '';
      if (priceId === process.env.STRIPE_PRICE_STUDENT) subsByPlan.student++;
      else if (priceId === process.env.STRIPE_PRICE_PRO) subsByPlan.pro++;
      else subsByPlan.other++;
    });

    // ── Firestore: utenti per piano ──
    // Data odierna in timezone Europe/Rome (non UTC), per allinearsi ai contatori
    // 'pageviews_<data>' scritti dal client (anch'esso in Europe/Rome).
    const romeNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const today = `${romeNow.getFullYear()}-${String(romeNow.getMonth() + 1).padStart(2, '0')}-${String(romeNow.getDate()).padStart(2, '0')}`;
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const msSinceRomeMidnight = romeNow.getHours() * 3600000 + romeNow.getMinutes() * 60000 + romeNow.getSeconds() * 1000 + romeNow.getMilliseconds();
    const todayStart = new Date(Date.now() - msSinceRomeMidnight);

    const [usersSnap, presenceSnap, pageviewsDoc, newUsersSnap, analyticsAllSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('analytics').doc('presence').collection('sessions')
        .where('lastSeen', '>', fiveMinsAgo).get(),
      db.collection('analytics').doc('pageviews_' + today).get(),
      db.collection('users').where('createdAt', '>', todayStart).get(),
      db.collection('analytics').get(),
    ]);

    const usersByPlan = { free: 0, student: 0, pro: 0, other: 0 };
    let usersWithFCM = 0;
    let usersWithSparks = 0;
    const registrationByMonth = {};

    usersSnap.docs.forEach(doc => {
      const d = doc.data();
      const plan = d.plan || 'free';
      if (plan === 'free') usersByPlan.free++;
      else if (plan === 'student') usersByPlan.student++;
      else if (plan === 'pro') usersByPlan.pro++;
      else usersByPlan.other++;

      if (d.fcmToken) usersWithFCM++;
      if ((d.sparksBalance || 0) > 0) usersWithSparks++;

      const createdAt = d.createdAt?.toDate ? d.createdAt.toDate() : (d.createdAt ? new Date(d.createdAt) : null);
      if (createdAt) {
        const month = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
        registrationByMonth[month] = (registrationByMonth[month] || 0) + 1;
      }
    });

    // Presenza: breakdown per pagina e sorgente
    const onlineNow = presenceSnap.size;
    const onlineByPage = { landing: 0, app: 0 };
    const onlineBySource = {};
    presenceSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.page === 'landing') onlineByPage.landing++;
      else if (d.page === 'app') onlineByPage.app++;
      const src = d.source || 'direct';
      onlineBySource[src] = (onlineBySource[src] || 0) + 1;
    });

    // Visite oggi
    const pvData = pageviewsDoc.exists ? pageviewsDoc.data() : {};
    const visitesToday = { landing: pvData.landing || 0, app: pvData.app || 0 };
    const sourceBreakdown = {};
    Object.entries(pvData).forEach(([k, v]) => {
      if (k.startsWith('src_')) sourceBreakdown[k.replace('src_', '')] = v;
    });

    // Visite all-time: somma di tutti i documenti 'pageviews_<data>' in 'analytics'
    // RESET 10/07/2026: i conteggi pre-fix erano ~90% visite di test interne e il
    // tracking GA4/eventi era rotto. I doc storici restano su Firestore, ma il
    // contatore "all-time" riparte da questa data (dati finalmente puliti).
    const ANALYTICS_RESET_DATE = '2026-07-10';
    let allTimeLanding = 0;
    let allTimeApp = 0;
    let trackedDays = 0;
    const allTimeSourceBreakdown = {};
    analyticsAllSnap.docs.forEach(doc => {
      if (!doc.id.startsWith('pageviews_')) return;
      if (doc.id.slice('pageviews_'.length) < ANALYTICS_RESET_DATE) return;
      trackedDays++;
      const d = doc.data();
      allTimeLanding += d.landing || 0;
      allTimeApp += d.app || 0;
      Object.entries(d).forEach(([k, v]) => {
        if (k.startsWith('src_')) {
          const src = k.replace('src_', '');
          allTimeSourceBreakdown[src] = (allTimeSourceBreakdown[src] || 0) + v;
        }
      });
    });
    // Normalizza sorgenti duplicate (ig → instagram, etc.)
    const SRC_ALIAS = { ig: 'instagram', 'ig.com': 'instagram', 't.co': 'twitter' };
    const normalizedSources = {};
    for (const [src, v] of Object.entries(allTimeSourceBreakdown)) {
      const key = SRC_ALIAS[src.toLowerCase()] || src.toLowerCase();
      normalizedSources[key] = (normalizedSources[key] || 0) + v;
    }

    const visitesAllTime = {
      landing: allTimeLanding,
      app: allTimeApp,
      total: allTimeLanding + allTimeApp,
    };

    res.json({
      ts: Date.now(),
      stripe: {
        mrr: Math.round(mrr * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        availableBalance: Math.round(availableBalance * 100) / 100,
        activeSubscriptions: activeSubscriptions.length,
        subsByPlan,
        recentPayments,
      },
      firestore: {
        totalUsers: usersSnap.size,
        newUsersToday: newUsersSnap.size,
        usersByPlan,
        usersWithFCM,
        usersWithSparks,
        registrationByMonth,
      },
      analytics: {
        onlineNow,
        onlineByPage,
        onlineBySource,
        visitesToday,
        sourceBreakdown,
        visitesAllTime,
        allTimeSourceBreakdown: normalizedSources,
        trackedDays,
      },
    });
  } catch (err) {
    console.error('[adminDashboard] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * adminFeedbackAction — Operazioni admin sui feedback (delete, pin, reply).
 * Usa Admin SDK → bypassa completamente le Firestore Security Rules lato client.
 * Solo l'admin (UID hardcoded) può eseguire queste operazioni.
 *
 * Payload: { action: 'delete'|'pin'|'reply', docId: string, value?: any }
 */
const ADMIN_UID = 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2';

exports.adminFeedbackAction = functions.https.onCall(async (data, context) => {
  // 1. Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Accesso richiesto.');
  }
  if (context.auth.uid !== ADMIN_UID) {
    throw new functions.https.HttpsError('permission-denied', 'Solo l\'amministratore può eseguire questa operazione.');
  }

  const { action, docId, value } = data;

  if (!action || !docId || typeof docId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Parametri action e docId obbligatori.');
  }

  const feedbackRef = db.collection('feedbacks').doc(docId);

  try {
    switch (action) {
      case 'delete':
        await feedbackRef.delete();
        return { success: true, message: t('feedback_deleted') };

      case 'pin': {
        const snap = await feedbackRef.get();
        if (!snap.exists) throw new Error('Documento non trovato.');
        const currentPinned = snap.data().pinned || false;
        await feedbackRef.update({ pinned: !currentPinned });
        return { success: true, pinned: !currentPinned };
      }

      case 'reply':
        if (!value || typeof value !== 'string') {
          throw new functions.https.HttpsError('invalid-argument', 'Valore reply obbligatorio.');
        }
        await feedbackRef.update({ adminReply: value.trim().slice(0, 1000) });
        return { success: true, message: 'Risposta aggiunta.' };

      default:
        throw new functions.https.HttpsError('invalid-argument', `Azione non riconosciuta: ${action}`);
    }
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('[adminFeedbackAction] error:', err);
    throw new functions.https.HttpsError('internal', 'Errore durante l\'operazione: ' + err.message);
  }
});

// ─── TikTok Login Kit + Content Posting API ────────────────────────────────
// Bot interno: pubblica contenuti promozionali sull'account TikTok ufficiale
// di Cortex. Vedi /admin-tiktok.html (pagina interna, protetta da DASHBOARD_SECRET).
// I token OAuth sono salvati in Firestore (_system/tiktok_tokens), non su disco,
// perché le Cloud Functions sono stateless.

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
const TIKTOK_PUBLISH_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/content/init/";
const TIKTOK_PUBLISH_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";
const TIKTOK_SCOPES = "user.info.basic,video.publish,video.upload";

function tiktokAdminCors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function tiktokCheckSecret(req, res) {
  const secret = process.env.DASHBOARD_SECRET;
  const authHeader = req.headers.authorization || '';
  const queryKey = req.query.key || '';
  const ok = secret && (authHeader === `Bearer ${secret}` || queryKey === secret);
  if (!ok) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

const tiktokTokensRef = () => db.collection('_system').doc('tiktok_tokens');

async function tiktokSaveTokens(data) {
  await tiktokTokensRef().set({ ...data, obtained_at: Date.now() }, { merge: true });
}

async function tiktokGetValidAccessToken() {
  const snap = await tiktokTokensRef().get();
  if (!snap.exists) throw new Error('Nessun token TikTok salvato. Usa "Connetti TikTok" prima.');
  const tokens = snap.data();
  const obtainedAt = tokens.obtained_at || 0;
  const expiresInMs = (tokens.expires_in || 0) * 1000;
  if (Date.now() < obtainedAt + expiresInMs - 5 * 60 * 1000) {
    return tokens.access_token;
  }
  // refresh
  if (!tokens.refresh_token) throw new Error('Refresh token assente. Rifai "Connetti TikTok".');
  const resp = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Errore refresh token TikTok: ' + JSON.stringify(data));
  await tiktokSaveTokens(data);
  return data.access_token;
}

// GET /api/tiktok/auth?key=DASHBOARD_SECRET → redirect a TikTok per autorizzare l'app
exports.tiktokAuthUrl = functions.https.onRequest(async (req, res) => {
  tiktokAdminCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (!tiktokCheckSecret(req, res)) return;

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || 'https://cortexapp.it/oauth/callback';
  if (!clientKey) { res.status(500).json({ error: 'TIKTOK_CLIENT_KEY non configurata' }); return; }

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: 'cortex_admin',
  });
  res.redirect(`${TIKTOK_AUTH_URL}?${params.toString()}`);
});

// POST /api/tiktok/exchange { code } → scambia il code OAuth con un access token
exports.tiktokExchangeToken = functions.https.onRequest(async (req, res) => {
  tiktokAdminCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (!tiktokCheckSecret(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') { res.status(400).json({ error: 'Parametro code obbligatorio' }); return; }

  try {
    const resp = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TIKTOK_REDIRECT_URI || 'https://cortexapp.it/oauth/callback',
      }),
    });
    const data = await resp.json();
    if (!data.access_token) {
      res.status(400).json({ error: 'Errore scambio codice TikTok', detail: data });
      return;
    }
    await tiktokSaveTokens(data);
    res.json({ success: true, expires_in: data.expires_in, open_id: data.open_id });
  } catch (err) {
    console.error('[tiktokExchangeToken] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tiktok/status → stato connessione (per la pagina admin)
exports.tiktokStatus = functions.https.onRequest(async (req, res) => {
  tiktokAdminCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (!tiktokCheckSecret(req, res)) return;

  try {
    const snap = await tiktokTokensRef().get();
    if (!snap.exists) { res.json({ connected: false }); return; }
    const tokens = snap.data();
    let creatorInfo = null;
    try {
      const accessToken = await tiktokGetValidAccessToken();
      const infoResp = await fetch(TIKTOK_CREATOR_INFO_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      });
      const infoData = await infoResp.json();
      creatorInfo = infoData.data || null;
    } catch (e) {
      console.warn('[tiktokStatus] creator_info non disponibile:', e.message);
    }
    res.json({
      connected: true,
      open_id: tokens.open_id || null,
      expires_at: (tokens.obtained_at || 0) + (tokens.expires_in || 0) * 1000,
      creator_info: creatorInfo,
    });
  } catch (err) {
    console.error('[tiktokStatus] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tiktok/publish { imageUrls: string[], caption: string } → pubblica carousel
exports.tiktokPublish = functions.https.onRequest(async (req, res) => {
  tiktokAdminCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (!tiktokCheckSecret(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { imageUrls, caption } = req.body || {};
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    res.status(400).json({ error: 'imageUrls obbligatorio (array non vuoto)' });
    return;
  }
  if (!caption || typeof caption !== 'string') {
    res.status(400).json({ error: 'caption obbligatoria' });
    return;
  }

  try {
    const accessToken = await tiktokGetValidAccessToken();

    let privacyLevel = 'SELF_ONLY';
    try {
      const infoResp = await fetch(TIKTOK_CREATOR_INFO_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      });
      const infoData = await infoResp.json();
      const options = infoData.data?.privacy_level_options || [];
      privacyLevel = options.includes('SELF_ONLY') ? 'SELF_ONLY' : (options[0] || 'SELF_ONLY');
    } catch (e) {
      console.warn('[tiktokPublish] creator_info fallback SELF_ONLY:', e.message);
    }

    const body = {
      post_info: {
        title: caption.slice(0, 90),
        description: caption,
        disable_comment: false,
        privacy_level: privacyLevel,
        auto_add_music: true,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: imageUrls,
      },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    };

    const resp = await fetch(TIKTOK_PUBLISH_INIT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    const err = data.error || {};
    if (err.code && err.code !== 'ok') {
      res.status(400).json({ error: 'Errore pubblicazione TikTok', detail: err });
      return;
    }
    res.json({ success: true, publish_id: data.data.publish_id, privacy_level: privacyLevel });
  } catch (err) {
    console.error('[tiktokPublish] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tiktok/publish-status?publish_id=... → stato di una pubblicazione
exports.tiktokPublishStatus = functions.https.onRequest(async (req, res) => {
  tiktokAdminCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (!tiktokCheckSecret(req, res)) return;

  const publishId = req.query.publish_id;
  if (!publishId) { res.status(400).json({ error: 'publish_id obbligatorio' }); return; }

  try {
    const accessToken = await tiktokGetValidAccessToken();
    const resp = await fetch(TIKTOK_PUBLISH_STATUS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const data = await resp.json();
    res.json(data.data || {});
  } catch (err) {
    console.error('[tiktokPublishStatus] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tts — Google Cloud Text-to-Speech (piano Student/Pro)
// Body: { text: string, voice?: string, speakingRate?: number, pitch?: number }
// Returns: { audioContent: base64MP3 }
// ─────────────────────────────────────────────────────────────────────────────
const CORS_ORIGINS = ['https://cortexapp.it', 'https://cortex-74a4e.web.app', 'https://cortex-74a4e.firebaseapp.com'];

exports.textToSpeechHttp = functions.https.onRequest(async (req, res) => {
  // CORS
  const origin = req.headers.origin || '';
  res.set('Access-Control-Allow-Origin', CORS_ORIGINS.includes(origin) ? origin : 'https://cortexapp.it');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // IP rate limit (60/min per IP)
  if (!ipRateLimit(getClientIp(req), { maxRequests: 60, windowMs: 60000 })) {
    res.status(429).json({ error: 'Too many requests' }); return;
  }

  // Auth
  const idToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (!idToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
  let uid;
  try {
    uid = (await admin.auth().verifyIdToken(idToken)).uid;
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' }); return;
  }

  // Piano: solo student/pro (admin bypass)
  const isAdmin = uid === 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2';
  if (!isAdmin) {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    let plan = userData.plan || 'free';
    if (plan === 'free' && userData.trialPlan && userData.trialExpiresAt > Date.now()) {
      plan = userData.trialPlan || 'student';
    }
    if (plan === 'free') {
      res.status(403).json({ error: 'PREMIUM_REQUIRED', message: 'Cloud TTS richiede piano Student o Pro' });
      return;
    }
  }

  // Validazione input
  const { text, voice, speakingRate, pitch } = req.body || {};
  if (!text || typeof text !== 'string' || text.length > 2000) {
    res.status(400).json({ error: 'Parametro text non valido (max 2000 caratteri)' }); return;
  }

  // Chiama Google Cloud TTS via googleapis (usa ADC del service account della Function)
  try {
    const ttsClient = google.texttospeech({ version: 'v1', auth: new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })});

    const ttsResponse = await ttsClient.text.synthesize({
      requestBody: {
        input: { text: text },
        voice: {
          languageCode: 'it-IT',
          name: voice || 'it-IT-Neural2-C',
          ssmlGender: 'MALE',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: Math.min(Math.max(speakingRate !== undefined ? speakingRate : 0.90, 0.25), 4.0),
          pitch: Math.min(Math.max(pitch !== undefined ? pitch : -2.0, -20.0), 20.0),
          effectsProfileId: ['headphone-class-device'],
        },
      },
    });

    res.json({ audioContent: ttsResponse.data.audioContent });
  } catch (err) {
    console.error('[textToSpeech] error:', err);
    res.status(500).json({ error: err.message });
  }
});
