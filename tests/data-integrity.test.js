// Audit 2026-10 — Fase 2: dati separati per account, salvataggi affidabili, sync coerente.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import * as merge from '../core/syncMerge.js';

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
    const ctx = vm.createContext({ localStorage: storage(seed), sessionStorage: storage(), console, JSON, Date, Math, Object, Array, String, Set, Map });
    vm.runInContext(script('../core/accountScope.js'), ctx);
    return ctx;
}

describe('2.1 spazio dati per account', () => {
    it('dati legacy: assegnati all\'ultimo account del dispositivo, non a chi entra dopo', () => {
        const ctx = scopeCtx({ mm_user_id: 'A', mm_gstate: '{"xp":500}', mm_sessions: '[1]', mm_lang: 'it' });
        expect(vm.runInContext('ensureScopeInitialized()', ctx)).toBe('guest');   // nessun login attivo
        const ls = ctx.localStorage;
        expect(ls.getItem('mm_gstate')).toBeNull();                                // l'ospite non vede i dati di A
        expect(ls.getItem('cortex_scoped:u:A:mm_gstate')).toBe('{"xp":500}');
        expect(ls.getItem('mm_lang')).toBe('it');                                  // preferenze del dispositivo intatte
        expect(ls.getItem('cortex_legacy_scope')).toBe('u:A');
    });
    it('utente collegato con i propri dati: restano attivi', () => {
        const ctx = scopeCtx({ mm_user_id: 'A', cortex_uid: 'A', mm_gstate: '{"xp":5}' });
        expect(vm.runInContext('ensureScopeInitialized()', ctx)).toBe('u:A');
        expect(ctx.localStorage.getItem('mm_gstate')).toBe('{"xp":5}');
    });
    it('dispositivo mai usato con un account: tutto all\'ospite', () => {
        const ctx = scopeCtx({ mm_gstate: '{"xp":1}' });
        expect(vm.runInContext('ensureScopeInitialized()', ctx)).toBe('guest');
        expect(ctx.localStorage.getItem('mm_gstate')).toBe('{"xp":1}');
        expect(ctx.localStorage.getItem('cortex_legacy_scope')).toBe('guest');
    });
    it('A → B: le chiavi di A vengono messe da parte, B vede solo le sue', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'u:A', mm_gstate: 'A', 'cortex_scoped:u:B:mm_gstate': 'B' });
        vm.runInContext("swapLocalStorage('u:A','u:B')", ctx);
        expect(ctx.localStorage.getItem('mm_gstate')).toBe('B');
        expect(ctx.localStorage.getItem('cortex_scoped:u:A:mm_gstate')).toBe('A');
        expect(ctx.localStorage.getItem('cortex_active_scope')).toBe('u:B');
        expect(vm.runInContext('currentScope()', ctx)).toBe('u:B');
    });
    it('ospite → account: le chiavi mancanti all\'account vengono dall\'ospite, quelle esistenti restano', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'guest', cortex_pending_ai: 'job', mm_gstate: 'G', 'cortex_scoped:u:A:mm_gstate': 'A' });
        vm.runInContext("swapLocalStorage('guest','u:A',{mergeFromGuest:true})", ctx);
        expect(ctx.localStorage.getItem('cortex_pending_ai')).toBe('job');
        expect(ctx.localStorage.getItem('mm_gstate')).toBe('A');
        vm.runInContext("clearStash('guest', { archiveAs: 'guest-archive' })", ctx);
        expect(ctx.localStorage.getItem('cortex_scoped:guest:mm_gstate')).toBeNull();
        expect(ctx.localStorage.getItem('cortex_scoped:guest-archive:mm_gstate')).toBe('G');   // XP dell'ospite recuperabili
    });
    it('una scheda rimasta indietro dopo il cambio account in un\'altra scheda lo riconosce', () => {
        const ctx = scopeCtx({ cortex_active_scope: 'u:A' });
        expect(vm.runInContext('currentScope()', ctx)).toBe('u:A');
        ctx.localStorage.setItem('cortex_active_scope', 'u:B');                   // altra scheda
        expect(vm.runInContext('isScopeStale()', ctx)).toBe(true);
        expect(vm.runInContext('currentScope()', ctx)).toBe('u:A');               // scrive ancora (solo) su A
    });
});

