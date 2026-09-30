/**
 * functions/index.js
 * Cortex Gemini Proxy with Rate Limiting
 *
 * Config: usa process.env (da functions/.env) invece di functions.config() deprecato.
 * Le variabili sensibili (STRIPE_SECRET, GEMINI_KEY) vanno nel file .env (gitignored).
 */

const functions = require("firebase-functions/v1");
// Firebase Admin v14 removed the legacy namespaced API. Keep this tiny local
// adapter so the existing handlers share one initialized modular SDK instance.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getMessaging } = require("firebase-admin/messaging");
const admin = {
  initializeApp,
  firestore: Object.assign(() => getFirestore(), { FieldValue, Timestamp }),
  auth: () => getAuth(),
  messaging: () => getMessaging(),
};
const security = require("./security");
const crypto = require("node:crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");
// googleapis è enorme: caricarlo al top-level rallenta ogni cold start e può far sforare
// il timeout di analisi al deploy ("Cannot determine backend specification"). Lazy-load.
let _googleapis = null;
function getGoogle() { if (!_googleapis) _googleapis = require("googleapis").google; return _googleapis; }

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
  if (!modelName || typeof modelName !== 'string' || modelName.length > 100 || !/^gemini-[a-z0-9.-]*flash[a-z0-9.-]*$/i.test(modelName)) {
    res.status(400).json({ error: 'Modello non consentito. Il proxy accetta solo modelli Gemini Flash.' });
    return;
  }
  if (!contents || typeof contents !== 'object') {
    res.status(400).json({ error: 'Parametro contents non valido' });
    return;
  }
  // 1.5MB: prima era 50KB (solo testo). Alzato per supportare le foto inline
  // (Gemini Vision) della feature "Importa lezione". Il costo resta protetto dal
  // rate limit giornaliero per utente/piano più sotto.
  if (JSON.stringify(req.body).length > 1500000) {
    res.status(400).json({ error: 'Payload troppo grande' });
    return;
  }

  // Quota must be checked successfully before calling the paid AI provider.
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
      // Pro keeps effectively high fair-use headroom while protecting spend
      // from scripted abuse. Can be tuned centrally without redeploying code.
      const limits = { free: 25, student: 100, pro: Math.max(100, Number(process.env.GEMINI_PRO_DAILY_LIMIT) || 2000) };
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
    console.error("Quota check unavailable:", err.code || "unknown");
    res.status(503).json({ error: "Quota temporaneamente non verificabile. Riprova." });
    return;
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
    if (rawConfig.temperature !== undefined && Number.isFinite(Number(rawConfig.temperature))) {
      normalizedConfig.temperature = Math.min(2, Math.max(0, Number(rawConfig.temperature)));
    }
    const requestedTokens = Number(rawConfig.maxOutputTokens);
    normalizedConfig.maxOutputTokens = Number.isFinite(requestedTokens)
      ? Math.min(8192, Math.max(1, Math.floor(requestedTokens)))
      : 4096;
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
            title: '🧠 Non perdere quello che hai imparato',
            body: `${dueCount} ${dueCount === 1 ? 'ripasso sta' : 'ripassi stanno'} scadendo dalla tua memoria. Bastano 3 minuti per salvarli.`
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

    if (type === 'sparks' && uid && sparks && session.payment_status === 'paid' && session.mode === 'payment') {
      const sparksCount = parseInt(sparks, 10);
      const allowedPacks = new Set([50, 150, 500]);
      if (!Number.isInteger(sparksCount) || !allowedPacks.has(sparksCount) || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
        return res.status(400).send('Invalid Sparks checkout metadata');
      }
      const markerRef = db.collection('_stripeSparksProcessed').doc(session.id);
      const userRef = db.collection('users').doc(uid);
      await db.runTransaction(async (tx) => {
        const marker = await tx.get(markerRef);
        if (marker.exists) return;
        tx.set(markerRef, {
          eventId: event.id,
          uid,
          sparks: sparksCount,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(userRef, { sparksBalance: admin.firestore.FieldValue.increment(sparksCount) }, { merge: true });
      });
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
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Accesso richiesto.');
  const {purchaseToken, sku} = data || {};
  const product = Object.hasOwn(security.PRODUCTS, sku || '') ? security.PRODUCTS[sku] : null;
  if (!product || typeof purchaseToken !== 'string' || !purchaseToken || purchaseToken.length > 4096) throw new functions.https.HttpsError('invalid-argument', 'Prodotto o ricevuta non validi.');
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'app.web.cortex_app.twa';
  try {
    if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) throw new Error('Missing Play configuration');
    const google = getGoogle();
    const auth = new google.auth.GoogleAuth({credentials:JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON), scopes:['https://www.googleapis.com/auth/androidpublisher']});
    const api = google.androidpublisher({version:'v3', auth});
    const endpoint = product.plan ? api.purchases.subscriptions : api.purchases.products;
    const request = {packageName, token:purchaseToken, [product.plan ? 'subscriptionId' : 'productId']:sku};
    const purchase = (await endpoint.get(request)).data;
    // Claim receipt and credit in one transaction before acknowledge; retry is safe.
    const result = await security.applyPurchase({db, admin, uid:context.auth.uid, sku, purchaseToken, purchase, HttpsError:functions.https.HttpsError});
    if (!purchase.acknowledgementState) await endpoint.acknowledge(request);
    return result;
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('[GooglePlay] verification failed:', err.code || 'internal');
    throw new functions.https.HttpsError('internal', 'Verifica acquisto temporaneamente non disponibile.');
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

    // Preserve consumed legacy receipts before removing the only old purchase record.
    await security.retainLegacyReceipts(db, uid);
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
// Social counters are derived from relationship documents on the server;
// browser clients cannot inflate or edit them.
exports.syncFollowCounts = functions.firestore.document('follows/{followId}').onWrite(async (change, context) => {
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;
  if (!!before === !!after) return null;
  const relation = after || before;
  const delta = after ? 1 : -1;
  const followerRef = db.collection('profiles').doc(relation.followerUid);
  const followingRef = db.collection('profiles').doc(relation.followingUid);
  const eventRef = db.collection('_socialCounterEvents').doc(context.eventId);
  return db.runTransaction(async (tx) => {
    const [seen, follower, following] = await Promise.all([tx.get(eventRef), tx.get(followerRef), tx.get(followingRef)]);
    if (seen.exists) return;
    if (follower.exists) tx.update(followerRef, { followingCount: admin.firestore.FieldValue.increment(delta) });
    if (following.exists) tx.update(followingRef, { followersCount: admin.firestore.FieldValue.increment(delta) });
    tx.create(eventRef, { processedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
});

exports.syncFriendCounts = functions.firestore.document('friends/{friendshipId}').onWrite(async (change, context) => {
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;
  if (!!before === !!after) return null;
  const relation = after || before;
  // The app stores both directions. Only the lexicographically canonical
  // document updates counters, avoiding double counting.
  if (relation.uid1 >= relation.uid2) return null;
  const delta = after ? 1 : -1;
  const refs = [relation.uid1, relation.uid2].map((uid) => db.collection('profiles').doc(uid));
  const eventRef = db.collection('_socialCounterEvents').doc(context.eventId);
  return db.runTransaction(async (tx) => {
    const [seen, ...docs] = await Promise.all([tx.get(eventRef), ...refs.map((ref) => tx.get(ref))]);
    if (seen.exists) return;
    docs.forEach((doc, i) => { if (doc.exists) tx.update(refs[i], { friendsCount: admin.firestore.FieldValue.increment(delta) }); });
    tx.create(eventRef, { processedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
});

const DUEL_QUESTIONS = [
  { q: 'Quale neurotrasmettitore è associato al reward system?', a: 'Dopamina', options: ['Serotonina', 'Dopamina', 'GABA', 'Acetilcolina'] },
  { q: 'Parte del cervello per la memoria a lungo termine?', a: 'Ippocampo', options: ['Amigdala', 'Ippocampo', 'Corteccia visiva', 'Cervelletto'] },
  { q: "Cos'è l'Apoptosi?", a: 'Morte cellulare programmata', options: ['Morte cellulare programmata', 'Divisione cellulare', 'Sintesi proteica', 'Necrosi casuale'] },
  { q: "Quale organo produce l'insulina?", a: 'Pancreas', options: ['Fegato', 'Rene', 'Pancreas', 'Milza'] },
  { q: 'Quante ossa ha il corpo umano adulto?', a: '206', options: ['206', '213', '180', '256'] },
  { q: "Cos'è la mitosi?", a: 'Divisione cellulare somatica', options: ['Divisione cellulare somatica', 'Riproduzione sessuale', 'Trascrizione del DNA', 'Traduzione proteica'] },
  { q: 'Chi ha formulato la teoria della relatività generale?', a: 'Einstein', options: ['Newton', 'Einstein', 'Bohr', 'Heisenberg'] },
  { q: 'Quanti cromosomi ha una cellula umana normale?', a: '46', options: ['23', '46', '48', '92'] },
  { q: "Cos'è l'osmosi?", a: 'Passaggio di solvente attraverso membrana semipermeabile', options: ['Passaggio di solvente attraverso membrana semipermeabile', 'Diffusione di soluto', 'Trasporto attivo', 'Endocitosi'] },
  { q: 'In quale organo avviene la sintesi della bile?', a: 'Fegato', options: ['Pancreas', 'Rene', 'Fegato', 'Stomaco'] },
  { q: 'Cosa studia la neurologia?', a: 'Il sistema nervoso', options: ['Il sistema circolatorio', 'Il sistema nervoso', 'Il sistema endocrino', 'Il sistema immunitario'] },
  { q: "Cos'è il teorema di Pitagora?", a: 'a² + b² = c²', options: ['a² + b² = c²', 'a + b = c', 'a × b = c²', 'a² - b² = c²'] },
];
function duelQuestion(index) {
  const { q, options } = DUEL_QUESTIONS[index % DUEL_QUESTIONS.length];
  return { q, options };
}
async function requireDuelPlan(uid) {
  const userDoc = await db.collection('users').doc(uid).get();
  const user = userDoc.exists ? userDoc.data() : {};
  let plan = user.plan || 'free';
  if (plan === 'free' && user.trialPlan && Number(user.trialExpiresAt) > Date.now()) plan = user.trialPlan;
  if (plan !== 'student' && plan !== 'pro' && uid !== 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2') {
    throw new functions.https.HttpsError('permission-denied', 'Neural Duels richiede il piano Student o Pro.');
  }
}

exports.createOrJoinNeuralDuel = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Accedi per giocare.');
  const uid = context.auth.uid;
  await requireDuelPlan(uid);
  const name = String(data && data.name || 'Guest').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 40) || 'Guest';
  const lobbies = await db.collection('duels').where('status', '==', 'waiting').limit(10).get();
  const candidate = lobbies.docs.find((doc) => doc.data().player1 && doc.data().player1.id !== uid);
  const ref = candidate ? candidate.ref : db.collection('duels').doc();
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().status === 'waiting' && snap.data().player1.id !== uid) {
      const state = snap.data();
      tx.update(ref, {
        player2: { id: uid, name, score: 0 }, status: 'playing',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { joined: true, questionIndex: state.questionIndex || 0 };
    }
    if (snap.exists) throw new functions.https.HttpsError('aborted', 'La lobby è già stata occupata. Riprova.');
    tx.create(ref, {
      player1: { id: uid, name, score: 0 }, player2: null, status: 'waiting',
      createdAt: admin.firestore.FieldValue.serverTimestamp(), currentQuestion: duelQuestion(0), questionIndex: 0,
    });
    return { joined: false, questionIndex: 0 };
  });
  return { duelId: ref.id, ...result };
});

exports.startNeuralDuelBot = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Accedi per giocare.');
  const uid = context.auth.uid;
  await requireDuelPlan(uid);
  const duelId = String(data && data.duelId || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(duelId)) throw new functions.https.HttpsError('invalid-argument', 'Partita non valida.');
  const ref = db.collection('duels').doc(duelId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().player1.id !== uid || snap.data().status !== 'waiting') return { started: false };
    tx.update(ref, {
      player2: { id: 'neurobot', name: '🤖 NeuroBot', score: 0, bot: true }, status: 'playing',
      startedAt: admin.firestore.FieldValue.serverTimestamp(), botNextAt: Date.now() + 3000 + Math.floor(Math.random() * 4000),
    });
    return { started: true };
  });
});

exports.cancelNeuralDuelLobby = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Accedi per giocare.');
  const duelId = String(data && data.duelId || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(duelId)) throw new functions.https.HttpsError('invalid-argument', 'Partita non valida.');
  const ref = db.collection('duels').doc(duelId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().player1.id !== context.auth.uid || snap.data().status !== 'waiting') return { cancelled: false };
    tx.update(ref, { status: 'cancelled' });
    return { cancelled: true };
  });
});

