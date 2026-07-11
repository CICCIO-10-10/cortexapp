import { t } from '../core/i18n.js';
/**
 * modules/gamification.js — Phase 17
 *
 * Motore di gamification: livelli, badge, XP, streak.
 * Estratto da main.js (blocco GAMIFICATION ENGINE).
 *
 * Dipendenze iniettate via init():
 *   showToast  — notifiche badge unlock
 *
 * Import diretti (zero deps circolari):
 *   todayStr   ← js/utils.js
 *
 * Esporta:
 *   gState     — oggetto live (i consumer mutano le proprietà, non la reference)
 *   ALL_BADGES — array costante delle definizioni badge
 *   saveGState, getLevel, getNextLevel
 *   awardXP, earnBadge, checkBadges
 *   init       — inietta deps e chiama updateStreak() una volta
 */
import { todayStr } from '../js/utils.js';

// ── Costanti ─────────────────────────────────────────────────────────────────

const GAME_STATE_KEY = 'mm_gstate';

export const LEVELS = [
    { name: 'Novizio',  cls: 'novizio',  icon: '🌱', min: 0    },
    { name: 'Studente', cls: 'studente', icon: '📖', min: 100  },
    { name: 'Scholar',  cls: 'scholar',  icon: '🎓', min: 300  },
    { name: 'Campione', cls: 'campione', icon: '🏆', min: 700  },
    { name: 'Maestro',  cls: 'maestro',  icon: '⚡', min: 1500 },
];

export const ALL_BADGES = [
    { id: 'first_deck',    icon: '📚',  name: 'Prima Materia',    desc: 'Salvata la prima materia' },
    { id: 'first_card',    icon: '🃏',  name: 'Prima Carta',      desc: 'Studiata la prima flashcard' },
    { id: '50_cards',      icon: '🔥',  name: 'On Fire',          desc: '50 carte studiate' },
    { id: '200_cards',     icon: '⚡',  name: 'Velocista',        desc: '200 carte studiate' },
    { id: 'first_quiz',    icon: '🎯',  name: 'Quiz Master',      desc: 'Primo quiz completato' },
    { id: 'quiz_perfect',  icon: '💯',  name: 'Perfetto!',        desc: 'Quiz con 100% di risposta' },
    { id: 'first_voice',   icon: '🎙️', name: 'Voce di Feynman',  desc: 'Registrata prima nota vocale' },
    { id: 'first_plan',    icon: '📅',  name: 'Organizzato',      desc: 'Generato primo piano di studio' },
    { id: 'streak_3',      icon: '🌟',  name: '3 Giorni',         desc: 'Streak di 3 giorni' },
    { id: 'streak_7',      icon: '🌙',  name: 'Una Settimana',    desc: 'Streak di 7 giorni' },
    { id: 'streak_30',     icon: '🏅',  name: 'Un Mese',          desc: 'Streak di 30 giorni' },
    { id: 'level_campione',icon: '🏆',  name: 'Campione!',        desc: 'Raggiunto livello Campione' },
    { id: 'android_pioneer',icon: '🚀',  name: 'Pioniere Android', desc: 'Registrato come Tester Ufficiale della closed beta' },
];

// ── Stato live ────────────────────────────────────────────────────────────────

export let gState = (() => {
    const defaults = {
        xp: 0, streak: 0, lastDate: '', badges: [],
        totalCards: 0, quizDone: 0, quizRecords: {},
        streakFreezes: 0,          // Streak Freeze acquistabili con Neural Sparks
        streakFreezeUsed: false,   // Ha già usato un freeze oggi?
        lastMilestoneSeen: 0,      // Ultimo milestone streak annunciato
    };
    const saved = JSON.parse(localStorage.getItem(GAME_STATE_KEY) || '{}');
    return { ...defaults, ...saved };
})();

// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = {
    showToast: () => {},
};

/**
 * Inietta le dipendenze e avvia lo streak giornaliero.
 * Chiamare una volta in main.js dopo che showToast è definita.
 */
export function init(deps) {
    _deps = { ..._deps, ...deps };
    updateStreak();
}

// ── Core functions ────────────────────────────────────────────────────────────