describe('2.1 cambio account (core/scopeSwitch.js)', () => {
    function switchCtx({ active, decks = [], idb = {}, failSaveFor = null }) {
        const ctx = scopeCtx({ cortex_active_scope: active });
        const store = new Map(Object.entries(idb));      // chiave `${kind}:${scope}`
        const saveFn = kind => vi.fn(async (v, scope) => { if (scope === failSaveFor) throw new Error('quota'); store.set(`${kind}:${scope}`, v); });
        Object.assign(ctx, {
            state: { decks, sessions: [], recordings: [] }, hydrateFromIDB: async () => {},
            saveDecks: saveFn('decks'), saveSessions: saveFn('sessions'), saveRecordings: saveFn('recordings'),
            loadDecks: async scope => store.get(`decks:${scope}`) ?? null,
            loadSessions: async scope => store.get(`sessions:${scope}`) ?? null,
            loadRecordings: async scope => store.get(`recordings:${scope}`) ?? null,
            deleteScopeData: async scope => { for (const k of [...store.keys()]) if (k.endsWith(':' + scope)) store.delete(k); },
            window: { addEventListener() {} }, location: { reload() {} },
        });
        vm.runInContext(script('../core/scopeSwitch.js'), ctx);
        return { ctx, store, run: to => vm.runInContext(`switchAccountScope(${JSON.stringify(to)})`, ctx) };
    }
    it('logout di A e login di B sullo stesso dispositivo: B non riceve i mazzi di A', async () => {
        const a = switchCtx({ active: 'u:A', decks: [{ id: 'a1', name: 'Privato di A' }] });
        await a.run('guest');                                       // logout
        expect(a.store.get('decks:u:A')).toEqual([{ id: 'a1', name: 'Privato di A' }]);   // A resta sul dispositivo
        a.ctx.state.decks = [];                                      // dopo la ricarica l'ospite parte vuoto
        await a.run('u:B');                                          // login di B
        expect(a.store.get('decks:u:B')).toEqual([]);
        expect(a.store.get('decks:u:A')).toEqual([{ id: 'a1', name: 'Privato di A' }]);
    });
    it('ospite → account: unione esplicita, ripetibile senza duplicati, spazio ospite svuotato', async () => {
        const s = switchCtx({ active: 'guest', decks: [{ id: 'g1' }], idb: { 'decks:u:A': [{ id: 'a1' }, { id: 'g1' }] } });
        const r = await s.run('u:A');
        expect(r).toMatchObject({ switched: true, mergedGuest: true });
        expect(s.store.get('decks:u:A').map(d => d.id)).toEqual(['a1', 'g1']);
        expect(s.store.has('decks:guest')).toBe(false);
    });
    it('account → altro account: nessun passaggio di dati', async () => {
        const s = switchCtx({ active: 'u:A', decks: [{ id: 'a1' }] });
        const r = await s.run('u:B');
        expect(r.mergedGuest).toBe(false);
        expect(s.store.get('decks:u:B')).toBeUndefined();
    });
    it('se IndexedDB non salva lo scope uscente, la copia resta (localStorage) e l\'ospite non viene cancellato', async () => {
        const s = switchCtx({ active: 'guest', decks: [{ id: 'g1' }], failSaveFor: 'guest' });
        await s.run('u:A');
        expect(s.ctx.localStorage.getItem('cortex_scoped:guest:mm_decks')).toBe('[{"id":"g1"}]');
        expect(s.store.get('decks:u:A').map(d => d.id)).toEqual(['g1']);
    });
});

