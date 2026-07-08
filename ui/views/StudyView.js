// ui/views/StudyView.js
import { Component } from '../Component.js';
import { processAnswer } from '../../services/srs.js';

export class StudyView extends Component {

    render(state) {
        const { study = { currentIndex: 0, isFlipped: false }, decks = [], activeDeckId } = state;
        const deck = decks.find(d => d.id === activeDeckId);

        if (!deck) return `
            <div class="home-container" style="text-align:center; padding:60px 20px;">
                <p style="color:var(--text-muted);">Nessun mazzo selezionato.</p>
                <button class="btn btn-primary" data-action="NAVIGATE" data-payload="home" style="margin-top:16px;">← Torna Home</button>
            </div>`;

        const cards     = deck.cards || [];
        const idx       = study.currentIndex || 0;
        const card      = cards[idx];
        const isFlipped = study.isFlipped || false;
        const progressPct = cards.length > 0 ? Math.round(((idx + 1) / cards.length) * 100) : 0;
        const isLast    = idx >= cards.length - 1;

        if (!card) return `
            <div class="fade-in" style="text-align:center; padding:100px 20px; max-width: 600px; margin: 0 auto;">
                <div style="font-size:4rem; margin-bottom:32px; filter: grayscale(1); opacity: 0.5;">🧘</div>
                <h3 style="font-size: 2rem; font-weight: 200; letter-spacing: 0.05em; color: var(--zen-text);">Sessione Conclusa</h3>
                <p style="color:var(--zen-muted); margin-top:16px; font-size: 1.1rem;">La tua impronta neurale è stata rafforzata.</p>
                <button class="zen-btn-ghost" data-fn="showPage" data-params='["home"]' style="margin-top:40px; border-color: var(--zen-accent); color: var(--zen-accent);">← Ritorna al Centro</button>
            </div>`;

        return `
        <div class="study-dark-room fade-in" style="max-width:900px; margin:0 auto; padding:40px 20px; display: flex; flex-direction: column; min-height: 80vh; justify-content: center;">

            <!-- Header: Subtle -->
            <div style="position: fixed; top: 20px; left: 100px; right: 40px; display: flex; justify-content: space-between; align-items: center; opacity: 0.4; transition: opacity 0.3s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.4'">
                <button class="zen-btn-ghost" data-fn="showPage" data-params='["home"]' style="font-size: 0.65rem; padding: 4px 12px;">← EXIT</button>
                <span style="font-size: 0.65rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--zen-text);">${deck.name || 'Neural Stream'}</span>
                <span style="font-size: 0.65rem; color: var(--zen-muted);">${idx + 1} / ${cards.length}</span>
            </div>

            <!-- Ultra-Thin Progress Line -->
            <div style="position: fixed; top: 0; left: 72px; width: calc(100% - 72px); height: 1px; background: var(--zen-border);">
                <div style="width: ${progressPct}%; height: 100%; background: var(--zen-accent); box-shadow: 0 0 10px var(--zen-accent-glow); transition: width 0.6s ease;"></div>
            </div>

            <!-- Centered Flashcard -->
            <div id="srs-flip-card" style="perspective:2000px; cursor:pointer; margin: 40px 0;">
                <div style="
                    min-height:350px; position:relative;
                    transform-style:preserve-3d;
                    transition:transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                    transform:${isFlipped ? 'rotateY(180deg)' : 'rotateY(0)'}
                ">
                    <!-- Fronte -->
                    <div style="
                        position:absolute; inset:0;
                        backface-visibility:hidden;
                        display:flex; align-items:center; justify-content:center;
                        text-align:center; padding:40px; border: 1px solid var(--zen-border);
                        background: transparent;
                    ">
                        <div style="width: 100%;">
                            <div style="font-size:0.6rem; color:var(--zen-accent); text-transform:uppercase; letter-spacing:4px; margin-bottom:32px; opacity: 0.6;">INPUT_SIGNAL</div>
                            <h3 style="font-size:2.2rem; line-height:1.3; font-weight: 200; color: var(--zen-text); letter-spacing: -0.02em;">${card.q}</h3>
                        </div>
                    </div>

                    <!-- Retro -->
                    <div style="
                        position:absolute; inset:0;
                        backface-visibility:hidden;
                        transform:rotateY(180deg);
                        display:flex; align-items:center; justify-content:center;
                        text-align:center; padding:40px; border: 1px solid var(--zen-accent);
                        background: var(--zen-glass);
                    ">
                        <div style="width: 100%;">
                            <div style="font-size:0.6rem; color:var(--zen-accent); text-transform:uppercase; letter-spacing:4px; margin-bottom:32px;">NEURAL_RESPONSE</div>
                            <h3 style="font-size:2.2rem; line-height:1.3; font-weight: 500; color: var(--zen-text);">${card.a}</h3>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Rating buttons (visibili solo dopo flip) -->
            <div style="min-height: 80px; display: flex; align-items: center; justify-content: center;">
                ${isFlipped ? `
                <div style="display:flex; gap:16px; justify-content:center; width: 100%; max-width: 500px; animation: slideUp 0.4s ease;">
                    <button class="zen-btn-ghost srs-rate-btn" data-rating="0" style="flex:1; font-size: 0.7rem; border-color: rgba(239,68,68,0.2); color: #fca5a5;">RIPETI</button>
                    <button class="zen-btn-ghost srs-rate-btn" data-rating="1" style="flex:1; font-size: 0.7rem; border-color: rgba(245,158,11,0.2); color: #fdba74;">DIFFICILE</button>
                    <button class="zen-btn-ghost srs-rate-btn" data-rating="2" style="flex:1; font-size: 0.7rem; border-color: rgba(34,197,94,0.2); color: #86efac;">BENE</button>
                    <button class="zen-btn-ghost srs-rate-btn" data-rating="3" style="flex:1; font-size: 0.7rem; border-color: var(--zen-accent); color: var(--zen-accent);">FACILE</button>
                </div>
                ` : `
                <div style="opacity: 0.4; font-size: 0.7rem; letter-spacing: 0.2em; text-transform: uppercase;">Clicca la carta per rivelare</div>
                `}
            </div>

            <!-- Navigation Bar: Subtle -->
            <div style="margin-top: 60px; display: flex; justify-content: center; gap: 40px; opacity: 0.3; transition: opacity 0.3s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'">
                <button class="zen-btn-ghost" data-fn="prevCard" ${idx === 0 ? 'disabled style="opacity:0.2;"' : ''} style="font-size: 0.65rem; border: none;">[ ANTECEDENTE ]</button>
                <button class="zen-btn-ghost" data-fn="nextCard" ${isLast ? 'disabled style="opacity:0.2;"' : ''} style="font-size: 0.65rem; border: none;">[ SUCCESSIVO ]</button>
            </div>

            <!-- SM-2 Intel -->
            <div style="margin-top: 32px; text-align: center; font-size: 0.6rem; color: var(--zen-muted); letter-spacing: 0.1em; text-transform: uppercase;">
                ${card.interval ? `Neural Gap: ${card.interval}d` : 'New Synapse'}
                ${card.ease ? ` | Integrity: ${Math.round(card.ease * 100 / 2.5)}%` : ''}
            </div>
        </div>`;
    }

