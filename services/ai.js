// services/ai.js
// Fase 2 — Estrazione e unificazione da main.js
// Centralizza TUTTO il codice AI/Gemini: model discovery (1 sola copia),
// valutazione semantica, trascrizione audio (Gemini + Whisper locale),
// OCR immagini, YouTube, Web scraping.

import { SecurityManager, getFunctions, callGeminiProxy } from './firebase.js';
import { t } from '../core/i18n.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

let _lastCall = 0;
const RATE_LIMIT_MS = 2000; // Ridotto per fluidità, il rate limit vero è sul server

// ─── Model Discovery ──────────────────────────────────────────────────────────
export async function discoverGeminiModel(apiKey, fallback = 'gemini-2.5-flash') {
    if (!apiKey || apiKey === 'PROXY') return fallback; // Se usiamo il proxy, saltiamo la discovery esterna
    try {
        const res  = await fetch(`${GEMINI_BASE}/models?key=${apiKey}`);
        if (!res.ok) return fallback;
        const data = await res.json();
        const avail = data.models.map(m => m.name);
        // Preferenza: modelli più recenti prima
        if (avail.includes('models/gemini-2.5-flash'))           return 'gemini-2.5-flash';
        if (avail.includes('models/gemini-2.0-flash-lite-001'))  return 'gemini-2.0-flash-lite-001';
        if (avail.includes('models/gemini-1.5-flash-001'))       return 'gemini-1.5-flash-001';
        if (avail.includes('models/gemini-1.5-flash-latest'))    return 'gemini-1.5-flash-latest';
        if (avail.includes('models/gemini-1.5-pro'))             return 'gemini-1.5-pro';
        const any = data.models.find(m => m.supportedGenerationMethods?.includes('generateContent'));
        if (any) return any.name.replace('models/', '');
    } catch (e) { console.warn('[AI] Model discovery failed, using fallback', e); }
    return fallback;
}

async function geminiPost(model, apiKey, body) {
    const now = Date.now();
    const wait = RATE_LIMIT_MS - (now - _lastCall);
    if (wait > 0) {
        await new Promise(res => setTimeout(res, wait));
    }
    _lastCall = Date.now();

    // PRIORITÀ: Cloud Function Proxy (se loggato)
    if (window._fbLoggedIn) {
        try {
            const functions = getFunctions();
            if (functions) {
                console.log(`[AI] Using Serverless Proxy for model: ${model}`);
                const result = await callProxy({
                    model: model || 'gemini-2.5-flash',
                    contents: body.contents,
                    generationConfig: body.generationConfig || {}
                });
                _incrementAiUsage();
                return result.data;
            }
        } catch (err) {
            console.error('[AI] Proxy failed:', err);
            
            // Gestione errori specifici della Cloud Function
            if (err.code === 'resource-exhausted') {
                if (err.message === 'PAYWALL_LIMIT_REACHED') {
                    if (typeof window.showPaywall === 'function') window.showPaywall();
                    throw new Error('PAYWALL_LIMIT_REACHED');
                }
                if (window.showToast) window.showToast("Limite giornaliero IA raggiunto. Riprova domani oppure passa a Student per 100 chiamate/giorno. ⏳", "error");
                throw err;
            }
            if (err.code === 'unauthenticated') {
                if (window.showToast) window.showToast("Effettua l'accesso per usare il Proxy IA. 🛡️", "error");
                throw err;
            }
            if (err.code === 'internal') {
                // Non mostriamo un toast qui — se c'è una chiave diretta il fallback riesce silenziosamente;
                // se non c'è, l'errore verrà mostrato più sotto con un messaggio più preciso.
                console.warn('[AI] Proxy internal error, trying direct fallback if API key is available');
            }
        }
    }

    // FALLBACK: Chiamata diretta con API Key locale
    if (!apiKey || apiKey === 'PROXY') {
        throw new Error('Manca la chiave API Gemini (necessaria se non loggato o se il proxy fallisce).');
    }
    
    try {
        const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!res.ok) { 
            const e = await res.json();
            const msg = e.error?.message || 'Errore API Gemini';
            
            if (res.status === 429) {
                if (window.showToast) window.showToast("Limite Google raggiunto (429). Attendi un minuto. ☕", "error");
            } else if (res.status === 401 || res.status === 403) {
                if (window.showToast) window.showToast("Chiave API non valida o non autorizzata. 🔑", "error");
            } else {
                if (window.showToast) window.showToast(`Errore IA (${res.status}): ${msg}`, "error");
            }
            
            throw new Error(msg); 
        }
        const data = await res.json();
        _incrementAiUsage();
        return data;
    } catch (err) {
        if (!navigator.onLine) {
            if (window.showToast) window.showToast("Connessione assente. L'IA richiede internet. 🌐", "error");
        }
        throw err;
    }
}
 
