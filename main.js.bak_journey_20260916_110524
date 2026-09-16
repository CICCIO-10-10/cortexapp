/**
 * main.js — Cortex Main Hub
 * Entry point for the application orchestration and global registry.
 */

// --- CORE LIBRARIES ---
import { APP_CONFIG }                                      from './js/config.js';
import { state, hydrateFromIDB }                          from './core/state.js';
import { bootApp }                                         from './core/appBoot.js';
import { register }                                        from './core/registry.js';
import { initEventBus }                                    from './core/eventBus.js';
import { t, updateUIStrings, changeLanguage, toggleLangMenu } from './core/i18n.js';
import { initNavigation, showPage, showView }              from './core/navigation.js';
import { initOnboarding,
         goObSlide, setObGoal,
         checkApiKeyOnboarding, closeOnboarding,
         triggerOnboardingOverlay, checkOnboarding,
         saveAcquisitionSource }                           from './core/onboarding.js';
import { initPWA, installPWA, dismissInstall, closeInstallModal, triggerSmartInstallPrompt } from './core/pwa.js';
import { initUI, showToast, showPaywall }                   from './core/ui.js';

// --- FIREBASE & BACKEND ---
import { registerFirebaseGlobals, applySavedSettings as fbApplySavedSettings,
         SecurityManager as fbSecurityManager,
         getFirestoreDB, loginWithGoogle, handleRedirectResult,
         initFirebase, syncToCloud, uploadMediaToCloud, loadFromCloud,
         deleteFeedback, pinFeedback, replyFeedback } from './services/firebase.js';

// --- SERVICES ---
import { registerAIGlobals,
         handleAudioFile, handleImageFile,
         promptYouTubeLink, promptWebLink,
         speakAI, populateVoiceList,
         updateVoicePreference, discoverGeminiModel,
         evaluateWithGemini }                           from './services/ai.js';
import { registerSettingsGlobals,
         openSettings, closeSettings, saveAllSettings,
         toggleTheme, applySavedTheme,
         applySavedAccessibility, toggleZenMode, toggleReadability,
         restoreAdminPreviewBadge }                      from './services/settings.js';
import { processAnswer, isDue, getDueCards, getDeckStats } from './services/srs.js';
import { 
    handlePdfDrop, openPdfChunking, runAutoChunk, 
    addAllChunksToDeck, handlePdfFile, handleImageUpload, 
    toggleVoiceRecording 
} from './services/fileHandler.js';

// --- UI & MODULES ---
import { TECHNIQUES }                                      from './data/techniques.js';
import { init as initTechniques,
         renderTechList, showTechDetail,
         showTechDetailMuzii, hideTechDetail,
         getTechPageHTML }                                from './modules/techniques.js?v=11.0';
import { init as initFeedback }                          from './modules/feedback.js';
import { init as initExam,
         startExam }                                      from './modules/examMode.js';
import { todayStr, daysDiff, escapeHTML, sanitizeHTML,
         fetchWithTimeout, fisherYatesShuffle,
         handleAIError }                                    from './js/utils.js';
import { generatePAO, renderPAOTable, togglePAOTable }    from './modules/pao.js';
import { init as initCalendar, renderCalendar, calNav }   from './modules/calendar.js';
import { init as initQuiz,
         startQuiz, answerQuiz, closeQuiz }                from './modules/quiz.js';
import { init as initDecks, renderDecks }                  from './modules/decks.js';
import { init as initHome,
         renderHome }                      from './modules/home.js';
import { init as initCommunity,
         switchMainCommunityTab, switchCommunityTab, loadCommunityDecks,
         loadLeaderboard, shareDeck, importSharedDeck, checkImportParam,
         promptImportDeck, syncPublicProfile, sortCommunity,
         syncAndShowLeaderboard, syncWeeklyXP, reportDeck } from './modules/community.js';

import { 
    renderStats, injectGamPanel, calcStreak, refreshDueCounts 
} from './modules/statsPanel.js';
import { init as initStudy,
         startStudy, startStudyById, showCard, flipCard,
         rateCard, closeStudy }                            from './modules/study.js';
import { init as initGamification,
         gState, saveGState, getLevel, getNextLevel,
         awardXP, earnBadge, checkBadges,
         ALL_BADGES,
         shareStreakMilestone, addStreakFreezes, getStreakStatus } from './modules/gamification.js';
import { openQuickMode }                                          from './modules/quickMode.js';
import { openTolcSim }                                            from './modules/tolcSim.js';
import { init as initDeckForm,
         addPair, removePair,
         handleExamAttachments, renderPendingAttachments,
         removeExamAttachment, resetPendingAttachments,
         saveDeck, editDeck, openAddMaterial,
         importCSVFlashcards }                             from './modules/deckForm.js';
import { init as initStudyPlan,
         showStudyPlan, saveAndGeneratePlan,
         regeneratePlanWithAI }                            from './modules/studyPlan.js';
import { init as initDeckCreate,
         applyTemplate, toggleFlashcards,
         autoGenerateFlashcards }                          from './modules/deckCreate.js';
import { init as initPomodoro,
         pomoModes, pomoState,
         openPomodoro, closePomodoro,
         togglePomodoro, resetPomodoro,
         pomodoroToggle, pomodoroReset,
         setPomoMode, setSoundscape, applyYouTubeLink,
         updatePomoDisplay, saveTimerSettings }            from './modules/pomodoro.js';
import { init as initLoci,
         openLoci, closeLoci, loadLociImage,
         toggleLociMode, clearLociPins,
         simulateAIVision }                               from './modules/loci.js';
import { init as initOralExam,
         startOral, toggleSpeechRecognition,
         nextOralQuestion, closeOralExam,
         openProfSelector, closeProfSelector,
         selectProfDeck, renderProfStep1, confirmProfMode,
         setOralInputMode, sendChatMessage,
         getProfModeShort, getProfModeLabel, getProfModeCssClass } from './modules/oralExam.js';
import { init as initBossMode,
         startBossMode, toggleBossMic,
         nextBossQuestion, closeBossMode }                from './modules/bossMode.js';
// physicsMap.js rimosso (feature rimossa — grafo 3D non usato)

import { init as initAudioRecording,
         loadAudioList, deleteRecording, downloadRecording, shareRecording,
         startAudioRecording, stopAudioRecording }        from './modules/audioRecording.js';
import { init as initChallengeMode,
         startChallengeMode, startNeuralTrial,
         submitExamAnswer }                               from './modules/challengeMode.js';
import { init as initArchitect,
         appSync,
         openArchitect, closeArchitect,
         getActiveContext, callGeminiWithSearch,
         askHybridTutor, updateHybridStatusBadge,
         renderMaterialSection, toggleSource, deleteSource, handleFileUpload,
         renderNeuralStrips, updateUsername, changeAvatar, renderDeckGrid,
         getUnlockedMilestones, isAdmin,
         generatePersonalizedTutorPlan, renderNetworkAndStats, drawRadarChart,
         renderNeuralDashboard, renderArchStep, finalizeNeuralProfile,
         saveArchAnswer, saveArchAnswerText, generateAuraPlan, renderAuraPlanDashboard,
         applyArchipelagoMethod, generateRandomProfile, resetSystemForTesting,
         quickGenerateDeck } from './modules/architect.js';
import { registerPdfAIGlobals,
         openPdfAIFromFile, openPdfAIFromText,
         savePdfAIDeck, closePdfAI }                   from './modules/pdfToFlashcards.js';
