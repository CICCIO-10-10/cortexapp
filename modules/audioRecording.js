import { t } from '../core/i18n.js';
import { TRANSLATIONS } from '../data/translations.js';
const _t = () => TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it;
/**
 * modules/audioRecording.js — Phase 28
 *
 * Registrazione Audio: lista, avvio, stop, timer, visualizer, salvataggio.
 *
 * FIX v9.96.0:
 *   - Audio salvato in IndexedDB (Blob nativo) — fine del limite localStorage base64
 *   - Download via ObjectURL — nessun data URL inline nell'HTML (fix XSS)
 *   - showPaywall sempre guardato con typeof check
 *   - AudioContext ricreato se in stato 'closed' (fix stale context dopo navigazione)
 *   - deleteRecording usa modal custom non bloccante (fix confirm() su mobile)
 *
 * Dipendenze iniettate via init():
 *   state      — app state (usato solo per migration legacy)
 *   saveState  — persist state
 *   showToast  — notifiche UI
 */

import {
    saveAudioRecording,
    loadAudioRecordings,
    deleteAudioRecording,
    countAudioRecordings,
    migrateFromState,
} from './audioDB.js';

let _deps = {
    state:     { recordings: [] },
    saveState: () => {},
    showToast: () => {},
};

export function init(deps) {
    _deps = { ..._deps, ...deps };

    // Migrazione one-time: sposta eventuali registrazioni legacy da state → IDB
    if (_deps.state.recordings && _deps.state.recordings.length > 0) {
        migrateFromState(_deps.state.recordings, () => {
            _deps.state.recordings = [];
            _deps.saveState();
        }).then(n => {
            if (n > 0) {
                _deps.showToast(`✅ ${n} registrazione/i migrata/e al nuovo storage.`, 'info');
                loadAudioList();
            }
        }).catch(() => {});
    }
}

// ── Stato modulo ──────────────────────────────────────────────────────────────
let _mediaRecorder      = null;
let _audioChunks        = [];
let _audioStartTime     = 0;
let _audioTimerInterval = null;
let _audioAnimReq       = null;
let _sharedAudioCtx     = null;

// ── Helpers privati ───────────────────────────────────────────────────────────
function optimizeCanvas(canvas) {
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
}

function updateAudioTimer() {
    const diff = Math.floor((Date.now() - _audioStartTime) / 1000);
    const hrs  = Math.floor(diff / 3600).toString().padStart(2, '0');
    const mins = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const secs = (diff % 60).toString().padStart(2, '0');
    const el   = document.getElementById('audio-timer');
    if (el) el.textContent = `${hrs}:${mins}:${secs}`;
}

function getMimeType() {
    // Cross-browser MIME type fallback (Safari non supporta webm)
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const t of types) {
        if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
}

function getFileExtension(mimeType) {
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
}

function finalizeRecording(stream, mimeType) {
    stream.getTracks().forEach(t => t.stop());
    const blob     = new Blob(_audioChunks, { type: mimeType || 'audio/webm' });
    const timerEl  = document.getElementById('audio-timer');
    const duration = timerEl ? timerEl.textContent : '0:01';
    const ext      = getFileExtension(mimeType || '');

    // Usa il count IDB per il nome progressivo
    countAudioRecordings().then(count => {
        return saveAudioRecording({
            name:     `${t('rec_lesson_name')} ${count + 1}`,
            date:     new Date().toLocaleString(),
            duration: duration !== '00:00:00' ? duration : '0:01',
            mimeType: mimeType || 'audio/webm',
            ext,
            blob,
        });
    }).then(() => {
        loadAudioList();
        _deps.showToast(t('rec_saved'), 'success');
    }).catch(e => {
        console.error('[audioRecording] Salvataggio fallito', e);
        _deps.showToast(t('err_rec_save'), 'error');
    });
}

