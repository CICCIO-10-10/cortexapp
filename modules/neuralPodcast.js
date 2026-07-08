/**
 * modules/neuralPodcast.js — Neural Podcasts 🎙️
 *
 * Converte un mazzo di flashcard in un dialogo audio tra due voci (Host + Guest).
 * Gemini genera lo script, Web SpeechSynthesis lo legge con 2 voci diverse.
 *
 * Flusso:
 *  1. openPodcast(deckIdx) → mostra overlay con anteprima
 *  2. _generateScript()    → Gemini crea dialogo Host/Guest dal contenuto del mazzo
 *  3. _playScript()        → SpeechSynthesis alterna 2 voci, mostra testo attivo
 *  4. XP al completamento
 */

import { SecurityManager, getFunctions, callGeminiProxy } from '../services/firebase.js';
import { discoverGeminiModel }           from '../services/ai.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OVERLAY_ID  = 'neural-podcast-overlay';

let _ctx        = {};
let _playing    = false;
let _paused     = false;
let _lines      = [];   // [{speaker:'HOST'|'GUEST', text:string}]
let _lineIdx    = 0;
let _deckName   = '';

export function init(ctx) { _ctx = ctx; }

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function openPodcast(deckIdx) {
    const premium = await (window.isPremiumSafe?.() ?? Promise.resolve(window.isPremium?.()));
    if (!premium) { if (window.showPaywall) window.showPaywall('audio'); return; }
    const deck = _ctx.state?.decks?.[deckIdx];
    if (!deck || !deck.cards || deck.cards.length === 0) {
        if (window.showToast) window.showToast(t('podcast_err_deck'), 'error');
        return;
    }
    _deckName = deck.name;
    _lines    = [];
    _lineIdx  = 0;
    _playing  = false;
    _paused   = false;
    speechSynthesis.cancel();

    _ensureOverlay();
    document.getElementById(OVERLAY_ID).style.display = 'flex';
    _renderIdle(deck);
}

export function closePodcast() {
    speechSynthesis.cancel();
    _playing = false;
    _paused  = false;
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.style.display = 'none';
}

// ─── Overlay UI ───────────────────────────────────────────────────────────────

function _ensureOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const div = document.createElement('div');
    div.id = OVERLAY_ID;
    div.style.cssText = `
        display:none; position:fixed; inset:0; z-index:9500;
        background:rgba(3,3,10,0.97); backdrop-filter:blur(24px);
        flex-direction:column; align-items:center; justify-content:center;
        padding:20px; animation:fadeIn 0.3s ease;`;
    document.body.appendChild(div);
}

