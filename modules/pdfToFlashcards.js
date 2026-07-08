import { t } from '../core/i18n.js';
/**
 * modules/pdfToFlashcards.js
 * 
 * Feature: Upload PDF/Foto/Testo → Generazione Flashcard AI
 * 
 * Flusso:
 *  1. Utente trascina/seleziona file (PDF, immagine, testo, DOCX)
 *  2. extractTextFromFile() estrae il testo raw
 *  3. generateFlashcardsFromText() chiama Gemini proxy
 *  4. Overlay di anteprima mostra le carte generate
 *  5. Utente conferma → mazzo salvato con saveDeck()
 */

import { extractTextFromFile } from '../services/fileHandler.js';
import { discoverGeminiModel } from '../services/ai.js';
import { SecurityManager, getFunctions, callGeminiProxy } from '../services/firebase.js';
import { awardXP, earnBadge } from './gamification.js';
import { TRANSLATIONS } from '../data/translations.js';
const _t = () => (TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it);

const _getLang = () => localStorage.getItem('mm_lang') || 'it';

// ─── Costanti ─────────────────────────────────────────────────────────────────

const MAX_TEXT_CHARS = 60_000; // Limite testo inviato a Gemini (~40K token)
const OVERLAY_ID     = 'pdf-ai-overlay';

// ─── Overlay UI ───────────────────────────────────────────────────────────────

/**
 * Crea e inserisce l'overlay nel DOM se non esiste.
 */
function ensureOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const html = `
    <div id="${OVERLAY_ID}" style="
        display:none; position:fixed; inset:0; z-index:9000;
        background:rgba(3,3,10,0.96); backdrop-filter:blur(24px);
        flex-direction:column; align-items:center; justify-content:center;
        padding:20px; animation:fadeIn 0.3s ease;
    ">
        <!-- Card contenitore -->
        <div style="
            width:100%; max-width:700px; max-height:90vh;
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.1);
            border-radius:28px; display:flex; flex-direction:column;
            overflow:hidden; box-shadow:0 32px 80px rgba(0,0,0,0.6);
        ">
            <!-- Header -->
            <div style="
                padding:24px 28px 20px; border-bottom:1px solid rgba(255,255,255,0.07);
                display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
            ">
                <div>
                    <div style="font-size:0.75rem; color:var(--accent); font-weight:700;
                        text-transform:uppercase; letter-spacing:2px; margin-bottom:4px;">
                        ✨ AI ha generato
                    </div>
                    <h2 id="pdfai-title" style="font-size:1.4rem; font-weight:800; margin:0; color:var(--text);">
                        Anteprima Flashcard
                    </h2>
                </div>
                <button onclick="closePdfAI()" aria-label="Chiudi anteprima AI"
                    style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
                        border-radius:50%; width:40px; height:40px; color:var(--text); font-size:1.3rem;
                        cursor:pointer; display:flex; align-items:center; justify-content:center;
                        transition:background 0.2s;">×</button>
            </div>

            <!-- Stato generazione -->
            <div id="pdfai-loading" style="
                display:none; flex-direction:column; align-items:center; justify-content:center;
                padding:60px 40px; gap:20px;
            ">
                <div class="pdfai-spinner" style="
                    width:52px; height:52px; border:3px solid rgba(139,92,246,0.2);
                    border-top-color:var(--accent); border-radius:50%;
                    animation:spin 0.8s linear infinite;
                "></div>
                <p id="pdfai-status" style="color:var(--text-muted); font-size:0.95rem; text-align:center;">
                    Estrazione testo in corso...
                </p>
            </div>

            <!-- Nome mazzo -->
            <div id="pdfai-form-area" style="display:none; padding:20px 28px 0; flex-shrink:0;">
                <div style="display:flex; gap:12px; align-items:center; margin-bottom:16px;">
                    <input type="text" id="pdfai-deck-name"
                        placeholder="Nome del mazzo..."
                        aria-label="Nome del mazzo generato dall'AI"
                        style="
                            flex:1; background:rgba(255,255,255,0.05);
                            border:1px solid rgba(255,255,255,0.12); border-radius:12px;
                            padding:12px 16px; color:var(--text); font-size:0.95rem; font-family:inherit;
                            outline:none; transition:border-color 0.2s;
                        ">
                    <span id="pdfai-count" style="
                        font-size:0.8rem; color:var(--accent); font-weight:700;
                        white-space:nowrap; background:rgba(139,92,246,0.12);
                        padding:6px 12px; border-radius:8px; border:1px solid rgba(139,92,246,0.25);
                    ">0 carte</span>
                </div>
            </div>

            <!-- Lista carte anteprima -->
            <div id="pdfai-cards-list" style="
                flex:1; overflow-y:auto; padding:0 28px 20px;
                display:flex; flex-direction:column; gap:10px;
                scrollbar-width:thin; scrollbar-color:rgba(139,92,246,0.3) transparent;
            "></div>

            <!-- Footer azioni -->
            <div id="pdfai-footer" style="
                display:none; padding:20px 28px; border-top:1px solid rgba(255,255,255,0.07);
                display:flex; gap:12px; flex-shrink:0;
            ">
                <button onclick="closePdfAI()" style="
                    flex:1; padding:14px; border-radius:12px;
                    background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
                    color:var(--text-muted); font-family:inherit; font-size:0.9rem; cursor:pointer;
                    transition:background 0.2s;
                ">Annulla</button>
                <button onclick="savePdfAIDeck()" id="pdfai-save-btn" style="
                    flex:2; padding:14px; border-radius:12px;
                    background:linear-gradient(135deg, var(--accent), var(--accent2));
                    border:none; color:#fff; font-family:inherit; font-weight:700;
                    font-size:0.95rem; cursor:pointer;
                    box-shadow:0 4px 20px var(--accent-glow);
                    transition:opacity 0.2s, transform 0.1s;
                ">💾 Salva Mazzo</button>
            </div>
        </div>

        <style>
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
            @keyframes slideUp {
                from { opacity:0; transform:translateY(12px); }
                to   { opacity:1; transform:translateY(0); }
            }
            #pdfai-cards-list::-webkit-scrollbar { width:4px; }
            #pdfai-cards-list::-webkit-scrollbar-thumb { background:rgba(139,92,246,0.3); border-radius:2px; }
            .pdfai-card-item { animation: slideUp 0.25s ease both; }
            .pdfai-card-item:hover { border-color:rgba(139,92,246,0.4) !important; }
            #pdfai-deck-name:focus { border-color:var(--accent) !important; }
        </style>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
}

// ─── Stato interno ─────────────────────────────────────────────────────────────

let _generatedCards = [];

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function showOverlay()  { ensureOverlay(); const el = document.getElementById(OVERLAY_ID); if (el) el.style.display = 'flex'; }
function hideOverlay()  { const el = document.getElementById(OVERLAY_ID); if (el) el.style.display = 'none'; }
function setStatus(msg) { const el = document.getElementById('pdfai-status'); if (el) el.textContent = msg; }

function showLoading(show) {
    const l = document.getElementById('pdfai-loading');
    const f = document.getElementById('pdfai-form-area');
    const list = document.getElementById('pdfai-cards-list');
    const footer = document.getElementById('pdfai-footer');
    if (l)      l.style.display      = show ? 'flex' : 'none';
    if (f)      f.style.display      = show ? 'none' : 'block';
    if (list)   list.style.display   = show ? 'none' : 'flex';
    if (footer) footer.style.display = show ? 'none' : 'flex';
}

function renderCards(cards, deckTitle) {
    _generatedCards = cards;
    const list  = document.getElementById('pdfai-cards-list');
    const count = document.getElementById('pdfai-count');
    const nameInput = document.getElementById('pdfai-deck-name');
    const title = document.getElementById('pdfai-title');

    if (title)    title.textContent    = (_t().preview||t('pdffc_preview')) + ' — ' + (deckTitle || (_t().new_deck||t('pdffc_new_deck')));
    if (nameInput && !nameInput.value) nameInput.value = deckTitle || t('pdffc_ai_deck');
    if (count)    count.textContent   = `${cards.length} carte`;
    if (!list)    return;

    list.innerHTML = '';
    cards.forEach((card, i) => {
        const div = document.createElement('div');
        div.className = 'pdfai-card-item';
        div.style.cssText = `
            background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08);
            border-radius:14px; padding:16px 18px;
            animation-delay:${i * 30}ms;
        `;
        div.innerHTML = `
            <div style="display:flex; gap:8px; align-items:flex-start; margin-bottom:8px;">
                <span style="font-size:0.65rem; font-weight:800; color:var(--accent);
                    text-transform:uppercase; letter-spacing:1px; padding:3px 8px;
                    background:rgba(139,92,246,0.12); border-radius:6px; white-space:nowrap;
                    margin-top:1px; flex-shrink:0;">Fronte</span>
                <span style="font-size:0.9rem; font-weight:600; color:var(--text); line-height:1.4;">${escapeHtml(card.front)}</span>
            </div>
            <div style="display:flex; gap:8px; align-items:flex-start;">
                <span style="font-size:0.65rem; font-weight:800; color:var(--accent2);
                    text-transform:uppercase; letter-spacing:1px; padding:3px 8px;
                    background:rgba(168,85,247,0.1); border-radius:6px; white-space:nowrap;
                    margin-top:1px; flex-shrink:0;">Retro</span>
                <span style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">${escapeHtml(card.back)}</span>
            </div>
        `;
        list.appendChild(div);
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Core: Generazione Flashcard ──────────────────────────────────────────────

/**
 * Genera flashcard da testo tramite Gemini proxy.
 * @param {string} text - Testo estratto dal documento
 * @param {string} fileName - Nome del file originale (per il titolo del mazzo)
 * @returns {Promise<{title: string, cards: Array<{front, back}>}>}
 */
async function generateFlashcardsFromText(text, fileName = '') {
    const premium = await (window.isPremiumSafe?.() ?? Promise.resolve(window.isPremium?.()));
    if (!premium) { if (window.showPaywall) window.showPaywall('studyplan'); return null; }
    const truncated = text.length > MAX_TEXT_CHARS
        ? text.substring(0, MAX_TEXT_CHARS) + '\n\n[Testo troncato per ragioni di lunghezza]'
        : text;

    const cardCount = Math.min(Math.max(Math.floor(text.length / 500), 8), 30);

    const prompt = `Sei un tutor universitario italiano esperto. Analizza il seguente testo e crea esattamente ${cardCount} flashcard di alta qualità per studiare i concetti chiave.

