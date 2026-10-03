'use strict';
/**
 * Quote e tetto di spesa per il proxy Gemini (audit 2026-10, fase 1.4).
 *
 * Prima: ogni account anonimo (creabile via API senza captcha) aveva 25 chiamate
 * al giorno e non esisteva un tetto complessivo → proxy AI di fatto aperto.
 * Ora:
 *  - livelli: admin | anon | free | trial | student | pro (da entitlements.effectivePlan);
 *  - anonimi: quota per account bassa (default 5/giorno) e risposta più corta;
 *  - tetto GLOBALE giornaliero per le chiamate non pagate (anonimi e free/trial),
 *    con contatore suddiviso in shard per evitare un documento "caldo";
 *  - chi paga (student/pro) o usa Sparks non è bloccato dal tetto globale;
 *  - restituzione della quota (e dello Spark) se la chiamata AI fallisce, una
 *    sola volta per operazione.
 * Un tetto di CHIAMATE non è un tetto MONETARIO: il costo dipende anche dai
 * token. Per questo restano i limiti di modello (solo Flash), payload e
 * maxOutputTokens, e la concorrenza è limitata da maxInstances nella Function.
 * Tutti i valori sono configurabili da functions/.env senza cambiare codice.
 */
const DEFAULTS = Object.freeze({
  anonPerUser: 5,
  freePerUser: 25,
  studentPerUser: 100,
  proPerUser: 2000,
  anonGlobal: 500,      // chiamate/giorno di TUTTI gli anonimi insieme
  unpaidGlobal: 3000,   // chiamate/giorno di anonimi + free + trial insieme
  shards: 10,
  anonMaxOutputTokens: 4096,
  maxOutputTokens: 8192,
});
const num = (v, d, min = 0) => { const n = Number(v); return Number.isFinite(n) && n >= min ? Math.floor(n) : d; };

function limitsFromEnv(env = {}) {
  return {
    anonPerUser: num(env.GEMINI_ANON_DAILY_LIMIT, DEFAULTS.anonPerUser),
    freePerUser: num(env.GEMINI_FREE_DAILY_LIMIT, DEFAULTS.freePerUser),
    studentPerUser: num(env.GEMINI_STUDENT_DAILY_LIMIT, DEFAULTS.studentPerUser),
    proPerUser: Math.max(100, num(env.GEMINI_PRO_DAILY_LIMIT, DEFAULTS.proPerUser)),
    anonGlobal: num(env.GEMINI_ANON_GLOBAL_DAILY_LIMIT, DEFAULTS.anonGlobal),
    unpaidGlobal: num(env.GEMINI_UNPAID_GLOBAL_DAILY_LIMIT, DEFAULTS.unpaidGlobal),
    shards: Math.min(50, Math.max(1, num(env.GEMINI_BUDGET_SHARDS, DEFAULTS.shards, 1))),
    anonMaxOutputTokens: num(env.GEMINI_ANON_MAX_OUTPUT_TOKENS, DEFAULTS.anonMaxOutputTokens, 1),
    maxOutputTokens: DEFAULTS.maxOutputTokens,
  };
}

/** @returns {{tier:string, paying:boolean, perUser:number|null}} */
function classify({ token, userData, isAdmin, limits, now = Date.now(), entitlements }) {
  if (isAdmin) return { tier: 'admin', paying: true, perUser: null };
  const provider = token && token.firebase && token.firebase.sign_in_provider;
  if (provider === 'anonymous') return { tier: 'anon', paying: false, perUser: limits.anonPerUser };
  const ep = entitlements.effectivePlan(userData, now);
  if (ep.trial) return { tier: 'trial', paying: false, perUser: limits.studentPerUser };
  if (ep.plan === 'pro') return { tier: 'pro', paying: true, perUser: limits.proPerUser };
  if (ep.plan === 'student') return { tier: 'student', paying: true, perUser: limits.studentPerUser };
  return { tier: 'free', paying: false, perUser: limits.freePerUser };
}

const dayKey = now => new Date(now).toISOString().slice(0, 10);

/**
 * Addebita UNA chiamata in transazione. Nessun effetto esterno qui dentro.
 * @returns {Promise<{ok:true, receipt:object}|{ok:false, status:number, error:string}>}
 */
