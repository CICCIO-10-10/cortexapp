import { t } from '../core/i18n.js';
/**
 * modules/deckCreate.js — Phase 20
 *
 * UI della pagina "Crea Materia": template selector, toggle flashcard,
 * generazione AI di riassunti e flashcard, generazione fallback locale.
 * Estratto da main.js (applyTemplate, toggleFlashcards,
 * autoGenerateFlashcards, generateAIContent, generateSimpleFlashcards,
 * PrivacyFirewall).
 *
 * Dipendenze iniettate via init():
 *   state                — app state (geminiKey, decks)
 *   saveState            — persiste state su localStorage
 *   showToast            — notifiche UI
 *   discoverGeminiModel  — rileva il modello Gemini disponibile
 *   getCurrentDeckIndex  — getter per currentDeckIndex
 *   addPair              — aggiunge coppia Q/A al form (da deckForm.js)
 *
 * Import diretti:
 *   awardXP              ← modules/gamification.js
 *   fetchWithTimeout     ← js/utils.js
 */
import { awardXP }           from './gamification.js';
import { fetchWithTimeout, handleAIError }  from '../js/utils.js';
import { callGemini }        from '../services/firebase.js';
import { TRANSLATIONS } from '../data/translations.js';
const _t = () => (TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it);

const _getLang = () => localStorage.getItem('mm_lang') || 'it';

// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = {
    state:               { geminiKey: '', decks: [] },
    saveState:           () => {},
    showToast:           () => {},
    discoverGeminiModel: async () => 'gemini-2.5-flash',
    getCurrentDeckIndex: () => null,
    addPair:             () => {},
};

export function init(deps) {
    _deps = { ..._deps, ...deps };
}

// ── Motore di sanitizzazione locale (Privacy) ─────────────────────────────────

const PrivacyFirewall = {
    patterns: {
        email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        phone: /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,6}\b/g,
        cf:    /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/gi,
    },

    redact(text) {
        if (!text) return text;
        let sanitized = text;
        sanitized = sanitized.replace(this.patterns.email, "[EMAIL PRIVATA]");
        sanitized = sanitized.replace(this.patterns.phone, "[TELEFONO PRIVATO]");
        sanitized = sanitized.replace(this.patterns.cf,    "[ID PRIVATO]");
        return sanitized;
    },

    async confirmCloudProcessing() {
        const consent = localStorage.getItem('cortex_ai_consent');
        if (consent === 'true') return true;

        const userChoice = confirm(
            "🛡️ PRIVACY CHECK\n\n" +
            "Stai per inviare questi dati al Cloud di Google Gemini per l'elaborazione.\n" +
            "I dati verranno sanitizzati localmente, ma ti consigliamo di non inviare password o segreti.\n\n" +
            "Vuoi procedere?"
        );
        return userChoice;
    }
};

// ── Template selector ─────────────────────────────────────────────────────────

export function applyTemplate() {
    const template = document.getElementById('deck-template').value;
    const name    = document.getElementById('deck-name');
    const subject = document.getElementById('deck-subject');
    const topics  = document.getElementById('exam-topics');
    const text    = document.getElementById('deck-text');

    if (template === 'speech') {
        name.placeholder    = "es. Discorso per la Laurea";
        topics.placeholder  = "es. Ringraziamenti, Core Business, Visione Futura";
        text.placeholder    = "Inserisci qui il testo del tuo discorso. Ti aiuteremo a mapparlo in un Memory Palace.";
        _deps.showToast('🎙️ Template Speech Master attivo: focus su Loci e Feynman.', 'info');
    } else if (template === 'polyglot') {
        name.placeholder    = "es. Vocabolario Inglese B2";
        topics.placeholder  = "es. Verbi frasali, Business English, Viaggi";
        text.placeholder    = "Incolla qui liste di parole o testi in lingua. Genereremo flashcard traduzione/significato.";
        _deps.showToast('🌎 Template Polyglot Lab attivo: ideale per nuove lingue.', 'info');
    } else if (template === 'chef') {
        name.placeholder    = "es. Ricettario Gourmet";
        topics.placeholder  = "es. Tecniche di cottura, Ingredienti segreti, Tempi";
        text.placeholder    = "Incolla qui le tue ricette. Le trasformeremo in blocchi logici da memorizzare.";
        _deps.showToast('👨‍🍳 Template Chef Pro attivo: memorizza procedimenti complessi.', 'info');
    } else {
        name.placeholder    = "es. Diritto Privato";
        topics.placeholder  = "es. Contratti, Successioni, Proprietà";
        text.placeholder    = "...oppure incolla qui appunti, libri, slide.";
    }
}

// ── Flashcard toggle ──────────────────────────────────────────────────────────

