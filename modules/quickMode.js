import { t } from '../core/i18n.js';
/**
 * modules/quickMode.js — Quick Mode (Swipe Study)
 *
 * Interfaccia TikTok-style per sessioni rapide 5-15 minuti.
 * Una card a schermo intero, swipe/bottoni per sapevo/non sapevo.
 * Se l'utente non ha mazzi → mostra card demo + banner upload materiale.
 */

import { gState, awardXP } from './gamification.js';
import { showToast } from '../core/ui.js';
import { processAnswer } from '../services/srs.js';
import { registry } from '../core/registry.js';

// ── Card demo per utenti senza mazzi ─────────────────────────────────────────
const DEMO_CARDS = [
    { subject: 'Esempio — Anatomia', question: 'Qual è la funzione principale del muscolo cardiaco?', answer: 'Pompare il sangue in tutto il corpo tramite contrazioni ritmiche autonome.' },
    { subject: 'Esempio — Storia', question: 'In che anno cadde il Muro di Berlino?', answer: 'Il 9 novembre 1989.' },
    { subject: 'Esempio — Diritto', question: 'Cosa si intende per capacità giuridica?', answer: 'L\'idoneità di un soggetto ad essere titolare di diritti e doveri giuridici.' },
    { subject: 'Esempio — Matematica', question: 'Cos\'è la derivata di una funzione?', answer: 'Il limite del rapporto incrementale: rappresenta il tasso di variazione istantaneo.' },
    { subject: 'Esempio — Filosofia', question: 'Qual è il principio fondamentale del cogito cartesiano?', answer: '"Cogito ergo sum" — penso dunque sono. La certezza del pensiero come fondamento della conoscenza.' },
];

// ── Stato interno ─────────────────────────────────────────────────────────────
let _state = {
    cards: [],
    index: 0,
    flipped: false,
    ok: 0,
    no: 0,
    xp: 0,
    timer: null,
    seconds: 600, // 10 min default
    isDemo: false,
    touchStartY: 0,
};

