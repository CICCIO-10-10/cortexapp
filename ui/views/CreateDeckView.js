/**
 * ui/views/CreateDeckView.js — Phase 17
 *
 * Estratto da #view-create dentro #page-materiale (index.html).
 * Fornisce il form completo per creare/modificare una materia.
 *
 * Lifecycle:
 *   mount()   → inietta HTML in mountPoint, resetta tutti i campi del form
 *               (equivalente al vecchio showView('view-create') in main.js)
 *   update()  → no-op (il form è stateful, non ri-renderizzato)
 *   unmount() → svuota mountPoint
 *
 * Navigazione:
 *   Back button → data-fn="showPage" data-params='["materiale"]'
 *   Salva → saveDeck / saveAndGeneratePlan via data-fn (già nel registry)
 */
import { Component }              from '../Component.js';
import { t } from '../../core/i18n.js';
import { resetPendingAttachments } from '../../modules/deckForm.js';

export class CreateDeckView extends Component {

    mount() {
        this.mountPoint.scrollTop = 0;

        this.mountPoint.innerHTML = `
<div style="padding: 100px 32px 120px; max-width: 960px; margin: 0 auto;">

    <button aria-label="Vai alla pagina materiale" class="tech-back" data-fn="showPage" data-params='["materiale"]'>← Le mie materie</button>
    <div class="section-header">
        <h2>➕ Nuova Materia</h2>
        <p>Inserisci le info sull'esame e il materiale da studiare.</p>
    </div>

    <!-- AI CUSTOMIZATION BAR -->
    <div class="input-area" style="margin-bottom:24px; border:1px solid var(--accent); background:rgba(139,92,246,0.05);">
        <label style="font-size:0.85rem; color:var(--accent); font-weight:800; display:flex; align-items:center; gap:6px; margin-bottom:10px;">
            ✨ Personalizza l'IA (Riassunto e Flashcard)
        </label>
        <input type="text" id="ai-custom-instructions" aria-label="Istruzioni personalizzate per l'IA"
            placeholder="Es: 'Fai un riassunto tecnico', 'Focus sulle date', 'Linguaggio semplice'..."
            style="width:100%; border-radius:12px;" />
    </div>

    <!-- EXAM INFO SECTION -->
    <div class="input-area" style="margin-bottom:16px;">
        <div style="font-size:0.82rem;font-weight:700;color:var(--gold);letter-spacing:0.05em;margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
            <span>🎓 INFO ESAME</span>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Template:</span>
                <select id="deck-template" onchange="applyTemplate()"
                    style="padding:4px 10px; border-radius:8px; background:var(--surface2); border:1px solid var(--border); color:var(--text); font-size:0.75rem; cursor:pointer;">
                    <option value="academic">📚 Accademico</option>
                    <option value="speech">🎙️ Speech Master</option>
                    <option value="polyglot">🌎 Polyglot Lab</option>
                    <option value="chef">👨‍🍳 Chef Pro</option>
                </select>
            </div>
        </div>
        <div class="input-row">
            <div>
                <label for="deck-name">Nome della materia</label>
                <input type="text" id="deck-name" aria-label="Nome della materia" placeholder="es. Diritto Privato" />
            </div>
            <div>
                <label for="deck-subject">Corso / Facoltà</label>
                <input type="text" id="deck-subject" aria-label="Corso o facoltà" placeholder="es. Giurisprudenza" />
            </div>
        </div>
        <div class="input-row">
            <div>
                <label for="exam-date">📅 Data dell'esame</label>
                <input type="date" id="exam-date" aria-label="Data dell'esame" />
            </div>
            <div>
                <label>📝 Tipo di esame</label>
                <select id="exam-type">
                    <option value="">— Scegli —</option>
                    <option value="scritto">✍️ Solo Scritto</option>
                    <option value="orale">🗣️ Solo Orale</option>
                    <option value="scritto+orale">✍️🗣️ Scritto + Orale</option>
                    <option value="pratico">🔧 Pratico / Lab</option>
                    <option value="progetto">📁 Progetto</option>
                </select>
            </div>
        </div>
        <div>
            <label for="exam-topics">🎯 Argomenti principali / Focus dell'esame</label>
            <input type="text" id="exam-topics" aria-label="Argomenti principali dell'esame"
                placeholder="es. Contratti, Successioni, Proprietà — quello che il prof ha detto che conta di più" />
        </div>
        <div style="margin-top:14px;">
            <label for="exam-attachments">📎 Allegati Info (Orario, Regole, Foto Appunti)</label>
            <input type="file" id="exam-attachments" aria-label="Carica allegati info esame" multiple onchange="handleExamAttachments(event)"
                accept="image/*,.pdf" style="margin-top:4px;" />
            <div id="exam-attachments-list" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"></div>
        </div>
    </div>

    <!-- MATERIAL SECTION -->
    <div class="input-area">
        <div style="font-size:0.82rem;font-weight:700;color:var(--accent2);letter-spacing:0.05em;margin-bottom:14px;">
            📖 MATERIALE DI STUDIO</div>
        <div>
            <label>📄 Carica il materiale o incolla il testo</label>
            <div class="upload-grid">
                <div class="upload-card"
                    ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
                    ondragleave="this.style.borderColor=''"
                    ondrop="handlePdfDrop(event)">
                    <input type="file" aria-label="Carica qualsiasi file di materiale" multiple
                        onchange="(async()=>{for(let i=0;i<this.files.length;i++) await handlePdfFile(this.files[i],i+1,this.files.length); this.value='';})()" />
                    <div class="icon">📁</div>
                    <h4>Qualsiasi File</h4>
                    <p>Estrae testo o audio</p>
                </div>
                <div class="upload-card">
                    <input type="file" aria-label="Carica foto appunti" multiple accept="image/*,.heic,.heif,.raw,.tiff,.webp"
                        onchange="(async()=>{for(let i=0;i<this.files.length;i++) await handleImageFile(this.files[i],i+1,this.files.length); this.value='';})()" />
                    <div class="icon">📸</div>
                    <h4>Foto Appunti</h4>
                    <p>Riconoscimento OCR</p>
                </div>
                <div class="upload-card">
                    <input type="file" aria-label="Carica file audio o video" multiple accept="audio/*,video/*,.m4a,.flac,.wav,.ogg,.mp3,.mp4,.webm"
                        onchange="(async()=>{for(let i=0;i<this.files.length;i++) await handleAudioFile(this.files[i],i+1,this.files.length); this.value='';})()" />
                    <div class="icon">🎙️</div>
                    <h4>File Audio</h4>
                    <p>Sbobina lezioni</p>
                </div>
                <div class="upload-card" data-fn="promptYouTubeLink">
                    <div class="icon">🎬</div>
                    <h4>Link YouTube</h4>
                    <p>Trascrivi Video</p>
                </div>
                <div class="upload-card" data-fn="promptWebLink">
                    <div class="icon">🌐</div>
                    <h4>Link Web</h4>
                    <p>Articoli o Blog</p>
                </div>
            </div>
            <div class="pdf-status" id="pdf-status">
                <div class="spinner" id="pdf-spinner"></div>
                <span id="pdf-status-text">Lettura PDF in corso...</span>
            </div>
            <textarea id="deck-text" aria-label="Incolla qui il testo del materiale" placeholder="...oppure incolla qui appunti, libri, slide."
                oninput="updateCharCount()" style="min-height:200px;"></textarea>

            <div id="ai-summary-container"
                style="display:none; margin-bottom:16px; padding:16px; background:var(--surface2); border-left:4px solid var(--accent); border-radius:12px;">
                <h4 style="margin-bottom:8px; display:flex; align-items:center; gap:8px;">📝 Riassunto IA</h4>
                <div id="ai-summary-text" style="font-size:0.95rem; line-height:1.6; color:var(--text);"></div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div class="char-count"><span id="char-count">0</span> caratteri</div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-outline" style="font-weight:700; border-radius:8px; cursor:pointer;"
                        data-fn="openPdfChunking">✂️ Spaccatesto</button>
                    <button class="btn" id="btn-generate-ai"
                        style="background:var(--accent); color:#fff; border:none; padding:8px 16px; font-weight:700; border-radius:8px; cursor:pointer;"
                        data-fn="openPdfAIFromText">✨ Genera Flashcard con IA</button>
                </div>
            </div>
        </div>
    </div>

    <!-- FLASHCARD SECTION (opzionale) -->
    <div style="margin-bottom:12px;">
        <button class="add-pair-btn" data-fn="toggleFlashcards" id="fc-toggle-btn">
            🃏 + Aggiungi Flashcard (opzionale)
        </button>
    </div>
    <div id="flashcard-section" style="display:none;">
        <div class="section-header">
            <p style="color:var(--text-muted);font-size:0.88rem;">Una sola idea per carta. Domanda → Risposta.</p>
        </div>
        <div id="pairs-container"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">
            <button class="add-pair-btn" data-fn="addPair">+ Aggiungi flashcard</button>
            <button class="add-pair-btn" data-fn="importCSVFlashcards"
                style="background:rgba(6,182,212,0.1);border-color:rgba(6,182,212,0.3);color:#22d3ee;"
                title="Importa da CSV, Anki export, o file TXT con formato domanda;risposta">
                📥 Importa CSV / Anki
            </button>
        </div>
    </div>

    <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button class="btn btn-primary" data-fn="saveDeck">💾 Salva Materia</button>
        <button class="btn" style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;"
            data-fn="saveAndGeneratePlan">⚡ Salva e Genera Piano di Studio</button>
    </div>

</div>`;

        this._resetForm();
    }

