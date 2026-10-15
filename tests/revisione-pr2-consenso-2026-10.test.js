// Revisione PR #2 (16/10/2026): revoca del consenso da un'altra scheda (pagina privacy).
// Riprodotto nel browser (scripts/revisione-pr2-2026-10/consenso-browser.cjs revocato_altra_scheda):
// il tracker interno si fermava, ma nella scheda dell'app già aperta Clarity continuava a registrare
// e GA non riceveva il rifiuto fino alla ricarica.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../public/cortex-consent.js', import.meta.url), 'utf8');
function page(initial) {
    const m = new Map(initial ? [['cortex_cookie_consent', initial]] : []);
    const win = new EventTarget();
    const clarityCalls = [], dataLayer = [];
    const head = { appendChild() {} };
    const ctx = {
        window: win, localStorage: { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) },
        location: { protocol: 'https:', hostname: 'cortexapp.it', pathname: '/app', search: '', reload() { ctx.reloaded = (ctx.reloaded || 0) + 1; } },
        document: { head, body: { appendChild() {} }, createElement: () => ({ setAttribute() {}, addEventListener() {} }), getElementById: () => null, readyState: 'complete', addEventListener() {} },
        URLSearchParams, Date, Event, setTimeout, clearTimeout,
    };
    win.dataLayer = dataLayer;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
    // gli SDK finti: clarity registra le chiamate (quelle già in coda incluse)
    if (win.clarity) {                                       // solo se la pagina l'ha caricato davvero
        const q = win.clarity.q || [];
        win.clarity = (...a) => clarityCalls.push(a);
        q.forEach(a => clarityCalls.push([...a]));
    }
    const otherTab = (value) => { m.set('cortex_cookie_consent', value); const e = new Event('storage'); e.key = 'cortex_cookie_consent'; e.newValue = value; win.dispatchEvent(e); };
    return { win, ctx, clarityCalls, dataLayer, otherTab };
}
const denied = calls => calls.some(a => a[0] === 'consentv2' && a[1] && a[1].analytics_Storage === 'denied');
const gaDenied = dl => dl.some(a => a && a[0] === 'consent' && a[1] === 'update' && a[2] && a[2].analytics_storage === 'denied');

describe('consenso revocato in un\'altra scheda', () => {
    it('la scheda già aperta con Clarity e GA attivi riceve il rifiuto e ferma gli eventi', () => {
        const p = page('accepted');
        expect(denied(p.clarityCalls)).toBe(false);
        p.otherTab('declined');
        expect(p.win.__cortexTrackingDisabled).toBe(true);
        expect(denied(p.clarityCalls)).toBe(true);
        expect(gaDenied(p.dataLayer)).toBe(true);
    });
    it('consenso mai dato in questa scheda: nessun tracker caricato, niente da chiamare, nessun errore', () => {
        const p = page(null);
        p.otherTab('declined');
        expect(p.win.__cortexTrackingDisabled).toBe(true);
        expect(p.win.clarity).toBeUndefined();                    // nessun SDK caricato
        expect(p.dataLayer).toEqual([]);
    });
    it('accettazione in un\'altra scheda: questa scheda non avvia nulla da sola', () => {
        const p = page(null);
        p.otherTab('accepted');
        expect(p.clarityCalls).toEqual([]);
        expect(p.dataLayer).toEqual([]);
    });
});

// Metriche account (adminDashboard: usersActivated, usersFirstReview, ...) lette da users/{uid}.activation.
// Gli ospiti usano l'AI con un accesso ANONIMO (modules/pdfToFlashcards.js): _uid() restituiva anche quell'uid,
// quindi un ospite che ripassava creava users/{anonimo}.activation ed era contato tra gli utenti attivati,
// mentre le metriche da Firebase Auth escludono gli anonimi e il piano di tracciamento dice
// "per un ospite bumpActivation resta no-op". Dopo l'accesso Google (nuovo uid) la stessa persona
// poteva essere contata due volte.
import { vi } from 'vitest';

describe('tappe di attivazione: solo account collegati, non ospiti anonimi', () => {
    // Registra le scritture su users/{uid} (il Firestore finto del repository non unisce le mappe annidate
    // come set({merge:true}) del Firestore vero, quindi qui si guardano le scritture, non lo stato finale).
    async function run(user) {
        vi.resetModules();
        const writes = [];
        const ref = (path) => ({ path, get: async () => ({ exists: false, data: () => undefined }), set: async (data) => { writes.push([path, data]); } });
        const compatDb = {
            collection: (n) => ({ doc: (id) => ref(n + '/' + id) }),
            runTransaction: async (fn) => fn({ get: async (r) => r.get(), set: (r, data) => { writes.push([r.path, data]); } }),
        };
        const FV = { increment: (n) => ({ inc: n }), serverTimestamp: () => ({ ts: true }) };
        vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
        vi.stubGlobal('window', { _fbUserId: user.isAnonymous ? null : user.uid });
        vi.stubGlobal('firebase', {
            apps: [{}], app: () => ({ firestore: () => compatDb }),
            auth: () => ({ currentUser: user }),
            firestore: { FieldValue: FV },
        });
        const act = await import('../services/activation.js');
        await act.bumpActivation('ratingsGiven', 1);
        await act.bumpActivation('cardsStudied', 3, { flow: 'deck' });
        await act.touchSeen();
        vi.unstubAllGlobals();
        return writes.filter(([p]) => p === 'users/' + user.uid).map(([, d]) => d.activation);
    }
    it('ospite anonimo: nessuna scrittura sul documento utente, nessuna attivazione contata', async () => {
        expect(await run({ uid: 'anon-1', isAnonymous: true })).toEqual([]);
    });
    it('account collegato: primo ripasso e attivazione registrati come prima', async () => {
        const w = await run({ uid: 'acc-1', isAnonymous: false });
        expect(w.some(a => a.activated === true && a.firstReviewCompletedAt)).toBe(true);
        expect(w.some(a => a.lastSeen)).toBe(true);
    });
});
