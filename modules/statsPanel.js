import { t } from '../core/i18n.js';
/**
 * modules/statsPanel.js
 * UI rendering for statistics (heat maps, study totals) and gamification panel.
 */

import { state } from '../core/state.js';
import { todayStr } from '../js/utils.js';
import { gState, getLevel, getNextLevel, ALL_BADGES } from './gamification.js';
import { renderCalendar } from './calendar.js';

/**
 * Refreshes the due counts for all decks based on today's date.
 */
export function refreshDueCounts() {
    if (!state.decks) return;
    const today = (typeof todayStr === 'function') ? todayStr() : new Date().toISOString().slice(0, 10);
    state.decks.forEach(d => {
        // FIX: slice(0,10) gestisce sia "YYYY-MM-DD" che "YYYY-MM-DDTHH:mm..." + card nuove senza nextReview
        d.dueCount = d.cards ? d.cards.filter(c => !c.nextReview || (c.nextReview || '').slice(0, 10) <= today).length : 0;
    });
}

/**
 * Calculates the current study streak in days.
 */
export function calcStreak() {
    const sessionDates = new Set(state.sessions.map(s => s.date));
    let streak = 0, d = new Date();
    while (true) {
        const key = d.toISOString().slice(0, 10);
        if (sessionDates.has(key)) { streak++; d.setDate(d.getDate() - 1); }
        else break;
    }
    return streak;
}

/**
 * Renders the statistics dashboard including totals and heat map.
 * @param {Object} deps - UI dependencies like scheduleNotification
 */
export function renderStats(deps = {}) {
    let statsGrid = document.getElementById('stats-grid');
    if (!statsGrid) statsGrid = document.getElementById('stats-container');
    if (!statsGrid) return;

    // Safety check for scheduleNotification
    if (localStorage.getItem('mm_notif') === '1') {
        if (typeof deps.scheduleNotification === 'function') {
            deps.scheduleNotification();
        } else if (typeof window.scheduleNotification === 'function') {
            window.scheduleNotification();
        }
    }

    const totalCards = state.decks.reduce((s, d) => s + d.cards.length, 0);
    const totalDecks = state.decks.length;
    const totalSessions = state.sessions.length;
    const totalStudied = state.sessions.reduce((s, ss) => s + ss.correct + ss.hard + ss.wrong, 0);
    const today = state.todayCards;
    const streak = calcStreak();

    statsGrid.innerHTML = `
    <div class="stat-card"><div class="icon">📚</div><div class="num">${totalDecks}</div><div class="desc">Mazzi creati</div></div>
    <div class="stat-card"><div class="icon">🃏</div><div class="num">${totalCards}</div><div class="desc">Flashcard totali</div></div>
    <div class="stat-card"><div class="icon">⚡</div><div class="num">${today}</div><div class="desc">Carte oggi</div></div>
    <div class="stat-card"><div class="icon">🔥</div><div class="num">${streak}</div><div class="desc">Giorni di Serie</div></div>
    <div class="stat-card"><div class="icon">🎯</div><div class="num">${totalStudied}</div><div class="desc">Carte studiate totali</div></div>
    <div class="stat-card"><div class="icon">📅</div><div class="num">${totalSessions}</div><div class="desc">Sessioni completate</div></div>
  `;

    // Heat map (28 days)
    const heatEl = document.getElementById('heat-grid');
    if (!heatEl) return;
    heatEl.innerHTML = '';
    const sessionMap = {};
    state.sessions.forEach(s => {
        sessionMap[s.date] = (sessionMap[s.date] || 0) + s.correct + s.hard + s.wrong;
    });
    for (let i = 27; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const count = sessionMap[key] || 0;
        let level = count === 0 ? '' : count < 5 ? 'l1' : count < 15 ? 'l2' : count < 30 ? 'l3' : 'l4';
        const tt = key + (count ? ` (${count} carte)` : ' (nessuna)');
        heatEl.innerHTML += `<div class="heat-cell ${level}" title="${tt}"></div>`;
    }

    // Gamification panel
    injectGamPanel();
}

/**
 * Injects the gamification panel into the statistics page.
 */
export function injectGamPanel() {
    let statsPage = document.getElementById('page-stats');
    if (!statsPage) statsPage = document.getElementById('community-panel-stats');
    if (!statsPage) return;

    const lvl = getLevel();
    const next = getNextLevel();
    const xpForNext = next ? next.min - lvl.min : 0;
    const xpInLevel = next ? gState.xp - lvl.min : 0;
    const pct = next ? Math.min(100, Math.round((xpInLevel / xpForNext) * 100)) : 100;

    const old = statsPage.querySelector('#gam-panel');
    if (old) old.remove();

    // Clean up overlays if present
    const levelUp = document.querySelector('.level-up-overlay');
    if (levelUp) levelUp.remove();
    const paywall = document.querySelector('.paywall-gate');
    if (paywall) paywall.classList.remove('active');

    const gamDiv = document.createElement('div');
    gamDiv.id = 'gam-panel';
    gamDiv.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <span style="font-size:2rem;">${lvl.icon}</span>
                    <div>
                        <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">IL TUO LIVELLO</div>
                        <span class="level-badge ${lvl.cls}">${lvl.icon} ${lvl.name}</span>
                    </div>
                    <div style="margin-left:auto;text-align:right;">
                        <div style="font-size:1.5rem;font-weight:900;color:var(--accent);">${gState.xp} XP</div>
                        <div class="streak-chip">🔥 ${gState.streak} ${t('stats_streak_days')}</div>
                    </div>
                </div>
                ${next ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">${xpInLevel} / ${xpForNext} XP → ${next.icon} ${next.name}</div><div class="xp-bar-wrap"><div class="xp-bar" style="width:${pct}%"></div></div>` : `<div style="color:var(--gold);font-size:0.85rem;font-weight:700;">⚡ ${t('stats_max_level')}</div>`}
            </div>
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:20px;">
                <div style="font-weight:800;margin-bottom:12px;">🏅 ${t('stats_badges')} (${gState.badges.length}/${ALL_BADGES.length})</div>
                <div class="badges-grid">
                    ${ALL_BADGES.map(b => {
                        const earned = gState.badges.includes(b.id);
                        return `<div class="badge-card ${earned ? 'earned' : ''}" title="${b.desc}"><div class="badge-icon ${earned ? '' : 'badge-locked'}">${b.icon}</div><div class="badge-name">${b.name}</div></div>`;
                    }).join('')}
                </div>
            </div>
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:20px;">
                <div style="font-weight:800;margin-bottom:16px;">📅 ${t('stats_calendar')}</div>
                <div id="calendar-view"></div>
            </div>`;

    statsPage.insertBefore(gamDiv, statsPage.firstChild);
    if (typeof renderCalendar === 'function') renderCalendar();
}
