// services/storage.js
import { APP_CONFIG } from '../js/config.js';

/**
 * Gestione Salvataggio Locale (LocalStorage).
 * La chiave è centralizzata in APP_CONFIG.STORAGE_KEYS.DECKS_V2 — non duplicarla qui.
 */
const KEY = APP_CONFIG.STORAGE_KEYS.DECKS_V2;

export const Storage = {
    save(state) {
        try {
            localStorage.setItem(KEY, JSON.stringify(state));
        } catch (e) {
            console.error("[Storage] Errore salvataggio locale:", e);
        }
    },
    load() {
        try {
            const data = localStorage.getItem(KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error("[Storage] Errore caricamento locale:", e);
            return null;
        }
    },
    clear() {
        try {
            localStorage.removeItem(KEY);
        } catch (e) {
            console.error("[Storage] Errore pulizia locale:", e);
        }
    }
};
