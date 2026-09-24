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
// Only action names, never documents, answers, email addresses or event metadata.
const CLARITY_STEPS = new Set(['app_open', 'onboarding_start', 'onboarding_shown', 'onboarding_complete',
    'cards_generated', 'cards_saved', 'generated_cards_saved', 'study_session_start',
    'study_session_completed', 'activated', 'tolc_sim_open', 'tolc_test_start', 'tolc_first_answer', 'tolc_sim_complete',
    'lezione_aperta', 'lezione_foto_ocr', 'lezione_strutturata', 'lezione_riassunto', 'lezione_genera', 'lezione_mazzo_salvato',
    // 25/09/2026: ponte TOLC -> studio, per vederlo negli imbuti Clarity
    'tolc_errors_generate_click', 'tolc_sim_enter_cortex', 'tolc_share_click']);

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
        if (localStorage.getItem('cortex_no_track') === '1') return;
        try { if (window.__cxLogStep) window.__cxLogStep(eventName, params); } catch (_) {}
        try {
            if (CLARITY_STEPS.has(eventName) && typeof window.clarity === 'function' &&
                /^(www\.)?cortexapp\.it$/.test(window.location.hostname)) {
                window.clarity('event', eventName);
            }
        } catch (_) {}
        if (_analytics) {
            _analytics.logEvent(eventName, params);
        } else if (typeof window.gtag === 'function') {
            // FIX 10/07/2026: app.html non carica firebase-analytics-compat →
            // _analytics era sempre null e TUTTI gli eventi (sign_up, onboarding,
            // study_session_start…) venivano scartati in silenzio.
            // Fallback su gtag (G-DFJ42477QK, caricato nel <head> di app.html).
            window.gtag('event', eventName, params);
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
        if (localStorage.getItem('cortex_no_track') === '1') return;
        if (_analytics) {
            _analytics.setUserProperties({ [name]: value });
        } else if (typeof window.gtag === 'function') {
            window.gtag('set', 'user_properties', { [name]: value });
        }
    } catch (_) {}
}
