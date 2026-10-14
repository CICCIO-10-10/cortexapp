// Verifica 14/10/2026 del flusso TOLC → mazzo errori → ripasso → salvataggio e riapertura.
// Difetto riprodotto: lo storico dei punteggi TOLC (cortex_tolc_history) era globale sul
// dispositivo, non separato per account: dopo un cambio account la home ("Cosa studiare oggi")
// e il confronto "rispetto alla volta scorsa" mostravano i punteggi dell'account precedente.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const script = p => read(p).replace(/^import [\s\S]*?;\r?\n/gm, '').replace(/\bexport /g, '');
function storage(seed = {}) {
    const m = new Map(Object.entries(seed));
    return {
        getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
        key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m,
    };
}
function scopeCtx(seed) {
    const ctx = vm.createContext({ localStorage: storage(seed), sessionStorage: storage(), console, JSON, Date, Math, Object, Array, String, Set, Map, Number });
    vm.runInContext(script('../core/accountScope.js'), ctx);
    return ctx;
}
const H = 'cortex_tolc_history';
const rec = (k, s, t, q = false) => ({ k, q, s, n: 20, t });
const hist = (ctx, k = H) => JSON.parse(ctx.localStorage.getItem(k) || 'null');

describe('storico punteggi TOLC separato per account', () => {
    it('A → B: B non vede né eredita i punteggi di A; tornando ad A ci sono ancora', () => {
        const a = JSON.stringify([rec('tolc-i', 12.5, 1000)]);
        const ctx = scopeCtx({ cortex_active_scope: 'u:A', [H]: a });
        vm.runInContext("swapLocalStorage('u:A','u:B')", ctx);
        expect(ctx.localStorage.getItem(H)).toBeNull();
        vm.runInContext("swapLocalStorage('u:B','u:A')", ctx);
        expect(ctx.localStorage.getItem(H)).toBe(a);
    });

    it('logout di A: l\'ospite sullo stesso dispositivo non vede i punteggi di A', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'u:A', [H]: JSON.stringify([rec('tolc-e', 9, 1000)]) });
        vm.runInContext("swapLocalStorage('u:A','guest')", ctx);
        expect(ctx.localStorage.getItem(H)).toBeNull();
    });

    it('ospite → account: la prova fatta da ospite si aggiunge allo storico dell\'account, senza doppioni', () => {
        const g = [rec('tolc-i', 7, 3000, true)];
        const acc = [rec('tolc-i', 5, 1000), rec('tolc-i', 7, 3000, true)];   // stessa prova già presente
        const ctx = scopeCtx({ cortex_active_scope: 'guest', [H]: JSON.stringify(g), ['cortex_scoped:u:A:' + H]: JSON.stringify([acc[0]]) });
        vm.runInContext("swapLocalStorage('guest','u:A',{mergeFromGuest:true})", ctx);
        expect(hist(ctx)).toEqual([acc[0], g[0]]);
        // ripetuto (stessa unione due volte): nessun doppione
        const ctx2 = scopeCtx({ cortex_active_scope: 'guest', [H]: JSON.stringify(g), ['cortex_scoped:u:A:' + H]: JSON.stringify(acc) });
        vm.runInContext("swapLocalStorage('guest','u:A',{mergeFromGuest:true})", ctx2);
        expect(hist(ctx2)).toEqual(acc);
    });

    it('ospite → account nuovo: lo storico dell\'ospite passa all\'account', () => {
        const g = JSON.stringify([rec('tolc-psi', 3, 2000)]);
        const ctx = scopeCtx({ cortex_active_scope: 'guest', [H]: g });
        vm.runInContext("swapLocalStorage('guest','u:A',{mergeFromGuest:true})", ctx);
        expect(ctx.localStorage.getItem(H)).toBe(g);
    });

    it('unione con storico illeggibile: si tiene la parte valida, al massimo 60 prove, in ordine di tempo', () => {
        const many = Array.from({ length: 70 }, (_, i) => rec('tolc-i', i, 10 + i));
        const ctx = scopeCtx({ cortex_active_scope: 'guest', [H]: JSON.stringify(many.slice(35)), ['cortex_scoped:u:A:' + H]: JSON.stringify(many.slice(0, 35)) });
        vm.runInContext("swapLocalStorage('guest','u:A',{mergeFromGuest:true})", ctx);
        const out = hist(ctx);
        expect(out.length).toBe(60);
        expect(out[0].t).toBe(20);
        expect(out[59].t).toBe(79);
        const bad = scopeCtx({ cortex_active_scope: 'guest', [H]: JSON.stringify([rec('tolc-i', 1, 5)]), ['cortex_scoped:u:A:' + H]: '{rotto' });
        vm.runInContext("swapLocalStorage('guest','u:A',{mergeFromGuest:true})", bad);
        expect(hist(bad)).toEqual([rec('tolc-i', 1, 5)]);
    });

    it('account eliminato: il suo storico TOLC viene rimosso dal dispositivo', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'u:A', [H]: JSON.stringify([rec('tolc-i', 1, 5)]) });
        vm.runInContext("discardScopeLocal('u:A')", ctx);
        expect(ctx.localStorage.getItem(H)).toBeNull();
    });
});

