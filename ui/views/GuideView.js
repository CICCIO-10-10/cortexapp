// ui/views/GuideView.js
// Phase 13 — View per la "Guida a Cortex".
// Contenuto puramente statico: accordion FAQ + sezioni feature.
// Gli handler onmouseenter/onmouseleave sono inline CSS e funzionano
// anche dopo innerHTML (non richiedono JS binding).
// data-fn="toggleGuideBody" è già nel registry (main.js).

import { Component } from '../Component.js';

export class GuideView extends Component {

    mount() {
        const legacyPage = document.getElementById('page-guida');
        if (legacyPage) {
            legacyPage.classList.remove('active');
            legacyPage.style.display = 'none';
        }
        this.mountPoint.scrollTop = 0;

        this.mountPoint.innerHTML = `
<div style="padding-top:120px;">
<div style="max-width:760px; margin:0 auto; padding:0 20px 120px;">

    <!-- HERO -->
    <div style="text-align:center; padding:48px 0 40px;">
        <div style="font-size:4rem; margin-bottom:20px;">🧠</div>
        <h1 style="font-family:'Outfit'; font-size:2.4rem; font-weight:900; margin-bottom:12px;
            background:linear-gradient(135deg,#fff 20%,var(--accent) 80%);
            -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">
            Guida a Cortex</h1>
        <p style="color:var(--text-muted); font-size:1.05rem; max-width:500px; margin:0 auto; line-height:1.7;">
            Dal primo lancio all'esame passato. Tutto quello che devi sapere in 3 minuti.</p>
    </div>

    <!-- SEZIONE 1: PER INIZIARE -->
    <div style="margin-bottom:40px;">
        <h2 style="font-family:'Outfit'; font-size:1.4rem; font-weight:800; margin-bottom:20px;
            display:flex; align-items:center; gap:10px;">
            <span style="background:var(--accent); color:#fff; width:32px; height:32px; border-radius:10px;
                display:inline-flex; align-items:center; justify-content:center; font-size:1rem;">1</span>
            Per iniziare
        </h2>
        <div style="display:flex; flex-direction:column; gap:12px;">
            <div data-fn="toggleGuideBody" data-self="true"
                style="background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:20px; cursor:pointer; transition:border-color 0.2s;"
                onmouseenter="this.style.borderColor='var(--accent)'"
                onmouseleave="this.style.borderColor='var(--border)'">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700;">📚 Come creare una materia</span>
                    <span style="color:var(--accent); font-size:1.2rem;">+</span>
                </div>
                <div class="guide-body" style="display:none; margin-top:14px; color:var(--text-muted); font-size:0.9rem; line-height:1.7;">
                    Vai su <strong style="color:var(--text);">Materiale → + Nuova Materia</strong>. Inserisci
                    nome, materia e data esame (opzionale). Puoi caricare PDF, foto di appunti, audio di lezioni
                    e link YouTube. L'IA analizza tutto e prepara i concetti chiave.
                </div>
            </div>
            <div data-fn="toggleGuideBody" data-self="true"
                style="background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:20px; cursor:pointer; transition:border-color 0.2s;"
                onmouseenter="this.style.borderColor='var(--accent)'"
                onmouseleave="this.style.borderColor='var(--border)'">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700;">⚡ Come generare flashcard con l'IA</span>
                    <span style="color:var(--accent); font-size:1.2rem;">+</span>
                </div>
                <div class="guide-body" style="display:none; margin-top:14px; color:var(--text-muted); font-size:0.9rem; line-height:1.7;">
                    Nella schermata di creazione materia, incolla il tuo testo (o carica un file) e clicca
                    <strong style="color:var(--text);">"⚡ Genera Flashcard"</strong>. L'IA crea automaticamente
                    domande e risposte. Puoi aggiungerne di manuali o modificare quelle generate.
                </div>
            </div>
            <div data-fn="toggleGuideBody" data-self="true"
                style="background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:20px; cursor:pointer; transition:border-color 0.2s;"
                onmouseenter="this.style.borderColor='var(--accent)'"
                onmouseleave="this.style.borderColor='var(--border)'">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700;">📅 Come funziona la ripetizione spaziata (SRS)</span>
                    <span style="color:var(--accent); font-size:1.2rem;">+</span>
                </div>
                <div class="guide-body" style="display:none; margin-top:14px; color:var(--text-muted); font-size:0.9rem; line-height:1.7;">
                    Clicca <strong style="color:var(--text);">"▶ Studia"</strong> su una materia. Valuta ogni
                    carta: ✅ Sì → rivedi tra qualche giorno, 🤔 Così → rivedi presto, 😰 No → rivedi subito. Il
                    sistema SM-2 ottimizza automaticamente quando rivedere ogni carta per massimizzare la memorizzazione.
                </div>
            </div>
        </div>
    </div>

    <!-- SEZIONE 2: TECNICHE CHIAVE -->
    <div style="margin-bottom:40px;">
        <h2 style="font-family:'Outfit'; font-size:1.4rem; font-weight:800; margin-bottom:20px;
            display:flex; align-items:center; gap:10px;">
            <span style="background:var(--green); color:#fff; width:32px; height:32px; border-radius:10px;
                display:inline-flex; align-items:center; justify-content:center; font-size:1rem;">2</span>
            Tecniche chiave
        </h2>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div data-fn="showPage" data-params='["tecniche"]'
                style="background:linear-gradient(135deg,rgba(124,106,247,0.15),rgba(124,106,247,0.05)); border:1px solid rgba(124,106,247,0.3); border-radius:20px; padding:20px; cursor:pointer; transition:all 0.2s;"
                onmouseenter="this.style.transform='scale(1.02)'" onmouseleave="this.style.transform='scale(1)'">
                <div style="font-size:2rem; margin-bottom:8px;">📅</div>
                <strong>Spaced Repetition</strong>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">Rivedi nel momento ottimale</p>
            </div>
            <div data-fn="showPage" data-params='["tecniche"]'
                style="background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05)); border:1px solid rgba(16,185,129,0.3); border-radius:20px; padding:20px; cursor:pointer; transition:all 0.2s;"
                onmouseenter="this.style.transform='scale(1.02)'" onmouseleave="this.style.transform='scale(1)'">
                <div style="font-size:2rem; margin-bottom:8px;">🔁</div>
                <strong>Active Recall</strong>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">Recupera prima di rileggere</p>
            </div>
            <div data-fn="showPage" data-params='["tecniche"]'
                style="background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05)); border:1px solid rgba(245,158,11,0.3); border-radius:20px; padding:20px; cursor:pointer; transition:all 0.2s;"
                onmouseenter="this.style.transform='scale(1.02)'" onmouseleave="this.style.transform='scale(1)'">
                <div style="font-size:2rem; margin-bottom:8px;">👩‍🏫</div>
                <strong>Metodo Feynman</strong>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">Spiega per capire davvero</p>
            </div>
            <div data-fn="showPage" data-params='["tecniche"]'
                style="background:linear-gradient(135deg,rgba(236,72,153,0.15),rgba(236,72,153,0.05)); border:1px solid rgba(236,72,153,0.3); border-radius:20px; padding:20px; cursor:pointer; transition:all 0.2s;"
                onmouseenter="this.style.transform='scale(1.02)'" onmouseleave="this.style.transform='scale(1)'">
                <div style="font-size:2rem; margin-bottom:8px;">🏗️</div>
                <strong>Memory Palace</strong>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">Tecnica dei campioni mondiali</p>
            </div>
        </div>
    </div>

    <!-- SEZIONE 3: FEATURE AVANZATE -->
    <div style="margin-bottom:40px;">
        <h2 style="font-family:'Outfit'; font-size:1.4rem; font-weight:800; margin-bottom:20px;
            display:flex; align-items:center; gap:10px;">
            <span style="background:var(--gold); color:#000; width:32px; height:32px; border-radius:10px;
                display:inline-flex; align-items:center; justify-content:center; font-size:1rem;">3</span>
            Feature avanzate
        </h2>
        <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:16px 20px; display:flex; align-items:center; gap:16px;">
                <span style="font-size:1.8rem;">🎙️</span>
                <div><strong>Oral Exam / Feynman</strong><br>
                    <span style="font-size:0.82rem; color:var(--text-muted);">Simula un esame orale con il riconoscimento vocale. L'IA valuta le tue risposte.</span></div>
            </div>
            <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:16px 20px; display:flex; align-items:center; gap:16px;">
                <span style="font-size:1.8rem;">👹</span>
                <div><strong>Boss Mode</strong><br>
                    <span style="font-size:0.82rem; color:var(--text-muted);">Modalità sfida a tempo: rispondi alle domande prima che il boss ti attacchi.</span></div>
            </div>
            <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:16px 20px; display:flex; align-items:center; gap:16px;">
                <span style="font-size:1.8rem;">🗺️</span>
                <div><strong>Grafo / Mind Map Fisica</strong><br>
                    <span style="font-size:0.82rem; color:var(--text-muted);">Visualizza le connessioni tra i concetti della tua materia in un grafo interattivo.</span></div>
            </div>
            <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:16px 20px; display:flex; align-items:center; gap:16px;">
                <span style="font-size:1.8rem;">🍅</span>
                <div><strong>Pomodoro + Soundscape</strong><br>
                    <span style="font-size:0.82rem; color:var(--text-muted);">Timer di studio con suoni ambientali: lofi, pioggia, foresta, fuoco e altri.</span></div>
            </div>
            <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:16px 20px; display:flex; align-items:center; gap:16px;">
                <span style="font-size:1.8rem;">🏗️</span>
                <div><strong>Architetto del Metodo</strong><br>
                    <span style="font-size:0.82rem; color:var(--text-muted);">Test diagnostico che identifica il tuo stile di apprendimento e crea un piano di studio personalizzato.</span></div>
            </div>
        </div>
    </div>

    <!-- CTA -->
    <div style="text-align:center; padding:48px 0;">
        <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:20px;">Pronto a iniziare?</p>
        <button aria-label="Vai alla pagina materiale" class="btn btn-primary"
            style="padding:16px 48px; border-radius:100px; font-size:1.1rem; box-shadow:0 10px 30px var(--accent-glow);"
            data-fn="showPage" data-params='["materiale"]'>
            Vai a Materiale 📚
        </button>
    </div>

</div>
</div>`;
    }

    update() { /* contenuto statico — no re-render */ }

    unmount() {
        this.mountPoint.innerHTML = '';
    }
}