function _renderIdle(deck) {
    const el = document.getElementById(OVERLAY_ID);
    const cardCount = deck.cards.length;
    const estMin    = Math.max(2, Math.round(cardCount * 0.4));

    el.innerHTML = `
    <div style="width:100%;max-width:520px;background:rgba(255,255,255,0.03);
        border:1px solid rgba(255,255,255,0.08);border-radius:28px;overflow:hidden;
        box-shadow:0 32px 80px rgba(0,0,0,0.6);">

        <!-- Header -->
        <div style="padding:28px 28px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="font-size:0.7rem;color:var(--accent);font-weight:700;
                text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">
                🎙️ Neural Podcast
            </div>
            <h2 style="font-size:1.4rem;font-weight:800;margin:0;color:var(--text);">
                ${_deckName}
            </h2>
            <p style="color:var(--text-muted);font-size:0.85rem;margin:6px 0 0;">
                ${cardCount} concetti · ~${estMin} minuti di ascolto
            </p>
        </div>

        <!-- Preview -->
        <div style="padding:24px 28px;">
            <div style="display:flex;gap:16px;margin-bottom:20px;">
                <div style="flex:1;padding:14px;background:rgba(124,106,247,0.08);
                    border:1px solid rgba(124,106,247,0.2);border-radius:14px;text-align:center;">
                    <div style="font-size:1.5rem;margin-bottom:4px;">🎓</div>
                    <div style="font-size:0.75rem;font-weight:700;color:var(--accent);">AURA</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">Docente IA</div>
                </div>
                <div style="display:flex;align-items:center;color:var(--text-muted);font-size:1.2rem;">⇄</div>
                <div style="flex:1;padding:14px;background:rgba(16,185,129,0.08);
                    border:1px solid rgba(16,185,129,0.2);border-radius:14px;text-align:center;">
                    <div style="font-size:1.5rem;margin-bottom:4px;">🧠</div>
                    <div style="font-size:0.75rem;font-weight:700;color:#10b981;">NOVA</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">Studente IA</div>
                </div>
            </div>

            <p style="font-size:0.82rem;color:var(--text-muted);line-height:1.6;margin:0 0 20px;">
                Gemini genererà un dialogo tra <strong style="color:var(--accent)">AURA</strong>
                (docente) e <strong style="color:#10b981">NOVA</strong> (studente).
                Ascolta mentre studi, cammini o ti rilassi. 🎧
            </p>

            <div style="display:flex;gap:12px;">
                <button onclick="closePodcast()" style="
                    flex:1;padding:14px;background:transparent;
                    border:1px solid var(--border);border-radius:14px;
                    color:var(--text-muted);font-family:inherit;cursor:pointer;">
                    Annulla
                </button>
                <button onclick="window.__podcastGenerate()" style="
                    flex:2;padding:14px;
                    background:linear-gradient(135deg,var(--accent),#10b981);
                    border:none;border-radius:14px;color:#fff;
                    font-family:inherit;font-weight:700;font-size:0.95rem;cursor:pointer;
                    box-shadow:0 8px 24px rgba(124,106,247,0.3);">
                    🎙️ Genera Podcast
                </button>
            </div>
        </div>
    </div>`;
}

