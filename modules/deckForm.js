import { t } from '../core/i18n.js';
import { TRANSLATIONS } from '../data/translations.js';
const _t = () => TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it;
/**
 * modules/deckForm.js — Phase 18
 *
 * Form di creazione/modifica mazzi: coppie Q/A, allegati, salvataggio.
 * Estratto da main.js (addPair, removePair, handleExamAttachments,
 * renderPendingAttachments, buildDeckObject, saveDeck, editDeck).
 *
 * Dipendenze iniettate via init():
 *   state                — app state (state.decks, state.globalStudyMethod)
 *   saveState            — persiste state su localStorage
 *   showToast            — notifiche UI
 *   updateCharCount      — aggiorna counter caratteri textarea
 *   showView             — navigazione vista
 *   getCurrentDeckIndex  — getter per currentDeckIndex (main.js scope)
 *   setCurrentDeckIndex  — setter per currentDeckIndex (main.js scope)
 *
 * Import diretti:
 *   awardXP              ← modules/gamification.js
 *   renderDecks          ← modules/decks.js
 *   todayStr, sanitizeHTML ← js/utils.js
 *   APP_CONFIG           ← js/config.js
 */
import { awardXP }             from './gamification.js';
import { renderDecks }         from './decks.js';
import { todayStr, sanitizeHTML } from '../js/utils.js';
import { APP_CONFIG }          from '../js/config.js';
import { track }               from '../core/analytics.js';

const DRAFT_KEY = APP_CONFIG.STORAGE_KEYS.DRAFT;

// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = {
    state:               { decks: [] },
    saveState:           () => {},
    showToast:           () => {},
    updateCharCount:     () => {},
    showView:            () => {},
    getCurrentDeckIndex: () => null,
    setCurrentDeckIndex: () => {},
};

export function init(deps) {
    _deps = { ..._deps, ...deps };
}

// ── Stato allegati (modulo-scope) ─────────────────────────────────────────────

let pendingExamAttachments = [];

/** Chiamato da showView('view-create') per azzerare gli allegati pending. */
export function resetPendingAttachments() {
    pendingExamAttachments = [];
}

// ── Coppie Q/A ────────────────────────────────────────────────────────────────

export function addPair(q = '', a = '') {
    const container = document.getElementById('pairs-container');
    const id = Date.now() + Math.random();
    const div = document.createElement('div');
    div.className = 'fc-pair';
    div.id = 'pair-' + id;
    div.innerHTML = `
    <div><label>Domanda</label><input type="text" placeholder="Cos'è la spaced repetition?" /></div>
    <div><label>Risposta</label><input type="text" placeholder="Una tecnica che..." /></div>
    <div style="padding-top:22px;"><button aria-label="${t('deckform_remove_pair')}" class="btn-icon" data-fn="removePair" data-params='["pair-${id}"]'>🗑️</button></div>
  `;
    // Assegna i valori via DOM (non in template string): testi con virgolette
    // o simboli HTML rompevano il markup e la card usciva vuota/corrotta.
    const inputs = div.querySelectorAll('input');
    inputs[0].value = q;
    inputs[1].value = a;
    container.appendChild(div);
}

export function removePair(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Importa flashcard da un file CSV o TXT.
 * Formati supportati:
 *   - CSV standard:  "domanda","risposta"
 *   - Tab-separated: domanda\trisposta
 *   - Anki export:   domanda;risposta  (separatore punto e virgola)
 *   - Riga singola:  domanda - risposta  (separatore trattino)
 */
export function importCSVFlashcards() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt,.tsv';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            let imported = 0;
            let skipped = 0;

            for (const line of lines) {
                // Rileva separatore: tab, punto e virgola, virgola, oppure " - "
                let parts;
                if (line.includes('\t')) {
                    parts = line.split('\t');
                } else if (line.includes(';')) {
                    parts = line.split(';');
                } else if (line.includes(',')) {
                    // CSV con possibili virgolette: "q","a"
                    parts = line.match(/(".*?"|[^,]+)/g)?.map(s => s.replace(/^"|"$/g, '').trim());
                } else if (line.includes(' - ')) {
                    parts = line.split(' - ');
                } else {
                    skipped++;
                    continue;
                }

                const q = parts[0]?.trim();
                const a = parts[1]?.trim();
                if (q && a) {
                    addPair(q, a);
                    imported++;
                } else {
                    skipped++;
                }
            }

            if (imported > 0) {
                if (window.showToast) window.showToast(`✅ Importate ${imported} flashcard${imported > 1 ? '' : ''}${skipped > 0 ? ` (${skipped} righe saltate)` : ''}.`, 'success');
            } else {
                if (window.showToast) window.showToast('⚠️ Nessuna flashcard trovata. Usa formato: domanda,risposta oppure domanda;risposta', 'error');
            }
        };
        reader.readAsText(file, 'UTF-8');
        document.body.removeChild(input);
    });

    input.click();
}

