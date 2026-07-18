import { t } from '../core/i18n.js';
/**
 * modules/quiz.js — Modalità Quiz v2 (AI MCQ + Classico)
 *
 * Modalità disponibili:
 *   • Classico  — usa le risposte degli altri mazzi come distrattori (offline, istantaneo)
 *   • AI Challenge — Gemini genera 3 distrattori plausibili per ogni domanda (online)
 *
 * Dipendenze iniettate tramite init():
 *   state, showToast, awardXP, gState, saveGState, earnBadge, checkBadges
 */

import { fisherYatesShuffle, escapeHTML } from '../js/utils.js';
import { SecurityManager, getFunctions, callGeminiProxy } from '../services/firebase.js';
import { discoverGeminiModel } from '../services/ai.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

let _ctx = {};
export function init(ctx) {
    _ctx = ctx;
    // Espone startQuiz su window per gli onclick inline nei template HTML
    window.startQuiz  = startQuiz;
    window.closeQuiz  = closeQuiz;
    window.answerQuiz = answerQuiz;
}

let quizState = { qs: [], idx: 0, score: 0, deckIdx: null, mode: 'classic', timer: null, timeLeft: 15 };

// Numero di domande scelto dall'utente nel selettore (default 10, cap alla dimensione del mazzo)
let _quizCount = 10;
window.__setQuizCount = function(n, el) {
    _quizCount = n;
    document.querySelectorAll('.quiz-count-chip').forEach(c => {
        c.style.background = 'var(--surface2)';
        c.style.borderColor = 'var(--border)';
        c.style.color = 'var(--text)';
    });
    if (el) {
        el.style.background = 'var(--accent)';
        el.style.borderColor = 'var(--accent)';
        el.style.color = '#fff';
    }
};

