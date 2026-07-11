/**
 * modules/oralExam.js — Phase 23 (+ Modalità Cattiva, test locale)
 *
 * MEGA FEATURE 2: Simulatore di Esame Orale con riconoscimento vocale.
 * Estratto da main.js (MEGA FEATURE 2: ORAL EXAM SIMULATOR block).
 *
 * Dipendenze iniettate via init():
 *   state               — app state (decks)
 *   showToast           — notifiche UI
 *   speakAI             — text-to-speech
 *   evaluateWithGemini  — valutazione semantica AI
 *   getLang             — getter per gLang (lingua corrente)
 *
 * Import diretti:
 *   awardXP, earnBadge  ← modules/gamification.js
 *
 * NOTE — Modalità Prof (in test, solo locale):
 *   Variante "hard" del Feynman orale, a 3 livelli ciclabili:
 *     1. Censurato — comportamento normale (nessuna contestazione)
 *     2. Cattivo   — l'AI contesta le risposte incomplete a voce
 *                    ("Ti sembra una risposta adeguata?") e ridà il
 *                    microfono allo studente, max 3 tentativi/domanda
 *     3. Pazzo     — versione teatrale/no-holds-barred, max 4 tentativi,
 *                    valutazione più severa. Gated premium (solo abbonati).
 *   Stato persistito in localStorage ('mm_oral_prof_mode') solo per
 *   comodità di test, nessun impatto su backend/deploy.
 */
import { TRANSLATIONS } from '../data/translations.js';
import { awardXP, earnBadge } from './gamification.js';
const _t = () => (TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it);

// ── Modalità Prof — config a 3 livelli ─────────────────────────────────────────
const PROF_MODE_KEY = 'mm_oral_prof_mode';
const PROF_ORDER     = ['censurato', 'cattivo', 'pazzo'];

const PROF_MODES = {
    censurato: {
        label: '🎓 Prof: Normale', short: 'Normale',
        maxAttempts: 1, severity: 50,
        pushback: [],
    },
    cattivo: {
        label: '😠 Prof: Cattivo', short: 'Cattivo',
        maxAttempts: 3, severity: 75, feedbackStyle: 'Tagliente, diretto, brutalmente onesto. Zero incoraggiamenti. Parla come un professore universitario infastidito che si aspettava molto di più.',
        pushback: [
            'Ti sembra una risposta adeguata? No. Riprova.',
            'Insufficiente. È tutto quello che sai su questo argomento?',
            'Ho già sentito risposte migliori da studenti del primo anno. Riprova.',
            'Sbagliato. E non di poco. Concentrati e riprova.',
            'Manca la metà. La parte più importante, tra l\'altro. Riprova.',
            'Con questa risposta all\'esame prenderesti un bel quattro. Riprova.',
            'No. Hai studiato questa parte o hai saltato? Riprova.',
            'Troppo vaga. Ti aspetto con qualcosa di concreto. Riprova.',
            'Questo non basta. Non è neanche vicino a sufficiente. Riprova.',
            'Sei sicuro di voler rispondere così? Rifacci un giro e riprova.',
            'I concetti chiave mancano tutti. Studi ancora e riprova.',
            'Risposta da tre su dieci. Puoi fare molto meglio. Riprova.',
            'Non ci siamo. Prenditi un secondo, pensa, poi rispondi.',
            'Aspettavo molto di più da te. Non è arrivato. Riprova.',
            'Questa materia richiede precisione. Quella risposta non ce l\'ha. Riprova.',
        ],
    },
    pazzo: {
        label: '🤯 Prof: Pazzo', short: 'Pazzo', premium: true,
        maxAttempts: 4, severity: 90, feedbackStyle: 'Teatrale, esasperato, drammatico. Esagera la delusione.',
        // Tono teatrale "prof esasperato": deve sembrare personalmente deluso/offeso
        // dalla risposta, non solo insoddisfatto del contenuto.
        pushback: [
            'NO NO NO! Questa risposta mi fa SOFFRIRE. Da capo!',
            'Ho aspettato tutta la vita una risposta così... per SBAGLIARLA. Riprova!',
            'Sento le mie certezze sull\'istruzione italiana crollare. Da capo, PER FAVORE.',
            'Questa risposta meriterebbe un due, ma oggi sono di buon umore. RIPROVA SUBITO.',
            'Mi sta venendo un esaurimento nervoso. Si ricomincia!',
            'Mi hai deluso profondamente. Da capo, e stavolta sul serio.',
            'Sento la mia fiducia in te che crolla pezzo per pezzo. Riprova.',
            'Questa risposta è quasi un\'offesa personale. Da capo!',
            'Non ci posso credere, ho creduto in te per niente. Riprova subito.',
            'Mi hai tolto anni di vita con questa risposta. Da capo, ti prego.',
            'Sono profondamente deluso. Tu puoi fare meglio, lo sai. Da capo.',
            'Mi sento quasi offeso a nome di tutta la materia. Riprova!',
            'Mannaggia, pensavo che peggio non si potesse. Mi sbagliavo. Da capo!',
            'Porca miseria, che risposta è questa? Da capo, e usa il cervello stavolta.',
            'Accidenti, ho sprecato fiato a farti questa domanda. Riprova.',
            'Diamine, mi hai fatto perdere ogni speranza. Da capo, sul serio.',
            'Ma dai, sul serio? Pensavo valessi di più. Riprova subito.',
            'Che disastro. Mi hai fatto vergognare per te. Da capo!',
            'Roba da matti, neanche in prima media risponderebbero così. Riprova.',
            'Sono allibito. Da capo, e stavolta pensaci bene.',
        ],
    },
};