function _incrementAiUsage() {
    const key     = 'cortex_today_ai_calls';
    const dateKey = 'cortex_ai_calls_date';
    const today   = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Reset se è un nuovo giorno
    const savedDate = localStorage.getItem(dateKey);
    if (savedDate !== today) {
        localStorage.setItem(dateKey, today);
        localStorage.setItem(key, '0');
    }

    let count = parseInt(localStorage.getItem(key) || '0');
    count++;
    localStorage.setItem(key, String(count));
    // Sincronizza lo stato legacy se presente
    const state = window._legacyState ? window._legacyState() : (window.state || {});
    if (state) state.todayAiCalls = count;
}

function getApiKey() {
    // Se loggato, ritorniamo una stringa dummy perché usiamo il proxy
    if (window._fbLoggedIn) return 'PROXY'; 
    return SecurityManager.getApiKey();
}

// ─── Valutazione Semantica (Orale / Quiz) ────────────────────────────────────
export async function evaluateWithGemini(userText, correctText, settings = {}) {
    const apiKey = getApiKey();
    if (!apiKey && !window._fbLoggedIn) return null;
    const severityLevel   = settings.aiSeverity      || 50;
    const style           = settings.aiFeedbackStyle  || 'standard';
    const temperature     = settings.aiTemperature    || 0.7;
    const threshold       = severityLevel >= 80 ? 90 : severityLevel >= 60 ? 70 : 50;

    const severityContext =
        severityLevel <= 20 ? 'Estremamente permissivo' :
        severityLevel <= 40 ? 'Lievemente permissivo'   :
        severityLevel >= 80 ? 'Severissimo e inflessibile, ammetti solo risposte complete e precise' :
        severityLevel >= 60 ? 'Rigoroso, non accettare approssimazioni'  : 'Bilanciato';

    const styleNote = style && style !== 'standard'
        ? `\nTono del feedback: ${style}`
        : '';

    const prompt = `Valuta la similitudine SEMANTICA tra queste due risposte in italiano.
Risposta dello studente: "${userText}"
Risposta corretta attesa: "${correctText}"
Severità: ${severityLevel}% → ${severityContext}${styleNote}
Rispondi SOLO con JSON: {"score":(0-100),"feedback":"(max 25 parole; se manca qualcosa alla risposta, di' esattamente COSA manca; se completa, conferma; tono coerente con severità e stile)","match":(true/false se score >= ${threshold})}`;

    try {
        // FIX Prof AI "56% senza motivo": la valutazione usava SOLO la API key
        // personale (che l'utente normale non ha) e cadeva sempre sul conteggio
        // parole. Ora: proxy se loggato, chiave personale come fallback.
        let raw;
        if (window._fbLoggedIn) {
            const result = await callGeminiProxy({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature, response_mime_type: 'application/json' }
            });
            raw = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        } else {
            const model = await discoverGeminiModel(apiKey);
            const data  = await geminiPost(model, apiKey, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature, response_mime_type: 'application/json' }
            });
            raw = data.candidates[0].content.parts[0].text;
        }
        const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        console.warn('[AI] evaluateWithGemini failed', e);
        return null;
    }
}

