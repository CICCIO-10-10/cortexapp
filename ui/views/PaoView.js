// ui/views/PaoView.js
// Phase 13 — View per il "Generatore P.A.O. e Palazzo della Memoria".
// generatePAO()    → esposto su window da main.js (oninput funziona)
// renderPAOTable() → chiamato dopo mount per popolare la tabella
// togglePAOTable() → già nel registry

import { Component }                    from '../Component.js';
import { renderPAOTable }               from '../../modules/pao.js';

export class PaoView extends Component {

    mount() {
        const legacyPage = document.getElementById('page-pao');
        if (legacyPage) {
            legacyPage.classList.remove('active');
            legacyPage.style.display = 'none';
        }
        this.mountPoint.scrollTop = 0;

        this.mountPoint.innerHTML = `
            <div style="padding: 120px 32px 40px; max-width: 960px; margin: 0 auto;">

                <div class="section-header">
                    <h2>🎭 Generatore P.A.O. e Palazzo</h2>
                    <p>Sistema Personaggio-Azione-Oggetto. Mappa istantaneamente i numeri in immagini indimenticabili.</p>
                    <button class="btn btn-primary"
                        style="margin-top:16px; border-radius:100px; padding:10px 24px;"
                        data-fn="showToast" data-params='["Wizard Palazzo della Memoria in arrivo presto! 🏗️","info"]'>
                        🪄 Costruisci Palazzo (Wizard)
                    </button>
                </div>

                <div class="input-area">
                    <div style="margin-bottom:16px;">
                        <label>Digita un numero da memorizzare (es. 1492)</label>
                        <input type="text" id="pao-input" placeholder="1492"
                            oninput="generatePAO()"
                            inputmode="numeric" pattern="[0-9]*"
                            style="font-size:1.4rem; font-weight:800; text-align:center; padding:16px;" />
                    </div>
                    <div id="pao-result"
                        style="display:flex; gap:16px; margin-top:24px; justify-content:center; flex-wrap:wrap;">
                        <div style="color:var(--text-muted); font-size:0.9rem;">
                            Digita un numero per vedere la scena generata.
                        </div>
                    </div>
                </div>

                <div class="input-area" style="margin-top:24px;">
                    <div class="section-header">
                        <h3>Vedi la Tabella Completa P.A.O.</h3>
                        <p style="font-size:0.8rem;">Questa tabella usa la conversione fonetica per mappare i numeri da 00 a 99.</p>
                    </div>
                    <button class="btn btn-outline" data-fn="togglePAOTable" data-self="true" style="width:100%;">
                        Rivela Tabella 00-99
                    </button>
                    <div id="pao-table-container"
                        style="display:none; margin-top:16px; max-height:400px; overflow-y:auto;">
                    </div>
                </div>

            </div>`;

        // Popola la tabella PAO (la renderizza nel container appena creato)
        renderPAOTable();
    }

    update() { /* dati PAO statici — no re-render */ }

    unmount() {
        this.mountPoint.innerHTML = '';
    }
}
