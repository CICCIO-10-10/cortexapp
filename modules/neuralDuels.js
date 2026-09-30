/**
 * modules/neuralDuels.js — Neural Duels 1v1
 * Real-time multiplayer flashcard battles using Firestore onSnapshot.
 */

import { getFirestoreDB, getFunctions } from '../services/firebase.js';
import { TRANSLATIONS } from '../data/translations.js';
import { t } from '../core/i18n.js';
const _t = () => (TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it);

const _getLang = () => localStorage.getItem('mm_lang') || 'it';

let _deps = {
    state: null,
    showToast: null,
    awardXP: null
};

export function init(deps) {
    Object.assign(_deps, deps);
}

let currentDuelUnsubscribe = null;
let duelState = null;

export async function openNeuralDuels() {
    if (!window._fbLoggedIn) {
        if (window.showToast) window.showToast('Accedi con Google per giocare a Neural Duels.', 'error');
        return;
    }
    // Gate: Neural Duels è una funzione Student
    // Usa isPremiumSafe per evitare falsi negativi prima che il cloud sync completi
    const premium = await (window.isPremiumSafe?.() ?? Promise.resolve(window.isPremium?.()));
    if (!premium) {
        if (window.showPaywall) window.showPaywall('duels');
        return;
    }

    injectDuelUI();
    const overlay = document.getElementById('duel-overlay');
    overlay.style.display = 'flex';
    
    document.getElementById('duel-status').innerText = 'Pronto a combattere ⚔️';
    document.getElementById('duel-matchmake-btn').style.display = 'block';
    document.getElementById('duel-arena').style.display = 'none';
}

// ── NEUROBOT (15/07/2026) ─────────────────────────────────────────────────────
// Con pochi utenti online l'Arena era una sala d'attesa infinita: se dopo
// 12s nessuno entra, si presenta 🤖 NeuroBot — risponde con tempi umani
// (3-7s) e precisione ~62%, così il duello è SEMPRE giocabile.
let _botWaitTimer = null;
let _botAnswerTimer = null;
let _botScheduledIdx = -1;

function _botCleanup() {
    if (_botWaitTimer)   { clearTimeout(_botWaitTimer);   _botWaitTimer = null; }
    if (_botAnswerTimer) { clearTimeout(_botAnswerTimer); _botAnswerTimer = null; }
    _botScheduledIdx = -1;
}

async function _attivaBot(duelId) {
    _botWaitTimer = null;
    try {
        await getFunctions().httpsCallable('startNeuralDuelBot')({ duelId });
    } catch (e) {
        console.error('[NeuroBot] attivazione fallita:', e);
    }
}

function _gestisciBot(state) {
    // Orchestrato dal client di player1 (il creatore della stanza)
    if (!state || state.player1?.id !== window._fbUserId) return;
    if (state.status === 'playing' && state.player2 && !state.player2.bot && _botWaitTimer) {
        // è entrato un umano prima del bot: annulla l'ingresso del bot
        clearTimeout(_botWaitTimer); _botWaitTimer = null;
    }
    if (state.status !== 'playing' || !state.player2?.bot) {
        if (state.status === 'finished') _botCleanup();
        return;
    }
    const idx = state.questionIndex || 0;
    if (idx === _botScheduledIdx) return;           // già programmata per questa domanda
    if (_botAnswerTimer) clearTimeout(_botAnswerTimer);
    _botScheduledIdx = idx;
    const delay = Math.max(250, Number(state.botNextAt || Date.now()) - Date.now() + 250);
    _botAnswerTimer = setTimeout(async () => {
        try {
            await getFunctions().httpsCallable('submitNeuralDuelAnswer')({ duelId: state.id, questionIndex: idx, botTurn: true });
        } catch (e) {
            console.error('[NeuroBot] risposta fallita:', e);
        }
    }, delay);
}

export async function startMatchmaking() {
    const db = getFirestoreDB();
    if (!db) {
        if (window.showToast) window.showToast(t('duels_err_db'), 'error');
        return;
    }

    document.getElementById('duel-status').innerText = 'Ricerca avversario... ⏳';
    document.getElementById('duel-matchmake-btn').style.display = 'none';

    try {
        const userId = window._fbUserId;
        const userName = localStorage.getItem('mm_user_name') || 'Guest';
        const duelsRef = db.collection('duels');
        const match = await getFunctions().httpsCallable('createOrJoinNeuralDuel')({ name: userName });
        const duelId = match.data.duelId;
        if (!match.data.joined) {
            // Nessuno in coda: se entro 12s non arriva un umano, entra NeuroBot
            _botWaitTimer = setTimeout(() => _attivaBot(duelId), 12000);
        }

        // Ascolta i cambiamenti in tempo reale
        currentDuelUnsubscribe = duelsRef.doc(duelId).onSnapshot(doc => {
            if (doc.exists) {
                duelState = doc.data();
                duelState.id = doc.id;
                _gestisciBot(duelState);
                renderDuelState(duelState);
            }
        });

    } catch (e) {
        console.error('Matchmaking error:', e);
        document.getElementById('duel-status').innerText = t('err_connection_retry');
        document.getElementById('duel-matchmake-btn').style.display = 'block';
    }
}