describe('2.2 salvataggi', () => {
    function saveCtx({ fail = false, stale = false } = {}) {
        const ls = storage();
        const toasts = [], events = [];
        const ctx = vm.createContext({
            localStorage: ls, console: { error() {}, log() {} }, Promise, JSON, Date, setTimeout, clearTimeout,
            APP_CONFIG: { STORAGE_KEYS: { DECKS_V1: 'mm_decks', SESSIONS: 'mm_sessions' } },
            state: { decks: [{ id: 1, cards: [{ q: 'nuova' }] }], sessions: [], recordings: [] },
            saveDecks: async () => { if (fail) throw new Error('QuotaExceededError'); },
            saveSessions: async () => {}, saveRecordings: async () => {},
            syncToCloud: vi.fn(), renderDecks() {}, showToast: (m, t) => toasts.push([m, t]), t: k => k,
            rememberDeletedDecks() {}, syncPublicProfile() {}, isScopeStale: () => stale,
            CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }, Event: class { constructor(t) { this.type = t; } },
            window: { dispatchEvent: e => events.push(e) },
        });
        vm.runInContext(script('../modules/deckUtils.js'), ctx);
        return { ctx, ls, toasts, events, save: () => vm.runInContext('saveState({ immediate: true })', ctx) };
    }
    it('successo: copia di riserva tolta solo dopo la conferma', async () => {
        const h = saveCtx();
        h.ls.setItem('mm_decks', 'vecchia');
        const p = h.save();
        expect(h.ls.getItem('mm_decks')).toBe('vecchia');     // non ancora confermato
        expect(await p).toEqual({ ok: true });
        expect(h.ls.getItem('mm_decks')).toBeNull();
        expect(h.events.find(e => e.type === 'cortex:save-status' && e.detail.status === 'saved')).toBeTruthy();
    });
    it('errore IndexedDB: copia di riserva + segnale "non confermato" + avviso visibile', async () => {
        const h = saveCtx({ fail: true });
        const r = await h.save();
        expect(r.ok).toBe(false);
        expect(JSON.parse(h.ls.getItem('mm_decks'))[0].cards[0].q).toBe('nuova');
        expect(h.ls.getItem('cortex_decks_unsaved')).toBe('1');
        expect(h.toasts[0][1]).toBe('error');
        expect(h.events.find(e => e.type === 'cortex:save-status' && e.detail.status === 'error')).toBeTruthy();
    });
    it('scheda rimasta indietro dopo un cambio account: non salva', async () => {
        const h = saveCtx({ stale: true });
        expect(await h.save()).toEqual({ ok: false, error: 'stale_scope' });
        expect(h.ctx.syncToCloud).not.toHaveBeenCalled();
    });
    it('al riavvio la copia di riserva non confermata prevale su IndexedDB (più vecchio)', async () => {
        const ls = storage({ cortex_active_scope: 'u:A', mm_decks: JSON.stringify([{ id: 1, name: 'NUOVO' }]), cortex_decks_unsaved: '1' });
        const ctx = vm.createContext({ localStorage: ls, sessionStorage: storage(), window: {}, console, JSON, Date, Math, Object, Array, String, Set, Map,
            APP_CONFIG: { STORAGE_KEYS: { DECKS_V1: 'mm_decks', SESSIONS: 'mm_sessions' } }, todayStr: () => '2026-10-03', fbSecurityManager: {},
            migrateFromLocalStorage: async () => {}, migrateLegacyIDB: async () => false,
            loadDecks: async () => [{ id: 1, name: 'VECCHIO' }, { id: 2, name: 'solo in IDB' }], loadSessions: async () => [], loadRecordings: async () => [] });
        vm.runInContext(script('../core/accountScope.js'), ctx);
        vm.runInContext(script('../core/deckDeletion.js').replace("const KEY =", "const JOURNAL_KEY =").replaceAll('getItem(KEY)', 'getItem(JOURNAL_KEY)').replaceAll('setItem(KEY,', 'setItem(JOURNAL_KEY,'), ctx);
        vm.runInContext(script('../core/state.js'), ctx);
        await vm.runInContext('hydrateFromIDB()', ctx);
        expect(ctx.window._legacyState().decks.map(d => d.name)).toEqual(['NUOVO', 'solo in IDB']);
    });
});

