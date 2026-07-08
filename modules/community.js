import { t } from '../core/i18n.js';
/**
 * modules/community.js — Phase 26
 *
 * Community & Social: tab, mazzi pubblici, leaderboard, condivisione, import.
 * Estratto da main.js (COMMUNITY & SOCIAL block).
 *
 * Dipendenze iniettate via init():
 *   state           — app state (decks, userId, username)
 *   saveState       — persist state
 *   showToast       — notifiche UI
 *   renderDecks     — aggiorna lista mazzi dopo import
 *   getDB           — getter per istanza Firestore db
 *   initFirebase    — inizializza Firebase se non ancora avviato
 *
 * Import diretti:
 *   awardXP         ← modules/gamification.js
 *   todayStr        ← js/utils.js
 *   switchMainCommunityTab  ← added
 */
import { awardXP }   from './gamification.js';
import { todayStr }  from '../js/utils.js';

// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = {
    state:       { decks: [], userId: null, username: null },
    saveState:   () => {},
    showToast:   () => {},
    renderDecks: () => {},
    getDB:       () => null,
    initFirebase: async () => {},
    getGState:   () => ({ xp: 0 }),
    getLevel:    () => ({ name: 'Lv1' }),
};

export function init(deps) { _deps = { ..._deps, ...deps }; }

// ── Helpers privati ───────────────────────────────────────────────────────────

/**
 * Sanitize user-generated content to prevent XSS attacks.
 * Uses createElement + textContent for safe rendering.
 */
function sanitize(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Escapa un valore per uso sicuro dentro un attributo HTML costruito via
 * template string (es. data-params="...", data-deck-id="..."). sanitize()
 * protegge solo il contesto "testo dentro un tag" — qui serve anche
 * neutralizzare virgolette singole/doppie che altrimenti romperebbero
 * l'attributo stesso (vettore XSS reale se l'id contenesse `"` o `'`).
 */
