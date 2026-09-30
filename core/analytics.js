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
function analyticsAllowed() {
    try {
        return localStorage.getItem('cortex_cookie_consent') === 'accepted' &&
            localStorage.getItem('cortex_no_track') !== '1' &&
            window.__cortexTrackingDisabled !== true;
    } catch (_) { return false; }
}
const SAFE_USER_PROPERTIES = new Set(['plan', 'study_goal']);
function safeEventParams(input) {
    const output = {};
    const sensitive = /email|uid|user.?id|name|answer|question|prompt|text|content|transcript|token|secret|key|phone|address|ip/i;
    for (const [key, value] of Object.entries(input && typeof input === 'object' ? input : {})) {
        if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key) || sensitive.test(key)) continue;
        if (typeof value === 'boolean') output[key] = value;
        else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
        else if (typeof value === 'string' && value.length <= 80 &&
            !/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value) && !/AIza[\w-]{20,}|[A-Za-z0-9_-]{32,}/.test(value)) {
            output[key] = value;
        }
    }
    return output;
}
// Only action names, never documents, answers, email addresses or event metadata.
const CLARITY_STEPS = new Set(['app_open', 'onboarding_start', 'onboarding_shown', 'onboarding_complete',
    'cards_generated', 'cards_saved', 'generated_cards_saved', 'study_session_start',
    'study_session_completed', 'activated', 'tolc_sim_open', 'tolc_test_start', 'tolc_first_answer', 'tolc_sim_complete',
    'onboarding_finished', 'onboarding_skipped',
    'lezione_aperta', 'lezione_foto_ocr', 'lezione_strutturata', 'lezione_riassunto', 'lezione_genera', 'lezione_mazzo_salvato',
    // 25/09/2026: ponte TOLC -> studio, per vederlo negli imbuti Clarity
    'tolc_errors_generate_click', 'tolc_sim_enter_cortex', 'tolc_share_click',
    'tolc_errors_login_completed', 'tolc_error_cards_generation_started', 'tolc_error_cards_generated',
    'tolc_error_cards_generation_failed', 'tolc_error_cards_saved', 'tolc_error_first_study',
    'tolc_exit_prompt_shown', 'tolc_exit_prompt_leave',
    // 25/09/2026 tracking v3 (tracking plan: docs/TRACKING_PLAN.md)
    'tolc_selector_viewed', 'tolc_type_picked', 'tolc_intro_viewed', 'tolc_selector_closed', 'tolc_test_quit',
    'onboarding_step_viewed', 'onboarding_finished', 'onboarding_skipped', 'onboarding_goal_selected',
    'cards_generation_started', 'cards_generation_failed', 'generated_cards_discarded', 'cloud_sync_failed',
    'material_first_answer', 'material_practice_completed']);
const CLARITY_ANDROID_STEPS = new Set(['app_open', 'onboarding_shown', 'onboarding_finished', 'onboarding_skipped',
    'cards_generation_started', 'cards_generated', 'generated_cards_saved', 'study_session_start',
    'study_session_completed', 'activated', 'tolc_sim_complete', 'tolc_errors_generate_click',
    'tolc_error_cards_generated', 'tolc_error_cards_saved', 'tolc_error_first_study']);

/**
 * Inizializza Analytics (chiamato una volta dal bootstrap dopo firebase.initializeApp).
 * Se Firebase Analytics non è disponibile (ad es. ad-blocker), fallback silenzioso.
 */
export function initAnalytics() {
    if (!analyticsAllowed()) return;
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
// 26/09/2026 — ERRORI VISIBILI: il build di produzione elimina i console.error, quindi un
// errore vero degli utenti non lo vedeva nessuno. Ora un errore JS non gestito (del nostro
// codice, non di estensioni/terze parti) diventa l'evento 'js_error' → dashboard.
(function () {
    try {
        if (typeof window === 'undefined' || window.__cxErrHook) return;
        window.__cxErrHook = true;
        let sent = 0; const seen = new Set();
        const send = (msg) => {
            try {
                const reason = String(msg || 'unknown').replace(/users\/[A-Za-z0-9_-]+/g, 'users/…').slice(0, 80);
                if (sent >= 3 || seen.has(reason)) return;
                seen.add(reason); sent++;
                track('js_error', { reason });
            } catch (_) {}
        };
        window.addEventListener('error', (ev) => {
            const f = String((ev && ev.filename) || '');
            if (f && f.indexOf(location.origin) !== 0) return;   // estensioni / CDN esterni: ignorati
            if (!f && !(ev && ev.error)) return;                  // errori di caricamento risorse
            send((ev && ev.message) || (ev && ev.error && ev.error.message));
        });
        window.addEventListener('unhandledrejection', (ev) => {
            const r = ev && ev.reason;
            send('promise: ' + ((r && (r.code || r.message)) || r));
        });
    } catch (_) {}
})();

export function track(eventName, params = {}) {
    try {
        if (!analyticsAllowed()) return;
        const safeParams = safeEventParams(params);
        try { if (window.__cxLogStep) window.__cxLogStep(eventName, safeParams); } catch (_) {}
        let eventParams = safeParams;
        let appPlatform = 'unknown';
        try { if (typeof window.__cxGetPlatform === 'function') appPlatform = window.__cxGetPlatform(); } catch (_) {}
        try {
            const acquisitionSource = typeof window.__cxGetSource === 'function' ? window.__cxGetSource() : undefined;
            eventParams = { ...safeParams, app_platform: appPlatform };
            if (acquisitionSource) eventParams.acquisition_source = acquisitionSource;
            const acquisitionCampaign = typeof window.__cxGetCampaign === 'function' ? window.__cxGetCampaign() : undefined;
            if (acquisitionCampaign) eventParams.acquisition_campaign = acquisitionCampaign;
        } catch (_) { eventParams = { ...safeParams, app_platform: appPlatform }; }
        try {
            if (CLARITY_STEPS.has(eventName) && typeof window.clarity === 'function' &&
                /^(www\.)?cortexapp\.it$/.test(window.location.hostname)) {
                window.clarity('event', eventName);
                if (appPlatform === 'android_twa' && CLARITY_ANDROID_STEPS.has(eventName)) {
                    window.clarity('event', eventName + '_android_twa');
                }
            }
        } catch (_) {}
        if (_analytics) {
            _analytics.logEvent(eventName, eventParams);
        } else if (typeof window.gtag === 'function') {
            // FIX 10/07/2026: app.html non carica firebase-analytics-compat →
            // _analytics era sempre null e TUTTI gli eventi (sign_up, onboarding,
            // study_session_start…) venivano scartati in silenzio.
            // Fallback su gtag (G-DFJ42477QK, caricato nel <head> di app.html).
            window.gtag('event', eventName, eventParams);
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
        if (!analyticsAllowed()) return;
        if (!SAFE_USER_PROPERTIES.has(name) || typeof value !== 'string' || value.length > 40 || /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value)) return;
        if (_analytics) {
            _analytics.setUserProperties({ [name]: value });
        } else if (typeof window.gtag === 'function') {
            window.gtag('set', 'user_properties', { [name]: value });
        }
    } catch (_) {}
}
