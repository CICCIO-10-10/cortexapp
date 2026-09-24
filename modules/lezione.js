/**
 * modules/lezione.js — Cortex · Feature "Lezione → Studio" (v1.1)
 *
 * Trasforma il materiale grezzo di una lezione in materiale di studio pronto,
 * DENTRO Cortex. Rif. progettuale: SPEC_Lezione-Studio.md (RF-17).
 *
 *   - l'utente incolla la trascrizione del prof + carica le foto della lavagna/appunti
 *   - "Struttura" usa l'AI (Gemini) per organizzare in nota concetto→definizione,
 *     con segnaposto [📷 FOTO] dove servirebbe uno schema (fallback euristico se offline/ospite)
 *   - l'utente inserisce le foto al punto giusto ([📷 FOTO n]) — abbinamento manuale
 *   - "Genera flashcard" RIUSA la pipeline AI esistente (openPdfAIFromText):
 *     l'AI genera le carte e le salva in un mazzo normale → motore SM-2.
 *   - v1.1: la NOTA + le FOTO vengono PERSISTITE (IndexedDB locale `cortex_lessons`)
 *     e legate al mazzo creato (deck.hasLesson / deck.lessonId). Riapribili da Materiale.
 *
 * NON tocca il motore AI/mazzi: l'aggancio al salvataggio è un hook OPZIONALE e
 * GUARDATO (window.__cortexAttachLesson) che è no-op per tutti gli altri flussi.
 *
 * Roadmap (prossimi step, vedi SPEC):
 *   v2 — vision automatica: posiziona la foto giusta accanto al concetto giusto
 *   v3 — collegamento diretto note → simulazione esame + programma cross-lezione
 */

import { openPdfAIFromText } from './pdfToFlashcards.js';
import { callGeminiProxy } from '../services/firebase.js';
import { track } from '../core/analytics.js';

let _overlay = null;   // modale "Importa lezione"
let _viewer  = null;   // modale visualizzatore nota salvata
let _photos = [];      // { n, dataUrl, name }

