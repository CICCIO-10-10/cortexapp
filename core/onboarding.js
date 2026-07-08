/**
 * core/onboarding.js — Phase 21 Refactoring
 *
 * Contiene tutta la logica di onboarding estratta da main.js:
 *  - goObSlide()              — navigazione slide overlay onboarding
 *  - setObGoal()              — salva l'obiettivo dell'utente
 *  - checkApiKeyOnboarding()  — mostra modal API key se mancante
 *  - closeOnboarding()        — marca onboarding come completato
 *  - triggerOnboardingOverlay()— mostra l'overlay alla prima visita
 *  - checkOnboarding()        — aggiorna UI home (prompt vs dashboard)
 *
 * Dipendenze iniettate via initOnboarding(deps).
 */

import { track, setUserProperty } from './analytics.js';

let _deps = {
    state:              null,
    SecurityManager:    null,
    showToast:          null,
};

let obCurrentSlide = 0;

// Goal → messaggio personalizzato in slide 3
const GOAL_MESSAGES = {
    maturita:   'Pronto per l\'esame di fine scuola superiore? Crea il primo mazzo e inizia subito. 📝',
    university: 'Studia meno, ricorda di più. Crea il tuo primo mazzo universitario. 🎓',
    medicina:   'Anatomia, Biochimica, Fisiologia — l\'AI le impara con te. 🩺',
    exam:       'Hai un esame in arrivo? Crea il mazzo e il piano di studio in 2 minuti. 📚',
    language:   'Vocaboli, frasi, grammatica. L\'AI genera le carte, tu le impari. 🗣️',
    competence: 'Impara qualsiasi skill tecnica con flashcard generate dall\'AI. 🛠️',
};

// Goal → nome mazzo suggerito pre-compilato nel form di creazione
const GOAL_DECK_TEMPLATES = {
    maturita:   'Scuola Superiore — Letteratura Italiana',
    university: 'Università — Materia Principale',
    medicina:   'Anatomia Umana',
    exam:       'Esame — Concetti Chiave',
    language:   'Inglese — Vocabolario B2',
    competence: 'Programmazione — Concetti Core',
};

/**
 * Inizializza il modulo con le dipendenze.
 * Chiamato da main.js dopo che tutti i moduli sono pronti.
 */
export function initOnboarding(deps = {}) {
    Object.assign(_deps, deps);
}

// ── SLIDE NAVIGATION ─────────────────────────────────────────────────────────

