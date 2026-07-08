/**
 * ui/views/HomeView.js — Phase 14
 *
 * Rendering autonomo: importa renderHome() direttamente da modules/home.js.
 * Elimina la dipendenza da window.renderHome (precedente Phase 8 legacy bridge).
 *
 * Lifecycle:
 *   mount()   → crea #page-home dentro mountPoint, chiama renderHome()
 *   update()  → no-op (renderHome gestisce il proprio stato internamente)
 *   unmount() → ferma pulseInterval, svuota il container
 */
import { Component }  from '../Component.js';
import { renderHome } from '../../modules/home.js';

export class HomeView extends Component {

    mount() {
        // Phase 16: nascondi il nodo statico #page-home per evitare getElementById
        // di trovare quello sbagliato (due nodi con stesso id nel DOM).
        const legacyPage = document.getElementById('page-home');
        if (legacyPage) {
            legacyPage.classList.remove('active');
            legacyPage.style.display = 'none';
        }

        // Crea #home-root — renderHome() lo trova tramite il fallback in home.js
        this.mountPoint.innerHTML = `
            <div id="home-root" style="min-height:100%; padding: 80px 0 0;"></div>
        `;
        this.mountPoint.scrollTop = 0;
        renderHome();
    }

    update(/* state */) {
        // No-op: renderHome() gestisce il proprio ciclo interno
        // (pulseInterval, loadFeedbackMessages, ecc.)
    }

    unmount() {
        // Ferma il pulse interval avviato da renderHome()
        if (window.pulseInterval) {
            clearInterval(window.pulseInterval);
            window.pulseInterval = null;
        }
        this.mountPoint.innerHTML = '';
    }
}
