import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const script = path => read(path).replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');
function storage() {
    const data = new Map();
    return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}
function base() {
    const context = vm.createContext({ localStorage: storage(), sessionStorage: storage(), window: { _fbUserId: 'google-user', dispatchEvent: vi.fn() }, Event, CustomEvent, console, setTimeout, clearTimeout });
    // Fase 2.1: lo spazio dati della scheda (account) determina il registro delle cancellazioni.
    context.localStorage.setItem('cortex_active_scope', 'u:google-user');
    vm.runInContext(script('../core/accountScope.js'), context);
    vm.runInContext(script('../core/deckDeletion.js').replace("const KEY =", "const JOURNAL_KEY =").replaceAll('getItem(KEY)', 'getItem(JOURNAL_KEY)').replaceAll('setItem(KEY,', 'setItem(JOURNAL_KEY,'), context);
    return context;
}
describe('confirmed deck deletion survives mobile close and reload', () => {
    it('writes the deletion before any delayed save and filters a stale disk snapshot', () => {
        const ctx = base();
        Object.assign(ctx, {
            APP_CONFIG: { STORAGE_KEYS: { DECKS_V1: 'mm_decks', SESSIONS: 'sessions' } },
            state: { decks: [{ id: 7, cards: [{}] }, { id: 8, cards: [{}] }], sessions: [] },
            document: { getElementById: () => ({ dataset: { confirming: '1' } }) },
            saveDecks: vi.fn(async () => {}), saveSessions: vi.fn(async () => {}), saveRecordings: vi.fn(async () => {}),
            renderDecks: vi.fn(), showToast: vi.fn(), syncToCloud: vi.fn(), t: k => k,
        });
        vm.runInContext(script('../modules/deckUtils.js'), ctx);
        vm.runInContext('confirmDelete(0)', ctx);
        expect(ctx.state.decks.map(d => d.id)).toEqual([8]);
        expect(ctx.syncToCloud).toHaveBeenCalledOnce();
        // Simulate termination before IndexedDB/cloud completes, using only the durable journal.
        expect(vm.runInContext('withoutDeletedDecks([{id:7},{id:8}])', ctx).map(d => d.id)).toEqual([8]);
        expect(ctx.window.dispatchEvent.mock.calls.filter(([e]) => e.type === 'cortex:decks-changed')).toHaveLength(1);
    });
    it('isolates deletion ids between Google accounts', () => {
        const ctx = base();
        vm.runInContext('rememberDeletedDecks([7])', ctx);
        vm.runInContext('_resetTabScopeForTests()', ctx);
        ctx.localStorage.setItem('cortex_active_scope', 'u:other-account');
        expect(vm.runInContext('withoutDeletedDecks([{id:7}])', ctx)).toHaveLength(1);
    });
    it('accepts zero decks in IndexedDB over an obsolete nonempty boot cache', async () => {
        const ctx = base();
        ctx.localStorage.setItem('mm_decks', JSON.stringify([{ id: 7 }]));
        Object.assign(ctx, {
            APP_CONFIG: { STORAGE_KEYS: { DECKS_V1: 'mm_decks' } },
            todayStr: () => '2026-09-27', fbSecurityManager: {},
            migrateFromLocalStorage: async () => {}, migrateLegacyIDB: async () => false, loadDecks: async () => [],
            loadSessions: async () => [], loadRecordings: async () => [],
        });
        vm.runInContext(script('../core/state.js'), ctx);
        await vm.runInContext('hydrateFromIDB()', ctx);
        expect(ctx.window._legacyState().decks).toEqual([]);
    });
    it('does not overwrite a local edit while IndexedDB hydration is pending', async () => {
        const ctx = base();
        let release;
        Object.assign(ctx, {
            APP_CONFIG: { STORAGE_KEYS: { DECKS_V1: 'mm_decks' } }, todayStr: () => '2026-09-27', fbSecurityManager: {},
            migrateFromLocalStorage: async () => {}, migrateLegacyIDB: async () => false, loadDecks: () => new Promise(r => { release = r; }),
            loadSessions: async () => [], loadRecordings: async () => [],
        });
        vm.runInContext(script('../core/state.js'), ctx);
        const pending = vm.runInContext('hydrateFromIDB()', ctx);
        await new Promise(resolve => setTimeout(resolve, 0));
        vm.runInContext('state.decks = [{id:"new"}]', ctx);
        release([{ id: 'old' }]);
        await pending;
        expect(ctx.window._legacyState().decks.map(d => d.id)).toEqual(['new']);
    });
});