    bindEvents() {
        const state       = this.store.getState();
        const { decks, activeDeckId, study } = state;
        const deck        = decks?.find(d => d.id === activeDeckId);
        const idx         = study?.currentIndex ?? 0;

        // Flip card — clic sulla card o sul bottone "Gira"
        const flipCard = this.mountPoint.querySelector('#srs-flip-card');
        const flipBtn  = this.mountPoint.querySelector('#srs-flip-trigger');

        const doFlip = () => this.store.dispatch({ type: 'FLIP_CARD' });
        if (flipCard) flipCard.addEventListener('click', doFlip);
        if (flipBtn)  flipBtn.addEventListener('click', (e) => { e.stopPropagation(); doFlip(); });

        // Rating SM-2
        this.mountPoint.querySelectorAll('.srs-rate-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!deck) return;
                const rating      = parseInt(btn.dataset.rating);
                const card        = deck.cards[idx];
                if (!card) return;

                // Calcola carta aggiornata con l'algoritmo SM-2
                const updatedCard = processAnswer(card, rating);

                // Aggiorna la carta nel deck
                this.store.dispatch({
                    type: 'RATE_CARD',
                    payload: { deckId: deck.id, cardIndex: idx, updatedCard }
                });

                // Feedback visivo
                const labels = ['Non sapevo — ripasso domani', 'Difficile — ripasso tra poco', `Ottimo! Ripasso tra ${updatedCard.interval} giorn${updatedCard.interval === 1 ? 'o' : 'i'}`];
                if (window.showToast) window.showToast(labels[rating] || '', rating === 2 ? 'success' : rating === 1 ? 'warning' : 'error');

                // Avanza alla prossima carta
                this.store.dispatch({ type: 'NEXT_CARD' });
            });
        });
    }

    unmount() {
        this.mountPoint.innerHTML = '';
    }
}