import { init as initPodcast, registerPodcastGlobals } from './modules/neuralPodcast.js';
import { openMindMap, closeMindMap }                   from './modules/mindMap.js';
import { updateCharCount, confirmDelete, saveState, startSmartSync } from './modules/deckUtils.js';
import { initCookieBanner, injectAgeCheck, validateAgeConsent,
         exportUserData, openDeleteAccountModal,
         openStripePortal, registerGDPRGlobals }          from './modules/gdpr.js';
// visualGraph.js rimosso (feature rimossa — knowledge graph 3D non usato)
import { registerDuelsGlobals, init as initDuels }                          from './modules/neuralDuels.js';

// --- NEW FEATURE MODULES ---
import { initNotifications }                                                  from './services/notifications.js';
import { checkAndSendWeeklyReport }                                           from './services/neuralCoach.js';
import { initWidget, updateWidgetData }                                      from './services/widget.js';
import { initSocialProfile }                                                 from './services/socialProfile.js';
import { initSeasonalEvents, updateEventProgress, getActiveEvent }          from './services/seasonalEvents.js';
import { checkAndShowChallengeOnLaunch }                                     from './services/notificationChallenge.js';
import { checkAndConfirmReferral }                                           from './services/referralLeaderboard.js';
import { renderProfilePage }                                                 from './modules/profilePage.js';

// --- END OF IMPORTS ---

// Espone gState globalmente — richiesto da loadFromCloud (firebase.js) per sincronizzare
// studentProfile, XP, badges dal cloud su tutti i dispositivi.
window.gState = gState;

// Inizializzazione PDF.js per evitare mismatch di versione.

const style = document.createElement('style');
style.textContent = `
    button, .card, .loci-pin, .quiz-opt {
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
    }
`;
document.head.appendChild(style);

// NOTA: le chiavi Gemini vengono salvate in localStorage per persistenza tra sessioni.
// SecurityManager legge sessionStorage prima (più sicuro), poi localStorage come fallback.

// Main Application Logic

const KEYS = APP_CONFIG.STORAGE_KEYS;

// ONE-TIME CORTEX DATA MIGRATION: rinomina "Aura" → "Cortex" nei dati utente legacy.
// FIX: usa JSON.parse/stringify invece di regex su stringa grezza,
// così solo i campi title dei mazzi vengono modificati — i contenuti delle carte sono intatti.
try {
    const rawDecks = localStorage.getItem(KEYS.DECKS_V1);
    if (rawDecks && rawDecks.includes('Aura')) {
        const decks = JSON.parse(rawDecks);
        let changed = false;
        decks.forEach(d => {
            if (d.title && d.title.includes('Aura')) {
                d.title = d.title.replace(/Aura/g, 'Cortex');
                changed = true;
            }
        });
        if (changed) localStorage.setItem(KEYS.DECKS_V1, JSON.stringify(decks));
    }
    const rawBadges = localStorage.getItem(KEYS.GAME_STATE);
    if (rawBadges && rawBadges.includes('Aura')) {
        // gstate è un oggetto flat con valori primitivi — replace su stringa JSON è sicuro qui
        localStorage.setItem(KEYS.GAME_STATE, rawBadges.replace(/"Aura"/g, '"Cortex"'));
    }
} catch (e) { console.error("Data migration Aura→Cortex failed", e); }

// --- SYSTEM INITIALIZATION ---
const APP_VERSION = String(APP_CONFIG.VERSION);
console.log('Cortex Version:', APP_VERSION);

// ── PRE-AUTH FAST PATH: se l'utente era già loggato, nascondi subito l'overlay
// mentre Firebase si ricollega in background — elimina il flash bianco/login
(function preAuthFastPath() {
    const wasLoggedIn    = localStorage.getItem('mm_is_logged_in') === 'true';
    const redirectPending = localStorage.getItem('cortex_redirect_pending') === '1';
    const isGuest         = localStorage.getItem('cortex_guest') === '1';
    if (wasLoggedIn || redirectPending || isGuest) {
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            console.log('[Boot] Pre-auth fast path: overlay nascosto (utente noto).');
        }
    }
})();

console.log('[Boot] UI initializing...');
initUI();
console.log('[Boot] UI initialized.');
window.showToast = showToast;
window.showPaywall = showPaywall;