function getProfMode() {
    try {
        const v = localStorage.getItem(PROF_MODE_KEY);
        return PROF_MODES[v] ? v : 'censurato';
    } catch (e) { return 'censurato'; }
}

function setProfMode(mode) {
    try { localStorage.setItem(PROF_MODE_KEY, mode); } catch (e) {}
}

function profConfig() { return PROF_MODES[getProfMode()]; }

/** Getter pubblico per la label corta della modalità attiva (usato da home.js) */
export function getProfModeShort() { return PROF_MODES[getProfMode()].short; }

/** Getter pubblico per la label completa (con icona) della modalità attiva */
export function getProfModeLabel() { return PROF_MODES[getProfMode()].label; }

/** Getter pubblico: true se la modalità attiva non è "censurato" (per classi CSS) */
export function getProfModeCssClass() {
    const mode = getProfMode();
    if (mode === 'pazzo') return 'pazzo-on';
    if (mode === 'cattivo') return 'harsh-on';
    return '';
}

let _lastPushbackIdx = -1;
function randomPushback() {
    const pool = profConfig().pushback;
    if (!pool.length) return '';
    if (pool.length === 1) return pool[0];
    let idx;
    do { idx = Math.floor(Math.random() * pool.length); } while (idx === _lastPushbackIdx);
    _lastPushbackIdx = idx;
    return pool[idx];
}

function refreshProfModeUI() {
    const mode = getProfMode();
    const cfg  = PROF_MODES[mode];
    document.querySelectorAll('.prof-mode-btn').forEach(btn => {
        btn.textContent = cfg.label;
        btn.classList.toggle('harsh-on', mode !== 'censurato');
        btn.classList.toggle('pazzo-on', mode === 'pazzo');
    });
}

// ── Selettore Prof: materia + modalità ────────────────────────────────────────
let _profSelectDeckIdx = null;

