import { t } from '../core/i18n.js';
/**
 * modules/home.js — Phase 14
 *
 * Rendering della Home page (Cortex manifesto + neural pulse + feedback form).
 * Zero dipendenze da state.decks — la home è puramente presentazionale.
 *
 * Dipendenze iniettate via init():
 *   loadFeedbackMessages  — funzione per caricare i feedback da Firestore/Supabase
 *   clearChallengeTimer   — cleanup del timer del Daily Challenge prima della home
 *
 * Utilizzatori:
 *   main.js                    → import renderHome, chiama initHome(deps)
 *   ui/views/HomeView.js       → import renderHome per il mount
 */
import { getCoachInsight } from '../services/memoryService.js';
import { gState, getLevel, getStreakStatus, shareStreakMilestone, earnBadge, awardXP } from './gamification.js';
import { todayStr } from '../js/utils.js';
import { getActiveEvent, buildEventBanner } from '../services/seasonalEvents.js';

// ── Daily Goal Ring ──────────────────────────────────────────────────────────

/**
 * Restituisce l'HTML dell'anello di progresso obiettivo giornaliero.
 * Usa l'SVG stroke-dashoffset per una progress ring fluida.
 */
function renderDailyGoalRing() {
    const today        = todayStr(); // data locale, coerente con state.js e gamification.js
    const savedDate    = localStorage.getItem('mm_today_date');
    const rawCount     = parseInt(localStorage.getItem('mm_today_cards') || '0');
    const todayCards   = savedDate === today ? rawCount : 0;
    const dailyGoal    = parseInt(localStorage.getItem('cortex_daily_goal') || '10');

    const pct          = Math.min(1, todayCards / dailyGoal);
    const done         = pct >= 1;

    // SVG ring
    const R = 28, CIRC = 2 * Math.PI * R;
    const offset       = CIRC * (1 - pct);
    const ringColor    = done ? '#22c55e' : (pct >= 0.5 ? '#f59e0b' : 'var(--accent)');
    const label        = done ? t('home_goal_done') : `${todayCards}/${dailyGoal}`;
    const sublabel     = done ? t('home_goal_completed') : t('home_goal_cards_today');

    return `
        <div id="daily-goal-ring" style="
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(255,255,255,0.03);
            border: 1px solid ${done ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'};
            border-radius: 16px;
            padding: 10px 16px;
            margin-top: 16px;
            cursor: pointer;
            transition: background 0.2s;
        " onclick="window._showGoalSelector && window._showGoalSelector()" title="Cambia obiettivo">
            <svg width="64" height="64" viewBox="0 0 64 64" style="flex-shrink:0; transform:rotate(-90deg);">
                <circle cx="32" cy="32" r="${R}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>
                <circle cx="32" cy="32" r="${R}" fill="none"
                    stroke="${ringColor}" stroke-width="5"
                    stroke-dasharray="${CIRC.toFixed(2)}"
                    stroke-dashoffset="${offset.toFixed(2)}"
                    stroke-linecap="round"
                    style="transition: stroke-dashoffset 0.6s cubic-bezier(0.34,1.56,0.64,1), stroke 0.4s;"/>
                ${done ? `<circle cx="32" cy="32" r="${R}" fill="none" stroke="rgba(34,197,94,0.25)" stroke-width="10" style="filter:blur(4px);"/>` : ''}
            </svg>
            <div style="transform:rotate(0deg);/* undo the parent rotate */;">
                <!-- Number overlay centrato sull'SVG — lo facciamo con position relativa sul wrapper -->
            </div>
            <div style="flex:1; line-height:1;">
                <div style="font-size:1.1rem; font-weight:900; color:${done ? '#22c55e' : '#fff'}; font-family:'Outfit',sans-serif;">${label}</div>
                <div style="font-size:0.72rem; color:rgba(255,255,255,0.4); margin-top:2px;">${sublabel}</div>
                ${!done ? `<div style="height:4px; background:rgba(255,255,255,0.06); border-radius:99px; margin-top:6px; overflow:hidden;">
                    <div style="height:100%; width:${(pct*100).toFixed(1)}%; background:${ringColor}; border-radius:99px; transition: width 0.6s cubic-bezier(0.34,1.56,0.64,1);"></div>
                </div>` : ''}
            </div>
            ${done ? `<div style="font-size:1.8rem; animation: pulse 1.5s infinite;">🏆</div>` : `<div style="font-size:0.65rem; color:rgba(255,255,255,0.2); white-space:nowrap;">${t('home_goal_tap_hint')}</div>`}
        </div>
    `;
}

// Handler per mostrare il selettore di obiettivo (modal leggero)
window._showGoalSelector = () => {
    const current = parseInt(localStorage.getItem('cortex_daily_goal') || '10');
    const opts    = [5, 10, 20, 30, 50];

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
    modal.innerHTML = `
        <div style="background:#16162a;border:1px solid rgba(139,92,246,0.3);border-radius:24px;padding:32px;max-width:360px;width:100%;text-align:center;">
            <div style="font-size:2rem;margin-bottom:12px;">🎯</div>
            <h3 style="margin:0 0 6px;font-family:'Outfit',sans-serif;font-size:1.3rem;font-weight:900;">${t('home_goal_modal_title')}</h3>
            <p style="color:rgba(255,255,255,0.4);font-size:0.85rem;margin:0 0 24px;">${t('home_goal_modal_hint')}</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-bottom:24px;">
                ${opts.map(n => `
                    <button onclick="window._setDailyGoal(${n})" style="
                        padding:12px 20px;border-radius:12px;border:2px solid ${n===current ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};
                        background:${n===current ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)'};
                        color:${n===current ? 'var(--accent)' : '#fff'};
                        font-family:inherit;font-weight:800;font-size:1rem;cursor:pointer;">
                        ${n}
                    </button>
                `).join('')}
            </div>
            <button onclick="this.closest('div[style]').parentElement.remove()" style="padding:10px 28px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.5);font-family:inherit;cursor:pointer;">${t('home_cancel')}</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window._setDailyGoal = (n) => {
    localStorage.setItem('cortex_daily_goal', String(n));
    document.querySelectorAll('[id="daily-goal-ring"]').forEach(el => el.remove());
    // Chiudi modal e re-render home
    document.querySelectorAll('[onclick*="_setDailyGoal"]').forEach(b => b.closest('div[style]')?.parentElement?.remove());
    if (typeof window.renderHome === 'function') window.renderHome();
    else if (typeof window.showPage === 'function') window.showPage('home');
    if (window.showToast) window.showToast(`🎯 Obiettivo impostato: ${n} carte/giorno`, 'success');
};

function renderQuickStats() {
    const level = getLevel(gState.xp);
    const { streak, isActiveToday, freezes } = getStreakStatus();

    // Determina colore e icona dello streak in base allo stato
    let streakColor  = '#ef4444';
    let streakIcon   = '🔥';
    let streakSuffix = '';
    if (!isActiveToday && streak > 0) {
        streakColor  = '#f59e0b';
        streakIcon   = '⚠️';
        streakSuffix = `<span style="font-size:0.65rem; color:#f59e0b; margin-left:4px;">${t('home_streak_danger')}</span>`;
    }
    if (freezes > 0) {
        streakSuffix += `<span style="font-size:0.65rem; color:#06b6d4; margin-left:4px;">🧊×${freezes}</span>`;
    }

    return `
        <div class="quick-stats-bar reveal-anim">
            <div class="stat-pill">
                <span style="color:var(--accent)">🔱</span>
                <span>${t('home_level_label')} ${t('level_'+level.cls) || level.name}</span>
            </div>
            <div class="stat-pill">
                <span style="color:var(--accent2)">✨</span>
                <span>${gState.xp} XP</span>
            </div>
            <div class="stat-pill" style="cursor:${streak >= 3 ? 'pointer' : 'default'}; position:relative;"
                 ${streak >= 3 ? 'onclick="window._shareStreakFromHome && window._shareStreakFromHome()"' : ''}>
                <span style="color:${streakColor}">${streakIcon}</span>
                <span>${streak} ${t('home_streak_days_label')}</span>
                ${streakSuffix}
            </div>
        </div>
    `;
}

// Handler per condivisione streak dalla pill (registrato globalmente)
window._shareStreakFromHome = () => {
    const { streak } = getStreakStatus();
    if (streak >= 3) shareStreakMilestone(streak);
};

// Handler condivisione referral — Web Share API con fallback clipboard
window._inviteFriend = async () => {
    const uid  = window._fbUserId || 'guest';
    const code = uid.slice(0, 8); // codice referral corto dal UID
    const url  = `https://cortexapp.it?ref=${code}`;
    const text = `Sto studiando con Cortex — il Neural Study Engine con flashcard AI, streak e sfide. Provalo gratis 🚀\n${url}\n#Cortex #StudyTok`;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'Studia con me su Cortex 🚀', text, url });
        } else {
            await navigator.clipboard.writeText(text);
            if (window.showToast) window.showToast('📋 Link copiato! Incollalo dove vuoi.', 'success');
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            try { await navigator.clipboard.writeText(url); } catch {}
        }
    }
};

