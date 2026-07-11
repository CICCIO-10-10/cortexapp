import { initEventBus }                                    from './eventBus.js';
import { initAnalytics, track, setUserProperty }           from './analytics.js';
import { APP_CONFIG }                                      from '../js/config.js';
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

    const formContainer = document.getElementById('feedback-form-container');
    const loginPrompt   = document.getElementById('feedback-login-prompt');
    const overlay       = document.getElementById('auth-overlay');

    if (user) {
        window._fbUserId        = user.uid;
        window._fbLoggedIn      = true;
        window._cortexUserEmail = user.email || '';   // usato da isAdmin()
        // Admin: marca il browser come no-track per le statistiche interne
        if (user.uid === 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2') {
            try { localStorage.setItem('cortex_no_track', '1'); } catch (_) {}
        }

        // Analytics: track login / first open
        const isFirstLogin = !localStorage.getItem('cortex_onboarded');
        track(isFirstLogin ? 'sign_up' : 'login', { method: 'google' });
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
            window._guestConversion = localStorage.getItem('cortex_guest') === '1';
            localStorage.removeItem('cortex_guest');
        } catch (_) {}
        const _gb = document.getElementById('guest-banner');
        if (_gb) { _gb.remove(); document.body.style.paddingTop = ''; }

        if (user.displayName) {
            localStorage.setItem('mm_user_name', user.displayName);
            localStorage.setItem('mm_is_logged_in', 'true');
        }
        if (user.email)    localStorage.setItem('mm_user_email', user.email);
        if (user.photoURL) localStorage.setItem('mm_user_avatar', user.photoURL);

        if (firebaseDeps.updateUserUI) {
            firebaseDeps.updateUserUI(user.displayName || localStorage.getItem('mm_user_name'), user.photoURL || localStorage.getItem('mm_user_avatar'));
        }
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
    } else {
        window._fbLoggedIn = false;
        if (formContainer) formContainer.style.display = 'none';
        if (loginPrompt)   loginPrompt.style.display = 'block';
        
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