// Fix 5: modal di conferma non bloccante — sostituisce confirm() nativo (che su mobile
// alcuni browser bloccano quando l'app è in iframe o in modalità standalone PWA).
window.showConfirmModal = (message, onConfirm, onCancel) => {
    const existing = document.getElementById('cortex-confirm-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'cortex-confirm-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.innerHTML = `
        <div style="background:rgba(20,20,28,0.98);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:32px;max-width:360px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.7);">
            <p style="color:#fff;font-size:1rem;margin:0 0 24px;text-align:center;line-height:1.5;">${message}</p>
            <div style="display:flex;gap:12px;">
                <button id="_cm-cancel" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px;color:rgba(255,255,255,0.7);font-size:0.95rem;cursor:pointer;">Annulla</button>
                <button id="_cm-ok" style="flex:1;background:linear-gradient(135deg,#ef4444,#b91c1c);border:none;border-radius:12px;padding:12px;color:#fff;font-size:0.95rem;font-weight:700;cursor:pointer;">Elimina</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    document.getElementById('_cm-cancel').onclick = () => { close(); onCancel?.(); };
    document.getElementById('_cm-ok').onclick     = () => { close(); onConfirm?.(); };
    modal.addEventListener('click', e => { if (e.target === modal) { close(); onCancel?.(); } });
};
// Helper per paywall: espone getFunctions al modal (evita import circolare in ui.js)
window._getFunctions = () => getFunctions();
window.handleAIError = (err, ctx) => handleAIError(err, ctx, showToast);

// GDPR: cancella account e tutti i dati
window._deleteAccount = async () => {
    const confirmed = window.confirm(
        '⚠️ Sei sicuro di voler eliminare il tuo account?\n\nQuesta azione è IRREVERSIBILE:\n• Tutti i tuoi mazzi verranno eliminati\n• Il tuo progresso e gli XP verranno persi\n• Il tuo abbonamento verrà annullato\n\nDigita "ELIMINA" nella prossima finestra per confermare.'
    );
    if (!confirmed) return;
    const typed = window.prompt('Scrivi ELIMINA per confermare la cancellazione definitiva:');
    if (typed?.trim().toUpperCase() !== 'ELIMINA') {
        showToast('Cancellazione annullata.', 'info');
        return;
    }
    const btn = document.getElementById('btn-delete-account');
    if (btn) { btn.disabled = true; btn.textContent = t('main_deleting'); }
    try {
        const fns = getFunctions();
        const deleteAccount = fns.httpsCallable('deleteUserAccount');
        await deleteAccount({});
        // Pulizia locale
        localStorage.clear();
        showToast(t('main_account_deleted'), 'success');
        setTimeout(() => { window.location.href = '/'; }, 2000);
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = t('main_delete_account_btn'); }
        showToast(t('main_err_delete'), 'error');
        console.error('[GDPR] delete error:', e);
    }
};
// Helper: controlla se l'utente ha il piano Student
// Se il cloud sync non ha ancora verificato il piano, assume il piano dal localStorage
// ma non blocca mai un utente pagante: in caso di dubbio aspetta fino a 3s
// ── Admin bypass: l'admin (in modalità normale) ha sempre tutti i permessi ──
window.isPremium = () => {
    if (typeof window.isAdmin === 'function' && window.isAdmin()) return true;
    return localStorage.getItem('cortex_user_plan') === 'student';
};

// Versione asincrona: aspetta il cloud sync prima di mostrare un gate
window.isPremiumSafe = () => new Promise((resolve) => {
    // Admin bypass immediato
    if (typeof window.isAdmin === 'function' && window.isAdmin()) {
        resolve(true);
        return;
    }
    if (window._cortexPlanVerified) {
        resolve(localStorage.getItem('cortex_user_plan') === 'student');
        return;
    }
    // Aspetta fino a 3 secondi che loadFromCloud() completi
    const deadline = Date.now() + 3000;
    const check = () => {
        if (typeof window.isAdmin === 'function' && window.isAdmin()) {
            resolve(true);
        } else if (window._cortexPlanVerified || Date.now() > deadline) {
            resolve(localStorage.getItem('cortex_user_plan') === 'student');
        } else {
            setTimeout(check, 100);
        }
    };
    check();
});

// 🚀 Sistema di Recupero Bozze (Prevenzione perdita dati)
setTimeout(() => {
    const textArea = document.getElementById('deck-text');
    if (textArea) {
        const savedDraft = localStorage.getItem(KEYS.DRAFT);
        if (savedDraft && savedDraft.trim().length > 0) {
            // FIX 10/07/2026: il confirm() nativo bloccava il main thread al boot
            // (e su alcuni mobile/PWA veniva soppresso). Ripristino silenzioso + toast.
            textArea.value = savedDraft;
            if (typeof updateCharCount === 'function') updateCharCount();
            if (window.showToast) window.showToast('📝 Bozza ripristinata dall\'ultima sessione.', 'info');
        }
        textArea.addEventListener('input', () => {
            localStorage.setItem(KEYS.DRAFT, textArea.value);
        });
    }
}, 1000);

window.addEventListener('load', () => {
    // --- AUTO-LOGIN BRIDGE FROM LANDING ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'login' && !window._fbLoggedIn) {
        // Nascondi subito l'overlay di registrazione per evitare schermi intermedi
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.add('hidden');

        // Pulizia URL per estetica
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Trigger login immediato
        setTimeout(() => {
            if (typeof loginWithGoogle === 'function') {
                loginWithGoogle();
            } else if (window.loginWithGoogle) {
                window.loginWithGoogle();
            }
        }, 100);
    }

    triggerOnboardingOverlay(); // overlay prima visita
    checkOnboarding();          // aggiorna stato UI home (prompt vs dashboard)
    checkImportParam();         // Intercetta ?sharedDeck=ID o ?import=ID
});

// MOUSE FOLLOW GLOW LOGIC (Solo Desktop)
const _isMobile = ('ontouchstart' in window)
    || (navigator.maxTouchPoints > 0);
if (!_isMobile) {
    let _mouseRaf = null;
    document.addEventListener('mousemove', (e) => {
        if (_mouseRaf) return; // throttle rAF
        _mouseRaf = requestAnimationFrame(() => {
            const cards = document.querySelectorAll('.card');
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
            });
            _mouseRaf = null;
        });
    }, { passive: true });
}

// -- SHARED DATA & STATE --
let currentDeckIndex = null;
// mediaRecorder, audioChunks, voiceChunks, voiceURLs moved to services/fileHandler.js or modules/audioRecording.js

// -- DATE UTILITIES --

// ===== NAV =====

// ===== SETTINGS & ACCESSIBILITY =====

function handleLogin() {
    const rawName = document.getElementById('auth-name-input').value.trim();
    if (!rawName) {
        showToast('Per favore, inserisci un nome per iniziare.', 'info');
        return;
    }

    let finalName = rawName;

    // Special flair for the Admin if they login as guest
    if (rawName.toUpperCase() === 'DIO') {
        finalName = "👑 " + rawName;
    }

    completeAuth(finalName);
}

// Check if user is on file:// protocol and show a helpful warning
window.addEventListener('load', () => {
    if (window.location.protocol === 'file:') {
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            const warning = document.createElement('div');
            warning.style.cssText = 'background:rgba(239, 68, 68, 0.1); border:1px solid #ef4444; color:#f87171; padding:12px; border-radius:12px; font-size:0.85rem; margin-bottom:16px; text-align:center;';
            warning.innerHTML = `⚠️ <b>Attenzione:</b> Stai aprendo il file direttamente. Il tasto Google e l'App non funzioneranno. Usa <b>start_app.py</b> per risolvere!`;
            overlay.querySelector('.auth-card').prepend(warning);
        }
    }
});

async function applySavedSettings() {
    // Carica campi Firebase nell'UI impostazioni
    const savedName   = localStorage.getItem('mm_user_name');
    const savedAvatar = localStorage.getItem('mm_user_avatar');
    const isLoggedIn  = localStorage.getItem('mm_is_logged_in') === 'true';
    if (isLoggedIn && savedName) {
        window._fbLoggedIn = true;
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.add('hidden');
    }
    // Carica Pomodoro salvato
    const savedPomo = localStorage.getItem('mm_pomo_durations');
    if (savedPomo) {
        try {
            const d = JSON.parse(savedPomo);
            pomoModes.work.mins  = d.work;
            pomoModes.short.mins = d.short;
            pomoModes.long.mins  = d.long;
            pomoState.seconds    = pomoModes[pomoState.mode].mins * 60;
        } catch (e) {}
    }
    if (typeof refreshDueCounts === 'function') refreshDueCounts();
    // Firebase init (asincrono)
    if (typeof initFirebase === 'function') await initFirebase();
    // Gestisce risultato redirect Google login (se l'utente era stato rediretto)
    handleRedirectResult().catch(() => {});
}

// La versione locale rimane come fallback per le parti non ancora migrate (Pomodoro etc.)
// Firebase init moved to end of boot sequence to ensure showPage registration
// applySavedSettings().catch(console.error);

// ===== MATERIAL / DECKS =====

// updateCharCount extracted to deckUtils.js

// Alias locale per retrocompatibilità con il codice sottostante che usa SecurityManager.
const SecurityManager = fbSecurityManager;

// 2. MOTORE DI SANITIZZAZIONE LOCALE

//            generateAIContent, generateSimpleFlashcards → modules/deckCreate.js

// fetchWithTimeout → js/utils.js (Phase 10)

//            buildDeckObject, saveDeck → modules/deckForm.js

// confirmDelete extracted to deckUtils.js

// ===== UTILS =====
// saveState extracted to deckUtils.js

// toastTimeout e showToast rimosse da qui.

// ===== STUDY PLAN =====

// ===== THEME TOGGLE =====

// Apply saved theme on load
applySavedTheme();
applySavedAccessibility();

// ── File upload badge persistente ─────────────────────────────────────────────
/**
 * Aggiunge un badge nome+spunta nella lista file caricati del form materiale.
 * @param {string} filename
 * @param {'success'|'error'} status
 */
