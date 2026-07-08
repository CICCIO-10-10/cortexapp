/**
 * modules/bossMode.js — Phase 24
 *
 * MEGA FEATURE: Boss Mode — scontro epico con timer, riconoscimento vocale e HP.
 * Estratto da main.js (MEGA FEATURE: BOSS MODE block).
 *
 * Dipendenze iniettate via init():
 *   state               — app state (decks)
 *   evaluateWithGemini  — valutazione semantica AI
 *   getLang             — getter per gLang (lingua corrente)
 *
 * Import diretti:
 *   awardXP             ← modules/gamification.js
 *   TRANSLATIONS        ← data/translations.js
 */
import { awardXP }        from './gamification.js';
import { TRANSLATIONS }   from '../data/translations.js';
const _t = () => (TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it);


// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = {
    state:              { decks: [] },
    evaluateWithGemini: async () => null,
    getLang:            () => 'it',
};

export function init(deps) { _deps = { ..._deps, ...deps }; }

// ── Security: sanitize user content before innerHTML injection ────────────────
function sanitize(str) {
    const el = document.createElement('div');
    el.textContent = String(str || '');
    return el.innerHTML;
}

// ── Stato modulo ──────────────────────────────────────────────────────────────

let bossIndex = 0;
let bossCards = [];
let bossHp    = 3;
let bossTimer = null;
let isBossListening = false;
const BOSS_TIME_LIMIT = 20;

let speechRecognition = null;

// ── Helpers privati ───────────────────────────────────────────────────────────

function initSpeech() {
    if (speechRecognition) return true;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return false;
    speechRecognition = new SpeechRecognition();
    const gLang = _deps.getLang();
    speechRecognition.lang          = gLang === 'it' ? 'it-IT' : (gLang === 'en' ? 'en-US' : 'it-IT');
    speechRecognition.continuous    = false;
    speechRecognition.interimResults = true;
    return true;
}

function updateBossHpUI() {
    let hearts = '';
    for (let i = 0; i < 3; i++) {
        hearts += i < bossHp ? '❤️' : '🖤';
    }
    document.getElementById('boss-hp').textContent = hearts;
}

function loadBossQuestion() {
    if (bossIndex >= bossCards.length || bossHp <= 0) {
        endBossEncounter();
        return;
    }

    const card  = bossCards[bossIndex];
    const gLang = _deps.getLang();
    const t     = TRANSLATIONS[gLang];
    document.getElementById('boss-q').textContent = card.q;
    document.getElementById('boss-counter').textContent = `${t.boss_question} ${bossIndex + 1} ${t.boss_of} ${bossCards.length}`;
    document.getElementById('boss-result').style.display    = 'none';
    document.getElementById('boss-next-btn').style.display  = 'none';
    document.getElementById('boss-transcript').textContent  = 'In attesa della tua difesa...';
    document.getElementById('boss-mic').classList.remove('listening');

    // TTS boss question
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(card.q);
        const langMapTTS = { it: 'it-IT', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' };
        u.lang  = langMapTTS[gLang] || 'it-IT';
        u.rate  = 1.1;
        u.pitch = 0.5;
        speechSynthesis.speak(u);
    }

    // Anxious timer bar
    const bar = document.getElementById('boss-timer-bar');
    bar.style.transition = 'none';
    bar.style.width      = '100%';
    setTimeout(() => {
        bar.style.transition = `width ${BOSS_TIME_LIMIT}s linear`;
        bar.style.width      = '0%';
    }, 50);

    if (bossTimer) clearTimeout(bossTimer);
    bossTimer = setTimeout(() => { handleBossTimeout(); }, BOSS_TIME_LIMIT * 1000);

    // Auto start mic after 1 s
    if (!isBossListening) {
        setTimeout(toggleBossMic, 1000);
    }
}

function handleBossTimeout() {
    if (isBossListening && speechRecognition) speechRecognition.stop();
    document.getElementById('boss-modal').classList.add('boss-shake');
    setTimeout(() => document.getElementById('boss-modal').classList.remove('boss-shake'), 500);

    bossHp--;
    updateBossHpUI();

    const gLang = _deps.getLang();
    const t     = TRANSLATIONS[gLang];
    const resEl = document.getElementById('boss-result');
    resEl.style.display    = 'block';
    resEl.innerHTML        = `❌ ${t.boss_timeout}<br><small style="color:var(--text-muted);">${t.boss_hit}. Risposta corretta: ${sanitize(bossCards[bossIndex].a)}</small>`;
    resEl.style.color      = '#ef4444';
    resEl.style.background = 'rgba(239,68,68,0.1)';
    document.getElementById('boss-next-btn').style.display = 'block';
}

