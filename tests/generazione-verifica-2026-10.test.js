// Verifica 15/10/2026: testo/foto/PDF → flashcard → salvataggio (docs/VERIFICA_GENERAZIONE_2026-10-15.md).
// AI SIMULATA (callGeminiProxy finto): questi test non dicono nulla sulla qualità dell'AI reale.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const proxy = vi.fn();
vi.mock('../core/analytics.js', () => ({ track: vi.fn() }));
vi.mock('../services/activation.js', () => ({ bumpActivation: vi.fn() }));
vi.mock('../core/i18n.js', () => ({ t: k => k }));
vi.mock('../services/fileHandler.js', () => ({ extractTextFromFile: vi.fn() }));
vi.mock('../services/firebase.js', () => ({ SecurityManager: { getApiKey: () => null }, getFunctions: () => null, callGeminiProxy: (...a) => proxy(...a) }));
vi.mock('../modules/gamification.js', () => ({ awardXP: vi.fn(), earnBadge: vi.fn() }));
vi.mock('../modules/deckUtils.js', () => ({ saveState: vi.fn() }));
vi.mock('../data/translations.js', () => ({ TRANSLATIONS: { it: {} } }));

// DOM minimo: ogni id esiste (l'overlay "c'è già"), con value/style/textContent/innerHTML.
function fakeDom(values = {}) {
    const els = new Map();
    const el = id => {
        if (!els.has(id)) els.set(id, { id, value: values[id] ?? '', style: {}, textContent: '', innerHTML: '', appendChild() {}, scrollIntoView() {}, setAttribute() {} });
        return els.get(id);
    };
    return { el, document: { getElementById: el, querySelectorAll: () => [], body: { insertAdjacentHTML() {}, appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {} }) } };
}
const NOTES = 'Appunti sintetici di prova sulla fotosintesi: fase luminosa, ciclo di Calvin, glucosio e ossigeno. '.repeat(3);
const good = () => ({ data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Titolo AI', cards: [{ front: 'D1', back: 'R1' }, { front: 'D2', back: 'R2' }] }) }] } }] } });

let mod, dom, state, toasts;
beforeEach(async () => {
    vi.resetModules();
    proxy.mockReset();
    toasts = [];
    dom = fakeDom({ 'deck-name': 'Biologia', 'deck-subject': '' });
    state = { decks: [] };
    vi.stubGlobal('document', dom.document);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('firebase', { auth: () => ({ currentUser: { uid: 'u-prova' } }) });
    vi.stubGlobal('window', { _legacyState: () => state, showToast: (m, t) => toasts.push([t, m]), __cortexNav() {}, renderDecks() {} });
    mod = await import('../modules/pdfToFlashcards.js');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('materiale importato conservato con la materia', () => {
    // Difetto riprodotto anche nel browser (scripts/verifica-generazione-2026-10/browser.cjs testo/account):
    // la materia salvata dall'anteprima AI aveva nome e carte ma text vuoto; il modulo poi si svuota,
    // quindi gli appunti importati (testo, PDF, OCR) andavano persi.
    it('nuova materia: nome scelto, carte e testo importato', async () => {
        proxy.mockResolvedValue(good());
        await mod.openPdfAIFromText(NOTES, 'Biologia');
        mod.savePdfAIDeck();
        expect(state.decks).toHaveLength(1);
        expect(state.decks[0].name).toBe('Biologia');
        expect(state.decks[0].cards.map(c => [c.q, c.a])).toEqual([['D1', 'R1'], ['D2', 'R2']]);
        expect(state.decks[0].text).toBe(NOTES);
    });
    it('materia già esistente senza testo: le carte si aggiungono e il testo viene salvato', async () => {
        state.decks.push({ id: 'd1', name: 'Biologia', cards: [{ id: 'c0', q: 'vecchia', a: 'x' }], text: '' });
        proxy.mockResolvedValue(good());
        await mod.openPdfAIFromText(NOTES, 'Biologia');
        mod.savePdfAIDeck();
        expect(state.decks).toHaveLength(1);
        expect(state.decks[0].cards).toHaveLength(3);
        expect(state.decks[0].text).toBe(NOTES);
    });
    it('materiale enorme (oltre il limite di sincronizzazione): non si salva, così le carte arrivano comunque sul cloud', async () => {
        // services/firebase.js: un mazzo oltre MAX_DECK_BYTES (900 KB) non viene caricato sul cloud.
        const huge = 'x'.repeat(950 * 1024);
        proxy.mockResolvedValue(good());
        await mod.openPdfAIFromText(huge, 'Biologia');
        mod.savePdfAIDeck();
        expect(state.decks[0].cards).toHaveLength(2);
        expect(JSON.stringify(state.decks[0]).length).toBeLessThan(900 * 1024);
    });
    it('materia già esistente con il suo materiale: non viene sovrascritto', async () => {
        state.decks.push({ id: 'd1', name: 'Biologia', cards: [], text: 'materiale di prima' });
        proxy.mockResolvedValue(good());
        await mod.openPdfAIFromText(NOTES, 'Biologia');
        mod.savePdfAIDeck();
        expect(state.decks[0].text).toBe('materiale di prima');
    });
});

describe('errori della generazione: niente falsi successi, messaggio comprensibile, riprova', () => {
    it('risposta AI non JSON: nessuna carta, pulsante Salva nascosto, messaggio non tecnico; poi la riprova funziona', async () => {
        proxy.mockResolvedValueOnce({ data: { candidates: [{ content: { parts: [{ text: 'Ecco le tue flashcard: {non è json' }] } }] } });
        await mod.openPdfAIFromText(NOTES, 'Biologia');
        expect(dom.el('pdfai-save-btn').style.display).toBe('none');
        expect(dom.el('pdfai-cards-list').innerHTML).not.toMatch(/Unexpected token|JSON/);
        expect(dom.el('pdfai-cards-list').innerHTML).toMatch(/risposta/i);
        mod.savePdfAIDeck();
        expect(state.decks).toHaveLength(0);
        proxy.mockResolvedValueOnce(good());
        await mod.openPdfAIFromText(NOTES, 'Biologia');
        expect(dom.el('pdfai-save-btn').style.display).toBe('');
        mod.savePdfAIDeck();
        expect(state.decks).toHaveLength(1);
    });
    it('errore di rete: messaggio sulla connessione, non "Failed to fetch"', async () => {
        proxy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await mod.openPdfAIFromText(NOTES, 'Biologia');
        expect(dom.el('pdfai-save-btn').style.display).toBe('none');
        expect(dom.el('pdfai-cards-list').innerHTML).not.toMatch(/Failed to fetch/);
        expect(dom.el('pdfai-cards-list').innerHTML).toMatch(/connessione/i);
    });
    it('tempo scaduto: messaggio che dice di riprovare', async () => {
        proxy.mockRejectedValueOnce(Object.assign(new Error('AI_TIMEOUT'), { isTimeout: true }));
        await mod.openPdfAIFromText(NOTES, 'Biologia');
        expect(dom.el('pdfai-cards-list').innerHTML).toMatch(/riprova/i);
        expect(dom.el('pdfai-cards-list').innerHTML).not.toMatch(/AI_TIMEOUT/);
    });
});

// callGeminiProxy (services/firebase.js) è la chiamata usata da "Genera Flashcard con IA".
// Difetto riprodotto nel browser (scenario "blocco"): se /api/gemini non risponde l'attesa non finiva
// mai e, con _generating sempre vero, non si poteva riprovare.
describe('callGeminiProxy: attesa limitata', () => {
    const src = fs.readFileSync(new URL('../services/firebase.js', import.meta.url), 'utf8');
    const a = src.indexOf('export async function callGeminiProxy(');
    const code = src.slice(a, src.indexOf('\n}\n', a) + 3).replace(/^export /, '');
    const never = (url, opts) => new Promise((_, rej) => opts && opts.signal && opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    function ctx(fetchImpl) {
        const c = vm.createContext({
            firebase: { auth: () => ({ currentUser: { getIdToken: async () => 'tok' } }) },
            fetch: fetchImpl, AbortController, setTimeout, clearTimeout, JSON, Error, Number,
        });
        vm.runInContext(code, c);
        return c;
    }
    it('se il servizio non risponde: errore di tempo scaduto riconoscibile (isTimeout)', async () => {
        const c = ctx(never);
        const err = await vm.runInContext('callGeminiProxy({}, { timeoutMs: 50 })', c).catch(e => e);
        expect(err && err.isTimeout).toBe(true);
    });
    it('il limite predefinito resta sotto i 60 s di Hosting, come callGemini', () => {
        expect(code).toMatch(/58000/);
    });
    it('risposta normale: invariata', async () => {
        const c = ctx(async () => ({ ok: true, json: async () => ({ candidates: [] }) }));
        const out = await vm.runInContext('callGeminiProxy({})', c);
        expect(out).toEqual({ data: { candidates: [] } });
    });
});

// OCR (services/ai.js handleImageFile). Difetto riprodotto nel browser (scenario "ocr"): se lo script
// Tesseract dalla CDN non arriva (rete lenta, blocco), il limite di 90 s non scattava — copriva solo il
// riconoscimento — e "Caricamento motore OCR..." restava per sempre.
describe('OCR: caricamento del motore bloccato', () => {
    let ai, appended, toasts2;
    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();
        appended = []; toasts2 = [];
        const box = { classList: { add() {}, remove() {} } };
        vi.stubGlobal('navigator', { onLine: true });
        vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
        vi.stubGlobal('document', {
            getElementById: id => (id === 'deck-text' ? { value: '' } : box),
            createElement: () => ({ remove() { this.removed = true; } }),
            head: { appendChild: s => appended.push(s) },
        });
        vi.stubGlobal('window', { showToast: (m, t) => toasts2.push([t, m]) });
        ai = await import('../services/ai.js');
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('lo script non arriva: entro il limite errore comprensibile, e la riprova ricarica lo script', async () => {
        const run = ai.handleImageFile({ name: 'appunti.png', type: 'image/png' });
        await vi.advanceTimersByTimeAsync(31000);
        await run;                                                     // l'attesa è finita
        expect(toasts2.some(([t, m]) => t === 'error' && /OCR/.test(m) && /riprova/i.test(m))).toBe(true);
        expect(appended[0].removed).toBe(true);                       // lo script bloccato viene tolto
        const retry = ai.handleImageFile({ name: 'appunti.png', type: 'image/png' });
        expect(appended).toHaveLength(2);                              // riprova = nuovo tentativo di caricamento
        // stesso indirizzo = la riprova resterebbe agganciata alla richiesta bloccata (verificato nel browser)
        expect(appended[1].src).not.toBe(appended[0].src);
        expect(appended[0].src).toBe('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
        await vi.advanceTimersByTimeAsync(31000);
        await retry;
    });
});

// PDF (services/fileHandler.js extractTextFromFile): pdf.js si carica dopo l'avvio con window.__cxLib('pdf')
// (app.html). Se lo script non arriva, l'import del PDF restava in attesa per sempre.
describe('PDF: caricamento di pdf.js bloccato', () => {
    beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    it('attesa limitata e messaggio che chiede di controllare la connessione', async () => {
        vi.doMock('../core/state.js', () => ({ state: { decks: [] } }));
        vi.doMock('../core/ui.js', () => ({ showToast: vi.fn() }));
        vi.doMock('../services/ai.js', () => ({ handleAudioFile: vi.fn(), handleImageFile: vi.fn() }));
        vi.doMock('../modules/gamification.js', () => ({ awardXP: vi.fn(), earnBadge: vi.fn() }));
        vi.stubGlobal('window', { __cxLib: () => new Promise(() => {}) });   // non arriva mai
        const { extractTextFromFile } = await vi.importActual('../services/fileHandler.js');
        const p = extractTextFromFile({ name: 'appunti.pdf' }).catch(e => e);
        await vi.advanceTimersByTimeAsync(31000);
        const err = await p;
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/PDF\.js non caricato.*connessione/);
    });
});

// "Genera con IA" in una materia (modules/deckCreate.js): per l'ospite parte il riquadro di accesso e, dopo il
// login, resumePendingAI riprende la generazione. Il testo veniva ripristinato, il NOME della materia no.
describe('ripresa dopo l\'accesso: nome della materia conservato', () => {
    let dc, store, dom2;
    beforeEach(async () => {
        vi.resetModules();
        const m = new Map();
        store = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
        dom2 = fakeDom({ 'deck-name': 'Biologia', 'deck-text': NOTES, 'ai-custom-instructions': '' });
        vi.stubGlobal('document', dom2.document);
        vi.stubGlobal('localStorage', store);
        vi.stubGlobal('navigator', { onLine: true });
        vi.stubGlobal('confirm', () => true);
        vi.doMock('../js/utils.js', () => ({ fetchWithTimeout: vi.fn(), handleAIError: vi.fn() }));
        vi.doMock('../services/firebase.js', () => ({ callGemini: async () => { const e = new Error('GUEST_LOGIN_REQUIRED'); e.isGuestGate = true; throw e; } }));
        vi.stubGlobal('window', { _fbLoggedIn: false });
        dc = await import('../modules/deckCreate.js');
        dc.init({ showToast() {}, state: { decks: [] }, getCurrentDeckIndex: () => null, saveState() {} });
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('ospite: la richiesta in sospeso ricorda anche il nome; dopo l\'accesso il nome torna nel campo', async () => {
        await dc.autoGenerateFlashcards();                         // ospite → riquadro di accesso
        const pend = JSON.parse(store.getItem('cortex_pending_ai'));
        expect(pend.text).toBe(NOTES);
        expect(pend.name).toBe('Biologia');
        // dopo l'accesso la pagina si ricarica: modulo vuoto
        dom2.el('deck-name').value = ''; dom2.el('deck-text').value = '';
        window._fbLoggedIn = true;
        vi.stubGlobal('confirm', () => false);                     // si ferma prima della chiamata AI
        vi.useFakeTimers();
        const r = dc.resumePendingAI();
        await vi.advanceTimersByTimeAsync(500);
        await r;
        vi.useRealTimers();
        expect(dom2.el('deck-text').value).toBe(NOTES);
        expect(dom2.el('deck-name').value).toBe('Biologia');
    });
    it('un nome già scritto dopo l\'accesso non viene sovrascritto', async () => {
        store.setItem('cortex_pending_ai', JSON.stringify({ text: NOTES, name: 'Biologia', ts: Date.now() }));
        window._fbLoggedIn = true;
        dom2.el('deck-name').value = 'Chimica';
        vi.stubGlobal('confirm', () => false);
        vi.useFakeTimers();
        const r = dc.resumePendingAI();
        await vi.advanceTimersByTimeAsync(500);
        await r;
        vi.useRealTimers();
        expect(dom2.el('deck-name').value).toBe('Chimica');
    });
});
