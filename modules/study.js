import { t } from '../core/i18n.js';
/**
 * modules/study.js — Phase 16
 *
 * Sessione di studio con flashcard (SRS — SM-2).
 * Gestisce: startStudy, showCard, flipCard, rateCard, endSession, closeStudy.
 *
 * Dipendenze iniettate via init():
 *   state                — { decks, todayCards }
 *   saveState            — persiste lo stato
 *   showToast            — notifiche UI
 *   awardXP              — gamification
 *   refreshDueCounts     — aggiorna i badge "due" dopo la sessione (opzionale)
 *   todayCardsKey        — chiave localStorage per il contatore giornaliero
 *   getCurrentDeckIndex  — getter per currentDeckIndex (rimane in main.js)
 *   setCurrentDeckIndex  — setter per currentDeckIndex
 *
 * Import diretti (zero deps circolari):
 *   processAnswer  ← services/srs.js
 *   todayStr       ← js/utils.js
 *   renderDecks    ← modules/decks.js
 */
import { processAnswer }  from '../services/srs.js';
import { todayStr }       from '../js/utils.js';
import { renderDecks }    from './decks.js';
import { updateMemoryBank } from '../services/memoryService.js';
import { track }          from '../core/analytics.js';
import { TRANSLATIONS } from '../data/translations.js';
const _t = () => (TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it);

const _getLang = () => localStorage.getItem('mm_lang') || 'it';

// ── Dependency injection ─────────────────────────────────────────────────────
let _deps = {
    state:               { decks: [], todayCards: 0 },
    saveState:           () => {},
    showToast:           () => {},
    awardXP:             () => {},
    refreshDueCounts:    null,
    todayCardsKey:       'cortex_today_cards',
    getCurrentDeckIndex: () => null,
    setCurrentDeckIndex: () => {},
    onSessionEnd:        null, // callback({ cardsStudied, deckName }) — per widget/eventi/referral
};

export function init(deps) {
    _deps = { ..._deps, ...deps };
}

// ── Stato privato della sessione ─────────────────────────────────────────────
let studyQueue    = [];
let studyIndex    = 0;
let studyFlipped  = false;
let sessionCorrect = 0, sessionWrong = 0, sessionHard = 0, sessionStreak = 0;
let pct           = 0;  // calcolato in showCard, usato in endSession
let sessionStartTime = 0;   // timestamp ms — per calcolo durata sessione
let sessionDeckName  = '';  // nome mazzo — per la share card

// ── Funzioni esportate ───────────────────────────────────────────────────────

export async function startStudy(deckIndex) {
    const { state, showToast, setCurrentDeckIndex } = _deps;
    const deck = state.decks[deckIndex];

    // 🔄 Lazy Loading: se mancano le carte, scarichiamole dalla sub-collection
    if (!deck.cards || deck.cards.length === 0) {
        if (window.loadDeckFromSubcollection) {
            showToast(t('study_loading'), 'info');
            const fullDeck = await window.loadDeckFromSubcollection(deck.id);
            if (fullDeck && fullDeck.cards) {
                deck.cards = fullDeck.cards;
                // Aggiorniamo anche eventuali altri metadati pesanti
                deck.text = fullDeck.text;
                deck.attachments = fullDeck.attachments;
                deck.aiSummary = fullDeck.aiSummary;
                _deps.saveState();
            }
        }
    }

    if (!deck.cards || deck.cards.length === 0) {
        showToast(t('study_no_cards'), 'info'); return;
    }

    // FIX: slice(0,10) gestisce sia "2026-05-03" che "2026-05-03T14:30:00.000Z"
    // Le card senza nextReview (nuove) sono sempre da studiare
    const today = todayStr();
    const dueCards = deck.cards.filter(c => !c.nextReview || (c.nextReview || '').slice(0, 10) <= today);
    if (dueCards.length === 0) {
        showToast(t('study_no_cards_today'), 'success'); return;
    }

    // Nascondi FAB durante lo studio
    const fab = document.getElementById('main-fab');
    if (fab) fab.style.display = 'none';

    setCurrentDeckIndex(deckIndex);
    studyQueue    = dueCards.map(c => ({ card: c, origIndex: deck.cards.indexOf(c) }));
    studyIndex    = 0;
    studyFlipped  = false;
    sessionCorrect = 0; sessionWrong = 0; sessionHard = 0; sessionStreak = 0;
    sessionStartTime = Date.now();
    sessionDeckName  = deck.name || deck.title || 'Studio';
    const streakEl = document.getElementById('study-streak');
    if (streakEl) streakEl.textContent = '';

    document.getElementById('session-done').style.display    = 'none';
    document.getElementById('study-session').style.display   = '';
    const _studyOv = document.getElementById('study-overlay');
    // Bug "RIPASSA ORA morto": un display:none INLINE stantio sull'overlay
    // (residuo di vecchie build/PWA) vinceva sulla regola CSS
    // #study-overlay.active{display:flex}. Rimuovi sempre l'inline prima.
    _studyOv.style.removeProperty('display');
    _studyOv.classList.add('active');

    track('study_session_start', {
        deck_name: sessionDeckName,
        card_count: dueCards.length,
    });

    showCard();
}