// ─── Distrattori intelligenti (Classico) ────────────────────────────────────
// Prima i distrattori erano risposte a caso di ALTRE carte: spesso di tipo
// completamente diverso (un numero vs una definizione) → esclusione immediata.
// Ora scegliamo distrattori "simili" alla risposta corretta (stesso tipo
// numerico/testo e lunghezza vicina), così le opzioni riguardano davvero la domanda.
function _answerShape(s) {
    s = String(s == null ? '' : s).trim();
    const digits = s.replace(/[^0-9]/g, '').length;
    const isNum  = digits >= 1 && digits >= s.replace(/\s/g, '').length * 0.4;
    return { isNum, len: s.length };
}
function _pickDistractors(correct, pool) {
    const cs   = _answerShape(correct);
    const uniq = [...new Set(pool.filter(x => x && x !== correct))];
    const scored = uniq.map(x => {
        const xs = _answerShape(x);
        const score = (xs.isNum === cs.isNum ? 100 : 0) - Math.abs(xs.len - cs.len);
        return { x, score };
    }).sort((a, b) => b.score - a.score);
    // prendi i ~6 candidati più affini, poi scegline 3 a caso (varietà tra un tentativo e l'altro)
    const top    = scored.slice(0, Math.max(3, Math.min(6, scored.length)));
    const chosen = fisherYatesShuffle(top.map(s => s.x)).slice(0, 3);
    if (chosen.length < 3) {
        const rest = fisherYatesShuffle(uniq.filter(x => !chosen.includes(x)));
        while (chosen.length < 3 && rest.length) chosen.push(rest.pop());
    }
    return chosen;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function startQuiz(deckIdx) {
    const deck = _ctx.state.decks[deckIdx];
    if (!deck || !deck.cards || deck.cards.length < 4) {
        _ctx.showToast('❗ Servono almeno 4 flashcard per il quiz.', 'error');
        return;
    }

    // Bug "Quiz morto": #quiz-overlay era sparito da app.html col redesign,
    // getElementById tornava null e il click falliva in silenzio
    // (dopo aver gia' consumato la chiamata AI). Crealo on-demand.
    let overlay = document.getElementById('quiz-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'quiz-overlay';
        overlay.className = 'glass';
        overlay.style.cssText = 'display:none; position:fixed; inset:0; z-index:2100;' +
            ' align-items:center; justify-content:center; padding:20px;' +
            ' background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); overflow:auto;';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    overlay.innerHTML = _buildModeSelector(deckIdx, deck);
}

// ─── Mode Selector ────────────────────────────────────────────────────────────

function _buildModeSelector(deckIdx, deck) {
    const hasKey = !!window._fbLoggedIn || !!SecurityManager.getApiKey();

    // Selettore numero domande: opzioni valide in base alla dimensione del mazzo
    const _dn = deck.cards.length;
    let _cnts = [5, 10, 20].filter(v => v < _dn);
    _cnts.push(_dn);                     // "Tutte"
    _cnts = [...new Set(_cnts)];
    if (!_cnts.includes(_quizCount)) {
        _quizCount = _cnts.find(v => v >= 10) || _cnts[_cnts.length - 1];
    }
    const chipStyle = (active) =>
        `padding:8px 16px;border-radius:20px;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};` +
        `background:${active ? 'var(--accent)' : 'var(--surface2)'};color:${active ? '#fff' : 'var(--text)'};` +
        `font-family:inherit;font-weight:700;font-size:0.85rem;cursor:pointer;`;
    const countRow = _cnts.length <= 1 ? '' : `
        <div style="display:flex;flex-direction:column;gap:10px;align-items:center;">
            <span style="font-size:0.8rem;color:var(--text-muted);font-weight:700;">Quante domande?</span>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                ${_cnts.map(v => `
                    <button class="quiz-count-chip" onclick="window.__setQuizCount(${v},this)"
                        style="${chipStyle(v === _quizCount)}">${v === _dn ? 'Tutte' : v}</button>`).join('')}
            </div>
        </div>`;

    return `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;text-align:center;gap:24px;">
        <div style="font-size:2.8rem;">🧠</div>
        <h2 style="font-size:1.6rem;font-weight:900;margin:0;">${t('quiz_choose_mode')}</h2>
        <p style="color:var(--text-muted);font-size:0.9rem;margin:0;">${deck.name} · ${deck.cards.length} carte</p>

        ${countRow}

        <div style="display:flex;flex-direction:column;gap:14px;width:100%;max-width:360px;">

            <!-- Classico -->
            <button onclick="window.__quizStartClassic(${deckIdx})" style="
                padding:20px 24px;background:var(--surface2);border:1px solid var(--border);
                border-radius:16px;color:var(--text);font-family:inherit;cursor:pointer;
                text-align:left;transition:border-color 0.2s,transform 0.15s;
                display:flex;align-items:center;gap:16px;">
                <span style="font-size:2rem;">🃏</span>
                <div>
                    <div style="font-weight:800;font-size:1rem;margin-bottom:3px;">${t('quiz_classic')}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">${t('quiz_classic_desc')}</div>
                </div>
            </button>

            <!-- AI Challenge -->
            <button onclick="window.__quizStartAI(${deckIdx})" ${!hasKey ? 'disabled' : ''} style="
                padding:20px 24px;
                background:${hasKey ? 'linear-gradient(135deg,rgba(124,106,247,0.15),rgba(16,185,129,0.1))' : 'var(--surface2)'};
                border:1px solid ${hasKey ? 'rgba(124,106,247,0.4)' : 'var(--border)'};
                border-radius:16px;color:${hasKey ? 'var(--text)' : 'var(--text-muted)'};
                font-family:inherit;cursor:${hasKey ? 'pointer' : 'not-allowed'};
                text-align:left;transition:border-color 0.2s,transform 0.15s;
                display:flex;align-items:center;gap:16px;">
                <span style="font-size:2rem;">🤖</span>
                <div>
                    <div style="font-weight:800;font-size:1rem;margin-bottom:3px;">
                        AI Challenge
                        <span style="font-size:0.7rem;padding:2px 8px;background:rgba(124,106,247,0.2);
                            color:var(--accent);border-radius:20px;margin-left:6px;vertical-align:middle;">GEMINI</span>
                    </div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">
                        ${hasKey
                            ? t('quiz_ai_desc')
                            : t('quiz_ai_locked')}
                    </div>
                </div>
            </button>
        </div>

        <button onclick="closeQuiz()" style="
            padding:10px 24px;background:transparent;border:1px solid var(--border);
            border-radius:10px;color:var(--text-muted);font-family:inherit;cursor:pointer;
            font-size:0.85rem;">${t('home_cancel')}</button>
    </div>`;
}

// ─── Classico ─────────────────────────────────────────────────────────────────

window.__quizStartClassic = function(deckIdx) {
    const deck = _ctx.state.decks[deckIdx];
    quizState = { qs: [], idx: 0, score: 0, deckIdx, mode: 'classic' };

    const all = fisherYatesShuffle([...deck.cards]);
    const n   = Math.min(_quizCount || all.length, all.length);
    const chosen = all.slice(0, n);
    quizState.qs = chosen.map(p => {
        // pool di distrattori da TUTTO il mazzo (più varietà), poi scelta "intelligente"
        const pool   = all.filter(x => x !== p).map(x => x.a);
        const wrongs = _pickDistractors(p.a, pool);
        const opts   = fisherYatesShuffle([p.a, ...wrongs]);
        return { q: p.q, correct: p.a, opts, img: p.img || null };
    });

    _renderQ();
};

function _startTimer() {
    _stopTimer();
    quizState.timeLeft = 30;
    const bar = document.getElementById('quiz-timer-bar');
    if (bar) {
        bar.style.width = '100%';
        bar.className = 'quiz-timer-bar';
    }
    
    quizState.timer = setInterval(() => {
        quizState.timeLeft--;
        const pct = (quizState.timeLeft / 30) * 100;
        if (bar) {
            bar.style.transition = 'width 1s linear';
            bar.style.width = pct + '%';
            if (quizState.timeLeft <= 4) bar.classList.add('danger');
            else if (quizState.timeLeft <= 8) bar.classList.add('warning');
        }
        
        if (quizState.timeLeft <= 0) {
            _stopTimer();
            // FIX 17/07: NIENTE auto-risposta. Il timer è solo un indicatore di ritmo;
            // l'utente risponde quando vuole (prima "rispondeva da solo" al timeout e
            // mostrava solo la verde, mai la rossa sulla scelta sbagliata).
        }
    }, 1000);
}

function _stopTimer() {
    if (quizState.timer) clearInterval(quizState.timer);
    quizState.timer = null;
}

// ─── AI Challenge ─────────────────────────────────────────────────────────────

window.__quizStartAI = async function(deckIdx) {
    const premium = await (window.isPremiumSafe?.() ?? Promise.resolve(window.isPremium?.()));
    if (!premium) { if (window.showPaywall) window.showPaywall('ai'); return; }
    const deck = _ctx.state.decks[deckIdx];
    quizState = { qs: [], idx: 0, score: 0, deckIdx, mode: 'ai' };

    const _nAI = Math.min(_quizCount || 15, deck.cards.length, 25); // cap 25 per costo/tempo
    _showAILoading(_nAI);

    try {
        const cards = fisherYatesShuffle([...deck.cards]).slice(0, _nAI);
        const aiQs  = await _generateAIDistractors(cards, deck.name);
        quizState.qs = aiQs;
        _renderQ();
    } catch (err) {
        console.error('[Quiz AI] Errore:', err);
        _ctx.showToast('⚠️ AI non disponibile, modalità classica attivata.', 'info');
        window.__quizStartClassic(deckIdx);
    }
};

function _showAILoading(n) {
    document.getElementById('quiz-overlay').innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:40px;">
        <div style="
            width:56px;height:56px;border:3px solid rgba(124,106,247,0.2);
            border-top-color:var(--accent);border-radius:50%;
            animation:spin 0.8s linear infinite;"></div>
        <p style="color:var(--text-muted);font-size:0.95rem;text-align:center;">
            🤖 Gemini sta generando ${n} domande difficili...<br>
            <span style="font-size:0.8rem;opacity:0.6;">Creazione distrattori plausibili in corso</span>
        </p>
    </div>`;
}

async function _generateAIDistractors(cards, deckName) {
    const questionsBlock = cards.map((c, i) =>
        `${i + 1}. Domanda: "${c.q}" | Risposta Corretta: "${c.a}"`
    ).join('\n');

    const prompt = `Sei un generatore di quiz didattici.
Per ogni domanda qui sotto, crea ESATTAMENTE 3 risposte SBAGLIATE ma plausibili (distrattori).
I distrattori devono sembrare corretti a uno studente che non ha studiato bene, ma essere chiaramente errati rispetto alla risposta corretta.
NON ripetere la risposta corretta tra i distrattori.
NON usare "Nessuna delle precedenti" o formule generiche.
Rispondi SOLO con JSON valido, nessun testo aggiuntivo, nessun blocco markdown.

Materia/Mazzo: "${deckName}"

Domande:
${questionsBlock}

Formato risposta:
[
  {"idx": 1, "distractors": ["sbagliato1", "sbagliato2", "sbagliato3"]},
  ...
]`;

    const raw = await _callGemini(prompt);

    // Mappa i distrattori sulle card originali
    const parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    return parsed.map((item, i) => {
        const card = cards[item.idx - 1] || cards[i];
        const opts = fisherYatesShuffle([card.a, ...item.distractors.slice(0, 3)]);
        return { q: card.q, correct: card.a, opts, img: card.img || null };
    });
}

async function _callGemini(prompt) {
    // Proxy se loggato
    if (window._fbLoggedIn) {
        {
            const result = await callGeminiProxy({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4, response_mime_type: 'application/json' }
            });
            const text = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Proxy: risposta vuota');
            return text;
        }
    }

    // Fallback diretto
    const apiKey = SecurityManager.getApiKey();
    if (!apiKey) throw new Error('Nessuna API Key disponibile');
    const model = await discoverGeminiModel(apiKey);
    const res = await fetch(
        `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4, response_mime_type: 'application/json' }
            })
        }
    );
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `Errore ${res.status}`); }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('API diretta: risposta vuota');
    return text;
}

