import { Component } from '../Component.js';
import { t } from '../../core/i18n.js';
import { PdfService } from '../../services/pdf.api.js';
import { AiService } from '../../services/ai.api.js';
import { Sanitizer } from '../../core/schema.js';

export class PdfView extends Component {
    render(state) {
        if (state.currentView !== 'pdf') return '';

        return `
            <div class="pdf-container" style="padding: 20px; animation: fadeIn 0.3s ease;">
                <div class="stat-card" style="text-align: center;">
                    <h2>🧠 Cortex PDF Mind-Mapping</h2>
                    <p>Carica i tuoi appunti e lascia che l'IA estragga i concetti chiave.</p>
                    
                    <div style="margin: 30px 0;">
                        <input type="file" id="pdf-upload" accept="application/pdf" style="display: none;" />
                        <button id="btn-upload-trigger" class="primary-btn">Seleziona Documento PDF</button>
                    </div>
                    
                    <div id="pdf-status" style="color: var(--text-secondary); font-size: 0.9rem;">
                        In attesa di un file...
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        const triggerBtn = this.mountPoint.querySelector('#btn-upload-trigger');
        const fileInput = this.mountPoint.querySelector('#pdf-upload');
        const statusDisplay = this.mountPoint.querySelector('#pdf-status');

        if (triggerBtn && fileInput) {
            triggerBtn.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (file.type !== 'application/pdf') {
                    if (window.showToast) window.showToast("Solo file PDF supportati", "error");
                    return;
                }

                statusDisplay.innerHTML = `Analisi strutturale di <strong>${file.name}</strong>... <span class="pulse-dot" style="display:inline-block"></span>`;
                triggerBtn.disabled = true;
                triggerBtn.style.opacity = '0.5';

                try {
                    // 1. Estrazione testo asincrona (Worker)
                    const extractedText = await PdfService.extractText(file);
                    statusDisplay.innerHTML = `Generazione mappe concettuali in corso... <span class="pulse-dot" style="display:inline-block"></span>`;
                    
                    // 2. Chiamata all'IA per la sintesi
                    const newCards = await AiService.generateCardsFromText(extractedText);
                    
                    // 3. Sanitizzazione delle carte contro XSS
                    const safeCards = newCards.map(Sanitizer.sanitizeCard);

                    // 4. Creazione del nuovo Mazzo
                    const newDeck = {
                        id: 'deck_' + Date.now(),
                        title: `Mappa: ${file.name.replace('.pdf', '')}`,
                        cards: safeCards,
                        createdAt: Date.now()
                    };

                    // 5. Unione con lo stato corrente e Dispatch allo Store
                    const currentState = this.store.getState();
                    const updatedDecks = [...(currentState.decks || []), newDeck];
                    
                    this.store.dispatch({ type: 'UPDATE_DECKS', payload: updatedDecks });
                    
                    // 6. Feedback visivo e redirect
                    if (window.showToast) window.showToast(t('pdf_deck_success'), "success");
                    this.store.dispatch({ type: 'NAVIGATE', payload: 'home' });

                } catch (error) {
                    console.error("[PDF PIPELINE ERROR]", error);
                    statusDisplay.innerHTML = `<span style="color: #ef4444;">Errore: ${error.message}</span>`;
                    triggerBtn.disabled = false;
                    triggerBtn.style.opacity = '1';
                }
            });
        }
    }
}