    _resetForm() {
        // Equivalente al blocco if (id === 'view-create') in showView() di main.js
        resetPendingAttachments();

        const reset = [
            ['exam-attachments-list',  el => { el.innerHTML = ''; }],
            ['exam-attachments',       el => { el.value = ''; }],
            ['deck-name',              el => { el.value = ''; }],
            ['deck-subject',           el => { el.value = ''; }],
            ['deck-text',              el => { el.value = ''; }],
            ['exam-date',              el => { el.value = ''; }],
            ['exam-type',              el => { el.value = ''; }],
            ['exam-topics',            el => { el.value = ''; }],
            ['char-count',             el => { el.textContent = '0'; }],
            ['pairs-container',        el => { el.innerHTML = ''; }],
            ['flashcard-section',      el => { el.style.display = 'none'; }],
            ['fc-toggle-btn',          el => { el.textContent = t('deck_add_flashcard'); }],
            ['ai-summary-container',   el => { el.style.display = 'none'; }],
            ['pdf-status',             el => { el.classList.remove('visible'); }],
            ['pdf-spinner',            el => { el.style.display = ''; }],
        ];
        reset.forEach(([id, fn]) => { const el = document.getElementById(id); if (el) fn(el); });

        // Reset currentDeckIndex → modalità creazione nuova materia
        if (typeof window.resetCurrentDeckIndex === 'function') window.resetCurrentDeckIndex();
    }

    update(/* state */) { /* no-op — il form è gestito dai moduli */ }

    unmount() {
        this.mountPoint.innerHTML = '';
    }
}