export function goObSlide(idx) {
    const totalSlides = 5;
    if (idx < 0 || idx >= totalSlides) return;

    const currentEl = document.getElementById('ob-slide-' + obCurrentSlide);
    const nextEl    = document.getElementById('ob-slide-' + idx);

    if (currentEl) currentEl.style.display = 'none';
    if (nextEl)    nextEl.style.display    = 'block';

    document.querySelectorAll('.ob-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    obCurrentSlide = idx;

    // Side effects per slide specifica
    // Nota: il bottone ob-validate-api-btn ora ha data-fn="saveOnboardingApiKey"
    // (registrato in main.js) — nessun onclick inline necessario qui.
}

// ── GOAL SELECTION ────────────────────────────────────────────────────────────

export function setObGoal(goal) {
    localStorage.setItem('cortex_user_goal', goal);
    setUserProperty('study_goal', goal);
    track('onboarding_goal_selected', { goal });

    // Personalizza il sottotitolo della slide 3 in base all'obiettivo
    const sub = document.getElementById('ob-ready-sub');
    if (sub && GOAL_MESSAGES[goal]) {
        sub.textContent = GOAL_MESSAGES[goal];
    }

    goObSlide(3);
}

// ── API KEY ONBOARDING ────────────────────────────────────────────────────────

export function checkApiKeyOnboarding() {
    const sm = _deps.SecurityManager || window.SecurityManager;
    if (!sm) return;
    const apiKey = sm.getApiKey();
    if (!apiKey) {
        const onboardingModal = document.getElementById('api-onboarding-modal');
        if (onboardingModal) {
            onboardingModal.classList.remove('hidden');
            onboardingModal.classList.add('flex');
        }
    }
}

// ── CLOSE / COMPLETE ONBOARDING ───────────────────────────────────────────────

export function closeOnboarding() {
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.style.display = 'none';
    localStorage.setItem('cortex_onboarded', '1');
    track('onboarding_complete', { goal: localStorage.getItem('cortex_user_goal') || 'skipped' });

    const goal = localStorage.getItem('cortex_user_goal');
    if (goal === 'exam') {
        const toast = _deps.showToast || window.showToast;
        if (toast) toast('Focus: Preparazione Esami attiva. 🎓', 'info');
    }

    // Se non ci sono mazzi, apriamo subito il form di creazione
    const state = _deps.state;
    if (!state || !state.decks || state.decks.length === 0) {
        if (window.showPage) window.showPage('materiale');
        if (window.showView) window.showView('create-deck');

        // Pre-compila il nome mazzo in base all'obiettivo selezionato
        const goalTemplate = GOAL_DECK_TEMPLATES[goal];
        if (goalTemplate) {
            setTimeout(() => {
                const nameInput = document.getElementById('deck-name-input')
                               || document.getElementById('new-deck-name')
                               || document.querySelector('[data-field="deckName"]');
                if (nameInput && !nameInput.value) {
                    nameInput.value = goalTemplate;
                    nameInput.dispatchEvent(new Event('input'));
                    nameInput.focus();
                }
            }, 400);
        }
    }
}

// ── TRIGGER OVERLAY (prima visita) ───────────────────────────────────────────

export function triggerOnboardingOverlay() {
    if (localStorage.getItem('cortex_onboarded') === '1') return;

    // Rileva traffico da Instagram
    const urlParams = new URLSearchParams(window.location.search);
    const isInstagram = urlParams.get('utm_source') === 'instagram' || urlParams.get('ref') === 'ig' || document.referrer.includes('instagram.com');

    if (isInstagram) {
        // Pre-imposta sorgente e obiettivo in locale
        localStorage.setItem('cortex_acquisition_source', 'instagram');
        localStorage.setItem('cortex_user_goal', 'university');

        // Sincronizza su Firestore se l'utente è già loggato
        try {
            const uid = window._fbUserId;
            if (uid && window.firebase?.apps?.length) {
                window.firebase.app().firestore()
                    .collection('users').doc(uid)
                    .set({ 
                        acquisitionSource: 'instagram', 
                        acquisitionTs: Date.now(),
                        studyGoal: 'university'
                    }, { merge: true })
                    .catch(() => {});
            }
        } catch (_) {}

        // Personalizza Slide 0 e taglia le tappe intermedie
        setTimeout(() => {
            const titleEl = document.querySelector('#ob-slide-0 h2');
            const subEl = document.querySelector('#ob-slide-0 p');
            const ctaBtn = document.querySelector('#ob-slide-0 button.btn-primary');
            
            if (titleEl) {
                titleEl.innerHTML = t('onboarding_ig_title');
            }
            if (subEl) {
                subEl.innerHTML = t('onboarding_ig_subtitle');
            }
            if (ctaBtn) {
                // Va direttamente alla Slide 4 (saltando la selezione di Goal e Source)
                ctaBtn.dataset.params = '[4]';
                ctaBtn.textContent = t('onboarding_ig_cta');
            }
            
            // Imposta sottotitolo di riepilogo nella slide di pronto
            const readySub = document.getElementById('ob-ready-sub');
            if (readySub) {
                readySub.textContent = GOAL_MESSAGES['university'];
            }
        }, 100);
    }

    track('onboarding_start', { is_instagram: isInstagram });

    setTimeout(() => {
        const authOverlay = document.getElementById('auth-overlay');
        const onboarding  = document.getElementById('onboarding-overlay');
        if (!authOverlay || authOverlay.classList.contains('hidden') || authOverlay.style.display === 'none') {
            if (onboarding) onboarding.style.display = 'flex';
        }
    }, 1200);
}

// ── ACQUISITION SOURCE ────────────────────────────────────────────────────────

/**
 * Salva la sorgente di acquisizione selezionata dall'utente.
 * Chiamato via data-fn="saveAcquisitionSource" data-self="true" sui .ob-source-btn.
 * @param {HTMLElement} el — il bottone cliccato (iniettato da data-self)
 */
export function saveAcquisitionSource(el) {
    const source = el?.dataset?.source;
    if (!source) return;

    // Persisti in localStorage
    localStorage.setItem('cortex_acquisition_source', source);

    // Evidenzia il bottone selezionato
    document.querySelectorAll('.ob-source-btn').forEach(btn => {
        const selected = btn.dataset.source === source;
        btn.style.borderColor  = selected ? 'var(--accent, #7c3aed)' : 'rgba(255,255,255,0.1)';
        btn.style.background   = selected ? 'rgba(124,58,237,0.15)'  : 'rgba(255,255,255,0.03)';
        btn.style.transform    = selected ? 'scale(1.02)'             : 'scale(1)';
    });

    // Salva su Firestore se l'utente è già autenticato
    try {
        const uid = window._fbUserId;
        if (uid && window.firebase?.apps?.length) {
            window.firebase.app().firestore()
                .collection('users').doc(uid)
                .update({ acquisitionSource: source, acquisitionTs: Date.now() })
                .catch(() => {});
        }
    } catch (_) {}

    track('onboarding_acquisition_source', { source });
}

// ── CHECK ONBOARDING STATE (home UI) ─────────────────────────────────────────

export function checkOnboarding() {
    const promptEl = document.getElementById('onboarding-prompt');
    const dashEl   = document.getElementById('home-dashboard');
    if (!promptEl || !dashEl) return;

    const state = _deps.state;
    if (!state || !state.decks || state.decks.length === 0) {
        promptEl.style.display = 'block';
        dashEl.style.display   = 'none';
    } else {
        promptEl.style.display = 'none';
        dashEl.style.display   = '';
    }
}