// ─── Trascrizione Audio con Gemini ────────────────────────────────────────────
export async function transcribeChunkWithGemini(fileChunk, apiKey, originalName, chunkIdx = 1, totalChunks = 1) {
    const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(fileChunk);
    });

    const prompt = totalChunks > 1
        ? `Trascrivi questa parte (${chunkIdx}/${totalChunks}) di una lezione in italiano.`
        : `Trascrivi integralmente questo audio in italiano, mantieni la punteggiatura.`;

    const model = await discoverGeminiModel(apiKey);
    const data  = await geminiPost(model, apiKey, {
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/mp3', data: base64 } }] }],
        generationConfig: { temperature: 0.1, topP: 0.95 }
    });
    const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!transcript) throw new Error('Nessun testo ricevuto dall\'IA.');

    const header = totalChunks > 1
        ? `\n\n[PARTE ${chunkIdx}/${totalChunks}] - ${originalName}\n`
        : `\n\n--- Trascrizione Gemini: ${originalName} ---\n`;

    const ta = document.getElementById('deck-text');
    if (ta) { ta.value += (ta.value ? '\n' : '') + header + transcript; if (typeof window.updateCharCount === 'function') window.updateCharCount(); }
    return transcript;
}

// ─── Audio File Handler (Gemini + Whisper locale) ────────────────────────────
let _sttWorker = null;

export async function handleAudioFile(file, idx = 1, total = 1) {
    if (!file) return;
    const statusBox  = document.getElementById('pdf-status');
    const statusText = document.getElementById('pdf-status-text');
    const spinner    = document.getElementById('pdf-spinner');
    if (statusBox)  statusBox.classList.add('visible');
    if (spinner)    spinner.style.display = 'block';
    if (statusText) statusText.textContent = `[${idx}/${total}] Inizializzazione AI: ${file.name}...`;

    const apiKey           = getApiKey();
    const transcriptionMode = localStorage.getItem('mm_transcription_mode') || 'local';

    try {
        if (transcriptionMode === 'gemini') {
            if (!apiKey) throw new Error('Manca la Gemini API Key. Aggiungila nelle impostazioni!');
            const MAX_CHUNK = 15 * 1024 * 1024;
            if (file.size > MAX_CHUNK) {
                const n = Math.ceil(file.size / MAX_CHUNK);
                for (let i = 0; i < n; i++) {
                    if (statusText) statusText.textContent = `Gemini: Trascrizione parte ${i+1} di ${n}...`;
                    await transcribeChunkWithGemini(file.slice(i * MAX_CHUNK, Math.min((i+1)*MAX_CHUNK, file.size)), apiKey, file.name, i+1, n);
                }
            } else {
                if (statusText) statusText.textContent = 'Inviando audio a Gemini...';
                await transcribeChunkWithGemini(file, apiKey, file.name, 1, 1);
            }
            if (spinner)    spinner.style.display = 'none';
            if (statusText) statusText.textContent = 'Trascrizione completata con Gemini!';
            setTimeout(() => { if (statusBox) statusBox.classList.remove('visible'); }, 3000);
            if (window.showToast) window.showToast('Sbobina generata con Gemini! ✨', 'success');
            window.addUploadedFileBadge?.(file.name, 'success');
            return;
        }

        // Modalità locale — Whisper
        if (file.size > 50 * 1024 * 1024) {
            if (spinner)    spinner.style.display = 'none';
            if (statusText) statusText.textContent = 'File troppo grande per l\'AI locale.';
            if (window.showToast) window.showToast('File >50MB. Attiva Gemini Cloud nelle Impostazioni.', 'error');
            setTimeout(() => { if (statusBox) statusBox.classList.remove('visible'); }, 5000);
            return;
        }

        if (statusText) statusText.textContent = 'Decodifica audio in locale...';
        const arrayBuffer  = await file.arrayBuffer();
        const audioCtx     = new (window.AudioContext || window.webkitAudioContext)();
        const decodedData  = await new Promise((res, rej) => audioCtx.decodeAudioData(arrayBuffer, res, rej));
        const TARGET_RATE  = 16000;
        const offCtx       = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.ceil(decodedData.duration * TARGET_RATE), TARGET_RATE);
        const src          = offCtx.createBufferSource();
        src.buffer = decodedData; src.connect(offCtx.destination); src.start(0);
        const rendered = await offCtx.startRendering();
        const audioData = rendered.getChannelData(0);

        if (statusText) statusText.textContent = 'Avvio AI locale (Whisper)...';
        _initWhisperWorker(statusBox, statusText, spinner);
        _sttWorker.postMessage({ audio: audioData, filename: file.name });

    } catch (err) {
        console.error('[AI] handleAudioFile error', err);
        if (spinner)    spinner.style.display = 'none';
        if (statusText) statusText.textContent = 'Errore: ' + (err.message || 'impossibile elaborare audio');
        if (window.showToast) window.showToast('Errore: ' + err.message, 'error');
        setTimeout(() => { if (statusBox) statusBox.classList.remove('visible'); }, 5000);
    }
}