export function openProfSelector() {
    _profSelectDeckIdx = null;
    const overlay = document.getElementById('prof-select-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    renderProfStep1();
}

export function closeProfSelector() {
    const overlay = document.getElementById('prof-select-overlay');
    if (overlay) overlay.style.display = 'none';
}

export function renderProfStep1() {
    const content = document.getElementById('prof-select-content');
    if (!content) return;
    const decks = _deps.state.decks || [];
    if (decks.length === 0) {
        content.innerHTML = `
            <div style="color:var(--accent); font-weight:800; font-size:0.85rem; text-transform:uppercase; letter-spacing:3px; margin-bottom:16px;">🎓 Modalità Prof</div>
            <p style="color:var(--text-muted);">Non hai ancora nessun mazzo. Crea prima del materiale da studiare.</p>
        `;
        return;
    }
    content.innerHTML = `
        <div style="color:var(--accent); font-weight:800; font-size:0.85rem; text-transform:uppercase; letter-spacing:3px; margin-bottom:6px;">🎓 Modalità Prof</div>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:24px;">Su quale materia vuoi essere interrogato?</p>
        <div style="display:flex; flex-direction:column; gap:10px; text-align:left; max-height:45vh; overflow-y:auto;">
            ${decks.map((d, i) => `
                <button class="btn-nebula-main" data-fn="selectProfDeck" data-params="[${i}]"
                    style="width:100%; text-align:left; justify-content:flex-start; padding:14px 18px; border-radius:14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:var(--text); font-weight:700; cursor:pointer;">
                    ${d.name}<span style="opacity:0.6; font-weight:500; font-size:0.85rem;"> · ${d.cards ? d.cards.length : 0} card</span>
                </button>
            `).join('')}
        </div>
    `;
}

export function selectProfDeck(idx) {
    _profSelectDeckIdx = idx;
    renderProfStep2();
}

function renderProfStep2() {
    const content = document.getElementById('prof-select-content');
    if (!content) return;
    const deck = _deps.state.decks[_profSelectDeckIdx];
    const currentMode = getProfMode();
    content.innerHTML = `
        <div style="color:var(--accent); font-weight:800; font-size:0.85rem; text-transform:uppercase; letter-spacing:3px; margin-bottom:6px;">🎓 ${deck ? deck.name : ''}</div>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:24px;">Quanto severo deve essere il prof?</p>
        <div style="display:flex; flex-direction:column; gap:12px;">
            ${PROF_ORDER.map(m => {
                const cfg = PROF_MODES[m];
                const active = m === currentMode;
                return `
                <button class="btn-nebula-main" data-fn="confirmProfMode" data-params='["${m}"]'
                    style="width:100%; padding:16px 18px; border-radius:14px; text-align:left; background:${active ? 'rgba(124,106,247,0.15)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}; color:var(--text); cursor:pointer;">
                    <strong>${cfg.label}</strong>${cfg.premium ? ' <span style="opacity:0.6;font-size:0.75rem;">(Premium)</span>' : ''}
                </button>`;
            }).join('')}
        </div>
        <button data-fn="renderProfStep1" style="margin-top:20px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.85rem;">← Cambia materia</button>
    `;
}

export async function confirmProfMode(mode) {
    if (PROF_MODES[mode]?.premium) {
        const premium = await (window.isPremiumSafe?.() ?? Promise.resolve(window.isPremium?.()));
        if (!premium) {
            if (window.showPaywall) window.showPaywall('oral_pazzo');
            return;
        }
    }
    setProfMode(mode);
    refreshProfModeUI();
    const deckIdx = _profSelectDeckIdx;
    closeProfSelector();
    if (window.renderHome) window.renderHome();
    if (deckIdx !== null) startOral(deckIdx);
}


// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = {
    state:              { decks: [] },
    showToast:          () => {},
    speakAI:            () => {},
    evaluateWithGemini: async () => null,
    getLang:            () => 'it',
};

export function init(deps) { _deps = { ..._deps, ...deps }; }

// ── Stato modulo ──────────────────────────────────────────────────────────────

let oralDeck = null, oralQueue = [], oralIndex = 0;
let speechRecognition = null;
let isOralListening   = false;
let oralAttempts      = 0; // tentativi sulla domanda corrente (Modalità Cattiva)
let oralInputMode     = 'voice'; // 'voice' | 'chat'

// ── Helpers privati ───────────────────────────────────────────────────────────