exports.submitNeuralDuelAnswer = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Accedi per giocare.');
  const uid = context.auth.uid;
  await requireDuelPlan(uid);
  const duelId = String(data && data.duelId || '');
  const answer = typeof (data && data.answer) === 'string' ? data.answer.slice(0, 300) : '';
  const index = Number(data && data.questionIndex);
  const botTurn = data && data.botTurn === true;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(duelId) || !Number.isInteger(index) || index < 0 || index >= DUEL_QUESTIONS.length || (!botTurn && !answer)) {
    throw new functions.https.HttpsError('invalid-argument', 'Risposta non valida.');
  }
  const ref = db.collection('duels').doc(duelId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Partita non trovata.');
    const state = snap.data();
    if (state.status !== 'playing' || state.questionIndex !== index) return { accepted: false, stale: true };
    const field = state.player1.id === uid ? 'player1' : state.player2 && state.player2.id === uid ? 'player2' : null;
    if (botTurn) {
      if (state.player1.id !== uid || !state.player2?.bot || Date.now() < Number(state.botNextAt || 0)) return { accepted: false };
      const correct = Math.random() < 0.62;
      const nextIdx = correct ? (index + 1) % DUEL_QUESTIONS.length : index;
      const score = (state.player2.score || 0) + (correct ? 1 : 0);
      const patch = { botNextAt: Date.now() + 3000 + Math.floor(Math.random() * 4000) };
      if (correct) {
        patch['player2.score'] = score;
        patch.questionIndex = nextIdx;
        patch.currentQuestion = duelQuestion(nextIdx);
      }
      if (score >= 5) { patch.status = 'finished'; patch.winner = 'player2'; }
      tx.update(ref, patch);
      return { accepted: true, correct, score };
    }
    if (!field) throw new functions.https.HttpsError('permission-denied', 'Non partecipi a questa partita.');
    const correct = answer === DUEL_QUESTIONS[index].a;
    if (!correct) return { accepted: true, correct: false };
    const score = (state[field].score || 0) + 1;
    const nextIdx = (index + 1) % DUEL_QUESTIONS.length;
    const patch = { [`${field}.score`]: score, questionIndex: nextIdx, currentQuestion: duelQuestion(nextIdx) };
    if (score >= 5) { patch.status = 'finished'; patch.winner = field; }
    tx.update(ref, patch);
    return { accepted: true, correct: true, score };
  });
});

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

    // La paginazione automatica evita che i limiti a 50/100 falsino gli aggregati
    // quando lo storico cresce. Conserviamo solo somme e ultimi 10 pagamenti.
    const balanceObj = await stripe.balance.retrieve();
    let mrr = 0, activeSubscriptionCount = 0, successfulChargeCount = 0, totalRevenue = 0;
    const recentPayments = [];
    const subsByPlan = { student: 0, pro: 0, trialing: 0, canceled: 0, other: 0 };
    for await (const s of stripe.subscriptions.list({ limit: 100, status: 'all', expand: ['data.items.data.price'] })) {
      if (s.status === 'active' || s.status === 'trialing') {
        activeSubscriptionCount++;
        const price = s.items.data[0]?.price;
        if (price) {
          const amount = (price.unit_amount || 0) / 100;
          mrr += price.recurring?.interval === 'year' ? amount / 12 : amount;
        }
      }
      if (s.status === 'canceled') subsByPlan.canceled++;
      else if (s.status === 'trialing') subsByPlan.trialing++;
      else {
        const priceId = s.items.data[0]?.price?.id || '';
        if (priceId === process.env.STRIPE_PRICE_STUDENT) subsByPlan.student++;
        else if (priceId === process.env.STRIPE_PRICE_PRO) subsByPlan.pro++;
        else subsByPlan.other++;
      }
    }
    for await (const c of stripe.charges.list({ limit: 100 })) {
      if (c.paid) {
        successfulChargeCount++;
        totalRevenue += Math.max(0, c.amount - (c.amount_refunded || 0)) / 100;
      }
      if (recentPayments.length < 10) recentPayments.push({
        id: c.id, amount: c.amount / 100, currency: c.currency.toUpperCase(),
        status: c.paid ? ((c.amount_refunded || 0) > 0 ? 'refunded' : 'paid') : 'failed',
        description: c.description || c.metadata?.plan || '—',
        date: c.created * 1000, email: c.billing_details?.email || '—',
      });
    }

    // Saldo disponibile Stripe
    const availableBalance = (balanceObj.available || []).filter(b => b.currency === 'eur')
      .reduce((s, b) => s + b.amount / 100, 0);

    // ── Firestore: utenti per piano ──
    // Data odierna in timezone Europe/Rome (non UTC), per allinearsi ai contatori
    // 'pageviews_<data>' scritti dal client (anch'esso in Europe/Rome).
    const romeNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const today = `${romeNow.getFullYear()}-${String(romeNow.getMonth() + 1).padStart(2, '0')}-${String(romeNow.getDate()).padStart(2, '0')}`;
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [usersSnap, presenceSnap, pageviewsDoc, analyticsAllSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('analytics').doc('presence').collection('sessions')
        .where('lastSeen', '>', fiveMinsAgo).get(),
      db.collection('analytics').doc('pageviews_' + today).get(),
      db.collection('analytics').get(),
    ]);

    const ADMIN_UID = 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2';  // account di Francesco: escluso dalle statistiche
    const usersByPlan = { free: 0, student: 0, pro: 0, other: 0 };
    const realUserIds = new Set();  // uid degli utenti REALI (doc in Firestore)
    let usersWithFCM = 0;
    let usersWithSparks = 0;
    let usersActivated = 0;   // activation VERA (activation.activated) da services/activation.js
    let usersNoEmail = 0;     // utenti senza email (anonimi/non-Google): non sono "account Google"
    const registrationByMonth = {};

    usersSnap.docs.forEach(doc => {
      if (doc.id === ADMIN_UID) return;  // non contare l'admin tra gli utenti reali
      realUserIds.add(doc.id);
      const d = doc.data();
      const plan = d.plan || 'free';
      if (plan === 'free') usersByPlan.free++;
      else if (plan === 'student') usersByPlan.student++;
      else if (plan === 'pro') usersByPlan.pro++;
      else usersByPlan.other++;

      if (d.fcmToken) usersWithFCM++;
      if ((d.sparksBalance || 0) > 0) usersWithSparks++;
      if (d.activation && d.activation.activated) usersActivated++;
      if (!d.email) usersNoEmail++;

    });

    // ── Attività reale utenti (Firebase Auth: lastSignInTime / lastRefreshTime) ──
    // Risponde a: dei nostri iscritti, chi ha DAVVERO aperto/riaperto l'app?
    // Auth registra questi timestamp in automatico ad ogni accesso: 0 modifiche all'app.
    let usersActive7d = 0;   // hanno aperto l'app negli ultimi 7 giorni
    let usersReturned = 0;   // sono tornati almeno una volta DOPO la registrazione
    let usersEverOpened = 0; // hanno fatto almeno un accesso (loginato)
    let authMetricsAvailable = false;
    let authAccountsTotal = 0;
    let authAnonymousTotal = 0;
    let authDisabledTotal = 0;
    let authProfilesMissing = 0;
    let newUsersToday = null;
    const authAct = {};      // uid -> {lastActive, returned, active7d} per il dettaglio
    try {
      authMetricsAvailable = true;
      newUsersToday = 0;
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
      let pageToken;
      do {
        const list = await admin.auth().listUsers(1000, pageToken);
        list.users.forEach(u => {
          if (u.uid === ADMIN_UID) return;
          // GDPR account deletion removes the Firestore profile and leaves the
          // Auth identity disabled during the recovery window. Exclude these
          // tombstones from current registrations/activity and report them apart.
          if (u.disabled === true) {
            authDisabledTotal++;
            return;
          }
          const md = u.metadata || {};
          const created  = md.creationTime    ? new Date(md.creationTime).getTime()    : 0;
          // Un account registrato ha almeno un provider collegato. I guest anonimi
          // sono tenuti separati e non vengono contati come nuove iscrizioni.
          const linkedAccount = Array.isArray(u.providerData) && u.providerData.length > 0;
          if (linkedAccount) {
            authAccountsTotal++;
            if (created) {
              const dayParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
              }).formatToParts(new Date(created)).map(p => [p.type, p.value]));
              if (`${dayParts.year}-${dayParts.month}-${dayParts.day}` === today) newUsersToday++;
            }
            if (created) {
              const monthParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit'
              }).formatToParts(new Date(created)).map(p => [p.type, p.value]));
              const month = `${monthParts.year}-${monthParts.month}`;
              registrationByMonth[month] = (registrationByMonth[month] || 0) + 1;
            }
          } else authAnonymousTotal++;
          if (!linkedAccount) return; // i guest anonimi non entrano nelle metriche account
          if (!realUserIds.has(u.uid)) authProfilesMissing++;
          const signIn   = md.lastSignInTime  ? new Date(md.lastSignInTime).getTime()  : 0;
          const refresh  = md.lastRefreshTime ? new Date(md.lastRefreshTime).getTime() : 0;
          const lastAct  = Math.max(signIn, refresh);
          const returned = !!(lastAct && created && (lastAct - created) > 18 * 3600 * 1000);
          const active7d = lastAct >= sevenDaysAgo;
          authAct[u.uid] = {
            lastActive: lastAct ? new Date(lastAct).toISOString().slice(0, 10) : null,
            returned, active7d,
            createdMs: created, email: u.email || null,
          };
          if (lastAct) usersEverOpened++;
          if (active7d) usersActive7d++;
          if (returned) usersReturned++;
        });
        pageToken = list.pageToken;
      } while (pageToken);
    } catch (e) {
      authMetricsAvailable = false;
      newUsersToday = null;
      Object.keys(registrationByMonth).forEach(k => delete registrationByMonth[k]);
      console.error('[adminDashboard] auth activity error:', e);
    }

    // ── Dettaglio per-utente: cosa fanno DAVVERO nell'app ──
    let usersDetail = [];
    try {
      usersDetail = await Promise.all(
        usersSnap.docs.filter(x => x.id !== ADMIN_UID).map(async (doc) => {
          const d = doc.data();
          const uid = doc.id;
          let totalCalls = 0, daysActive = 0;
          try {
            const us = await db.collection('usage').doc(uid).collection('daily').get();
            us.forEach(x => { totalCalls += (x.data().calls || 0); daysActive++; });
          } catch (_) {}
          let deckCount = 0, dueCount = 0;
          if (Array.isArray(d.decksMetadata)) {
            deckCount = d.decksMetadata.length;
            dueCount = d.decksMetadata.reduce((s, x) => s + (x.dueCount || 0), 0);
          }
          const a = authAct[uid] || {};
          return {
            uid: uid.slice(0, 6),
            email: d.email || (authAct[uid] || {}).email || null,
            source: d.acquisitionSource || d.source || 'n/d',
            campaign: d.acquisitionCampaign || null,
            plan: d.plan || 'free',
            sparks: d.sparksBalance || 0,
            created: a.createdMs ? new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome' }).format(new Date(a.createdMs)) : null,
            lastActive: a.lastActive || null,
            returned: !!a.returned,
            active7d: !!a.active7d,
            totalCalls, daysActive, deckCount, dueCount,
          };
        })
      );
      // ordina: prima chi usa di più (per capire subito attivi vs persi)
      usersDetail.sort((x, y) => (y.totalCalls - x.totalCalls) || (y.daysActive - x.daysActive));
    } catch (e) {
      console.error('[adminDashboard] usersDetail error:', e);
    }

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

    // ── JOURNEYS: percorso per-visitatore (guest inclusi), da collezione 'journeys' ──
    let journeys = [];
    let journeyFunnel = { landing_view: 0, app_open: 0, onboarding_start: 0, cards_generated: 0, study_session_start: 0, activated: 0, tolc_sim_open: 0, tolc_sim_complete: 0, visitors: 0 };
    try {
      const EVENT_WINDOW_DAYS = 7;
      const EVENT_PAGE_SIZE = 1000;
      const eventWindowStart = Date.now() - EVENT_WINDOW_DAYS * 24 * 3600 * 1000;
      const evDocs = [];
      let cursor = null;
      let ordered = true;
      while (true) {
        let query = db.collectionGroup('events')
          .orderBy('ts', 'desc')
          .limit(EVENT_PAGE_SIZE);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        if (!page.size) break;
        cursor = page.docs[page.docs.length - 1];
        let reachedWindowStart = false;
        for (const doc of page.docs) {
          const value = doc.get('ts');
          const ts = value && value.toMillis ? value.toMillis() : 0;
          if (ts < eventWindowStart) { reachedWindowStart = true; break; }
          evDocs.push(doc);
        }
        if (reachedWindowStart) break;
        if (page.size < EVENT_PAGE_SIZE) break;
      }
      const byVid = {};
      evDocs.forEach(doc => {
        const parent = doc.ref.parent.parent;
        if (!parent || parent.parent.id !== 'journeys') return;
        const vid = parent.id;
        if (!vid || vid.indexOf('TEST_') === 0) return;
        const x = doc.data() || {};
        const ts = (x.ts && x.ts.toMillis) ? x.ts.toMillis() : (x.t_client || 0);
        // 25/09/2026 v3: teniamo solo i campi meta utili al funnel (niente contenuti utente)
        const _m = x.meta || {};
        const meta = { reason: _m.reason || null, stage: _m.stage || null, test: _m.test || _m.direct || null, step: (_m.step != null ? _m.step : (_m.last_step != null ? _m.last_step : null)), answered: (typeof _m.answered === 'number' ? _m.answered : null), platform: ['android_twa', 'android_web', 'mobile_web', 'tablet_web', 'desktop_web'].includes(_m.platform) ? _m.platform : null, acquisition_source: String(_m.acquisition_source || '').slice(0, 40) || null, acquisition_campaign: String(_m.acquisition_campaign || '').slice(0, 80) || null, auth_created_recently: _m.auth_created_recently === true };
        (byVid[vid] = byVid[vid] || []).push({ type: x.type || '', page: x.page || '', ts, source: x.source || (x.meta && x.meta.source) || null, meta });
      });
      const STAGES = ['landing_view', 'app_open', 'onboarding_start', 'cards_generated', 'study_session_start', 'activated', 'tolc_sim_open', 'tolc_sim_complete'];
      const rows = [];
      Object.keys(byVid).forEach(vid => {
        const evs = byVid[vid].sort((a, b) => a.ts - b.ts);
        const types = new Set(evs.map(e => e.type));
        STAGES.forEach(st => { if (types.has(st)) journeyFunnel[st]++; });
        const first = evs[0] || {}, last = evs[evs.length - 1] || {};
        // Il campo event.source dei record storici era spesso il default "direct".
        // La sorgente acquisizione affidabile è quella salvata nel meta del browser.
        const src = (evs.find(e => e.meta && e.meta.acquisition_source) || {}).meta?.acquisition_source
          || (evs.find(e => e.source && e.source !== 'direct') || {}).source
          || (evs.find(e => e.source) || {}).source || 'n/d';
        const campaign = (evs.find(e => e.meta && e.meta.acquisition_campaign) || {}).meta?.acquisition_campaign || null;
        const durSec = Math.max(0, Math.round(((last.ts || 0) - (first.ts || 0)) / 1000));
        let outcome = 'bounce';
        if (types.has('activated')) outcome = 'attivato';
        else if (evs.some(e => e.type === 'sign_up' && e.meta.auth_created_recently)) outcome = 'account_creato';
        else if (types.has('first_login_data_migrated')) outcome = 'account_collegato';
        else if (types.has('sign_up')) outcome = 'signup_non_verificato';
        else if (types.has('cards_generated')) outcome = 'ha_generato';
        else if (types.has('app_open')) outcome = 'in_app';
        const path = [];
        evs.forEach(e => { if (e.type && e.type !== path[path.length - 1]) path.push(e.type); });
        rows.push({ vid: String(vid).slice(0, 8), source: src, campaign, entry: (first.page || ''), steps: evs.length, lastStep: (last.type || ''), durSec, outcome, path: path.slice(0, 14), lastTs: (last.ts || 0) });
      });
      journeyFunnel = require('./journey-summary.cjs').summarizeJourneys(
        Object.entries(byVid).flatMap(([vid, events]) => events.map(event => ({ ...event, vid }))),
        { ordered, limited: false, windowDays: EVENT_WINDOW_DAYS, sampleLimit: null }
      );
      rows.sort((a, b) => b.lastTs - a.lastTs);
      // Tabella dettaglio: SOLO visitatori attivi OGGI, dalla mezzanotte (Europe/Rome)
      // fino ad ora — giorno di calendario, non una finestra mobile di 24h.
      // Coerente con i contatori pageviews_<data> (anch'essi su mezzanotte Roma).
      const _romeNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      const _msSinceMidnight = _romeNow.getHours() * 3600000 + _romeNow.getMinutes() * 60000 + _romeNow.getSeconds() * 1000 + _romeNow.getMilliseconds();
      const _todayStart = Date.now() - _msSinceMidnight;
      journeys = rows.filter(r => (r.lastTs || 0) >= _todayStart).slice(0, 400);
    } catch (e) {
      journeyFunnel = { coverage: { status: 'unavailable' } };
      console.error('[adminDashboard] journeys error:', (e && e.message) || e);
    }

    res.json({
      ts: Date.now(),
      journeys,
      journeyFunnel,
      usersDetail,
      stripe: {
        mrr: Math.round(mrr * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        availableBalance: Math.round(availableBalance * 100) / 100,
        activeSubscriptions: activeSubscriptionCount,
        subsByPlan,
        recentPayments,
        successfulChargeCount,
      },
      firestore: {
        totalUsers: usersSnap.docs.filter(x => x.id !== ADMIN_UID).length,
        newUsersToday,
        authMetricsAvailable,
        authAccountsTotal: authMetricsAvailable ? authAccountsTotal : null,
        authAnonymousTotal: authMetricsAvailable ? authAnonymousTotal : null,
        authDisabledTotal: authMetricsAvailable ? authDisabledTotal : null,
        authProfilesMissing: authMetricsAvailable ? authProfilesMissing : null,
        usersByPlan,
        usersWithFCM,
        usersWithSparks,
        usersActivated,
        usersNoEmail,
        usersEverOpened: authMetricsAvailable ? usersEverOpened : null,
        usersActive7d: authMetricsAvailable ? usersActive7d : null,
        usersReturned: authMetricsAvailable ? usersReturned : null,
        registrationByMonth: authMetricsAvailable ? registrationByMonth : null,
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
  const origin = req.headers.origin;
  if (security.ORIGINS.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Access-Control-Allow-Credentials', 'true'); }
  res.set('Vary', 'Origin');
  res.set('Cache-Control', 'no-store');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}
function tiktokCheckSecret(req, res) {
  const credential = security.adminCredential(req, process.env.DASHBOARD_SECRET);
  if (!credential) { res.status(401).json({error:'Unauthorized'}); return false; }
  req.adminCredentialHash = security.hash(credential);
  return true;
}
exports.tiktokAdminSession = functions.https.onRequest(async (req, res) => {
  tiktokAdminCors(req, res);
  if(req.method === 'OPTIONS') {res.status(204).send('');return;}
  if(req.method !== 'POST') {res.status(405).json({error:'Method not allowed'});return;}
  if(!ipRateLimit(getClientIp(req),{maxRequests:10,windowMs:60000})) {res.status(429).json({error:'Too many requests'});return;}
  const secret = process.env.DASHBOARD_SECRET;
  if(!secret || !security.equal(req.headers.authorization || '', 'Bearer '+secret)) {res.status(401).json({error:'Unauthorized'});return;}
  res.set('Set-Cookie', security.SESSION_COOKIE+'='+security.signSession(secret)+'; HttpOnly; Secure; SameSite=Lax; Path=/api/tiktok; Max-Age=1800');
  res.json({success:true});
});

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

// GET /api/tiktok/auth with admin session or Bearer → one-use authorization URL.
exports.tiktokAuthUrl = functions.https.onRequest(async (req, res) => {
  tiktokAdminCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (!tiktokCheckSecret(req, res)) return;

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || 'https://cortexapp.it/oauth/callback';
  if (!clientKey) { res.status(500).json({ error: 'TIKTOK_CLIENT_KEY non configurata' }); return; }

  const oauthState = crypto.randomBytes(32).toString('hex');
  await db.collection('_oauthStates').doc(security.hash(oauthState)).set({credentialHash:req.adminCredentialHash, expiresAt:Date.now()+10*60e3});
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: oauthState,
  });
  res.json({url: `${TIKTOK_AUTH_URL}?${params.toString()}`});
});

// POST /api/tiktok/exchange { code } → scambia il code OAuth con un access token
exports.tiktokExchangeToken = functions.https.onRequest(async (req, res) => {
  tiktokAdminCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (!tiktokCheckSecret(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { code, state: oauthState } = req.body || {};
  if (!code || typeof code !== 'string') { res.status(400).json({ error: 'Parametro code obbligatorio' }); return; }

  if(typeof oauthState !== 'string' || !/^[a-f0-9]{64}$/.test(oauthState)){res.status(400).json({error:'OAuth state non valido'});return;}
  try {
    await security.consumeOAuthState(db, oauthState, req.adminCredentialHash);
  } catch (_) {res.status(403).json({error:'Autorizzazione scaduta o già utilizzata. Ricomincia il collegamento.'});return;}
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
  let ttsDailyLimit = 0;
  if (!isAdmin) {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    let plan = userData.plan || 'free';
    if (plan === 'free' && userData.trialPlan && userData.trialExpiresAt > Date.now()) {
      plan = userData.trialPlan || 'student';
    }
    if (plan !== 'student' && plan !== 'pro') {
      res.status(403).json({ error: 'PREMIUM_REQUIRED', message: 'Cloud TTS richiede piano Student o Pro' });
      return;
    }
    ttsDailyLimit = plan === 'pro'
      ? Math.max(100, Number(process.env.TTS_PRO_DAILY_LIMIT) || 500)
      : Math.max(25, Number(process.env.TTS_STUDENT_DAILY_LIMIT) || 100);
  }

  // Validazione input
  const { text, voice, speakingRate, pitch } = req.body || {};
  if (!text || typeof text !== 'string' || text.length > 2000) {
    res.status(400).json({ error: 'Parametro text non valido (max 2000 caratteri)' }); return;
  }
  const rate = speakingRate === undefined ? 0.90 : Number(speakingRate);
  const voicePitch = pitch === undefined ? -2.0 : Number(pitch);
  if (!Number.isFinite(rate) || !Number.isFinite(voicePitch)) {
    res.status(400).json({ error: 'Parametri vocali non validi' }); return;
  }
  const allowedVoices = new Set(['it-IT-Neural2-C']);
  if (voice && !allowedVoices.has(voice)) {
    res.status(400).json({ error: 'Voce non supportata' }); return;
  }

  if (!isAdmin) {
    const today = new Date().toISOString().slice(0, 10);
    const usageRef = db.collection('usage').doc(uid).collection('daily').doc(today);
    try {
      const quota = await db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef);
        const used = snap.exists ? Number(snap.data().ttsCalls || 0) : 0;
        if (used >= ttsDailyLimit) return false;
        tx.set(usageRef, {
          ttsCalls: used + 1,
          ttsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 35 * 86400000),
        }, { merge: true });
        return true;
      });
      if (!quota) { res.status(429).json({ error: 'TTS_DAILY_LIMIT_REACHED', limit: ttsDailyLimit }); return; }
    } catch (err) {
      console.error('[textToSpeech] quota unavailable:', err.code || 'unknown');
      res.status(503).json({ error: 'Quota temporaneamente non verificabile. Riprova.' }); return;
    }
  }

  // Chiama Google Cloud TTS via googleapis (usa ADC del service account della Function)
  try {
    const google = getGoogle();
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
          speakingRate: Math.min(Math.max(rate, 0.25), 4.0),
          pitch: Math.min(Math.max(voicePitch, -20.0), 20.0),
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

// ═══════════════════════════════════════════════════════════════════════════
//  EMAIL DI RITORNO (12/08/2026) — invio via SMTP Aruba (info@cortexapp.it)
//  Recupera gli utenti che si iscrivono e non tornano: benvenuto (Giorno 0),
//  promemoria (Giorno 1) e nudge (Giorno 3). La password Aruba NON è nel codice:
//  sta in functions/.env come ARUBA_PASS (mai committare). ARUBA_USER opzionale.
// ═══════════════════════════════════════════════════════════════════════════
const nodemailer = require('nodemailer');
const ARUBA_USER = process.env.ARUBA_USER || 'info@cortexapp.it';

let _mailer = null;
function getMailer() {
  if (_mailer) return _mailer;
  if (!process.env.ARUBA_PASS) { console.warn('[email] ARUBA_PASS mancante in .env — invio saltato'); return null; }
  _mailer = nodemailer.createTransport({
    host: 'smtps.aruba.it', port: 465, secure: true,
    auth: { user: ARUBA_USER, pass: process.env.ARUBA_PASS },
  });
  return _mailer;
}

// Layout email (dark header viola + card chiara + bottone CTA). Inline-only.
function emailLayout(titolo, corpoHtml, ctaTesto, ctaUrl) {
  return `<div style="margin:0;padding:24px;background:#0f1020;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#16172a;border:1px solid #26263a;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:22px 26px;">
        <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-.3px;">Cortex</div>
      </div>
      <div style="padding:26px 28px;color:#e8e8f0;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#fff;">${titolo}</h1>
        <div style="font-size:15px;line-height:1.65;color:#c7c7d6;">${corpoHtml}</div>
        <a href="${ctaUrl}" style="display:inline-block;margin:22px 0 6px;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:13px 26px;border-radius:100px;">${ctaTesto}</a>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #26263a;color:#6b6b82;font-size:12px;line-height:1.6;">
        Cortex · <a href="https://cortexapp.it" style="color:#a855f7;text-decoration:none;">cortexapp.it</a><br>
        Ricevi questa email perché hai un account Cortex. Se non vuoi più riceverle, rispondi a questa mail scrivendo STOP.
      </div>
    </div>
  </div>`;
}

const EMAILS = {
  welcome: {
    subject: 'Benvenuto in Cortex',
    html: emailLayout('Benvenuto in Cortex',
      'Hai appena creato il tuo account. Ora la parte bella: <b>carichi i tuoi appunti</b> (anche una foto o un PDF) e Cortex li trasforma in flashcard, poi ti interroga. Bastano 2 minuti per il primo mazzo.',
      'Crea il primo mazzo →', 'https://cortexapp.it/app?utm_source=email&utm_campaign=welcome'),
  },
  d1: {
    subject: 'Hai flashcard da ripassare',
    html: emailLayout('Il ripasso funziona se è costante',
      'Torna su Cortex e fai un giro veloce: <b>5 minuti</b> bastano per fissare quello che hai studiato. Il momento migliore per ripassare è proprio ora.',
      'Ripassa ora →', 'https://cortexapp.it/app?utm_source=email&utm_campaign=d1'),
  },
  d3: {
    subject: 'Non perdere il ritmo',
    html: emailLayout('Non perdere il ritmo',
      'Chi ripassa <b>poco e spesso</b> ricorda molto di più di chi studia tutto all’ultimo. Riprendi da dove eri: il tuo materiale è ancora lì che ti aspetta.',
      'Riprendi a studiare →', 'https://cortexapp.it/app?utm_source=email&utm_campaign=d3'),
  },
};

async function inviaEmail(to, tipo) {
  const m = getMailer();
  if (!m || !to) return false;
  const e = EMAILS[tipo];
  const opts = { from: `Cortex <${ARUBA_USER}>`, to, subject: e.subject, html: e.html };
  // Copia della welcome a te (info@) → verifica automatica + storico di cosa
  // ricevono i nuovi iscritti. Solo la welcome, per non intasare la casella.
  if (tipo === 'welcome') opts.bcc = ARUBA_USER;
  try {
    await m.sendMail(opts);
    return true;
  } catch (err) {
    console.error(`[email] invio ${tipo} a ${to} fallito:`, err.message);
    return false;
  }
}

// GIORNO 0 — benvenuto appena l'utente crea l'account.
exports.welcomeEmail = functions.auth.user().onCreate(async (user) => {
  if (!user.email) return null;
  const ok = await inviaEmail(user.email, 'welcome');
  if (ok) console.log('[email] welcome inviata a', user.email);
  return null;
});

// GIORNO 1 e GIORNO 3 — promemoria di ritorno. Gira ogni giorno alle 10:00.
exports.reengageEmails = functions.pubsub.schedule('0 10 * * *')
  .timeZone('Europe/Rome')
  .onRun(async () => {
    if (!process.env.ARUBA_PASS) { console.warn('[email] ARUBA_PASS mancante — reengage saltato'); return null; }
    const now = Date.now();
    const T = admin.firestore.Timestamp;
    const finestre = [
      { tipo: 'd1', flag: 'emailD1Sent', da: now - 48 * 3600e3, a: now - 24 * 3600e3 },
      { tipo: 'd3', flag: 'emailD3Sent', da: now - 96 * 3600e3, a: now - 72 * 3600e3 },
    ];
    for (const f of finestre) {
      let snap;
      try {
        snap = await db.collection('users')
          .where('createdAt', '>=', T.fromMillis(f.da))
          .where('createdAt', '<', T.fromMillis(f.a))
          .get();
      } catch (e) { console.error('[email] query', f.tipo, e.message); continue; }
      for (const doc of snap.docs) {
        const d = doc.data();
        if (d[f.flag]) continue;                       // già mandata
        let email = d.email;
        if (!email) {                                   // fallback: prendi da Auth
          try { email = (await admin.auth().getUser(doc.id)).email; } catch (_) {}
        }
        if (!email) continue;
        const ok = await inviaEmail(email, f.tipo);
        if (ok) {
          try { await doc.ref.update({ [f.flag]: true }); } catch (_) {}
          console.log(`[email] ${f.tipo} inviata a`, email);
        }
      }
    }
    return null;
  });

// Anonymous telemetry: bounded ingress, no direct client database writes.
exports.telemetry = functions.runWith({maxInstances:5}).https.onRequest(require("./telemetry").handler({db,admin,ipRateLimit,secret:()=>process.env.DASHBOARD_SECRET}));