function _initWhisperWorker(statusBox, statusText, spinner) {
    if (_sttWorker) return;
    const code = `
let pipeline, env;
class PipelineFactory {
    static task = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-tiny';
    static instance = null;
    static async getInstance(cb) {
        if (!this.instance) this.instance = await pipeline(this.task, this.model, { progress_callback: cb, quantized: true });
        return this.instance;
    }
}
self.addEventListener('message', async (e) => {
    try {
        if (!pipeline) {
            const t = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
            pipeline = t.pipeline; env = t.env; env.allowLocalModels = false;
        }
        const tr = await PipelineFactory.getInstance(x => self.postMessage(x));
        if (e.data.audio) {
            const r = await tr(e.data.audio, { language:'it', task:'transcribe', chunk_length_s:30, stride_length_s:5, return_timestamps:false, temperature:0, condition_on_previous_text:false });
            self.postMessage({ status:'complete', result:r, filename:e.data.filename });
        }
    } catch(err) { self.postMessage({ status:'error', data:err.message, filename: e.data?.filename }); }
});`;
    const blob = new Blob([code], { type: 'application/javascript' });
    _sttWorker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    _sttWorker.onmessage = (event) => {
        const msg = event.data;
        if (msg.status === 'complete') {
            const ta = document.getElementById('deck-text');
            if (ta) { ta.value += (ta.value ? '\n' : '') + `\n\n--- Sbobina Locale: ${msg.filename||'Audio'} ---\n${msg.result.text}`; if (typeof window.updateCharCount === 'function') window.updateCharCount(); }
            if (spinner)    spinner.style.display = 'none';
            if (statusText) statusText.textContent = t('ai_audio_transcribed');
            setTimeout(() => { if (statusBox) statusBox.classList.remove('visible'); }, 3000);
            if (window.showToast) window.showToast('Sbobina completata!', 'success');
            window.addUploadedFileBadge?.(msg.filename || 'Audio', 'success');
            _sttWorker.terminate(); _sttWorker = null;
        } else if (msg.status === 'error') {
            if (spinner)    spinner.style.display = 'none';
            if (statusText) statusText.textContent = 'Errore AI: ' + (msg.data || 'Sconosciuto');
            if (window.showToast) window.showToast("Errore durante l'elaborazione dell'audio.", 'error');
            setTimeout(() => { if (statusBox) statusBox.classList.remove('visible'); }, 4000);
            _sttWorker.terminate(); _sttWorker = null;
        }
    };
}

