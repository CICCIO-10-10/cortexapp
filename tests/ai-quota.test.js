// Audit 2026-10 — Fase 1.4a: quote AI, tetto globale, restituzione su errore.
// Esegue il codice REALE di callGeminiHttp con Firestore e provider simulati.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const aiQuota = require('../functions/aiQuota.js');
const entitlements = require('../functions/entitlements.js');
const { createFakeFirestore } = require('./helpers/fakeFirestore.cjs');

const NOW = Date.now();
const DAY = new Date(NOW).toISOString().slice(0, 10);
const anon = uid => ({ uid, firebase: { sign_in_provider: 'anonymous' } });
const google = uid => ({ uid, firebase: { sign_in_provider: 'google.com' }, email_verified: true });

function loadGemini(f, { providerOk = true, env = {} } = {}) {
  const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const start = src.indexOf('exports.callGeminiHttp =');
  const end = src.indexOf('\n});', start) + 4;
  const exports = {};
  const calls = { provider: 0, lastBody: null, lastHeaders: null, lastUrl: '' };
  const tokens = new Map();
  vm.runInNewContext(src.slice(start, end), {
    exports, db: f.db, admin: { ...f.admin, auth: () => ({ verifyIdToken: async t => tokens.get(t) }) },
    functions: { runWith: () => ({ https: { onRequest: fn => fn } }) },
    aiQuota, entitlements, observeAppCheck: async () => 'missing',
    getClientIp: () => '1.2.3.4', ipRateLimit: () => true,
    process: { env: { GEMINI_KEY: 'test-key', ...env } }, console: { error() {}, log() {}, warn() {} },
    fetch: async (url, init) => {
      calls.provider++; calls.lastUrl = url; calls.lastBody = JSON.parse(init.body); calls.lastHeaders = init.headers;
      return providerOk
        ? { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) }
        : { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
    },
    Date, JSON, Math, Number, String, Error, Promise, Object,
  });
  const call = async (token, body = {}) => {
    const id = 'tok-' + Math.random(); tokens.set(id, token);
    const res = { code: 200, body: null, set() { return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send() { return this; } };
    await exports.callGeminiHttp({ method: 'POST', headers: { authorization: 'Bearer ' + id }, body: { model: 'gemini-2.5-flash', contents: [{ parts: [{ text: 'ciao' }] }], ...body } }, res);
    return res;
  };
  return { call, calls };
}

describe('callGeminiHttp — quote e tetto di spesa', () => {
  let f;
  beforeEach(() => { f = createFakeFirestore({ now: () => NOW }); });

  it('anonimo: massimo 5 chiamate al giorno, poi GUEST_LIMIT_REACHED (nessuna chiamata al provider)', async () => {
    const g = loadGemini(f);
    for (let i = 0; i < 5; i++) expect((await g.call(anon('A1'))).code).toBe(200);
    const r = await g.call(anon('A1'));
    expect(r).toMatchObject({ code: 429, body: { error: 'GUEST_LIMIT_REACHED' } });
    expect(g.calls.provider).toBe(5);
  });

  it('anonimo: risposta limitata a 4096 token anche se ne chiede di più', async () => {
    const g = loadGemini(f);
    await g.call(anon('A2'), { generationConfig: { maxOutputTokens: 8192 } });
    expect(g.calls.lastBody.generationConfig.maxOutputTokens).toBe(4096);
    await g.call(google('U1'), { generationConfig: { maxOutputTokens: 8192 } });
    expect(g.calls.lastBody.generationConfig.maxOutputTokens).toBe(8192);
  });

  it('tetto globale: molti account gratuiti si fermano al tetto; chi paga no', async () => {
    const g = loadGemini(f, { env: { GEMINI_UNPAID_GLOBAL_DAILY_LIMIT: '6', GEMINI_BUDGET_SHARDS: '1' } });
    for (let i = 0; i < 6; i++) expect((await g.call(google('free' + i))).code).toBe(200);
    expect(await g.call(google('freeX'))).toMatchObject({ code: 503, body: { error: 'AI_CAPACITY_REACHED' } });
    expect(await g.call(anon('anonX'))).toMatchObject({ code: 503 });
    f.rows.set('users/payer', { plan: 'pro', planSource: 'stripe' });
    expect((await g.call(google('payer'))).code).toBe(200);
    expect(g.calls.provider).toBe(7);
  });

  it('tetto anonimi separato e più basso del tetto complessivo', async () => {
    const g = loadGemini(f, { env: { GEMINI_ANON_GLOBAL_DAILY_LIMIT: '3', GEMINI_BUDGET_SHARDS: '1' } });
    for (let i = 0; i < 3; i++) expect((await g.call(anon('n' + i))).code).toBe(200);
    expect(await g.call(anon('n9'))).toMatchObject({ code: 429, body: { error: 'GUEST_LIMIT_REACHED' } });
    expect((await g.call(google('reg1'))).code).toBe(200); // gli account registrati non sono bloccati dal tetto anonimi
  });

  it('errore del provider: quota restituita una volta, nessun dettaglio interno esposto', async () => {
    const g = loadGemini(f, { providerOk: false });
    const r = await g.call(google('U2'));
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('boom');
    expect(f.rows.get(`usage/U2/daily/${DAY}`)).toMatchObject({ calls: 0, refunds: 1 });
    const shard = [...f.rows.entries()].find(([k]) => k.startsWith('_aiBudget/'));
    expect(shard[1].unpaid).toBe(0);
  });

  it('errore del provider dopo uno Spark: lo Spark torna indietro', async () => {
    f.rows.set('users/S1', { plan: 'free', sparksBalance: 2 });
    f.rows.set(`usage/S1/daily/${DAY}`, { calls: 25 });
    const g = loadGemini(f, { providerOk: false });
    await g.call(google('S1'));
    expect(f.rows.get('users/S1').sparksBalance).toBe(2);
    expect(f.rows.get(`usage/S1/daily/${DAY}`).calls).toBe(25);
  });

  it('Spark usato oltre la quota: non conta nel tetto globale; chiave fuori dall\'URL', async () => {
    f.rows.set('users/S2', { plan: 'free', sparksBalance: 1 });
    f.rows.set(`usage/S2/daily/${DAY}`, { calls: 25 });
    const g = loadGemini(f, { env: { GEMINI_UNPAID_GLOBAL_DAILY_LIMIT: '0', GEMINI_BUDGET_SHARDS: '1' } });
    const r = await g.call(google('S2'));
    expect(r.code).toBe(200);
    expect(f.rows.get('users/S2').sparksBalance).toBe(0);
    expect(g.calls.lastUrl).not.toContain('key=');
    expect(g.calls.lastHeaders['x-goog-api-key']).toBe('test-key');
  });

  it('free oltre quota senza Sparks: paywall come prima', async () => {
    f.rows.set(`usage/F1/daily/${DAY}`, { calls: 25 });
    const g = loadGemini(f);
    expect(await g.call(google('F1'))).toMatchObject({ code: 429, body: { error: 'PAYWALL_LIMIT_REACHED' } });
  });

  it('piano Play scaduto e trial: classificati come non paganti', () => {
    const limits = aiQuota.limitsFromEnv({});
    const ts = { toMillis: () => NOW - 1 };
    expect(aiQuota.classify({ token: google('x'), userData: { plan: 'pro', planSource: 'google_play', planExpiresAt: ts }, limits, now: NOW, entitlements })).toMatchObject({ tier: 'free', paying: false });
    expect(aiQuota.classify({ token: google('x'), userData: { trialPlan: 'student', trialExpiresAt: NOW + 1000 }, limits, now: NOW, entitlements })).toMatchObject({ tier: 'trial', paying: false, perUser: 100 });
    expect(aiQuota.classify({ token: google('x'), userData: {}, isAdmin: true, limits, entitlements })).toMatchObject({ tier: 'admin' });
  });

  it('la Function ha un limite di istanze contemporanee', () => {
    const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    expect(src).toMatch(/exports\.callGeminiHttp = functions\.runWith\(\{ maxInstances: \d+ \}\)/);
  });
});