REGOLE FONDAMENTALI:
- Le domande devono testare la comprensione reale, non la memorizzazione meccanica
- Le risposte devono essere concise ma complete (max 3 righe)  
- Usa un linguaggio chiaro e accademico in italiano
- Ogni flashcard deve coprire UN SOLO concetto

TESTO DA ANALIZZARE:
${truncated}

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido in questo formato (nessun testo aggiuntivo, nessun blocco markdown):
{
  "title": "Titolo Breve del Mazzo (3-5 parole)",
  "cards": [
    {"front": "domanda chiara e specifica", "back": "risposta concisa e accurata"},
    ...
  ]
}`;

    // Usa il proxy se loggato, altrimenti chiave diretta
    const useProxy = !!window._fbLoggedIn;
    
    if (useProxy) {
        const result = await callGeminiProxy({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, response_mime_type: 'application/json' }
        });
        const raw = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) throw new Error("L'AI non ha restituito dati.");
        return JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    }

    // Fallback: chiamata diretta con chiave locale
    const apiKey = SecurityManager.getApiKey();
    if (!apiKey) throw new Error('Configura la Gemini API Key nelle Impostazioni per usare questa funzionalità.');

    const model = await discoverGeminiModel(apiKey);
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, response_mime_type: 'application/json' }
            })
        }
    );
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `Errore API (${res.status})`); }
    const data = await res.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("L'AI non ha restituito dati.");
    return JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
}

// ─── Entrypoint Pubblico ───────────────────────────────────────────────────────

/**
 * Avvia il flusso completo: mostra overlay → estrae testo → genera flashcard.
 * @param {File} file
 */
export async function openPdfAIFromFile(file) {
    if (!file) return;

    ensureOverlay();
    showOverlay();
    showLoading(true);
    setStatus(`📄 Lettura "${file.name}"...`);

    try {
        // 1. Estrai testo
        const text = await extractTextFromFile(file);

        if (!text || text.trim().length < 20) {
            throw new Error('Il file sembra vuoto o non contiene testo leggibile.');
        }

        setStatus(`🧠 Generazione flashcard con AI... (${text.length.toLocaleString()} caratteri)`);

        // 2. Genera flashcard con Gemini
        const result = await generateFlashcardsFromText(text, file.name.replace(/\.[^/.]+$/, ''));

        if (!result?.cards?.length) throw new Error('Nessuna flashcard generata. Riprova con un file diverso.');

        // 3. Mostra anteprima
        showLoading(false);
        renderCards(result.cards, result.title);

    } catch (err) {
        console.error('[PdfAI] Error:', err);
        showLoading(false);
        // Messaggi AI centralizzati (paywall, offline, down, auth)
        if (window.handleAIError) window.handleAIError(err, 'generazione dal PDF');
        else if (window.showToast) window.showToast(t('pdf_gen_failed'), 'error');
        document.getElementById('pdfai-cards-list').innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <div style="font-size:3rem; margin-bottom:16px;">⚠️</div>
                <p style="color:var(--red); font-weight:600; margin-bottom:8px;">Generazione non riuscita</p>
                <p style="color:var(--text-muted); font-size:0.85rem;">
                    ${err?.isPaywall ? 'Limite AI raggiunto — passa a Student per continuare.' :
                      !navigator.onLine ? 'Sei offline. Riconnettiti e riprova.' :
                      err?.isDown ? 'Gemini è momentaneamente down. Riprova tra qualche minuto.' :
                      'Riprova tra qualche secondo.'}
                </p>
            </div>`;
        document.getElementById('pdfai-form-area').style.display = 'block';
        document.getElementById('pdfai-footer').style.display = 'flex';
        document.getElementById('pdfai-save-btn').style.display = 'none';
        if (window.showToast) window.showToast('Errore: ' + err.message, 'error');
    }
}