function _esc(s) {
    return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function _toast(msg, type) {
    if (window.showToast) window.showToast(msg, type || 'info');
}
function _state() {
    return (window._legacyState ? window._legacyState() : window.state) || {};
}
/** Categoria device per segmentare l'attivazione desktop vs mobile. */
function _device() {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile';
    return 'desktop';
}

// ─── Persistenza lezioni (IndexedDB locale, NON sincronizzato) ──────────────────

const _DB = 'cortex_lessons';
const _STORE = 'lessons';

function _openDB() {
    return new Promise((res, rej) => {
        let r;
        try { r = indexedDB.open(_DB, 1); } catch (e) { return rej(e); }
        r.onupgradeneeded = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains(_STORE)) db.createObjectStore(_STORE, { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
function _saveLesson(rec) {
    return _openDB().then(db => new Promise((res, rej) => {
        const tx = db.transaction(_STORE, 'readwrite');
        tx.objectStore(_STORE).put(rec);
        tx.oncomplete = () => res(true);
        tx.onerror = () => rej(tx.error);
    }));
}
function _getLesson(id) {
    return _openDB().then(db => new Promise((res, rej) => {
        const tx = db.transaction(_STORE, 'readonly');
        const rq = tx.objectStore(_STORE).get(id);
        rq.onsuccess = () => res(rq.result || null);
        rq.onerror = () => rej(rq.error);
    }));
}

// ─── Modale "Importa lezione" ───────────────────────────────────────────────────

/** Entry point — registrato come data-fn="openImportaLezione". */
export function openImportaLezione() {
    _photos = [];
    window.__cortexAttachLesson = null;   // reset eventuale hook pendente
    _ensureOverlay();
    _renderBody();
    _overlay.style.display = 'flex';
    try {
        const nDecks = (_state().decks || []).length;
        track('lezione_aperta', { device: _device(), source: nDecks === 0 ? 'empty_state' : 'materiale' });
    } catch (_) {}
}

function _close() { if (_overlay) _overlay.style.display = 'none'; }

function _ensureOverlay() {
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.id = 'lezione-overlay';
    _overlay.style.cssText =
        'position:fixed;inset:0;z-index:6000;display:none;align-items:flex-start;justify-content:center;' +
        'background:#07060d;overflow-y:auto;padding:22px 12px;';
    _overlay.addEventListener('click', e => { if (e.target === _overlay) _close(); });
    document.body.appendChild(_overlay);
}

function _renderBody() {
    _overlay.innerHTML = `
      <div style="width:100%;max-width:680px;background:#14111f;
                  border:1px solid rgba(139,92,246,.28);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.55);
                  padding:22px 20px 20px;color:var(--text,#e8e8ee);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px;">
          <div>
            <h2 style="margin:0;font-size:1.35rem;font-weight:800;">🎓 Importa lezione</h2>
            <p style="margin:4px 0 0;font-size:.9rem;color:var(--text-muted,#9aa0b4);">
              Incolla la trascrizione, oppure carica le foto e Cortex le legge: diventano riassunto, nota e flashcard.
            </p>
          </div>
          <button data-fn="closeImportaLezione" style="background:none;border:none;color:var(--text-muted,#9aa0b4);
                  font-size:1.4rem;line-height:1;cursor:pointer;padding:2px 6px;">✕</button>
        </div>

        <label style="display:block;margin:14px 0 6px;font-size:.82rem;font-weight:700;color:var(--text-muted,#9aa0b4);">
          Nome della lezione</label>
        <input id="lez-name" type="text" placeholder="es. Fisica — Legge di Ohm (24/09)"
               style="width:100%;padding:11px 12px;border-radius:11px;border:1px solid rgba(255,255,255,.14);
                      background:rgba(255,255,255,.04);color:inherit;font-size:.95rem;box-sizing:border-box;">

        <label style="display:block;margin:14px 0 6px;font-size:.82rem;font-weight:700;color:var(--text-muted,#9aa0b4);">
          1 · Trascrizione della lezione</label>
        <textarea id="lez-raw" rows="6" placeholder="Incolla qui la trascrizione o i tuoi appunti…"
               style="width:100%;padding:11px 12px;border-radius:11px;border:1px solid rgba(255,255,255,.14);
                      background:rgba(255,255,255,.04);color:inherit;font-size:.95rem;resize:vertical;box-sizing:border-box;"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button data-fn="riassumiLezione" style="padding:9px 15px;border-radius:10px;border:none;
                  font-weight:800;color:#fff;background:linear-gradient(135deg,#22c55e,#16a34a);cursor:pointer;">📝 Riassumi</button>
          <button data-fn="strutturaLezione" style="padding:9px 15px;border-radius:10px;border:none;
                  font-weight:700;color:#fff;background:var(--accent-nebula,#7c3aed);cursor:pointer;">✨ Struttura la lezione</button>
        </div>
        <div id="lez-summary" style="display:none;margin-top:12px;padding:14px 16px;border-radius:12px;
             background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);font-size:.94rem;line-height:1.55;"></div>

        <label style="display:block;margin:16px 0 6px;font-size:.82rem;font-weight:700;color:var(--text-muted,#9aa0b4);">
          2 · Foto della lavagna / appunti — Cortex ne legge il testo</label>
        <input id="lez-photos" type="file" accept="image/*" multiple style="display:none;">
        <button type="button" onclick="document.getElementById('lez-photos').click()"
                style="width:100%;padding:14px;border-radius:12px;border:1px dashed rgba(56,189,248,.55);
                       background:rgba(56,189,248,.08);color:#38bdf8;font-weight:800;font-size:1rem;cursor:pointer;">
          📷 Carica una foto (lavagna / appunti)</button>
        <div id="lez-thumbs" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;"></div>

        <label style="display:block;margin:16px 0 6px;font-size:.82rem;font-weight:700;color:var(--text-muted,#9aa0b4);">
          3 · Nota strutturata (modificabile) — inserisci le foto dove servono</label>
        <textarea id="lez-note" rows="8" placeholder="Premi «Struttura la lezione» per generare qui la nota…"
               style="width:100%;padding:11px 12px;border-radius:11px;border:1px solid rgba(255,255,255,.14);
                      background:rgba(255,255,255,.04);color:inherit;font-size:.95rem;line-height:1.5;resize:vertical;box-sizing:border-box;"></textarea>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
          <button data-fn="generaFlashcardLezione" style="flex:1;min-width:200px;padding:13px;border-radius:12px;border:none;
                  font-weight:800;font-size:1rem;color:#fff;background:linear-gradient(135deg,#a855f7,#6366f1);cursor:pointer;">
            ⚡ Genera flashcard dalla lezione</button>
          <button data-fn="closeImportaLezione" style="padding:13px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.15);
                  background:transparent;color:var(--text-muted,#9aa0b4);font-weight:700;cursor:pointer;">Chiudi</button>
        </div>
        <p style="margin:12px 2px 0;font-size:.76rem;color:var(--text-muted,#9aa0b4);line-height:1.45;">
          Le carte finiscono in un mazzo normale (ripasso SM-2). La nota e le foto vengono salvate col mazzo:
          le riapri da Materiale → «···» → 📖 Lezione.
        </p>
      </div>`;

    _overlay.querySelector('#lez-photos').addEventListener('change', _onPhotos);
    _renderThumbs();
}

function _onPhotos(e) {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = ev => {
            _photos.push({ n: _photos.length + 1, dataUrl: ev.target.result, name: file.name });
            _renderThumbs();
        };
        reader.readAsDataURL(file);
    });
}

function _renderThumbs() {
    const box = _overlay && _overlay.querySelector('#lez-thumbs');
    if (!box) return;
    if (!_photos.length) { box.innerHTML = ''; return; }
    const thumbs = _photos.map(p => `
        <div style="width:96px;text-align:center;">
          <div style="position:relative;">
            <img src="${p.dataUrl}" alt="${_esc(p.name)}"
                 style="width:96px;height:72px;object-fit:cover;border-radius:9px;border:1px solid rgba(255,255,255,.15);">
            <span style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.7);color:#fff;font-size:.66rem;
                         padding:1px 6px;border-radius:8px;font-weight:700;">FOTO ${p.n}</span>
          </div>
          <button data-fn="inserisciFotoLezione" data-params="[${p.n}]"
                  style="margin-top:5px;width:100%;padding:4px 0;border-radius:8px;border:1px solid rgba(139,92,246,.4);
                         background:rgba(139,92,246,.12);color:#c084fc;font-size:.68rem;font-weight:700;cursor:pointer;">
            ↳ inserisci</button>
        </div>`).join('');
    box.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px;width:100%;">' + thumbs + '</div>' +
        '<button data-fn="leggiFotoLezione" style="width:100%;margin-top:10px;padding:11px;border-radius:11px;border:none;' +
        'font-weight:800;color:#fff;background:linear-gradient(135deg,#38bdf8,#6366f1);cursor:pointer;">' +
        '📷 Leggi il testo dalle foto → trascrizione</button>';
}

/** Comprime un data URL immagine (lato bytes) per stare nel limite del proxy. */
function _compress(dataUrl, maxSide = 1280, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let w = img.width, h = img.height;
            const scale = Math.min(1, maxSide / Math.max(w, h));
            w = Math.round(w * scale); h = Math.round(h * scale);
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

/**
 * Legge il testo dalle foto caricate (Gemini Vision) e lo mette nella casella
 * trascrizione. È l'input primario per chi fotografa (mobile): foto → contenuto,
 * poi Riassumi / Struttura / Genera funzionano da soli.
 */
export async function leggiFotoLezione() {
    if (!_photos.length) { _toast('Carica prima una foto', 'info'); return; }
    const btn = _overlay.querySelector('[data-fn="leggiFotoLezione"]');
    const raw = _overlay.querySelector('#lez-raw');
    const old = btn ? btn.innerHTML : '';
    if (btn) btn.disabled = true;
    const parts = [];
    try {
        for (let i = 0; i < _photos.length; i++) {
            if (btn) btn.textContent = `⏳ Leggo foto ${i + 1}/${_photos.length}…`;
            const comp = await _compress(_photos[i].dataUrl);
            const b64 = comp.split(',')[1];
            const result = await callGeminiProxy({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [
                    { text: 'Trascrivi FEDELMENTE tutto il testo di questa foto di lezione o appunti, in italiano. Restituisci solo il testo pulito, mantenendo la struttura (titoli, elenchi). Scrivi le formule in testo semplice. Nessun tuo commento.' },
                    { inline_data: { mime_type: 'image/jpeg', data: b64 } }
                ] }],
                generationConfig: { temperature: 0.1 }
            });
            const txt = (result?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
            if (txt) parts.push(txt);
        }
        if (!parts.length) throw new Error('Nessun testo estratto');
        const joined = parts.join('\n\n');
        raw.value = raw.value.trim() ? (raw.value.trim() + '\n\n' + joined) : joined;
        _toast('Testo estratto dalle foto ✓ — ora premi 📝 Riassumi o ✨ Struttura', 'success');
        try { track('lezione_foto_ocr', { device: _device(), photos: _photos.length }); } catch (_) {}
    } catch (e) {
        _toast(e && e.isGuestGate ? "Accedi per leggere le foto con l'AI" : 'Lettura foto non riuscita, riprova', 'info');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = old || '📷 Leggi il testo dalle foto → trascrizione'; }
    }
}

/** Euristica di fallback: spezza il testo grezzo in blocchi leggibili. */
function _euristica(raw) {
    let blocks = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (blocks.length <= 1) {
        blocks = raw.split(/(?<=[.;:])\s+(?=[A-ZÀ-Ú])/).map(s => s.trim()).filter(Boolean);
    }
    return blocks.map(b => '• ' + b).join('\n\n');
}

/**
 * Struttura la lezione con l'AI (Gemini via proxy): nota concetto→definizione
 * fedele al prof, con segnaposto [📷 FOTO] dove servirebbe uno schema.
 * Fallback all'euristica se l'AI non è disponibile (ospite/errore): non blocca mai.
 */
export async function strutturaLezione() {
    const raw = (_overlay.querySelector('#lez-raw')?.value || '').replace(/\r/g, '').trim();
    if (!raw) { _toast('Incolla prima la trascrizione della lezione', 'info'); return; }
    const noteEl = _overlay.querySelector('#lez-note');
    const btn = _overlay.querySelector('[data-fn="strutturaLezione"]');
    const oldLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Strutturo con AI…'; }
    try {
        const prompt =
`Sei un assistente che trasforma la trascrizione grezza di una lezione in una NOTA DI STUDIO strutturata, in italiano.
Regole:
- Organizza per concetti. Per ogni concetto una riga: TERMINE seguito da ": " e la DEFINIZIONE fedele a quanto detto dal professore.
- Usa brevi sottotitoli se raggruppano concetti legati.
- NON inventare contenuti non presenti nel testo; mantieni fedeli le definizioni.
- Dove un concetto trarrebbe reale beneficio da uno schema/figura, metti su una riga a sé il segnaposto: [📷 FOTO]
- Niente introduzioni né fronzoli.

TESTO GREZZO:
${raw}

Rispondi ESCLUSIVAMENTE con JSON valido, senza markdown:
{"title":"Titolo breve (3-6 parole)","note":"testo della nota con a-capo reali"}`;
        const result = await callGeminiProxy({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, response_mime_type: 'application/json' }
        });
        const rawTxt = result?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const obj = JSON.parse((rawTxt || '').replace(/```json/g, '').replace(/```/g, '').trim());
        if (!obj || !obj.note) throw new Error('Risposta AI vuota');
        noteEl.value = obj.note;
        const nameEl = _overlay.querySelector('#lez-name');
        if (nameEl && !nameEl.value.trim() && obj.title) nameEl.value = obj.title;
        _toast('Nota strutturata con AI ✨ — inserisci le foto e genera le flashcard', 'success');
        try { track('lezione_strutturata', { device: _device(), mode: 'ai', chars: raw.length }); } catch (_) {}
    } catch (e) {
        noteEl.value = _euristica(raw);
        try { track('lezione_strutturata', { device: _device(), mode: 'euristica', chars: raw.length }); } catch (_) {}
        _toast(e && e.isGuestGate
            ? 'Nota strutturata (base) — accedi per la versione AI'
            : 'Nota strutturata (base) — AI non disponibile ora', 'info');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = oldLabel || '✨ Struttura la lezione'; }
        noteEl.focus();
    }
}