describe('2.3 regole di unione (core/syncMerge.js)', () => {
    const d = (id, q, extra = {}) => ({ id, name: 'M' + id, cards: [{ q }], ...extra });
    const metaFor = (decks, extra = {}) => ({ initialized: true, hashes: Object.fromEntries(decks.map(x => [String(x.id), merge.deckHash(x)])), stamps: {}, ...extra });

    it('hash canonico: ordine delle chiavi e campi di sync non contano', () => {
        expect(merge.deckHash({ id: 1, a: 1, b: { y: 2, x: 1 } })).toBe(merge.deckHash({ b: { x: 1, y: 2 }, a: 1, id: 1, rev: 9, updatedAt: { seconds: 3 } }));
        expect(merge.deckHash(d(1, 'a'))).not.toBe(merge.deckHash(d(1, 'b')));
    });
    it('una modifica locale non sincronizzata non viene sovrascritta dal cloud', () => {
        const synced = d(1, 'vecchia', { rev: 3 });
        const meta = metaFor([synced]);
        const local = [d(1, 'NUOVA LOCALE', { rev: 3 })];
        const r = merge.mergeCloudIntoLocal({ local, cloud: [synced], meta });
        expect(r.decks).toEqual(local);
        expect(r.dirtyIds).toEqual(['1']);
    });
    it('cloud più recente e locale invariato: vince il cloud', () => {
        const synced = d(1, 'v1', { rev: 1 });
        const r = merge.mergeCloudIntoLocal({ local: [synced], cloud: [d(1, 'v2 da altro dispositivo', { rev: 2 })], meta: metaFor([synced]) });
        expect(r.decks[0].cards[0].q).toBe('v2 da altro dispositivo');
        expect(r.dirtyIds).toEqual([]);
    });
    it('modificato su entrambi: si tengono entrambe le versioni', () => {
        const synced = d(1, 'base', { rev: 1 });
        const r = merge.mergeCloudIntoLocal({ local: [d(1, 'locale', { rev: 1 })], cloud: [d(1, 'remota', { rev: 2 })], meta: metaFor([synced]), now: 7 });
        expect(r.decks.map(x => x.cards[0].q)).toEqual(['remota', 'locale']);
        expect(r.decks[1]).toMatchObject({ id: '1_copia_7', conflictOf: '1' });
        expect(r.conflicts).toEqual([{ id: '1', copyId: '1_copia_7' }]);
        expect(r.dirtyIds).toEqual(['1_copia_7']);
    });
    it('cancellato su un altro dispositivo: rimosso solo se qui non era stato modificato', () => {
        const a = d(1, 'a'), b = d(2, 'b');
        const r = merge.mergeCloudIntoLocal({ local: [a, d(2, 'b modificato')], cloud: [], meta: metaFor([a, b]) });
        expect(r.removed).toEqual(['1']);
        expect(r.decks.map(x => x.id)).toEqual([2]);
    });
    it('nuovo mazzo locale mai sincronizzato: resta; registro cancellazioni rispettato', () => {
        const r = merge.mergeCloudIntoLocal({ local: [d('nuovo', 'x'), d(9, 'cancellato')], cloud: [d(9, 'cancellato')], meta: metaFor([]), deleted: ['9'] });
        expect(r.decks.map(x => x.id)).toEqual(['nuovo']);
    });
    it('prima esecuzione: uguale → pulito, diverso → entrambi (nessuna perdita)', () => {
        const same = merge.mergeCloudIntoLocal({ local: [d(1, 'x', { updatedAt: { seconds: 1 } })], cloud: [d(1, 'x', { rev: 2 })], meta: null });
        expect(same.decks).toHaveLength(1); expect(same.dirtyIds).toEqual([]);
        const diff = merge.mergeCloudIntoLocal({ local: [d(1, 'offline')], cloud: [d(1, 'cloud')], meta: null, now: 5 });
        expect(diff.decks.map(x => x.cards[0].q)).toEqual(['cloud', 'offline']);
    });
    it('upload: solo i mazzi modificati; precondizione su revisione e timestamp', () => {
        const a = d(1, 'a', { rev: 2 }), b = d(2, 'b');
        const meta = metaFor([a], { stamps: { '1': 100 } });
        expect(merge.decksToUpload([a, b], meta).map(x => x.id)).toEqual([2]);
        expect(merge.uploadPrecondition({ local: a, cloudDoc: { rev: 2, updatedAt: 100 }, meta }).ok).toBe(true);
        expect(merge.uploadPrecondition({ local: a, cloudDoc: { rev: 3, updatedAt: 100 }, meta }).ok).toBe(false);
        expect(merge.uploadPrecondition({ local: a, cloudDoc: { rev: 2, updatedAt: 999 }, meta }).ok).toBe(false);   // scritto da un client vecchio
    });
    it('conflitto in upload: tocca solo quel mazzo', () => {
        const r = merge.resolveUploadConflict({ decks: [d(1, 'a'), d(2, 'b'), d(3, 'c')], deck: d(2, 'b'), cloudDoc: d(2, 'remoto'), meta: null, now: 1 });
        expect(r.decks.map(x => x.id)).toEqual([1, 2, '2_copia_1', 3]);
    });
});