function cloudContext() {
    const ctx = base();
    const docs = new Map([['7', { id: 7, cards: [{ q: 'Old' }] }], ['8', { id: 8, cards: [{ q: 'Keep' }] }]]);
    let root = { createdAt: 1, migratedToSubcollections: true, plan: 'free' };
    const commits = [];
    const ref = { collection: () => ({ doc: id => ({ id }), get: async () => ({ forEach: fn => docs.forEach((data, id) => fn({ id, data: () => data })) }) }), get: async () => ({ exists: true, data: () => root }), set: async () => {} };
    const db = { collection: () => ({ doc: () => ref }),
        runTransaction: async fn => {
            const writes = [];
            const out = await fn({ get: async t => ({ exists: docs.has(t.id), data: () => docs.get(t.id) }), set: (t, data) => writes.push([t.id, data]) });
            writes.forEach(([id, data]) => docs.set(id, data));
            return out;
        },
        batch: () => {
        const ops = [];
        return { set: (target, data) => ops.push(() => target === ref ? root = { ...root, ...data } : docs.set(target.id, data)), delete: target => ops.push(() => docs.delete(target.id)), commit: async () => { commits.push(ops); ops.forEach(op => op()); } };
    } };
    Object.assign(ctx, {
        firebase: { apps: [{}], app: () => ({ firestore: () => db }), firestore: { Timestamp: { now: () => ({ toMillis: () => 1 }) }, FieldValue: { serverTimestamp: () => 1, arrayUnion: (...ids) => ids } } },
        state: { decks: [{ id: 8, cards: [{ q: 'Keep' }] }] }, hydrateFromIDB: async () => {},
        saveDecks: vi.fn(async () => {}), KEYS: { DECKS_V1: 'mm_decks' },
        document: { getElementById: () => null, querySelectorAll: () => [] },
        syncPublicProfile: () => {}, applySavedSettings: () => {},
    });
    ctx.window._legacyState = () => ctx.state;
    vm.runInContext(script('../core/syncMerge.js'), ctx);
    const source = read('../services/firebase.js');
    const section = source.slice(source.indexOf('let _syncInFlight'), source.indexOf('export async function loadDeckFromSubcollection')).replace(/\bexport /g, '');
    vm.runInContext(section, ctx);
    return { ctx, docs, commits, setRoot: data => { root = { ...root, ...data }; } };
}
describe('Google cloud deletion', () => {
    it('removes the document and metadata atomically and reloads the same decks into home state and disk', async () => {
        const { ctx, docs, commits } = cloudContext();
        vm.runInContext('rememberDeletedDecks([7])', ctx);
        await vm.runInContext('syncToCloud()', ctx);
        expect(docs.has('7')).toBe(false);
        expect(docs.has('8')).toBe(true);
        expect(commits).toHaveLength(1);
        ctx.state.decks = [{ id: 7 }];
        await vm.runInContext('loadFromCloud()', ctx);
        expect(ctx.state.decks.map(d => d.id)).toEqual([8]);
        expect(ctx.saveDecks).toHaveBeenCalledWith(ctx.state.decks);
        expect(ctx.window.dispatchEvent).toHaveBeenCalled();
    });
    it('loads an empty cloud collection after the last deck is deleted on another device', async () => {
        const { ctx, docs } = cloudContext();
        // il mazzo 8 era già stato sincronizzato da questo dispositivo
        ctx.localStorage.setItem('cortex_sync_meta', JSON.stringify({ initialized: true, hashes: { '8': vm.runInContext('deckHash', ctx)(ctx.state.decks[0]) } }));
        docs.clear();
        await vm.runInContext('loadFromCloud()', ctx);
        expect(ctx.state.decks).toEqual([]);
        expect(ctx.saveDecks).toHaveBeenCalledWith([]);
    });
    it('keeps a local deck that was never synchronized when the cloud is empty (fase 2.3)', async () => {
        const { ctx, docs } = cloudContext();
        docs.clear();
        ctx.state.decks = [{ id: 'nuovo', cards: [{ q: 'Offline' }] }];
        await vm.runInContext('loadFromCloud()', ctx);
        expect(ctx.state.decks.map(d => d.id)).toEqual(['nuovo']);
    });
    it('filters an old document using deletion markers from another device', async () => {
        const { ctx, setRoot } = cloudContext();
        ctx.state.decks = [{ id: 7 }, { id: 8, cards: [{ q: 'Keep' }] }];
        setRoot({ deletedDeckIds: ['7'] });
        await vm.runInContext('loadFromCloud()', ctx);
        expect(ctx.state.decks.map(d => d.id)).toEqual([8]);
    });
});