window.addUploadedFileBadge = function(filename, status = 'success') {
    const list = document.getElementById('uploaded-files-list');
    if (!list) return;
    const badge = document.createElement('div');
    badge.style.cssText = `
        display:inline-flex; align-items:center; gap:6px;
        background:var(--surface2); border:1px solid var(--border);
        border-radius:20px; padding:4px 10px 4px 8px;
        font-size:0.78rem; font-weight:600; color:var(--text);
        max-width:240px; overflow:hidden;
    `;
    const icon = status === 'success' ? '✅' : '❌';
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px;';
    nameSpan.title = filename;
    nameSpan.textContent = `${icon} ${filename}`;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Rimuovi');
    closeBtn.style.cssText = 'background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:1rem; line-height:1; padding:0; flex-shrink:0;';
    closeBtn.onclick = () => badge.remove();
    badge.appendChild(nameSpan);
    badge.appendChild(closeBtn);
    list.appendChild(badge);
};

// Init — renderTechList ora viene da modules/techniques.js (Phase 12)
renderTechList();

// ===== AUTO-GENERATE in new deck form =====
// Find the text area and add a button when text is pasted

document.addEventListener('DOMContentLoaded', () => {
    const deckTextInput = document.getElementById('deck-text');
    if (deckTextInput) {
        deckTextInput.addEventListener('input', e => {
            const autoContainer = document.getElementById('auto-gen-container');
            if (!autoContainer && e.target.value.length > 50) {
                const container = document.createElement('div');
                container.id = 'auto-gen-container';
                container.style.marginTop = '12px';
                container.style.padding = '12px';
                container.style.background = 'rgba(124,106,247,0.05)';
                container.style.border = '1px solid rgba(124,106,247,0.2)';
                container.style.borderRadius = '12px';
                container.innerHTML = `
                            <div style="display:flex; gap:8px; margin-bottom:12px; align-items:center;">
                                <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">Tipo di carte da estrarre:</span>
                                <select id="auto-gen-type" style="padding:6px 12px; border-radius:8px; background:var(--surface); border:1px solid var(--border); color:var(--text); font-size:0.85rem; cursor:pointer;">
                                    <option value="standard">Standard (Domanda/Risposta)</option>
                                    <option value="tf">Vero / Falso</option>
                                    <option value="mc">Risposte Multiple</option>
                                </select>
                            </div>
                            <button id="auto-gen-btn" type="button" style="width:100%; padding:10px 16px;background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:10px;color:#fff;font-family:inherit;font-weight:700;font-size:0.9rem;cursor:pointer;display:block;">🤖 Auto-genera Flashcard dal testo</button>
                        `;
                e.target.parentElement.appendChild(container);

                document.getElementById('auto-gen-btn').onclick = async () => {
                    // FIX: autoGenerateFlashcards è async e aggiunge direttamente i pari — non ritorna array
                    await autoGenerateFlashcards();
                };
            }
        });
    }
});

// Notification prompt on first use
if (!localStorage.getItem('mm_notif_asked') && 'Notification' in window) {
    localStorage.setItem('mm_notif_asked', '1');
    const nb = document.createElement('div');
    nb.className = 'notif-banner';
    nb.innerHTML = `🔔 Attiva le notifiche per ricevere i tuoi promemoria di ripasso! <button data-fn="notifyAndDismiss">Attiva</button><button data-fn="dismissParent" style="background:rgba(255,255,255,0.08);margin-left:4px;">Non ora</button>`;
    document.body.appendChild(nb);
}

checkImportParam();

// -- GDPR & Privacy --
window.__gdprValidateAge = validateAgeConsent;
document.addEventListener('DOMContentLoaded', () => {
    initCookieBanner();
    injectAgeCheck();
});
registerGDPRGlobals(register);

// -- Application Handlers & Sync --
startSmartSync();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        syncPublicProfile();
        // Aggiorna XP settimanale nel leaderboard
        if (typeof gState !== 'undefined') {
            syncWeeklyXP(gState.xp, state.username).catch(() => {});
        }
    }
});

// -- Referral Code Capture: salva ?ref=CODE in localStorage al primo accesso ──
(function captureReferralCode() {
    try {
        const ref = new URLSearchParams(window.location.search).get('ref');
        if (ref && ref.length >= 6 && ref.length <= 20 && !localStorage.getItem('cortex_ref_tracked')) {
            localStorage.setItem('cortex_pending_ref', ref.slice(0, 20));
        }
    } catch (_) {}
})();

// ── Referral UI ───────────────────────────────────────────────────────────────
function _initReferralUI() {
    const uid = window._fbUserId;
    if (!uid) return;
    // Codice referral = prima 8 chars dello UID (stabile, univoco)
    const refCode = uid.slice(0, 8);
    const link = `https://cortexapp.it/?ref=${refCode}`;
    const input = document.getElementById('referral-link-input');
    if (input) input.value = link;

    // Carica statistiche referral da Firestore
    try {
        const db = typeof firebase !== 'undefined' && firebase.apps?.length
            ? firebase.app().firestore() : null;
        if (db) {
            db.collection('users').doc(uid).get().then(snap => {
                const d = snap.data() || {};
                const count = d.referralCount || 0;
                const daysEarned = d.referralDaysEarned || 0;
                const statsEl = document.getElementById('referral-stats');
                if (statsEl && count > 0) {
                    statsEl.textContent = `✅ ${count} amico/i invitato/i · ${daysEarned} giorni Student guadagnati`;
                }
            }).catch(() => {});
        }
    } catch (_) {}
}
// ── Obiettivo Studio — modificabile dalle Impostazioni ───────────────────────
window._saveStudyGoal = function(goal) {
    localStorage.setItem('cortex_user_goal', goal);
    // Aggiorna anche su Firestore se loggato
    try {
        const db = typeof firebase !== 'undefined' && firebase.apps?.length
            ? firebase.app().firestore() : null;
        if (db && window._fbUserId) {
            db.collection('users').doc(window._fbUserId).set(
                { studyGoal: goal },
                { merge: true }
            ).catch(() => {});
        }
    } catch (_) {}
    if (goal && typeof showToast !== 'undefined') showToast('Obiettivo aggiornato! 🎯', 'success');
};
// Popola il select con il valore salvato quando le impostazioni vengono aperte
document.addEventListener('settings-opened', () => {
    const sel = document.getElementById('settings-study-goal');
    if (sel) sel.value = localStorage.getItem('cortex_user_goal') || '';
});
setTimeout(() => {
    const sel = document.getElementById('settings-study-goal');
    if (sel) sel.value = localStorage.getItem('cortex_user_goal') || '';
}, 1500);

// ── Report Deck ──────────────────────────────────────────────────────────────
window._reportDeck = async function(deckId, deckName) {
    if (!window._fbUserId) { showToast('Devi essere loggato per segnalare.', 'error'); return; }
    const reason = window.prompt(`Perché vuoi segnalare il mazzo "${deckName}"?\n(es. contenuto inappropriato, spam, copyright)`, '');
    if (!reason || reason.trim().length < 5) return;
    try {
        const db = typeof firebase !== 'undefined' && firebase.apps?.length
            ? firebase.app().firestore() : null;
        if (!db) return;
        const reportId = `${deckId}_${window._fbUserId}`;
        // Controlla se già segnalato (compound ID impedisce duplicati via Firestore rules)
        const existing = await db.collection('deckReports').doc(reportId).get();
        if (existing.exists) {
            showToast('Hai già segnalato questo mazzo. Lo stiamo già esaminando. 🛡️', 'info');
            return;
        }
        await db.collection('deckReports').doc(reportId).set({
            deckId,
            deckName,
            reason: reason.trim().slice(0, 500),
            reporterId: window._fbUserId,
            createdAt: Date.now(),
        });
        showToast(t('main_report_thanks'), 'success');
    } catch (e) {
        if (e?.code === 'permission-denied') {
            showToast('Hai già segnalato questo mazzo.', 'info');
        } else {
            showToast(t('main_err_report'), 'error');
        }
    }
};