describe('2.3 syncToCloud reale con Firestore finto', () => {
    function syncCtx({ local, cloud = {}, meta = null, offline = false }) {
        const docs = new Map(Object.entries(cloud));
        const txSets = [];
        const ls = storage({ cortex_active_scope: 'u:U', ...(meta ? { cortex_sync_meta: JSON.stringify(meta) } : {}) });
        const ref = { collection: () => ({ doc: id => ({ id }) }), set: async () => {} };
        const db = {
            collection: () => ({ doc: () => ref }),
            batch: () => ({ set() {}, delete() {}, commit: async () => {} }),
            runTransaction: async fn => {
                if (offline) throw Object.assign(new Error('offline'), { code: 'unavailable' });
                const writes = [];
                const out = await fn({ get: async t => ({ exists: docs.has(t.id), data: () => docs.get(t.id) }), set: (t, v) => writes.push([t.id, v]) });
                writes.forEach(([id, v]) => { docs.set(id, v); txSets.push(id); });
                return out;
            },
        };
        const ctx = vm.createContext({
            localStorage: ls, sessionStorage: storage(), console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, Object, Array, String, Set, Map, Promise, Event: class { constructor(t) { this.type = t; } },
            firebase: { apps: [{}], app: () => ({ firestore: () => db }), firestore: { Timestamp: { now: () => ({ toMillis: () => 500 }) }, FieldValue: { serverTimestamp: () => 1, arrayUnion: (...x) => x } } },
            window: { _fbUserId: 'U', dispatchEvent() {}, showToast: vi.fn() }, state: { decks: local }, hydrateFromIDB: async () => {},
            saveDecks: vi.fn(async () => {}), KEYS: { DECKS_V1: 'mm_decks' }, document: { getElementById: () => null, querySelectorAll: () => [] },
        });
        ctx.window._legacyState = () => ctx.state;
        vm.runInContext(script('../core/accountScope.js'), ctx);
        vm.runInContext(script('../core/syncMerge.js'), ctx);
        vm.runInContext(script('../core/deckDeletion.js').replace("const KEY =", "const JOURNAL_KEY =").replaceAll('getItem(KEY)', 'getItem(JOURNAL_KEY)').replaceAll('setItem(KEY,', 'setItem(JOURNAL_KEY,'), ctx);
        const src = read('../services/firebase.js');
        vm.runInContext(src.slice(src.indexOf('let _syncInFlight'), src.indexOf('export async function loadFromCloud')).replace(/\bexport /g, '') + '\nfunction _cleanForFs(v){ return JSON.parse(JSON.stringify(v)); }', ctx);
        return { ctx, docs, txSets, ls, sync: () => vm.runInContext('syncToCloud()', ctx) };
    }
    const d = (id, q, extra = {}) => ({ id, name: 'M' + id, cards: [{ q }], ...extra });

    it('carica solo il mazzo modificato e ne registra la revisione', async () => {
        const clean = d(1, 'uguale', { rev: 4 });
        const h = syncCtx({ local: [clean, d(2, 'nuovo')], cloud: { 1: clean }, meta: { initialized: true, hashes: { 1: merge.deckHash(clean) }, stamps: {} } });
        const r = await h.sync();
        expect(r).toMatchObject({ uploaded: 1, conflicts: 0, failed: 0 });
        expect(h.txSets).toEqual(['2']);
        expect(h.docs.get('2')).toMatchObject({ rev: 1 });
        expect(h.ctx.state.decks[1].rev).toBe(1);
        expect(h.ctx.saveDecks).toHaveBeenCalled();                       // revisione salvata anche in locale
        expect(merge.decksToUpload(h.ctx.state.decks, JSON.parse(h.ls.getItem('cortex_sync_meta')))).toEqual([]);
    });
    it('il cloud è cambiato da un altro dispositivo: nessuna sovrascrittura, entrambe le versioni', async () => {
        const base = d(1, 'base', { rev: 1 });
        const h = syncCtx({ local: [d(1, 'locale', { rev: 1 }), d(3, 'altro')], cloud: { 1: d(1, 'remota', { rev: 2 }), 3: d(3, 'altro') }, meta: { initialized: true, hashes: { 1: merge.deckHash(base), 3: merge.deckHash(d(3, 'altro')) }, stamps: {} } });
        const r = await h.sync();
        expect(r.conflicts).toBe(1);
        expect(h.docs.get('1').cards[0].q).toBe('remota');
        expect(h.ctx.state.decks.map(x => x.cards[0].q)).toEqual(['remota', 'locale', 'altro']);
        expect(h.ctx.window.showToast).toHaveBeenCalled();
    });
    it('offline: niente perso, il mazzo resta da sincronizzare', async () => {
        const h = syncCtx({ local: [d(5, 'offline')], offline: true });
        const r = await h.sync();
        expect(r).toMatchObject({ uploaded: 0, failed: 1 });
        expect(merge.decksToUpload(h.ctx.state.decks, JSON.parse(h.ls.getItem('cortex_sync_meta') || '{}')).map(x => x.id)).toEqual([5]);
    });
    it('scope di un altro account o scheda rimasta indietro: nessuna sincronizzazione', async () => {
        const h = syncCtx({ local: [d(5, 'x')] });
        h.ls.setItem('cortex_active_scope', 'u:ALTRO');
        expect(await h.sync()).toBeUndefined();
        expect(h.txSets).toEqual([]);
    });
});

describe('2.1 ordine di avvio', () => {
    it('lo spazio dati è fissato dal PRIMO import di main.js (prima che altri moduli leggano localStorage)', () => {
        const main = read('../main.js');
        const firstImport = main.split('\n').find(l => /^import\s/.test(l));
        expect(firstImport).toBe("import './core/scopeInit.js';");
        expect(read('../core/scopeInit.js')).toContain('ensureScopeInitialized();');
    });
});
