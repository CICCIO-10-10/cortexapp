/**
 * core/db.js — IndexedDB wrapper per Cortex
 *
 * Sostituisce localStorage per i dati grandi (decks, sessions, recordings).
 * localStorage rimane per dati piccoli (settings, flags, contatori).
 *
 * Fase 2 (audit 2026-10): ogni chiave è lo SCOPE dell'account ('guest' | 'u:<uid>'),
 * vedi core/accountScope.js; le scritture propagano gli errori al chiamante.
 *
 * API pubblica:
 *   saveDecks(decks, scope?)  — salva array mazzi su IDB (lancia in caso di errore)
 *   loadDecks(scope?)         — carica array mazzi da IDB (null se vuoto/errore)
 *   saveSessions(list)   — salva storico sessioni
 *   loadSessions()       — carica storico sessioni
 *   saveRecordings(list) — salva registrazioni audio
 *   loadRecordings()     — carica registrazioni audio
 *   migrateFromLocalStorage(keys) — migrazione one-time da localStorage
 */

import { currentScope, legacyScope, mergeDecksById, mergeListsUnique } from './accountScope.js';

const DB_NAME    = 'cortex_db';
const DB_VERSION = 1;
const STORES     = ['decks', 'sessions', 'recordings'];

let _db = null;

/** Apre (o riusa) la connessione IDB. */
function openDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            for (const name of STORES) {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name);
                }
            }
        };

        req.onsuccess = (e) => {
            _db = e.target.result;
            _db.onversionchange = () => { _db.close(); _db = null; };
            resolve(_db);
        };

        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IDB blocked'));
    });
}

/** Legge un valore da uno store. Restituisce undefined se non esiste. */
async function idbGet(store, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

/** Scrive un valore in uno store. */
async function idbSet(store, key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(store, 'readwrite');
        const req = tx.objectStore(store).put(value, key);
        req.onerror   = () => reject(req.error);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('IDB transaction aborted'));
        tx.onerror = () => reject(tx.error);
    });
}

// ── API per scope (audit 2026-10, fase 2) ────────────────────────────────────
// Chiave IndexedDB = scope dell'account ('guest' | 'u:<uid>' | 'legacy').
// Le SCRITTURE propagano gli errori: chi salva deve sapere se il dato è davvero
// sul dispositivo (prima l'errore veniva solo scritto in console).
// Le LETTURE restituiscono null in caso di errore (con avviso in console).

async function readList(store, scope) {
    try { return await idbGet(store, scope); }
    catch (e) { console.warn(`[IDB] lettura ${store}/${scope} fallita:`, e); return null; }
}

export async function saveDecks(decks, scope = currentScope()) {
    await idbSet('decks', scope, decks);
}
export async function loadDecks(scope = currentScope()) {
    return readList('decks', scope);
}
export async function saveSessions(sessions, scope = currentScope()) {
    await idbSet('sessions', scope, sessions);
}
export async function loadSessions(scope = currentScope()) {
    return readList('sessions', scope);
}
export async function saveRecordings(recordings, scope = currentScope()) {
    await idbSet('recordings', scope, recordings);
}
export async function loadRecordings(scope = currentScope()) {
    return readList('recordings', scope);
}

/** Cancella i dati IndexedDB di uno scope (solo dopo una migrazione confermata). */
export async function deleteScopeData(scope) {
    const db = await openDB();
    await Promise.all(STORES.map(store => new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(scope);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('IDB transaction aborted'));
        tx.onerror = () => reject(tx.error);
    })));
}

/**
 * Migrazione una tantum della vecchia chiave globale 'all' (fase 2.1).
 * - copia di sicurezza in 'legacy' (mai cancellata in questa fase);
 * - unione nello scope del proprietario probabile (legacyScope());
 * - la chiave 'all' NON viene cancellata.
 */
export async function migrateLegacyIDB() {
    if (localStorage.getItem('cortex_idb_scoped') === '1') return false;
    const target = legacyScope();
    let moved = false;
    for (const store of STORES) {
        const old = await idbGet(store, 'all');
        if (!Array.isArray(old)) continue;
        const backup = await idbGet(store, 'legacy');
        if (!Array.isArray(backup)) await idbSet(store, 'legacy', old);
        const current = await idbGet(store, target);
        const merged = store === 'decks' ? mergeDecksById(current, old) : mergeListsUnique(current, old);
        await idbSet(store, target, merged);
        moved = true;
    }
    localStorage.setItem('cortex_idb_scoped', '1');
    return moved;
}

// ── Migrazione one-time da localStorage ──────────────────────────────────────

/**
 * Copia i dati esistenti da localStorage → IDB (eseguita una sola volta).
 * @param {object} keys — APP_CONFIG.STORAGE_KEYS
 * @returns {boolean} true se la migrazione è avvenuta
 */
export async function migrateFromLocalStorage(keys) {
    if (localStorage.getItem('cortex_idb_migrated') === '1') return false;

    let migrated = false;
    try {
        const rawDecks = localStorage.getItem(keys.DECKS_V1);
        if (rawDecks) {
            const decks = JSON.parse(rawDecks);
            if (Array.isArray(decks) && decks.length > 0) {
                await saveDecks(decks);
                migrated = true;
            }
        }

        const rawSessions = localStorage.getItem(keys.SESSIONS);
        if (rawSessions) {
            const sessions = JSON.parse(rawSessions);
            if (Array.isArray(sessions) && sessions.length > 0) {
                await saveSessions(sessions);
            }
        }

        const rawRecordings = localStorage.getItem('mm_recordings');
        if (rawRecordings) {
            const recordings = JSON.parse(rawRecordings);
            if (Array.isArray(recordings) && recordings.length > 0) {
                await saveRecordings(recordings);
            }
        }

        localStorage.setItem('cortex_idb_migrated', '1');
        if (migrated) console.log('[IDB] Migrazione da localStorage completata.');
        return migrated;
    } catch (e) {
        console.warn('[IDB] Migrazione fallita:', e);
        return false;
    }
}
