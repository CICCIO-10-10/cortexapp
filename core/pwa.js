/**
 * core/pwa.js — Phase 21 Refactoring
 *
 * Gestione della PWA (Progressive Web App):
 *  - Intercettazione prompt di installazione
 *  - Visualizzazione banner e guide (iOS/Android)
 *  - Esecuzione installazione
 */

let deferredPrompt = null;

/**
 * Inizializza i listener PWA.
 * Chiamato da main.js durante il boot.
 */
export function initPWA() {
    // 1. Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        
        // Update UI notify the user they can install the PWA
        const btn = document.getElementById('pwa-install-btn');
        if (btn && !window.matchMedia('(display-mode: standalone)').matches) {
            btn.style.display = 'flex';
        }
        
        // Il banner di installazione non si mostra più all'avvio.
        // Verrà attivato in modo intelligente tramite triggerSmartInstallPrompt()
    });

    // 2. Always show guide button on iOS if not installed
    window.addEventListener('load', () => {
        const btn = document.getElementById('pwa-install-btn');
        if (btn && isIOS() && !window.navigator.standalone) {
            btn.style.display = 'flex';
        }
    });
}

/**
 * Verifica se il dispositivo è iOS.
 */
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Mostra la guida di installazione manuale (quando il prompt non è supportato).
 */
export function showInstallGuide() {
    const modal = document.getElementById('pwa-install-modal');
    const osTag = document.getElementById('os-tag');
    const steps = document.getElementById('install-steps');

    if (!modal || !osTag || !steps) return;

    modal.style.display = 'flex';
    if (isIOS()) {
        osTag.innerText = "iOS (iPhone/iPad)";
        steps.innerHTML = `
            <div class="step-item"><div class="step-num">1</div><span>Tocca l'icona <b>Condividi</b> <span style="font-size:1.2rem">⎋</span> nella barra di Safari.</span></div>
            <div class="step-item"><div class="step-num">2</div><span>Scorri verso il basso e seleziona <b>"Aggiungi alla schermata Home"</b>.</span></div>
            <div class="step-item"><div class="step-num">3</div><span>Tocca <b>Aggiungi</b> in alto a destra.</span></div>
        `;
    } else {
        osTag.innerText = "Android (Samsung/Xiaomi/ecc.)";
        steps.innerHTML = `
            <div class="step-item"><div class="step-num">1</div><span>Tocca i <b>tre puntini</b> <span style="font-size:1.2rem">⋮</span> in alto a destra nel browser.</span></div>
            <div class="step-item"><div class="step-num">2</div><span>Seleziona <b>"Installa applicazione"</b> o "Aggiungi a Home".</span></div>
            <div class="step-item"><div class="step-num">3</div><span>Conferma l'installazione.</span></div>
        `;
    }
}

/**
 * Chiude il modal della guida di installazione.
 */
export function closeInstallModal() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Avvia il processo di installazione della PWA.
 */
export function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
            dismissInstall();
        });
    } else {
        showInstallGuide();
    }
}

/**
 * Nasconde il banner di installazione e salva la scelta nel localStorage.
 */
export function dismissInstall() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('mm_install_dismissed', '1');
}

/**
 * Attiva il prompt di installazione PWA in modo intelligente (es. dopo il primo mazzo creato o studio finito).
 */
export function triggerSmartInstallPrompt() {
    if (!deferredPrompt) return;
    if (localStorage.getItem('mm_install_dismissed') === '1') return;

    const banner = document.getElementById('install-banner');
    if (banner) {
        banner.style.display = 'flex';
        banner.classList.add('pulse-border');
    }
}