export function showCard() {
    if (studyIndex >= studyQueue.length) { endSession(); return; }

    const { card } = studyQueue[studyIndex];
    const total    = studyQueue.length;
    // Calcolo percentuale basato sulla posizione corrente (1-based per visualizzazione fluida)
    pct            = Math.round(((studyIndex) / total) * 100);
    const progressText = `Carta ${studyIndex + 1} di ${total}`;

    const progressEl = document.getElementById('study-progress');
    const fillEl     = document.getElementById('progress-fill');

    if (progressEl) progressEl.textContent = progressText;
    if (fillEl) {
        fillEl.style.width = pct + '%';
        // Aggiunta feedback visivo al completamento
        if (pct === 100) fillEl.style.backgroundColor = 'var(--green)';
        else fillEl.style.backgroundColor = 'var(--accent)';
    }
    const qEl = document.getElementById('card-question');
    const aEl = document.getElementById('card-answer');
    const fiEl = document.getElementById('flip-inner');
    const rbEl = document.getElementById('rating-buttons');
    const fpEl = document.getElementById('flip-prompt');
    if (qEl) qEl.textContent = card.q;
    if (aEl) aEl.textContent = card.a;
    if (fiEl) fiEl.classList.remove('flipped');
    if (rbEl) rbEl.classList.remove('visible');
    if (fpEl) fpEl.textContent = (_t().click_card||'Clicca la carta per rivelarla');
    studyFlipped = false;
}

export function flipCard() {
    if (studyFlipped) return;
    studyFlipped = true;
    const fiEl = document.getElementById('flip-inner');
    const rbEl = document.getElementById('rating-buttons');
    const fpEl = document.getElementById('flip-prompt');
    if (fiEl) fiEl.classList.add('flipped');
    if (rbEl) rbEl.classList.add('visible');
    if (fpEl) fpEl.textContent = (_t().how_was_it||'Come ti è andata?');
}

export function rateCard(rating) {
    // Guard: se studyIndex è fuori bounds (es. doppio tap rapido) ignora silenziosamente
    if (studyIndex >= studyQueue.length || !studyQueue[studyIndex]) return;
    const { state, saveState, awardXP, todayCardsKey, getCurrentDeckIndex } = _deps;
    const { card, origIndex } = studyQueue[studyIndex];
    const deck     = state.decks[getCurrentDeckIndex()];
    const origCard = deck.cards[origIndex];

    const updated = processAnswer(origCard, rating);
    Object.assign(origCard, updated);

    if (rating === 0) {
        sessionWrong++;
        sessionStreak = 0;
        const el = document.getElementById('study-streak');
        if (el) el.textContent = '';
    }
    else if (rating === 1) {
        sessionHard++;
    }
    else {
        sessionCorrect++;
        sessionStreak++;
        if (sessionStreak >= 3) {
            const el = document.getElementById('study-streak');
            if (el) el.textContent = `🔥 ${sessionStreak}x Combo!`;
        }
    }

    state.todayCards++;
    localStorage.setItem(todayCardsKey, state.todayCards);
    saveState();

    // ── Obiettivo giornaliero: celebrazione al raggiungimento ─────────────────
    const dailyGoal    = parseInt(localStorage.getItem('cortex_daily_goal') || '10');
    // Data locale (non UTC) per coerenza con todayStr() — evita chiave errata dopo mezzanotte
    const _d = new Date();
    const _localToday  = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
    const goalCelebKey = 'cortex_goal_celebrated_' + _localToday;
    if (state.todayCards === dailyGoal && !localStorage.getItem(goalCelebKey)) {
        localStorage.setItem(goalCelebKey, '1');
        setTimeout(() => _celebrateGoal(dailyGoal), 400);
    }

    studyIndex++;
    awardXP(5, 'Carta studiata');
    showCard();
}