function initAudioVisualizer(stream) {
    const canvas = document.getElementById('audio-visualizer');
    if (!canvas) return;
    const ctx = optimizeCanvas(canvas);

    // Fix 4: ricrea AudioContext se chiuso o stantio dopo navigazione
    if (_sharedAudioCtx && _sharedAudioCtx.state === 'closed') {
        _sharedAudioCtx = null;
    }
    if (!_sharedAudioCtx) {
        _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_sharedAudioCtx.state === 'suspended') _sharedAudioCtx.resume();

    const source   = _sharedAudioCtx.createMediaStreamSource(stream);
    const analyser = _sharedAudioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray    = new Uint8Array(bufferLength);

    function draw() {
        _audioAnimReq = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            ctx.fillStyle = `rgba(124, 106, 247, ${dataArray[i] / 255})`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }
    draw();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Carica e renderizza la lista registrazioni da IndexedDB. */
export async function loadAudioList() {
    const container = document.getElementById('audio-list-container');
    if (!container) return;

    let recordings;
    try {
        recordings = await loadAudioRecordings();
    } catch (e) {
        console.error('[audioRecording] loadAudioRecordings fallita', e);
        recordings = [];
    }

    // Revoca ObjectURL degli elementi precedenti per evitare memory leak
    container.querySelectorAll('[data-object-url]').forEach(el => {
        URL.revokeObjectURL(el.dataset.objectUrl);
    });
    container.innerHTML = '';

    if (!recordings || recordings.length === 0) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">${_t().no_recordings||'Nessuna lezione registrata. 🎙️'}<br><span style="font-size:0.8rem; opacity:0.6;">${_t().start_recording_hint||'Premi "Inizia Registrazione" per catturare la tua prossima lezione.'}</span></div>`;
        return;
    }

    recordings.forEach((rec) => {
        const item = document.createElement('div');
        item.className = 'glass';
        item.style.cssText = 'padding:16px; margin-bottom:4px; border-radius:16px;';

        // Fix 2: crea ObjectURL dal Blob — nessun data URL inline nell'HTML
        const objectUrl = URL.createObjectURL(rec.blob);
        item.dataset.objectUrl = objectUrl;

        // I bottoni usano data-fn + data-params (id IDB intero) — nessun rischio XSS
        // Avatar iniziale dal nome
        const initial = (rec.name || '?')[0].toUpperCase();
        const canShare = typeof navigator.share === 'function';

        item.innerHTML = `
            <div style="display:flex; gap:12px; align-items:flex-start;">
                <!-- Avatar stile Discord -->
                <div style="
                    width:40px; height:40px; border-radius:50%; flex-shrink:0;
                    background:linear-gradient(135deg,var(--accent),var(--accent2));
                    display:flex; align-items:center; justify-content:center;
                    font-size:1rem; font-weight:800; color:#fff;
                ">${initial}</div>

                <div style="flex:1; min-width:0;">
                    <!-- Header messaggio -->
                    <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
                        <span style="font-weight:700; font-size:0.95rem; color:var(--text);">${rec.name || t('rec_unnamed')}</span>
                        <span style="font-size:0.7rem; color:var(--text-muted);">${rec.date}</span>
                        ${rec.duration ? `<span style="font-size:0.7rem; color:var(--text-muted);">⏱ ${rec.duration}</span>` : ''}
                    </div>

                    <!-- Player audio -->
                    <audio src="${objectUrl}" controls style="width:100%; height:36px; border-radius:8px; margin-bottom:8px;"></audio>

                    <!-- Azioni stile Discord reaction bar -->
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button aria-label="Scarica registrazione"
                            data-fn="downloadRecording" data-params="[${rec.id}]"
                            style="display:flex; align-items:center; gap:5px; background:rgba(124,58,237,0.12); border:1px solid rgba(124,58,237,0.25); border-radius:20px; padding:5px 12px; color:var(--text-muted); font-size:0.78rem; font-weight:600; cursor:pointer; transition:all 0.15s;"
                            onmouseover="this.style.background='rgba(124,58,237,0.25)';this.style.color='var(--text)'"
                            onmouseout="this.style.background='rgba(124,58,237,0.12)';this.style.color='var(--text-muted)'">
                            ⬇️ <span data-i18n="rec_download">Scarica</span>
                        </button>
                        ${canShare ? `
                        <button aria-label="Condividi registrazione"
                            data-fn="shareRecording" data-params="[${rec.id}]"
                            style="display:flex; align-items:center; gap:5px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.25); border-radius:20px; padding:5px 12px; color:var(--text-muted); font-size:0.78rem; font-weight:600; cursor:pointer; transition:all 0.15s;"
                            onmouseover="this.style.background='rgba(16,185,129,0.22)';this.style.color='var(--text)'"
                            onmouseout="this.style.background='rgba(16,185,129,0.1)';this.style.color='var(--text-muted)'">
                            📤 <span data-i18n="rec_share">Condividi</span>
                        </button>` : ''}
                        <button aria-label="Elimina registrazione"
                            data-fn="deleteRecording" data-params="[${rec.id}]"
                            style="display:flex; align-items:center; gap:5px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:20px; padding:5px 12px; color:var(--text-muted); font-size:0.78rem; font-weight:600; cursor:pointer; transition:all 0.15s;"
                            onmouseover="this.style.background='rgba(239,68,68,0.2)';this.style.color='#ef4444'"
                            onmouseout="this.style.background='rgba(239,68,68,0.08)';this.style.color='var(--text-muted)'">
                            🗑️ <span data-i18n="rec_delete">Elimina</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

/**
 * Fix 2: download sicuro via ObjectURL generato al momento — nessun data URL nell'HTML.
 * Registrata come data-fn="downloadRecording".
 */
export async function downloadRecording(id) {
    try {
        const all = await loadAudioRecordings();
        const rec = all.find(r => r.id === Number(id));
        if (!rec) { _deps.showToast(t('err_rec_not_found'), 'error'); return; }
        const url      = URL.createObjectURL(rec.blob);
        const safeName = (rec.name || `Lezione_${id}`).replace(/[^a-zA-Z0-9_\- ]/g, '_');
        const a        = document.createElement('a');
        a.href         = url;
        a.download     = `${safeName}.${rec.ext || 'webm'}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
        console.error('[audioRecording] download fallito', e);
        _deps.showToast(t('err_download'), 'error');
    }
}

/**
 * Condividi registrazione via Web Share API (mobile) o fallback download.
 * Registrata come data-fn="shareRecording".
 */
export async function shareRecording(id) {
    try {
        const all = await loadAudioRecordings();
        const rec = all.find(r => r.id === Number(id));
        if (!rec) { _deps.showToast(t('err_rec_not_found'), 'error'); return; }

        const safeName = (rec.name || `Lezione_${id}`).replace(/[^a-zA-Z0-9_\- ]/g, '_');
        const fileName = `${safeName}.${rec.ext || 'webm'}`;
        const file = new File([rec.blob], fileName, { type: rec.mimeType || 'audio/webm' });

        // Web Share API con file (supportata su Android Chrome, iOS Safari 15+)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: rec.name || 'Lezione Cortex',
                text: `Registrazione: ${rec.name || t('rec_lesson_name')} — ${rec.duration || ''}`,
                files: [file],
            });
            _deps.showToast('✅ Condiviso!', 'success');
        } else if (navigator.share) {
            // Fallback: share solo testo (senza file)
            await navigator.share({
                title: rec.name || 'Lezione Cortex',
                text: `Ho registrato una lezione su Cortex: ${rec.name || t('rec_lesson_name')} (${rec.duration || ''})`,
            });
        } else {
            // Ultimo fallback: download
            const url = URL.createObjectURL(rec.blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            _deps.showToast('📥 File scaricato (condivisione non disponibile su questo browser).', 'info');
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('[audioRecording] share fallito', e);
            _deps.showToast(t('err_share'), 'error');
        }
    }
}

