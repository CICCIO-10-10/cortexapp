// ui/views/TechView.js
// Phase 12 — View per la sezione "Tecniche di Memoria".
// Sostituisce #page-tecniche (HTML statico) con rendering JS via AppRouter.
//
// Struttura montata in #app-root:
//   wrapper padding:120px (navbar clearance)
//   └─ section-header h2 + p
//   └─ #technique-list  → cards-grid popolato da renderTechList()
//   └─ #technique-detail → dettaglio tecnica (hideTechDetail lo nasconde)

import { Component }                          from '../Component.js';
import { renderTechList, getTechPageHTML }    from '../../modules/techniques.js';

export class TechView extends Component {

    mount() {
        // Nascondi la pagina legacy se ancora visibile
        const legacyPage = document.getElementById('page-tecniche');
        if (legacyPage) {
            legacyPage.classList.remove('active');
            legacyPage.style.display = 'none';
        }

        // Resetta scroll di #app-root al top
        this.mountPoint.scrollTop = 0;

        // Monta la struttura completa identica a #page-tecniche
        this.mountPoint.innerHTML = `
            <div style="padding: 120px 32px 40px; max-width: 960px; margin: 0 auto;">
                <div class="section-header">
                    <h2>🧠 Tecniche di Memoria</h2>
                    <p>Le stesse strategie usate dai campionati mondiali di memoria.<br>Clicca su una per imparare come usarla.</p>
                </div>
                ${getTechPageHTML()}
            </div>`;

        // Render iniziale della griglia (initTechniques già chiamato da main.js)
        renderTechList();

        // Forza 3 colonne — override diretto, batte qualsiasi CSS/cache
        const grid = this.mountPoint.querySelector('#tech-cards-grid');
        if (grid) grid.style.setProperty('grid-template-columns', 'repeat(3, 1fr)', 'important');
    }

    update(/* state */) {
        // Le tecniche sono dati statici — nessun re-render necessario
    }

    unmount() {
        this.mountPoint.innerHTML = '';
    }
}