let _gCloudTimer = null;
export function saveGState() {
    localStorage.setItem(GAME_STATE_KEY, JSON.stringify(gState));
    // FIX "XP ballerina": l'XP viveva solo in localStorage e il cloud restava
    // stantio (si aggiornava solo col salvataggio dei deck) — al reload il
    // boot ripristinava il valore vecchio. Sync leggero e debounced qui.
    clearTimeout(_gCloudTimer);
    _gCloudTimer = setTimeout(() => {
        try {
            if (typeof firebase !== 'undefined' && firebase.apps?.length && window._fbUserId) {
                firebase.app().firestore().collection('users').doc(window._fbUserId)
                    .set({ gamification: JSON.parse(JSON.stringify(gState)) }, { merge: true })
                    .catch(() => {});
            }
        } catch (_) { /* offline o non loggato: il localStorage basta */ }
    }, 3000);
}

export function getLevel() {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (gState.xp >= LEVELS[i].min) return LEVELS[i];
    }
    return LEVELS[0];
}

export function getNextLevel() {
    const cur = getLevel();
    const idx = LEVELS.indexOf(cur);
    return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
}

export function awardXP(amount, label) {
    // Implementazione del Rate Limit Giornaliero (Prevenzione Farming/Bot)
    const today = todayStr();
    let dailyXP   = parseInt(localStorage.getItem('mm_daily_xp') || '0');
    let savedDate = localStorage.getItem('mm_daily_xp_date');

    // Check di reset a mezzanotte
    if (savedDate !== today) {
        dailyXP = 0;
        localStorage.setItem('mm_daily_xp_date', today);
    }

    const MAX_DAILY_XP = 1500; // Tetto limite massimo XP guadagnabili al giorno

    if (dailyXP >= MAX_DAILY_XP) {
        return; // Silent return se si supera la quota, per non frustrare l'utente che continua lo studio
    }

    // Assicura che l'assegnazione non sbordi il tetto giornaliero
    const actualAmount = Math.min(amount, MAX_DAILY_XP - dailyXP);

    const oldLevel = getLevel();
    gState.xp += actualAmount;
    dailyXP   += actualAmount;

    localStorage.setItem('mm_daily_xp', dailyXP.toString());
    saveGState();
    checkBadges();
    
    // Level Up Check
    const newLevel = getLevel();
    if (newLevel.min > oldLevel.min) {
        showLevelUp(newLevel);
    } else {
        showXPToast(`+${actualAmount} XP ${label}`);
    }

    // Ospite: al primo XP guadagnato, invita (una sola volta) a salvare i progressi
    if (localStorage.getItem('cortex_guest') === '1' && typeof window.__guestMaybePrompt === 'function') {
        setTimeout(() => window.__guestMaybePrompt(), 1400);
    }
}

export function earnBadge(id) {
    if (!gState.badges.includes(id)) {
        gState.badges.push(id);
        saveGState();
        const b = ALL_BADGES.find(x => x.id === id);
        if (b) {
            showBadgeUnlockCard(b);
        }
    }
}

/**
 * Mostra una mini-card condivisibile quando si sblocca un badge.
 * Include bottone share TikTok-ready.
 */