/**
 * Riassunto della lezione (bisogno primario: capire in fretta). Un clic → sintesi
 * + punti chiave, mostrati subito. È il valore più immediato, prima delle flashcard.
 */
export async function riassumiLezione() {
    const raw = (_overlay.querySelector('#lez-raw')?.value || '').replace(/\r/g, '').trim();
    if (!raw) { _toast('Incolla prima la trascrizione della lezione', 'info'); return; }
    const box = _overlay.querySelector('#lez-summary');
    const btn = _overlay.querySelector('[data-fn="riassumiLezione"]');
    const oldLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Riassumo…'; }
    if (box) { box.style.display = 'block'; box.innerHTML = '<span style="opacity:.7">Sto riassumendo la lezione…</span>'; }
    try {
        const prompt =
`Riassumi la seguente lezione in italiano, per uno studente che deve capirla in fretta.
Formato:
- Una riga "In sintesi:" con il concetto centrale in 1-2 frasi.
- Poi "Punti chiave:" con 4-7 punti elenco brevi, fedeli al testo.
Non inventare nulla che non sia nel testo. Niente introduzioni.

TESTO:
${raw}`;
        const result = await callGeminiProxy({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 }
        });
        const txt = (result?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        if (!txt) throw new Error('Riassunto vuoto');
        if (box) box.innerHTML =
            '<div style="font-weight:800;color:#4ade80;margin-bottom:6px;">📝 Riassunto</div>' +
            '<div style="white-space:pre-wrap;">' + _esc(txt) + '</div>';
        try { track('lezione_riassunto', { device: _device(), chars: raw.length }); } catch (_) {}
    } catch (e) {
        if (box) box.innerHTML = '<span style="color:#f59e0b;">' +
            (e && e.isGuestGate ? 'Accedi per usare il riassunto AI.' : 'Riassunto non disponibile ora, riprova.') + '</span>';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = oldLabel || '📝 Riassumi'; }
    }
}