async function renderNeuralTrainer() {
    const container = document.getElementById('neural-trainer-container');
    if (!container) return;

    try {
        const insight = await getCoachInsight();
        if (!insight || !insight.message || insight.message === "null" || insight.message === "undefined") {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="neural-trainer-widget glass" style="
                background: linear-gradient(135deg, rgba(124,106,247,0.08) 0%, rgba(0,0,0,0.4) 100%);
                border: 1px solid rgba(124,106,247,0.2);
                padding: 24px;
                border-radius: 20px;
                margin-bottom: 40px;
                display: flex;
                align-items: center;
                gap: 20px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3), 0 0 15px rgba(124,106,247,0.05);
                animation: slideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            ">
                <div style="font-size: 2.2rem; filter: drop-shadow(0 0 8px var(--accent)); flex-shrink:0;">🧠</div>
                <div style="flex: 1;">
                    <div style="font-size: 0.7rem; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 4px; opacity:0.8;">
                        Neural Trainer Insight
                    </div>
                    <div style="font-size: 0.95rem; font-weight: 500; color: rgba(255,255,255,0.9); line-height: 1.5; font-family:'Outfit', sans-serif;">
                        "${insight.message}"
                    </div>
                </div>
                ${insight.suggestedDeckId ? `
                    <button class="btn btn-primary" data-fn="startStudyById" data-params='["${insight.suggestedDeckId}"]' style="
                        padding: 10px 20px;
                        border-radius: 10px;
                        white-space: nowrap;
                        font-weight: 700;
                        font-size: 0.8rem;
                        box-shadow: 0 4px 15px rgba(124,106,247,0.3);
                    ">
                        ⚡ Ripassa
                    </button>
                ` : ''}
            </div>
        `;
    } catch (e) {
        console.error('[Home] Error rendering neural trainer:', e);
    }
}

// ── Archivio citazioni Neural Pulse ─────────────────────────────────────────
const neuralPulseArchive = [
    { q: "Il successo non è definitivo, il fallimento non è fatale.", a: "Winston Churchill" },
    { q: "Sii il cambiamento che vuoi vedere nel mondo.", a: "Mahatma Gandhi" },
    { q: "Penso, dunque sono.", a: "René Descartes" },
    { q: "L'unico modo per fare un ottimo lavoro è amare quello che fai.", a: "Steve Jobs" },
    { q: "Al di là del bene e del male si stende un campo. Ti aspetterò là.", a: "Rumi" },
    { q: "Ciò che non mi uccide mi rende più forte.", a: "Friedrich Nietzsche" },
    { q: "Vivi come se dovessi morire domani. Impara come se dovessi vivere per sempre.", a: "Mahatma Gandhi" },
    { q: "La logica ti porterà da A a B. L'immaginazione ti porterà ovunque.", a: "Albert Einstein" },
    { q: "Non sono le nostre capacità che dimostrano chi siamo, ma le nostre scelte.", a: "Albus Silente" },
    { q: "Le cose che possiedi finiscono per possedere te.", a: "Tyler Durden" },
    { q: "Vedo gente morta.", a: "Il Sesto Senso" },
    { q: "Che la forza sia con te.", a: "Star Wars" },
    { q: "Houston, abbiamo un problema.", a: "Apollo 13" },
    { q: "Carpe Diem. Cogliete l'attimo, ragazzi.", a: "L'attimo fuggente" },
    { q: "Io ne ho viste cose che voi umani...", a: "Blade Runner" },
    { q: "La vita è like a scatola di cioccolatini.", a: "Forrest Gump" },
    { q: "Perché cadiamo? Per imparare a rimetterci in piedi.", a: "Batman Begins" },
    { q: "Il passato può far male, ma puoi scappare o imparare da esso.", a: "Il Re Leone" },
    { q: "Fa' o non fare. Non c'è provare.", a: "Yoda" },
    { q: "Restate affamati, restate folli.", a: "Steve Jobs" },
    { q: "Non è perché le cose sono difficili che non osiamo, è perché non osiamo che sono difficili.", a: "Seneca" },
    { q: "La felicità è reale solo se condivisa.", a: "Into the Wild" },
    { q: "Tutto ciò che siamo è il risultato di ciò che abbiamo pensato.", a: "Buddha" },
    { q: "L'essenziale è invisibile agli occhi.", a: "Il Piccolo Principe" },
    { q: "Sii te stesso; tutti gli altri sono già occupati.", a: "Oscar Wilde" },
    { q: "L'inferno sono gli altri.", a: "Jean-Paul Sartre" },
    { q: "Nessun uomo è un'isola.", a: "John Donne" },
    { q: "Sapere è potere.", a: "Sir Francis Bacon" },
    { q: "Il dubbio è l'inizio della saggezza.", a: "Aristotele" },
    { q: "La pazienza è amara, ma il suo frutto è dolce.", a: "Jean-Jacques Rousseau" },
    { q: "Nulla accade a meno che prima non sia un sogno.", a: "Carl Sandburg" },
    { q: "Sogna come se dovessi vivere per sempre, vivi come se dovessi morire oggi.", a: "James Dean" },
    { q: "L'istruzione è l'arma più potente per cambiare il mondo.", a: "Nelson Mandela" },
    { q: "Cerca di essere un arcobaleno nella nuvola di qualcun altro.", a: "Maya Angelou" },
    { q: "Non piangere perché è finita, sorridi perché è accaduto.", a: "Dr. Seuss" },
    { q: "La vita è ciò che accade mentre sei occupato a fare altri progetti.", a: "John Lennon" },
    { q: "La migliore vendetta è un successo enorme.", a: "Frank Sinatra" },
    { q: "Ogni colpo mi porta più vicino al prossimo fuoricampo.", a: "Babe Ruth" },
    { q: "Definisci il successo alle tue condizioni, raggiungilo con le tue regole.", a: "Anne Sweeney" },
    { q: "Non importa quanto vai piano, l'importante è che non ti fermi.", a: "Confucio" },
    { q: "Tutto quello che hai sempre desiderato è dall'altra parte della paura.", a: "George Addair" },
    { q: "Inizia dove sei. Usa quello che hai. Fai quello che puoi.", a: "Arthur Ashe" },
    { q: "L'unico limite alla nostra realizzazione di domani saranno i nostri dubbi di oggi.", a: "F.D. Roosevelt" },
    { q: "Se puoi sognarlo, puoi farlo.", a: "Walt Disney" },
    { q: "Credi di poterlo fare e sarai già a metà strada.", a: "Theodore Roosevelt" },
    { q: "Punta alla luna. Se fallisci, atterrerai tra le stelle.", a: "Les Brown" },
    { q: "L'azione è la chiave fondamentale di ogni successo.", a: "Pablo Picasso" },
    { q: "Fai quello che puoi, con quello che hai, dove sei.", a: "Theodore Roosevelt" },
    { q: "Il coraggio non è l'assenza di paura, ma la vittoria su di essa.", a: "Nelson Mandela" },
    { q: "L'importante non è vincere, ma partecipare con dignità.", a: "Pierre de Coubertin" },
    { q: "L'ostacolo è la via.", a: "Marco Aurelio" },
    { q: "Siamo fatti della stessa sostanza dei sogni.", a: "Shakespeare" },
    { q: "La disciplina è il ponte tra gli obiettivi e i risultati.", a: "Jim Rohn" },
    { q: "Il futuro dipende da ciò che fai oggi.", a: "Gandhi" },
];

// ── Dependency injection ─────────────────────────────────────────────────────
let _deps = {
    loadFeedbackMessages: null,
    clearChallengeTimer:  null,
};

/**
 * Inietta le dipendenze. Chiamata una volta in main.js dopo che le funzioni
 * dipendenti sono definite (stesso blocco degli altri initX()).
 */
export function init(deps) {
    _deps = { ..._deps, ...deps };
}

// ── renderHome ───────────────────────────────────────────────────────────────

export function renderHome() {
    // Pulisce il timer del Daily Challenge se attivo
    if (typeof _deps.clearChallengeTimer === 'function') {
        _deps.clearChallengeTimer();
    }

    // Phase 16: cerca prima #home-root (AppRouter HomeView), poi fallback legacy.
    const container = document.getElementById('home-root') ||
                      document.getElementById('page-home');
    if (!container) return;

    // ── Redesign Home 14/07/2026 ──────────────────────────────────────────────
    // Saluto personale al posto del wordmark gigante + griglia azioni rapide
    // SEMPRE visibile (anche da ospite: i gate pensano al resto).
    const _nome   = (localStorage.getItem('mm_user_name') || '').trim().split(' ')[0];
    const _ospite = !_nome || _nome.toLowerCase() === 'ospite';
    const _ora    = new Date().getHours();
    const _fascia = _ora < 13 ? 'Buongiorno' : _ora < 19 ? 'Buon pomeriggio' : 'Buonasera';
    const _saluto = _ospite ? `${_fascia} 👋` : `${_fascia}, ${_nome} 👋`;

    const _tile = (icon, label, sub, fn, primario = false, params = '') => `
        <button data-fn="${fn}" ${params ? `data-params='${params}'` : ''} style="
            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
            padding:18px 12px; border-radius:18px; cursor:pointer; font-family:inherit; text-align:center;
            background:${primario ? 'linear-gradient(135deg, #7c6af7, #a78bfa)' : 'rgba(255,255,255,0.04)'};
            border:1px solid ${primario ? 'transparent' : 'rgba(255,255,255,0.10)'};
            color:${primario ? '#fff' : 'var(--text)'};
            box-shadow:${primario ? '0 12px 36px rgba(124,106,247,0.45)' : 'none'};
            transition: transform .15s ease, border-color .15s, box-shadow .15s;
        " onmouseover="this.style.transform='translateY(-3px)';${primario ? '' : `this.style.borderColor='rgba(139,92,246,0.45)'`}"
          onmouseout="this.style.transform='none';${primario ? '' : `this.style.borderColor='rgba(255,255,255,0.10)'`}">
            <span style="font-size:1.7rem; line-height:1;">${icon}</span>
            <span style="font-weight:800; font-size:0.92rem; letter-spacing:0.01em;">${label}</span>
            <span style="font-size:0.68rem; line-height:1.3; color:${primario ? 'rgba(255,255,255,0.78)' : 'var(--text-muted)'};">${sub}</span>
        </button>`;

    const _azioni = [
        _tile('⚡', 'Quick Test', 'quiz lampo sui tuoi mazzi', 'openQuickMode', true),
        _tile('🎯', 'Simulazione TOLC', 'struttura e tempi ufficiali', 'openTolcSim'),
        _tile('🎤', 'Interrogazione', (window.getProfModeLabel ? window.getProfModeLabel().replace(/^[^A-Za-zÀ-ù]+/, '') : 'Prof: Normale'), 'openProfSelector'),
        // FIX 17/07/2026: apriva il test attitudinale (openArchitect) come la ghost-card di decks.js —
        // deve aprire la creazione materia. Il test attitudinale resta SOLO per sbloccare network/stats/community.
        _tile('➕', 'Nuova materia', 'appunti → flashcard AI', 'showView', false, '["CreateDeckView"]'),
    ].join('');

    // LE TUE MATERIE (14/07/2026): il contenuto vero dell'utente in Home —
    // prima la dashboard mostrava solo cornice e zero sostanza.
    const _esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const _decksAll = (window._legacyState?.()?.decks || []);
    const _decksTop = [..._decksAll]
        .sort((a, b) => (b.dueCount || 0) - (a.dueCount || 0))
        .slice(0, 3);
    const _materieHtml = _decksAll.length ? `
        <section style="margin-bottom:28px;">
            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:14px;">
                <div style="font-size:0.65rem; font-weight:900; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.2em;">📚 Le tue materie</div>
                <button data-fn="showPage" data-params='["materiale"]' style="background:none; border:none; color:var(--accent); font-size:0.8rem; font-weight:700; cursor:pointer; font-family:inherit;">vedi tutte →</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
                ${_decksTop.map(d => {
                    const due = d.dueCount || 0;
                    const nCards = (d.cards || []).length;
                    return `
                    <article style="
                        padding:18px; border-radius:16px;
                        background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08);
                        display:flex; flex-direction:column; gap:10px;
                        transition:border-color .2s, transform .15s;
                    " onmouseover="this.style.borderColor='rgba(139,92,246,0.4)';this.style.transform='translateY(-2px)'"
                      onmouseout="this.style.borderColor='rgba(255,255,255,0.08)';this.style.transform='none'">
                        <div>
                            <div style="font-weight:800; font-size:1rem; color:var(--text); margin-bottom:2px;">${_esc(d.name)}</div>
                            <div style="font-size:0.72rem; color:var(--text-muted);">${_esc(d.subject || '')}${nCards ? ` · ${nCards} carte` : ''}</div>
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:auto;">
                            <span style="font-size:0.75rem; font-weight:800; color:${due > 0 ? '#f59e0b' : '#4ade80'};">
                                ${due > 0 ? `⏰ ${due} da ripassare` : '✓ tutto ripassato'}
                            </span>
                            <button data-fn="startStudyById" data-params='["${_esc(d.id)}"]' style="
                                background:${due > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.06)'};
                                color:${due > 0 ? '#fff' : 'var(--text-muted)'};
                                border:none; border-radius:20px; padding:7px 16px;
                                font-size:0.78rem; font-weight:800; cursor:pointer; font-family:inherit;
                            ">Studia</button>
                        </div>
                    </article>`;
                }).join('')}
            </div>
        </section>` : '';   // 0 materie → niente sezione: "Nuova materia" sta già nei 4 tasti

    container.innerHTML = `
        <div class="dashboard-nebula reveal-anim" style="max-width: 900px; margin: 0 auto; padding: 28px 20px 120px;">

            <!-- SEASONAL EVENT BANNER — riempito da seasonalEvents.js -->
            <div id="home-event-banner-slot"></div>

            <!-- HERO SECTION -->
            <section class="hero-nebula" style="
                position: relative;
                width: 100%;
                border-radius: 28px;
                background: radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.20) 0%, transparent 65%),
                            radial-gradient(ellipse at 80% 30%, rgba(6,182,212,0.13) 0%, transparent 60%),
                            radial-gradient(ellipse at 50% 90%, rgba(217,70,239,0.09) 0%, transparent 55%),
                            rgba(14,14,22,0.85);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                padding: 56px 32px 52px;
                margin-bottom: 28px;
                overflow: hidden;
                border: 1px solid rgba(139,92,246,0.18);
                box-shadow: 0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06);
            ">
                <!-- Orb decorativi CSS -->
                <div style="position:absolute; width:500px; height:500px; border-radius:50%; background:var(--accent); opacity:0.05; filter:blur(100px); top:-150px; left:-120px; pointer-events:none;"></div>
                <div style="position:absolute; width:350px; height:350px; border-radius:50%; background:var(--accent2); opacity:0.06; filter:blur(80px); bottom:-100px; right:-80px; pointer-events:none;"></div>

                <div style="position:relative; z-index:2; width:100%;">
                    <!-- Saluto personale (via il wordmark gigante: sei già dentro l'app) -->
                    <div style="text-align:left; margin-bottom:18px;">
                        <div style="font-size:0.6rem; font-weight:900; letter-spacing:0.32em; text-transform:uppercase; color:rgba(255,255,255,0.32); margin-bottom:6px;">Cortex · Neural Study Engine</div>
                        <h1 style="font-family:'Outfit',sans-serif; font-size:clamp(1.7rem,4.5vw,2.4rem); font-weight:900; letter-spacing:-0.03em; margin:0; line-height:1.1; color:var(--text);">
                            ${_saluto}
                        </h1>
                    </div>

                    ${renderQuickStats()}
                    ${renderDailyGoalRing()}

                    <!-- AZIONI RAPIDE — sempre visibili, anche da ospite -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin-top:22px;">
                        ${_azioni}
                    </div>
                </div>
            </section>

            <!-- LE TUE MATERIE — il contenuto dell'utente, subito sotto le azioni -->
            ${_materieHtml}

            <!-- Neural Trainer (AI insight) — full width, async -->
            <div id="neural-trainer-container" style="margin-bottom: 28px;"></div>

            <!-- BANNER STUDENT: visibile solo agli utenti Free -->
            ${!window.isPremium?.() ? `
            <div data-fn="showPaywall" data-params='["feature"]' style="
                cursor:pointer;
                display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;
                padding:16px 22px;
                border-radius:16px;
                background: linear-gradient(135deg, rgba(124,106,247,0.12), rgba(239,68,68,0.08));
                border:1px solid rgba(124,106,247,0.25);
                margin-bottom:20px;
                transition: border-color 0.2s, background 0.2s;
            " onmouseover="this.style.borderColor='rgba(124,106,247,0.5)'" onmouseout="this.style.borderColor='rgba(124,106,247,0.25)'">
                <div style="display:flex;align-items:center;gap:14px;">
                    <span style="font-size:1.5rem;">🎓</span>
                    <div>
                        <div style="font-size:0.7rem;font-weight:900;color:var(--accent);text-transform:uppercase;letter-spacing:0.15em;margin-bottom:2px;">${t('home_plan_student')}</div>
                        <div style="font-size:0.88rem;font-weight:700;color:var(--text);">${t('home_plan_features')}</div>
                    </div>
                </div>
                <div style="
                    background:var(--accent); color:#fff; border-radius:20px;
                    padding:8px 18px; font-size:0.8rem; font-weight:800;
                    white-space:nowrap; flex-shrink:0;
                ">€4,99/mese →</div>
            </div>
            ` : ''}

            <!-- WHY CORTEX: differenziatori vs Anki/Quizlet -->
            ${!window._fbLoggedIn ? `
            <div style="margin-bottom:24px;">
                <div style="font-size:0.65rem;font-weight:900;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.2em;margin-bottom:14px;text-align:center;">
                    ${t('home_why_title')}
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
                    ${[
                        ['🧠', t('home_feat_ai_title'), t('home_feat_ai_desc')],
                        ['📅', t('home_feat_plan_title'), t('home_feat_plan_desc')],
                        ['⚔️', t('home_feat_duels_title'), t('home_feat_duels_desc')],
                    ].map(([icon, title, desc]) => `
                        <div style="
                            padding:18px 14px; border-radius:14px; text-align:center;
                            background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
                        ">
                            <div style="font-size:1.6rem;margin-bottom:8px;">${icon}</div>
                            <div style="font-size:0.82rem;font-weight:800;color:var(--text);margin-bottom:4px;">${title}</div>
                            <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);line-height:1.4;">${desc}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- FEATURE DISCOVERY ROW: Neural Duels + Visual Graph -->
            ${(gState.decks && gState.decks.length > 0) ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">

                <!-- Neural Duels card -->
                <article class="glass nebula-card" data-fn="openNeuralDuels" style="padding: 24px; border-radius: 20px; border: 1px solid rgba(124,106,247,0.18); background: linear-gradient(135deg, rgba(124,106,247,0.06), rgba(239,68,68,0.04)); cursor:pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 12px 40px rgba(124,106,247,0.2)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
                    <div style="font-size: 2.2rem; margin-bottom: 10px; filter: drop-shadow(0 0 10px rgba(124,106,247,0.5));">⚔️</div>
                    <div style="font-size: 0.65rem; font-weight: 900; color: #7c6af7; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 6px; opacity: 0.8;">PvP Live</div>
                    <div style="font-size: 1rem; font-weight: 800; color:var(--text); margin-bottom: 6px; font-family: 'Outfit', sans-serif;">Neural Duels</div>
                    <div style="font-size: 0.78rem; color: rgba(255,255,255,0.4); line-height: 1.4;">${t('home_duels_desc')}</div>
                </article>

                <!-- Visual Graph card -->
                <article class="glass nebula-card" data-fn="openVisualGraph" style="padding: 24px; border-radius: 20px; border: 1px solid rgba(139,92,246,0.18); background: linear-gradient(135deg, rgba(0,212,255,0.04), rgba(139,92,246,0.06)); cursor:pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 12px 40px rgba(0,212,255,0.15)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
                    <div style="font-size: 2.2rem; margin-bottom: 10px; filter: drop-shadow(0 0 10px rgba(0,212,255,0.4));">🌌</div>
                    <div style="font-size: 0.65rem; font-weight: 900; color: #00d4ff; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 6px; opacity: 0.8;">3D Knowledge</div>
                    <div style="font-size: 1rem; font-weight: 800; color:var(--text); margin-bottom: 6px; font-family: 'Outfit', sans-serif;">Knowledge Graph</div>
                    <div style="font-size: 0.78rem; color: rgba(255,255,255,0.4); line-height: 1.4;">${t('home_graph_desc')}</div>
                </article>

            </div>
            ` : ''}

            <!-- TESTER MISSION CARD -->
            ${(() => {
                const isTester = gState.isTester || localStorage.getItem('cortex_is_tester') === '1';
                const hasRequirement = gState.streak >= 2 || gState.xp >= 100 || gState.totalCards >= 20;
                if (!isTester && hasRequirement) {
                    return `
                    <div id="tester-mission-card-container" style="margin-bottom: 20px;">
                        <article class="glass nebula-card pulse-border" style="
                            padding: 28px 32px;
                            border-radius: 20px;
                            border: 1px solid rgba(16,185,129,0.3);
                            background: linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(124,58,237,0.04) 100%);
                            display: flex;
                            align-items: center;
                            gap: 24px;
                            flex-wrap: wrap;
                        ">
                            <div style="font-size:2.8rem; filter:drop-shadow(0 0 12px rgba(16,185,129,0.5)); flex-shrink:0;">🚀</div>
                            <div style="flex:1; min-width:180px;">
                                <div style="font-size:0.65rem; font-weight:900; color:#10b981; text-transform:uppercase; letter-spacing:0.2em; margin-bottom:5px; opacity:0.9; display:flex; align-items:center; gap:6px;">
                                    <span>Missione Speciale</span>
                                    <span style="background:#10b981; color:#0e0e16; padding:2px 6px; border-radius:4px; font-size:0.55rem; font-weight:900;">PREMIUM</span>
                                </div>
                                <div style="font-size:1.1rem; font-weight:900; color:var(--text); margin-bottom:4px; font-family:'Outfit',sans-serif;">
                                    Diventa Tester &amp; Ricevi Cortex Premium Gratis!
                                </div>
                                <div style="font-size:0.8rem; color:rgba(255,255,255,0.65); line-height:1.45;">
                                    Aiutaci a pubblicare Cortex su Google Play Store! Ti bastano 3 semplici passaggi per sbloccare il piano <strong style="color:#10b981;">Cortex Premium (Student)</strong> gratuito per sempre e ricevere il rarissimo badge leggendario <strong style="color:var(--accent2)">Pioniere Android</strong>! 🏆
                                </div>
                            </div>
                            <button
                                onclick="window._showTesterModal && window._showTesterModal()"
                                style="
                                    background: linear-gradient(135deg, #10b981, #059669);
                                    color: #0e0e16;
                                    border: none;
                                    border-radius: 14px;
                                    padding: 14px 30px;
                                    font-weight: 900;
                                    font-size: 0.9rem;
                                    cursor: pointer;
                                    font-family: inherit;
                                    box-shadow: 0 8px 24px rgba(16,185,129,0.35);
                                    white-space: nowrap;
                                    transition: transform 0.15s, box-shadow 0.15s;
                                "
                                onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 12px 30px rgba(16,185,129,0.5)'"
                                onmouseout="this.style.transform='none';this.style.boxShadow='0 8px 24px rgba(16,185,129,0.35)'"
                            >
                                Partecipa Ora ⚡
                            </button>
                        </article>
                    </div>
                    `;
                }
                return '';
            })()}

            <!-- (Invita-un-amico RIMOSSO dalla Home 14/07/2026 — c'è la
                 condivisione dopo lo studio, qui era solo rumore) -->

            <!-- FEEDBACK — redesign 14/07/2026: card sobria, form in riga,
                 messaggi community chiusi in una tendina -->
            <article class="glass nebula-card" style="padding: 22px 24px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.02); backdrop-filter: var(--glass-blur);">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                    <span style="font-size:1.2rem;">💬</span>
                    <div>
                        <div style="font-weight:800; font-size:0.95rem; color:var(--text);">Hai un'idea o qualcosa non va?</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Scrivici — leggiamo tutto e rispondiamo qui.</div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:minmax(120px,180px) 1fr auto; gap:10px; align-items:stretch;">
                    <input type="text" id="feedback-alias" aria-label="Tuo identificativo" placeholder="Nome" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; color:var(--text); padding: 11px 13px; font-size:0.85rem; font-family:inherit; outline:none;">
                    <textarea id="feedback-text" aria-label="Feedback" placeholder="Cosa possiamo migliorare?" rows="1" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; color:var(--text); padding: 11px 13px; font-size:0.85rem; resize:none; font-family:inherit; outline:none; min-height:42px;"></textarea>
                    <button class="btn btn-primary" data-fn="submitFeedback" style="padding:0 22px; border-radius:10px; font-weight:800; font-size:0.85rem; white-space:nowrap;">
                        Invia
                    </button>
                </div>
                <details style="margin-top:14px;">
                    <summary style="cursor:pointer; font-size:0.75rem; color:var(--text-muted); font-weight:700; list-style-position:inside;">Messaggi della community</summary>
                    <div id="feedback-list" style="margin-top:12px; display:flex; flex-direction:column; gap:12px; max-height:320px; overflow-y:auto; padding-right:8px;"></div>
                </details>
            </article>

            <style>
            @media (max-width: 620px) {
                article.glass > div[style*="grid-template-columns:minmax"] {
                    grid-template-columns: 1fr !important;
                }
            }
            </style>

        </div>

        <style>
        @media (max-width: 600px) {
            .dashboard-nebula > div:last-child {
                grid-template-columns: 1fr !important;
            }
            .feature-discovery-row {
                grid-template-columns: 1fr !important;
            }
        }
        </style>
    `;

    // Avvia il neural trainer async
    renderNeuralTrainer();

    // Inietta banner evento stagionale (Maturità, Sessione, ecc.) se attivo.
    // Viene fatto qui (post-render) per garantire che #home-event-banner-slot esista
    // nel DOM — initSeasonalEvents() ha un problema di timing se chiamato prima di renderHome().
    const bannerSlot = container.querySelector('#home-event-banner-slot');
    if (bannerSlot) {
        const activeEvent = getActiveEvent();
        if (activeEvent) {
            const banner = buildEventBanner(activeEvent);
            if (banner) bannerSlot.replaceChildren(banner);
        }
    }

    // Carica messaggi di feedback — visibili a tutti, anche senza login
    const tryLoadFeedback = () => {
        if (typeof _deps.loadFeedbackMessages === 'function') {
            _deps.loadFeedbackMessages();
        } else if (typeof window.loadFeedbackMessages === 'function') {
            window.loadFeedbackMessages();
        }
    };
    tryLoadFeedback();
    // Secondo tentativo dopo 1.5s nel caso Firebase non sia ancora pronto
    setTimeout(tryLoadFeedback, 1500);
}

// ── TESTER RECRUITMENT MODAL SYSTEM ──────────────────────────────────────────
window._showTesterModal = () => {
    // Evita modali duplicati nel DOM
    document.getElementById('tester-recruitment-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'tester-recruitment-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; z-index: 12000;
        display: flex; align-items: center; justify-content: center;
        background: rgba(14, 14, 22, 0.85); backdrop-filter: blur(12px);
        opacity: 0; transition: opacity 0.3s ease;
        padding: 20px;
    `;

    let currentStep = 1;
    const groupLink = 'https://groups.google.com/g/cortex-testers';
    const optInLink = 'https://play.google.com/apps/testing/it.cortexapp.app';

    const renderModalContent = () => {
        let stepHtml = '';
        if (currentStep === 1) {
            stepHtml = `
                <div style="font-size: 3.5rem; margin-bottom: 12px; animation: bouncePop 1.2s infinite alternate;">👥</div>
                <h2 style="font-family:'Outfit', sans-serif; font-size: 1.6rem; font-weight: 900; color: #fff; margin-bottom: 10px;">Passo 1: Gruppo Google</h2>
                <p style="color: rgba(255,255,255,0.7); font-size: 0.88rem; line-height: 1.6; margin-bottom: 24px;">
                    Google richiede che tutti i partecipanti della closed beta facciano parte del gruppo dei tester autorizzati. Unisciti con l'account Google che usi sul Play Store!
                </p>
                <div style="display: flex; flex-direction: column; gap: 12px; align-items: center; width: 100%;">
                    <a href="${groupLink}" target="_blank" id="tester-step-1-btn" style="
                        width: 100%; text-decoration: none; text-align: center;
                        background: linear-gradient(135deg, var(--accent), #6d28d9);
                        color: #fff; border-radius: 14px; padding: 15px;
                        font-weight: 800; font-size: 0.95rem; cursor: pointer;
                        box-shadow: 0 8px 24px rgba(124,58,237,0.3);
                        display: flex; align-items: center; justify-content: center; gap: 8px;
                        transition: transform 0.2s;
                    " onclick="this.style.transform='scale(0.98)'">
                        Unisciti al Gruppo Google 🚀
                    </a>
                    <button id="tester-next-1" style="
                        background: none; border: none; color: #10b981; 
                        font-weight: 700; font-size: 0.85rem; cursor: pointer;
                        text-decoration: underline; margin-top: 10px;
                    ">Sono già iscritto / Avanti →</button>
                </div>
            `;
        } else if (currentStep === 2) {
            stepHtml = `
                <div style="font-size: 3.5rem; margin-bottom: 12px;">📱</div>
                <h2 style="font-family:'Outfit', sans-serif; font-size: 1.6rem; font-weight: 900; color: #fff; margin-bottom: 10px;">Passo 2: Abilita il Test</h2>
                <p style="color: rgba(255,255,255,0.7); font-size: 0.88rem; line-height: 1.6; margin-bottom: 24px;">
                    Perfetto! Ora clicca sul link di opt-in ufficiale del Play Store per registrare il tuo account come tester e abilitare il download dell'app nativa.
                </p>
                <div style="display: flex; flex-direction: column; gap: 12px; align-items: center; width: 100%;">
                    <a href="${optInLink}" target="_blank" id="tester-step-2-btn" style="
                        width: 100%; text-decoration: none; text-align: center;
                        background: linear-gradient(135deg, #10b981, #059669);
                        color: #0e0e16; border-radius: 14px; padding: 15px;
                        font-weight: 900; font-size: 0.95rem; cursor: pointer;
                        box-shadow: 0 8px 24px rgba(16,185,129,0.3);
                        display: flex; align-items: center; justify-content: center; gap: 8px;
                        transition: transform 0.2s;
                    " onclick="this.style.transform='scale(0.98)'">
                        Registrati come Tester su Play Store 📲
                    </a>
                    <div style="display:flex; justify-content:space-between; width:100%; margin-top:10px;">
                        <button id="tester-back-2" style="background:none; border:none; color:rgba(255,255,255,0.4); font-weight:700; font-size:0.82rem; cursor:pointer;">← Indietro</button>
                        <button id="tester-next-2" style="background:none; border:none; color:#10b981; font-weight:700; font-size:0.82rem; cursor:pointer; text-decoration:underline;">Già fatto / Avanti →</button>
                    </div>
                </div>
            `;
        } else if (currentStep === 3) {
            stepHtml = `
                <div style="font-size: 3.5rem; margin-bottom: 12px;">🎁</div>
                <h2 style="font-family:'Outfit', sans-serif; font-size: 1.6rem; font-weight: 900; color: #fff; margin-bottom: 10px;">Passo 3: Conferma e Sblocca</h2>
                <p style="color: rgba(255,255,255,0.7); font-size: 0.88rem; line-height: 1.6; margin-bottom: 24px;">
                    Fantastico! Conferma la tua partecipazione cliccando sul bottone sotto. Attiveremo all'istante la licenza **Cortex Premium (Student)** gratis sul tuo account e ti assegneremo il badge leggendario!
                </p>
                <div style="display: flex; flex-direction: column; gap: 12px; align-items: center; width: 100%;">
                    <button id="tester-claim-btn" style="
                        width: 100%; border: none;
                        background: linear-gradient(135deg, var(--accent2), #ec4899);
                        color: #fff; border-radius: 14px; padding: 16px;
                        font-weight: 900; font-size: 1.05rem; cursor: pointer;
                        box-shadow: 0 10px 28px rgba(236,72,153,0.35);
                        display: flex; align-items: center; justify-content: center; gap: 8px;
                        transition: transform 0.2s;
                    " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                        Sblocca Cortex Premium Gratis! 🎉
                    </button>
                    <button id="tester-back-3" style="background:none; border:none; color:rgba(255,255,255,0.4); font-weight:700; font-size:0.82rem; cursor:pointer; align-self: flex-start; margin-top: 10px;">← Indietro</button>
                </div>
            `;
        }

        modal.innerHTML = `
            <div class="glass" style="
                background: linear-gradient(135deg, rgba(14, 14, 22, 0.98), rgba(20, 20, 35, 0.98));
                border: 1px solid rgba(16, 185, 129, 0.35);
                border-radius: 28px;
                padding: 40px 32px;
                text-align: center;
                max-width: 420px;
                width: 100%;
                box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7), 0 0 30px rgba(16, 185, 129, 0.15);
                position: relative;
                animation: authPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            ">
                <!-- Close Button -->
                <button id="close-tester-modal-btn" style="
                    position: absolute; top: 18px; right: 18px;
                    background: none; border: none; color: rgba(255,255,255,0.3);
                    font-size: 1.2rem; cursor: pointer; transition: color 0.2s;
                " onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.3)'">✕</button>

                <!-- Steps indicators -->
                <div style="display:flex; justify-content:center; gap:8px; margin-bottom:24px;">
                    <div style="width:24px; height:6px; border-radius:3px; background:${currentStep >= 1 ? '#10b981' : 'rgba(255,255,255,0.1)'}; transition:all 0.3s;"></div>
                    <div style="width:24px; height:6px; border-radius:3px; background:${currentStep >= 2 ? '#10b981' : 'rgba(255,255,255,0.1)'}; transition:all 0.3s;"></div>
                    <div style="width:24px; height:6px; border-radius:3px; background:${currentStep >= 3 ? '#ec4899' : 'rgba(255,255,255,0.1)'}; transition:all 0.3s;"></div>
                </div>

                ${stepHtml}
            </div>
        `;

        // Bind interactive events
        modal.querySelector('#close-tester-modal-btn')?.addEventListener('click', () => {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 300);
        });

        modal.querySelector('#tester-step-1-btn')?.addEventListener('click', () => {
            setTimeout(() => {
                currentStep = 2;
                renderModalContent();
            }, 1000);
        });

        modal.querySelector('#tester-next-1')?.addEventListener('click', () => {
            currentStep = 2;
            renderModalContent();
        });

        modal.querySelector('#tester-step-2-btn')?.addEventListener('click', () => {
            setTimeout(() => {
                currentStep = 3;
                renderModalContent();
            }, 1000);
        });

        modal.querySelector('#tester-next-2')?.addEventListener('click', () => {
            currentStep = 3;
            renderModalContent();
        });

        modal.querySelector('#tester-back-2')?.addEventListener('click', () => {
            currentStep = 1;
            renderModalContent();
        });

        modal.querySelector('#tester-back-3')?.addEventListener('click', () => {
            currentStep = 2;
            renderModalContent();
        });

        modal.querySelector('#tester-claim-btn')?.addEventListener('click', async () => {
            // Salva lo stato in locale
            localStorage.setItem('cortex_is_tester', '1');
            localStorage.setItem('cortex_user_plan', 'student');

            // Salva lo stato su Firestore se loggato
            try {
                const uid = window._fbUserId || localStorage.getItem('cortex_uid');
                if (uid && window.firebase?.apps?.length) {
                    await window.firebase.app().firestore()
                        .collection('users').doc(uid)
                        .set({ isTester: true, plan: 'student', planActivatedTs: Date.now() }, { merge: true });
                }
            } catch (err) {
                console.error('[TesterReward] Firestore sync error:', err);
            }

            // Assegna il badge e gli XP
            try {
                earnBadge('android_pioneer');
                awardXP(100, 'Missione Android Tester');
            } catch (_) {}

            // Effetto coriandoli celebrativi
            if (typeof confetti === 'function') {
                confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
            }

            if (window.showToast) {
                window.showToast(t('home_premium_unlocked'), 'success');
            }

            // Chiudi modal
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.remove();
                // Ricarica la dashboard per rimuovere il widget e mostrare lo stemma
                renderHome();
            }, 300);
        });
    };

    document.body.appendChild(modal);
    renderModalContent();
    setTimeout(() => { modal.style.opacity = '1'; }, 50);
};


// ══════════════════════════════════════════════════════════════════════════════
// WORKOUT TRACKER — Palestra (GYM + CASA)
// ══════════════════════════════════════════════════════════════════════════════

const _WK_GROUPS = [
    { id:'push',    label:'Petto',   icon:'🏋️' },
    { id:'pull',    label:'Schiena', icon:'💪' },
    { id:'legs',    label:'Gambe',   icon:'🦵' },
    { id:'spalle',  label:'Spalle',  icon:'🔥' },
    { id:'braccia', label:'Braccia', icon:'💪' },
    { id:'full',    label:'Full',    icon:'⚡' },
];

const _WK_CASA = {
    push: { label:'PUSH — Petto · Spalle · Tricipiti', exercises:[
        { name:'Flessioni classiche',           s:4, r:'12-20',         rest:'2 min',   note:'Tecnica lenta; piedi su sedia se facili' },
        { name:'Flessioni mani larghe',         s:3, r:'10-15',         rest:'90 sec',  note:'Mani oltre larghezza spalle, petto esterno' },
        { name:'Flessioni piedi su sedia',      s:3, r:'10-15',         rest:'90 sec',  note:'Petto alto e spalle anteriori' },
        { name:'Flessioni a V',                 s:3, r:'8-12',          rest:'90 sec',  note:'Bacino alto a V invertita, testa verso pavimento' },
        { name:'Flessioni a diamante',          s:3, r:'AMRAP (8-15)',  rest:'60 sec',  note:'Mani a rombo sotto il petto, tricipiti' },
        { name:'Dip tra sedie',                 s:3, r:'10-15',         rest:'90 sec',  note:'Gambe distese per + difficoltà' },
    ]},
    pull: { label:'PULL — Schiena · Bicipiti · Deltoide Post.', exercises:[
        { name:'Trazioni / Rematore tavolo',    s:4, r:'AMRAP (5-10)',  rest:'3 min',   note:'Senza sbarra: tavolo robusto, petto verso bordo' },
        { name:'Superman',                      s:4, r:'15-20',         rest:'60 sec',  note:'Prono, solleva braccia e gambe, contrai 2 sec' },
        { name:'Braccia Y-T-W a terra',         s:3, r:'10 x lettera',  rest:'60 sec',  note:'Prono su tappetino, disegna Y-T-W con le braccia' },
        { name:'Angeli a terra',                s:3, r:'15-20',         rest:'60 sec',  note:'Prono, braccia lungo fianchi, aprile verso l\'alto' },
        { name:'Curl isometrico (asciugamano)', s:3, r:'3-4 × 20-30s', rest:'60 sec',  note:'Piede sull\'asciugamano, palmi in su, tieni tensione' },
        { name:'Curl resistenza manuale',       s:3, r:'8-10 (3s hold)',rest:'60 sec',  note:'Un braccio spinge, l\'altro resiste, alternare' },
    ]},
    legs: { label:'LEGS — Quad · Femorali · Glutei · Polpacci', exercises:[
        { name:'Squat lento',                   s:4, r:'15-20',         rest:'2 min',   note:'Sotto il parallelo, controlla l\'eccentrica' },
        { name:'Affondi camminando',            s:3, r:'12-15 /gamba',  rest:'90 sec',  note:'Passo lungo, ginocchio quasi a terra' },
        { name:'Stacco gamba sola',             s:3, r:'10-12 /gamba',  rest:'90 sec',  note:'Schiena piatta, senti i femorali' },
        { name:'Ponte glutei',                  s:3, r:'15-20',         rest:'90 sec',  note:'Scapole appoggiate, spingi fianchi in alto' },
        { name:'Affondo bulgaro',               s:3, r:'10-12 /gamba',  rest:'2 min',   note:'Piede su sedia, focus glutei e quad' },
        { name:'Sedia al muro',                 s:3, r:'30-45 sec',     rest:'60 sec',  note:'Cosce parallele al pavimento' },
        { name:'Salite sulle punte',            s:4, r:'20-25',         rest:'60 sec',  note:'ROM completo, stretching in basso, pausa in cima' },
    ]},
    spalle: { label:'SPALLE — Deltoidi · Tricipiti · Bicipiti', exercises:[
        { name:'Flessioni a V piedi su sedia',  s:4, r:'8-12',          rest:'2 min',   note:'Più piedi sono alti, più lavorano le spalle' },
        { name:'Alzate laterali (bottiglie)',    s:4, r:'12-15',         rest:'60 sec',  note:'Braccia quasi tese, pausa al picco' },
        { name:'Braccia a Y a terra',           s:3, r:'15-20',         rest:'60 sec',  note:'Prono, braccia a V, contrai deltoide post.' },
        { name:'Curl isometrico (asciugamano)', s:3, r:'3-4 × 20-30s', rest:'60 sec',  note:'Stessa tecnica Pull' },
        { name:'Dip sedie strette',             s:3, r:'10-15',         rest:'90 sec',  note:'Gomiti vicini al corpo, focus tricipiti' },
    ]},
    braccia: { label:'BRACCIA — corpo libero', exercises:[
        { name:'Curl resistenza manuale',       s:4, r:'8-10 (3s hold)',rest:'60 sec',  note:'Un braccio spinge, l\'altro resiste' },
        { name:'Curl isometrico (asciugamano)', s:3, r:'3-4 × 20-30s', rest:'60 sec',  note:'Piede sull\'asciugamano, palmi in su' },
        { name:'Flessioni a diamante',          s:3, r:'AMRAP (8-15)',  rest:'60 sec',  note:'Tricipiti' },
        { name:'Dip tra sedie',                 s:3, r:'10-15',         rest:'90 sec',  note:'Gomiti stretti' },
    ]},
    full: { label:'FULL BODY — corpo libero', exercises:[
        { name:'Squat lento',                   s:3, r:'15-20', rest:'2 min',  note:'' },
        { name:'Flessioni classiche',           s:3, r:'12-20', rest:'90 sec', note:'' },
        { name:'Ponte glutei',                  s:3, r:'15-20', rest:'90 sec', note:'' },
        { name:'Flessioni a V',                 s:3, r:'8-12',  rest:'90 sec', note:'' },
        { name:'Affondi camminando',            s:3, r:'10 /gamba', rest:'90 sec', note:'' },
        { name:'Superman',                      s:3, r:'15-20', rest:'60 sec', note:'' },
    ]},
};

const _WK_GYM = {
    push: [
        { name:'Panca Piana Bilanciere',    s:4, r:'6-8'   },
        { name:'Panca Inclinata Manubri',   s:3, r:'8-12'  },
        { name:'Croci ai Cavi',             s:3, r:'12-15' },
        { name:'Shoulder Press Manubri',    s:3, r:'10-12' },
        { name:'Tricipiti ai Cavi',         s:3, r:'12-15' },
        { name:'Dip Parallele',             s:3, r:'8-12'  },
    ],
    pull: [
        { name:'Lat Machine Presa Larga',   s:4, r:'8-12'  },
        { name:'Rematore Bilanciere',       s:3, r:'8-10'  },
        { name:'Pulley Basso',              s:3, r:'10-12' },
        { name:'Face Pull ai Cavi',         s:3, r:'15-20' },
        { name:'Curl Bilanciere EZ',        s:3, r:'10-12' },
        { name:'Curl Manubri Alternati',    s:3, r:'12-15' },
    ],
    legs: [
        { name:'Squat Bilanciere',          s:4, r:'6-8'   },
        { name:'Leg Press',                 s:3, r:'10-12' },
        { name:'Romanian Deadlift',         s:3, r:'10-12' },
        { name:'Hip Thrust',                s:3, r:'12-15' },
        { name:'Leg Curl',                  s:3, r:'12-15' },
        { name:'Calf Raise (macchina)',      s:4, r:'15-20' },
    ],
    spalle: [
        { name:'Military Press Bilanciere', s:4, r:'6-10'  },
        { name:'Alzate Laterali Manubri',   s:4, r:'12-15' },
        { name:'Alzate Frontali',           s:3, r:'12-15' },
        { name:'Reverse Fly Manubri',       s:3, r:'12-15' },
        { name:'Curl Manubri',              s:3, r:'10-12' },
        { name:'Dip Parallele',             s:3, r:'10-15' },
    ],
    braccia: [
        { name:'Curl Bilanciere EZ',        s:4, r:'10-12' },
        { name:'Curl Manubri Alternati',    s:3, r:'10-12' },
        { name:'Presa Martello',            s:3, r:'12-15' },
        { name:'Tricipiti ai Cavi',         s:3, r:'12-15' },
        { name:'Skull Crusher',             s:3, r:'10-12' },
        { name:'Dip Parallele',             s:3, r:'10-15' },
    ],
    full: [
        { name:'Squat Bilanciere',          s:3, r:'8-10'  },
        { name:'Panca Piana',               s:3, r:'8-10'  },
        { name:'Stacco Convenzionale',      s:3, r:'6-8'   },
        { name:'Lat Machine',               s:3, r:'10-12' },
        { name:'Military Press',            s:3, r:'10-12' },
        { name:'Plank',                     s:3, r:'30-45s'},
    ],
};

// ── helpers ───────────────────────────────────────────────────────────────────
function _wkGetLog() { return JSON.parse(localStorage.getItem('cortex_workout_log')||'[]'); }
function _wkSaveLog(l) { localStorage.setItem('cortex_workout_log', JSON.stringify(l)); }

function _wkGymStreak() {
    const log = _wkGetLog();
    if (!log.length) return 0;
    const days = [...new Set(log.map(e=>e.date))].sort();
    let streak = 1;
    for (let i = days.length-1; i > 0; i--) {
        const a = new Date(days[i]), b = new Date(days[i-1]);
        if ((a - b) / 86400000 === 1) streak++; else break;
    }
    return streak;
}

export function renderPalestraWidget() {
    const today = todayStr();
    const dayNames = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
    const dayName  = dayNames[new Date().getDay()];
    const log      = _wkGetLog();
    const todaySess= log.filter(e => e.date === today);
    const streak   = _wkGymStreak();

    return `
    <article class="glass" style="
        padding:18px 20px; border-radius:18px; margin-bottom:20px;
        border:1px solid rgba(245,158,11,0.18);
        background:linear-gradient(135deg,rgba(245,158,11,0.06),rgba(239,68,68,0.03));
    ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:1.2rem;">🏋️</span>
                <span style="font-size:0.6rem;font-weight:900;color:#f59e0b;text-transform:uppercase;letter-spacing:0.2em;">PALESTRA</span>
            </div>
            ${streak > 0 ? `<span style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:20px;padding:3px 10px;font-size:0.7rem;font-weight:800;color:#f59e0b;">🔥 ${streak} di fila</span>` : ''}
        </div>

        <div style="font-size:0.8rem;color:rgba(255,255,255,0.45);margin-bottom:12px;">
            📅 ${dayName} — quale sessione?
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${_WK_GROUPS.map(g => `
                <button
                    onclick="window._openWorkoutFlow&&window._openWorkoutFlow('${g.id}')"
                    style="
                        padding:7px 14px;border-radius:20px;cursor:pointer;
                        border:1px solid rgba(255,255,255,0.12);
                        background:rgba(255,255,255,0.05);
                        color:rgba(255,255,255,0.75);
                        font-family:inherit;font-weight:700;font-size:0.78rem;
                        transition:background 0.15s,border-color 0.15s;
                    "
                    onmouseover="this.style.borderColor='rgba(245,158,11,0.5)';this.style.color='#f59e0b'"
                    onmouseout="this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.75)'"
                >${g.icon} ${g.label}</button>
            `).join('')}
        </div>

        ${todaySess.length ? `
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;">
            ${todaySess.map(s=>`
                <span style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:2px 8px;font-size:0.68rem;color:#10b981;">
                    ✓ ${s.muscle} — ${s.type.toUpperCase()}
                </span>`).join('')}
        </div>` : ''}
    </article>`;
}

// ── flusso GYM/CASA → tabella ─────────────────────────────────────────────────
window._openWorkoutFlow = function(muscleId) {
    document.getElementById('wk-flow-modal')?.remove();

    const grp  = _WK_GROUPS.find(g => g.id === muscleId) || _WK_GROUPS[0];
    let type   = null;
    let rows   = [];

    function buildRows(exList) {
        rows = exList.map(e => ({
            name:     e.name,
            plannedS: e.s,
            plannedR: e.r || '',
            rest:     e.rest || '',
            hint:     e.note || '',
            weight:   '',
            note:     '',
        }));
    }

    const modal = document.createElement('div');
    modal.id = 'wk-flow-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:13000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);';

    let step = 1; // 1=gym/casa, 2=tabella

    function render() {
        let body = '';

        if (step === 1) {
            body = `
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.35);margin-bottom:6px;">${grp.icon} ${grp.label}</div>
            <div style="font-size:1.05rem;font-weight:900;color:var(--text);margin-bottom:18px;">Dove ti sei allenato?</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
                <button onclick="window._wkChooseType('gym')" style="
                    padding:26px 12px;border-radius:16px;
                    border:2px solid ${type==='gym'?'#f59e0b':'rgba(255,255,255,0.1)'};
                    background:${type==='gym'?'rgba(245,158,11,0.1)':'rgba(255,255,255,0.03)'};
                    color:${type==='gym'?'#f59e0b':'rgba(255,255,255,0.7)'};
                    font-family:inherit;font-weight:900;font-size:0.95rem;cursor:pointer;text-align:center;
                "><div style="font-size:2rem;margin-bottom:6px;">🏋️</div>GYM<div style="font-size:0.68rem;font-weight:600;color:rgba(255,255,255,0.3);margin-top:3px;">Pesi · macchine</div></button>
                <button onclick="window._wkChooseType('casa')" style="
                    padding:26px 12px;border-radius:16px;
                    border:2px solid ${type==='casa'?'#10b981':'rgba(255,255,255,0.1)'};
                    background:${type==='casa'?'rgba(16,185,129,0.1)':'rgba(255,255,255,0.03)'};
                    color:${type==='casa'?'#10b981':'rgba(255,255,255,0.7)'};
                    font-family:inherit;font-weight:900;font-size:0.95rem;cursor:pointer;text-align:center;
                "><div style="font-size:2rem;margin-bottom:6px;">🏠</div>CASA<div style="font-size:0.68rem;font-weight:600;color:rgba(255,255,255,0.3);margin-top:3px;">Corpo libero</div></button>
            </div>
            ${type ? `<button onclick="window._wkGoTable()" style="
                width:100%;padding:14px;border:none;border-radius:12px;
                background:${type==='gym'?'linear-gradient(135deg,#f59e0b,#d97706)':'linear-gradient(135deg,#10b981,#059669)'};
                color:#fff;font-family:inherit;font-weight:900;font-size:0.9rem;cursor:pointer;
            ">Vedi scheda ${type.toUpperCase()} →</button>` : ''}`;

        } else if (step === 2) {
            const isGym  = type === 'gym';
            const accent = isGym ? '#f59e0b' : '#10b981';
            const label  = isGym ? `GYM — ${grp.label}` : (_WK_CASA[muscleId]||_WK_CASA.full).label;
            body = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
                <span style="font-size:1.1rem;">${isGym?'🏋️':'🏠'}</span>
                <div>
                    <div style="font-size:0.58rem;font-weight:900;color:${accent};text-transform:uppercase;letter-spacing:0.2em;">${isGym?'GYM':'CASA'}</div>
                    <div style="font-size:0.85rem;font-weight:800;color:var(--text);">${label}</div>
                </div>
            </div>
            <div style="overflow-x:auto;margin-bottom:14px;">
            <table style="width:100%;border-collapse:collapse;font-size:0.77rem;">
                <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.07);">
                    <th style="text-align:left;padding:5px 3px;color:rgba(255,255,255,0.35);font-size:0.62rem;text-transform:uppercase;">Esercizio</th>
                    <th style="text-align:center;padding:5px 3px;color:rgba(255,255,255,0.35);font-size:0.62rem;width:40px;">Ser.</th>
                    <th style="text-align:center;padding:5px 3px;color:rgba(255,255,255,0.35);font-size:0.62rem;width:60px;">Reps</th>
                    <th style="text-align:center;padding:5px 3px;color:rgba(255,255,255,0.35);font-size:0.62rem;width:54px;">${isGym?'Kg':'RIR'}</th>
                    <th style="text-align:left;padding:5px 3px;color:rgba(255,255,255,0.35);font-size:0.62rem;">Note</th>
                </tr></thead>
                <tbody>
                ${rows.map((r,i)=>`
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                        <td style="padding:7px 3px;color:var(--text);font-weight:600;line-height:1.3;">
                            ${r.name}
                            ${r.hint?`<div style="font-size:0.6rem;color:rgba(255,255,255,0.28);margin-top:2px;">${r.hint}</div>`:''}
                        </td>
                        <td style="text-align:center;padding:7px 3px;">
                            <input type="number" min="1" max="10" value="${r.plannedS}" data-wk="${i}" data-f="s"
                                oninput="window._wkUpd(${i},'s',this.value)"
                                style="width:34px;text-align:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:#fff;padding:3px;font-family:inherit;font-size:0.78rem;">
                        </td>
                        <td style="text-align:center;padding:7px 3px;">
                            <input type="text" value="${r.plannedR}" data-wk="${i}" data-f="r"
                                oninput="window._wkUpd(${i},'r',this.value)"
                                style="width:52px;text-align:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:#fff;padding:3px;font-family:inherit;font-size:0.75rem;">
                        </td>
                        <td style="text-align:center;padding:7px 3px;">
                            <input type="text" placeholder="${isGym?'0':'1-3'}" data-wk="${i}" data-f="w"
                                oninput="window._wkUpd(${i},'w',this.value)"
                                style="width:46px;text-align:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:#fff;padding:3px;font-family:inherit;font-size:0.75rem;">
                        </td>
                        <td style="padding:7px 3px;">
                            <input type="text" placeholder="…" data-wk="${i}" data-f="note"
                                oninput="window._wkUpd(${i},'note',this.value)"
                                style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:5px;color:rgba(255,255,255,0.55);padding:3px;font-family:inherit;font-size:0.73rem;">
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <button onclick="window._wkBack()" style="padding:12px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:none;color:rgba(255,255,255,0.45);font-family:inherit;font-size:0.82rem;cursor:pointer;">← Indietro</button>
                <button onclick="window._wkSave('${muscleId}')" style="padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,${accent},${accent}bb);color:#fff;font-family:inherit;font-weight:900;font-size:0.88rem;cursor:pointer;">✓ Salva</button>
            </div>`;
        }

        modal.innerHTML = `
        <div style="
            background:rgba(12,12,22,0.98);border:1px solid rgba(255,255,255,0.09);
            border-radius:22px 22px 0 0;padding:26px 22px 40px;
            width:100%;max-width:560px;max-height:90vh;overflow-y:auto;position:relative;
        ">
            <button onclick="document.getElementById('wk-flow-modal')?.remove()" style="position:absolute;top:14px;right:14px;background:none;border:none;color:rgba(255,255,255,0.3);font-size:1.1rem;cursor:pointer;">✕</button>
            <div style="width:36px;height:4px;background:rgba(255,255,255,0.12);border-radius:2px;margin:0 auto 18px;"></div>
            ${body}
        </div>`;
    }

    window._wkChooseType = function(t) { type = t; render(); };
    window._wkGoTable   = function() {
        const exList = type === 'gym'
            ? _WK_GYM[muscleId] || _WK_GYM.full
            : (_WK_CASA[muscleId] || _WK_CASA.full).exercises;
        buildRows(exList);
        step = 2;
        render();
    };
    window._wkBack = function() { step = 1; render(); };
    window._wkUpd  = function(i, field, val) {
        if (!rows[i]) return;
        if (field === 's') rows[i].plannedS = parseInt(val)||1;
        else if (field === 'r') rows[i].plannedR = val;
        else if (field === 'w') rows[i].weight = val;
        else if (field === 'note') rows[i].note = val;
    };
    window._wkSave = function(mid) {
        const log = _wkGetLog();
        const grpLabel = (_WK_GROUPS.find(g=>g.id===mid)||{}).label || mid;
        log.push({
            date: todayStr(),
            ts:   Date.now(),
            muscle: grpLabel,
            type,
            exercises: rows.map(r => ({
                name: r.name, series: r.plannedS,
                reps: r.plannedR, weight: r.weight, note: r.note,
            })),
        });
        _wkSaveLog(log);
        document.getElementById('wk-flow-modal')?.remove();
        if (window.showToast) window.showToast('💪 Sessione salvata!', 'success');
        // Aggiorna la widget nella home
        const slot = document.getElementById('palestra-widget-slot');
        if (slot) slot.innerHTML = renderPalestraWidget();
    };

    document.body.appendChild(modal);
    render();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};
