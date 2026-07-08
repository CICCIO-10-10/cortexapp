export const APP_CONFIG = {
    VERSION: __CORTEX_VERSION__,

    // ===== STORAGE KEYS =====
    // Fonte di verità unica per tutte le chiavi localStorage dell'app.
    // NON duplicare queste stringhe nei altri file — importa APP_CONFIG.STORAGE_KEYS.
    STORAGE_KEYS: {
        PROFILE:     'cortex_user_v1',   // Profilo utente (onboarding, aura ecc.)
        DRAFT:       'cortex_draft',     // Bozza non salvata del testo in textarea
        DECKS_V2:    'cortex_v2',        // Stato app (store Redux) – versione corrente
        DECKS_V1:    'mm_decks',         // Mazzi legacy – solo migrazione, non scrivere
        GAME_STATE:  'mm_gstate',        // Stato gamification (xp, streak, badges)
        LAST_VER:    'cortex_last_version', // Cache-busting versione
        // Chiavi legacy di main.js (ex KEYS.* — Phase 4→5)
        SESSIONS:    'mm_sessions',      // Storico sessioni di studio
        TODAY_CARDS: 'mm_today_cards',   // Carte studiate oggi (contatore)
        TODAY_DATE:  'mm_today_date',    // Data corrente per reset giornaliero
        USERNAME:    'mm_username',      // Username scelto dall'utente
        TODAY_AI_CALLS: 'cortex_today_ai_calls', // Chiamate IA effettuate oggi
    },

    // ===== CREDENZIALI =====
    // ⚠️ NON inserire mai le chiavi reali direttamente qui se il codice è versionato.
    // Usa Firebase Remote Config o un file .env escluso da .gitignore.
    API_KEY: 'IL_TUO_VALORE', // Chiave Google Gemini — da sovrascrivere in produzione

    // Stripe publishable key (sicura: può stare nel frontend)
    STRIPE_PK: 'pk_live_51TI6vXLSl8FWM72pTQykszwEPcJaqZBN5jxIGfygmeHkDIE9IPPK42kx2acv4VQSOy0yq6uDKofpRhmEjwPsYN1g00eLAD6Daa',

    // ===== ENDPOINTS =====
    ENDPOINTS: { GEMINI: 'https://generativelanguage.googleapis.com' },

    // ===== TEMI =====
    THEMES: { LOGIC: '#00ffff', SYNTHESIS: '#be00ff' },

    // ===== DEBUG =====
    // Imposta a true SOLO in sviluppo locale per abilitare window.__debug_dispatch
    DEBUG: false,
};
