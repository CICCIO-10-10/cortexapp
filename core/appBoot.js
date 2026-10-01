import { initEventBus }                                    from './eventBus.js';
import { initAnalytics, track, setUserProperty }           from './analytics.js';
import { touchSeen }                                       from '../services/activation.js';
import { APP_CONFIG }                                      from '../js/config.js';
import { renderAccountState } from './account-state.js';
import { checkVersionUpdate, removeSplashScreen, showChangelogModal } from './boot.js';
// Espone showChangelog globalmente (usato dal bottone "Novità" nelle impostazioni)
window.showChangelog = () => showChangelogModal(null);
import { init as initGamification }                        from '../modules/gamification.js';
import { init as initCalendar }                            from '../modules/calendar.js';
import { init as initQuiz }                                from '../modules/quiz.js';
import { init as initDecks }                               from '../modules/decks.js';
import { init as initHome }                                from '../modules/home.js';
import { init as initStudy }                               from '../modules/study.js';
import { init as initDeckForm }                            from '../modules/deckForm.js';
import { init as initStudyPlan }                           from '../modules/studyPlan.js';
import { init as initDeckCreate }                          from '../modules/deckCreate.js';
import { init as initPomodoro }                            from '../modules/pomodoro.js';
import { init as initLoci }                                from '../modules/loci.js';
import { init as initOralExam }                            from '../modules/oralExam.js';
import { init as initBossMode }                            from '../modules/bossMode.js';
import { init as initCommunity }                           from '../modules/community.js';
import { init as initAudioRecording }                      from '../modules/audioRecording.js';
import { init as initChallengeMode }                       from '../modules/challengeMode.js';
import { init as initArchitect }                           from '../modules/architect.js';
import { init as initExam }                                from '../modules/examMode.js';
import { init as initNeuralDuels, registerDuelsGlobals }  from '../modules/neuralDuels.js';

let appDeps = null;
let modulesInitialized = false;

export function initApp(deps) {
    appDeps = deps;
    
    // Phase 6: event delegation
    initEventBus();
    
    // Phase 12: registrations
    if (deps.registerFirebaseGlobals) deps.registerFirebaseGlobals(deps.register);
    if (deps.registerAIGlobals) deps.registerAIGlobals(deps.register);
    if (deps.registerSettingsGlobals) deps.registerSettingsGlobals(deps.register);
    if (deps.registerPdfAIGlobals) deps.registerPdfAIGlobals(deps.register);
    if (deps.initTechniques) deps.initTechniques(deps.register);
    if (deps.initFeedback) deps.initFeedback(deps.register);
    
    // Sprint 8: Memory Bank & Global Map
    deps.register('startStudyById', deps.startStudyById);
    deps.register('navigate', (p) => { if (window.__cortexNav) window.__cortexNav(p); });

    // Neural Duels 1v1
    initNeuralDuels({ state: deps.state, showToast: deps.showToast, awardXP: deps.awardXP });
    registerDuelsGlobals(deps.register);
}