function renderDuelState(state) {
    if (state.status === 'waiting') {
        document.getElementById('duel-status').innerText = 'In attesa dell\'avversario...';
    } else if (state.status === 'playing') {
        document.getElementById('duel-status').style.display = 'none';
        document.getElementById('duel-arena').style.display = 'flex';
        
        // Update scores
        const p1 = state.player1;
        const p2 = state.player2;
        const userId = window._fbUserId;
        
        const isP1 = p1.id === userId;
        const myPlayer = isP1 ? p1 : p2;
        const oppPlayer = isP1 ? p2 : p1;

        document.getElementById('my-score-label').innerText = `${myPlayer.name}: ${myPlayer.score}`;
        document.getElementById('opp-score-label').innerText = `${oppPlayer.name}: ${oppPlayer.score}`;

        // Render question
        const qArea = document.getElementById('duel-question');
        const _qh3 = document.createElement('h3');
        _qh3.textContent = state.currentQuestion.q;
        qArea.innerHTML = '';
        qArea.appendChild(_qh3);
        
        const opts = document.getElementById('duel-options');
        opts.innerHTML = '';
        state.currentQuestion.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-outline';
            btn.innerText = opt;
            btn.onclick = () => submitDuelAnswer(state.id, state.questionIndex || 0, opt);
            opts.appendChild(btn);
        });
    } else if (state.status === 'finished') {
        document.getElementById('duel-status').style.display = 'none';
        document.getElementById('duel-arena').style.display = 'flex';
        
        const userId = window._fbUserId;
        const p1 = state.player1;
        const p2 = state.player2;
        const isP1 = p1.id === userId;
        const amIWinner = state.winner === (isP1 ? 'player1' : 'player2');
        
        const qArea = document.getElementById('duel-question');
        qArea.innerHTML = `<h2 style="font-size:3rem; margin-bottom:10px;">${amIWinner ? (_t().victory||'🏆 Vittoria!') : (_t().defeat||'💀 Sconfitta')}</h2><p style="color:var(--text-muted); font-size:1.2rem;">${amIWinner ? '+100 XP' : (_t().defeat_msg||'Bel tentativo, sarai più fortunato.')}</p>`;
        
        const opts = document.getElementById('duel-options');
        opts.innerHTML = '';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-primary';
        closeBtn.style.gridColumn = '1 / -1';
        closeBtn.innerText = 'Esci dall\'Arena';
        closeBtn.onclick = () => window.closeNeuralDuels();
        opts.appendChild(closeBtn);
        
        if (amIWinner && !state._xpAwarded) {
             state._xpAwarded = true; // client-side flag
             if (typeof _deps.awardXP === 'function') _deps.awardXP(100, 'Campione Duel Arena');
             else if (typeof window.awardXP === 'function') window.awardXP(100, 'Campione Duel Arena');
        }
    }
}

async function submitDuelAnswer(duelId, questionIndex, answer) {
    try {
        const response = await getFunctions().httpsCallable('submitNeuralDuelAnswer')({ duelId, questionIndex, answer });
        if (response.data.accepted && !response.data.correct && window.showToast) window.showToast('Sbagliato! ❌', 'error');
    } catch(e) {
        console.error('[NeuralDuels] invio risposta:', e);
        if (window.showToast) window.showToast('Non è stato possibile inviare la risposta.', 'error');
    }
}

export function closeNeuralDuels() {
    _botCleanup();
    if (currentDuelUnsubscribe) currentDuelUnsubscribe();
    currentDuelUnsubscribe = null;
    
    if (duelState && duelState.status === 'waiting' && duelState.player1.id === window._fbUserId) {
        getFunctions().httpsCallable('cancelNeuralDuelLobby')({ duelId: duelState.id }).catch(()=> { /* ignore */ });
    }
    
    duelState = null;
    const overlay = document.getElementById('duel-overlay');
    if (overlay) overlay.style.display = 'none';
}