export function closeStudy() {
    document.getElementById('study-overlay').classList.remove('active');
    const { refreshDueCounts } = _deps;
    if (typeof refreshDueCounts === 'function') refreshDueCounts();
    renderDecks();
}

// ── Privata (chiamata da showCard) ───────────────────────────────────────────
function endSession() {
    const { awardXP } = _deps;
    document.getElementById('study-session').style.display = 'none';

    // ── Calcola durata sessione ───────────────────────────────────────────────
    const elapsedMs  = Date.now() - sessionStartTime;
    const elapsedMin = Math.floor(elapsedMs / 60000);
    const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
    const durationStr = elapsedMin > 0
        ? `${elapsedMin} min ${elapsedSec}s`
        : `${elapsedSec}s`;

    const totalCards = sessionCorrect + sessionHard + sessionWrong;
    const finalPct   = totalCards > 0 ? Math.round((sessionCorrect / totalCards) * 100) : pct;

    let motivationalMsg = t('study_msg_good');
    let icon = "🎉";
    if      (finalPct === 100) { motivationalMsg = t('study_msg_legend'); icon = "🏆"; }
    else if (finalPct >= 80)   { motivationalMsg = t('study_msg_great');    icon = "🔥"; }
    else if (finalPct >= 50)   { motivationalMsg = t('study_msg_ok');  icon = "✨"; }
    else                       { motivationalMsg = t('study_msg_low');  icon = "⚡"; }

    document.getElementById('session-done').querySelector('div').innerText = icon;
    document.getElementById('session-done').querySelector('h3').innerText  = motivationalMsg;

    // ── Gstate per streak e review ────────────────────────────────────────────
    const gstate      = JSON.parse(localStorage.getItem('mm_gstate') || '{}');
    const streakDays  = gstate.streak || 0;
    const sessionsTotal = (parseInt(localStorage.getItem('cortex_total_sessions') || '0')) + 1;
    localStorage.setItem('cortex_total_sessions', sessionsTotal);

    document.getElementById('session-stats').innerHTML = `
        <div class="stat-box"><div class="val" style="color:var(--green)">${sessionCorrect}</div><div class="lbl">${t('study_stat_knew')}</div></div>
        <div class="stat-box"><div class="val" style="color:var(--gold)">${sessionHard}</div><div class="lbl">${t('study_stat_hard')}</div></div>
        <div class="stat-box"><div class="val" style="color:var(--red)">${sessionWrong}</div><div class="lbl">${t('study_stat_didnt')}</div></div>
        <div class="stat-box"><div class="val">${finalPct}%</div><div class="lbl">${t('study_stat_acc')}</div></div>
        <div class="stat-box"><div class="val" style="color:var(--accent2)">⏱️ ${durationStr}</div><div class="lbl">${t('study_stat_dur')}</div></div>
    `;

    // ── Pulsante Condividi (TikTok-ready) ────────────────────────────────────
    const existingShare = document.getElementById('study-share-btn-container');
    if (existingShare) existingShare.remove();

    const shareContainer = document.createElement('div');
    shareContainer.id = 'study-share-btn-container';
    shareContainer.style.cssText = 'margin-top:16px; margin-bottom:4px;';
    shareContainer.innerHTML = `
        <button id="study-share-btn" style="
            background: linear-gradient(135deg, #7c3aed, #ec4899);
            color:#fff; border:none; border-radius:14px;
            padding:12px 28px; font-weight:800; font-size:0.88rem;
            cursor:pointer; font-family:inherit;
            box-shadow: 0 6px 20px rgba(124,58,237,0.35);
            transition: transform 0.15s;
            display: inline-flex; align-items:center; gap:8px;
        " onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">
            ${t('study_share_btn')}
        </button>
    `;

    const statsEl = document.getElementById('session-stats');
    statsEl.parentNode.insertBefore(shareContainer, statsEl.nextSibling);

    document.getElementById('study-share-btn')?.addEventListener('click', () => {
        _shareStudyResult(totalCards, finalPct, durationStr, streakDays, sessionDeckName);
    });

    awardXP(20, 'Sessione completata');

    // ── Notifica moduli post-sessione (widget, eventi stagionali, referral) ────
    if (typeof _deps.onSessionEnd === 'function') {
        try { _deps.onSessionEnd({ cardsStudied: totalCards, deckName: sessionDeckName }); } catch (_) {}
    }

    // ── Memory Bank ───────────────────────────────────────────────────────────
    const deck = _deps.state.decks[_deps.getCurrentDeckIndex()];
    if (deck && deck.id) {
        updateMemoryBank(deck.id, { sessionCorrect, sessionWrong, sessionHard, pct: finalPct });
    }

    // ── Review prompt dopo 10 sessioni ────────────────────────────────────────
    if (sessionsTotal === 10 || sessionsTotal === 30 || sessionsTotal === 100) {
        setTimeout(() => _showReviewPrompt(), 2000);
    }
}

