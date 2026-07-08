import { Component }   from '../Component.js';
import { renderDecks } from '../../modules/decks.js';

export class MaterialeView extends Component {

    render(state) {

        // SOTTO-VISTA 1: FORM DI CREAZIONE E UPLOAD (view-create)
        if (state.currentView === 'view-create') {
            return `
            <div class="fade-in" style="max-width: 900px; margin: 0 auto; padding-bottom: 60px;">
                <button class="zen-btn-ghost" data-fn="showPage" data-params='["materiale"]' style="font-size: 0.7rem; margin-bottom: 32px;">← Le mie materie</button>
                <div class="section-header" style="margin-bottom: 48px;">
                    <h2 style="font-size: 2.2rem; font-weight: 200; letter-spacing: 0.05em;">➕ <span data-i18n="mat_new_subject">Nuova Materia</span></h2>
                    <p style="color: var(--zen-muted);" data-i18n="mat_new_subject_hint">Inserisci le info sull'esame e il materiale da studiare.</p>
                </div>

                <div class="input-area" style="margin-bottom:32px; border:1px solid var(--zen-accent); padding: 24px;">
                    <label style="font-size:0.7rem; color:var(--zen-accent); font-weight:800; text-transform: uppercase; letter-spacing: 0.2em; display:flex; align-items:center; gap:8px; margin-bottom:16px;">
                        ✨ Neural Tuning (AI Instructions)
                    </label>
                    <input type="text" id="ai-custom-instructions" aria-label="Istruzioni personalizzate per l'IA" placeholder="Es: 'Riassunto tecnico per ingegneria', 'Focus sulle date'..." style="width:100%; border-radius:0; border: 1px solid var(--zen-border); background: transparent; padding: 12px;" />
                </div>

                <div class="input-area" style="margin-bottom:16px;">
                    <div style="font-size:0.82rem;font-weight:700;color:var(--gold);letter-spacing:0.05em;margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
                        <span>🎓 INFO ESAME</span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Template:</span>
                            <select id="deck-template" onchange="if(window.applyTemplate) window.applyTemplate()" style="padding:4px 10px; border-radius:8px; background:var(--surface2); border:1px solid var(--border); color:var(--text); font-size:0.75rem; cursor:pointer;">
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
                        <div><label for="exam-date">📅 Data dell'esame</label><input type="date" id="exam-date" aria-label="Data dell'esame" /></div>
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
                        <label for="exam-topics">🎯 Argomenti principali / Focus</label>
                        <input type="text" id="exam-topics" aria-label="Argomenti principali dell'esame" placeholder="es. Contratti, Successioni..." />
                    </div>
                    <div style="margin-top:14px;">
                        <label for="exam-attachments">📎 Allegati Info (Orario, Regole)</label>
                        <input type="file" id="exam-attachments" aria-label="Carica allegati info esame" multiple onchange="if(window.handleExamAttachments) window.handleExamAttachments(event)" accept="image/*,.pdf" style="margin-top:4px;" />
                        <div id="exam-attachments-list" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"></div>
                    </div>
                </div>

                <div class="input-area">
                    <div style="font-size:0.82rem;font-weight:700;color:var(--accent2);letter-spacing:0.05em;margin-bottom:14px;">📖 MATERIALE DI STUDIO</div>
                    <label for="deck-text">📄 Carica il materiale o incolla il testo</label>
                    <div class="upload-grid">
                        <div class="upload-card" ondragover="event.preventDefault();this.style.borderColor='var(--accent)'" ondragleave="this.style.borderColor=''" ondrop="if(window.handlePdfDrop) window.handlePdfDrop(event)">
                            <input type="file" aria-label="Carica qualsiasi file di materiale" multiple onchange="if(window.handlePdfFile) { (async()=>{for(let i=0;i<this.files.length;i++) await window.handlePdfFile(this.files[i], i+1, this.files.length); this.value='';})() }" />
                            <div class="icon">📁</div>
                            <h4 data-i18n="upload_any">Qualsiasi File</h4><p data-i18n="upload_any_hint">Estrae testo o audio</p>
                        </div>
                        <div class="upload-card">
                            <input type="file" aria-label="Carica foto appunti" multiple accept="image/*,.heic,.heif,.raw,.webp" onchange="if(window.handleImageFile) { (async()=>{for(let i=0;i<this.files.length;i++) await window.handleImageFile(this.files[i], i+1, this.files.length); this.value='';})() }" />
                            <div class="icon">📸</div>
                            <h4 data-i18n="upload_photos">Foto Appunti</h4><p data-i18n="upload_photos_hint">Riconoscimento OCR</p>
                        </div>
                        <div class="upload-card">
                            <input type="file" aria-label="Carica file audio o video" multiple accept="audio/*,video/*" onchange="if(window.handleAudioFile) { (async()=>{for(let i=0;i<this.files.length;i++) await window.handleAudioFile(this.files[i], i+1, this.files.length); this.value='';})() }" />
                            <div class="icon">🎙️</div>
                            <h4 data-i18n="upload_audio">File Audio</h4><p data-i18n="upload_audio_hint">Sbobina lezioni</p>
                        </div>
                        <div class="upload-card" data-fn="promptYouTubeLink">
                            <div class="icon">🎬</div>
                            <h4 data-i18n="upload_youtube">Link YouTube</h4><p data-i18n="upload_youtube_hint">Trascrivi Video</p>
                        </div>
                    </div>
                    <!-- File badge persistenti dopo upload -->
                    <div id="uploaded-files-list" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;"></div>

                    <div class="pdf-status" id="pdf-status"><div class="spinner" id="pdf-spinner"></div><span id="pdf-status-text">Lettura PDF...</span></div>
                    <textarea id="deck-text" aria-label="Incolla qui il testo del materiale" placeholder="...oppure incolla qui appunti." oninput="if(window.updateCharCount) window.updateCharCount()" style="min-height:200px;"></textarea>

                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="char-count"><span id="char-count">0</span> caratteri</div>
                        <div style="display:flex; gap:8px;">
                            <button aria-label="Apri strumento spaccatesto" class="btn btn-outline" style="font-weight:700; border-radius:8px; cursor:pointer;" data-fn="openPdfChunking">✂️ Spaccatesto</button>
                            <button aria-label="Genera flashcard con IA" class="btn" id="btn-generate-ai" style="background:var(--accent); color:#fff; border:none; padding:8px 16px; font-weight:700; border-radius:8px; cursor:pointer;" data-fn="autoGenerateFlashcards">✨ Genera con IA</button>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom:12px;">
                    <button class="add-pair-btn" data-fn="toggleFlashcards" id="fc-toggle-btn">🃏 + Aggiungi Flashcard (opzionale)</button>
                </div>
                <div id="flashcard-section" style="display:none;">
                    <div class="section-header"><p style="color:var(--text-muted);font-size:0.88rem;">Una sola idea per carta. Domanda → Risposta.</p></div>
                    <div id="pairs-container"></div>
                    <button class="add-pair-btn" data-fn="addPair" style="margin-bottom:20px;">+ Aggiungi flashcard</button>
                </div>

                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    <button aria-label="Salva materia" class="btn btn-primary" data-fn="saveDeck">💾 Salva Materia</button>
                    <button aria-label="Salva materia e genera piano" class="btn" style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;" data-fn="saveAndGeneratePlan">⚡ Salva e Genera Piano di Studio</button>
                </div>
            </div>
        `;
        }

        // SOTTO-VISTA 2: PIANO DI STUDIO (view-plan)
        if (state.currentView === 'view-plan') {
            return `
            <div class="fade-in" style="max-width: 900px; margin: 0 auto; padding-bottom: 60px;">
                <button class="zen-btn-ghost" data-fn="showPage" data-params='["materiale"]' style="font-size: 0.7rem; margin-bottom: 32px;">← Le mie materie</button>
                <div id="plan-content"></div>

                <div style="margin-top:48px; padding:32px; border:1px solid var(--zen-accent);">
                    <h4 style="margin-bottom:16px; font-weight: 200; letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.9rem;">✨ Rigenera Riassunto Neurale</h4>
                    <p style="font-size:0.85rem; color:var(--zen-muted); margin-bottom:20px;">Utilizza istruzioni specifiche per calibrare l'IA:</p>
                    <div style="display:flex; gap:16px; flex-wrap: wrap;">
                        <input type="text" id="plan-ai-instructions" aria-label="Istruzioni per rigenerare il piano con IA" placeholder="es: 'Aggiungi più dettagli tecnici'..." style="flex:1; min-width: 200px; padding:12px; background:transparent; border:1px solid var(--zen-border); border-radius:0; color:white;" />
                        <button class="zen-btn-ghost" data-fn="regeneratePlanWithAI" style="border-color: var(--zen-accent); color: var(--zen-accent);">✨ Applica Tuning</button>
                    </div>
                </div>
            </div>
        `;
        }

        // SOTTO-VISTA 3 (DEFAULT): GRIGLIA MAZZI (view-decks)
        return `
        <div class="fade-in" style="max-width: 1000px; margin: 0 auto; padding-bottom: 100px;">
            <div class="section-header" style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:32px; margin-bottom: 48px;">
                <div>
                    <h2 style="font-size: 2.8rem; font-weight: 200; letter-spacing: 0.05em; margin-bottom: 8px;">📚 <span data-i18n="mat_library_title">Neural Library</span></h2>
                    <p style="color: var(--zen-muted); font-size: 1.1rem;" data-i18n="mat_library_subtitle">I tuoi mazzi di flashcard e piani di studio strutturati.</p>
                </div>
                <div style="display:flex; gap:12px;">
                    <button class="zen-btn-ghost" onclick="if(window.appSync) window.appSync.exportData()" style="font-size: 0.7rem;">📤 Esporta</button>
                    <button class="zen-btn-ghost" onclick="document.getElementById('import-file').click()" style="font-size: 0.7rem;">📥 Importa</button>
                    <input type="file" id="import-file" style="display:none;" onchange="if(window.appSync) window.appSync.importData(event)">
                </div>
            </div>

            <button class="zen-btn-ghost" data-fn="showPage" data-params='["view-create"]' data-i18n="mat_new_btn" style="margin-bottom:48px; border-color: var(--zen-accent); color: var(--zen-accent); padding: 16px 32px;">+ Crea Nuova Materia</button>

            <div id="decks-container">
                </div>
        </div>
    `;
    }

    bindEvents() {
        // Phase 13: La lista mazzi è gestita da un modulo dedicato (decks.js)
        // per mantenere MaterialeView snella.
        renderDecks();
    }
}