window._copyReferralLink = function() {
    const uid = window._fbUserId;
    if (!uid) return;
    const refCode = uid.slice(0, 8);
    const link = `https://cortexapp.it/?ref=${refCode}`;
    navigator.clipboard?.writeText(link).then(() => {
        if (typeof showToast !== 'undefined') showToast('Link copiato! 🎉');
    }).catch(() => {
        const input = document.getElementById('referral-link-input');
        if (input) { input.select(); document.execCommand('copy'); }
        if (typeof showToast !== 'undefined') showToast('Link copiato!');
    });
};
// Inizializza quando le impostazioni vengono aperte (l'UID è disponibile)
document.addEventListener('settings-opened', _initReferralUI);
// Fallback: inizializza dopo 2s se già loggato
setTimeout(() => { if (window._fbUserId) _initReferralUI(); }, 2000);

// ── Global Error Handler ─────────────────────────────────────────────────────
// Cattura promise rejection e errori JS non gestiti prima che silano silenziosamente.
window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    // Filtra errori noti non-critici (ResizeObserver, caricamento asincrono)
    if (msg && !msg.includes('ResizeObserver') && !msg.includes('Loading chunk') && !msg.includes('NetworkError')) {
        try { track('js_error', { type: 'unhandledrejection', message: msg.slice(0, 200) }); } catch(_) {}
        if (typeof showToast !== 'undefined') {
            showToast('⚠️ Qualcosa è andato storto. Ricarica se necessario.', 'error');
        }
    }
});
window.onerror = (msg, src, line, col, err) => {
    try { track('js_error', { type: 'onerror', message: String(msg).slice(0, 200), line: line || 0 }); } catch(_) {}
    return false;
};

// ── Espone loadFromCloud su window — necessario per riconnessione online ──────
// ui.js chiama window.loadFromCloud() quando la rete si ripristina.
window.loadFromCloud = loadFromCloud;

// -- Module Bootstrapping --
bootApp({
    state,
    saveState: typeof saveState !== 'undefined' ? saveState : null,
    showToast: typeof showToast !== 'undefined' ? showToast : null,
    awardXP: typeof awardXP !== 'undefined' ? awardXP : null,
    gState: typeof gState !== 'undefined' ? gState : null,
    saveGState: typeof saveGState !== 'undefined' ? saveGState : null,
    earnBadge: typeof earnBadge !== 'undefined' ? earnBadge : null,
    checkBadges: typeof checkBadges !== 'undefined' ? checkBadges : null,
    loadFeedbackMessages: typeof loadFeedbackMessages !== 'undefined' ? loadFeedbackMessages : null,
    KEYS: typeof KEYS !== 'undefined' ? KEYS : null,
    updateUIStrings: typeof updateUIStrings !== 'undefined' ? updateUIStrings : null,
    renderDecks: typeof renderDecks !== 'undefined' ? renderDecks : null,
    renderHome: typeof renderHome !== 'undefined' ? renderHome : null,
    discoverGeminiModel: typeof discoverGeminiModel !== 'undefined' ? discoverGeminiModel : null,
    getActiveContext: typeof getActiveContext !== 'undefined' ? getActiveContext : null,
    callGeminiWithSearch: typeof callGeminiWithSearch !== 'undefined' ? callGeminiWithSearch : null,
    getFirestoreDB: typeof getFirestoreDB !== 'undefined' ? getFirestoreDB : null,
    initFirebase: typeof initFirebase !== 'undefined' ? initFirebase : null,
    getLevel: typeof getLevel !== 'undefined' ? getLevel : null,
    updateCharCount: typeof updateCharCount !== 'undefined' ? updateCharCount : null,
    showView: typeof showView !== 'undefined' ? showView : null,
    getCurrentDeckIndex: () => currentDeckIndex,
    setCurrentDeckIndex: (i) => { currentDeckIndex = i; },
    addPair: typeof addPair !== 'undefined' ? addPair : null,
    refreshDueCounts: typeof refreshDueCounts === 'function' ? refreshDueCounts : null,
    startStudyById: typeof startStudyById !== 'undefined' ? startStudyById : null,
    speakAI: typeof speakAI !== 'undefined' ? speakAI : null,
    evaluateWithGemini: typeof evaluateWithGemini !== 'undefined' ? evaluateWithGemini : null,
    getLang: () => { return localStorage.getItem('mm_lang') || 'it'; },
    registerFirebaseGlobals,
    registerAIGlobals,
    registerSettingsGlobals,
    registerPdfAIGlobals,
    initTechniques,
    initFeedback,
    restoreAdminPreviewBadge,
    register,

    // ── Callback post-sessione di studio ─────────────────────────────────────
    onSessionEnd: ({ cardsStudied }) => {
        // Aggiorna dati widget
        try { updateWidgetData(); } catch (_) {}
        // Avanza progresso evento stagionale (se attivo)
        try {
            const activeEvent = getActiveEvent();
            if (activeEvent) updateEventProgress(activeEvent.id, cardsStudied);
        } catch (_) {}
        // Conferma referral dopo N sessioni
        try { checkAndConfirmReferral(localStorage.getItem('cortex_uid')).catch?.(() => {}); } catch (_) {}
        // Attiva prompt installazione intelligente PWA
        try { triggerSmartInstallPrompt(); } catch (_) {}
    },
});
console.log('[Boot] App bootstrapping complete.');

// ── Idratazione asincrona da IndexedDB ────────────────────────────────────────
// Il boot sincrono usa localStorage come cache di avvio veloce.
// Subito dopo, IDB (senza limiti di dimensione) sostituisce i dati in state
// e aggiorna la UI se c'erano dati più completi.
hydrateFromIDB().then((updated) => {
    if (updated) {
        if (typeof renderDecks === 'function') renderDecks();
        if (typeof renderHome  === 'function') renderHome();
        if (typeof refreshDueCounts === 'function') refreshDueCounts();
        console.log('[Boot] Stato idratato da IndexedDB.');
    }
}).catch(() => {});

// ── Deep-link Simulazione TOLC: ?sim=tolc apre DRITTO il simulatore (come ospite)
// Usato dalla pagina /simulazione-tolc: l'utente clicca e sta già simulando, niente muro.
(function handleDeepSimTolc() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sim') !== 'tolc') return;
    try { localStorage.setItem('cortex_guest', '1'); } catch (e) {}
    window.history.replaceState({}, '', '/app');
    let tries = 0;
    const iv = setInterval(() => {
        tries++;
        if (typeof window.openTolcSim === 'function') {
            clearInterval(iv);
            try { window.openTolcSim(); } catch (e) {}
        } else if (tries > 40) {
            clearInterval(iv);
        }
    }, 150);
})();

// ── PWA Shortcuts handler: gestisce ?action= dall'icona app ──────────────────
(function handlePWAShortcuts() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;

    // Pulisce l'URL senza ricaricare la pagina
    window.history.replaceState({}, '', '/app.html');

    setTimeout(() => {
        switch (action) {
            case 'study':
                if (typeof showPage === 'function') showPage('materiale');
                break;
            case 'create':
                if (typeof showView === 'function') showView('CreateDeckView');
                break;
            case 'duels':
                if (typeof openNeuralDuels === 'function') openNeuralDuels();
                break;
        }
    }, 800); // Aspetta che l'app si inizializzi
})();

