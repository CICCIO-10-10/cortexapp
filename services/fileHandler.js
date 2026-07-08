/**
 * services/fileHandler.js
 * Centralized service for file uploads, PDF processing, and voice notes.
 */

import { state } from '../core/state.js';
import { t } from '../core/i18n.js';
import { showToast } from '../core/ui.js';
import { uploadMediaToCloud } from './firebase.js';
import { handleAudioFile, handleImageFile } from './ai.js';
import { awardXP, earnBadge } from '../modules/gamification.js';

// Internal state for voice recordings (separate from audioRecording.js)
let mediaRecorder = null;
let voiceChunks = [];
let voiceURLs = {};

/**
 * Handles PDF files dropped into the interface.
 */
export async function handlePdfDrop(e) {
    e.preventDefault();
    if (e.currentTarget) e.currentTarget.style.borderColor = '';
    if (e.dataTransfer && e.dataTransfer.files) {
        const files = Array.from(e.dataTransfer.files);
        for (let i = 0; i < files.length; i++) {
            await handlePdfFile(files[i], i + 1, files.length);
        }
    }
}

/**
 * Opens the PDF chunking (text splitting) overlay.
 */
export function openPdfChunking() {
    const rawText = document.getElementById('deck-text').value;
    if (!rawText.trim()) return showToast(t('file_no_text_splitter'), 'error');

    document.getElementById('pdf-raw-text').innerText = rawText;
    document.getElementById('pdf-chunking-overlay').style.display = 'flex';
}

/**
 * Automatically splits text into chunks based on word count and punctuation.
 */
export function runAutoChunk() {
    const rawText = document.getElementById('pdf-raw-text').innerText;
    if (!rawText.trim()) return showToast(t('file_no_text_divide'), 'error');

    const size = parseInt(document.getElementById('chunk-size').value) || 150;
    const words = rawText.split(/\s+/);
    const chunks = [];

    let currentChunk = [];
    for (let w of words) {
        currentChunk.push(w);
        if (currentChunk.length >= size && /^[.!?]$/.test(w.slice(-1))) {
            chunks.push(currentChunk.join(' '));
            currentChunk = [];
        }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));

    const container = document.getElementById('chunks-list');
    container.innerHTML = '';

    chunks.forEach((c, i) => {
        const div = document.createElement('div');
        div.style.cssText = 'background:var(--surface); border:1px solid var(--border); padding:16px; border-radius:12px; position:relative;';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'chunk-title';
        titleInput.value = `Blocco ${i + 1}`;
        titleInput.style.cssText = 'width:calc(100% - 40px); background:transparent; border:none; color:var(--text); font-weight:bold; margin-bottom:8px; border-bottom:1px solid var(--border-light); padding-bottom:4px;';

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => div.remove();
        removeBtn.style.cssText = 'position:absolute; right:12px; top:12px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:1.2rem;';

        const contentText = document.createElement('textarea');
        contentText.className = 'chunk-content';
        contentText.value = c;
        contentText.style.cssText = 'width:100%; height:80px; background:transparent; border:none; color:var(--text-muted); font-size:0.85rem; resize:none; font-family:inherit;';

        div.appendChild(titleInput);
        div.appendChild(removeBtn);
        div.appendChild(contentText);
        container.appendChild(div);
    });

    showToast(`Testo diviso in ${chunks.length} blocchi ⚡`);
}

/**
 * Adds all generated chunks to the current deck form as flashcards.
 * @param {Function} addPair - The function to add a pair (injected from deckForm)
 */
export function addAllChunksToDeck(addPair) {
    const container = document.getElementById('chunks-list');
    const items = container.querySelectorAll('.chunk-content');
    const titles = container.querySelectorAll('.chunk-title');

    if (items.length === 0) return showToast(t('file_no_block'), 'error');

    for (let i = 0; i < items.length; i++) {
        if (typeof addPair === 'function') {
            addPair(titles[i].value, items[i].value);
        }
    }

    document.getElementById('pdf-chunking-overlay').style.display = 'none';
    showToast(`${items.length} flashcard aggiunte! ✨`, 'success');
}

/**
 * Extracts raw text from a File object (supported: txt, csv, md, pdf, docx).
 */
export async function extractTextFromFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt' || ext === 'csv' || ext === 'md') {
        return await file.text();
    }

    if (ext === 'pdf') {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js non caricato. Assicurati di avere connessione internet.');
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;

        let fullText = '';
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        return fullText;
    }

    if (ext === 'doc' || ext === 'docx') {
        if (typeof mammoth === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        return result.value;
    }

    try {
        return await file.text();
    } catch (err) {
        throw new Error(`Estensione non supportata: .${ext}. Formato illeggibile come testo puro.`);
    }
}

/**
 * Orchestrates the processing of an uploaded file.
 * @param {File} file 
 * @param {number} idx - position in queue
 * @param {number} total - total files in queue
 * @param {Object} deps - functions like updateCharCount, saveState etc.
 */
