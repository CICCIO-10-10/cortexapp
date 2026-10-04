// 04/10/2026 — "Generazione flashcard fallita" (Clarity e7z8b1). Causa verificata nei log di
// callGeminiHttp: risposta del server a 36 s (status 200) contro un limite client di 25 s.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { handleAIError } from '../js/utils.js';

const src = fs.readFileSync(new URL('../services/firebase.js', import.meta.url), 'utf8');
const fn = sig => { const a = src.indexOf(sig); const b = src.indexOf('\n}\n', a); return src.slice(a, b + 3).replace(/^export /, ''); };

function geminiCtx(fetchImpl, { abortSignalTimeout = true } = {}) {
    const AS = function () {};
    const ctx = vm.createContext({
        window: { _fbLoggedIn: true },
        firebase: { auth: () => ({ currentUser: { getIdToken: async () => 'tok' } }) },
        fetch: fetchImpl, AbortController, setTimeout, clearTimeout, console, JSON, Error, Number, Array,
        AbortSignal: abortSignalTimeout ? AbortSignal : AS,   // Safari < 16: niente AbortSignal.timeout
        SecurityManager: { getApiKey: () => null },
    });
    vm.runInContext(fn('export async function callGemini('), ctx);
    return ctx;
}
const never = (url, opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));

describe('callGemini — tempi e classificazione degli errori', () => {
    it('attesa oltre il limite → errore di timeout riconoscibile (non generico)', async () => {
        const ctx = geminiCtx(never);
        await expect(vm.runInContext('callGemini("x", { timeoutMs: 30 })', ctx)).rejects.toMatchObject({ isTimeout: true });
    });
    it('funziona anche senza AbortSignal.timeout (Safari < 16)', async () => {
        const ctx = geminiCtx(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }) }), { abortSignalTimeout: false });
        await expect(vm.runInContext('callGemini("x")', ctx)).resolves.toBe('{"a":1}');
    });
    it('il limite predefinito copre le risposte lente viste nei log (36 s) restando sotto i 60 s di Hosting', () => {
        expect(src).toMatch(/: 58000;/);
        expect(src).not.toMatch(/AbortSignal\.timeout\(25000\)/);
    });
    it('errore 500 del proxy → servizio non disponibile', async () => {
        const ctx = geminiCtx(async () => ({ ok: false, status: 500, json: async () => ({ error: 'Errore AI' }) }));
        await expect(vm.runInContext('callGemini("x")', ctx)).rejects.toMatchObject({ isDown: true, proxyStatus: 500 });
    });
});

describe('handleAIError — messaggi utili', () => {
    it('timeout e risposta non valida hanno un messaggio proprio che conferma che il testo resta', () => {
        vi.stubGlobal('navigator', { onLine: true });
        const msgs = [];
        handleAIError({ isTimeout: true }, 'generazione flashcard', m => msgs.push(m));
        handleAIError({ isInvalidOutput: true }, 'generazione flashcard', m => msgs.push(m));
        expect(msgs[0]).toMatch(/più del solito/);
        expect(msgs[1]).toMatch(/formato non valido/);
        expect(msgs.join(' ')).not.toMatch(/Generazione flashcard fallita/);
        expect(msgs.every(m => /testo è ancora qui/.test(m))).toBe(true);
    });
});

describe('deckCreate — risposta AI non valida non è più silenziosa', () => {
    it('JSON non valido → errore isInvalidOutput', async () => {
        const dsrc = fs.readFileSync(new URL('../modules/deckCreate.js', import.meta.url), 'utf8');
        const a = dsrc.indexOf('async function generateAIContent(');
        const b = dsrc.indexOf('function generateSimpleFlashcards', a) - 4;
        const ctx = vm.createContext({ callGemini: async () => '{"summary": "tronc', console, JSON, Error });
        vm.runInContext(dsrc.slice(a, b + 3), ctx);
        await expect(vm.runInContext('generateAIContent("testo", "")', ctx)).rejects.toMatchObject({ isInvalidOutput: true });
    });
});

describe('server — modalità JSON direttamente su v1beta', () => {
    it('niente chiamata v1 destinata a fallire quando è richiesto JSON', () => {
        const idx = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
        expect(idx).toMatch(/normalizedConfig\.responseMimeType \? \[\] :/);
    });
});