// Pool condiviso di domande — UGUALE per entrambi i giocatori.
// Indicizzato deterministicamente (questionIndex in Firestore) così entrambi
// leggono la stessa domanda dallo snapshot, senza generazione locale.
const SHARED_QUESTIONS = [
    { q: "Quale neurotrasmettitore è associato al reward system?", a: "Dopamina", options: ["Serotonina", "Dopamina", "GABA", "Acetilcolina"] },
    { q: "Parte del cervello per la memoria a lungo termine?", a: "Ippocampo", options: ["Amigdala", "Ippocampo", "Corteccia visiva", "Cervelletto"] },
    { q: "Cos'è l'Apoptosi?", a: "Morte cellulare programmata", options: ["Morte cellulare programmata", "Divisione cellulare", "Sintesi proteica", "Necrosi casuale"] },
    { q: "Quale organo produce l'insulina?", a: "Pancreas", options: ["Fegato", "Rene", "Pancreas", "Milza"] },
    { q: "Quante ossa ha il corpo umano adulto?", a: "206", options: ["206", "213", "180", "256"] },
    { q: "Cos'è la mitosi?", a: "Divisione cellulare somatica", options: ["Divisione cellulare somatica", "Riproduzione sessuale", "Trascrizione del DNA", "Traduzione proteica"] },
    { q: "Chi ha formulato la teoria della relatività generale?", a: "Einstein", options: ["Newton", "Einstein", "Bohr", "Heisenberg"] },
    { q: "Quanti cromosomi ha una cellula umana normale?", a: "46", options: ["23", "46", "48", "92"] },
    { q: "Cos'è l'osmosi?", a: "Passaggio di solvente attraverso membrana semipermeabile", options: ["Passaggio di solvente attraverso membrana semipermeabile", "Diffusione di soluto", "Trasporto attivo", "Endocitosi"] },
    { q: "In quale organo avviene la sintesi della bile?", a: "Fegato", options: ["Pancreas", "Rene", "Fegato", "Stomaco"] },
    { q: "Cosa studia la neurologia?", a: "Il sistema nervoso", options: ["Il sistema circolatorio", "Il sistema nervoso", "Il sistema endocrino", "Il sistema immunitario"] },
    { q: "Cos'è il teorema di Pitagora?", a: "a² + b² = c²", options: ["a² + b² = c²", "a + b = c", "a × b = c²", "a² - b² = c²"] },
];

function getSharedQuestion(index) {
    const { q, options } = SHARED_QUESTIONS[index % SHARED_QUESTIONS.length];
    return { q, options };
}

function injectDuelUI() {
    if (document.getElementById('duel-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'duel-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(10, 10, 15, 0.95); backdrop-filter: blur(20px);
        display: none; align-items: center; justify-content: center;
        flex-direction: column;
    `;

    overlay.innerHTML = `
        <button onclick="window.closeNeuralDuels()" style="position:absolute; top:20px; right:20px; background:none; border:none; color:white; font-size:2rem; cursor:pointer;">✕</button>
        <div style="text-align:center; max-width:600px; width:100%;">
            <div style="font-size:4rem; margin-bottom:16px;">⚔️</div>
            <h2 style="font-family:'Outfit'; font-size:2.5rem; font-weight:800; margin-bottom:24px; color:white;">Neural Duels</h2>
            
            <p id="duel-status" style="font-size:1.2rem; color:var(--text-muted); margin-bottom:32px;">Caricamento...</p>
            <button id="duel-matchmake-btn" class="btn btn-primary" onclick="window.startMatchmaking()" style="padding:16px 40px; font-size:1.2rem; border-radius:100px; box-shadow:0 10px 30px var(--accent-glow); margin:0 auto; display:none;">Cerca Avversario 👀</button>

            <div id="duel-arena" style="display:none; flex-direction:column; gap:24px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:32px; padding:32px;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:16px;">
                    <div id="my-score-label" style="font-size:1.2rem; font-weight:bold; color:var(--accent);">Tu: 0</div>
                    <div id="opp-score-label" style="font-size:1.2rem; font-weight:bold; color:var(--red);">Avversario: 0</div>
                </div>
                <div id="duel-question" style="font-size:1.5rem; color:white; min-height:80px; display:flex; align-items:center; justify-content:center;"></div>
                <div id="duel-options" style="display:grid; grid-template-columns:1fr 1fr; gap:16px;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

export function registerDuelsGlobals(registry) {
    registry('openNeuralDuels', openNeuralDuels);
    window.startMatchmaking = startMatchmaking;
    window.closeNeuralDuels = closeNeuralDuels;
}