function showBadgeUnlockCard(badge) {
    // Rimuovi eventuale card precedente ancora visibile
    document.getElementById('badge-unlock-card')?.remove();

    const shareText = `Ho sbloccato il badge "${badge.name}" ${badge.icon} su Cortex 🧠\n${badge.desc}\ncortexapp.it\n#Cortex #StudyTok #Achievement`;

    const card = document.createElement('div');
    card.id = 'badge-unlock-card';
    card.style.cssText = `
        position:fixed; bottom:90px; left:50%; transform:translateX(-50%) translateY(20px);
        z-index:9000; background:linear-gradient(135deg,rgba(20,20,35,0.98),rgba(30,27,75,0.98));
        border:1px solid rgba(139,92,246,0.4); border-radius:20px;
        padding:16px 20px; min-width:280px; max-width:340px;
        display:flex; align-items:center; gap:14px;
        box-shadow:0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(139,92,246,0.15);
        opacity:0; transition:opacity 0.3s, transform 0.3s;
    `;
    card.innerHTML = `
        <div style="font-size:2.4rem; flex-shrink:0; filter:drop-shadow(0 0 12px rgba(245,158,11,0.5));">${badge.icon}</div>
        <div style="flex:1; min-width:0;">
            <div style="font-size:0.65rem; font-weight:800; color:#f59e0b; letter-spacing:0.15em; text-transform:uppercase; margin-bottom:2px;">Badge Sbloccato!</div>
            <div style="font-size:0.95rem; font-weight:800; color:var(--text); margin-bottom:2px;">${badge.name}</div>
            <div style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${badge.desc}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
            <button id="badge-share-btn" style="
                background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#fff;
                border:none; border-radius:10px; padding:7px 12px;
                font-weight:800; font-size:0.75rem; cursor:pointer; font-family:inherit;
            ">${t('study_share_short')}</button>
            <button id="badge-close-btn" style="
                background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.6);
                border:1px solid rgba(255,255,255,0.1); border-radius:10px;
                padding:5px 12px; font-size:0.7rem; cursor:pointer; font-family:inherit;
            ">✕</button>
        </div>
    `;

    document.body.appendChild(card);
    requestAnimationFrame(() => {
        card.style.opacity = '1';
        card.style.transform = 'translateX(-50%) translateY(0)';
    });

    card.querySelector('#badge-share-btn').addEventListener('click', async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: `Badge "${badge.name}" sbloccato!`, text: shareText });
            } else {
                await navigator.clipboard.writeText(shareText);
                if (_deps.showToast) _deps.showToast(t('copied_generic'), 'success');
            }
        } catch (e) {
            try { await navigator.clipboard.writeText(shareText); } catch {}
        }
    });

    const dismiss = () => {
        card.style.opacity = '0';
        card.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => card.remove(), 350);
    };
    card.querySelector('#badge-close-btn').addEventListener('click', dismiss);
    setTimeout(dismiss, 8000);
}

export function checkBadges() {
    if (gState.quizDone   >= 1)   earnBadge('first_quiz');
    if (gState.totalCards >= 50)  earnBadge('50_cards');
    if (gState.totalCards >= 200) earnBadge('200_cards');
    if (gState.streak     >= 3)   earnBadge('streak_3');
    if (gState.streak     >= 7)   earnBadge('streak_7');
    if (gState.streak     >= 30)  earnBadge('streak_30');
    if (gState.xp         >= 700) earnBadge('level_campione');
}

// ── Privata ───────────────────────────────────────────────────────────────────