// ── Allegati esame ────────────────────────────────────────────────────────────

/** onchange="handleExamAttachments(event)" — deve restare su window. */
export function handleExamAttachments(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let f of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            pendingExamAttachments.push({
                name: f.name,
                type: f.type,
                data: e.target.result
            });
            renderPendingAttachments();
        };
        reader.readAsDataURL(f);
    }
}

export function renderPendingAttachments() {
    const container = document.getElementById('exam-attachments-list');
    if (!container) return;
    container.innerHTML = pendingExamAttachments.map((att, i) => `
                <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:4px 8px;font-size:0.75rem;display:flex;align-items:center;gap:6px;">
                    <span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${att.name || 'Allegato'}</span>
                    <button aria-label="Rimuovi questo allegato" data-fn="removeExamAttachment" data-params="[${i}]" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button>
                </div>
            `).join('');
}

/** Chiamato dal registry via data-fn="removeExamAttachment". */
export function removeExamAttachment(i) {
    pendingExamAttachments.splice(i, 1);
    renderPendingAttachments();
}

// ── Build / Save / Edit ───────────────────────────────────────────────────────

export function buildDeckObject() {
    const name = document.getElementById('deck-name').value.trim();
    const subject = document.getElementById('deck-subject').value.trim();
    if (!name) { _deps.showToast('Dai un nome alla materia!', 'error'); return null; }

    const pairs = [];
    document.querySelectorAll('#pairs-container .fc-pair').forEach(row => {
        const inputs = row.querySelectorAll('input');
        const q = inputs[0].value.trim(), a = inputs[1].value.trim();
        if (q && a) pairs.push({ q, a, ease: 2.5, interval: 1, nextReview: todayStr(), reps: 0 });
    });

    const currentDeckIndex = _deps.getCurrentDeckIndex();
    const existingSummary  = (currentDeckIndex !== null) ? _deps.state.decks[currentDeckIndex].aiSummary : '';
    const summaryEl        = document.getElementById('ai-summary-text');
    const currentSummary   = summaryEl ? summaryEl.innerHTML : '';

    return {
        id:         currentDeckIndex !== null ? _deps.state.decks[currentDeckIndex].id : Date.now(),
        name, subject,
        text:       document.getElementById('deck-text').value,
        examDate:   document.getElementById('exam-date').value,
        examType:   document.getElementById('exam-type').value,
        examTopics: document.getElementById('exam-topics').value.trim(),
        attachments: [...pendingExamAttachments],
        cards:       pairs,
        aiSummary:   currentSummary || existingSummary,
        created:     currentDeckIndex !== null ? _deps.state.decks[currentDeckIndex].created : todayStr(),
    };
}