// Difetto riprodotto sugli emulatori Firebase (regole vere del repository): al primo accesso di un
// account NUOVO, loadFromCloud() legge users/{uid} (non esiste), poi touchSeen()/bumpActivation()
// creano il doc con 'activation', poi loadFromCloud() scrive plan:'free' come se il doc non esistesse.
// Per le regole è un update di un campo protetto → PERMISSION_DENIED su tutta la scrittura e il
// syncToCloud() che segue non parte: il mazzo errori TOLC creato da ospite non arriva sul cloud.
describe('primo accesso: i mazzi creati da ospite arrivano sul cloud anche se il doc utente nasce nel frattempo', () => {
    function harness({ raceCreate }) {
        const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
        const ctx = vm.createContext({ localStorage: mem(), sessionStorage: mem(), window: { _fbUserId: 'u1', _cortexUserEmail: 'u1@example.com', dispatchEvent: () => {} }, Event, CustomEvent, console: { ...console, error: () => {}, warn: () => {}, log: () => {} }, setTimeout, clearTimeout });
        ctx.localStorage.setItem('cortex_active_scope', 'u:u1');
        vm.runInContext(script('../core/accountScope.js'), ctx);
        vm.runInContext(script('../core/deckDeletion.js').replace("const KEY =", "const JOURNAL_KEY =").replaceAll('getItem(KEY)', 'getItem(JOURNAL_KEY)').replaceAll('setItem(KEY,', 'setItem(JOURNAL_KEY,'), ctx);
        let user = null;                    // users/u1
        const decks = new Map();            // users/u1/decks/*
        const denied = [];
        // Regola Firestore (firestore.rules, users/{userId}): 'plan' solo in create e solo 'free'.
        const writeUser = (data) => {
            if (user && 'plan' in data) { denied.push('update plan'); throw Object.assign(new Error('PERMISSION_DENIED'), { code: 'permission-denied' }); }
            user = { ...(user || {}), ...data };
        };
        let reads = 0;
        const userRef = {
            id: 'u1',
            get: async () => {
                const snapshot = user ? { exists: true, data: () => ({ ...user }) } : { exists: false, data: () => undefined };
                // touchSeen() crea il doc subito DOPO la prima lettura di loadFromCloud()
                if (raceCreate && reads++ === 0 && !user) user = { activation: { firstSeen: 1, lastSeen: 1 } };
                return snapshot;
            },
            set: async (data) => writeUser(data),
            collection: () => ({ doc: id => ({ id, _deck: true }), get: async () => ({ forEach: fn => [...decks.entries()].forEach(([id, d]) => fn({ id, data: () => d })) }) }),
        };
        let clock = 10;
        const db = {
            collection: () => ({ doc: () => userRef }),
            runTransaction: async fn => {
                const writes = [];
                const out = await fn({
                    get: async r => (r === userRef
                        ? (user ? { exists: true, data: () => ({ ...user }) } : { exists: false, data: () => undefined })
                        : { exists: decks.has(r.id), data: () => decks.get(r.id) }),
                    set: (r, data) => writes.push([r, data]),
                });
                for (const [r, data] of writes) { if (r === userRef) writeUser(data); else decks.set(r.id, JSON.parse(JSON.stringify(data))); }
                return out;
            },
            batch: () => { const ops = []; return { set: (r, data) => ops.push(() => { if (r === userRef) writeUser(data); }), delete: r => ops.push(() => decks.delete(r.id)), commit: async () => ops.forEach(op => op()) }; },
        };
        Object.assign(ctx, {
            firebase: { apps: [{}], app: () => ({ firestore: () => db }), firestore: { Timestamp: { now: () => { const ms = ++clock; return { toMillis: () => ms }; } }, FieldValue: { serverTimestamp: () => 'ts', arrayUnion: (...ids) => ids } } },
            state: { decks: [{ id: 'tolc-err-tolc-i-x', name: 'Errori TOLC-I', source: 'tolc_errors_local', cards: [{ id: 'c0', q: 'Q', a: 'A) x', reps: 1, nextReview: '2026-10-16' }] }] },
            hydrateFromIDB: async () => {}, saveDecks: async () => {}, KEYS: { DECKS_V1: 'mm_decks' },
            document: { getElementById: () => null, querySelectorAll: () => [] },
            syncPublicProfile: () => {}, applySavedSettings: () => {},
        });
        ctx.window._legacyState = () => ctx.state;
        vm.runInContext(script('../core/syncMerge.js'), ctx);
        const source = read('../services/firebase.js');
        vm.runInContext(source.slice(source.indexOf('let _syncInFlight'), source.indexOf('export async function loadDeckFromSubcollection')).replace(/\bexport /g, ''), ctx);
        return { ctx, decks, denied, user: () => user };
    }

    it('doc utente creato da touchSeen tra lettura e scrittura: niente rifiuto, mazzo errori sul cloud', async () => {
        const h = harness({ raceCreate: true });
        await vm.runInContext('loadFromCloud()', h.ctx);
        expect(h.denied).toEqual([]);
        expect(h.user().createdAt).toBeTruthy();
        expect(h.user().email).toBe('u1@example.com');
        expect(h.user().plan).toBeUndefined();                 // su un doc già esistente il piano lo scrive solo il server
        expect([...h.decks.keys()]).toEqual(['tolc-err-tolc-i-x']);
    });

    it('account nuovo senza gara: doc creato con plan free e mazzo errori sul cloud (comportamento invariato)', async () => {
        const h = harness({ raceCreate: false });
        await vm.runInContext('loadFromCloud()', h.ctx);
        expect(h.denied).toEqual([]);
        expect(h.user().plan).toBe('free');
        expect(h.user().createdAt).toBeTruthy();
        expect([...h.decks.keys()]).toEqual(['tolc-err-tolc-i-x']);
    });
});