function initSpeech() {
    if (speechRecognition) return true;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        _deps.showToast('Il tuo browser non supporta la traduzione vocale (Usa Chrome/Edge).', 'error');
        return false;
    }
    speechRecognition = new SpeechRecognition();
    const gLang = _deps.getLang();
    speechRecognition.lang          = gLang === 'it' ? 'it-IT' : (gLang === 'en' ? 'en-US' : 'it-IT');
    speechRecognition.continuous    = false;
    speechRecognition.interimResults = false;
    return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

// ── Chat helpers ──────────────────────────────────────────────────────────────

function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _chatAppend(role, html, extra = '') {
    const area = document.getElementById('oral-chat-area');
    if (!area) return;
    const isProf = role === 'prof';
    const bubble = document.createElement('div');
    bubble.style.cssText = [
        'margin-bottom:12px',
        isProf ? 'text-align:left' : 'text-align:right',
    ].join(';');
    bubble.innerHTML = `
        <div style="display:inline-block; max-width:85%; padding:12px 16px;
            border-radius:${isProf ? '4px 18px 18px 18px' : '18px 4px 18px 18px'};
            background:${isProf ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.06)'};
            border:1px solid ${isProf ? 'rgba(124,106,247,0.35)' : 'rgba(255,255,255,0.10)'};
            font-size:0.93rem; line-height:1.5; color:var(--text); text-align:left;">
            <div style="font-size:0.7rem; font-weight:800; letter-spacing:2px; text-transform:uppercase;
                color:${isProf ? 'var(--accent)' : 'var(--text-muted)'}; margin-bottom:6px;">
                ${isProf ? '🎓 PROF' : '👤 TU'}</div>
            ${html}
            ${extra}
        </div>`;
    area.appendChild(bubble);
    area.scrollTop = area.scrollHeight;
}

function _chatTyping() {
    const area = document.getElementById('oral-chat-area');
    if (!area) return null;
    const el = document.createElement('div');
    el.id = 'oral-chat-typing';
    el.style.cssText = 'margin-bottom:12px; text-align:left;';
    el.innerHTML = `<div style="display:inline-block; padding:10px 16px;
        border-radius:4px 18px 18px 18px;
        background:rgba(124,106,247,0.12); border:1px solid rgba(124,106,247,0.25);
        color:var(--text-muted); font-size:0.85rem;">
        🎓 <em>Il Prof sta scrivendo...</em></div>`;
    area.appendChild(el);
    area.scrollTop = area.scrollHeight;
    return el;
}

// ── Input mode switch ─────────────────────────────────────────────────────────

export function setOralInputMode(mode) {
    oralInputMode = mode;
    const voiceArea   = document.getElementById('oral-voice-area');
    const chatArea    = document.getElementById('oral-chat-area');
    const chatInput   = document.getElementById('oral-chat-input-area');
    const voiceBtn    = document.getElementById('oral-mode-voice-btn');
    const chatBtn     = document.getElementById('oral-mode-chat-btn');
    if (!voiceArea) return;
    const isChat = mode === 'chat';
    voiceArea.style.display  = isChat ? 'none' : 'block';
    chatArea.style.display   = isChat ? 'block' : 'none';
    chatInput.style.display  = isChat ? 'flex' : 'none';
    // Se si entra in chat con area vuota, mostra subito la domanda corrente come bolla prof
    if (isChat && chatArea && chatArea.children.length === 0 && oralQueue.length > 0 && oralIndex < oralQueue.length) {
        _chatAppend('prof', oralQueue[oralIndex].q);
    }
    if (voiceBtn) {
        voiceBtn.style.background = isChat ? 'transparent' : 'var(--accent)';
        voiceBtn.style.color      = isChat ? 'var(--text-muted)' : '#fff';
    }
    if (chatBtn) {
        chatBtn.style.background = isChat ? 'var(--accent)' : 'transparent';
        chatBtn.style.color      = isChat ? '#fff' : 'var(--text-muted)';
    }
    // In chat mode: Enter = invia (Shift+Enter = newline)
    const textarea = document.getElementById('oral-chat-input');
    if (textarea && isChat && !textarea._chatKeyBound) {
        textarea._chatKeyBound = true;
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
        });
    }
}