// ─── Render domanda ──────────────────────────────────────────────────────────

function _renderQ() {
    const { qs, idx, mode } = quizState;
    if (idx >= qs.length) { _renderResult(); return; }

    const q   = qs[idx];
    const pct = Math.round((idx / qs.length) * 100);
    const modeLabel = mode === 'ai'
        ? '<span style="font-size:0.7rem;padding:2px 8px;background:rgba(124,106,247,0.15);color:var(--accent);border-radius:20px;">🤖 AI</span>'
        : '<span style="font-size:0.7rem;padding:2px 8px;background:rgba(255,255,255,0.06);color:var(--text-muted);border-radius:20px;">🃏 Classico</span>';

    document.getElementById('quiz-overlay').innerHTML = `
        <div class="quiz-header">
            <button aria-label="Chiudi quiz" onclick="closeQuiz()"
                style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;
                    padding:6px 14px;color:var(--text-muted);cursor:pointer;font-family:inherit;">✕ Chiudi</button>
            <div style="display:flex;align-items:center;gap:8px;">
                ${modeLabel}
                <span style="font-weight:700;color:var(--text-muted);font-size:0.85rem;">${idx + 1} / ${qs.length}</span>
            </div>
        </div>
        <div class="quiz-progress"><div class="quiz-progress-bar" style="width:${pct}%"></div></div>
        <div class="quiz-timer"><div id="quiz-timer-bar" class="quiz-timer-bar"></div></div>
        ${q.img ? `<img src="${escapeHTML(q.img)}" class="card-img" style="max-height:140px;object-fit:cover;border-radius:12px;margin:0 16px;" alt="${t('quiz_card_img')}" />` : ''}
        <div class="quiz-question">${escapeHTML(q.q)}</div>
        <div class="quiz-options">
            ${q.opts.map((o, i) => `
                <button class="quiz-opt" id="qopt${i}"
                    aria-label="Opzione ${i + 1}: ${escapeHTML(o)}"
                    onclick="answerQuiz(${i},'${encodeURIComponent(o)}','${encodeURIComponent(q.correct)}')"
                    style="text-align:left;">
                    <span style="display:inline-block;width:24px;height:24px;border-radius:50%;
                        background:rgba(255,255,255,0.06);text-align:center;line-height:24px;
                        font-size:0.75rem;font-weight:700;margin-right:10px;flex-shrink:0;">
                        ${['A','B','C','D'][i]}
                    </span>${escapeHTML(o)}
                </button>`).join('')}
        </div>`;

    setTimeout(_startTimer, 100);
}