async function charge({ db, admin, uid, token, isAdmin, limits, entitlements, now = Date.now(), rand = Math.random }) {
  if (isAdmin) return { ok: true, receipt: { tier: 'admin', counted: false } };
  const FieldValue = admin.firestore.FieldValue;
  const day = dayKey(now);
  const userRef = db.collection('users').doc(uid);
  const usageRef = db.collection('usage').doc(uid).collection('daily').doc(day);
  const shard = Math.floor(rand() * limits.shards) % limits.shards;
  const shardRef = db.collection('_aiBudget').doc(`${day}_s${shard}`);
  const expiresAt = new Date(now + 35 * 86400e3);
  const perShard = cap => Math.ceil(cap / limits.shards);

  return db.runTransaction(async tx => {
    const [userDoc, usageDoc] = await Promise.all([tx.get(userRef), tx.get(usageRef)]);
    const userData = userDoc.exists ? userDoc.data() : {};
    const c = classify({ token, userData, isAdmin, limits, now, entitlements });
    const used = Number((usageDoc.exists && usageDoc.data().calls) || 0);
    let usedSpark = false;
    if (c.perUser !== null && used >= c.perUser) {
      const sparks = Number(userData.sparksBalance || 0);
      if (c.tier === 'anon' || sparks <= 0) {
        return { ok: false, status: 429, error: c.tier === 'anon' ? 'GUEST_LIMIT_REACHED' : 'PAYWALL_LIMIT_REACHED' };
      }
      usedSpark = true; // credito pagato: non soggetto al tetto globale
    }
    let shardCounted = null;
    if (!c.paying && !usedSpark) {
      const shardDoc = await tx.get(shardRef);
      const s = shardDoc.exists ? shardDoc.data() : {};
      if (Number(s.unpaid || 0) >= perShard(limits.unpaidGlobal)) return { ok: false, status: 503, error: 'AI_CAPACITY_REACHED' };
      if (c.tier === 'anon' && Number(s.anon || 0) >= perShard(limits.anonGlobal)) return { ok: false, status: 429, error: 'GUEST_LIMIT_REACHED' };
      tx.set(shardRef, { unpaid: FieldValue.increment(1), ...(c.tier === 'anon' ? { anon: FieldValue.increment(1) } : {}), day, expiresAt }, { merge: true });
      shardCounted = { path: shardRef.path, anon: c.tier === 'anon' };
    }
    if (usedSpark) tx.update(userRef, { sparksBalance: FieldValue.increment(-1) });
    tx.set(usageRef, { calls: used + 1, lastUpdated: FieldValue.serverTimestamp(), expiresAt }, { merge: true });
    return { ok: true, receipt: { tier: c.tier, counted: true, day, usedSpark, shard: shardCounted, maxOutputTokens: c.tier === 'anon' ? limits.anonMaxOutputTokens : limits.maxOutputTokens } };
  });
}

/**
 * Restituisce quanto addebitato da charge() quando la chiamata AI fallisce.
 * Il chiamante la invoca al massimo una volta per receipt (flag refunded).
 */
async function refund({ db, admin, uid, receipt }) {
  if (!receipt || !receipt.counted || receipt.refunded) return false;
  receipt.refunded = true;
  const FieldValue = admin.firestore.FieldValue;
  const usageRef = db.collection('usage').doc(uid).collection('daily').doc(receipt.day);
  await db.runTransaction(async tx => {
    const usageDoc = await tx.get(usageRef);
    const used = Number((usageDoc.exists && usageDoc.data().calls) || 0);
    if (used > 0) tx.set(usageRef, { calls: used - 1, refunds: FieldValue.increment(1) }, { merge: true });
    if (receipt.usedSpark) tx.set(db.collection('users').doc(uid), { sparksBalance: FieldValue.increment(1) }, { merge: true });
    if (receipt.shard) {
      const parts = receipt.shard.path.split('/');
      tx.set(db.collection(parts[0]).doc(parts[1]), { unpaid: FieldValue.increment(-1), ...(receipt.shard.anon ? { anon: FieldValue.increment(-1) } : {}) }, { merge: true });
    }
  });
  return true;
}

module.exports = { DEFAULTS, limitsFromEnv, classify, charge, refund, dayKey };