export async function saveDeck() {
    const deck = buildDeckObject();
    if (!deck) return;

    const btn = document.querySelector('[data-fn="saveDeck"]');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ' + (_t().saving||'Salvataggio...');
    }

    try {
        // Pulisci la bozza quando il mazzo viene creato con successo
        localStorage.removeItem(DRAFT_KEY);
        const currentDeckIndex = _deps.getCurrentDeckIndex();
        if (currentDeckIndex !== null) {
            _deps.state.decks[currentDeckIndex] = deck;
        } else {
            _deps.state.decks.push(deck);
        }
        
        _deps.saveState();
        
        // Sincronizzazione granulare specifica per questo mazzo
        if (window.syncToCloud) {
            await window.syncToCloud(deck.id);
        }

        const cardMsg = deck.cards.length > 0 ? ` con ${deck.cards.length} flashcard` : '';
        _deps.showToast(`Materia "${deck.name}" salvata${cardMsg}! 🎉`, 'success');
        awardXP(10, 'Materia salvata');

        // Analytics: first deck vs subsequent
        const isFirst = _deps.state.decks.length === 1 && currentDeckIndex === null;
        track(isFirst ? 'first_deck_created' : 'deck_created', {
            card_count: deck.cards.length,
        });
        renderDecks(); 
        try { if (window.triggerSmartInstallPrompt) window.triggerSmartInstallPrompt(); } catch(_) {}
        _deps.showView('view-decks');
        
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        const matTab = document.getElementById('tab-materiale');
        if (matTab) matTab.classList.add('active');
    } catch (e) {
        console.error('[DeckForm] Error saving deck:', e);
        _deps.showToast(t('err_save'), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

export async function editDeck(idx) {
    let d = _deps.state.decks[idx];

    // 🔄 Lazy Loading: se mancano le carte o il testo, scarichiamoli prima di editare
    if (!d.cards || d.cards.length === 0 || d.text === undefined) {
        if (window.loadDeckFromSubcollection) {
            _deps.showToast(t('deck_loading'), 'info');
            const fullDeck = await window.loadDeckFromSubcollection(d.id);
            if (fullDeck) {
                // Aggiorniamo l'oggetto in memoria con i dati completi
                _deps.state.decks[idx] = { ...d, ...fullDeck };
                d = _deps.state.decks[idx];
                _deps.saveState();
            }
        }
    }

    _deps.showView('view-create');
    _deps.setCurrentDeckIndex(idx); // showView sets it to null, so we set it after

    document.getElementById('deck-name').value    = d.name    || '';
    document.getElementById('deck-subject').value = d.subject || '';
    document.getElementById('deck-text').value    = d.text    || '';
    document.getElementById('exam-date').value    = d.examDate  || '';
    document.getElementById('exam-type').value    = d.examType  || '';
    document.getElementById('exam-topics').value  = d.examTopics || '';

    // Handle AI Summary
    const summaryContainer = document.getElementById('ai-summary-container');
    const summaryText      = document.getElementById('ai-summary-text');
    if (d.aiSummary && summaryContainer && summaryText) {
        summaryText.innerHTML             = sanitizeHTML(d.aiSummary);
        summaryContainer.style.display   = 'block';
    } else if (summaryContainer) {
        summaryContainer.style.display   = 'none';
        summaryText.innerHTML            = '';
    }

    _deps.updateCharCount();

    // Handle attachments
    pendingExamAttachments = d.attachments ? [...d.attachments] : [];
    renderPendingAttachments();

    // Handle cards
    document.getElementById('pairs-container').innerHTML = '';
    if (d.cards && d.cards.length > 0) {
        document.getElementById('flashcard-section').style.display = '';
        document.getElementById('fc-toggle-btn').textContent = t('deck_hide_flashcard');
        d.cards.forEach(c => addPair(c.q, c.a));
    } else {
        document.getElementById('flashcard-section').style.display = 'none';
        document.getElementById('fc-toggle-btn').textContent = t('deck_add_flashcard');
    }
}

// ── Aggiungi materiale a deck esistente ───────────────────────────────────────

/**
 * Apre una modale leggera per aggiungere testo/note a un deck già creato.
 * Il nuovo testo viene APPESO (non sostituito) al testo esistente del deck.
 * Opzionalmente richiama la generazione AI per creare nuove flashcard dal testo aggiunto.
 */
export function openAddMaterial(idx) {
    const deck = _deps.state.decks[idx];
    if (!deck) return;

    // Rimuovi eventuale modale precedente
    const existing = document.getElementById('add-material-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'add-material-modal';
    modal.style.cssText = `
        position:fixed; inset:0; z-index:20000;
        background:rgba(0,0,0,.7); backdrop-filter:blur(6px);
        display:flex; align-items:center; justify-content:center; padding:16px;
    `;
    modal.innerHTML = `
        <div style="
            background:var(--surface1,#1a1a2e); border:1px solid var(--border,rgba(255,255,255,.12));
            border-radius:16px; padding:24px; max-width:560px; width:100%;
            box-shadow:0 24px 64px rgba(0,0,0,.6);
        ">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <h3 style="margin:0;font-size:1.1rem;">➕ Aggiungi materiale a <em>${sanitizeHTML(deck.name)}</em></h3>
                <button id="add-mat-close" style="background:none;border:none;color:inherit;font-size:1.4rem;cursor:pointer;line-height:1;">✕</button>
            </div>
            <p style="font-size:.85rem;color:rgba(255,255,255,.55);margin:0 0 12px;">
                Incolla appunti, paragrafi del libro o qualsiasi testo. Verrà aggiunto al materiale già presente.
            </p>
            <textarea id="add-mat-text"
                placeholder="Incolla qui il nuovo materiale..."
                style="
                    width:100%;min-height:180px;resize:vertical;
                    background:var(--surface2,rgba(255,255,255,.06));
                    border:1px solid var(--border,rgba(255,255,255,.12));
                    border-radius:10px;padding:12px;color:inherit;
                    font-size:.9rem;line-height:1.5;box-sizing:border-box;
                "
            ></textarea>
            <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
                <button id="add-mat-save" style="
                    flex:1;min-width:120px;padding:11px 16px;
                    background:var(--accent,#7c3aed);color:#fff;border:none;
                    border-radius:10px;cursor:pointer;font-weight:600;font-size:.9rem;
                ">💾 Salva materiale</button>
                <button id="add-mat-ai" style="
                    flex:1;min-width:120px;padding:11px 16px;
                    background:rgba(124,58,237,.25);color:var(--accent,#7c3aed);
                    border:1px solid rgba(124,58,237,.4);
                    border-radius:10px;cursor:pointer;font-weight:600;font-size:.9rem;
                ">✨ Salva + genera flashcard</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Chiudi
    const close = () => modal.remove();
    modal.querySelector('#add-mat-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    // Salva solo il testo
    modal.querySelector('#add-mat-save').addEventListener('click', async () => {
        const newText = modal.querySelector('#add-mat-text').value.trim();
        if (!newText) { _deps.showToast('Scrivi qualcosa prima di salvare!', 'error'); return; }
        _appendMaterialAndSave(idx, newText, false);
        close();
    });

    // Salva + genera flashcard AI
    modal.querySelector('#add-mat-ai').addEventListener('click', async () => {
        const newText = modal.querySelector('#add-mat-text').value.trim();
        if (!newText) { _deps.showToast('Scrivi qualcosa prima di salvare!', 'error'); return; }
        close();
        await _appendMaterialAndSave(idx, newText, true);
    });
}

async function _appendMaterialAndSave(idx, newText, generateCards) {
    const deck = _deps.state.decks[idx];

    // Append con separatore
    const separator = deck.text && deck.text.trim() ? '\n\n---\n\n' : '';
    deck.text = (deck.text || '') + separator + newText;

    if (generateCards) {
        _deps.showToast('✨ Analizzo il materiale con AI...', 'info');
        try {
            const { callGemini } = await import('../services/firebase.js');
            const prompt = `Sei un assistente didattico. Analizza questo testo e genera flashcard (coppie domanda-risposta) concise e utili per studiarlo.
Testo:
${newText}

Rispondi SOLO con un array JSON valido, niente altro. Esempio:
[{"q":"Cos'è X?","a":"X è..."},{"q":"...","a":"..."}]`;
            const raw = await callGemini(prompt, { temperature: 0.4, maxOutputTokens: 1500 });
            const match = raw.match(/\[[\s\S]*\]/);
            if (match) {
                const newCards = JSON.parse(match[0]);
                newCards.forEach(c => {
                    if (c.q && c.a) {
                        deck.cards = deck.cards || [];
                        deck.cards.push({ q: c.q, a: c.a, ease: 2.5, interval: 1, nextReview: todayStr(), reps: 0 });
                    }
                });
                _deps.showToast(`✅ Aggiunte ${newCards.length} flashcard dal nuovo materiale!`, 'success');
            } else {
                _deps.showToast('Materiale salvato (AI non ha generato carte).', 'info');
            }
        } catch (e) {
            console.error('[openAddMaterial] AI error:', e);
            _deps.showToast('Materiale salvato, errore AI.', 'error');
        }
    } else {
        _deps.showToast(`✅ Materiale aggiunto a "${deck.name}"!`, 'success');
    }

    _deps.state.decks[idx] = deck;
    _deps.saveState();
    if (window.syncToCloud) await window.syncToCloud(deck.id).catch(() => {});
    renderDecks();
}