/** Inserisce un segnaposto [📷 FOTO n] nel punto del cursore della nota. */
export function inserisciFotoLezione(n) {
    const el = _overlay && _overlay.querySelector('#lez-note');
    if (!el) return;
    const marker = `\n[📷 FOTO ${n}]\n`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + marker + el.value.slice(end);
    const pos = start + marker.length;
    el.focus();
    el.setSelectionRange(pos, pos);
}

/**
 * Genera le flashcard riusando la pipeline AI esistente, e PERSISTE la lezione
 * (nota + foto) legandola al mazzo che verrà creato.
 */
export async function generaFlashcardLezione() {
    const note = (_overlay.querySelector('#lez-note')?.value || '').trim()
              || (_overlay.querySelector('#lez-raw')?.value || '').trim();
    if (!note) { _toast('Incolla la trascrizione e struttura la lezione prima di generare', 'info'); return; }
    const name = (_overlay.querySelector('#lez-name')?.value || '').trim()
              || ('Lezione ' + new Date().toLocaleDateString('it-IT'));

    try { track('lezione_genera', { device: _device(), has_photos: _photos.length > 0, photos: _photos.length, note_chars: note.length }); } catch (_) {}

    // Prepara e salva la lezione (nota + foto) in locale.
    const lesson = {
        id: 'lesson_' + Date.now(),
        name, note,
        photos: _photos.slice(),
        deckId: null,
        createdAt: new Date().toISOString()
    };
    try { await _saveLesson(lesson); } catch (e) { console.warn('[Lezione] salvataggio nota fallito', e); }

    // Hook OPZIONALE e GUARDATO: quando savePdfAIDeck crea il mazzo, lo lega alla lezione.
    // È sincrono sui campi del deck (così saveState li persiste) e async solo sull'IndexedDB.
    const hook = (deck) => {
        try {
            if (!deck) return;
            deck.lessonId = lesson.id;
            deck.hasLesson = true;
            deck.createdVia = 'lezione';
            lesson.deckId = deck.id || null;
            _saveLesson(lesson).catch(() => {});
            track('lezione_mazzo_salvato', { device: _device(), cards: (deck.cards || []).length, photos: (lesson.photos || []).length });
        } catch (e) { console.warn('[Lezione] attach fallito', e); }
        finally { if (window.__cortexAttachLesson === hook) window.__cortexAttachLesson = null; }
    };
    window.__cortexAttachLesson = hook;
    // auto-pulizia se il mazzo non viene mai salvato (evita contaminazioni future)
    setTimeout(() => { if (window.__cortexAttachLesson === hook) window.__cortexAttachLesson = null; }, 10 * 60 * 1000);

    _close();
    openPdfAIFromText(note, name);
}

