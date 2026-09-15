// ui/views/AudioView.js
// Phase 13 — View per la sezione "Voice Notes & Lezioni".
// Sostituisce #page-audio (HTML statico) con rendering JS via AppRouter.
//
// Dipendenze già inizializzate da main.js:
//   initAudioRecording(register) → startAudioRecording, stopAudioRecording,
//                                   loadAudioList, deleteRecording

import { Component }    from '../Component.js';
import { loadAudioList } from '../../modules/audioRecording.js';

export class AudioView extends Component {

    mount() {
        // Nascondi la pagina legacy
        const legacyPage = document.getElementById('page-audio');
        if (legacyPage) {
            legacyPage.classList.remove('active');
            legacyPage.style.display = 'none';
        }

        // Resetta scroll di #app-root
        this.mountPoint.scrollTop = 0;

        this.mountPoint.innerHTML = `
            <div style="padding: 120px 32px 40px; max-width: 960px; margin: 0 auto;">

                <div class="section-header">
                    <h2 style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:2rem;">🎙️</span> Voice Notes &amp; Lezioni
                    </h2>
                    <p style="color:var(--text-muted); font-size:0.9rem;">
                        Registra lezioni intere, riascoltale o condividile con la community.
                    </p>
                </div>

                <div class="glass" style="padding:24px; text-align:center; margin-bottom:24px;">
                    <!-- FIX 15/07/2026: visibile solo DURANTE la registrazione —
                         da fermo era un rettangolo grigio vuoto che stonava -->
                    <div id="audio-visualizer-container"
                        style="display:none; height:80px; background:rgba(0,0,0,0.2); border-radius:12px; margin-bottom:24px; overflow:hidden;">
                        <canvas id="audio-visualizer" style="width:100%; height:100%;"></canvas>
                    </div>

                    <div id="audio-timer"
                        style="font-size:2.5rem; font-weight:800; font-family:monospace; margin-bottom:16px;
                               color:var(--text); text-shadow:0 0 10px var(--accent-glow);">
                        00:00:00
                    </div>

                    <div style="display:flex; gap:16px; justify-content:center;">
                        <button class="btn btn-primary" id="btn-start-record" data-fn="startAudioRecording"
                            style="border-radius:100px; padding:12px 32px; font-weight:800;
                                   display:flex; align-items:center; gap:8px;">
                            <span style="color:#ef4444;">🔴</span> INIZIA REGISTRAZIONE
                        </button>
                        <button class="btn btn-danger" id="btn-stop-record" data-fn="stopAudioRecording"
                            style="display:none; border-radius:100px; padding:12px 32px; font-weight:800;
                                   align-items:center; gap:8px; background:var(--red);
                                   border-color:var(--red); color:white;">
                            ⏹️ FERMA E SALVA
                        </button>
                    </div>
                </div>

                <div class="section-header" style="margin-top:40px;">
                    <h3>Dossier Base Log (Lezioni Salvate)</h3>
                </div>
                <div id="audio-list-container"
                    style="display:flex; flex-direction:column; gap:12px;">
                    <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.9rem;">
                        Caricamento registrazioni in corso...
                    </div>
                </div>

            </div>`;

        // Carica la lista delle registrazioni salvate
        loadAudioList();
    }

    update(/* state */) {
        // La lista audio è gestita direttamente da loadAudioList() —
        // non serve re-render dallo store
    }

    unmount() {
        this.mountPoint.innerHTML = '';
    }
}