/**
 * Celebrazione visuale al raggiungimento dell'obiettivo giornaliero.
 * Mostra un overlay con confetti + bottone condivisione.
 */
function _celebrateGoal(goal) {
    const { showToast } = _deps;

    // Confetti
    if (typeof confetti === 'function') {
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 },
            colors: ['#22c55e', '#86efac', '#4ade80', '#ffffff', '#fbbf24'] });
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9998;display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(34,197,94,0.15),rgba(14,14,22,0.98));border:1px solid rgba(34,197,94,0.4);border-radius:28px;padding:40px 32px;text-align:center;max-width:340px;width:100%;box-shadow:0 24px 64px rgba(34,197,94,0.2);">
            <div style="font-size:3.5rem;margin-bottom:12px;animation:pulse 1.5s infinite;">🎯</div>
            <h2 style="font-size:1.6rem;font-weight:900;margin:0 0 8px;font-family:'Outfit',sans-serif;color:#22c55e;">${t('study_goal_title')}</h2>
            <p style="color:rgba(255,255,255,0.6);margin:0 0 24px;font-size:0.9rem;">${t('study_goal_msg_pre')} <b style="color:var(--text)">${goal} ${t('study_cards_label')}</b> ${t('study_goal_msg_post')}</p>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                <button onclick="window._shareGoalAchieved && window._shareGoalAchieved(${goal})" style="padding:12px 20px;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;border-radius:14px;color:#fff;font-family:inherit;font-weight:800;font-size:0.95rem;cursor:pointer;box-shadow:0 8px 20px rgba(34,197,94,0.3);">${t('study_share_short')}</button>
                <button onclick="this.closest('div[style]').parentElement.remove()" style="padding:12px 20px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:14px;color:rgba(255,255,255,0.6);font-family:inherit;font-weight:700;font-size:0.95rem;cursor:pointer;">${t('study_continue')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 10000);

    window._shareGoalAchieved = async (g) => {
        const streak = typeof window.getStreakStatus === 'function'
            ? window.getStreakStatus().streak : 0;
        const streakPart = streak > 0 ? `\n🔥 ${streak} giorni di streak!` : '';
        const text = `Obiettivo raggiunto! 🎯 Ho studiato ${g} carte oggi su Cortex 🧠${streakPart}\ncortexapp.it\n#Cortex #StudyTok #DailyGoal #Studenti`;
        try {
            if (navigator.share) await navigator.share({ title: `Obiettivo ${g} carte — Cortex`, text });
            else {
                await navigator.clipboard.writeText(text);
                if (showToast) showToast(t('copied_generic'), 'success');
            }
        } catch (e) {
            try { await navigator.clipboard.writeText(text); } catch {}
        }
    };
}

/**
 * Condivide i risultati della sessione — TikTok/Instagram-ready.
 */
