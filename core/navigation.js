/**
 * core/navigation.js — Phase 21 Refactoring
 *
 * Contiene tutta la logica di routing e navigazione estratta da main.js:
 *  - showPage(id)   — rendering delle pagine principali (switch + History API)
 *  - showView(id)   — bridge verso AppRouter per le view di dettaglio
 *  - popstate       — gestione tasto Back/Forward del browser
 *  - deep linking   — lettura URL al caricamento iniziale
 *
 * AppRouter (ui/router.js) è invece responsabile della History API "in entrata"
 * (back/forward, URL diretti). showPage rimane il "renderer" a cui AppRouter delega.
 */

import { AppRouter }    from '../ui/router.js';
import { CreateDeckView } from '../ui/views/CreateDeckView.js';
import { StudyPlanView }  from '../ui/views/StudyPlanView.js';
import { GlobalMapView }  from '../ui/views/GlobalMapView.js';
import { t }              from './i18n.js';

// Deps iniettate al boot tramite initNavigation()
let _deps = {
    renderHome:      null,
    renderDecks:     null,
    getTechPageHTML: null,
    renderTechList:  null,
    loadAudioList:   null,
    KEYS:            null,
    gState:          null,
};

// View instances (singleton per sessione)
let createDeckViewInstance = null;
let studyPlanViewInstance  = null;

/**
 * Inizializza il modulo con le dipendenze richieste e monta AppRouter.
 * Va chiamato UNA sola volta dal main.js (o da bootApp).
 */
export function initNavigation(deps = {}) {
    Object.assign(_deps, deps);

    // Monta AppRouter — gestisce popstate e deep linking via History API.
    // AppRouter._dispatch() chiama window.showPage() che è definito qui sotto.
    new AppRouter();

    // Esponi showPage globalmente — AppRouter e firebase.js la usano via window.*
    window.showPage = showPage;
    window.showView = showView;

    // popstate — tasto Back/Forward del browser (gestito anche da AppRouter,
    // ma lo manteniamo qui come fallback esplicito per rimane
    // compatibili con il codice che usa history.pushState({ page: ... }))
    window.addEventListener('popstate', (e) => {
        const page = e.state?.page || e.state?.pageId || 'home';
        showPage(page);
    });

    // Deep linking iniziale: se l'utente arriva su /tecniche, /materiale, ecc.
    // AppRouter gestisce già questo, ma manteniamo il mapping come fallback
    // per il caso in cui il modulo venga caricato prima di AppRouter.
    _handleInitialRoute();
}

// ── MAIN PAGE RENDERER ────────────────────────────────────────────────────────