/**
 * Entrypoint da testo già estratto (es. dal textarea esistente).
 * @param {string} text - Testo da convertire
 * @param {string} suggestedName - Nome suggerito per il mazzo
 */
export async function openPdfAIFromText(text, suggestedName = '') {
    if (!text?.trim()) {
        if (window.showToast) window.showToast(t('pdf_no_text'), 'info');
        return;
    }

    ensureOverlay();
    showOverlay();
    showLoading(true);
    setStatus(`🧠 Generazione flashcard con AI... (${text.length.toLocaleString()} caratteri)`);

    try {
        const result = await generateFlashcardsFromText(text, suggestedName);
        if (!result?.cards?.length) throw new Error('Nessuna flashcard generata.');
        showLoading(false);
        renderCards(result.cards, result.title || suggestedName);
    } catch (err) {
        console.error('[PdfAI] Error:', err);
        showLoading(false);
        document.getElementById('pdfai-cards-list').innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <div style="font-size:3rem; margin-bottom:16px;">⚠️</div>
                <p style="color:var(--red); font-weight:600;">${escapeHtml(err.message)}</p>
            </div>`;
        document.getElementById('pdfai-form-area').style.display = 'block';
        document.getElementById('pdfai-footer').style.display = 'flex';
        if (window.showToast) window.showToast('Errore: ' + err.message, 'error');
    }
}

// ─── Salvataggio mazzo ─────────────────────────────────────────────────────────

/**
 * Salva le carte generate come nuovo mazzo e chiude l'overlay.
 * Esportata globalmente per uso via onclick.
 */
export function savePdfAIDeck() {
    if (!_generatedCards.length) return;

    const nameInput = document.getElementById('pdfai-deck-name');
    const deckName  = nameInput?.value?.trim() || t('pdffc_ai_deck');

    // Accedi allo state tramite accessor globale
    const state = window._legacyState ? window._legacyState() : (window.state || null);
    if (!state?.decks) {
        if (window.showToast) window.showToast(t('err_system_not_ready'), 'error');
        return;
    }

    const now = new Date().toISOString();
    // FIX: usa q/a (compatibile con study.js) + data locale YYYY-MM-DD + interval:1
    const _today = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const newDeck = {
        id: 'deck_' + Date.now(),
        name: deckName,
        subject: '',
        studyMethod: 'cortex',
        cards: _generatedCards.map(c => ({
            id:         'card_' + Math.random().toString(36).substr(2, 9),
            q:          c.front || c.q || '',
            a:          c.back  || c.a  || '',
            nextReview: _today,
            interval:   1,
            ease:       2.5,
            reps:       0
        })),
        createdAt: now,
        createdByAI: true
    };

    state.decks.push(newDeck);

    // Salva e sincronizza
    if (typeof window.saveState === 'function') window.saveState();

    // XP + Badge
    awardXP(30, '🤖 PDF → AI Mazzo');
    earnBadge('ai_deck_created');

    // Aggiorna UI
    if (typeof window.renderDecks === 'function') window.renderDecks();

    hideOverlay();
    _generatedCards = [];

    if (window.showToast) window.showToast(`🎉 Mazzo "${deckName}" creato con ${newDeck.cards.length} carte!`, 'success');

    // Naviga alla pagina Materiale per vedere il mazzo
    setTimeout(() => {
        if (typeof window.__cortexNav === 'function') window.__cortexNav('materiale');
    }, 500);
}

/**
 * Chiude l'overlay senza salvare.
 */
export function closePdfAI() {
    hideOverlay();
    _generatedCards = [];
}

// ─── Registrazione funzioni globali ───────────────────────────────────────────

export function registerPdfAIGlobals(registry) {
    const fns = { openPdfAIFromFile, openPdfAIFromText, savePdfAIDeck, closePdfAI };
    for (const [name, fn] of Object.entries(fns)) {
        window[name] = fn;
        if (registry) registry(name, fn);
    }
}