// Neural Podcast init
initPodcast({ state, awardXP, showToast });
registerPodcastGlobals(register);

initNavigation({
    renderHome:      typeof renderHome      !== 'undefined' ? renderHome      : null,
    renderDecks:     typeof renderDecks     !== 'undefined' ? renderDecks     : null,
    getTechPageHTML: typeof getTechPageHTML !== 'undefined' ? getTechPageHTML : null,
    renderTechList:  typeof renderTechList  !== 'undefined' ? renderTechList  : null,
    loadAudioList:   typeof loadAudioList   !== 'undefined' ? loadAudioList   : null,
    KEYS:            typeof KEYS            !== 'undefined' ? KEYS            : null,
    gState:          typeof gState          !== 'undefined' ? gState          : null,
});

initOnboarding({
    state:           state,
    SecurityManager: fbSecurityManager,
    showToast:       showToast,
});

initPWA();

// Inizializzazione Firebase al boot — necessario perché loginWithGoogle usa signInWithPopup
// che deve essere chiamato in modo SINCRONO dal gesto utente.
// Se initFirebase viene fatto dentro loginWithGoogle (lazy) il browser blocca il popup.
initFirebase().catch(() => {});

// ── Init moduli che non richiedono login (sicuri da chiamare subito) ──────────
initWidget();
checkAndShowChallengeOnLaunch();

// ── Espone renderProfilePage su window per chiamate dinamiche dall'UI ─────────
window.renderProfilePage = renderProfilePage;

// ── Post-login: init moduli che richiedono UID Firebase ───────────────────────
async function _runPostLoginInits() {
    try { await initSocialProfile(); } catch (e) { console.warn('[Boot] socialProfile:', e); }
    try { await initNotifications(); } catch (e) { console.warn('[Boot] notifications:', e); }
    try { initSeasonalEvents(); }      catch (e) { console.warn('[Boot] seasonalEvents:', e); }
    try { checkAndSendWeeklyReport().catch(() => {}); } catch (_) {}
}

// Ascolto login (nuovo login nella sessione)
window.addEventListener('cortex:login', () => {
    _runPostLoginInits();
});

// Se è già loggato (sessione persistente), esegui subito
if (localStorage.getItem('cortex_uid')) {
    _runPostLoginInits();
}

// initUI is called at the top during system initialization.

// --- REGISTRY EXPORTS ---
// Mapping functions to data-fn attributes for HTML interaction.

// -- Navigation --
register('showPage',  showPage);
register('showView',  showView);
register('triggerQuickSnap', () => document.getElementById('quick-snap-input')?.click());
register('navigate', (p) => { if (window.__cortexNav) window.__cortexNav(p); });

// -- Study & Review --
register('startStudy', startStudy);
register('startStudyById', startStudyById);
register('closeStudy', closeStudy);
register('flipCard',   flipCard);
register('rateCard',   rateCard);

// -- Exam Modes --
register('startExam',      startExam);
register('startOral',      startOral);
register('closeOralExam',  closeOralExam);
register('nextOralQuestion', nextOralQuestion);
register('openProfSelector', openProfSelector);
register('closeProfSelector', closeProfSelector);
register('selectProfDeck', selectProfDeck);
register('renderProfStep1', renderProfStep1);
register('confirmProfMode', confirmProfMode);
register('startBossMode',  startBossMode);
register('closeBossMode',    closeBossMode);
register('toggleBossMic',    toggleBossMic);
register('nextBossQuestion', nextBossQuestion);
register('startQuiz',      startQuiz);
register('submitExamAnswer', submitExamAnswer);

// -- Deck Management --
register('saveDeck',             saveDeck);
register('editDeck',             editDeck);
register('openAddMaterial',      openAddMaterial);
register('confirmDelete',        confirmDelete);
register('addPair',              addPair);
register('removePair',           removePair);
register('importCSVFlashcards',  importCSVFlashcards);
register('toggleFlashcards',     toggleFlashcards);
register('applyTemplate',        applyTemplate);
register('autoGenerateFlashcards', autoGenerateFlashcards);

// -- Study Planning --
register('showStudyPlan',        showStudyPlan);
register('saveAndGeneratePlan',  saveAndGeneratePlan);
register('regeneratePlanWithAI', regeneratePlanWithAI);
register('generatePersonalizedTutorPlan', generatePersonalizedTutorPlan);
register('generateAuraPlan',      generateAuraPlan);

// -- PDF & Document Tools --
register('openPdfChunking',      openPdfChunking);
register('addAllChunksToDeck',   () => addAllChunksToDeck(addPair));
register('runAutoChunk',         runAutoChunk);
register('handlePdfFile',        handlePdfFile);
register('toggleVoiceRecording', (idx) => toggleVoiceRecording(idx, { saveState }));
register('handleImageUpload',    handleImageUpload);
// -- PDF → AI Flashcards --
register('openPdfAIFromText',    () => openPdfAIFromText(document.getElementById('deck-text')?.value || '', document.getElementById('deck-name')?.value || ''));
register('openPdfAIFromFile',    openPdfAIFromFile);
register('savePdfAIDeck',        savePdfAIDeck);
register('closePdfAI',           closePdfAI);
register('triggerPdfAIUpload',   () => document.getElementById('pdf-ai-input')?.click());

// -- UI & Settings --
register('showToast',         showToast);
register('showPaywall',       showPaywall);
register('openSettings',      openSettings);
register('closeSettings',     closeSettings);
register('saveAllSettings',   saveAllSettings);

// -- Multiplayer --
initDuels({ state, showToast, awardXP });
registerDuelsGlobals(register);

register('toggleTheme',       toggleTheme);
register('toggleLangMenu',    toggleLangMenu);
register('changeLanguage',    changeLanguage);
register('removeExamAttachment', removeExamAttachment);

// -- Multimedia & Tools --
register('openPomodoro',           openPomodoro);
register('closePomodoro',          closePomodoro);
register('pomodoroToggle',         pomodoroToggle);
register('pomodoroReset',          pomodoroReset);
register('setPomoMode',            setPomoMode);
register('setSoundscape',          setSoundscape);
register('applyYouTubeLink',       applyYouTubeLink);
register('startAudioRecording',    startAudioRecording);
register('stopAudioRecording',     stopAudioRecording);
register('deleteRecording',        deleteRecording);
register('downloadRecording',      downloadRecording);
register('shareRecording',         shareRecording);
register('toggleSpeechRecognition', toggleSpeechRecognition);
register('setOralInputMode',        setOralInputMode);
register('sendChatMessage',         sendChatMessage);
// openPhysicsMap rimosso
register('openLoci',               openLoci);
register('closeLoci',              closeLoci);
register('toggleLociMode',         toggleLociMode);
register('clearLociPins',          clearLociPins);
register('simulateAIVision',       simulateAIVision);
register('togglePAOTable',         togglePAOTable);
register('openMindMap',            openMindMap);
register('closeMindMap',           closeMindMap);
register('updateCharCount',        updateCharCount);
register('saveState',              saveState);
window.saveState = saveState; // esposto: vari moduli lo chiamavano senza che esistesse
register('startSmartSync',         startSmartSync);

// -- Social Profile --
register('renderProfilePage', (uid) => renderProfilePage(uid));
register('showMyProfile', () => renderProfilePage());