export function onAuthStateChangedHandler(user, firebaseDeps = {}) {
    if (!appDeps) return;
    const deps = appDeps;
    renderAccountState(user, firebaseDeps.updateUserUI || (() => {}));

    const formContainer = document.getElementById('feedback-form-container');
    const loginPrompt   = document.getElementById('feedback-login-prompt');
    const overlay       = document.getElementById('auth-overlay');

    if (user && !user.isAnonymous) {
        window._fbUserId        = user.uid;
        localStorage.setItem('mm_user_id', user.uid);
        window._fbLoggedIn      = true;
        window._fbHasUser       = true;
        window._cortexUserEmail = user.email || '';   // usato da isAdmin()
        // Admin: marca il browser come no-track per le statistiche interne
        if (user.uid === 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2') {
            try { localStorage.setItem('cortex_no_track', '1'); } catch (_) {}
        }

        // Il flag onboarding è per-browser e non dimostra una nuova registrazione:
        // un account esistente su un browser nuovo veniva contato come sign_up.
        // Firebase Auth fornisce creationTime/lastSignInTime; deduplichiamo anche
        // l'evento nello stesso browser. Il KPI giornaliero resta basato su Auth.
        const authMeta = user.metadata || {};
        const createdMs = Date.parse(authMeta.creationTime || '') || 0;
        const signedInMs = Date.parse(authMeta.lastSignInTime || '') || 0;
        const signupMarker = createdMs ? `cortex_signup_telemetry_${user.uid}_${createdMs}` : '';
        let isNewAuthAccount = !!(createdMs && signedInMs && Math.abs(signedInMs - createdMs) <= 2 * 60 * 1000);
        try {
            if (signupMarker && localStorage.getItem(signupMarker)) isNewAuthAccount = false;
            if (signupMarker) localStorage.setItem(signupMarker, '1');
        } catch (_) {}
        track(isNewAuthAccount ? 'sign_up' : 'login', {
            method: 'google',
            ...(isNewAuthAccount ? { auth_created_recently: true } : {}),
        });
        // Collega la prima sorgente/campagna consentita al profilo Auth appena creato.
        // Non sovrascrive una prima attribuzione già salvata e non persiste UTMs senza consenso.
        if (isNewAuthAccount) {
            try {
                const consented = localStorage.getItem('cortex_cookie_consent') === 'accepted';
                const source = localStorage.getItem('cortex_acquisition_source') ||
                    (consented ? localStorage.getItem('cx_src0') : '');
                const campaign = consented ? localStorage.getItem('cx_campaign0') : '';
                const attribution = {};
                if (source) attribution.acquisitionSource = source.slice(0, 40);
                if (campaign) attribution.acquisitionCampaign = campaign.slice(0, 80);
                if (Object.keys(attribution).length && typeof firebase !== 'undefined' && firebase.apps?.length) {
                    const ref = firebase.app().firestore().collection('users').doc(user.uid);
                    firebase.app().firestore().runTransaction(async tx => {
                        const snap = await tx.get(ref);
                        const profile = snap.exists ? snap.data() : {};
                        const firstTouch = {};
                        if (!profile.acquisitionSource && attribution.acquisitionSource) firstTouch.acquisitionSource = attribution.acquisitionSource;
                        if (!profile.acquisitionCampaign && attribution.acquisitionCampaign) firstTouch.acquisitionCampaign = attribution.acquisitionCampaign;
                        if (Object.keys(firstTouch).length) {
                            firstTouch.acquisitionTs = Date.now();
                            tx.set(ref, firstTouch, { merge: true });
                        }
                    }).catch(() => {});
                }
            } catch (_) {}
        }
        touchSeen(); // D1/D7: aggiorna lastSeen (+ firstSeen una volta) server-side
        const plan = localStorage.getItem('cortex_user_plan') || 'free';
        setUserProperty('plan', plan);
        const goal = localStorage.getItem('cortex_user_goal');
        if (goal) setUserProperty('study_goal', goal);
        if (overlay)        overlay.classList.add('hidden');
        if (formContainer)  formContainer.style.display = 'block';
        if (loginPrompt)    loginPrompt.style.display = 'none';

        // Login completato → esci dalla modalità ospite e rimuovi il banner
        // FIX 10/07/2026: memorizza che questa sessione è una conversione ospite→account,
        // così loadFromCloud() fa il merge dei mazzi locali invece di sovrascriverli.
        try {
            // FIX 01/10/2026: window.__guestLogin rimuove 'cortex_guest' PRIMA del login, quindi qui
            // risultava sempre false e su un account gia' esistente i mazzi creati da ospite
            // venivano sostituiti da quelli cloud. Il marcatore temporaneo (30 min) lo conserva.
            let _convTs = 0;
            try { _convTs = parseInt(localStorage.getItem('cortex_guest_conversion_ts') || '0', 10) || 0; } catch (_) {}
            window._guestConversion = localStorage.getItem('cortex_guest') === '1' ||
                (_convTs > 0 && Date.now() - _convTs <= 30 * 60 * 1000);
            localStorage.removeItem('cortex_guest');
            localStorage.removeItem('cortex_guest_conversion_ts');
        } catch (_) {}
        // Funnel TOLC: accesso completato da chi aveva creato il mazzo errori da ospite (una volta).
        try { if (typeof window.__cxTolcErrorLoginDone === 'function') window.__cxTolcErrorLoginDone(); } catch (_) {}
        const _gb = document.getElementById('guest-banner');
        if (_gb) { _gb.remove(); document.body.style.paddingTop = ''; }

        // AUTO-RESUME: se un ospite aveva avviato una generazione AI ed e' appena
        // entrato, riprende la generazione da dove aveva lasciato (no-op se niente in sospeso).
        try { setTimeout(() => { try { if (window.__resumePendingAI) window.__resumePendingAI(); } catch (_) {} }, 1200); } catch (_) {}

        if (user.displayName) {
            localStorage.setItem('mm_user_name', user.displayName);
            localStorage.setItem('mm_is_logged_in', 'true');
        }
        if (user.email)    localStorage.setItem('mm_user_email', user.email);
        if (user.photoURL) localStorage.setItem('mm_user_avatar', user.photoURL);

        if (firebaseDeps.loadFromCloud) {
            firebaseDeps.loadFromCloud();
        }

        // ── Post-payment: gestisci success e cancel da Stripe ──
        _checkUpgradeSuccess();

        window.showPage?.('home');
        removeSplashScreen();

        // Ricarica feedback DOPO che window._fbUserId è settato:
        // così i pulsanti admin (Elimina/Fissa/Rispondi) appaiono se l'utente è admin.
        setTimeout(() => {
            if (typeof window.loadFeedbackMessages === 'function') {
                window.loadFeedbackMessages();
            }
        }, 300);

        if (firebaseDeps.setupPushNotifications) {
            firebaseDeps.setupPushNotifications(user.uid);
        }

        // ── Referral tracking: salva codice ref in Firestore se presente ────────
        // Il codice ?ref=XXXXXXXX viene catturato al primo caricamento e
        // scritto su users/{uid}.referredBy solo una volta (flag cortex_ref_tracked).
        try {
            const pendingRef = localStorage.getItem('cortex_pending_ref');
            const alreadyTracked = localStorage.getItem('cortex_ref_tracked') === '1';
            if (pendingRef && !alreadyTracked) {
                const db = typeof firebase !== 'undefined' && firebase.apps?.length
                    ? firebase.app().firestore()
                    : null;
                if (db) {
                    db.collection('users').doc(user.uid).set(
                        { referredBy: pendingRef, referredAt: Date.now() },
                        { merge: true }
                    ).then(() => {
                        localStorage.setItem('cortex_ref_tracked', '1');
                        localStorage.removeItem('cortex_pending_ref');
                    }).catch(() => {});
                }
            }
        } catch (_) {}

        const isTutorialOver = localStorage.getItem('cortex_onboarded') === '1';
        if (!isTutorialOver) {
            if (typeof window.triggerOnboardingOverlay === 'function') window.triggerOnboardingOverlay();
        } else {
            if (typeof window.checkApiKeyOnboarding === 'function') window.checkApiKeyOnboarding();
        }
    } else if (user && user.isAnonymous) {
        // Ospite anonimo: token valido per generare via proxy, ma NON e' un
        // account registrato -> niente sign_up, niente cloud sync, niente rimozione
        // del banner ospite, fuori dal conteggio iscritti. UX ospite invariata.
        window._fbUserId   = user.uid;
        window._fbHasUser  = true;
        window._fbLoggedIn = false;
        removeSplashScreen();
    } else {
        window._fbLoggedIn = false;
        window._fbHasUser  = false;
        if (formContainer) formContainer.style.display = 'none';
        if (loginPrompt)   loginPrompt.style.display = 'block';

        // Ospite arrivato per generare (pending AI dagli errori TOLC): mostra il
        // gate di login; dopo l'accesso il resume genera le flashcard.
        try { if (localStorage.getItem('cortex_pending_ai')) { setTimeout(function(){ try { if (localStorage.getItem('cortex_pending_ai') && typeof window.showGuestLoginGate === 'function') window.showGuestLoginGate('tolc_errors'); } catch (_) {} }, 1000); } } catch (_) {}
        
        const redirectPending = localStorage.getItem('cortex_redirect_pending') === '1';

        // Firebase ha confermato che non c'è un utente autenticato.
        // Pulisci il localStorage stale (sessione scaduta o mai completata).
        localStorage.removeItem('mm_is_logged_in');
        localStorage.removeItem('mm_user_name');
        localStorage.removeItem('mm_user_avatar');

        const isGuest = localStorage.getItem('cortex_guest') === '1';
        if (overlay) {
            if (redirectPending || isGuest) {
                // Redirect Google in corso, oppure sessione OSPITE → nessun muro login
                overlay.classList.add('hidden');
            } else {
                // Utente non autenticato → mostra schermata login
                overlay.classList.remove('hidden');
            }
        }
        if (isGuest) {
            const appRoot = document.getElementById('app-root');
            if (appRoot) appRoot.style.display = 'block';
            if (typeof window.__initGuestMode === 'function') window.__initGuestMode();
        }
        window.showPage?.('home');
        removeSplashScreen();
    }


    // Initialize modules only once to avoid duplicate bindings on auth state changes
    if (!modulesInitialized) {
        modulesInitialized = true;
        
        initGamification({ showToast: deps.showToast });
        initCalendar({ state: deps.state });
        initQuiz({ state: deps.state, showToast: deps.showToast, awardXP: deps.awardXP, gState: deps.gState, saveGState: deps.saveGState, earnBadge: deps.earnBadge, checkBadges: deps.checkBadges });
        initDecks({ state: deps.state });
        initExam({ state: deps.state, showToast: deps.showToast });
        
        initHome({
            loadFeedbackMessages: deps.loadFeedbackMessages,
            clearChallengeTimer: () => {
                if (typeof window.challengeTimer !== 'undefined' && window.challengeTimer) {
                    clearInterval(window.challengeTimer); window.challengeTimer = null;
                }
            },
        });

        initStudy({
            state: deps.state, saveState: deps.saveState, showToast: deps.showToast, awardXP: deps.awardXP,
            todayCardsKey: deps.KEYS.TODAY_CARDS,
            refreshDueCounts: typeof deps.refreshDueCounts === 'function' ? deps.refreshDueCounts : null,
            getCurrentDeckIndex: deps.getCurrentDeckIndex,
            setCurrentDeckIndex: deps.setCurrentDeckIndex,
            onSessionEnd: typeof deps.onSessionEnd === 'function' ? deps.onSessionEnd : null,
        });

        initDeckForm({
            state: deps.state, saveState: deps.saveState, showToast: deps.showToast,
            updateCharCount: deps.updateCharCount, showView: deps.showView,
            getCurrentDeckIndex: deps.getCurrentDeckIndex,
            setCurrentDeckIndex: deps.setCurrentDeckIndex,
        });

        initStudyPlan({
            state: deps.state, saveState: deps.saveState, showToast: deps.showToast,
            showView: deps.showView, discoverGeminiModel: deps.discoverGeminiModel,
            getCurrentDeckIndex: deps.getCurrentDeckIndex,
            setCurrentDeckIndex: deps.setCurrentDeckIndex,
        });

        initDeckCreate({
            state: deps.state, saveState: deps.saveState, showToast: deps.showToast,
            discoverGeminiModel: deps.discoverGeminiModel,
            getCurrentDeckIndex: deps.getCurrentDeckIndex,
            addPair: deps.addPair,
        });

        initPomodoro({ showToast: deps.showToast });
        initLoci({ state: deps.state, showToast: deps.showToast });
        initOralExam({ state: deps.state, showToast: deps.showToast, speakAI: deps.speakAI, evaluateWithGemini: deps.evaluateWithGemini, getLang: deps.getLang });
        initBossMode({ state: deps.state, evaluateWithGemini: deps.evaluateWithGemini, getLang: deps.getLang });
        initCommunity({
            state: deps.state, saveState: deps.saveState, showToast: deps.showToast,
            renderDecks: deps.renderDecks, getDB: deps.getFirestoreDB, initFirebase: deps.initFirebase,
            getGState: () => deps.gState, getLevel: deps.getLevel,
        });
        initAudioRecording({ state: deps.state, saveState: deps.saveState, showToast: deps.showToast });
        initChallengeMode({ showToast: deps.showToast, getActiveContext: deps.getActiveContext, callGeminiWithSearch: deps.callGeminiWithSearch });
        initArchitect({
            state: deps.state, gState: deps.gState, saveState: deps.saveState, saveGState: deps.saveGState,
            showToast: deps.showToast, renderDecks: deps.renderDecks, renderHome: deps.renderHome,
            discoverGeminiModel: deps.discoverGeminiModel, KEYS: deps.KEYS,
            updateUIStrings: deps.updateUIStrings,
        });
    }
}