export async function sendChatMessage() {
    const textarea = document.getElementById('oral-chat-input');
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = '';
    textarea.disabled = true;
    // Mostra la risposta dello studente come bolla (escaped — input utente)
    _chatAppend('student', _esc(text));
    // Typing indicator
    const typingEl = _chatTyping();
    // Valuta la risposta
    await evaluateOralChat(text, oralQueue[oralIndex].a, typingEl);
    textarea.disabled = false;
    textarea.focus();
}

async function evaluateOralChat(transcript, answer, typingEl) {
    const _pc = profConfig();
    let result = await _deps.evaluateWithGemini(transcript, answer, { aiSeverity: _pc.severity, aiFeedbackStyle: _pc.feedbackStyle || 'standard' });
    if (!result) {
        const getWords = (t) => t.toLowerCase().replace(/[.,!?;:]/g, '').split(' ').filter(w => w.length > 3);
        const ansWords = getWords(answer);
        const usrWords = getWords(transcript);
        let matches = 0;
        ansWords.forEach(w => { if (usrWords.includes(w)) matches++; });
        const pct = ansWords.length > 0 ? (matches / ansWords.length) * 100 : 100;
        result = {
            score: Math.round(pct), match: pct >= 50,
            feedback: pct >= 80 ? "Eccellente padronanza!" : pct >= 50 ? "Bene, ma mancano dettagli." : "Idea colta, spiegazione vaga."
        };
    }
    oralAttempts++;
    if (typingEl) typingEl.remove();

    if (result.match) {
        const _praisePool = result.score >= 85
            ? ['Perfetto, ottima risposta.', 'Eccellente.', 'Esatto, bravissimo.']
            : ['Corretto, bene così.', 'Sì, ci siamo.', 'Giusto.'];
        const _praise = _praisePool[Math.floor(Math.random() * _praisePool.length)];
        _chatAppend('prof',
            `✅ <strong>${_praise}</strong> <span style="opacity:0.6; font-size:0.85rem;">(${result.score}%)</span>`,
            `<div style="margin-top:6px; font-size:0.82rem; opacity:0.75; font-style:italic;">${result.feedback}</div>`
        );
        awardXP(15, '💬 Risposta Chat Prof');
        const nextBtn = document.getElementById('oral-next-btn');
        if (nextBtn) nextBtn.style.display = 'block';
        // UX: in modalita' chat il bottone globale puo' essere fuori schermo —
        // offri "prossima domanda" direttamente nella conversazione.
        _chatAppend('prof',
            `<button data-fn="nextOralQuestion" style="margin-top:4px; padding:8px 18px; border-radius:10px; border:none; background:var(--accent); color:#fff; font-weight:700; cursor:pointer; font-family:inherit;">➡️ Prossima domanda</button>`
        );
        return;
    }

    const cfg = profConfig();
    if (cfg.maxAttempts > 1 && oralAttempts < cfg.maxAttempts) {
        const pushback = randomPushback();
        _chatAppend('prof',
            `🔥 ${pushback}`,
            `<div style="margin-top:6px; font-size:0.82rem; opacity:0.65;">Tentativo ${oralAttempts}/${cfg.maxAttempts} — ${result.feedback}</div>`
        );
        return;
    }

    // Tentativi esauriti
    _chatAppend('prof',
        `❌ <strong>Non ci siamo.</strong>`,
        `<div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.08); font-size:0.85rem;">
            <strong>La risposta era:</strong><br>${answer}
         </div>`
    );
    const nextBtn = document.getElementById('oral-next-btn');
    if (nextBtn) nextBtn.style.display = 'block';
}

