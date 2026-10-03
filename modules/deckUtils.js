import { APP_CONFIG } from '../js/config.js';
import { state } from '../core/state.js';
import { renderDecks } from './decks.js';
import { showToast } from '../core/ui.js';
import { syncToCloud } from '../services/firebase.js';
import { syncPublicProfile } from './community.js';
import { saveDecks, saveSessions, saveRecordings } from '../core/db.js';
import { t } from '../core/i18n.js';
import { rememberDeletedDecks } from '../core/deckDeletion.js';
import { isScopeStale } from '../core/accountScope.js';

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
        const deck = state.decks[i];
        if (!deck) return;
        // Persist intent synchronously, before updating UI or starting network work.
        try { rememberDeletedDecks([deck.id]); }
        catch (_) { showToast('Impossibile salvare l’eliminazione. Libera spazio e riprova.', 'error'); return; }
        state.decks = state.decks.filter((_, index) => index !== i);
        saveState({ immediate: true });
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
let _saveSeq = 0;
let _lastSaveErrorToast = 0;

/** Stato del salvataggio sul dispositivo, per la UI: 'saving' | 'saved' | 'error' | 'blocked'. */
function _emitSaveStatus(status, detail = {}) {
    window.__cortexSaveStatus = status;
    try { window.dispatchEvent(new CustomEvent('cortex:save-status', { detail: { status, ...detail } })); } catch (_) {}
}

/**
 * Salva lo stato (audit 2026-10, fase 2.2):
 *  - la scrittura in IndexedDB viene ATTESA; solo se riesce si toglie la copia
 *    di riserva in localStorage (prima veniva tolta subito, anche in caso di errore);
 *  - se IndexedDB fallisce si scrive la copia di riserva e l'utente viene avvisato;
 *  - una scheda rimasta indietro dopo un cambio account non salva nulla.
 * @returns {Promise<{ok:boolean, error?:any}>}
 */
export function saveState({ immediate = false } = {}) {
    clearTimeout(saveStateTimeout);
    if (isScopeStale()) {
        _emitSaveStatus('blocked');
        showToast('Hai cambiato account in un\'altra scheda: ricarica questa pagina per continuare.', 'error');
        return Promise.resolve({ ok: false, error: 'stale_scope' });
    }
    state.decks = [...state.decks]; // Mark local edits newer than an in-flight boot read.
    const seq = ++_saveSeq;
    const decks = state.decks;
    _emitSaveStatus('saving');

    // Sessioni e registrazioni: copia sincrona in localStorage come prima.
    try {
        if (state.sessions)   localStorage.setItem(KEYS.SESSIONS,   JSON.stringify(state.sessions));
        if (state.recordings) localStorage.setItem('mm_recordings', JSON.stringify(state.recordings));
    } catch (_) { /* quota esaurita per dati di supporto — non bloccante */ }

    if (typeof window.__cortexDispatch === 'function') {
        window.__cortexDispatch({ type: 'HYDRATE_STATE', payload: { decks } });
    }
    window.dispatchEvent(new Event('cortex:decks-changed'));
    if (immediate) syncToCloud();
    else saveStateTimeout = setTimeout(() => syncToCloud(), 500);

    const writes = [saveDecks(decks)];
    if (state.sessions)   writes.push(saveSessions(state.sessions));
    if (state.recordings) writes.push(saveRecordings(state.recordings));
    return Promise.all(writes).then(() => {
        // Solo l'ultimo salvataggio confermato può togliere la copia di riserva.
        if (seq === _saveSeq) {
            localStorage.removeItem(KEYS.DECKS_V1);
            localStorage.removeItem('cortex_decks_unsaved');
        }
        _emitSaveStatus('saved');
        return { ok: true };
    }).catch((error) => {
        let fallback = false;
        try {
            localStorage.setItem(KEYS.DECKS_V1, JSON.stringify(decks));
            localStorage.setItem('cortex_decks_unsaved', '1'); // al riavvio questa copia prevale su IndexedDB
            fallback = true;
        } catch (_) {}
        _emitSaveStatus('error', { fallback });
        console.error('[Save] IndexedDB non disponibile:', error);
        const now = Date.now();
        if (now - _lastSaveErrorToast > 30000) {
            _lastSaveErrorToast = now;
            showToast(fallback
                ? 'Salvataggio sul dispositivo non riuscito: abbiamo tenuto una copia di riserva. Libera spazio e riapri l’app.'
                : 'Salvataggio sul dispositivo NON riuscito e spazio esaurito: non chiudere l’app finché non torni online.', 'error');
        }
        return { ok: false, error };
    });
}

let syncInterval = null;
export function startSmartSync() {
    if (!syncInterval) {
        syncInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && state.username) syncPublicProfile();
        }, 60000);
    }
}
