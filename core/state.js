import { APP_CONFIG } from '../js/config.js';
import { SecurityManager as fbSecurityManager } from '../services/firebase.js';
import { todayStr } from '../js/utils.js';
import { loadDecks, loadSessions, loadRecordings, migrateFromLocalStorage } from './db.js';

const KEYS = APP_CONFIG.STORAGE_KEYS;

export let state = {
    decks: JSON.parse(localStorage.getItem(KEYS.DECKS_V1) || '[]'),
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
export async function hydrateFromIDB() {
    try {
        // Prima esecuzione: migra i dati da localStorage → IDB
        await migrateFromLocalStorage(KEYS);

        const [idbDecks, idbSessions, idbRecordings] = await Promise.all([
            loadDecks(),
            loadSessions(),
            loadRecordings(),
        ]);

        let updated = false;

        if (Array.isArray(idbDecks) && idbDecks.length > 0) {
            // Usa IDB solo se ha più mazzi o lo stesso numero (IDB è la fonte autorevole)
            if (idbDecks.length >= state.decks.length) {
                state.decks = idbDecks;
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