function showXPToast(msg) {
    const t = document.getElementById('xp-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}


/**
 * Visualizzazione celebrativa del passaggio di livello
 */
function showLevelUp(level) {
    const overlay = document.createElement('div');
    overlay.className = 'level-up-overlay';
    overlay.id = 'level-up-celebration';

    // Share handler per questo level-up
    const shareText = `Ho appena raggiunto il livello ${level.name} ${level.icon} su Cortex!\n📚 Studio, quindi esisto.\ncortexapp.it\n#Cortex #StudyTok #LevelUp #Studenti`;
    window._shareLevelUp = async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: `Livello ${level.name} raggiunto!`, text: shareText });
            } else {
                await navigator.clipboard.writeText(shareText);
                if (_deps.showToast) _deps.showToast(t('copied_generic'), 'success');
            }
        } catch (e) {
            try { await navigator.clipboard.writeText(shareText); } catch {}
        }
    };

    overlay.innerHTML = `
        <div class="level-up-content">
            <div class="level-up-icon">${level.icon}</div>
            <div class="level-up-title">NUOVO LIVELLO!</div>
            <div class="level-up-subtitle">Hai raggiunto il grado di <b>${level.name}</b></div>
            <div style="display:flex;gap:10px;margin-top:8px;justify-content:center;flex-wrap:wrap;">
                <button class="level-up-btn" onclick="this.closest('.level-up-overlay').classList.remove('active'); setTimeout(()=>this.closest('.level-up-overlay').remove(),500)">CONTINUA</button>
                <button class="level-up-btn" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);backdrop-filter:blur(4px);" onclick="window._shareLevelUp && window._shareLevelUp()">${t('study_share_short')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Trigger confetti
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.5 },
            colors: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ffffff', '#fbbf24']
        });
    }

    // Activate with small delay for CSS transition
    setTimeout(() => overlay.classList.add('active'), 100);

    // Auto-dismiss after 10s
    setTimeout(() => {
        if (overlay && overlay.parentNode) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 600);
        }
    }, 10000);
}

/** Converte un oggetto Date in stringa YYYY-MM-DD usando il fuso locale. */
function _localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function updateStreak() {
    const today = todayStr(); // già locale grazie al fix in utils.js
    if (gState.lastDate === today) return; // già aggiornato oggi

    // Calcola "ieri" e "due giorni fa" nel fuso locale (non UTC)
    const yDate = new Date(); yDate.setDate(yDate.getDate() - 1);
    const yStr  = _localDateStr(yDate);

    if (gState.lastDate === yStr) {
        // Giorno consecutivo normale
        gState.streak += 1;
        gState.streakFreezeUsed = false; // reset freeze-used per nuovo giorno
    } else if (gState.lastDate) {
        // Giorno saltato: controlla se c'è un freeze disponibile
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const twoDaysStr = _localDateStr(twoDaysAgo);
        const isOneDayMissed = gState.lastDate === twoDaysStr;

        if (isOneDayMissed && gState.streakFreezes > 0 && !gState.streakFreezeUsed) {
            // Usa automaticamente uno streak freeze
            gState.streakFreezes -= 1;
            gState.streakFreezeUsed = true;
            gState.streak += 1;
            // Notifica: freeze usato automaticamente
            setTimeout(() => {
                if (_deps.showToast) {
                    _deps.showToast(`🧊 Streak Freeze usato! La tua serie di ${gState.streak} giorni è salva. Restano ${gState.streakFreezes} freeze.`, 'info');
                }
            }, 1500);
        } else {
            // Streak perso
            const lost = gState.streak;
            gState.streak = 1;
            if (lost >= 3) {
                setTimeout(() => {
                    if (_deps.showToast) _deps.showToast(`😢 Streak di ${lost} giorni perso! Riparti forte.`, 'info');
                }, 1200);
            }
        }
    } else {
        // Prima volta o lastDate vuoto
        gState.streak = 1;
    }

    gState.lastDate = today;
    saveGState();
    checkBadges();
    checkStreakMilestone();
}

// ── Streak Milestone ──────────────────────────────────────────────────────────
const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365];

function checkStreakMilestone() {
    const streak = gState.streak;
    const lastSeen = gState.lastMilestoneSeen || 0;

    // Trova il milestone più alto raggiunto e non ancora mostrato
    const newMilestone = STREAK_MILESTONES.filter(m => m <= streak && m > lastSeen).pop();
    if (!newMilestone) return;

    gState.lastMilestoneSeen = newMilestone;
    saveGState();

    setTimeout(() => showStreakMilestone(newMilestone), 800);
}

function showStreakMilestone(days) {
    const icons = { 3: '🌟', 7: '🔥', 14: '💪', 30: '🏅', 50: '🚀', 100: '🏆', 365: '👑' };
    const msgs  = {
        3:   'Sei giorni dalla parte giusta!',
        7:   'Una settimana consecutiva! Sei incredibile.',
        14:  'Due settimane senza fermarti! 🔥',
        30:  'UN MESE di studio ogni giorno. Sei una leggenda.',
        50:  '50 giorni! La disciplina è il tuo superpotere.',
        100: '100 giorni. NIENTE PUÒ FERMARTI. 🏆',
        365: '365 giorni. Un anno intero. Sei un\'ispirazione assoluta. 👑',
    };
    const icon = icons[days] || '🔥';
    const msg  = msgs[days]  || `${days} giorni di streak!`;

    // Overlay celebrativo
    const overlay = document.createElement('div');
    overlay.id = 'streak-milestone-overlay';
    overlay.style.cssText = `
        position:fixed; inset:0; z-index:10000;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,0.75); backdrop-filter:blur(8px);
        opacity:0; transition:opacity 0.4s;
    `;
    overlay.innerHTML = `
        <div style="
            background:linear-gradient(135deg,rgba(14,14,22,0.98),rgba(20,20,35,0.98));
            border:1px solid rgba(139,92,246,0.4);
            border-radius:28px; padding:48px 40px; text-align:center;
            max-width:380px; width:90%;
            box-shadow:0 32px 80px rgba(0,0,0,0.8), 0 0 40px rgba(139,92,246,0.2);
        ">
            <div style="font-size:4.5rem; margin-bottom:16px; filter:drop-shadow(0 0 20px rgba(245,158,11,0.6));">${icon}</div>
            <div style="font-size:1rem; font-weight:900; color:#f59e0b; letter-spacing:0.2em; text-transform:uppercase; margin-bottom:8px;">Streak Milestone</div>
            <div style="font-size:3.5rem; font-weight:900; color:var(--text); font-family:'Outfit',sans-serif; margin-bottom:12px; line-height:1;">${days}</div>
            <div style="font-size:0.85rem; color:rgba(255,255,255,0.5); margin-bottom:4px;">giorni consecutivi</div>
            <div style="font-size:1.05rem; color:rgba(255,255,255,0.85); margin-top:16px; line-height:1.5; font-weight:500;">${msg}</div>
            <div style="display:flex; gap:10px; margin-top:32px; justify-content:center;">
                <button id="streak-share-btn" style="
                    background:linear-gradient(135deg,#7c3aed,#6d28d9);
                    color:#fff; border:none; border-radius:14px;
                    padding:13px 24px; font-weight:800; font-size:0.9rem;
                    cursor:pointer; font-family:inherit;
                    box-shadow:0 8px 20px rgba(124,58,237,0.4);
                ">${t('study_share_short')}</button>
                <button id="streak-close-btn" style="
                    background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.7);
                    border:1px solid rgba(255,255,255,0.1); border-radius:14px;
                    padding:13px 24px; font-weight:700; font-size:0.9rem;
                    cursor:pointer; font-family:inherit;
                ">${t('gam_streak_continue')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Confetti
    if (typeof confetti === 'function') {
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.5 }, colors: ['#f59e0b','#8b5cf6','#ec4899','#ffffff'] });
    }

    setTimeout(() => { overlay.style.opacity = '1'; }, 50);

    // Share button
    overlay.querySelector('#streak-share-btn')?.addEventListener('click', () => {
        shareStreakMilestone(days, icon);
    });

    // Close button
    overlay.querySelector('#streak-close-btn')?.addEventListener('click', () => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 400);
    });

    // Auto-dismiss after 12s
    setTimeout(() => {
        if (overlay.parentNode) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 400); }
    }, 12000);
}