// -- Community & Social --
register('showCommunity', function() {
    showPage('community');
    renderNetworkAndStats();
    loadCommunityDecks();
    loadLeaderboard();
});
register('sortCommunity',     sortCommunity);
register('switchMainCommunityTab', switchMainCommunityTab);
register('switchCommunityTab', switchCommunityTab);
register('shareDeck',         shareDeck);
register('importSharedDeck',  importSharedDeck);
register('reportDeck',        reportDeck);
register('promptImportDeck',  promptImportDeck); // FIX: bottone Importa nei mazzi
register('syncAndShowLeaderboard', syncAndShowLeaderboard);

// -- Gamification & Streak --
register('shareStreakMilestone',   shareStreakMilestone);
register('addStreakFreezes',       addStreakFreezes);
register('getStreakStatus',        getStreakStatus);

// -- Auth & System --
register('loginWithGoogle',        loginWithGoogle);
register('logout',                 logout);
register('handleLogin',            handleLogin);
register('submitFeedback',         submitFeedback);
register('deleteFeedback',         deleteFeedback);
register('pinFeedback',            pinFeedback);
register('replyFeedback',          replyFeedback);
register('testFirebaseConnection', testFirebaseConnection);
register('hardRefresh',            () => { localStorage.clear(); location.reload(true); });

// -- Onboarding & Architect --
register('openArchitect',    openArchitect);
register('openQuickMode',    openQuickMode);
register('openTolcSim',      openTolcSim);
register('closeArchitect',   closeArchitect);
register('saveArchAnswer',       saveArchAnswer);
register('saveArchAnswerText',   saveArchAnswerText);
window.saveArchAnswerText = saveArchAnswerText; // usato inline nel DOM
register('goObSlide',              goObSlide);
register('setObGoal',              setObGoal);
register('closeOnboarding',        closeOnboarding);
register('saveAcquisitionSource',  saveAcquisitionSource);
// Salva la chiave API dall'onboarding tutorial (slide 1 → ob-api-input)
register('saveOnboardingApiKey', function() {
    const input = document.getElementById('ob-api-input');
    const btn   = document.getElementById('ob-validate-api-btn');
    if (!input || !btn) return;
    const val = input.value.trim();

    if (!val || !val.startsWith('AIza')) {
        if (window.showToast) window.showToast('Chiave non valida — deve iniziare con AIza.', 'error');
        return;
    }

    // Belt-and-suspenders: salva SEMPRE in entrambi gli storage direttamente,
    // prima di passare per SecurityManager (evita qualsiasi race condition)
    try { sessionStorage.setItem('cortex_gemini_key', val); } catch(e) {}
    try { localStorage.setItem('cortex_gemini_key', val); } catch(e) {}
    try { localStorage.setItem('mm_transcription_mode', 'gemini'); } catch(e) {}
    // SecurityManager in aggiunta (cache interna + compatibilità)
    const sm = window.SecurityManager || fbSecurityManager;
    if (sm?.setApiKey) sm.setApiKey(val);

    btn.textContent = t('main_ai_activated');
    if (window.showToast) window.showToast('🧠 Chiave API salvata! Motore IA attivo.', 'success');
    if (window.renderNetworkAndStats) window.renderNetworkAndStats();
    if (window.renderStats) window.renderStats();
    setTimeout(() => goObSlide(2), 800);
});
register('installPWA',       installPWA);
register('dismissInstall',   dismissInstall);
register('closeInstallModal', closeInstallModal);
register('triggerSmartInstallPrompt', triggerSmartInstallPrompt);

// -- Helpers --
register('clickFileInput', () => document.getElementById('file-input')?.click());
register('triggerImportFile', () => document.getElementById('import-file')?.click());
register('notifyAndDismiss', (el) => {
    if (typeof requestNotifications === 'function') requestNotifications();
    if (el?.parentElement) el.parentElement.remove();
});
register('dismissParent', (el) => {
    if (el?.parentElement) el.parentElement.remove();
});
register('revealImage', (el) => { el.style.filter = 'none'; });

register('showAudio', function() {
    showPage('audio');
    loadAudioList();
});
register('showCommunityStats', function() {
    switchCommunityTab('stats');
    renderNetworkAndStats();
});
register('generateRandomProfile', function() {
    generateRandomProfile();
});
// Admin: attiva/disattiva modalità moderazione feedback
register('adminToggleFeedback', function() {
    const existing = document.getElementById('admin-feedback-bar');
    if (existing) {
        existing.remove();
        window._cortexFeedbackAdminMode = false;
        if (window.loadFeedbackMessages) window.loadFeedbackMessages();
        if (window.showToast) window.showToast(t('main_admin_off'), 'info');
        return;
    }
    window._cortexFeedbackAdminMode = true;
    if (window.loadFeedbackMessages) window.loadFeedbackMessages();

    const bar = document.createElement('div');
    bar.id = 'admin-feedback-bar';
    bar.style.cssText = `
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
        background:rgba(20,10,10,0.95); border:1px solid rgba(255,68,68,0.4);
        border-radius:14px; padding:14px 20px; z-index:99999;
        display:flex; gap:10px; align-items:center; backdrop-filter:blur(20px);
        box-shadow:0 8px 32px rgba(255,68,68,0.2);
    `;
    bar.innerHTML = `
        <span style="color:#ff6b6b; font-size:0.82rem; font-weight:700;">👑 Admin Feedback</span>
        <button onclick="window.loadFeedbackMessages && window.loadFeedbackMessages()"
            style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 12px;color:#fff;font-size:0.78rem;cursor:pointer;">
            🔄 Ricarica
        </button>
        <button onclick="window._cortexFeedbackAdminMode = false; this.closest('#admin-feedback-bar').remove(); if(window.loadFeedbackMessages) window.loadFeedbackMessages();"
            style="background:rgba(255,68,68,0.1);border:1px solid rgba(255,68,68,0.2);border-radius:8px;padding:6px 12px;color:#ff6b6b;font-size:0.78rem;cursor:pointer;">
            ✕ Chiudi
        </button>
    `;
    document.body.appendChild(bar);
    if (window.showToast) window.showToast(t('main_admin_on'), 'success');
});
register('resetSystemForTesting', function() {
    resetSystemForTesting();
});
register('quickGenerateDeck', function() {
    quickGenerateDeck();
});
register('syncAndShowLeaderboard', syncAndShowLeaderboard);
register('openApiKeyPage', function() {
    window.open('https://aistudio.google.com/app/apikey');
});
register('appSyncExportData', function() {
    appSync.exportData();
});
register('triggerImportFile', function() {
    document.getElementById('import-file').click();
});
register('closePdfChunkingOverlay', function() {
    document.getElementById('pdf-chunking-overlay').style.display = 'none';
});
register('closeMindmapOverlay', function() {
    document.getElementById('mindmap-overlay').style.display = 'none';
    // closePhysicsGraph rimosso — physicsMap.js eliminato dalla codebase
    closeMindMap();
});
register('toggleGuideBody', function(el) {
    const body = el.querySelector('.guide-body');
    if (!body) return;
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
});
register('revealImage', function(el) {
    el.style.filter = 'none';
});
register('hardRefresh', function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(regs) {
            for (let r of regs) r.unregister();
        });
    }
    if ('caches' in window) {
        caches.keys().then(function(names) {
            for (let n of names) caches.delete(n);
        });
    }
    localStorage.clear();
    sessionStorage.clear();
    location.reload(true);
});

