import { APP_CONFIG } from '../js/config.js';
import { SecurityManager as fbSecurityManager } from '../services/firebase.js';
import { todayStr } from '../js/utils.js';
import { loadDecks, loadSessions, loadRecordings, migrateFromLocalStorage, migrateLegacyIDB } from './db.js';
import { withoutDeletedDecks } from './deckDeletion.js';
import { ensureScopeInitialized, mergeDecksById } from './accountScope.js';

const KEYS = APP_CONFIG.STORAGE_KEYS;

// Fase 2.1 (audit 2026-10): lo spazio dati dell'account va fissato PRIMA di
// leggere qualsiasi dato di studio da localStorage.
ensureScopeInitialized();

export let state = {
    decks: withoutDeletedDecks(JSON.parse(localStorage.getItem(KEYS.DECKS_V1) || '[]')),
    sessions: JSON.parse(localStorage.getItem(KEYS.SESSIONS) || '[]'),
    todayCards: parseInt(localStorage.getItem(KEYS.TODAY_CARDS) || '0'),
    todayAiCalls: parseInt(localStorage.getItem(KEYS.TODAY_AI_CALLS) || '0'),
    todayDate: localStorage.getItem(KEYS.TODAY_DATE) || '',
    username: localStorage.getItem(KEYS.USERNAME) || null,
    get geminiKey() {
        return fbSecurityManager.getApiKey();
    },
    set geminiKey(key) {
        if (key) fbSecurityManager.setApiKey(key);
    },
    transcriptionMode: localStorage.getItem('mm_transcription_mode') || 'local',
    aiSeverity: parseInt(localStorage.getItem('mm_ai_severity') || '50'),
    aiFeedbackStyle: localStorage.getItem('mm_ai_feedback_style') || 'standard',
    aiTemperature: parseFloat(localStorage.getItem('mm_ai_temp') || '0.7'),
    recordings: JSON.parse(localStorage.getItem('mm_recordings') || '[]')
};

// Reset daily counter if new day
if (state.todayDate !== todayStr()) {
    state.todayCards = 0;
    state.todayAiCalls = 0;
    state.todayDate = todayStr();
    localStorage.setItem(KEYS.TODAY_DATE, todayStr());
    localStorage.setItem(KEYS.TODAY_CARDS, '0');
    localStorage.setItem(KEYS.TODAY_AI_CALLS, '0');
}

window._legacyState = () => state;

/**
 * Carica i dati grandi da IndexedDB e aggiorna state in-place.
 * Da chiamare dopo il boot sincrono; quando risolve, la UI va re-renderata.
 * @returns {Promise<boolean>} true se i dati IDB erano presenti e più recenti
 */
let hydrationPromise;
export function hydrateFromIDB() {
    return hydrationPromise ||= hydrateStoredState();
}

/** Ricarica in memoria i dati del nuovo scope (usato solo se la ricarica pagina è bloccata). */
export function rehydrateForScope() {
    try { state.decks = withoutDeletedDecks(JSON.parse(localStorage.getItem(KEYS.DECKS_V1) || '[]')); } catch (_) { state.decks = []; }
    try { state.sessions = JSON.parse(localStorage.getItem(KEYS.SESSIONS) || '[]'); } catch (_) { state.sessions = []; }
    try { state.recordings = JSON.parse(localStorage.getItem('mm_recordings') || '[]'); } catch (_) { state.recordings = []; }
    hydrationPromise = null;
    return hydrateFromIDB();
}
async function hydrateStoredState() {
    const initialDecks = state.decks;
    try {
        // Prima esecuzione: migra i dati da localStorage → IDB
        await migrateFromLocalStorage(KEYS);
        // Fase 2.1: la vecchia chiave globale 'all' passa allo scope del proprietario
        // probabile (copia di sicurezza in 'legacy', 'all' non viene cancellata).
        try { await migrateLegacyIDB(); } catch (e) { console.warn('[State] migrazione legacy rimandata:', e); }

        const [idbDecks, idbSessions, idbRecordings] = await Promise.all([
            loadDecks(),
            loadSessions(),
            loadRecordings(),
        ]);

        let updated = false;

        if (Array.isArray(idbDecks)) {
            // An empty collection is valid. Do not overwrite a newer cloud/local update.
            if (state.decks === initialDecks) {
                if (localStorage.getItem('cortex_decks_unsaved') === '1') {
                    // Fase 2.2: l'ultimo salvataggio in IndexedDB non era riuscito; la copia
                    // di riserva è più recente e prevale (i mazzi solo in IndexedDB restano).
                    state.decks = withoutDeletedDecks(mergeDecksById(initialDecks, idbDecks));
                } else {
                    state.decks = withoutDeletedDecks(idbDecks);
                }
                updated = true;
            }
        }

        if (Array.isArray(idbSessions) && idbSessions.length > 0) {
            if (idbSessions.length >= state.sessions.length) {
                state.sessions = idbSessions;
            }
        }

        if (Array.isArray(idbRecordings) && idbRecordings.length > 0) {
            if (idbRecordings.length >= state.recordings.length) {
                state.recordings = idbRecordings;
            }
        }

        return updated;
    } catch (e) {
        console.warn('[State] hydrateFromIDB fallito:', e);
        return false;
    }
}

window._legacySetAI = ({ mode, key, severity, style, temp }) => {
    if (mode !== undefined) { state.transcriptionMode = mode; localStorage.setItem('mm_transcription_mode', mode); }
    if (key  !== undefined) { state.geminiKey = key; }
    if (severity !== undefined) { state.aiSeverity = severity; }
    if (style !== undefined) { state.aiFeedbackStyle = style; }
    if (temp !== undefined) { state.aiTemperature = temp; }
};