export function closeOralExam() {
    document.getElementById('oral-overlay').style.display = 'none';
    if (speechRecognition && isOralListening) speechRecognition.stop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export async function startOral(deckIdx) {
    // Gate premium
    const premium = await (window.isPremiumSafe?.() ?? Promise.resolve(window.isPremium?.()));
    if (!premium) {
        if (window.showPaywall) window.showPaywall('oral');
        return;
    }
    oralDeck = _deps.state.decks[deckIdx];
    if (!oralDeck || !oralDeck.cards || oralDeck.cards.length === 0) {
        _deps.showToast('Il mazzo è vuoto.', 'error'); return;
    }
    oralQueue = [...oralDeck.cards].sort(() => Math.random() - 0.5);
    oralIndex = 0;
    oralAttempts = 0;
    _lastPushbackIdx = -1;

    // Reset chat area
    const chatArea = document.getElementById('oral-chat-area');
    if (chatArea) chatArea.innerHTML = '';

    document.getElementById('oral-overlay').style.display = 'flex';
    refreshProfModeUI();
    setOralInputMode(oralInputMode); // applica la UI corretta

    if (oralInputMode === 'voice') {
        if (!initSpeech()) { closeOralExam(); return; }
        speechRecognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('oral-transcript').textContent = 'Tu: "' + transcript + '"';
            document.getElementById('oral-mic').classList.remove('listening');
            isOralListening = false;
            evaluateOral(transcript, oralQueue[oralIndex].a);
        };
        speechRecognition.onerror = () => {
            document.getElementById('oral-transcript').textContent = (_t().mic_error||'Errore microfono. Clicca di nuovo per riprovare.');
            document.getElementById('oral-mic').classList.remove('listening');
            isOralListening = false;
        };
    }
    loadOralQuestion();
    earnBadge('oral_speaker');
}

function loadOralQuestion() {
    if (oralIndex >= oralQueue.length) {
        if (oralInputMode === 'chat') {
            _chatAppend('prof', '🎓 <strong>Esame terminato! Ottimo lavoro.</strong>');
        } else {
            document.getElementById('oral-q').textContent = (_t().exam_done||'Esame terminato! Ottimo lavoro.');
        }
        document.getElementById('oral-transcript').style.display = 'none';
        document.getElementById('oral-mic').style.display       = 'none';
        document.getElementById('oral-result').style.display    = 'none';
        document.getElementById('oral-next-btn').style.display  = 'none';
        document.getElementById('oral-chat-input-area').style.display = 'none';
        awardXP(50, '🗣️ Esame Orale Completo');
        return;
    }
    const q = oralQueue[oralIndex].q;
    oralAttempts = 0;
    document.getElementById('oral-progress').textContent = `Domanda ${oralIndex + 1} di ${oralQueue.length}`;
    document.getElementById('oral-result').style.display   = 'none';
    document.getElementById('oral-next-btn').style.display = 'none';

    if (oralInputMode === 'chat') {
        // Modalità chat: appendi la domanda come bolla prof con intro variato
        const _introPool = [
            'Allora, dimmi: ',
            'Spiegami: ',
            'Bene, prossima: ',
            'Concentrati: ',
            'Vediamo: ',
            '',
        ];
        const _intro = _introPool[Math.floor(Math.random() * _introPool.length)];
        _chatAppend('prof', _intro + q);
        // Assicurati che l'input sia visibile
        document.getElementById('oral-chat-input-area').style.display = 'flex';
        const ta = document.getElementById('oral-chat-input');
        if (ta) { ta.value = ''; ta.focus(); }
    } else {
        // Modalità vocale: comportamento originale
        document.getElementById('oral-q').textContent = q;
        document.getElementById('oral-transcript').textContent = (_t().press_mic||'Premi il microfono per rispondere...');
        _deps.speakAI(q);
    }
}

export function toggleSpeechRecognition() {
    if (isOralListening) {
        speechRecognition.stop();
        isOralListening = false;
        document.getElementById('oral-mic').classList.remove('listening');
    } else {
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        speechRecognition.start();
        isOralListening = true;
        document.getElementById('oral-mic').classList.add('listening');
        document.getElementById('oral-transcript').textContent = (_t().listening||'Sto ascoltando...');
    }
}