// Cronologia TOLC scritta prima che fosse per account (chiave globale): al primo avvio dopo
// l'aggiornamento resta allo spazio attivo SOLO se il proprietario è identificabile; altrimenti
// viene messa da parte, non mostrata e non assegnata a nessun account.
describe('migrazione della vecchia cronologia TOLC (una volta per dispositivo)', () => {
    const U = 'cortex_tolc_history_unassigned';
    const old = JSON.stringify([rec('tolc-i', 11, 1000)]);
    const boot = ctx => vm.runInContext('ensureScopeInitialized()', ctx);

    it('dopo il logout di A (ospite attivo): proprietario non identificabile → messa da parte, non mostrata', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'guest', cortex_legacy_scope: 'u:A', mm_user_id: 'A', [H]: old });
        boot(ctx);
        expect(ctx.localStorage.getItem(H)).toBeNull();          // home e risultato TOLC non la vedono
        expect(ctx.localStorage.getItem(U)).toBe(old);           // conservata, non persa
        expect(ctx.localStorage.getItem('cortex_scoped:u:A:' + H)).toBeNull();   // non assegnata ad A
    });

    it('…e non passa al prossimo account che accede (né a B né ad A)', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'guest', cortex_legacy_scope: 'u:A', mm_user_id: 'A', [H]: old });
        boot(ctx);
        vm.runInContext("swapLocalStorage('guest','u:B',{mergeFromGuest:true})", ctx);
        expect(ctx.localStorage.getItem(H)).toBeNull();
        vm.runInContext("swapLocalStorage('u:B','u:A')", ctx);
        expect(ctx.localStorage.getItem(H)).toBeNull();
        expect(ctx.localStorage.getItem(U)).toBe(old);           // sempre fuori dagli spazi dati
    });

    it('account collegato, unico account del dispositivo, nessun dato ospite in sospeso → resta all\'account', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'u:A', cortex_legacy_scope: 'u:A', mm_user_id: 'A', [H]: old });
        boot(ctx);
        expect(ctx.localStorage.getItem(H)).toBe(old);
        expect(ctx.localStorage.getItem(U)).toBeNull();
    });

    it('account collegato ma un altro account ha usato il dispositivo → messa da parte', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'u:A', mm_user_id: 'A', 'cortex_scoped:u:B:mm_gstate': '{}', [H]: old });
        boot(ctx);
        expect(ctx.localStorage.getItem(H)).toBeNull();
        expect(ctx.localStorage.getItem(U)).toBe(old);
    });

    it('account collegato con dati ospite non ancora uniti → messa da parte', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'u:A', mm_user_id: 'A', 'cortex_scoped:guest:mm_gstate': '{}', [H]: old });
        boot(ctx);
        expect(ctx.localStorage.getItem(H)).toBeNull();
        expect(ctx.localStorage.getItem(U)).toBe(old);
    });

    it('dispositivo mai usato con un account → resta all\'ospite', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'guest', cortex_legacy_scope: 'guest', [H]: old });
        boot(ctx);
        expect(ctx.localStorage.getItem(H)).toBe(old);
        expect(ctx.localStorage.getItem(U)).toBeNull();
    });

    it('dispositivo mai migrato (prima versione con spazi dati), ultimo account A non collegato → messa da parte, non nello spazio di A', () => {
        const ctx = scopeCtx({ mm_user_id: 'A', mm_gstate: '{"xp":1}', [H]: old });
        expect(boot(ctx)).toBe('guest');
        expect(ctx.localStorage.getItem(H)).toBeNull();
        expect(ctx.localStorage.getItem('cortex_scoped:u:A:' + H)).toBeNull();
        expect(ctx.localStorage.getItem(U)).toBe(old);
        expect(ctx.localStorage.getItem('cortex_scoped:u:A:mm_gstate')).toBe('{"xp":1}');   // regola generica invariata
    });

    it('una sola volta: le prove fatte dopo l\'aggiornamento non vengono più spostate', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'guest', mm_user_id: 'A', [H]: old });
        boot(ctx);
        const fresh = JSON.stringify([rec('tolc-e', 4, 5000)]);
        ctx.localStorage.setItem(H, fresh);
        vm.runInContext('_resetTabScopeForTests()', ctx);
        boot(ctx);
        expect(ctx.localStorage.getItem(H)).toBe(fresh);
        expect(ctx.localStorage.getItem(U)).toBe(old);
    });

    it('nessuna cronologia: niente da spostare', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'guest', mm_user_id: 'A' });
        boot(ctx);
        expect(ctx.localStorage.getItem(U)).toBeNull();
        expect(ctx.localStorage.getItem('cortex_tolc_history_scoped')).toBe('1');
    });

    it('la copia messa da parte non è letta da nessuna parte dell\'app', () => {
        const files = ['../modules/tolcSim.js', '../modules/home.js', '../modules/tolcErrorDeck.js', '../core/appBoot.js', '../services/firebase.js', '../main.js'];
        for (const f of files) expect(read(f)).not.toContain('cortex_tolc_history_unassigned');
    });
});
