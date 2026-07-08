/**
 * core/analytics.js — Cortex Firebase Analytics wrapper
 *
 * Thin wrapper attorno a firebase.analytics() per tracciare
 * gli eventi chiave dell'app senza dipendenze circolari.
 *
 * Uso:
 *   import { track } from '../core/analytics.js';
 *   track('study_session_start', { deck_id: '123', card_count: 20 });
 */

let _analytics = null;

/**
 * Inizializza Analytics (chiamato una volta dal bootstrap dopo firebase.initializeApp).
 * Se Firebase Analytics non è disponibile (ad es. ad-blocker), fallback silenzioso.
 */
export function initAnalytics() {
    try {
        if (typeof firebase !== 'undefined' && firebase.apps?.length) {
            _analytics = firebase.analytics();
        }
    } catch (e) {
        // Analytics bloccato da ad-blocker o non configurato — silenzioso
    }
}

/**
 * Traccia un evento Analytics.
 * @param {string} eventName  Nome evento (snake_case, max 40 char)
 * @param {Object} [params]   Parametri aggiuntivi (max 25 per evento)
 */
export function track(eventName, params = {}) {
    try {
        if (_analytics) {
            _analytics.logEvent(eventName, params);
        }
    } catch (_) {}
}

/**
 * Imposta proprietà utente (es. plan, goal).
 * @param {string} name  Nome proprietà
 * @param {string} value Valore
 */
export function setUserProperty(name, value) {
    try {
        if (_analytics) {
            _analytics.setUserProperties({ [name]: value });
        }
    } catch (_) {}
}