export function closeImportaLezione() { _close(); }

// ─── Visualizzatore nota salvata ────────────────────────────────────────────────

/** Costruisce l'HTML della nota, con le foto inserite al posto dei segnaposto [📷 FOTO n]. */
function _notaHtml(note, photos) {
    let seq = 0;
    const esc = _esc(note);
    const withImgs = esc.replace(/\[📷[^\]]*?\]/g, (m) => {
        const num = m.match(/(\d+)/);
        const idx = num ? (parseInt(num[1], 10) - 1) : (seq++);
        const ph = photos[idx];
        return ph
            ? `</div><img src="${ph.dataUrl}" style="max-width:100%;border-radius:10px;margin:10px 0;border:1px solid rgba(255,255,255,.15);"><div style="white-space:pre-wrap;line-height:1.6;">`
            : `<span style="color:#f59e0b;">[foto non inserita]</span>`;
    });
    return `<div style="white-space:pre-wrap;line-height:1.6;">${withImgs}</div>`;
}

/** Apre la nota di lezione salvata per un mazzo. Riceve l'indice del mazzo (data-params="[i]"). */
export async function openLezioneNota(deckIdx) {
    const st = _state();
    const decks = st.decks || [];
    const deck = (typeof deckIdx === 'number') ? decks[deckIdx] : decks.find(d => d.id === deckIdx);
    if (!deck || !deck.lessonId) { _toast('Nessuna lezione salvata per questo mazzo', 'info'); return; }
    let lesson = null;
    try { lesson = await _getLesson(deck.lessonId); } catch (e) { /* ignore */ }
    if (!lesson) { _toast('Nota della lezione non trovata', 'info'); return; }
    _renderViewer(lesson, deck);
}