export function showPage(id) {
    if (!id) return;
    const pageId = id.toLowerCase();


    // Update URL without reloading (History API)
    const urlMap = {
        home:      '/',
        tecniche:  '/tecniche',
        materiale: '/materiale',
        community: '/community',
        lezioni:   '/lezioni',
        settings:  '/settings',
    };
    const newUrl = urlMap[pageId] || '/';
    if (window.location.pathname !== newUrl) {
        history.pushState({ page: pageId }, '', newUrl);
    }

    window.scrollTo(0, 0);

    const appRoot = document.getElementById('app-root');
    if (!appRoot) return;

    // Make sure app-root is visible (inline style="display:none" set in HTML)
    appRoot.style.display = 'block';

    // Cleanup overlays in-progress (Level up, etc.)
    const activeOverlay = document.getElementById('level-up-celebration');
    if (activeOverlay) {
        activeOverlay.classList.remove('active');
        setTimeout(() => activeOverlay.remove(), 500);
    }

    // Reset UI state — nav tab highlights
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    // Alias mapping for tab highlights
    let tabId = pageId;
    if (pageId === 'techniques') tabId = 'tecniche';
    if (pageId === 'materials')  tabId = 'materiale';
    if (pageId === 'lessons')    tabId = 'audio';
    if (pageId === 'network')    tabId = 'community';

    const tab = document.getElementById('tab-' + tabId);
    if (tab) tab.classList.add('active');

    // ── Routing Switch ────────────────────────────────────────────────────────
    switch (pageId) {
        case 'home':
            appRoot.innerHTML = '<div id="home-root"></div>';
            window.cortexUpdateUIStrings?.();
            if (typeof _deps.renderHome === 'function') _deps.renderHome();
            break;

        case 'tecniche':
        case 'techniques':
            appRoot.innerHTML = `<div style="padding: 110px 20px 40px; max-width: 960px; margin: 0 auto;">${(typeof _deps.getTechPageHTML === 'function') ? _deps.getTechPageHTML() : ''}</div>`;
            window.cortexUpdateUIStrings?.();
            if (typeof _deps.renderTechList === 'function') _deps.renderTechList(appRoot);
            break;

        case 'materiale':
        case 'materials':
            appRoot.innerHTML = '<div id="decks-container" style="padding-top: 110px; min-height: 100vh;"></div>';
            window.cortexUpdateUIStrings?.();
            if (typeof _deps.renderDecks === 'function') _deps.renderDecks();
            break;

        case 'audio':
        case 'lessons':
            appRoot.innerHTML = `
                <div style="padding: 120px 32px 40px; max-width: 960px; margin: 0 auto;">
                    <div class="section-header">
                        <h2 style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:2rem;">🎙️</span> ${t('lessons_title')}
                        </h2>
                        <p style="color:var(--text-muted); font-size:0.9rem;">
                            ${t('lessons_subtitle')}
                        </p>
                    </div>

                    <div class="glass" style="padding:24px; text-align:center; margin-bottom:24px;">
                        <div id="audio-visualizer-container"
                            style="height:80px; background:rgba(0,0,0,0.2); border-radius:12px; margin-bottom:24px; overflow:hidden;">
                            <canvas id="audio-visualizer" style="width:100%; height:100%;"></canvas>
                        </div>

                        <div id="audio-timer"
                            style="font-size:2.5rem; font-weight:800; font-family:monospace; margin-bottom:16px;
                                   color:var(--text); text-shadow:0 0 10px var(--accent-glow);">
                            00:00:00
                        </div>

                        <div style="display:flex; gap:16px; justify-content:center;">
                            <button class="btn btn-primary" id="btn-start-record" data-fn="startAudioRecording"
                                style="border-radius:100px; padding:12px 32px; font-weight:800;
                                       display:flex; align-items:center; gap:8px;">
                                <span style="color:#ef4444;">🔴</span> ${t('btn_start_rec')}
                            </button>
                            <button class="btn btn-danger" id="btn-stop-record" data-fn="stopAudioRecording"
                                style="display:none; border-radius:100px; padding:12px 32px; font-weight:800;
                                       align-items:center; gap:8px; background:var(--red);
                                       border-color:var(--red); color:white;">
                                ⏹️ ${t('btn_stop_rec')}
                            </button>
                        </div>
                    </div>

                    <div class="section-header" style="margin-top:40px;">
                        <h3>${t('lessons_saved_title')}</h3>
                    </div>
                    <div id="audio-list-container"
                        style="display:flex; flex-direction:column; gap:12px;">
                        <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.9rem;">
                            ${t('lessons_loading')}
                        </div>
                    </div>
                </div>`;
            window.cortexUpdateUIStrings?.();
            if (typeof _deps.loadAudioList === 'function') _deps.loadAudioList();
            break;

        case 'community':
        case 'network':
        case 'stats': {
            const KEYS = _deps.KEYS || {};
            const gStateRaw   = localStorage.getItem(KEYS.GAME_STATE);
            const gStateLocal = gStateRaw ? JSON.parse(gStateRaw) : null;
            const hasProfile  = gStateLocal && gStateLocal.studentProfile;
            let isAdminCall = false;
            try {
                const ADMIN_UID   = 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2';
                const ADMIN_EMAIL = 'francesco1cutugno@gmail.com';
                const uid   = window._fbUserId || '';
                const email = (window._cortexUserEmail || '').toLowerCase();
                if (uid === ADMIN_UID || email === ADMIN_EMAIL) {
                    isAdminCall = true;
                } else {
                    const user = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
                    isAdminCall = !!(user && (user.uid === ADMIN_UID || (user.email || '').toLowerCase() === ADMIN_EMAIL));
                }
            } catch (_) { /* Firebase not yet initialized */ }

            if (!hasProfile) {
                appRoot.innerHTML = `
                <div id="community-root" style="padding: 120px 20px 40px; min-height: 100%; display: flex; align-items: center; justify-content: center;">
                    <div class="card" style="max-width:540px; width:100%; text-align:center; padding:50px 30px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:24px;">
                        <div style="font-size:3.5rem; margin-bottom:20px;">🧠</div>
                        <h2 style="color:var(--text); margin-bottom:12px; font-size:1.8rem; font-weight:800; letter-spacing:-0.02em;">Cortex Community</h2>
                        <p style="color:var(--text-muted); font-size:1rem; margin-bottom:30px; line-height:1.6;">
                            Prima di esplorare la rete e studiare con gli altri, l'Intelligenza Artificiale ha bisogno di capire come funziona il tuo cervello. Crea il tuo Profilo Cognitivo.
                        </p>
                        <button aria-label="Inizia il test attitudinale" class="btn btn-primary" data-fn="openArchitect" style="width:100%; padding:16px; border-radius:14px; font-weight:800; font-size:1.1rem; cursor:pointer; box-shadow:0 0 20px rgba(139,92,246,0.3);">Inizia Test Attitudinale 🚀</button>
                        ${isAdminCall ? `<button aria-label="Genera profilo random (Admin)" class="btn btn-outline" data-fn="generateRandomProfile" style="width:100%; margin-top:16px; padding:12px; border-radius:14px; font-weight:bold; cursor:pointer; border-color:rgba(255,255,255,0.1); color:var(--text); background:rgba(255,255,255,0.02); font-size: 0.9rem;">Genera Profilo Random (Admin)</button>` : ''}
                    </div>
                </div>`;
            window.cortexUpdateUIStrings?.();
            } else {
                appRoot.innerHTML = `
<div id="community-root" style="padding: 110px 0 0; min-height: 100%;">
<div style="max-width:900px; margin:0 auto; padding:0 20px 120px;">

    <!-- HERO -->
    <div style="text-align:center; margin-bottom:30px; margin-top:20px;">
        <h1 style="font-size:2rem; font-weight:800; letter-spacing:-0.02em; margin-bottom:8px;">🌍 Cortex Network &amp; Profilo</h1>
        <p style="color:var(--text-muted); font-size:0.95rem;">Il tuo profilo cognitivo e la community degli studenti.</p>
    </div>

    <!-- MAIN SEGMENTED CONTROL -->
    <div class="community-main-tabs" style="display:flex; justify-content:center; gap:16px; margin-bottom:30px;">
        <button id="main-tab-profilo" class="btn btn-primary" style="flex:1; max-width:200px; padding:12px; border-radius:12px; font-weight:bold; border:2px solid transparent;"
            data-fn="switchMainCommunityTab" data-params='["profilo"]'>🧠 Profilo</button>
        <button id="main-tab-network" class="btn btn-outline" style="flex:1; max-width:200px; padding:12px; border-radius:12px; font-weight:bold; border:2px solid rgba(255,255,255,0.2);"
            data-fn="switchMainCommunityTab" data-params='["network"]'>🌍 Network</button>
    </div>

    <!-- MACRO PANEL: PROFILO -->
    <div id="macro-panel-profilo">
        <!-- TEST E STATISTICHE -->
        <div id="stats-container"></div>
    </div>

    <!-- MACRO PANEL: NETWORK -->
    <div id="macro-panel-network" style="display:none;">
        
        <!-- NEURAL DUEL ARENA BANNER -->
        <div class="duel-arena-banner glass" style="margin-bottom:30px; padding:24px; border-radius:24px; border:1px solid rgba(255,255,255,0.08); background:linear-gradient(135deg, rgba(124,106,247,0.1), rgba(239,68,68,0.05)); display:flex; align-items:center; gap:20px; position:relative; overflow:hidden;">
            <div style="font-size:3rem; filter:drop-shadow(0 0 15px var(--accent-glow));">⚔️</div>
            <div style="flex:1;">
                <h3 style="font-family:'Outfit'; font-size:1.25rem; font-weight:800; color:#fff; margin-bottom:4px;">Neural Duel Arena (PvP)</h3>
                <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.4;">Sfida altri studenti in tempo reale. Metti alla prova i tuoi riflessi neurali e scala la vetta.</p>
            </div>
            <button class="btn btn-primary" data-fn="openNeuralDuels" style="padding:12px 24px; border-radius:100px; font-weight:700; box-shadow:0 0 20px rgba(124,106,247,0.3); white-space:nowrap;">Entra nell'Arena</button>
        </div>

        <!-- TABS INTERNI -->
        <div class="community-tabs">
            <button id="ctab-decks" class="community-tab active"
                data-fn="switchCommunityTab" data-params='["decks"]'>📦 Mazzi pubblici</button>
            <button id="ctab-board" class="community-tab"
                data-fn="switchCommunityTab" data-params='["board"]'>🏆 Leaderboard</button>
        </div>

        <!-- PANEL: MAZZI -->
        <div id="community-panel-decks">
            <div style="position:relative; margin-bottom:24px; padding-top:10px;">
                <input type="text" id="community-search" class="community-search"
                    placeholder="🔍  Cerca per materia, nome o autore..."
                    oninput="loadCommunityDecks(this.value)">
            </div>
            <div id="community-loading"
                style="text-align:center; padding:20px; color:var(--text-muted); display:none;">
                ⌛ Caricamento...
            </div>
            <div class="community-filters" id="community-sort-pills">
                <button class="community-filter-pill active"
                    data-fn="sortCommunity" data-params='["downloads"]'>🔥 Più Scaricati</button>
                <button class="community-filter-pill"
                    data-fn="sortCommunity" data-params='["recent"]'>🕔 Recenti</button>
                <button class="community-filter-pill"
                    data-fn="sortCommunity" data-params='["cards"]'>🃏 Più Carte</button>
            </div>
            <div id="community-decks-container"
                style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px;">
            </div>
            <div class="community-cta" style="margin:40px 0;">
                <div style="font-size:2rem; margin-bottom:12px;">🔗</div>
                <p style="font-weight:700; margin-bottom:8px;">Condividi i tuoi mazzi</p>
                <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:16px;">
                    Vai su Materiale, apri un mazzo e clicca il bottone 🔗 per generare un link da condividere.
                </p>
                <button aria-label="Vai alla pagina materiale" class="btn btn-primary" style="padding:12px 28px; border-radius:12px;"
                    data-fn="showPage" data-params='["materiale"]'>Vai a Materiale →</button>
            </div>
        </div>

        <!-- PANEL: LEADERBOARD -->
        <div id="community-panel-board" style="display:none;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; padding-top:10px;">
                <h2 style="font-family:'Outfit'; font-size:1.5rem; font-weight:800; color:#fff;">🏆 Leaderboard Globale</h2>
                <button data-fn="syncAndShowLeaderboard"
                    style="padding:8px 16px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);
                           background:rgba(255,255,255,0.05); color:var(--text); font-size:0.85rem; font-weight:600; cursor:pointer;">
                    🔄 Ricarica
                </button>
            </div>
            <div id="leaderboard-container" style="display:flex; flex-direction:column; gap:10px;"></div>
        </div>
    </div>

</div>
</div>`;
            window.cortexUpdateUIStrings?.();
                setTimeout(() => {
                    if (window.renderNetworkAndStats) window.renderNetworkAndStats();
                }, 100);
            }
            break;
        }

        case 'globalmap': {
            if (!window._globalMapViewInstance) {
                window._globalMapViewInstance = new GlobalMapView(window.__cortexStore, appRoot);
            }
            window._globalMapViewInstance.mountPoint = appRoot;
            window._globalMapViewInstance.mount();
            break;
        }

        // ── View-mode routes (bridged from showView) ──────────────────────────
        case 'create': {
            if (!createDeckViewInstance) createDeckViewInstance = new CreateDeckView(null, appRoot);
            createDeckViewInstance.mountPoint = appRoot;
            createDeckViewInstance.mount();
            window.scrollTo(0, 0);
            break;
        }
        case 'plan': {
            if (!studyPlanViewInstance) studyPlanViewInstance = new StudyPlanView(null, appRoot);
            studyPlanViewInstance.mountPoint = appRoot;
            studyPlanViewInstance.mount();
            window.scrollTo(0, 0);
            break;
        }

        default:
            console.warn('Unknown page ID:', pageId);
    }

    // UI transition (Fade in)
    if (appRoot.firstElementChild) {
        appRoot.firstElementChild.classList.remove('page-content');
        void appRoot.firstElementChild.offsetWidth; // force reflow
        appRoot.firstElementChild.classList.add('page-content');
    }
}

