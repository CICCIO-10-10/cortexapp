import { t } from '../core/i18n.js';
/**
 * modules/calendar.js — Calendario Studio (Phase 10)
 *
 * Estratto da main.js. Dipende da `state` (lettura dei deck) tramite
 * dependency injection via init(). Nessuna dipendenza su window.
 *
 * Uso in main.js:
 *   import { init as initCalendar, renderCalendar, calNav } from './modules/calendar.js';
 *   // dopo la definizione di `state`:
 *   initCalendar({ state });
 *
 * Funzioni esportate:
 *   renderCalendar()  — chiamata da renderStats() in main.js
 *   calNav(dir)       — window export (onclick nel HTML dinamico di renderCalendar)
 */

let _deps = { state: { decks: [] } };

/** Riceve le dipendenze da main.js. Chiamare dopo la definizione di `state`. */
export function init(deps) {
    _deps = deps;
}

let calDate = new Date();

export function renderCalendar() {
    const state = _deps.state;
    const year  = calDate.getFullYear(), month = calDate.getMonth();
    const today = new Date();
    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames  = [t('cal_jan'),t('cal_feb'),t('cal_mar'),t('cal_apr'),t('cal_may'),t('cal_jun'),t('cal_jul'),t('cal_aug'),t('cal_sep'),t('cal_oct'),t('cal_nov'),t('cal_dec')];

    // Raccoglie date esame e date con carte in scadenza
    const examDates = new Set();
    const cardDates = new Set();
    (state.decks || []).forEach(d => {
        if (d.examDate) {
            const dt = new Date(d.examDate);
            if (dt.getFullYear() === year && dt.getMonth() === month) examDates.add(dt.getDate());
        }
        (d.pairs || []).forEach(p => {
            if (p.nextReview) {
                const dt = new Date(p.nextReview);
                if (dt.getFullYear() === year && dt.getMonth() === month) cardDates.add(dt.getDate());
            }
        });
    });

    const dayNames = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    let html = `
        <div class="cal-nav">
            <button aria-label="Mese precedente" onclick="calNav(-1)">← Prec</button>
            <strong>${monthNames[month]} ${year}</strong>
            <button aria-label="Mese successivo" onclick="calNav(1)">Succ →</button>
        </div>
        <div class="cal-grid">
            ${dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('')}`;

    for (let i = 0; i < firstDay; i++) html += `<div class="cal-day" style="opacity:0;"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const isExam  = examDates.has(d);
        const hasCards = cardDates.has(d);
        const cls = [isToday ? 'today' : '', isExam ? 'exam' : '', hasCards && !isExam ? 'has-cards' : ''].filter(Boolean).join(' ');
        html += `<div class="cal-day ${cls}">${d}${isExam || hasCards ? '<div class="cal-dot"></div>' : ''}</div>`;
    }
    html += `</div>
        <div class="cal-legend" style="margin-top:12px;">
            <span>🟣 Oggi</span>
            <span>🔴 Esame</span>
            <span>🟢 Ripasso</span>
        </div>`;

    const el = document.getElementById('calendar-view');
    if (el) el.innerHTML = html;
}

export function calNav(dir) {
    calDate.setMonth(calDate.getMonth() + dir);
    renderCalendar();
}