// Fix 6: notifica aggiornamento SW — quando un nuovo Service Worker prende controllo
// (skipWaiting() è già in sw.js) mostra un toast con invito a ricaricare.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // C'è un aggiornamento installato: il vecchio SW controlla ancora questa pagina
                    showToast(t('main_update_available'), 'info');
                }
            });
        });
    }).catch(() => {});

    // Se il controller cambia durante la sessione (nuovo SW attivato da skipWaiting)
    // ricarica silenziosamente solo se la pagina è in background
    let _swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (_swRefreshing) return;
        _swRefreshing = true;
        // Ricarica solo se l'utente non sta interagendo attivamente
        if (document.visibilityState === 'hidden') {
            window.location.reload();
        }
    });
}

// =============================================================================
// ===== WINDOW EXPORTS (ridotto — Phase 9) =====================================
// Solo le funzioni richiamate da:
//   • HTML dinamico generato via innerHTML (onclick="fn()" nelle template literal)
//   • Attributi onchange/altri eventi non gestiti dall'event bus
//   • Chiamate dirette da script esterni o dall'error handler di index.js
// =============================================================================

Object.assign(window, {
    // ── Phase 15: rimossi tutti i duplicati già presenti nel registry ──────────
    // Phase 13/14: renderDecks + renderHome rimosse (view usano import diretto)
    // Le seguenti funzioni sono SOLO qui perché non gestibili dall'event bus click:

    // oninput / oninput-with-arg / onchange in HTML statico
    generatePAO,            // oninput="generatePAO()"         (#pao-input)
    updateCharCount,        // oninput="updateCharCount()"     (#deck-text) — fix Phase 15
    loadCommunityDecks,     // oninput="loadCommunityDecks(v)" (#community-search)
    toggleZenMode,          // onchange — checkbox settings
    toggleReadability,      // onchange — checkbox settings
    updateAISettings:       typeof updateAISettings !== 'undefined' ? updateAISettings : undefined,
    saveTimerSettings,      // onchange — timer inputs
    updateVoicePreference,  // onchange — voice select
    applyTemplate,          // onchange — deck-template select
    handleExamAttachments,  // onchange — file input (#exam-attachments)
    loadLociImage,          // onchange — file input (#loci-img)

    // Chiamate da altri moduli via window.* (non data-fn)
    earnBadge,              // window.earnBadge() da modules/pao.js

    // Non ancora nel registry — rimangono su window in attesa di fase futura
    closeQuiz, answerQuiz,
    calNav,
    triggerOnboardingOverlay,
    checkApiKeyOnboarding,
    closeArchitect, saveArchAnswer,
    syncPublicProfile,
    loadLeaderboard, loadAudioList,
    renderTechList: typeof renderTechList !== 'undefined' ? renderTechList : undefined,
    renderStats,
    startChallengeMode: typeof startChallengeMode !== 'undefined' ? startChallengeMode : undefined,

    // Oggetti con metodi chiamati da onchange
    appSync,

    
    // (inline event handlers girano nel contesto window, fuori dallo scope del modulo)
    handlePdfDrop,
    handlePdfFile,
    handleImageFile,
    handleAudioFile,
    changeLanguage,
    toggleLangMenu,
});

register('changeLanguage', changeLanguage);
register('toggleLangMenu', toggleLangMenu);

// Toast globale — usato anche dall'error handler di index.js
window.showToast = showToast;

// Chiamato da CreateDeckView._resetForm() per evitare cross-scope access.
window.resetCurrentDeckIndex = () => { currentDeckIndex = null; };
// showPage globale — usato dall'AppRouter (index.js) per delegare le rotte legacy

// ── Gestione ritorno da Stripe (upgrade / sparks) ───────────────────────────
(function handleStripeReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('upgrade')) {
        const status = params.get('upgrade');
        const msg = status === 'success'
            ? '🎉 Abbonamento attivato! Aggiorna la pagina per vedere il tuo nuovo piano.'
            : 'Pagamento annullato.';
        const type = status === 'success' ? 'success' : 'info';
        document.addEventListener('DOMContentLoaded', () => {
            if (window.showToast) window.showToast(msg, type);
        }, { once: true });
        history.replaceState({}, '', '/'); // Rimuovi ?upgrade= dall'URL
    }
    if (params.has('sparks')) {
        const status = params.get('sparks');
        const msg = status === 'success'
            ? '⚡ Neural Sparks acquistati! Ricarica la pagina per aggiornare il tuo saldo.'
            : 'Acquisto Sparks annullato.';
        const type = status === 'success' ? 'success' : 'info';
        document.addEventListener('DOMContentLoaded', () => {
            if (window.showToast) window.showToast(msg, type);
        }, { once: true });
        history.replaceState({}, '', '/');
    }
})();

// renderStats globale — usato da architect.js con typeof check
window.renderStats = renderStats;
// renderNetworkAndStats globale — usato da community.js (switchCommunityTab stats)
window.renderNetworkAndStats = renderNetworkAndStats;
// renderDecks e renderHome globali — usati da firebase.js (cloud sync), pdfToFlashcards,
// home.js (goal selector), i18n.js — necessari per aggiornare la UI dopo operazioni async
window.renderDecks = renderDecks;
window.renderHome  = renderHome;
// getProfMode* globali — usati da home.js per mostrare la modalità prof attiva
window.getProfModeShort    = getProfModeShort;
window.getProfModeLabel    = getProfModeLabel;
window.getProfModeCssClass = getProfModeCssClass;

// 🧠 Salva la chiave API dall'api-onboarding-modal (data-fn="saveApiKeyModal")
// Registrato nel registry per massima affidabilità (non dipende da DOMContentLoaded timing)
register('saveApiKeyModal', function() {
    const input  = document.getElementById('onboarding-api-input');
    const saveBtn = document.getElementById('save-onboarding-api-btn');
    if (!input) return;

    const keyVal = input.value.trim();

    if (keyVal.length < 30 || !keyVal.startsWith('AIza')) {
        if (window.showToast) window.showToast("⚠️ Chiave non valida: deve iniziare con 'AIza' ed essere di almeno 30 caratteri.", 'error');
        return;
    }

    // Belt-and-suspenders: salva SEMPRE in entrambi gli storage direttamente
    try { sessionStorage.setItem('cortex_gemini_key', keyVal); } catch(e) {}
    try { localStorage.setItem('cortex_gemini_key', keyVal); } catch(e) {}
    // E via SecurityManager se disponibile (per compatibilità futura)
    if (window.SecurityManager?.setApiKey) window.SecurityManager.setApiKey(keyVal);

    if (window.showToast) window.showToast('🧠 Chiave API salvata! Motore IA attivo.', 'success');
    if (saveBtn) saveBtn.innerText = t('main_ai_activated');

    // Refresh stats se visibili
    if (window.renderNetworkAndStats) window.renderNetworkAndStats();
    if (window.renderStats) window.renderStats();

    setTimeout(() => {
        const modal = document.getElementById('api-onboarding-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }, 1000);
});

// Fallback DOMContentLoaded per retrocompatibilità (onclick diretto)
document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('save-onboarding-api-btn');
    if (!saveBtn) return;
    // Aggiungi data-fn se non già presente, così l'eventBus gestisce il click
    if (!saveBtn.dataset.fn) {
        saveBtn.dataset.fn = 'saveApiKey';
    }
});