function escapeAttr(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function ensureDB() {
    if (!_deps.getDB()) await _deps.initFirebase();
    return _deps.getDB();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function switchMainCommunityTab(tab) {
    const pProfilo = document.getElementById('macro-panel-profilo');
    const pNetwork = document.getElementById('macro-panel-network');
    const bProfilo = document.getElementById('main-tab-profilo');
    const bNetwork = document.getElementById('main-tab-network');

    if (tab === 'profilo') {
        if (pProfilo) pProfilo.style.display = 'block';
        if (pNetwork) pNetwork.style.display = 'none';
        if (bProfilo) {
            bProfilo.classList.add('btn-primary');
            bProfilo.classList.remove('btn-outline');
            bProfilo.style.borderColor = 'transparent';
        }
        if (bNetwork) {
             bNetwork.classList.add('btn-outline');
             bNetwork.classList.remove('btn-primary');
             bNetwork.style.borderColor = 'rgba(255,255,255,0.2)';
        }
        // Always attempt to render the profile & stats when opening the 'profilo' tab
        if (window.renderNetworkAndStats) {
            window.renderNetworkAndStats();
        }
    } else {
        if (pProfilo) pProfilo.style.display = 'none';
        if (pNetwork) pNetwork.style.display = 'block';
        if (bProfilo) {
            bProfilo.classList.add('btn-outline');
            bProfilo.classList.remove('btn-primary');
            bProfilo.style.borderColor = 'rgba(255,255,255,0.2)';
        }
        if (bNetwork) {
             bNetwork.classList.add('btn-primary');
             bNetwork.classList.remove('btn-outline');
             bNetwork.style.borderColor = 'transparent';
        }
    }
}

export function switchCommunityTab(tab) {
    const panels = ['decks', 'board'];
    panels.forEach(p => {
        const el = document.getElementById('community-panel-' + p);
        if (el) el.style.display = p === tab ? 'block' : 'none';
        const btn = document.getElementById('ctab-' + p);
        if (btn) {
            if (p === tab) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
    if (tab === 'decks') {
        if (typeof loadCommunityDecks === 'function') loadCommunityDecks();
    }
    if (tab === 'board') {
        if (typeof loadLeaderboard === 'function') loadLeaderboard();
    }
}

export async function loadCommunityDecks(search = '') {
    const container = document.getElementById('community-decks-container');
    const loading   = document.getElementById('community-loading');
    if (!container) return;

    if (loading) loading.style.display = 'block';
    container.innerHTML = '';

    try {
        const db       = await ensureDB();
        const snapshot = await db.collection("publicDecks").get();
        const decks    = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const isStressTest = (data.name && data.name.startsWith('Stress Test')) || (data.subject === 'STRESS_TEST');
            
            if (!isStressTest && (!search || data.name.toLowerCase().includes(search.toLowerCase()) || data.subject.toLowerCase().includes(search.toLowerCase()))) {
                decks.push({ id: doc.id, ...data });
            }
        });

        if (loading) loading.style.display = 'none';

        if (decks.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">Nessun mazzo trovato 🔍</div>';
            return;
        }

        decks.forEach(d => {
            const card = document.createElement('div');
            card.className = 'deck-card community-deck-card';
            const isOwner = d.ownerId === window._fbUserId;
            card.innerHTML = `
                <div class="deck-info">
                    <h4>${sanitize(d.name)}</h4>
                    <p style="font-size:0.8rem; opacity:0.7;">${sanitize(d.subject)} • ${d.cardsCount || 0} carte</p>
                    <p style="font-size:0.75rem; color:var(--accent);">by ${sanitize(d.authorName || t('community_anon'))}</p>
                </div>
                <div style="display:flex; gap:6px; margin-top:12px; flex-wrap:wrap;">
                    <button aria-label="${t('community_import_deck')}" class="btn btn-primary btn-sm" data-fn="importSharedDeck" data-params="${escapeAttr(JSON.stringify([d.id]))}">📥 Importa</button>
                    ${!isOwner ? `<button aria-label="${t('community_report_deck')}" class="btn btn-sm" style="background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.3);" data-deck-id="${escapeAttr(d.id)}" data-fn="reportDeck" data-params="${escapeAttr(JSON.stringify([d.id, d.name]))}">🚩</button>` : ''}
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error("Error loading community decks", e);
        if (loading) loading.style.display = 'none';
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--red);">Errore nel caricamento dei mazzi.</div>';
    }
}

// ── Leaderboard & Leghe ───────────────────────────────────────────────────────

const LEAGUES = [
    { name: t('rank_bronze'),   icon: '🥉', min: 0,    color: '#cd7f32', bg: 'rgba(205,127,50,0.1)' },
    { name: t('rank_silver'),  icon: '🥈', min: 300,  color: '#a8a9ad', bg: 'rgba(168,169,173,0.1)' },
    { name: t('rank_gold'),      icon: '🥇', min: 700,  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    { name: t('rank_diamond'), icon: '💎', min: 1500, color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
];

function getLeague(xp) {
    for (let i = LEAGUES.length - 1; i >= 0; i--) {
        if (xp >= LEAGUES[i].min) return LEAGUES[i];
    }
    return LEAGUES[0];
}

/** Aggiorna weekly XP in Firestore per il leaderboard settimanale. */
export async function syncWeeklyXP(userXP, displayName) {
    if (!userXP) return;
    try {
        const db = await ensureDB();
        if (!db || !_deps.state.userId) return;
        const now = new Date();
        // Settimana ISO: anno-W##
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1);
        const weekKey = `${startOfWeek.getFullYear()}-W${String(Math.ceil(startOfWeek.getDate() / 7)).padStart(2,'0')}`;

        await db.collection('leaderboard').doc(_deps.state.userId).set({
            displayName: displayName || _deps.state.username || t('community_student'),
            totalXP: userXP,
            weeklyXP: userXP,     // il server aggiornerà con merge
            weekKey,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch (e) {
        // silenzioso — non bloccante
    }
}

export async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:30px; color:rgba(255,255,255,0.4);">⏳ Caricamento classifica...</div>';

    try {
        const db = await ensureDB();
        // Prova prima leaderboard dedicata, poi fallback su userProfiles
        let entries = [];
        try {
            const q = db.collection('leaderboard').orderBy('totalXP', 'desc').limit(20);
            const snap = await q.get();
            snap.forEach(doc => entries.push({ id: doc.id, ...doc.data() }));
        } catch {
            const q = db.collection('userProfiles').orderBy('xp', 'desc').limit(20);
            const snap = await q.get();
            snap.forEach(doc => entries.push({ id: doc.id, xp: doc.data().xp, displayName: doc.data().name }));
        }

        if (entries.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:rgba(255,255,255,0.4);">Nessun dato ancora. Studia per entrare in classifica! 🚀</div>';
            return;
        }

        const myId = _deps.state.userId;
        container.innerHTML = '';

        // Header leghe
        const leagueHeader = document.createElement('div');
        leagueHeader.style.cssText = 'display:flex; gap:8px; justify-content:center; margin-bottom:20px; flex-wrap:wrap;';
        leagueHeader.innerHTML = LEAGUES.map(l => `
            <div style="
                display:flex; align-items:center; gap:6px;
                padding:6px 14px; border-radius:20px;
                background:${l.bg}; border:1px solid ${l.color}33;
                font-size:0.78rem; font-weight:700; color:${l.color};
            ">${l.icon} ${l.name} <span style="opacity:0.6; font-weight:400;">≥ ${l.min} XP</span></div>
        `).join('');
        container.appendChild(leagueHeader);

        // Lista classificata
        entries.forEach((u, idx) => {
            const rank = idx + 1;
            // Forza numeri interi — previene XSS se un utente scrive valori non-numerici in Firestore
            const xp = Math.max(0, parseInt(u.totalXP || u.xp || 0, 10) || 0);
            const weeklyXP = parseInt(u.weeklyXP, 10) || 0;
            const league = getLeague(xp);
            const isMe = u.id === myId;
            const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

            const item = document.createElement('div');
            item.style.cssText = `
                display:flex; align-items:center; gap:14px;
                padding:14px 16px; border-radius:14px; margin-bottom:8px;
                background:${isMe ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)'};
                border:1px solid ${isMe ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'};
                transition:background 0.2s;
            `;
            item.innerHTML = `
                <div style="font-weight:900; font-size:1.15rem; min-width:36px; text-align:center;">${rankIcon}</div>
                <div style="font-size:1.4rem;">${league.icon}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; color:var(--text); font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${sanitize(u.displayName || t('community_student'))}${isMe ? ' <span style="font-size:0.7rem; color:rgba(139,92,246,0.9); font-weight:800;">(tu)</span>' : ''}
                    </div>
                    <div style="font-size:0.75rem; color:${league.color}; font-weight:700;">${league.name}</div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <div style="color:#fbbf24; font-weight:900; font-size:0.95rem;">${xp.toLocaleString('it-IT')} XP</div>
                    ${weeklyXP > 0 ? `<div style="font-size:0.7rem; color:rgba(255,255,255,0.4);">+${weeklyXP} questa settimana</div>` : ''}
                </div>
            `;
            container.appendChild(item);
        });

        // Footer motivazionale
        const footer = document.createElement('div');
        footer.style.cssText = 'text-align:center; padding:20px; color:rgba(255,255,255,0.35); font-size:0.8rem;';
        footer.textContent = 'Studia ogni giorno per scalare la classifica 🚀';
        container.appendChild(footer);

    } catch (e) {
        console.error('Leaderboard error', e);
        container.innerHTML = '<div style="color:var(--red); text-align:center; padding:20px;">Errore nel caricamento della classifica.</div>';
    }
}

/** Esposta globalmente per il bottone Ricarica in navigation.js */
export async function syncAndShowLeaderboard() {
    await loadLeaderboard();
}

export async function shareDeck(idx) {
    const deck = _deps.state.decks[idx];
    if (!deck) return;

    // La condivisione via link è ora GRATUITA per tutti — crea il viral loop naturale.
    // La pubblicazione nella community pubblica rimane Student (per evitare spam).
    // Nessun gate qui.

    _deps.showToast(t('community_generating_link'), "");

    try {
        const db      = await ensureDB();
        const shareData = {
            ownerId:   _deps.state.userId   || "guest",
            ownerName: _deps.state.username || t('community_anon'),
            name:      deck.name,
            subject:   deck.subject,
            cardCount: deck.cards.length,
            deckData:  deck.cards,
            sharedAt:  firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection("publicDecks").add(shareData);
        // Utilizziamo sharedDeck come parametro per virality (Trojan Horse)
        const link   = `${window.location.origin}${window.location.pathname}?sharedDeck=${docRef.id}`;


        await navigator.clipboard.writeText(link);
        _deps.showToast("✅ Link copiato! Chiunque con questo link può importare il mazzo.", "success");
        awardXP(50, "🚀 Mazzo condiviso!");
    } catch (e) {
        console.error("Share error", e);
        _deps.showToast(t('err_community_share'), "error");
    }
}

/**
 * Segnala un mazzo pubblico. Wrapper data-fn sicuro attorno a window._reportDeck
 * (logica/prompt definiti in main.js) — evita di costruire onclick inline con
 * concatenazione di stringhe non sicura (vedi fix XSS sul bottone 🚩).
 */
export function reportDeck(deckId, deckName) {
    if (typeof window._reportDeck === 'function') window._reportDeck(deckId, deckName);
}

export async function importSharedDeck(shareId) {
    _deps.showToast("📥 Recupero mazzo condiviso...", "");

    try {
        const db      = await ensureDB();
        const docRef  = db.collection("publicDecks").doc(shareId);
        const docSnap = await docRef.get();

        if (docSnap.exists()) {
            const data    = docSnap.data();
            const newDeck = {
                name:    data.name + " (Importato)",
                subject: data.subject,
                cards:   data.cards,
                created: todayStr()
            };
            _deps.state.decks.push(newDeck);
            _deps.saveState();
            _deps.renderDecks();
            _deps.showToast(`✅ Mazzo "${data.name}" importato con successo!`, "success");
            awardXP(10, "📚 Nuovo mazzo importato");

            const url = new URL(window.location);
            url.searchParams.delete('import');
            url.searchParams.delete('sharedDeck');
            window.history.replaceState({}, '', url);

        } else {
            _deps.showToast(t('err_deck_not_found'), "error");
        }
    } catch (e) {
        console.error("Import error", e);
        _deps.showToast("❌ Errore nell'importazione.", "error");
    }
}

export function checkImportParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const importId  = urlParams.get('sharedDeck') || urlParams.get('import');
    if (importId) {
        // Delay per assicurarsi che i moduli siano pronti (appBoot)
        setTimeout(() => importSharedDeck(importId), 1500);
    }
}

export function promptImportDeck() {
    const shareId = prompt("Incolla l'ID del mazzo condiviso (es. 8xJ9k...) o l'intero link:");
    if (!shareId) return;

    let id = shareId.trim();
    // Se è un link completo, estraiamo l'ID
    if (id.includes('sharedDeck=')) {
        id = id.split('sharedDeck=')[1].split('&')[0];
    } else if (id.includes('import=')) {
        id = id.split('import=')[1].split('&')[0];
    }

    if (id) {
        importSharedDeck(id);
    } else {
        _deps.showToast("ID non valido.", "error");
    }
}


export async function syncPublicProfile() {
    const db = _deps.getDB();
    if (!_deps.state.username || !db) return;
    try {
        const gState  = _deps.getGState();
        const userRef = db.collection("userProfiles").doc(_deps.state.username);
        await userRef.set({
            uid:      _deps.state.userId,
            name:     _deps.state.username,
            xp:       gState.xp || 0,
            level:    _deps.getLevel().name,
            lastSync: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.error("Sync error", e);
    }
}

export function sortCommunity(type) {
    const pills = document.querySelectorAll('.community-filter-pill');
    pills.forEach(p => p.classList.remove('active'));
    const btn = Array.from(pills).find(p => p.textContent.toLowerCase().includes(type === 'recent' ? 'recenti' : type === 'cards' ? 'carte' : 'scaricati'));
    if (btn) btn.classList.add('active');
    loadCommunityDecks();
}
