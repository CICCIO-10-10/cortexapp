import { APP_CONFIG } from '../js/config.js';
import { state } from '../core/state.js';
import { renderDecks } from './decks.js';
import { showToast } from '../core/ui.js';
import { syncToCloud } from '../services/firebase.js';
import { syncPublicProfile } from './community.js';
import { saveDecks, saveSessions, saveRecordings } from '../core/db.js';

const KEYS = APP_CONFIG.STORAGE_KEYS;

export function updateCharCount() {
    const el = document.getElementById('char-count');
    const textEl = document.getElementById('deck-text');
    if (el && textEl) {
        el.textContent = textEl.value.length;
    }
}

export function confirmDelete(i) {
    const btn = document.getElementById('del-btn-' + i);
    if (!btn) return;
    
    if (btn.dataset.confirming === '1') {
        state.decks.splice(i, 1);
        saveState();
        renderDecks();
        showToast(t('deck_deleted'), 'success');
    } else {
        btn.dataset.confirming = '1';
        btn.textContent = t('confirm_label');
        btn.style.color = 'var(--gold)';
        setTimeout(() => {
            if (btn) { 
                btn.dataset.confirming = '0'; 
                btn.textContent = '🗑️'; 
                btn.style.color = 'var(--red)'; 
            }
        }, 3000);
    }
}

let saveStateTimeout;
export function saveState() {
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
        // ── Scrivi dati grandi su IndexedDB (nessun limite di dimensione) ────────
        saveDecks(state.decks);
        if (state.sessions)   saveSessions(state.sessions);
        if (state.recordings) saveRecordings(state.recordings);

        // ── Mantieni localStorage come cache di boot per dati piccoli ────────────
        // Non salviamo più i deck su localStorage per evitare QuotaExceededError.
        // Solo sessions e recordings rimangono su LS come fallback sincrono.
        try {
            if (state.sessions)   localStorage.setItem(KEYS.SESSIONS,   JSON.stringify(state.sessions));
            if (state.recordings) localStorage.setItem('mm_recordings', JSON.stringify(state.recordings));
        } catch (_) { /* quota esaurita per dati di supporto — non bloccante */ }

        syncToCloud();

        if (typeof window.__cortexDispatch === 'function') {
            window.__cortexDispatch({ type: 'HYDRATE_STATE', payload: { decks: state.decks } });
        }
    }, 500);
}

let syncInterval = null;
export function startSmartSync() {
    if (!syncInterval) {
        syncInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && state.username) syncPublicProfile();
        }, 60000);
    }
}