// ─── OCR Immagini ─────────────────────────────────────────────────────────────
export async function handleImageFile(file, idx = 1, total = 1) {
    if (!file) return;
    if (!navigator.onLine) { if (window.showToast) window.showToast("Connessione assente. L'OCR richiede internet.", 'error'); return; }
    const statusBox  = document.getElementById('pdf-status');
    const statusText = document.getElementById('pdf-status-text');
    if (statusBox)  statusBox.classList.add('visible');
    if (statusText) statusText.textContent = t('ai_ocr_loading');
    try {
        if (!window.Tesseract) await new Promise((res, rej) => { const s = document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
        if (statusText) statusText.textContent = `[${idx}/${total}] Analisi immagine...`;
        const result = await Tesseract.recognize(file, 'ita');
        const ta = document.getElementById('deck-text');
        if (ta) { ta.value += (ta.value ? '\n\n' : '') + `--- OCR: ${file.name} ---\n` + result.data.text; if (typeof window.updateCharCount === 'function') window.updateCharCount(); }
        if (window.showToast) window.showToast(t('ai_text_extracted'), 'success');
        window.addUploadedFileBadge?.(file.name, 'success');
    } catch (err) {
        if (window.showToast) window.showToast('Errore OCR: ' + err.message, 'error');
    } finally {
        if (statusBox) statusBox.classList.remove('visible');
    }
}

/**
 * Sprint 6: Quick Snap & AI Vision Pipeline
 * Converte l'immagine, invia a Gemini Vision e crea un mazzo istantaneamente.
 */
export async function quickSnapAndAnalyze(file) {
    if (!file) return;
    if (!navigator.onLine) { if (window.showToast) window.showToast(t('ai_no_connection'), 'error'); return; }

    const overlay = document.getElementById('quick-analysis-overlay');
    if (overlay) overlay.style.display = 'flex';

    try {
        const apiKey = getApiKey(); // Usa proxy se loggato
        if (!apiKey) throw new Error("Configura la Gemini API Key nelle impostazioni.");

        const base64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
        });

        const prompt = `Analizza questa immagine di appunti o libro. Estrai i concetti chiave e crea flashcard. 
        Restituisci ESCLUSIVAMENTE un oggetto JSON valido con questo formato:
        {
          "title": "Titolo Breve del Mazzo",
          "cards": [{"front": "domanda", "back": "risposta"}]
        }
        Nessun altro testo, nessun blocco markdown. Solo il JSON.`;

        const model = await discoverGeminiModel(apiKey);
        const data = await geminiPost(model, apiKey, {
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: file.type, data: base64 } }
                ]
            }],
            generationConfig: { temperature: 0.2, response_mime_type: 'application/json' }
        });

        let rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawResponse) throw new Error("L'IA non ha restituito dati.");

        // Safe JSON parsing (Markdown removal)
        rawResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const deckData = JSON.parse(rawResponse);

        if (!deckData.cards || deckData.cards.length === 0) throw new Error("Nessuna carta generata.");

        // Recupero stato e funzione salvataggio (tramite window helper o accessor)
        const state = window._legacyState ? window._legacyState() : (window.state || {});
        if (!state.decks) throw new Error("Sistema di archiviazione non pronto.");

        // Salvataggio mazzo
        // FIX: usa q/a (compatibile con study.js) + data locale YYYY-MM-DD (compatibile con srs.js)
        const _today = (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        })();
        const newDeck = {
            id: 'deck_' + Date.now(),
            title: deckData.title || 'Nuovo Mazzo Snap',
            cards: deckData.cards.map(c => ({
                id: 'card_' + Math.random().toString(36).substr(2, 9),
                q: c.front || c.q || '',
                a: c.back  || c.a  || '',
                nextReview: _today,
                interval: 1,
                ease: 2.5,
                reps: 0
            })),
            createdAt: new Date().toISOString()
        };

        state.decks.push(newDeck);
        // window.saveState non esiste: usa la saveState vera (stesso bug del mazzo sparito)
        const { saveState: _realSaveState } = await import('../modules/deckUtils.js');
        _realSaveState();

        if (window.showToast) window.showToast(`Mazzo "${newDeck.title}" creato! 📸`, 'success');

        // Navigazione alla vista materiale (dove apparirà il nuovo mazzo)
        if (typeof window.__cortexNav === 'function') {
            window.__cortexNav('materiale');
        }

    } catch (err) {
        console.error('[Snap] Error:', err);
        if (window.showToast) window.showToast('Errore analisi: ' + err.message, 'error');
    } finally {
        if (overlay) overlay.style.display = 'none';
        const input = document.getElementById('quick-snap-input');
        if (input) input.value = '';
    }
}

