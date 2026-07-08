/**
 * modules/loci.js — Phase 22
 *
 * MEGA FEATURE 1: Memory Palace (Loci) — mappa planimetrica con pin.
 * Estratto da main.js (MEGA FEATURE 1: LOCI PALACE block).
 *
 * Dipendenze iniettate via init():
 *   state     — app state (decks)
 *   showToast — notifiche UI
 *
 * Import diretti:
 *   awardXP, earnBadge ← modules/gamification.js
 */
import { awardXP, earnBadge } from './gamification.js';
import { t } from '../core/i18n.js';
import { TRANSLATIONS } from '../data/translations.js';
const _t = () => (TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it);

const _getLang = () => localStorage.getItem('mm_lang') || 'it';

// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = { state: { decks: [] }, showToast: () => {} };

export function init(deps) {
    _deps = { ..._deps, ...deps };
    // Setup click listener for pin placement
    const lociImg = document.getElementById('loci-img');
    if (lociImg) {
        lociImg.addEventListener('click', e => {
            if (!lociMode) return;
            const img  = document.getElementById('loci-img');
            const rect = img.getBoundingClientRect();
            const x    = ((e.clientX - rect.left) / rect.width) * 100;
            const y    = ((e.clientY - rect.top)  / rect.height) * 100;
            if (lociPins.length >= currentLociDeck.cards.length) {
                _deps.showToast('Hai già un pin per ogni flashcard!', 'error'); return;
            }
            const cardAssigned = currentLociDeck.cards[lociPins.length];
            lociPins.push({ x, y, q: cardAssigned.q, a: cardAssigned.a });
            localStorage.setItem(`loci_pins_${currentLociDeck.id}`, JSON.stringify(lociPins));
            renderLociPins();
            awardXP(5, '📍 Pin posizionato');
        });
    }
}

// ── Stato modulo ──────────────────────────────────────────────────────────────

let currentLociDeck = null;
let lociMode        = false; // false = review, true = pin edit
let lociPins        = [];

// ── Public API ────────────────────────────────────────────────────────────────

export function openLoci(deckIdx) {
    currentLociDeck = _deps.state.decks[deckIdx];
    document.getElementById('loci-title').textContent = `🏛️ Palazzo: ${currentLociDeck.name}`;

    const savedImg  = localStorage.getItem(`loci_img_${currentLociDeck.id}`);
    const savedPins = localStorage.getItem(`loci_pins_${currentLociDeck.id}`);
    lociPins = savedPins ? JSON.parse(savedPins) : [];

    if (savedImg) {
        document.getElementById('loci-upload-prompt').style.display = 'none';
        const img = document.getElementById('loci-img');
        img.src = savedImg; img.style.display = 'block';
        document.getElementById('loci-action-bar').style.display = 'flex';
        renderLociPins();
    } else {
        document.getElementById('loci-upload-prompt').style.display = 'block';
        document.getElementById('loci-img').style.display = 'none';
        document.getElementById('loci-action-bar').style.display = 'none';
        document.getElementById('loci-pins-layer').innerHTML = '';
    }
    document.getElementById('loci-overlay').style.display = 'flex';
}

export function closeLoci() {
    document.getElementById('loci-overlay').style.display = 'none';
    document.getElementById('loci-popup').classList.remove('show');
    lociMode = false;
    document.getElementById('loci-mode-btn').textContent = '✏️ Modalità Pin';
}

/** onchange="loadLociImage(this)" — deve restare su window. */
export async function loadLociImage(input) {
    const file = input.files[0];
    if (!file) return;
    _deps.showToast("Ottimizzazione immagine...", "info");
    try {
        const compressedData = await getCompressedBase64(file);
        if (compressedData.length > 2 * 1024 * 1024) {
            _deps.showToast("L'immagine è troppo pesante anche dopo la compressione.", "error");
            return;
        }
        localStorage.setItem(`loci_img_${currentLociDeck.id}`, compressedData);
        const lociImgEl = document.getElementById('loci-img');
        lociImgEl.src = compressedData;
        lociImgEl.style.display = 'block';
        document.getElementById('loci-upload-prompt').style.display = 'none';
        document.getElementById('loci-action-bar').style.display = 'flex';
        lociMode = true;
        _deps.showToast("Planimetria salvata con successo!", "success");
    } catch (err) {
        console.error("Loci Save Error:", err);
        if (err.name === 'QuotaExceededError' || err.message.includes('quota')) {
            _deps.showToast(t('loci_memory_full'), "error");
        } else {
            _deps.showToast("Errore durante il caricamento dell'immagine.", "error");
        }
    }
}