async function evaluateOral(transcript, answer) {
    const resEl = document.getElementById('oral-result');
    resEl.style.display    = 'block';
    resEl.innerHTML        = `<div class="spinner-sm" style="display:inline-block; margin-right:8px;"></div> Analisi intelligente in corso...`;
    resEl.style.color      = 'var(--accent)';
    resEl.style.background = 'rgba(124,106,247,0.05)';
    const _pc = profConfig();
    let result = await _deps.evaluateWithGemini(transcript, answer, { aiSeverity: _pc.severity, aiFeedbackStyle: _pc.feedbackStyle || 'standard' });
    if (!result) {
        const getWords = (t) => t.toLowerCase().replace(/[.,!?;:]/g, '').split(' ').filter(w => w.length > 3);
        const ansWords = getWords(answer);
        const usrWords = getWords(transcript);
        let matches = 0;
        ansWords.forEach(w => { if (usrWords.includes(w)) matches++; });
        const pct = ansWords.length > 0 ? (matches / ansWords.length) * 100 : 100;
        result = {
            score:    Math.round(pct),
            match:    pct >= 50,
            feedback: pct >= 80 ? "🌟 Eccellente padronanza!" : pct >= 50 ? "👍 Molto bene, ma mancano dettagli." : "💡 Idea colta, ma spiegazione vaga."
        };
    }
    oralAttempts++;

    if (result.match) {
        resEl.innerHTML        = `✅ Corretto! (${result.score}% precisione)<br><small style="display:block;margin-top:8px;font-style:italic;opacity:0.9;">Coach AI: ${result.feedback}</small>`;
        resEl.style.color      = 'var(--green)';
        resEl.style.background = 'rgba(16,185,129,0.1)';
        awardXP(15, '🗣️ Risposta Semantica');
        document.getElementById('oral-next-btn').style.display = 'block';
        // Il prof parla solo il verdetto, non legge il commento scritto di Coach AI
        _deps.speakAI(result.score >= 80 ? 'Eccellente, risposta perfetta.' : 'Corretto, bene così.');
        return;
    }

    // Risposta non adeguata — in Modalità Cattiva/Pazzo contestiamo invece di passare
    // avanti, finché restano tentativi disponibili sulla domanda.
    const cfg = profConfig();
    if (cfg.maxAttempts > 1 && oralAttempts < cfg.maxAttempts) {
        const pushback = randomPushback();
        resEl.innerHTML        = `🔥 ${pushback}<br><small style="display:block;margin-top:8px;">Coach AI: ${result.feedback}</small><br><small style="display:block;margin-top:4px;opacity:0.7;">Tentativo ${oralAttempts}/${cfg.maxAttempts} — premi il microfono e riprova.</small>`;
        resEl.style.color      = '#ff6b6b';
        resEl.style.background = 'rgba(239,68,68,0.12)';
        document.getElementById('oral-next-btn').style.display = 'none';
        document.getElementById('oral-transcript').textContent = (_t().press_mic||'Premi il microfono per rispondere...');
        _deps.speakAI(pushback);
        return;
    }

    // Tentativi esauriti (o Prof Normale): mostra la risposta corretta e avanza.
    const exhausted = cfg.maxAttempts > 1 && oralAttempts >= cfg.maxAttempts;
    resEl.innerHTML        = `❌ Incompleto${exhausted ? ' — tentativi esauriti' : ''}.<br><small style="display:block;margin-top:8px;">Coach AI: ${result.feedback}</small><br><div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border);"><strong>CORRETTA:</strong> ${answer}</div>`;
    resEl.style.color      = 'var(--red)';
    resEl.style.background = 'rgba(239,68,68,0.1)';
    document.getElementById('oral-next-btn').style.display = 'block';
    // Il prof parla solo il verdetto e la risposta corretta, non il commento scritto di  Coach AI
    _deps.speakAI(`Risposta incompleta. La risposta corretta era: ${answer}`);
}

export function nextOralQuestion() {
    oralIndex++;
    document.getElementById('oral-next-btn').style.display = 'none';
    loadOralQuestion();
}