// ─── Risposta ─────────────────────────────────────────────────────────────────

export function answerQuiz(i, ansEnc, correctEnc) {
    _stopTimer();
    // Guard: se idx è fuori bounds (es. timeout arrivato dopo la fine del quiz) ignora
    if (quizState.idx >= quizState.qs.length) return;
    const ans     = i !== -1 ? decodeURIComponent(ansEnc) : null;
    const correct = i !== -1 ? decodeURIComponent(correctEnc) : (quizState.qs[quizState.idx]?.correct ?? '');
    const opts    = document.querySelectorAll('.quiz-opt');
    opts.forEach(o => o.disabled = true);
    const isCorrect = i !== -1 && ans === correct;

    if (i !== -1) {
        document.getElementById('qopt' + i).classList.add(isCorrect ? 'correct' : 'wrong');
    }
    if (!isCorrect) {
        opts.forEach(o => {
            if (o.textContent.trim().slice(1).trim() === correct) o.classList.add('correct');
        });
    } else {
        quizState.score++;
    }

    const xpBase = quizState.mode === 'ai' ? 15 : 10; // AI mode vale di più
    _ctx.gState.totalCards++;
    _ctx.awardXP(isCorrect ? xpBase : 3, isCorrect ? '✅' : '📚');
    setTimeout(() => { quizState.idx++; _renderQ(); }, 1100);
}