export function bootApp(deps) {
    // 0. Init Analytics (before any other work)
    initAnalytics();
    track('app_open', { version: String(APP_CONFIG.VERSION) });

    // 0. Technical pre-checks
    checkVersionUpdate();

    // 0b. Ripristina badge admin-preview se era attivo nella sessione precedente
    if (deps.restoreAdminPreviewBadge) deps.restoreAdminPreviewBadge();

    // 1. Core Init
    initApp(deps);

    // 2. Safety Fallback: rimuovi splash screen se auth impiega troppo (700ms)
    setTimeout(removeSplashScreen, 700);

    // 3a. Offline fast-path: se offline e l'utente era già loggato, avvia subito in modalità locale
    if (!navigator.onLine) {
        const wasLoggedIn = localStorage.getItem('mm_is_logged_in') === 'true';
        if (wasLoggedIn) {
            console.warn('[Boot] Offline + utente precedentemente loggato → avvio modalità locale');
            // Simula lo stato di login con i dati locali
            const uid = localStorage.getItem('mm_user_id') || 'offline_user';
            window._fbUserId    = uid;
            window._fbLoggedIn  = true;
            window._offlineMode = true;
            const formContainer = document.getElementById('feedback-form-container');
            const loginPrompt   = document.getElementById('feedback-login-prompt');
            const overlay       = document.getElementById('auth-overlay');
            if (overlay)       overlay.classList.add('hidden');
            if (formContainer) formContainer.style.display = 'block';
            if (loginPrompt)   loginPrompt.style.display = 'none';
            deps.updateUserUI?.(localStorage.getItem('mm_user_name'), localStorage.getItem('mm_user_avatar'));
            setTimeout(() => deps.showToast?.('📵 Sei offline. Puoi studiare i tuoi mazzi salvati.', 'info'), 1200);
        }
    }

    // 3b. Safety Fallback: se Firebase non risponde entro 5s, mostra overlay login
    // Questo garantisce che l'utente possa sempre accedere anche se Firebase è lento o bloccato.
    setTimeout(() => {
        if (!window._fbLoggedIn && localStorage.getItem('cortex_guest') !== '1') {
            const overlay = document.getElementById('auth-overlay');
            if (overlay && overlay.classList.contains('hidden')) {
                console.warn('[Boot] Firebase non ha risposto in 5s — mostro overlay login come fallback');
                overlay.classList.remove('hidden');
            }
        }
    }, 5000);
}

// ── POST-PAYMENT: mostra conferma dopo redirect da Stripe ────────────────────
function _checkUpgradeSuccess() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') !== 'success') return;

    // Rimuovi il parametro dall'URL senza ricaricare la pagina
    try {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);
    } catch (_) {}

    setTimeout(() => {
        if (typeof window.showPage === 'function') window.showPage('settings');
    }, 500);
}