export function toggleLociMode() {
    if (!document.getElementById('loci-img').src) return;
    lociMode = !lociMode;
    const btn  = document.getElementById('loci-mode-btn');
    const hint = document.getElementById('loci-hint');
    if (lociMode) {
        btn.innerHTML  = t('loci_review_mode');
        hint.textContent = (_t().loci_add_hint||'Clicca per aggiungere un pin. Trascinali per spostarli.');
        document.querySelector('.loci-img').style.cursor = 'crosshair';
    } else {
        btn.innerHTML  = '✏️ Modalità Pin';
        hint.textContent = (_t().loci_review_hint||'Clicca sui pin per fare il ripasso spaziale.');
        document.querySelector('.loci-img').style.cursor = 'default';
    }
    document.getElementById('loci-popup').classList.remove('show');
    renderLociPins();
}

export function clearLociPins() {
    if (confirm('Vuoi rimuovere tutti i pin per questa stanza?')) {
        lociPins = [];
        localStorage.setItem(`loci_pins_${currentLociDeck.id}`, JSON.stringify(lociPins));
        renderLociPins();
    }
}

export function simulateAIVision() {
    if (!currentLociDeck || !currentLociDeck.cards || currentLociDeck.cards.length === 0) {
        _deps.showToast('Non ci sono flashcard in questo mazzo da ancorare.', 'error');
        return;
    }
    if (lociPins.length >= currentLociDeck.cards.length) {
        _deps.showToast('Hai già mappato tutte le flashcard!', 'error');
        return;
    }
    const scanner = document.getElementById('loci-scanner');
    scanner.style.display = 'block';
    setTimeout(() => {
        scanner.style.display = 'none';
        const remainingCards = currentLociDeck.cards.length - lociPins.length;
        let added = 0;
        for (let i = 0; i < remainingCards; i++) {
            const cardAssigned = currentLociDeck.cards[lociPins.length];
            const cols = 4; const rows = 3;
            const c    = lociPins.length % cols;
            const r    = Math.floor(lociPins.length / cols) % rows;
            const baseX = 15 + (c * (80 / cols));
            const baseY = 20 + (r * (70 / rows));
            const jitterX = (Math.random() * 10) - 5;
            const jitterY = (Math.random() * 10) - 5;
            lociPins.push({
                x: Math.max(5, Math.min(95, baseX + jitterX)),
                y: Math.max(5, Math.min(95, baseY + jitterY)),
                q: cardAssigned.q,
                a: cardAssigned.a
            });
            added++;
        }
        localStorage.setItem(`loci_pins_${currentLociDeck.id}`, JSON.stringify(lociPins));
        renderLociPins();
        lociMode = false;
        toggleLociMode();
        _deps.showToast(`🤖 L'IA ha posizionato ${added} nuove ancore visive per te!`, 'success');
        awardXP(10, '🤖 Ancore Generate');
    }, 2500);
}

export function renderLociPins() {
    const layer = document.getElementById('loci-pins-layer');
    layer.innerHTML = '';
    lociPins.forEach((p, i) => {
        const pin = document.createElement('div');
        pin.className = 'loci-pin';
        if (!lociMode) pin.classList.add('hidden');
        pin.style.left          = p.x + '%';
        pin.style.top           = p.y + '%';
        pin.style.pointerEvents = 'auto';
        pin.innerHTML           = i + 1;
        pin.onclick = (e) => {
            e.stopPropagation();
            if (lociMode) {
                if (confirm('Eliminare questo pin?')) {
                    lociPins.splice(i, 1);
                    localStorage.setItem(`loci_pins_${currentLociDeck.id}`, JSON.stringify(lociPins));
                    renderLociPins();
                }
                return;
            }
            pin.classList.remove('hidden');
            const pop = document.getElementById('loci-popup');
            document.getElementById('loci-popup-q').textContent  = p.q;
            document.getElementById('loci-popup-a').textContent  = p.a;
            document.getElementById('loci-popup-a').style.filter = 'blur(4px)';
            const pRect = pin.getBoundingClientRect();
            const cRect = document.getElementById('loci-container').getBoundingClientRect();
            pop.style.left = (pRect.left - cRect.left + 16) + 'px';
            pop.style.top  = (pRect.bottom - cRect.top) + 'px';
            pop.classList.add('show');
            earnBadge('loci_master');
        };
        layer.appendChild(pin);
    });
}

// ── Helper privato ────────────────────────────────────────────────────────────

async function getCompressedBase64(file, maxWidth = 1080, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width    = img.width;
                let height   = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width  = maxWidth;
                }
                canvas.width  = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}
