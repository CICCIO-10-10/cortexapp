'use strict';
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const SESSION_COOKIE = '__session'; // Firebase Hosting forwards only this cookie.
const ORIGINS = new Set(['https://cortexapp.it', 'https://www.cortexapp.it', 'https://cortex-74a4e.web.app', 'https://cortex-74a4e.firebaseapp.com', 'https://cortex-app.web.app', 'https://cortex-app.firebaseapp.com']);
function equal(a, b) { return typeof a === 'string' && typeof b === 'string' && a.length > 0 && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function signSession(secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ purpose: 'tiktok-admin', exp: now + 30 * 60e3, nonce: crypto.randomBytes(24).toString('hex') })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
function verifySession(value, secret, now = Date.now()) {
  if (!secret || typeof value !== 'string' || value.length > 1024) return false;
  const [payload, signature, extra] = value.split('.');
  if (extra || !payload || !equal(signature, crypto.createHmac('sha256', secret).update(payload).digest('base64url'))) return false;
  try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString()); return p.purpose === 'tiktok-admin' && Number.isFinite(p.exp) && p.exp > now && p.exp <= now + 30 * 60e3; } catch { return false; }
}
function adminCredential(req, secret) {
  if (!secret) return null;
  const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (equal(bearer, secret)) return bearer;
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
  if (!verifySession(cookie, secret)) return null;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !ORIGINS.has(req.headers.origin)) return null;
  return cookie;
}
const PRODUCTS = Object.freeze({cortex_student_monthly:{plan:'student'},cortex_pro_monthly:{plan:'pro'},cortex_sparks_50:{sparks:50},cortex_sparks_150:{sparks:150},cortex_sparks_500:{sparks:500}});
async function applyPurchase({db, admin, uid, sku, purchaseToken, purchase, HttpsError, now = Date.now()}) {
  const product = Object.hasOwn(PRODUCTS, sku || '') ? PRODUCTS[sku] : null;
  if (!product) throw new HttpsError('invalid-argument', 'Prodotto non valido.');
  const expiry = Number(purchase.expiryTimeMillis);
  if (product.plan ? (![1,2].includes(purchase.paymentState) || !Number.isFinite(expiry) || expiry <= now) : purchase.purchaseState !== 0) throw new HttpsError('failed-precondition', 'Acquisto non attivo.');
  const userRef = db.collection('users').doc(uid), receiptRef = db.collection('_purchaseReceipts').doc(hash(purchaseToken));
  // Migration: legacy receipts lived in users/*. Check every owner, including another account.
  const legacy = product.plan
    ? await db.collection('users').where('googlePlaySubscription.purchaseToken', '==', purchaseToken).get()
    : await db.collection('users').where('googlePlayPurchases', '!=', null).select('googlePlayPurchases').get();
  if (legacy.docs.some(d => d.id !== uid && (product.plan || (d.data().googlePlayPurchases || []).some(p => p.purchaseToken === purchaseToken)))) throw new HttpsError('permission-denied', 'Ricevuta già associata a un altro account.');
  return db.runTransaction(async tx => {
    const receipt = await tx.get(receiptRef), user = await tx.get(userRef), existing = receipt.exists ? receipt.data() : null;
    if (existing && (existing.uid !== uid || existing.sku !== sku)) throw new HttpsError('permission-denied', 'Ricevuta già associata.');
    const data = user.exists ? user.data() : {};
    const legacyUsed = (data.googlePlayPurchases || []).some(p => p.purchaseToken === purchaseToken);
    if (product.sparks && (existing || legacyUsed)) {
      if (!existing) tx.set(receiptRef, {uid, sku, migrated: true, updatedAt: admin.firestore.FieldValue.serverTimestamp()});
      return {success: true, alreadyProcessed: true};
    }
    if (product.plan) {
      tx.set(userRef, {plan: product.plan, planSource: 'google_play', planExpiresAt: admin.firestore.Timestamp.fromMillis(expiry), googlePlaySubscription: {sku, purchaseToken, expiresAt: admin.firestore.Timestamp.fromMillis(expiry), orderId: purchase.orderId || '', autoRenewing: !!purchase.autoRenewing, activatedAt: admin.firestore.FieldValue.serverTimestamp()}}, {merge:true});
    } else {
      tx.set(userRef, {sparksBalance: admin.firestore.FieldValue.increment(product.sparks), googlePlayPurchases: admin.firestore.FieldValue.arrayUnion({sku, purchaseToken, orderId: purchase.orderId || '', purchasedAt: new Date(now).toISOString()}), planSource:'google_play'}, {merge:true});
    }
    tx.set(receiptRef, {uid, sku, updatedAt:admin.firestore.FieldValue.serverTimestamp()}, {merge:true});
    return {success:true, ...(product.plan ? {plan:product.plan} : {sparks:product.sparks})};
  });
}
async function retainLegacyReceipts(db, uid) {
  const user = await db.collection('users').doc(uid).get();
  const data = user.exists ? user.data() : {};
  const receipts = [...(data.googlePlayPurchases || []), ...(data.googlePlaySubscription ? [data.googlePlaySubscription] : [])];
  for(const receipt of receipts) {
    if(typeof receipt.purchaseToken !== 'string' || !receipt.purchaseToken)continue;
    const ref=db.collection('_purchaseReceipts').doc(hash(receipt.purchaseToken));
    await db.runTransaction(async tx=>{const current=await tx.get(ref);if(!current.exists)tx.set(ref,{uid,sku:receipt.sku||'legacy',migrated:true});});
  }
}
async function consumeOAuthState(db, state, credentialHash, now = Date.now()) {
  if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) throw new Error('Invalid state');
  const ref = db.collection('_oauthStates').doc(hash(state));
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref), value = snap.exists ? snap.data() : null;
    if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.credentialHash !== credentialHash) throw new Error('Invalid state');
    tx.delete(ref);
  });
}
module.exports = {hash, equal, signSession, verifySession, adminCredential, SESSION_COOKIE, ORIGINS, PRODUCTS, applyPurchase, retainLegacyReceipts, consumeOAuthState};