// BUG FIX "Quick Mode mostra solo card di esempio": leggeva gState.decks,
// ma gState e' lo stato della GAMIFICATION (xp/badge) e non ha mai avuto
// i mazzi. I mazzi veri vivono nello state principale.
function _realDecks() {
    const st = (typeof window._legacyState === 'function') ? window._legacyState() : window.state;
    return (st && st.decks) ? st.decks : [];
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function openQuickMode() {
    const decks = _realDecks();
    // Se non ci sono mazzi → demo diretta
    if (decks.length === 0) {
        _state.isDemo = true;
        _state.cards  = DEMO_CARDS;
        _resetState();
        _render();
        return;
    }
    // Se c'è un solo mazzo → avvia direttamente su quello
    if (decks.length === 1) {
        _startWithDeck(decks[0]);
        return;
    }
    // Più mazzi → mostra selettore materia
    _showSubjectPicker(decks);
}

function _resetState() {
    _state.index   = 0;
    _state.flipped = false;
    _state.ok      = 0;
    _state.no      = 0;
    _state.xp      = 0;
    _state.seconds = 600;
}

function _startWithDeck(deck) {
    const now   = Date.now();
    const cards = (deck.cards || [])
        .filter(c => {
            const due = c.nextReview ? new Date(c.nextReview).getTime() : 0;
            return due <= now;
        })
        .map(c => ({
            subject:  deck.name || 'Materia',
            question: c.q || c.front || c.question || '',
            answer:   c.a || c.back  || c.answer   || '',
            _deckIdx: _realDecks().indexOf(deck),
            _cardId:  c.id,
        }));
    _state.isDemo = cards.length === 0;
    _state.cards  = _state.isDemo ? DEMO_CARDS : cards;
    _resetState();
    _render();
}

function _showSubjectPicker(decks) {
    let overlay = document.getElementById('quick-mode-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'quick-mode-overlay';
        document.body.appendChild(overlay);
    }
    overlay.style.cssText = _qmOverlayCss();

    const items = decks.map((d, i) => {
        const now = Date.now();
        const due = (d.cards || []).filter(c => {
            const t2 = c.nextReview ? new Date(c.nextReview).getTime() : 0;
            return t2 <= now;
        }).length;
        return `
        <button data-deck="${i}" style="
            width:100%; text-align:left; background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.07); border-radius:18px;
            padding:18px 20px; cursor:pointer; transition:background 0.15s;
            display:flex; align-items:center; justify-content:space-between;
        " onmouseenter="this.style.background='rgba(124,58,237,0.12)'"
          onmouseleave="this.style.background='rgba(255,255,255,0.03)'">
            <div>
                <div style="color:#fff; font-size:1rem; font-weight:700;">${d.name || 'Materia ' + (i+1)}</div>
                <div style="color:rgba(255,255,255,0.4); font-size:0.78rem; margin-top:2px;">${(d.cards||[]).length} card totali</div>
            </div>
            <div style="background:rgba(124,58,237,0.18); color:#a78bfa; font-size:0.75rem; font-weight:700; padding:4px 10px; border-radius:20px; white-space:nowrap;">
                ${due > 0 ? due + ' da ripassare' : 'nessuna scaduta'}
            </div>
        </button>`;
    }).join('');

    overlay.innerHTML = _qmCard(`
        <div style="display:flex; align-items:center; justify-content:space-between; padding:20px 20px 12px;">
            <button id="qm-close" style="background:none; border:none; color:rgba(255,255,255,0.5); font-size:22px; cursor:pointer; padding:4px 8px;">✕</button>
            <div style="text-align:center;">
                <div style="color:#a78bfa; font-size:13px; font-weight:700; letter-spacing:1px;">QUICK MODE</div>
            </div>
            <div style="width:36px;"></div>
        </div>
        <div style="flex:1; overflow-y:auto; padding:8px 20px 32px;">
            <h2 style="color:#fff; font-size:1.4rem; font-weight:800; margin-bottom:6px;">Scegli la materia</h2>
            <p style="color:rgba(255,255,255,0.4); font-size:0.85rem; margin-bottom:24px;">Le card scadute di questa materia verranno mostrate.</p>
            <div style="display:flex; flex-direction:column; gap:12px;">
                ${items}
                <button id="qm-all-btn" style="
                    width:100%; text-align:left; background:rgba(124,58,237,0.08);
                    border:1px solid rgba(124,58,237,0.3); border-radius:18px;
                    padding:18px 20px; cursor:pointer; color:#a78bfa;
                    font-size:0.95rem; font-weight:700;
                ">⚡ Tutte le materie</button>
            </div>
        </div>
    `);

    // Chiudi
    overlay.querySelector('#qm-close').onclick = () => overlay.remove();

    // Click su singolo mazzo
    overlay.querySelectorAll('[data-deck]').forEach(btn => {
        btn.onclick = () => _startWithDeck(decks[parseInt(btn.dataset.deck)]);
    });

    // Tutte le materie
    overlay.querySelector('#qm-all-btn').onclick = () => {
        const allCards = _getScadedCards();
        _state.isDemo = allCards.length === 0;
        _state.cards  = _state.isDemo ? DEMO_CARDS : allCards;
        _resetState();
        _render();
    };
}

// ── Raccoglie card scadute SRS ────────────────────────────────────────────────
function _getScadedCards() {
    const decks = _realDecks();
    const now   = Date.now();
    const out   = [];
    for (const deck of decks) {
        const cards = deck.cards || [];
        for (const card of cards) {
            const due = card.nextReview ? new Date(card.nextReview).getTime() : 0;
            if (due <= now) {
                out.push({
                    subject:  deck.name || 'Materia',
                    question: card.q || card.front || card.question || '',
                    answer:   card.a || card.back  || card.answer   || '',
                    _deckIdx: _realDecks().indexOf(deck),
                    _cardId:  card.id,
                });
            }
        }
    }
    // Ordina per urgenza (più vecchie prima)
    out.sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
    return out;
}

// ── Card centrata (17/07/2026): il Quick Mode non è più fullscreen — stessa
// taglia del modal Simulazione TOLC (940px), overlay scuro sfocato dietro.
function _qmOverlayCss() {
    return "position:fixed;inset:0;z-index:99999;background:rgba(3,3,6,0.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:'Outfit',Arial,sans-serif;";
}
function _qmCard(inner, fixedH) {
    return '<div style="width:min(94vw,940px);' + (fixedH ? 'height:min(92vh,820px);' : 'max-height:92vh;') + 'overflow-y:auto;background:#0A0A14;border:1px solid rgba(168,85,247,0.28);border-radius:22px;box-shadow:0 40px 120px rgba(168,85,247,0.18);display:flex;flex-direction:column;">' + inner + '</div>';
}

// ── Render principale ─────────────────────────────────────────────────────────
function _render() {
    // Crea overlay fullscreen sopra tutto
    let overlay = document.getElementById('quick-mode-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'quick-mode-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = _qmCard(_html(), true);
    overlay.style.cssText = _qmOverlayCss();

    _bindEvents(overlay);
    _startTimer();
    _updateCard();
}

// ── HTML scheletro ────────────────────────────────────────────────────────────
function _html() {
    return `
    <!-- TOP BAR -->
    <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px 8px;">
        <button id="qm-close" style="background:none; border:none; color:rgba(255,255,255,0.5); font-size:22px; cursor:pointer; padding:4px 8px;">✕</button>
        <div style="text-align:center;">
            <div id="qm-timer" style="color:#a78bfa; font-size:15px; font-weight:700;">10:00</div>
            <div style="color:rgba(255,255,255,0.3); font-size:10px; letter-spacing:1px;">QUICK MODE</div>
        </div>
        <div id="qm-xp-badge" style="background:rgba(124,58,237,0.2); color:#a78bfa; font-size:13px; font-weight:700; padding:6px 12px; border-radius:20px;">0 XP</div>
    </div>

    <!-- PROGRESS BAR -->
    <div style="margin:0 20px; height:3px; background:rgba(255,255,255,0.08); border-radius:2px;">
        <div id="qm-fill" style="height:3px; background:#7C3AED; border-radius:2px; width:0%; transition:width 0.3s;"></div>
    </div>

    <!-- STATS ROW -->
    <div style="display:flex; justify-content:center; gap:32px; padding:10px 20px 4px;">
        <div style="text-align:center;">
            <div id="qm-ok" style="color:#10b981; font-size:20px; font-weight:800;">0</div>
            <div style="color:rgba(255,255,255,0.3); font-size:10px;">Sapevo</div>
        </div>
        <div style="text-align:center;">
            <div id="qm-no" style="color:#ef4444; font-size:20px; font-weight:800;">0</div>
            <div style="color:rgba(255,255,255,0.3); font-size:10px;">Ripassare</div>
        </div>
        <div style="text-align:center;">
            <div id="qm-counter" style="color:var(--text); font-size:20px; font-weight:800;">0/0</div>
            <div style="color:rgba(255,255,255,0.3); font-size:10px;">${t('qm_card_label')}</div>
        </div>
    </div>

    ${_state.isDemo ? `
    <!-- BANNER DEMO -->
    <div style="margin:8px 16px; background:rgba(124,58,237,0.12); border:1px solid rgba(124,58,237,0.3); border-radius:14px; padding:12px 16px; display:flex; align-items:center; gap:10px;">
        <span style="font-size:20px;">📂</span>
        <div style="flex:1;">
            <div style="color:#a78bfa; font-size:12px; font-weight:700; margin-bottom:2px;">${t('qm_demo_title')}</div>
            <div style="color:rgba(255,255,255,0.5); font-size:11px;">${t('qm_demo_hint')}</div>
        </div>
        <button id="qm-upload-btn" style="background:#7C3AED; border:none; border-radius:10px; color:#fff; font-size:11px; font-weight:700; padding:8px 12px; cursor:pointer; white-space:nowrap;">${t('qm_upload_btn')}</button>
    </div>
    ` : ''}

    <!-- CARD AREA -->
    <div style="flex:1; display:flex; align-items:center; justify-content:center; padding:12px 20px; position:relative;">
        <!-- XP popup -->
        <div id="qm-xp-pop" style="position:absolute; top:16px; right:24px; color:#a78bfa; font-size:18px; font-weight:800; opacity:0; transition:all 0.5s; pointer-events:none;">+10 XP</div>

        <!-- Flash card -->
        <div id="qm-card" style="
            background: rgba(18,18,42,0.95);
            border: 1px solid rgba(124,58,237,0.25);
            border-radius: 28px;
            padding: 32px 28px;
            width: 100%;
            max-width: 440px;
            min-height: 220px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.15s;
            position: relative;
            touch-action: none;
        ">
            <div id="qm-subject" style="color:#7C3AED; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; font-weight:700; margin-bottom:14px;"></div>
            <div id="qm-question" style="color:var(--text); font-size:1.1rem; font-weight:600; line-height:1.55; margin-bottom:16px;"></div>
            <div id="qm-answer" style="color:#a78bfa; font-size:0.95rem; line-height:1.5; display:none;"></div>
            <div id="qm-tap-hint" style="color:rgba(255,255,255,0.25); font-size:12px; text-align:center; margin-top:8px;">${t('qm_tap_hint')}</div>
        </div>
    </div>

    <!-- SWIPE HINTS -->
    <div style="display:flex; justify-content:space-between; padding:0 36px 8px;">
        <div style="text-align:center; color:#ef4444; font-size:12px;">
            <div style="font-size:18px;">↓</div>Non lo sapevo
        </div>
        <div style="text-align:center; color:#10b981; font-size:12px;">
            <div style="font-size:18px;">↑</div>Lo sapevo
        </div>
    </div>

    <!-- BOTTONI RISPOSTA -->
    <div style="display:flex; gap:12px; padding:8px 20px 32px;">
        <button id="qm-btn-no" style="
            flex:1; background:rgba(239,68,68,0.12);
            border:1px solid rgba(239,68,68,0.3);
            border-radius:18px; padding:16px;
            color:#f87171; font-size:14px; font-weight:700;
            cursor:pointer; transition:all 0.15s;
        ">${t('qm_btn_no')}</button>
        <button id="qm-btn-ok" style="
            flex:1; background:rgba(16,185,129,0.12);
            border:1px solid rgba(16,185,129,0.3);
            border-radius:18px; padding:16px;
            color:#34d399; font-size:14px; font-weight:700;
            cursor:pointer; transition:all 0.15s;
        ">${t('qm_btn_yes')}</button>
    </div>
    `;
}

// ── Aggiorna card corrente ────────────────────────────────────────────────────
function _updateCard() {
    // Guard: se l'overlay è stato rimosso (es. close durante il setTimeout), esci silenziosamente
    if (!document.getElementById('quick-mode-overlay')) return;

    const cards  = _state.cards;
    const idx    = _state.index % cards.length;
    const card   = cards[idx];
    const total  = Math.min(_state.index + 1, cards.length);

    document.getElementById('qm-subject').textContent  = card.subject;
    document.getElementById('qm-question').textContent = card.question;
    document.getElementById('qm-answer').textContent   = card.answer;
    document.getElementById('qm-answer').style.display = _state.flipped ? 'block' : 'none';
    document.getElementById('qm-tap-hint').style.display = _state.flipped ? 'none' : 'block';
    document.getElementById('qm-counter').textContent  = `${total}/${cards.length}`;
    document.getElementById('qm-fill').style.width     = `${(idx / cards.length) * 100}%`;
    document.getElementById('qm-ok').textContent       = _state.ok;
    document.getElementById('qm-no').textContent       = _state.no;
    document.getElementById('qm-xp-badge').textContent = `${_state.xp} XP`;
}

// ── Flip card ─────────────────────────────────────────────────────────────────
function _flip() {
    _state.flipped = !_state.flipped;
    _updateCard();
}

// ── Risposta utente ───────────────────────────────────────────────────────────
function _answer(knew) {
    if (!_state.flipped) { _flip(); return; } // Prima flip, poi risposta

    if (knew) {
        _state.ok++;
        _state.xp += 10;
        _showXPPop();
        if (!_state.isDemo) {
            _updateSRS(2); // rating 2 = "Sapevo"
        }
    } else {
        _state.no++;
        if (!_state.isDemo) {
            _updateSRS(0); // rating 0 = "Non sapevo"
        }
    }

    _state.index++;
    _state.flipped = false;

    // Controlla se ha finito tutte le card
    if (_state.index >= _state.cards.length && !_state.isDemo) {
        _showRecap(t('qm_all_done'));
        return;
    }

    setTimeout(_updateCard, 120);
}

// ── Aggiorna SRS su gState + salva ───────────────────────────────────────────
function _updateSRS(rating) {
    const qmCard = _state.cards[_state.index % _state.cards.length];
    if (!qmCard || qmCard._deckIdx === undefined || !qmCard._cardId) return;

    const deck = _realDecks()[qmCard._deckIdx];
    if (!deck) return;

    const cardIdx = (deck.cards || []).findIndex(c => c.id === qmCard._cardId);
    if (cardIdx === -1) return;

    deck.cards[cardIdx] = processAnswer(deck.cards[cardIdx], rating);

    // Salva via registry (registrato in main.js)
    if (typeof registry.saveState === 'function') registry.saveState();
}

// ── Popup XP ─────────────────────────────────────────────────────────────────
function _showXPPop() {
    const el = document.getElementById('qm-xp-pop');
    if (!el) return;
    el.style.opacity = '1';
    el.style.transform = 'translateY(-12px)';
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(0)';
    }, 700);
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function _startTimer() {
    if (_state.timer) clearInterval(_state.timer);
    _state.timer = setInterval(() => {
        _state.seconds--;
        const m = Math.floor(_state.seconds / 60);
        const s = _state.seconds % 60;
        const el = document.getElementById('qm-timer');
        if (el) el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
        if (_state.seconds <= 0) {
            clearInterval(_state.timer);
            t('qm_timeout');
        }
    }, 1000);
}

// ── Recap finale ──────────────────────────────────────────────────────────────
function _showRecap(msg) {
    clearInterval(_state.timer);
    const overlay = document.getElementById('quick-mode-overlay');
    if (!overlay) return;

    // Aggiungi XP reale
    if (!_state.isDemo && _state.xp > 0) {
        awardXP(_state.xp, 'quickmode');
    }

    overlay.innerHTML = _qmCard(`
    <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 24px; text-align:center; gap:20px;">
        <div style="font-size:52px;">🎯</div>
        <div style="color:var(--text); font-size:22px; font-weight:800;">${msg}</div>
        <div style="display:flex; gap:24px; margin:8px 0;">
            <div style="text-align:center;">
                <div style="color:#10b981; font-size:32px; font-weight:800;">${_state.ok}</div>
                <div style="color:rgba(255,255,255,0.4); font-size:12px;">Sapevo</div>
            </div>
            <div style="text-align:center;">
                <div style="color:#ef4444; font-size:32px; font-weight:800;">${_state.no}</div>
                <div style="color:rgba(255,255,255,0.4); font-size:12px;" data-i18n="qm_to_review">Da ripassare</div>
            </div>
            <div style="text-align:center;">
                <div style="color:#a78bfa; font-size:32px; font-weight:800;">+${_state.xp}</div>
                <div style="color:rgba(255,255,255,0.4); font-size:12px;">${t('qm_xp_earned')}</div>
            </div>
        </div>
        ${_state.isDemo ? `
        <div style="background:rgba(124,58,237,0.12); border:1px solid rgba(124,58,237,0.3); border-radius:16px; padding:20px; max-width:320px; width:100%;">
            <div style="color:#a78bfa; font-size:14px; font-weight:700; margin-bottom:6px;" data-i18n="qm_want_real">Vuoi studiare davvero?</div>
            <div style="color:rgba(255,255,255,0.5); font-size:12px; margin-bottom:16px;" data-i18n="qm_demo_cta">Carica i tuoi appunti, PDF o registra una lezione. Cortex genera le card per te.</div>
            <button id="recap-upload" style="background:#7C3AED; border:none; border-radius:12px; padding:12px 24px; color:#fff; font-size:14px; font-weight:700; cursor:pointer; width:100%;">${t('qm_upload_material')}</button>
        </div>
        ` : `
        <div style="color:rgba(255,255,255,0.4); font-size:13px;">
            ${_state.no > 0 ? `${_state.no} ${t('qm_cards_return')}` : t('qm_all_mastered')}
        </div>
        `}
        <button id="recap-close" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:14px 32px; color:var(--text); font-size:14px; font-weight:600; cursor:pointer; margin-top:8px;">Torna alla Home</button>
    </div>`, true);

    overlay.style.display = 'flex';

    document.getElementById('recap-close')?.addEventListener('click', _close);
    document.getElementById('recap-upload')?.addEventListener('click', () => {
        _close();
        if (typeof window.promptImportDeck === 'function') window.promptImportDeck();
        else if (typeof window.showPage === 'function') window.showPage('materiale');
    });
}

// ── Chiudi overlay ────────────────────────────────────────────────────────────
function _close() {
    clearInterval(_state.timer);
    const overlay = document.getElementById('quick-mode-overlay');
    if (overlay) overlay.remove();
}

// ── Bind eventi (touch + click) ───────────────────────────────────────────────
function _bindEvents(overlay) {
    // Chiudi
    overlay.querySelector('#qm-close')?.addEventListener('click', _close);

    // Flip card al tocco
    overlay.querySelector('#qm-card')?.addEventListener('click', _flip);

    // Bottoni risposta
    overlay.querySelector('#qm-btn-ok')?.addEventListener('click', () => _answer(true));
    overlay.querySelector('#qm-btn-no')?.addEventListener('click', () => _answer(false));

    // Upload banner
    overlay.querySelector('#qm-upload-btn')?.addEventListener('click', () => {
        _close();
        if (typeof window.promptImportDeck === 'function') window.promptImportDeck();
        else if (typeof window.showPage === 'function') window.showPage('materiale');
    });

    // Swipe touch (su = sapevo, giu = non sapevo)
    const card = overlay.querySelector('#qm-card');
    if (card) {
        card.addEventListener('touchstart', e => {
            _state.touchStartY = e.touches[0].clientY;
        }, { passive: true });

        card.addEventListener('touchend', e => {
            const dy = _state.touchStartY - e.changedTouches[0].clientY;
            // FIX Android: preventDefault() sopprime il click sintetico successivo
            // che causerebbe un doppio flip (risposta appare e sparisce subito)
            e.preventDefault();
            if (Math.abs(dy) > 50) {
                _answer(dy > 0); // su = true (sapevo), giu = false (non sapevo)
            } else {
                _flip();
            }
        });
    }
}

// ── Export globale per event delegation ──────────────────────────────────────
window.openQuickMode = openQuickMode;
