/**
 * modules/audioDB.js — Phase 28
 *
 * IndexedDB storage per le registrazioni audio.
 * Sostituisce il salvataggio base64 in localStorage (limite ~5MB).
 * Ogni record salva un Blob nativo — zero overhead base64, nessun limite pratico.
 */

const DB_NAME    = 'cortex-audio';
const DB_VERSION = 1;
const STORE      = 'recordings';

let _db = null;

function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror   = (e) => reject(e.target.error);
    });
}

/** Salva una nuova registrazione. Ritorna il nuovo id generato. */
export async function saveAudioRecording({ name, date, duration, mimeType, ext, blob }) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).add({ name, date, duration, mimeType, ext, blob });
        req.onsuccess = () => resolve(req.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

/** Carica tutte le registrazioni (ordinate per id crescente = ordine di inserimento). */
export async function loadAudioRecordings() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

/** Elimina una registrazione per id. */
export async function deleteAudioRecording(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).delete(id);
        req.onsuccess = () => resolve();
        req.onerror   = (e) => reject(e.target.error);
    });
}

/** Conta il numero totale di registrazioni. */
export async function countAudioRecordings() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

/**
 * Migra registrazioni legacy (base64 DataURL in state.recordings) a IndexedDB.
 * Al termine chiama clearFn() per rimuoverle dallo state/localStorage.
 * @returns {Promise<number>} numero di registrazioni migrate
 */
export async function migrateFromState(stateRecordings, clearFn) {
    if (!stateRecordings || stateRecordings.length === 0) return 0;
    let migrated = 0;
    for (const rec of stateRecordings) {
        try {
            const res  = await fetch(rec.data);
            const blob = await res.blob();
            await saveAudioRecording({
                name:     rec.name     || 'Lezione',
                date:     rec.date     || new Date().toLocaleString(),
                duration: rec.duration || '0:01',
                mimeType: rec.mimeType || 'audio/webm',
                ext:      rec.ext      || 'webm',
                blob,
            });
            migrated++;
        } catch (e) {
            console.warn('[audioDB] Migrazione fallita per', rec.name, e);
        }
    }
    if (migrated > 0) clearFn();
    return migrated;
}