function _renderLoading() {
    document.getElementById(OVERLAY_ID).innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:20px;padding:40px;text-align:center;">
        <div style="width:56px;height:56px;border:3px solid rgba(124,106,247,0.2);
            border-top-color:var(--accent);border-radius:50%;
            animation:spin 0.8s linear infinite;"></div>
        <p style="color:var(--text-muted);font-size:0.95rem;">
            🤖 Gemini sta scrivendo il dialogo...<br>
            <span style="font-size:0.8rem;opacity:0.6;">Ci vogliono 10-20 secondi</span>
        </p>
    </div>`;
}

function _renderPlayer() {
    const total = _lines.length;
    const el    = document.getElementById(OVERLAY_ID);

    el.innerHTML = `
    <div style="width:100%;max-width:560px;display:flex;flex-direction:column;gap:0;
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
        border-radius:28px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.6);">

        <!-- Header player -->
        <div style="padding:20px 24px 16px;border-bottom:1px solid rgba(255,255,255,0.06);
            display:flex;align-items:center;justify-content:space-between;">
            <div>
                <div style="font-size:0.7rem;color:var(--accent);font-weight:700;
                    text-transform:uppercase;letter-spacing:2px;">🎙️ In riproduzione</div>
                <div style="font-weight:800;font-size:1rem;margin-top:3px;">${_deckName}</div>
            </div>
            <button onclick="closePodcast()" style="
                background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                border-radius:50%;width:36px;height:36px;color:var(--text);font-size:1.1rem;
                cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
        </div>

        <!-- Progress bar -->
        <div style="height:3px;background:rgba(255,255,255,0.05);">
            <div id="podcast-progress-bar" style="height:100%;width:0%;
                background:linear-gradient(90deg,var(--accent),#10b981);
                transition:width 0.5s ease;"></div>
        </div>

        <!-- Transcript area -->
        <div id="podcast-transcript" style="
            flex:1;padding:20px 24px;overflow-y:auto;max-height:300px;
            display:flex;flex-direction:column;gap:12px;"></div>

        <!-- Active line display -->
        <div id="podcast-active-line" style="
            padding:16px 24px;background:rgba(124,106,247,0.06);
            border-top:1px solid rgba(255,255,255,0.06);
            min-height:60px;display:flex;align-items:center;gap:12px;">
            <div style="font-size:1.4rem;" id="podcast-active-icon">🎙️</div>
            <p id="podcast-active-text" style="color:var(--text);font-size:0.9rem;
                line-height:1.5;margin:0;font-style:italic;">
                Preparazione...
            </p>
        </div>

        <!-- Controls -->
        <div style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.06);
            display:flex;align-items:center;justify-content:center;gap:16px;">
            <span id="podcast-counter" style="font-size:0.8rem;color:var(--text-muted);
                min-width:60px;">0 / ${total}</span>

            <button id="podcast-playpause" onclick="window.__podcastToggle()" style="
                width:52px;height:52px;border-radius:50%;
                background:linear-gradient(135deg,var(--accent),#10b981);
                border:none;color:#fff;font-size:1.4rem;cursor:pointer;
                box-shadow:0 6px 20px rgba(124,106,247,0.4);
                display:flex;align-items:center;justify-content:center;">
                ▶
            </button>

            <button onclick="window.__podcastStop()" style="
                width:36px;height:36px;border-radius:50%;
                background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                color:var(--text-muted);font-size:0.9rem;cursor:pointer;
                display:flex;align-items:center;justify-content:center;">
                ■
            </button>
        </div>
    </div>`;

    // Avvia subito
    _playFromIndex(0);
}

// ─── Generazione Script ───────────────────────────────────────────────────────

window.__podcastGenerate = async function() {
    const overlay = document.getElementById(OVERLAY_ID);
    const deckIdx = window.__podcastDeckIdx;
    const deck    = _ctx.state?.decks?.[deckIdx];
    if (!deck) return;

    _renderLoading();

    try {
        const cards = deck.cards.slice(0, 20); // max 20 card per script
        const cardList = cards.map((c, i) =>
            `${i + 1}. Concetto: "${c.q}" → Spiegazione: "${c.a}"`
        ).join('\n');

        const prompt = `Sei uno sceneggiatore di podcast educativi in italiano.
Crea un dialogo naturale e coinvolgente tra due personaggi:
- AURA: docente esperta, spiega con chiarezza e passione
- NOVA: studente brillante, fa domande intelligenti e riassume

Il dialogo deve coprire TUTTI i concetti seguenti in modo fluido e conversazionale.
NON usare bullet points o elenchi. Scrivi come un vero podcast parlato.
Ogni battuta deve essere breve (max 2 frasi). Almeno ${Math.max(cards.length * 2, 10)} battute totali.

Materia: "${deck.name}"
Concetti da coprire:
${cardList}

Rispondi SOLO con JSON valido, nessun testo aggiuntivo:
[
  {"speaker": "AURA", "text": "..."},
  {"speaker": "NOVA", "text": "..."},
  ...
]`;

        const raw = await _callGemini(prompt);
        _lines = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());

        if (!Array.isArray(_lines) || _lines.length === 0) throw new Error('Script vuoto');

        _renderPlayer();
    } catch (err) {
        console.error('[Podcast]', err);
        if (window.showToast) window.showToast(t('podcast_err_gen'), 'error');
        closePodcast();
    }
};

// ─── Playback ────────────────────────────────────────────────────────────────

function _playFromIndex(idx) {
    _playing = true;
    _paused  = false;
    _lineIdx = idx;
    _speakLine();
}

function _speakLine() {
    if (!_playing || _paused || _lineIdx >= _lines.length) {
        if (_lineIdx >= _lines.length) _onComplete();
        return;
    }

    const line    = _lines[_lineIdx];
    const isAura  = line.speaker === 'AURA';
    const voices  = speechSynthesis.getVoices();
    const total   = _lines.length;
    const pct     = Math.round((_lineIdx / total) * 100);

    // Aggiorna UI
    const activeText = document.getElementById('podcast-active-text');
    const activeIcon = document.getElementById('podcast-active-icon');
    const counter    = document.getElementById('podcast-counter');
    const bar        = document.getElementById('podcast-progress-bar');
    if (activeText) activeText.textContent = line.text;
    if (activeIcon) activeIcon.textContent = isAura ? '🎓' : '🧠';
    if (counter)    counter.textContent    = `${_lineIdx + 1} / ${total}`;
    if (bar)        bar.style.width        = `${pct}%`;

    // Aggiungi al transcript
    const transcript = document.getElementById('podcast-transcript');
    if (transcript) {
        const bubble = document.createElement('div');
        bubble.style.cssText = `
            display:flex;gap:8px;align-items:flex-start;
            ${isAura ? '' : 'flex-direction:row-reverse;'}`;
        bubble.innerHTML = `
            <div style="font-size:1rem;flex-shrink:0;">${isAura ? '🎓' : '🧠'}</div>
            <div style="
                padding:10px 14px;border-radius:14px;max-width:80%;font-size:0.82rem;line-height:1.5;
                background:${isAura ? 'rgba(124,106,247,0.12)' : 'rgba(16,185,129,0.1)'};
                border:1px solid ${isAura ? 'rgba(124,106,247,0.2)' : 'rgba(16,185,129,0.2)'};
                color:var(--text);">
                <span style="font-size:0.7rem;font-weight:700;
                    color:${isAura ? 'var(--accent)' : '#10b981'};
                    display:block;margin-bottom:4px;">${line.speaker}</span>
                ${line.text}
            </div>`;
        transcript.appendChild(bubble);
        transcript.scrollTop = transcript.scrollHeight;
    }

    // TTS — scegli voci diverse per i 2 speaker
    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.lang  = 'it-IT';
    utterance.rate  = 0.95;

    // Cerca voci italiane: AURA = voce femminile, NOVA = voce maschile (o viceversa)
    const italianVoices = voices.filter(v => v.lang.startsWith('it'));
    if (italianVoices.length >= 2) {
        utterance.voice = italianVoices[isAura ? 0 : 1];
    } else if (italianVoices.length === 1) {
        utterance.voice  = italianVoices[0];
        utterance.pitch  = isAura ? 1.1 : 0.85;
    }

    utterance.onend = () => {
        _lineIdx++;
        setTimeout(_speakLine, 300);
    };
    utterance.onerror = () => {
        _lineIdx++;
        _speakLine();
    };

    speechSynthesis.speak(utterance);
}

function _onComplete() {
    _playing = false;
    const bar = document.getElementById('podcast-progress-bar');
    if (bar) bar.style.width = '100%';
    const btn = document.getElementById('podcast-playpause');
    if (btn) btn.textContent = '✓';

    if (_ctx.awardXP) _ctx.awardXP(30, '🎙️ Neural Podcast');
    if (window.showToast) window.showToast(t('podcast_done'), 'success');
}

window.__podcastToggle = function() {
    const btn = document.getElementById('podcast-playpause');
    if (_playing && !_paused) {
        speechSynthesis.pause();
        _paused = true;
        if (btn) btn.textContent = '▶';
    } else if (_paused) {
        speechSynthesis.resume();
        _paused = false;
        if (btn) btn.textContent = '⏸';
    } else {
        _playFromIndex(_lineIdx);
        if (btn) btn.textContent = '⏸';
    }
};

window.__podcastStop = function() {
    speechSynthesis.cancel();
    _playing = false;
    _paused  = false;
    _lineIdx = 0;
    const btn = document.getElementById('podcast-playpause');
    const bar = document.getElementById('podcast-progress-bar');
    const transcript = document.getElementById('podcast-transcript');
    if (btn) btn.textContent = '▶';
    if (bar) bar.style.width = '0%';
    if (transcript) transcript.innerHTML = '';
};

// ─── Gemini call ─────────────────────────────────────────────────────────────

async function _callGemini(prompt) {
    if (window._fbLoggedIn) {
        {
            const result = await callGeminiProxy({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, response_mime_type: 'application/json' }
            });
            const text = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Proxy: risposta vuota');
            return text;
        }
    }
    const apiKey = SecurityManager.getApiKey();
    if (!apiKey) throw new Error('Nessuna API Key disponibile');
    const model  = await discoverGeminiModel(apiKey);
    const res    = await fetch(
        `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, response_mime_type: 'application/json' }
            })
        }
    );
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `Errore ${res.status}`); }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Risposta vuota');
    return text;
}

// ─── Export pubblico ──────────────────────────────────────────────────────────

export function registerPodcastGlobals(register) {
    register('openPodcast',  (deckIdx) => {
        window.__podcastDeckIdx = deckIdx;
        openPodcast(deckIdx);
    });
    register('closePodcast', closePodcast);
    window.closePodcast = closePodcast;
}
