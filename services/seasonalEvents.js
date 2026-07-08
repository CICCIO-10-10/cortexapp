/**
 * seasonalEvents.js — Cortex Seasonal Mode
 *
 * STATO: SCHELETRO — eventi definiti, UI da implementare in app.html
 *
 * IDEA:
 *   Durante i periodi chiave dell'anno scolastico italiano, l'app
 *   si trasforma: banner dedicato, badge esclusivi, sfide speciali,
 *   streak bonus. Crea senso di urgenza e comunità ("siamo tutti
 *   in questo insieme").
 *
 * EVENTI SUPPORTATI:
 *   - maturita       → maggio-giugno (esame di stato)
 *   - sessione_inv   → gennaio-febbraio (sessione invernale università)
 *   - sessione_est   → giugno-luglio (sessione estiva università)
 *   - sessione_aut   → settembre (sessione autunnale)
 *   - back_to_school → settembre (ritorno a scuola)
 *   - custom         → evento manuale (Admin Mode)
 *
 * COSA CAMBIA DURANTE UN EVENTO:
 *   - Banner in-app con countdown ai giorni dell'esame
 *   - Badge esclusivo ottenibile solo durante l'evento
 *   - Streak bonus: +2 XP per ogni giorno di streak durante l'evento
 *   - Notifica speciale di benvenuto all'evento
 *   - Classifica speciale evento (chi studia di più vince)
 *   - Modalità "Esame Intensivo" sbloccata per tutti (anche free)
 *
 * TODO:
 *   1. Collegare il banner all'UI di app.html (showEventBanner())
 *   2. Collegare badge eventi a gamification.js (earnBadge)
 *   3. Collegare XP bonus a awardXP in gamification.js
 *   4. Admin Mode: interfaccia per creare eventi custom
 *   5. Aggiungere eventi internazionali (per espansione futura)
 */

// ─── Definizione eventi ───────────────────────────────────────────────────────

const EVENTS = [
    {
        id: 'back_to_school_2026',
        name: 'Ritorno a Scuola 🎒',
        shortName: 'Back to School',
        emoji: '🎒',
        start: new Date('2026-09-07'),
        end: new Date('2026-09-20'),
        color: '#3b82f6',
        badge: { id: 'back_to_school_2026', name: 'Primo Giorno', emoji: '🎒' },
        xpBonus: 1.5,
        description: 'Nuovo anno, nuova partenza. Studia ogni giorno per 2 settimane e vinci il badge esclusivo.',
        intensiveUnlocked: true,   // Modalità Intensiva gratis anche per FREE
        challengeGoal: { cards: 100, days: 14, label: '100 carte in 14 giorni' },
    },
    {
        id: 'sessione_aut_2026',
        name: 'Sessione Autunnale 🍂',
        shortName: 'Sessione Autunnale',
        emoji: '🍂',
        start: new Date('2026-09-01'),
        end: new Date('2026-09-30'),
        color: '#f59e0b',
        badge: { id: 'sessione_aut_2026', name: 'Guerriero d\'Autunno', emoji: '🍂' },
        xpBonus: 2.0,
        description: 'Sessione di recupero universitaria. Chi studia in agosto-settembre passa tutto.',
        intensiveUnlocked: true,
        challengeGoal: { cards: 500, days: 30, label: '500 carte in settembre' },
    },
    {
        id: 'sessione_inv_2027',
        name: 'Sessione Invernale ❄️',
        shortName: 'Sessione Invernale',
        emoji: '❄️',
        start: new Date('2027-01-05'),
        end: new Date('2027-02-10'),
        color: '#06b6d4',
        badge: { id: 'sessione_inv_2027', name: 'Studioso Invernale', emoji: '❄️' },
        xpBonus: 2.0,
        description: 'Sessione invernale universitaria. 36 giorni per dominare i tuoi esami.',
        intensiveUnlocked: true,
        challengeGoal: { cards: 1000, days: 36, label: '1000 carte in sessione' },
    },
    {
        id: 'sessione_est_2027',
        name: 'Sessione Estiva 🔥',
        shortName: 'Sessione Estiva',
        emoji: '☀️',
        start: new Date('2027-06-01'),
        end: new Date('2027-07-31'),
        color: '#ef4444',
        badge: { id: 'sessione_est_2027', name: 'Gladiatore Estivo', emoji: '☀️' },
        xpBonus: 2.0,
        description: 'Sessione estiva universitaria. Studia mentre gli altri sono in spiaggia.',
        intensiveUnlocked: true,
        challengeGoal: { cards: 1500, days: 61, label: '1500 carte in sessione estiva' },
    },
];

