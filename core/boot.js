/**
 * core/boot.js
 * Handles technical startup logic: version consistency checks and splash screen removal.
 */
import { APP_CONFIG } from '../js/config.js';

const KEYS = APP_CONFIG.STORAGE_KEYS;
const APP_VERSION = String(APP_CONFIG.VERSION);

// ── Changelog ─────────────────────────────────────────────────────────────────

/**
 * Novità per versione: aggiungi una entry qui ad ogni release significativa.
 * Le note vengono mostrate all'utente quando l'app si aggiorna.
 */
const CHANGELOG = {
    '9.84.0': {
        title: '🗄️ Storage Illimitato',
        items: [
            'Migrazione a IndexedDB: nessun limite di spazio per mazzi e allegati',
            'Nessun più "Memoria esaurita" — PDF e audio grandi ora funzionano sempre',
            '⚔️ Neural Duels ora disponibile per utenti Student',
            '📥 Import flashcard da CSV, Anki o TXT direttamente nel form',
            '🤖 Messaggi AI migliorati: errori più chiari con guida su cosa fare',
        ]
    },
    '9.83.0': {
        title: '🔧 Bug Fix Massicci',
        items: [
            'Quick Mode: risolto doppio flip su Android',
            'Flashcard IA / PDF: ora appaiono correttamente nella sessione di studio',
            'Boss Mode: risolto crash all\'apertura',
            'Spaced Repetition: le carte nuove vengono ora mostrate correttamente',
        ]
    },
};

/**
 * Mostra il modal changelog con le novità della versione appena installata.
 * @param {string} fromVersion — versione precedente
 */
export function showChangelogModal(fromVersion) {
    const entry = CHANGELOG[APP_VERSION];
    if (!entry) return; // nessuna nota per questa versione

    // Raccoglie le note di tutte le versioni dal precedente aggiornamento
    const relevantItems = entry.items;

    const modal = document.createElement('div');
    modal.id = 'changelog-modal';
    modal.style.cssText = `
        position:fixed; inset:0; z-index:99999;
        background:rgba(0,0,0,0.7); backdrop-filter:blur(6px);
        display:flex; align-items:center; justify-content:center; padding:20px;
    `;
    modal.innerHTML = `
        <div style="
            background:var(--surface,#1a1a2e); border:1px solid var(--accent,#7c6af7);
            border-radius:20px; padding:32px 28px; max-width:440px; width:100%;
            box-shadow:0 24px 80px rgba(0,0,0,0.5); animation: slideUp 0.3s ease;
        ">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                <div>
                    <div style="font-size:0.75rem;font-weight:700;color:var(--accent,#7c6af7);
                        text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">
                        Aggiornamento v${APP_VERSION}
                    </div>
                    <h2 style="font-size:1.3rem;font-weight:800;margin:0;">${entry.title}</h2>
                </div>
                <button onclick="document.getElementById('changelog-modal').remove()"
                    style="background:none;border:none;color:var(--text-muted,#888);
                        font-size:1.4rem;cursor:pointer;padding:0;line-height:1;">✕</button>
            </div>
            <ul style="list-style:none;padding:0;margin:0 0 24px;display:flex;flex-direction:column;gap:10px;">
                ${relevantItems.map(item => `
                    <li style="display:flex;gap:10px;align-items:flex-start;
                        background:rgba(124,106,247,0.06);border-radius:10px;padding:10px 14px;">
                        <span style="color:var(--accent,#7c6af7);font-size:1rem;flex-shrink:0;">✦</span>
                        <span style="font-size:0.9rem;line-height:1.5;">${item}</span>
                    </li>
                `).join('')}
            </ul>
            <button onclick="document.getElementById('changelog-modal').remove()"
                style="width:100%;padding:14px;background:var(--accent,#7c6af7);
                    border:none;border-radius:12px;color:#fff;font-weight:700;
                    font-size:0.95rem;cursor:pointer;font-family:inherit;">
                Ottimo, iniziamo! 🚀
            </button>
            <style>
                @keyframes slideUp {
                    from { opacity:0; transform:translateY(20px); }
                    to   { opacity:1; transform:translateY(0); }
                }
            </style>
        </div>
    `;
    document.body.appendChild(modal);
    // Chiudi cliccando fuori
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Checks if the app version has changed since the last load.
 * If a new version is detected, clears the cache and reloads the page.
 * After the reload, the changelog is shown automatically.
 */
export function checkVersionUpdate() {
    const lastVersion = localStorage.getItem(KEYS.LAST_VER);

    // Post-reload: mostra changelog se era in attesa
    const pendingChangelog = localStorage.getItem('cortex_pending_changelog');
    if (pendingChangelog && pendingChangelog !== APP_VERSION) {
        // Pulisci il flag e mostra dopo che l'app è pronta
        localStorage.removeItem('cortex_pending_changelog');
        setTimeout(() => showChangelogModal(pendingChangelog), 1800);
    }

    if (lastVersion && lastVersion !== APP_VERSION) {
        console.log(`[Version] Upgrade detected: ${lastVersion} -> ${APP_VERSION}. Clearing cache...`);
        // Segna che va mostrato il changelog dopo il reload
        localStorage.setItem('cortex_pending_changelog', lastVersion);

        const clearCache = async () => {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.unregister()));
            }
            if (window.caches) {
                const names = await caches.keys();
                await Promise.all(names.map(name => caches.delete(name)));
            }
            localStorage.setItem(KEYS.LAST_VER, APP_VERSION);
            window.location.href = window.location.origin + window.location.pathname + '?v=' + APP_VERSION;
        };

        clearCache().catch(() => {
            localStorage.setItem(KEYS.LAST_VER, APP_VERSION);
            window.location.reload(true);
        });
    } else {
        localStorage.setItem(KEYS.LAST_VER, APP_VERSION);
    }
}

/**
 * Removes the splash screen and skeleton loader with a fade-out animation.
 */
export function removeSplashScreen() {

    
    // Rimuove skeleton screen (FCP loader) con fade-out
    const skeleton = document.getElementById('cortex-skeleton');
    if (skeleton) {
        skeleton.classList.add('sk-hidden');
        setTimeout(() => skeleton.remove(), 450);
    }

    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => {
            if (splash.parentNode) {
                splash.parentNode.removeChild(splash);

            }
        }, 350); // Ridotto da 1000ms → 350ms per risposta più reattiva
    }
}
