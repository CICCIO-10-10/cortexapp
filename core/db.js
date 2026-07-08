/**
 * core/db.js — IndexedDB wrapper per Cortex
 *
 * Sostituisce localStorage per i dati grandi (decks, sessions, recordings).
 * localStorage rimane per dati piccoli (settings, flags, contatori).
 *
 * API pubblica:
 *   saveDecks(decks)     — salva array mazzi su IDB
 *   loadDecks()          — carica array mazzi da IDB (null se vuoto)
 *   saveSessions(list)   — salva storico sessioni
 *   loadSessions()       — carica storico sessioni
 *   saveRecordings(list) — salva registrazioni audio
 *   loadRecordings()     — carica registrazioni audio
 *   migrateFromLocalStorage(keys) — migrazione one-time da localStorage
 */

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
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
        tx.oncomplete = () => resolve();
    });
}

// ── Deck API ─────────────────────────────────────────────────────────────────

export async function saveDecks(decks) {
    try {
        await idbSet('decks', 'all', decks);
    } catch (e) {
        console.warn('[IDB] saveDecks fallito:', e);
    }
}

export async function loadDecks() {
    try {
        return await idbGet('decks', 'all');
    } catch (e) {
        console.warn('[IDB] loadDecks fallito:', e);
        return null;
    }
}

// ── Sessions API ──────────────────────────────────────────────────────────────

export async function saveSessions(sessions) {
    try {
        await idbSet('sessions', 'all', sessions);
    } catch (e) {
        console.warn('[IDB] saveSessions fallito:', e);
    }
}

export async function loadSessions() {
    try {
        return await idbGet('sessions', 'all');
    } catch (e) {
        console.warn('[IDB] loadSessions fallito:', e);
        return null;
    }
}

// ── Recordings API ────────────────────────────────────────────────────────────

export async function saveRecordings(recordings) {
    try {
        await idbSet('recordings', 'all', recordings);
    } catch (e) {
        console.warn('[IDB] saveRecordings fallito:', e);
    }
}

export async function loadRecordings() {
    try {
        return await idbGet('recordings', 'all');
    } catch (e) {
        console.warn('[IDB] loadRecordings fallito:', e);
        return null;
    }
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