async function evaluateBossAnswer(transcript, answer) {
    if (bossTimer) clearTimeout(bossTimer);
    if (isBossListening && speechRecognition) {
        speechRecognition.stop();
        isBossListening = false;
        document.getElementById('boss-mic').classList.remove('listening');
    }

    const resEl = document.getElementById('boss-result');
    resEl.style.display = 'block';
    resEl.innerHTML     = `🛡️ Analisi difesa in corso...`;
    resEl.style.color   = 'var(--accent)';

    let result = await _deps.evaluateWithGemini(transcript, answer);

    if (!result) {
        const getWords = (t) => t.toLowerCase().replace(/[.,!?;:]/g, '').split(' ').filter(w => w.length > 3);
        const ansWords = getWords(answer);
        const usrWords = getWords(transcript);
        let matches = 0;
        ansWords.forEach(w => { if (usrWords.includes(w)) matches++; });
        const pct = ansWords.length > 0 ? (matches / ansWords.length) * 100 : 100;
        result = { score: Math.round(pct), match: pct >= 50, feedback: "Difesa standard attivata." };
    }

    const gLang = _deps.getLang();
    const t     = TRANSLATIONS[gLang];
    if (result.match) {
        resEl.innerHTML        = `🛡️ ${t.boss_parried} (${result.score}% precisione)<br><small style="color:var(--text-muted); opacity:0.8;">${sanitize(result.feedback)}</small>`;
        resEl.style.color      = '#10b981';
        resEl.style.background = 'rgba(16,185,129,0.1)';
        awardXP(25, '⚔️ Difesa Epica');
    } else {
        document.getElementById('boss-modal').classList.add('boss-shake');
        setTimeout(() => document.getElementById('boss-modal').classList.remove('boss-shake'), 500);
        bossHp--;
        updateBossHpUI();
        resEl.innerHTML        = `🩸 ${t.boss_hit}<br><small style="color:var(--text-muted);">${sanitize(result.feedback)}</small><br><div style="font-size:0.75rem; margin-top:4px; opacity:0.7;">DR: ${sanitize(answer)}</div>`;
        resEl.style.color      = '#ef4444';
        resEl.style.background = 'rgba(239,68,68,0.1)';
    }

    document.getElementById('boss-timer-bar').style.transition = 'none';
    document.getElementById('boss-next-btn').style.display     = 'block';
}

function endBossEncounter() {
    const resEl = document.getElementById('boss-result');
    resEl.style.display = 'block';
    const gLang = _deps.getLang();
    document.getElementById('boss-q').textContent          = bossHp > 0 ? (_t().victory||"VITTORIA!") : (_t().defeat||"SCONFITTA...");
    document.getElementById('boss-transcript').textContent = "";
    document.getElementById('boss-timer-bar').style.width  = '0%';

    if (bossHp > 0) {
        resEl.innerHTML        = gLang === 'it' ? `Sei sopravvissuto con ${bossHp} cuori! Sei pronto per l'esame. 👑` : `You survived with ${bossHp} hearts! You are ready for the exam. 👑`;
        resEl.style.color      = '#f59e0b';
        resEl.style.background = 'rgba(245,158,11,0.1)';
        awardXP(100, '🏆 Boss Sconfitto');
    } else {
        resEl.innerHTML        = gLang === 'it' ? `Hai esaurito l'energia. Devi ripassare questo mazzo! 💀` : `You ran out of energy. You need to review this deck! 💀`;
        resEl.style.color      = '#ef4444';
        resEl.style.background = 'rgba(239,68,68,0.1)';
    }
    document.getElementById('boss-next-btn').style.display = 'none';
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startBossMode(deckIdx) {
    // Gate premium — attendi verifica piano (max 3s) prima di bloccare
    const premium = await (window.isPremiumSafe?.() ?? Promise.resolve(window.isPremium?.()));
    if (!premium) {
        if (window.showPaywall) window.showPaywall('boss');
        return;
    }
    const deck = _deps.state.decks[deckIdx];
    if (!deck || !deck.cards || deck.cards.length === 0) return;
    let shuffled = [...deck.cards].sort(() => 0.5 - Math.random());
    bossCards = shuffled;
    bossIndex = 0;
    bossHp    = 3;
    document.getElementById('boss-overlay').style.display = 'flex';
    updateBossHpUI();
    loadBossQuestion();
}

export function toggleBossMic() {
    if (!initSpeech()) return;

    if (isBossListening) {
        speechRecognition.stop();
        isBossListening = false;
        document.getElementById('boss-mic').classList.remove('listening');
    } else {
        speechRecognition.onresult = (event) => {
            const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
            document.getElementById('boss-transcript').textContent = transcript;
            if (event.results[0].isFinal) {
                clearTimeout(bossTimer);
                evaluateBossAnswer(transcript, bossCards[bossIndex].a);
            }
        };
        speechRecognition.onerror = (event) => {
            console.error('Speech recognition error in Boss mode', event.error);
        };
        try {
            speechRecognition.start();
            isBossListening = true;
            document.getElementById('boss-mic').classList.add('listening');
            document.getElementById('boss-transcript').textContent = TRANSLATIONS[_deps.getLang()].boss_listening;
        } catch (e) { }
    }
}

export function nextBossQuestion() {
    bossIndex++;
    loadBossQuestion();
}

export function closeBossMode() {
    document.getElementById('boss-overlay').style.display = 'none';
    if (speechRecognition) speechRecognition.stop();
    isBossListening = false;
}
