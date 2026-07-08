/**
 * ui/views/StudyPlanView.js — Phase 17
 *
 * Estratto da #view-plan dentro #page-materiale (index.html).
 * Shell per il piano di studio: fornisce #plan-content e la barra
 * "Rigenera con IA". Il contenuto reale è iniettato da showStudyPlan()
 * in modules/studyPlan.js, che naviga qui PRIMA di riempire #plan-content.
 *
 * Lifecycle:
 *   mount()   → inietta HTML in mountPoint (crea #plan-content vuoto)
 *   update()  → no-op (il contenuto è gestito da studyPlan.js)
 *   unmount() → svuota mountPoint
 *
 * Navigazione:
 *   Back button → data-fn="showPage" data-params='["materiale"]'
 */
import { Component } from '../Component.js';

export class StudyPlanView extends Component {

    mount() {
        this.mountPoint.scrollTop = 0;

        this.mountPoint.innerHTML = `
<div style="padding: 100px 32px 120px; max-width: 960px; margin: 0 auto;">

    <button aria-label="Vai alla pagina materiale" class="tech-back" data-fn="showPage" data-params='["materiale"]'>← Le mie materie</button>

    <div id="plan-content"></div>

    <!-- REGENERATE WITH AI BAR -->
    <div class="glass" style="margin-top:24px; padding:20px; border:1px solid var(--accent);">
        <h4 style="margin-bottom:12px;">✨ Rigenera Riassunto con IA</h4>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">
            Non ti soddisfa? Scrivi nuove istruzioni qui sotto:
        </p>
        <div style="display:flex; gap:12px;">
            <input type="text" id="plan-ai-instructions"
                placeholder="es: 'Aggiungi più dettagli sulla parte X'..."
                style="flex:1; height:44px; padding:0 12px; background:rgba(0,0,0,0.2); border:1px solid var(--accent); border-radius:12px; color:white;" />
            <button class="btn btn-primary" data-fn="regeneratePlanWithAI"
                style="border-radius:12px; white-space:nowrap;">✨ Applica</button>
        </div>
    </div>

</div>`;
    }

    update(/* state */) { /* no-op — studyPlan.js gestisce il contenuto */ }

    unmount() {
        this.mountPoint.innerHTML = '';
    }
}