function _renderViewer(lesson, deck) {
    if (!_viewer) {
        _viewer = document.createElement('div');
        _viewer.id = 'lezione-viewer';
        _viewer.style.cssText =
            'position:fixed;inset:0;z-index:6100;display:none;align-items:flex-start;justify-content:center;' +
            'background:#07060d;overflow-y:auto;padding:22px 12px;';
        _viewer.addEventListener('click', e => { if (e.target === _viewer) _viewer.style.display = 'none'; });
        document.body.appendChild(_viewer);
    }
    const photos = lesson.photos || [];
    const gallery = photos.length ? `
        <h3 style="margin:20px 0 8px;font-size:.9rem;color:var(--text-muted,#9aa0b4);font-weight:700;">Foto della lezione</h3>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">
          ${photos.map(p => `<img src="${p.dataUrl}" alt="${_esc(p.name || '')}" style="width:130px;height:98px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.15);">`).join('')}
        </div>` : '';
    _viewer.innerHTML = `
      <div style="width:100%;max-width:720px;background:#14111f;
                  border:1px solid rgba(139,92,246,.28);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.55);
                  padding:22px 20px 20px;color:var(--text,#e8e8ee);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px;">
          <div>
            <div style="font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#c084fc;font-weight:800;">📖 Lezione</div>
            <h2 style="margin:2px 0 0;font-size:1.3rem;font-weight:800;">${_esc(lesson.name || deck.name || 'Lezione')}</h2>
          </div>
          <button data-fn="closeLezioneNota" style="background:none;border:none;color:var(--text-muted,#9aa0b4);
                  font-size:1.4rem;line-height:1;cursor:pointer;padding:2px 6px;">✕</button>
        </div>
        <div style="margin-top:14px;font-size:.96rem;">
          ${_notaHtml(lesson.note || '', photos)}
        </div>
        ${gallery}
        <div style="display:flex;justify-content:flex-end;margin-top:20px;">
          <button data-fn="closeLezioneNota" style="padding:11px 20px;border-radius:12px;border:1px solid rgba(255,255,255,.15);
                  background:transparent;color:var(--text-muted,#9aa0b4);font-weight:700;cursor:pointer;">Chiudi</button>
        </div>
      </div>`;
    _viewer.style.display = 'flex';
}

export function closeLezioneNota() { if (_viewer) _viewer.style.display = 'none'; }

// ─── Registrazione handler ──────────────────────────────────────────────────────

export function registerLezioneGlobals(register) {
    register('openImportaLezione', openImportaLezione);
    register('closeImportaLezione', closeImportaLezione);
    register('strutturaLezione', strutturaLezione);
    register('riassumiLezione', riassumiLezione);
    register('leggiFotoLezione', leggiFotoLezione);
    register('inserisciFotoLezione', inserisciFotoLezione);
    register('generaFlashcardLezione', generaFlashcardLezione);
    register('openLezioneNota', openLezioneNota);
    register('closeLezioneNota', closeLezioneNota);
}