/**
 * shareStreakMilestone — Web Share API per TikTok/Instagram.
 * Fallback: copia testo negli appunti.
 */
export async function shareStreakMilestone(days, icon = '🔥') {
    const text = `Ho completato ${days} giorni consecutivi di studio su Cortex ${icon}\nIl tuo Neural Study Engine → cortexapp.it\n#Cortex #StudyStreak #StudyTok`;
    try {
        if (navigator.share) {
            await navigator.share({ title: `${days} giorni di streak su Cortex!`, text });
        } else {
            await navigator.clipboard.writeText(text);
            if (_deps.showToast) _deps.showToast(t('copied_social'), 'success');
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            // Fallback silenzioso: copia negli appunti
            try { await navigator.clipboard.writeText(text); } catch {}
        }
    }
}

// ── Streak Freeze ─────────────────────────────────────────────────────────────
/**
 * Aggiunge N streak freeze al saldo dell'utente.
 * Chiamato da buyNeuralSparks quando viene acquistato un freeze.
 */
export function addStreakFreezes(count = 1) {
    gState.streakFreezes = (gState.streakFreezes || 0) + count;
    saveGState();
    if (_deps.showToast) _deps.showToast(`🧊 ${count} Streak Freeze aggiunto! (Tot: ${gState.streakFreezes})`, 'success');
}

/**
 * getStreakStatus — info compatta sullo streak per la UI.
 */
export function getStreakStatus() {
    const today = todayStr();
    const isActiveToday = gState.lastDate === today;
    const streak = gState.streak || 0;
    const freezes = gState.streakFreezes || 0;
    return { streak, isActiveToday, freezes };
}