export function toggleFlashcards(forceOpen = false) {
    const section = document.getElementById('flashcard-section');
    const btn     = document.getElementById('fc-toggle-btn');
    const isHidden = section.style.display === 'none';
    if (forceOpen) section.style.display = '';
    else section.style.display = isHidden ? '' : 'none';
    btn.textContent = section.style.display === 'none'
        ? t('deck_hide_flashcard')
        : t('deck_add_flashcard');
    if (section.style.display === '' && document.getElementById('pairs-container').children.length === 0) {
        _deps.addPair(); _deps.addPair();
    }
}

// ── AI Generation ─────────────────────────────────────────────────────────────

export async function autoGenerateFlashcards() {
    const rawText      = document.getElementById('deck-text').value;
    const instructions = document.getElementById('ai-custom-instructions').value.trim();
    const btn          = document.getElementById('btn-generate-ai');

    if (!rawText || rawText.trim().length < 50) {
        _deps.showToast(t('deck_text_too_short'), "error");
        return;
    }

    // STEP 1: Privacy Check
    const proceed = await PrivacyFirewall.confirmCloudProcessing();
    if (!proceed) {
        _deps.showToast("Operazione annullata per la privacy.", "info");
        return;
    }

    // STEP 2: Sanitizzazione Locale
    const text = PrivacyFirewall.redact(rawText);

    const originalBtnText = btn.innerHTML;
    btn.innerHTML = (_t().ai_processing||"✨ L'IA sta elaborando...");
    btn.disabled  = true;
    _deps.showToast(t('deck_ai_generating'), "info");

    try {
        const result = await generateAIContent(text, instructions);
        if (result) {
            // 1. Handle Summary
            const summaryContainer = document.getElementById('ai-summary-container');
            const summaryText      = document.getElementById('ai-summary-text');
            if (result.summary && summaryContainer && summaryText) {
                const htmlSummary = result.summary.replace(/\n/g, '<br>');
                summaryText.innerHTML           = htmlSummary;
                summaryContainer.style.display  = 'block';
                summaryContainer.scrollIntoView({ behavior: 'smooth' });

                // If editing, also update the state directly to ensure it's saved
                const currentDeckIndex = _deps.getCurrentDeckIndex();
                if (currentDeckIndex !== null) {
                    _deps.state.decks[currentDeckIndex].aiSummary = htmlSummary;
                    _deps.saveState();
                }
            }

            // 2. Handle Flashcards
            if (result.flashcards && result.flashcards.length > 0) {
                const container = document.getElementById('pairs-container');
                container.innerHTML = '';
                result.flashcards.forEach(fc => _deps.addPair(fc.q, fc.a));
                toggleFlashcards(true);
                _deps.showToast(`✅ Generate ${result.flashcards.length} flashcard e un riassunto!`, "success");
            } else {
                _deps.showToast("L'IA non è riuscita a generare flashcard valide, ma ha creato il riassunto.", "warning");
            }

            awardXP(30, "✨ Potenziamento IA");
        }
    } catch (e) {
        handleAIError(e, 'generazione flashcard', _deps.showToast);
    } finally {
        btn.innerHTML = originalBtnText;
        btn.disabled  = false;
    }
}

// ── Helpers privati ───────────────────────────────────────────────────────────

async function generateAIContent(text, customInstructions) {
    const prompt = `Analizza il seguente materiale di studio e genera:
1. Un riassunto strutturato e denso di nozioni (in italiano).
2. Un set di flashcard (Domanda/Risposta) che coprano i punti chiave.

${customInstructions ? `IMPORTANTE - Segui queste istruzioni aggiuntive dell'utente: "${customInstructions}"` : ""}

TESTO DA ANALIZZARE:
${text.substring(0, 15000)}

Rispondi ESCLUSIVAMENTE in formato JSON con questa struttura:
{
  "summary": "Il testo del riassunto qui...",
  "flashcards": [
    {"q": "Domanda 1", "a": "Risposta 1"},
    {"q": "Domanda 2", "a": "Risposta 2"}
  ]
}
Assicurati che il JSON sia valido.`;

    const rawJson = await callGemini(prompt, {
        temperature: 0.7,
        responseMimeType: 'application/json'
    });

    try {
        return JSON.parse(rawJson);
    } catch (e) {
        console.error("Failed to parse AI JSON", e);
        return null;
    }
}

function generateSimpleFlashcards(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let candidates  = sentences.filter(s => s.length > 30 && s.length < 200);
    let flashcards  = [];
    candidates.forEach(sentence => {
        let s = sentence.trim();
        if (s.includes(' è ') || s.includes(' sono ') || s.includes(' definito come ')) {
            let parts = s.split(/ è | sono | definito come /);
            if (parts.length >= 2 && parts[0].split(' ').length <= 4) {
                flashcards.push({ q: `Cos'è ${parts[0]}?`, a: parts[1].replace(/.$/, '') });
            }
        }
    });
    return flashcards;
}