// ─── API pubblica ─────────────────────────────────────────────────────────────

/**
 * Restituisce l'evento attivo in questo momento, o null se nessuno.
 */
export function getActiveEvent(now = new Date()) {
    return EVENTS.find(e => now >= e.start && now <= e.end) || null;
}

/**
 * Restituisce tutti gli eventi futuri (prossimi 6 mesi).
 */
export function getUpcomingEvents(now = new Date()) {
    const sixMonths = new Date(now);
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    return EVENTS.filter(e => e.start > now && e.start <= sixMonths);
}

/**
 * Restituisce i giorni rimanenti all'evento (o al suo inizio se non ancora iniziato).
 */
export function getDaysTo(event, now = new Date()) {
    const target = now >= event.start ? event.end : event.start;
    return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

/**
 * Verifica se l'utente ha completato la sfida dell'evento.
 */
export function hasCompletedEventChallenge(eventId) {
    return localStorage.getItem(`cortex_event_done_${eventId}`) === '1';
}

/**
 * Segna la sfida come completata e assegna il badge.
 */
export async function completeEventChallenge(eventId) {
    const event = EVENTS.find(e => e.id === eventId);
    if (!event) return;

    localStorage.setItem(`cortex_event_done_${eventId}`, '1');

    // Assegna badge completamento (se esiste)
    const badge = event.badgeCompletion || event.badge;
    if (badge && typeof window.earnBadge === 'function') {
        await window.earnBadge(badge.id, badge.name, badge.emoji);
    }

    // Salva su Firestore
    const uid = localStorage.getItem('cortex_uid');
    if (uid && typeof firebase !== 'undefined') {
        await firebase.firestore().collection('users').doc(uid).update({
            [`eventChallenges.${eventId}`]: true,
        }).catch(() => {});
    }
}

// ─── XP Bonus ─────────────────────────────────────────────────────────────────

/**
 * Restituisce il moltiplicatore XP attuale (1.0 se nessun evento).
 */
export function getCurrentXPMultiplier() {
    const event = getActiveEvent();
    return event ? event.xpBonus : 1.0;
}

// ─── Intensive Mode ───────────────────────────────────────────────────────────

/**
 * Durante un evento, la Modalità Intensiva è sbloccata per tutti (anche FREE).
 * Modalità Intensiva = sessioni più lunghe, più carte per sessione, AI hints.
 */
export function isIntensiveModeUnlocked() {
    const event = getActiveEvent();
    return event?.intensiveUnlocked === true;
}

// ─── Progress evento ──────────────────────────────────────────────────────────

export function getEventProgress(eventId) {
    try {
        return JSON.parse(localStorage.getItem(`cortex_event_progress_${eventId}`) || '{"cards":0,"days":0}');
    } catch { return { cards: 0, days: 0 }; }
}

export function updateEventProgress(eventId, cardsStudied) {
    const event = EVENTS.find(e => e.id === eventId);
    if (!event) return;

    const prog = getEventProgress(eventId);
    prog.cards += cardsStudied;

    const todayKey = new Date().toDateString();
    const lastDay = localStorage.getItem(`cortex_event_lastday_${eventId}`);
    if (lastDay !== todayKey) {
        prog.days += 1;
        localStorage.setItem(`cortex_event_lastday_${eventId}`, todayKey);
    }

    localStorage.setItem(`cortex_event_progress_${eventId}`, JSON.stringify(prog));

    // Controlla se ha completato la sfida
    const goal = event.challengeGoal;
    if (goal && prog.cards >= goal.cards && !hasCompletedEventChallenge(eventId)) {
        completeEventChallenge(eventId);
    }
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

/**
 * Genera l'HTML del banner evento da inserire in cima all'app.
 * TODO: chiamare in app.html dopo il login
 */
export function buildEventBanner(event = null) {
    const active = event || getActiveEvent();
    if (!active) return null;

    const daysLeft = getDaysTo(active);
    const progress = getEventProgress(active.id);
    const goal = active.challengeGoal;
    const pct = goal ? Math.min(100, Math.round((progress.cards / goal.cards) * 100)) : 0;
    const label = active.countdownLabel || 'giorni alla fine';

    const banner = document.createElement('div');
    banner.id = 'cortex-event-banner';
    banner.style.cssText = `
        background: linear-gradient(135deg, ${active.color}22, ${active.color}44);
        border: 1px solid ${active.color}66;
        border-radius: 16px; padding: 14px 18px;
        margin: 12px 16px; cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    banner.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:1.4rem">${active.emoji}</span>
                <div>
                    <div style="font-weight:700;color:var(--text);font-size:0.95rem">${active.name}</div>
                    <div style="color:#9ca3af;font-size:0.78rem">${active.description.substring(0, 60)}...</div>
                </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <div style="font-size:1.4rem;font-weight:800;color:${active.color}">${daysLeft}</div>
                <div style="font-size:0.7rem;color:#9ca3af">${label}</div>
            </div>
        </div>
        ${goal ? `
        <div style="background:#ffffff22;border-radius:99px;height:6px">
            <div style="width:${pct}%;background:${active.color};height:6px;border-radius:99px;transition:width 0.4s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px">
            <span style="color:#9ca3af;font-size:0.72rem">${progress.cards} carte studiate</span>
            <span style="color:#9ca3af;font-size:0.72rem">Obiettivo: ${goal.label}</span>
        </div>
        ` : ''}
    `;

    banner.addEventListener('click', () => {
        if (typeof window.showEventModal === 'function') window.showEventModal(active);
    });

    return banner;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Da chiamare in main.js dopo il login.
 * Inserisce il banner se c'è un evento attivo.
 */
export function initSeasonalEvents() {
    const event = getActiveEvent();
    if (!event) return;

    // Badge di partecipazione (solo per aver aperto l'app durante l'evento)
    const joinKey = `cortex_event_joined_${event.id}`;
    if (!localStorage.getItem(joinKey)) {
        localStorage.setItem(joinKey, '1');
        if (event.badge && typeof window.earnBadge === 'function') {
            window.earnBadge(event.badge.id, event.badge.name, event.badge.emoji);
        }
        if (window.showToast) {
            window.showToast(`${event.emoji} Evento speciale attivo: ${event.name}!`, 'info', 4000);
        }
    }

    // Inserisce banner nella home
    const homeEl = document.getElementById('home-event-banner-slot');
    if (homeEl) {
        const banner = buildEventBanner(event);
        if (banner) homeEl.replaceChildren(banner);
    }

    console.log(`[SeasonalEvents] Evento attivo: ${event.name}`);
}

// ─── Admin: evento custom ─────────────────────────────────────────────────────

/**
 * Crea un evento custom dal pannello admin.
 * TODO: collegare all'Admin Mode esistente
 */
export function createCustomEvent({ name, emoji, startDate, endDate, color, badgeName, xpBonus = 1.5 }) {
    const event = {
        id: `custom_${Date.now()}`,
        name,
        shortName: name,
        emoji,
        start: new Date(startDate),
        end: new Date(endDate),
        color: color || '#8b5cf6',
        badge: { id: `custom_badge_${Date.now()}`, name: badgeName || name, emoji },
        xpBonus,
        description: `Evento speciale: ${name}`,
        intensiveUnlocked: true,
        challengeGoal: null,
    };

    // Salva in localStorage per questa sessione
    const custom = JSON.parse(localStorage.getItem('cortex_custom_events') || '[]');
    custom.push({ ...event, start: event.start.toISOString(), end: event.end.toISOString() });
    localStorage.setItem('cortex_custom_events', JSON.stringify(custom));

    return event;
}