// ── SHOW VIEW BRIDGE ──────────────────────────────────────────────────────────
// Converte gli ID legacy (view-create, view-plan, view-decks) in rotte AppRouter.

export function showView(id) {
    const routeMap = {
        'view-decks':    'materiale',
        'view-create':   'create',
        'view-plan':     'plan',
        'CreateDeckView': 'create',   // FIX: alias usato in decks.js
        'create-deck':   'create',    // FIX: alias usato in onboarding.js
    };
    const route = routeMap[id];

    if (route && typeof window.__cortexNav === 'function') {
        window.__cortexNav(route);
        return;
    }

    // Fallback diretto nel caso AppRouter non sia ancora inizializzato
    if (route) {
        showPage(route);
    }
}

// ── INTERNAL ──────────────────────────────────────────────────────────────────

function _handleInitialRoute() {
    // AppRouter gestisce già il routing iniziale; questo è un fallback
    // per i path che AppRouter non conosce (es. /lezioni che non è in AppRouter).
    const pathToPage = {
        '/tecniche':  'tecniche',
        '/materiale': 'materiale',
        '/community': 'community',
        '/lezioni':   'lezioni',
        '/settings':  'settings',
    };
    const page = pathToPage[window.location.pathname];
    if (page) {
        document.addEventListener('DOMContentLoaded', () => showPage(page), { once: true });
    }
}