export async function handlePdfFile(file, idx = 1, total = 1, deps = {}) {
    if (!file) return;

    const fileName = file.name.toLowerCase();
    // delegate to media handlers if applicable
    if (file.type.startsWith('audio/') || file.type.startsWith('video/') || fileName.endsWith('.ogg') || fileName.endsWith('.m4a') || fileName.endsWith('.mp3') || fileName.endsWith('.wav') || fileName.endsWith('.flac') || fileName.endsWith('.webm') || fileName.endsWith('.mp4')) {
        return await handleAudioFile(file, idx, total);
    }
    if (file.type.startsWith('image/')) {
        return await handleImageFile(file, idx, total);
    }

    // Show loading state
    const statusEl = document.getElementById('pdf-status');
    const statusText = document.getElementById('pdf-status-text');
    const spinner = document.getElementById('pdf-spinner');
    if (statusEl) statusEl.classList.add('visible');
    if (spinner) spinner.style.display = 'block';
    if (statusText) statusText.textContent = `[${idx}/${total}] Lettura "${file.name}"...`;

    try {
        const text = await extractTextFromFile(file);

        const textarea = document.getElementById('deck-text');
        if (textarea) {
            textarea.value = (textarea.value ? textarea.value + '\n\n' : '') + text.trim();
        }
        if (typeof deps.updateCharCount === 'function') deps.updateCharCount();

        const nameInput = document.getElementById('deck-name');
        if (nameInput && !nameInput.value) {
            nameInput.value = file.name.split('.').slice(0, -1).join('.');
        }

        if (statusText) statusText.textContent = `✅ "${file.name}" estratto con successo! (${text.length.toLocaleString()} caratteri)`;
        if (spinner) spinner.style.display = 'none';
        showToast(`Documento importato! 📄`, 'success');
        window.addUploadedFileBadge?.(file.name, 'success');
        setTimeout(() => statusEl && statusEl.classList.remove('visible'), 4000);

    } catch (err) {
        console.error("Estrazione testo fallita:", err);
        if (statusText) statusText.textContent = `Errore: ${err.message || 'Impossibile leggere il file'}`;
        if (spinner) spinner.style.display = 'none';
        setTimeout(() => statusEl && statusEl.classList.remove('visible'), 5000);
    }
}

/**
 * Toggles voice recording for a specific deck.
 */
export function toggleVoiceRecording(deckIdx, deps = {}) {
    const btn = document.getElementById(`voice-btn-${deckIdx}`);
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.classList.remove('recording');
        btn.innerHTML = t('rec_explanation');
        earnBadge('first_voice'); awardXP(15, '🎙️ Voice Feynman');
    } else {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            voiceChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => voiceChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const blob = new Blob(voiceChunks, { type: 'audio/webm' });
                const player = document.getElementById(`voice-player-${deckIdx}`);

                if (showToast) showToast(t('file_audio_saving'), 'info');

                try {
                    const cloudUrl = await uploadMediaToCloud(blob, 'voice_explanations');
                    voiceURLs[deckIdx] = cloudUrl;

                    if (state.decks && state.decks[deckIdx]) {
                        state.decks[deckIdx].voiceUrl = cloudUrl;
                        if (typeof deps.saveState === 'function') deps.saveState(); 
                    }

                    if (player) { 
                        player.src = cloudUrl; 
                        player.parentElement.style.display = 'block'; 
                    }
                    if (showToast) showToast('Spiegazione salvata nel Cloud! ☁️', 'success');
                } catch (error) {
                    console.error("Errore upload audio:", error);
                    if (showToast) showToast(t('err_audio_backup'), 'error');
                    
                    const url = URL.createObjectURL(blob);
                    voiceURLs[deckIdx] = url;
                    if (player) { player.src = url; player.parentElement.style.display = 'block'; }
                }
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorder.start();
            btn.classList.add('recording');
            btn.innerHTML = t('rec_stop');
        }).catch(() => showToast(t('err_mic_unavailable'), 'error'));
    }
}

/**
 * Handles image upload and preview for flashcards.
 */
export async function handleImageUpload(input, pairIdx) {
    const file = input.files[0];
    if (!file) return;

    const preview = document.getElementById(`img-preview-${pairIdx}`);
    if (preview) {
        preview.style.display = 'block';
        preview.style.opacity = '0.5'; 
    }

    try {
        if (showToast) showToast(t('file_image_loading'), 'info');
        
        const cloudUrl = await uploadMediaToCloud(file, 'flashcard_images');
        
        if (preview) {
            preview.src = cloudUrl;
            preview.style.opacity = '1';
        }

        const pairs = document.querySelectorAll('.fc-pair');
        if (pairs[pairIdx]) {
            pairs[pairIdx].dataset.img = cloudUrl; 
        }
        
        if (showToast) showToast('Immagine salvata nel Cloud! ☁️', 'success');
        
    } catch (error) {
        if (showToast) showToast(t('err_image_load'), 'error');
        if (preview) {
            preview.style.display = 'none';
            preview.style.opacity = '1';
        }
    }
}