// ─── YouTube & Web Scraping ───────────────────────────────────────────────────
export async function promptYouTubeLink() {
    const url = prompt('Incolla il link del video YouTube:');
    if (!url) return;
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) { if (window.showToast) window.showToast(t('err_invalid_youtube'), 'error'); return; }
    const apiKey = getApiKey();
    const mode   = localStorage.getItem('mm_transcription_mode') || 'local';
    if (mode !== 'gemini' || !apiKey) { if (window.showToast) window.showToast(t('ai_key_missing'), 'error'); return; }

    const statusBox  = document.getElementById('pdf-status');
    const statusText = document.getElementById('pdf-status-text');
    const spinner    = document.getElementById('pdf-spinner');
    if (statusBox)  statusBox.classList.add('visible');
    if (spinner)    spinner.style.display = 'block';
    if (statusText) statusText.textContent = 'Estrazione sottotitoli in corso...';

    try {
        const jinaRes = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/plain' } });
        if (!jinaRes.ok) throw new Error('Impossibile estrarre i sottotitoli del video.');
        const rawTranscript = await jinaRes.text();
        if (!rawTranscript || rawTranscript.length < 50) throw new Error('Nessun sottotitolo trovato nel video.');

        if (statusText) statusText.textContent = t('ai_analyzing');
        const model  = await discoverGeminiModel(apiKey);
        const prompt = `Ecco la trascrizione grezza di un video YouTube. Riscrivila in italiano chiaro, correggendo errori e sistemando la punteggiatura. Estrai i concetti chiave:\n\n${rawTranscript.substring(0, 60000)}`;
        const data   = await geminiPost(model, apiKey, { contents: [{ parts: [{ text: prompt }] }] });
        const text   = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("L'IA non ha restituito testo per questo video.");

        const ta = document.getElementById('deck-text');
        if (ta) { ta.value += (ta.value ? '\n' : '') + `\n\n--- Appunti Video: ${url} ---\n` + text; if (typeof window.updateCharCount === 'function') window.updateCharCount(); }
        if (spinner)    spinner.style.display = 'none';
        if (statusText) statusText.textContent = t('ai_video_done');
        setTimeout(() => { if (statusBox) statusBox.classList.remove('visible'); }, 3000);
        if (window.showToast) window.showToast('Video analizzato con successo! ✨', 'success');
    } catch (err) {
        if (spinner)    spinner.style.display = 'none';
        if (statusText) statusText.textContent = 'Errore: ' + err.message;
        if (window.showToast) window.showToast(err.message, 'error');
        setTimeout(() => { if (statusBox) statusBox.classList.remove('visible'); }, 5000);
    }
}

export async function promptWebLink() {
    const url = prompt("Incolla l'URL dell'articolo o della pagina web:");
    if (!url) return;
    if (!url.startsWith('http')) { if (window.showToast) window.showToast(t('err_invalid_url'), 'error'); return; }

    const statusBox  = document.getElementById('pdf-status');
    const statusText = document.getElementById('pdf-status-text');
    const spinner    = document.getElementById('pdf-spinner');
    if (statusBox)  statusBox.classList.add('visible');
    if (spinner)    spinner.style.display = 'block';
    if (statusText) statusText.textContent = 'Estrazione contenuto web in corso...';

    try {
        const res     = await fetch(`https://r.jina.ai/${url}`);
        if (!res.ok)  throw new Error('Impossibile estrarre il contenuto da questo URL.');
        const content = await res.text();
        if (!content || content.length < 100) throw new Error('Contenuto estratto troppo breve o non valido.');
        const ta = document.getElementById('deck-text');
        if (ta) { ta.value += (ta.value ? '\n' : '') + `\n\n--- Contenuto Web: ${url} ---\n` + content; if (typeof window.updateCharCount === 'function') window.updateCharCount(); }
        if (spinner)    spinner.style.display = 'none';
        if (statusText) statusText.textContent = 'Contenuto web estratto!';
        setTimeout(() => { if (statusBox) statusBox.classList.remove('visible'); }, 3000);
        if (window.showToast) window.showToast('Articolo importato! ✨', 'success');
    } catch (err) {
        if (spinner)    spinner.style.display = 'none';
        if (statusText) statusText.textContent = 'Errore: ' + err.message;
        if (window.showToast) window.showToast(err.message, 'error');
        setTimeout(() => { if (statusBox) statusBox.classList.remove('visible'); }, 5000);
    }
}

// ─── Text to Speech ───────────────────────────────────────────────────────────
// Default: "Google italiano" è una voce di rete (qualità neurale), molto meno
// robotica delle voci locali SAPI (es. "Microsoft Cosimo"/"Elsa"). Se l'utente
// ha già scelto una voce nelle impostazioni, quella ha sempre la priorità.
let _voiceSettings = JSON.parse(localStorage.getItem('mm_voice_settings') || '{"voiceName":"Google italiano","pitch":1,"rate":1}');

