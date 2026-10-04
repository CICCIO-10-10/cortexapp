// Regressione (04/10/2026): "copia di questo dispositivo" con contenuto identico all'originale.
// Due cause verificate qui con il codice reale (core/syncMerge.js, services/firebase.js):
//  1) dueCount (valore derivato, ricalcolato ogni giorno) contato come contenuto del mazzo;
//  2) lettura del cloud sovrapposta a un invio: la lettura vecchia veniva unita lo stesso.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { deckHash, mergeCloudIntoLocal, isDirty, readMeta } from '../core/syncMerge.js';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const script = path => read(path).replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');
function storage() {
    const data = new Map();
    return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}
const cards = n => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, q: 'Domanda ' + i, a: 'Risposta ' + i, nextReview: '2026-10-0' + (1 + (i % 5)) }));

describe('dueCount non è contenuto del mazzo', () => {
    it('stesso mazzo con dueCount diverso: stesso hash, non da caricare', () => {
        const deck = { id: 'g1', name: 'Generatori', cards: cards(30), dueCount: 4 };
        expect(deckHash({ ...deck, dueCount: 11 })).toBe(deckHash(deck));
        const meta = readMeta({ initialized: true, hashes: { g1: deckHash(deck) } });
        expect(isDirty({ ...deck, dueCount: 12 }, meta)).toBe(false);
    });
    it('primo avvio dopo l\'aggiornamento: nessuna copia se cambia solo dueCount', () => {
        const local = [{ id: 'g1', name: 'Generatori', cards: cards(30), dueCount: 9 }];
        const cloud = [{ id: 'g1', name: 'Generatori', cards: cards(30), dueCount: 2, rev: 3, updatedAt: 5 }];
        const r = mergeCloudIntoLocal({ local, cloud, meta: null });
        expect(r.conflicts).toEqual([]);
        expect(r.decks).toHaveLength(1);
    });
    it('un cambiamento vero nelle carte resta un conflitto (nessuna perdita di dati)', () => {
        const local = [{ id: 'g1', cards: [{ id: 'c0', q: 'A', a: 'B locale' }] }];
        const cloud = [{ id: 'g1', cards: [{ id: 'c0', q: 'A', a: 'B cloud' }], rev: 2 }];
        const r = mergeCloudIntoLocal({ local, cloud, meta: null });
        expect(r.conflicts).toHaveLength(1);
        expect(r.decks).toHaveLength(2);
    });
});

describe('lettura del cloud sovrapposta a un invio', () => {
    function harness() {
        const ctx = vm.createContext({ localStorage: storage(), sessionStorage: storage(), window: { _fbUserId: 'u1', dispatchEvent: vi.fn() }, Event, CustomEvent, console, setTimeout, clearTimeout });
        ctx.localStorage.setItem('cortex_active_scope', 'u:u1');
        vm.runInContext(script('../core/accountScope.js'), ctx);
        vm.runInContext(script('../core/deckDeletion.js').replace("const KEY =", "const JOURNAL_KEY =").replaceAll('getItem(KEY)', 'getItem(JOURNAL_KEY)').replaceAll('setItem(KEY,', 'setItem(JOURNAL_KEY,'), ctx);
        const docs = new Map();
        let root = { createdAt: 1, migratedToSubcollections: true, plan: 'free' };
        let gate = null;            // se impostato, la lettura dei mazzi prende la fotografia e aspetta
        let reads = 0;
        const ref = {
            collection: () => ({ doc: id => ({ id }), get: async () => {
                reads++;
                const snapshot = [...docs.entries()].map(([id, d]) => [id, JSON.parse(JSON.stringify(d))]);
                if (gate) { const g = gate; gate = null; await g; }
                return { forEach: fn => snapshot.forEach(([id, data]) => fn({ id, data: () => data })) };
            } }),
            get: async () => ({ exists: true, data: () => root }), set: async () => {},
        };
        let clock = 10;
        const db = { collection: () => ({ doc: () => ref }),
            runTransaction: async fn => {
                const writes = [];
                const out = await fn({ get: async t => ({ exists: docs.has(t.id), data: () => docs.get(t.id) }), set: (t, data) => writes.push([t.id, data]) });
                writes.forEach(([id, data]) => docs.set(id, JSON.parse(JSON.stringify(data))));
                return out;
            },
            batch: () => { const ops = []; return { set: (t, data) => ops.push(() => { if (t === ref) root = { ...root, ...data }; }), delete: t => ops.push(() => docs.delete(t.id)), commit: async () => ops.forEach(op => op()) }; },
        };
        Object.assign(ctx, {
            firebase: { apps: [{}], app: () => ({ firestore: () => db }), firestore: { Timestamp: { now: () => { const ms = ++clock; return { toMillis: () => ms }; } }, FieldValue: { serverTimestamp: () => 1, arrayUnion: (...ids) => ids } } },
            state: { decks: [] }, hydrateFromIDB: async () => {},
            saveDecks: vi.fn(async () => {}), KEYS: { DECKS_V1: 'mm_decks' },
            document: { getElementById: () => null, querySelectorAll: () => [] },
            syncPublicProfile: () => {}, applySavedSettings: () => {},
        });
        ctx.window._legacyState = () => ctx.state;
        vm.runInContext(script('../core/syncMerge.js'), ctx);
        const source = read('../services/firebase.js');
        vm.runInContext(source.slice(source.indexOf('let _syncInFlight'), source.indexOf('export async function loadDeckFromSubcollection')).replace(/\bexport /g, ''), ctx);
        return { ctx, docs, setGate: p => { gate = p; }, reads: () => reads };
    }
    const flush = () => new Promise(r => setTimeout(r, 20));

    it('modifica caricata mentre una lettura vecchia è in corso: niente copia, niente ritorno indietro', async () => {
        const { ctx, docs, setGate, reads } = harness();
        // stato sincronizzato: mazzo g1 rev 1 su cloud e sul dispositivo
        ctx.state.decks = [{ id: 'g1', name: 'Generatori', cards: cards(3) }];
        await vm.runInContext('syncToCloud()', ctx);
        expect(docs.get('g1').rev).toBe(1);
        // l'utente modifica una carta
        ctx.state.decks[0].cards[0].a = 'Risposta corretta aggiornata';
        // la lettura del cloud fotografa la versione VECCHIA e resta in attesa...
        let release; setGate(new Promise(r => { release = r; }));
        const load = vm.runInContext('loadFromCloud()', ctx);
        await flush();
        // ...nel frattempo parte e finisce l'invio della modifica
        await vm.runInContext('syncToCloud()', ctx);
        expect(docs.get('g1').rev).toBe(2);
        release(); await load; await flush(); await flush();
        const names = ctx.state.decks.map(d => d.name);
        expect(names).toEqual(['Generatori']);                                   // nessuna copia
        expect(ctx.state.decks[0].cards[0].a).toBe('Risposta corretta aggiornata'); // non torna indietro
        expect(reads()).toBeGreaterThanOrEqual(2);                               // riletto dopo l'invio
    });
});