async function _shareStudyResult(cards, accuracy, duration, streak, deckName) {
    const streakPart = streak > 0 ? `🔥 ${streak} giorni di streak` : '';
    const text = [
        `Appena finito una sessione di studio su Cortex 🧠`,
        `📚 ${cards} carte studiate in ${duration}`,
        `✅ Accuratezza: ${accuracy}%`,
        streakPart,
        `Il tuo Neural Study Engine → cortexapp.it`,
        `#Cortex #StudyTok #Flashcard #Studenti #StudyWithMe`,
    ].filter(Boolean).join('\n');

    try {
        if (navigator.share) {
            await navigator.share({ title: `Ho studiato ${cards} carte su Cortex!`, text });
        } else {
            await navigator.clipboard.writeText(text);
            if (window.showToast) window.showToast(t('copied_social'), 'success');
        }
    } catch(e) {
        if (e.name !== 'AbortError') {
            try { await navigator.clipboard.writeText(text); } catch {}
        }
    }
}

/**
 * Chiede una recensione app dopo un numero di sessioni raggiunto.
 */
function _showReviewPrompt() {
    // Non mostrare più di una volta ogni 30 giorni
    const lastPrompt = parseInt(localStorage.getItem('cortex_last_review_prompt') || '0');
    if (Date.now() - lastPrompt < 30 * 24 * 60 * 60 * 1000) return;
    localStorage.setItem('cortex_last_review_prompt', Date.now());

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed; inset:0; z-index:11000;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,0.6); backdrop-filter:blur(8px);
        opacity:0; transition:opacity 0.35s;
    `;
    overlay.innerHTML = `
        <div style="
            background:linear-gradient(135deg,rgba(14,14,22,0.98),rgba(20,20,35,0.98));
            border:1px solid rgba(139,92,246,0.35); border-radius:24px;
            padding:40px 36px; text-align:center; max-width:340px; width:90%;
            box-shadow:0 24px 60px rgba(0,0,0,0.7);
        ">
            <div style="font-size:3.5rem; margin-bottom:12px;">⭐</div>
            <div style="font-size:1.15rem; font-weight:900; color:var(--text); font-family:'Outfit',sans-serif; margin-bottom:8px;">
                Ti piace Cortex?
            </div>
            <div style="font-size:0.85rem; color:rgba(255,255,255,0.5); line-height:1.6; margin-bottom:28px;">
                Hai completato ${localStorage.getItem('cortex_total_sessions')} sessioni di studio 🎉<br>
                ${t('study_review_msg')}
            </div>
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                <button id="review-yes-btn" style="
                    background:linear-gradient(135deg,#7c3aed,#6d28d9);
                    color:#fff; border:none; border-radius:12px;
                    padding:12px 24px; font-weight:800; font-size:0.88rem;
                    cursor:pointer; font-family:inherit;
                    box-shadow:0 6px 18px rgba(124,58,237,0.35);
                ">${t('study_review_yes')}</button>
                <button id="review-no-btn" style="
                    background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.5);
                    border:1px solid rgba(255,255,255,0.1); border-radius:12px;
                    padding:12px 20px; font-weight:600; font-size:0.85rem;
                    cursor:pointer; font-family:inherit;
                ">${t('study_review_no')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => { overlay.style.opacity = '1'; }, 50);

    overlay.querySelector('#review-yes-btn')?.addEventListener('click', () => {
        // Android Play Store — l'URL viene aggiornato quando l'app sarà pubblicata
        const storeUrl = 'https://play.google.com/store/apps/details?id=app.web.cortex_app';
        window.open(storeUrl, '_blank');
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 400);
    });
    overlay.querySelector('#review-no-btn')?.addEventListener('click', () => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 400);
    });
    // Auto-dismiss 20s
    setTimeout(() => {
        if (overlay.parentNode) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 400); }
    }, 20000);
}

export function startStudyById(deckId) {
    const { state } = _deps;
    const idx = state.decks.findIndex(d => d.id === deckId || d.id === parseInt(deckId));
    if (idx !== -1) {
        startStudy(idx);
    } else {
        _deps.showToast(t('study_deck_not_found'), 'error');
    }
}