// Molti motori TTS (specialmente le voci Microsoft SAPI) trattano le parole
// TUTTE IN MAIUSCOLO come acronimi e le compitano lettera per lettera
// (es. "SBAGLIARLA" → "esse, bi, a, gi..."). Le frasi del Prof usano il
// maiuscolo per dare enfasi VISIVA nel testo a schermo, ma per la voce va
// normalizzato: qui riportiamo a minuscolo (tranne l'iniziale) ogni parola
// di 3+ lettere scritta tutta in maiuscolo, senza toccare il testo mostrato a video.
function normalizeForSpeech(text) {
    return String(text || '').replace(/\b[A-ZÀ-ÖØ-Ý]{3,}\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
}

// Parametri voce per modalità Prof — più bassa e lenta = più autoritaria/cattiva
const PROF_VOICE_PARAMS = {
    censurato: { pitchMod: 0,     rateMod: 0     },
    cattivo:   { pitchMod: -0.25, rateMod: -0.15 },  // più profondo, più lento
    pazzo:     { pitchMod: -0.30, rateMod: -0.18 },  // ancora più basso e teatrale
};

// Aggiunge pause naturali (virgole/puntini) per frasi più drammatiche
function addProfPauses(text, mode) {
    if (mode === 'censurato') return text;
    // Sostituisce ". " con pause più marcate e aggiunge enfasi
    return text
        .replace(/\. ([A-ZÀÈÉÌÒÙ])/g, '... $1')      // pausa tra frasi
        .replace(/! /g, '! ... ')                       // pausa dopo esclamazione
        .replace(/\bno\b/gi, 'no')                      // "no" enfatico
        .replace(/\bRiprova\b/g, 'Riprova.')            // stop deciso
        .replace(/\bDa capo\b/g, 'Da capo.');
}

// ─── Cloud TTS (Google Neural2, solo Student/Pro) ─────────────────────────────
// Mappa mode → parametri voce per Google Cloud TTS
const CLOUD_VOICE_PARAMS = {
    censurato: { voice: 'it-IT-Neural2-C', speakingRate: 0.95, pitch: -1.0 },
    duro:      { voice: 'it-IT-Neural2-C', speakingRate: 0.85, pitch: -3.0 },
    crudele:   { voice: 'it-IT-Neural2-C', speakingRate: 0.80, pitch: -5.0 },
};

let _cloudTtsAudio = null; // AudioContext corrente

async function speakAICloud(text, mode) {
    try {
        const user = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
        if (!user) return false;
        const idToken = await user.getIdToken();

        const params = CLOUD_VOICE_PARAMS[mode] || CLOUD_VOICE_PARAMS.censurato;
        const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ text: text.slice(0, 2000), ...params }),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            // PREMIUM_REQUIRED → ricade su Web Speech silenziosamente
            if (err.error === 'PREMIUM_REQUIRED') return false;
            throw new Error(err.error || `TTS HTTP ${res.status}`);
        }

        const { audioContent } = await res.json();
        if (!audioContent) return false;

        // Decodifica e riproduce il MP3 base64
        const bytes = Uint8Array.from(atob(audioContent), c => c.charCodeAt(0));
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (_cloudTtsAudio) { try { _cloudTtsAudio.close(); } catch(_) {} }
        _cloudTtsAudio = ctx;
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
        return true;
    } catch (err) {
        console.warn('[speakAICloud] fallback Web Speech:', err.message);
        return false;
    }
}

export function speakAI(text, profMode = null) {
    // Determina modalità prof attiva
    const mode = profMode || (() => {
        try { return localStorage.getItem('mm_oral_prof_mode') || 'censurato'; } catch(e) { return 'censurato'; }
    })();

    // Tenta prima Cloud TTS (premium) — se fallisce o non premium, usa Web Speech
    speakAICloud(normalizeForSpeech(text), mode).then(usedCloud => {
        if (usedCloud) return; // Cloud TTS ok, non serve Web Speech
        _speakAIBrowser(text, mode);
    }).catch(() => {
        _speakAIBrowser(text, mode);
    });
}