/**
 * Fix 5: usa il modal custom non bloccante invece di confirm().
 * Registrata come data-fn="deleteRecording".
 */
export function deleteRecording(id) {
    const numId = Number(id);
    if (typeof window.showConfirmModal === 'function') {
        window.showConfirmModal('Eliminare questa registrazione?', async () => {
            try {
                await deleteAudioRecording(numId);
                loadAudioList();
            } catch (e) {
                _deps.showToast('❗ Errore durante l\'eliminazione.', 'error');
            }
        });
    } else {
        // Fallback per ambienti senza modal (es. test headless)
        if (!confirm('Eliminare questa registrazione?')) return;
        deleteAudioRecording(numId).then(() => loadAudioList()).catch(() => {});
      }
}

// Limite free: massimo 3 registrazioni. Premium: illimitato.
const FREE_RECORDING_LIMIT = 3;

export async function startAudioRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const msg = isIOS
            ? '❗ Registrazione audio non supportata su questo browser. Aggiorna iOS o usa Safari 14.3+.'
            : '❗ Il tuo browser non supporta la registrazione audio. Usa Chrome o Firefox.';
        _deps.showToast(msg, 'error');
        return;
    }

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        console.error('[audioRecording] getUserMedia error:', e.name, e.message);
        let msg = '❗ Impossibile accedere al microfono.';
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
            msg = '❗ Permesso microfono negato. Vai nelle impostazioni del browser e consenti il microfono.';
        } else if (e.name === 'NotFoundError') {
            msg = '❗ Nessun microfono trovato su questo dispositivo.';
        } else if (e.name === 'NotSupportedError') {
            msg = '❗ Registrazione audio non supportata su questo browser/dispositivo.';
        }
        _deps.showToast(msg, 'error');
        return;
    }

    const isAdminNow = typeof window.isAdmin === 'function' && window.isAdmin();

    if (!isAdminNow) {
        const recCount = await countAudioRecordings();
        const premium  = await (window.isPremiumSafe?.() ?? Promise.resolve(window.isPremium?.()));

        if (!premium && recCount >= FREE_RECORDING_LIMIT) {
            stream.getTracks().forEach(t => t.stop());
            _deps.showToast(`⚡ Hai raggiunto il limite di ${FREE_RECORDING_LIMIT} registrazioni. Passa a Student per registrare senza limiti.`, 'warning');
            if (typeof window.showPaywall === 'function') window.showPaywall('audio');
            return;
        }
    }

    const mimeType = getMimeType();
    try {
        _mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (e) {
        console.warn('[audioRecording] MediaRecorder con mimeType fallito, retry senza:', e);
        try {
            _mediaRecorder = new MediaRecorder(stream);
        } catch (e2) {
            stream.getTracks().forEach(t => t.stop());
            _deps.showToast(t('err_rec_not_supported'), 'error');
            return;
        }
    }

    _audioChunks   = [];
    _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _audioChunks.push(e.data); };
    _mediaRecorder.onstop          = () => finalizeRecording(stream, _mediaRecorder.mimeType);
    _mediaRecorder.start(1000);

    const btnStart = document.getElementById('btn-start-record');
    const btnStop  = document.getElementById('btn-stop-record');
    if (btnStart) btnStart.style.display = 'none';
    if (btnStop)  btnStop.style.display  = 'flex';
    _audioStartTime     = Date.now();
    _audioTimerInterval = setInterval(updateAudioTimer, 1000);
    initAudioVisualizer(stream);
    _deps.showToast(t('rec_started'), 'info');
}

export function stopAudioRecording() {
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
        _mediaRecorder.stop();
        clearInterval(_audioTimerInterval);
        cancelAnimationFrame(_audioAnimReq);
        const btnStart = document.getElementById('btn-start-record');
        const btnStop  = document.getElementById('btn-stop-record');
        const timer    = document.getElementById('audio-timer');
        if (btnStart) btnStart.style.display = 'flex';
        if (btnStop)  btnStop.style.display  = 'none';
        if (timer)    timer.textContent       = '00:00:00';
    }
}