// ─── Risultato ────────────────────────────────────────────────────────────────

function _renderResult() {
    const { qs, score, deckIdx, mode } = quizState;
    const total = qs.length;
    const pct   = Math.round((score / total) * 100);

    const deck = _ctx.state.decks[deckIdx];
    const recordKey = deck.id || deck.name;
    const prevBest  = _ctx.gState.quizRecords[recordKey] || 0;
    let isNewRecord = false;

    if (pct > prevBest) {
        _ctx.gState.quizRecords[recordKey] = pct;
        isNewRecord = true;
    }

    _ctx.gState.quizDone++;
    _ctx.saveGState();
    _ctx.awardXP(score * (mode === 'ai' ? 8 : 5), '🎯 Quiz');
    if (pct === 100) _ctx.earnBadge('quiz_perfect');
    _ctx.checkBadges();

    const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '✅' : pct >= 50 ? '📚' : '🔄';
    const grade = pct >= 90 ? 'Eccellente!'
                : pct >= 70 ? 'Buono!'
                : pct >= 50 ? 'Da ripassare'
                : 'Riprova!';
    
    const recordInfo = isNewRecord 
        ? `<div style="background:rgba(251,191,36,0.1);color:var(--gold);padding:8px 16px;border-radius:12px;font-size:0.85rem;margin:8px 0;border:1px solid rgba(251,191,36,0.2);">🌟 NUOVO RECORD PERSONALE!</div>`
        : `<div style="color:var(--text-muted);font-size:0.8rem;margin:8px 0;">Record precedente: ${prevBest}%</div>`;

    const aiBonus = mode === 'ai' ? `<p style="color:var(--accent);font-size:0.8rem;margin:4px 0 0;">🤖 Bonus AI Challenge attivo — XP aumentati!</p>` : '';

    // Handler di condivisione risultato — registrato come closure prima del render
    const deckTitle = deck.title || deck.name || 'Quiz';
    const recordLine = isNewRecord ? '\n🌟 Nuovo record personale!' : '';
    const modeLabel  = mode === 'ai' ? ' (AI Challenge)' : '';
    const shareText  = `Quiz${modeLabel} su "${deckTitle}": ${pct}% di accuratezza 🎯${recordLine}\n${score}/${total} risposte corrette su Cortex 🧠\ncortexapp.it\n#Cortex #StudyTok #Quiz #Studenti`;
    window._shareQuizResult = async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: `Quiz ${pct}% — Cortex`, text: shareText });
            } else {
                await navigator.clipboard.writeText(shareText);
                _ctx.showToast?.('📋 Risultato copiato! Incollalo dove vuoi 🚀', 'success');
            }
        } catch (e) {
            try { await navigator.clipboard.writeText(shareText); } catch {}
        }
    };

    document.getElementById('quiz-overlay').innerHTML = `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center;">
            <div style="font-size:4rem;margin-bottom:16px;">${emoji}</div>
            <h2 style="font-size:2rem;font-weight:900;margin-bottom:8px;">${pct}%</h2>
            <p style="font-size:1.2rem;font-weight:700;margin-bottom:8px;">${grade}</p>
            ${recordInfo}
            <p style="color:var(--text-muted);margin-bottom:16px;">${score} su ${total} corrette</p>
            ${aiBonus}
            <div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap;justify-content:center;">
                <button aria-label="Riprova il quiz" onclick="startQuiz(${quizState.deckIdx})" style="padding:12px 20px;background:var(--accent);border:none;border-radius:12px;color:#fff;font-family:inherit;font-weight:700;font-size:1rem;cursor:pointer;">🔄 Riprova</button>
                <button aria-label="Condividi risultato" onclick="window._shareQuizResult && window._shareQuizResult()" style="padding:12px 20px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;color:var(--text);font-family:inherit;font-weight:700;font-size:1rem;cursor:pointer;">📤 Condividi</button>
                <button aria-label="Chiudi il quiz" onclick="closeQuiz()" style="padding:12px 20px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;color:var(--text);font-family:inherit;font-weight:700;font-size:1rem;cursor:pointer;">✕ Chiudi</button>
            </div>
            <p style="margin-top:20px;color:var(--gold);font-size:0.85rem;">+${score * (mode === 'ai' ? 8 : 5) + score * (mode === 'ai' ? 8 : 5)} XP guadagnati!</p>
        </div>`;
}

// ─── Close ────────────────────────────────────────────────────────────────────

export function closeQuiz() {
    const overlay = document.getElementById('quiz-overlay');
    if (overlay) overlay.style.display = 'none';
}