function _speakAIBrowser(text, mode) {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();

    const processed = addProfPauses(normalizeForSpeech(text), mode);
    const utterance = new SpeechSynthesisUtterance(processed);

    const voices        = speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => v.name === _voiceSettings.voiceName);
    if (selectedVoice) utterance.voice = selectedVoice;

    const mods = PROF_VOICE_PARAMS[mode] || PROF_VOICE_PARAMS.censurato;
    utterance.pitch = Math.max(0.1, (_voiceSettings.pitch || 1) + mods.pitchMod);
    utterance.rate  = Math.max(0.5, (_voiceSettings.rate  || 1) + mods.rateMod);
    utterance.lang  = selectedVoice ? selectedVoice.lang : 'it-IT';
    speechSynthesis.speak(utterance);
}

// ─── Scelta voce per genere (gratis: solo Uomo/Donna) ─────────────────────────
// Il controllo granulare (voce esatta, tono, velocità) resta riservato agli
// abbonati Student/Pro — vedi gating in services/settings.js → openSettings().
const GENDER_NAME_HINTS = {
    male:   ['cosimo', 'diego', 'daniel', 'david', 'mark', 'alex', 'george', 'luca', 'marco'],
    female: ['elsa', 'google italiano', 'monica', 'paola', 'samantha', 'zira', 'susan', 'anna', 'maria', 'laura', 'sara'],
};

function findVoiceByGender(gender, langPrefix = 'it') {
    if (typeof speechSynthesis === 'undefined') return null;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith(langPrefix));
    const hints  = GENDER_NAME_HINTS[gender] || [];
    return voices.find(v => hints.some(h => v.name.toLowerCase().includes(h))) || voices[0] || null;
}

export function setVoiceGender(gender) {
    const lang  = localStorage.getItem('mm_lang') || 'it';
    const voice = findVoiceByGender(gender, lang);
    _voiceSettings = { voiceName: voice ? voice.name : 'default', pitch: 1, rate: 1, gender };
    localStorage.setItem('mm_voice_settings', JSON.stringify(_voiceSettings));
    populateVoiceList();
    speakAI(gender === 'female' ? 'Ciao! Sono la tua coach AI.' : 'Ciao! Sono il tuo coach AI.');
}

export function getVoiceGender() {
    return _voiceSettings.gender || 'female';
}

export function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') return;
    const select = document.getElementById('select-voice');
    if (!select) return;
    const voices = speechSynthesis.getVoices();
    select.innerHTML = '<option value="default">Sistema</option>';
    const flagMap = { it:'🇮🇹', en:'🇬🇧', es:'🇪🇸', fr:'🇫🇷', de:'🇩🇪' };
    voices.forEach(v => {
        const opt   = document.createElement('option');
        const lang  = v.lang.split('-')[0];
        opt.value   = v.name;
        opt.textContent = `${flagMap[lang]||'🌐'} ${v.name} (${v.lang})`;
        if (v.name === _voiceSettings.voiceName) opt.selected = true;
        select.appendChild(opt);
    });
    const pitchEl = document.getElementById('voice-pitch');
    const rateEl  = document.getElementById('voice-rate');
    if (pitchEl) pitchEl.value = _voiceSettings.pitch;
    if (rateEl)  rateEl.value  = _voiceSettings.rate;
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = populateVoiceList;

export function updateVoicePreference() {
    const select = document.getElementById('select-voice');
    const pitchEl = document.getElementById('voice-pitch');
    const rateEl  = document.getElementById('voice-rate');
    if (select)  _voiceSettings.voiceName = select.value;
    if (pitchEl) _voiceSettings.pitch     = parseFloat(pitchEl.value);
    if (rateEl)  _voiceSettings.rate      = parseFloat(rateEl.value);
    localStorage.setItem('mm_voice_settings', JSON.stringify(_voiceSettings));
}

// ─── Window exports ───────────────────────────────────────────────────────────
export function registerAIGlobals(registry) {
    const fns = {
        speakAI, populateVoiceList, updateVoicePreference,
        handleAudioFile, handleImageFile, quickSnapAndAnalyze,
        promptYouTubeLink, promptWebLink,
        discoverGeminiModel, evaluateWithGemini
    };
    for (const [name, fn] of Object.entries(fns)) {
        window[name] = fn;
        if (registry) registry(name, fn);
    }
}
