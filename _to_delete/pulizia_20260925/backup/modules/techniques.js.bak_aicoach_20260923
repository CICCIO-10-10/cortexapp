import { t } from '../core/i18n.js';
// modules/techniques.js
// Fase 4 — Estrazione da main.js (renderTechList, showTechDetail, showTechDetailMuzii, hideTechDetail)
// HTML identico all'originale — zero modifiche alla grafica.

import { TECHNIQUES } from '../data/techniques.js';
import { callGemini } from '../services/firebase.js';

/**
 * Inizializza il modulo e bindEvents per data-fn nel registry.
 * @param {Function} register - callback del registry (name, fn)
 */
export function init(register) {
    if (register) {
        register('renderTechList',      renderTechList);
        register('showTechDetail',      showTechDetail);
        register('showTechDetailMuzii', showTechDetailMuzii);
        register('hideTechDetail',      hideTechDetail);
        // Nuove feature esercizio
        register('startTechExercise',   startTechExercise);
        register('closeTechPractice',   closeTechPractice);
        register('submitTechPractice',  submitTechPractice);
    }
    // Esponi globalmente per compatibilità con main.js
    window.renderTechList      = renderTechList;
    window.showTechDetail      = showTechDetail;
    window.showTechDetailMuzii = showTechDetailMuzii;
    window.hideTechDetail      = hideTechDetail;
    window.startTechExercise   = startTechExercise;
    window.closeTechPractice   = closeTechPractice;
    window.submitTechPractice  = submitTechPractice;
}

// ─── Render List ──────────────────────────────────────────────────────────────
export function renderTechList(container) {
    // Supporta container esplicito (TechView) o i vecchi ID legacy
    const listEl   = container ? container.querySelector('#technique-list')   : document.getElementById('technique-list');
    const detailEl = container ? container.querySelector('#technique-detail') : document.getElementById('technique-detail');
    if (listEl)   listEl.style.display = '';
    if (detailEl) detailEl.classList.remove('active');

    const grid = container
        ? container.querySelector('#tech-cards-grid')
        : document.getElementById('tech-cards-grid');
    if (!grid) return;

    grid.innerHTML = '';
    TECHNIQUES.forEach((tech, i) => {
        grid.innerHTML += `
        <div class="card" data-fn="showTechDetail" data-params="[${i}]">
            <div class="glow"></div>
            <div class="card-icon">${tech.icon}</div>
            <h3>${tech.name}</h3>
            <p>${t(tech.tagline)}</p>
            <span class="tag">${t(tech.tag)}</span>
        </div>`;
    });
}

// ─── Detail ───────────────────────────────────────────────────────────────────
export function showTechDetail(i) {
    const t        = TECHNIQUES[i];
    const listEl   = document.getElementById('technique-list');
    const detailEl = document.getElementById('technique-detail');
    const contentEl = document.getElementById('tech-detail-content');
    if (listEl)   listEl.style.display = 'none';
    if (detailEl) detailEl.classList.add('active');
    if (contentEl) contentEl.innerHTML = _renderVersion(t, i, 'classic');
}

export function showTechDetailMuzii(i) {
    const t        = TECHNIQUES[i];
    const listEl   = document.getElementById('technique-list');
    const detailEl = document.getElementById('technique-detail');
    const contentEl = document.getElementById('tech-detail-content');
    if (listEl)   listEl.style.display = 'none';
    if (detailEl) detailEl.classList.add('active');
    if (contentEl) contentEl.innerHTML = _renderVersion(t, i, 'muzii');
}

export function hideTechDetail() {
    const listEl   = document.getElementById('technique-list');
    const detailEl = document.getElementById('technique-detail');
    if (listEl)   listEl.style.display = '';
    if (detailEl) detailEl.classList.remove('active');
}

// ─── HTML builder (identico all'originale in main.js) ─────────────────────────
function _renderVersion(tech, i, version) {
    const isMuzii = version === 'muzii';
    const sum   = isMuzii ? tech.muziiSummary : tech.summary;
    const steps = isMuzii ? tech.muziiSteps   : tech.steps;
    const tip   = isMuzii ? tech.muziiTip     : tech.tip;
    return `
<div class="tech-title">${tech.icon} ${tech.name}</div>
<div class="tech-tabs">
  <button aria-label="Visualizza versione classica" class="tech-tab-btn ${isMuzii ? '' : 'active'}" data-fn="showTechDetail" data-params="[${i}]">${t('tech_classic_tab')}</button>
  <button aria-label="Visualizza versione Muzii" class="tech-tab-btn ${isMuzii ? 'active' : ''}" data-fn="showTechDetailMuzii" data-params="[${i}]">${t('tech_muzii_tab')}</button>
</div>
${isMuzii ? `<div class="muzii-credit">${t('tech_muzii_credit')}</div>` : ''}
<div class="tech-lead">${sum}</div>
<ul class="steps-list">
  ${steps.map((s, j) => `
    <li class="step-item">
      <div class="step-num ${isMuzii ? 'muzii-num' : ''}">${j + 1}</div>
      <div><h4>${s.title}</h4><p>${s.desc}</p></div>
    </li>`).join('')}
</ul>
${tip ? `<div class="tip-box ${isMuzii ? 'muzii-tip' : ''}"><span>💡</span><p>${tip}</p></div>` : ''}
<div style="margin-top:40px; text-align:center;">
    <button aria-label="Inizia esercizio con questa tecnica" class="btn btn-primary" data-fn="startTechExercise" data-params="[${i}]" style="padding:16px 40px; border-radius:100px; font-weight:800; font-size:1.1rem; box-shadow:0 8px 24px rgba(var(--accent-rgb), 0.3); transition:all 0.3s; cursor:pointer;">
        ${t('tech_exercise_btn')}
    </button>
</div>`;
}

// ─── HTML della pagina intera (per TechView) ──────────────────────────────────
export function getTechPageHTML() {
    return `
    <div id="technique-list">
        <div style="margin-bottom:32px;">
            <h1 style="font-size:2.2rem; font-weight:900; letter-spacing:-0.04em; background:linear-gradient(135deg,#fff 30%,var(--accent) 70%,var(--accent2)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:8px;">${t('tech_page_title')}</h1>
            <p style="color:var(--text-muted); font-size:1rem;">${t('tech_page_subtitle')}</p>
        </div>
        <div id="tech-cards-grid" class="cards-grid" style="grid-template-columns: repeat(3, 1fr); gap:24px;"></div>
    </div>
    <div id="technique-detail">
        <button aria-label="Torna alla lista tecniche" class="secondary-btn" data-fn="hideTechDetail" style="margin-bottom:16px;">${t('tech_back')}</button>
        <div id="tech-detail-content"></div>
    </div>
    
    <!-- OVERLAY ESERCIZIO PRATICO -->
    <div id="tech-practice-overlay" class="glass" style="display:none; position:fixed; inset:0; z-index:2000; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px);">
        <div class="card" style="width:100%; max-width:600px; max-height:85vh; overflow-y:auto; position:relative; padding:40px; border-radius:24px; border:1px solid rgba(255,255,255,0.1); background:var(--bg-elevated);">
            <button aria-label="Chiudi esercizio" data-fn="closeTechPractice" style="position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.1); border:none; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; color:var(--text); font-size:1.2rem; cursor:pointer; transition:background 0.2s;">&times;</button>
            <h2 id="tech-practice-title" style="margin-bottom:24px; font-size:1.8rem; font-weight:800;"></h2>
            <div id="tech-practice-content" style="font-size:1.1rem; line-height:1.6; color:rgba(255,255,255,0.9);"></div>
            <textarea id="tech-practice-input" placeholder="Scrivi qui la tua soluzione..." style="display:none; width:100%; min-height:120px; background:rgba(0,0,0,0.3); color:var(--text); border:2px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px; margin-top:24px; font-family:inherit; font-size:1rem; resize:vertical; transition:border-color 0.2s; outline:none;"></textarea>
            <button aria-label="Invia risposta all'IA per la valutazione" id="tech-practice-submit" class="btn btn-primary" data-fn="submitTechPractice" style="display:none; width:100%; margin-top:24px; padding:16px; border-radius:12px; font-weight:800; font-size:1.1rem;">Invia Risultato all'IA</button>
        </div>
    </div>`;
}

// ─── Utility: mini markdown → HTML ───────────────────────────────────────────
function _mdToHtml(text) {
    if (!text) return '';
    return text
        // Bold **text** o __text__
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        // Italic *text* o _text_
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Righe vuote → paragrafo
        .replace(/\n{2,}/g, '</p><p style="margin-top:10px;">')
        // Newline singola → <br>
        .replace(/\n/g, '<br>')
        // Item liste: - testo o • testo
        .replace(/^[-•]\s(.+)/gm, '<li style="margin-left:18px; margin-bottom:4px;">$1</li>')
        // Numeri: 1. testo
        .replace(/^\d+\.\s(.+)/gm, '<li style="margin-left:18px; margin-bottom:4px;">$1</li>')
        // Wrap in <p>
        .replace(/^(?!<)(.+)/gm, (m) => m.startsWith('<li') || m.startsWith('<p') ? m : m)
        .replace(/^/, '<p style="line-height:1.7; font-size:1.05rem;">').replace(/$/, '</p>');
}

// ─── Esercizi Pratici AI ──────────────────────────────────────────────────────

let currentTechForPractice = null;

export async function startTechExercise(i) {
    currentTechForPractice = TECHNIQUES[i];
    const overlay = document.getElementById('tech-practice-overlay');
    if (!overlay) return;
    
    overlay.style.display = 'flex';
    document.getElementById('tech-practice-title').innerHTML = `${currentTechForPractice.icon} Esercizio: ${currentTechForPractice.name}`;
    const content = document.getElementById('tech-practice-content');
    const input = document.getElementById('tech-practice-input');
    const submitBtn = document.getElementById('tech-practice-submit');
    
    input.style.display = 'none';
    submitBtn.style.display = 'none';
    input.value = '';
    
    content.innerHTML = `<div style="text-align:center; padding:40px 0;"><div class="loader-aura" style="width:50px; height:50px; margin:0 auto; border:4px solid var(--accent); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div><p style="margin-top:20px; color:var(--text-muted); font-weight:600;">L'AI sta creando un esercizio sfidante su cui allenarti...</p></div>`;

    const prompt = `Sei il Coach di memoria di Cortex. Crea un esercizio pratico per la tecnica: "${currentTechForPractice.name}".

REGOLE:
- Usa dati reali e concreti (es. date storiche vere, parole italiane comuni, elementi chimici reali, nomi di città)
- L'esercizio deve essere risolvibile subito nel box di testo sottostante
- Sii specifico: indica ESATTAMENTE cosa memorizzare e come rispondere nel box
- Max 5 righe, lingua italiana, niente markdown complesso
- Esempio buono per il PAO: "Memorizza queste 5 date: 1789 (Rivoluzione Francese), 1492 (scoperta America), 1945 (fine WWII), 1969 (Luna), 1861 (Unità d'Italia). Nel box scrivi la tua sequenza PAO per ciascuna."
- Esempio buono per il Palazzo: "Immagina il tuo percorso da casa a scuola. Posiziona questi 5 concetti in ordine: fotosintesi, mitosi, DNA, ATP, ribosoma. Nel box descrivi dove hai messo ciascuno."

Genera ora l'esercizio:`;

    try {
        const text = await callGemini(prompt, { temperature: 0.7 });
        content.dataset.originalExercise = text;
        content.innerHTML = _mdToHtml(text);
        input.style.display = 'block';
        submitBtn.style.display = 'block';
        setTimeout(() => input.focus(), 100);
    } catch (e) {
        if (e.isPaywall) {
            content.innerHTML = '<div style="padding:20px; text-align:center;"><p style="font-size:1.5rem;">⚡</p><p style="font-weight:700;">Hai esaurito le chiamate AI gratuite di oggi.</p><p style="color:var(--text-muted); margin-top:8px;">Passa a Cortex Student per 50 chiamate/giorno.</p></div>';
        } else {
            const msg = !window._fbLoggedIn
                ? 'Accedi con Google per usare il Coach AI.'
                : (e.message || 'Errore di connessione.');
            content.innerHTML = `
                <div style="text-align:center; padding:20px;">
                    <p style="color:#ff4757; margin-bottom:12px;">⚠️ ${msg}</p>
                    <button onclick="document.getElementById('tech-practice-submit')?.click()" style="display:none"></button>
                    <button data-fn="generateTechPractice" style="background:var(--accent); border:none; border-radius:12px; padding:10px 24px; color:#fff; font-weight:700; cursor:pointer;">🔄 Riprova</button>
                </div>`;
        }
    }
}

export async function submitTechPractice() {
    const input = document.getElementById('tech-practice-input');
    const content = document.getElementById('tech-practice-content');
    const submitBtn = document.getElementById('tech-practice-submit');
    const val = input.value.trim();
    if (!val) {
        if (window.showToast) window.showToast("Devi scrivere qualcosa per farti valutare!", "info");
        return;
    }

    const originalExerciseString = content.dataset.originalExercise || content.innerText;
    
    input.style.display = 'none';
    submitBtn.style.display = 'none';
    content.innerHTML += `<div style="margin-top:32px; padding-top:32px; border-top:1px solid rgba(255,255,255,0.1);"><p style="font-style:italic; color:var(--text-muted); padding:16px; background:rgba(255,255,255,0.02); border-radius:12px;">Soluzione fornita: "${val}"</p><div style="text-align:center; margin-top:24px;"><div class="loader-aura" style="width:40px; height:40px; margin:0 auto; border:3px solid var(--accent); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div><p style="margin-top:16px; font-weight:600; color:var(--text-muted);">Valutazione AI in corso...</p></div></div>`;

    const prompt = `Sei il fantastico Mental Coach di Cortex. Hai appena assegnato questo esercizio sulla tecnica di memoria "${currentTechForPractice.name}":\n\n"${originalExerciseString}"\n\nL'utente ha risposto nel box con:\n"${val}"\n\nValuta in modo preciso se l'applicazione della tecnica è corretta (non importa che sia perfetta, ma che la logica del metodo sia giusta). Assegna un voto secco da 1 a 10. Fornisci un feedback costruttivo e gasante. Max 5 righe. Usa toni entusiasti ma correggi eventuali sbavature.`;

    try {
        const text = await callGemini(prompt, { temperature: 0.6 });
        content.innerHTML = `<div style="font-size:1rem; line-height:1.6; color:rgba(255,255,255,0.7);">${_mdToHtml(originalExerciseString)}</div>
        <div style="margin-top:32px; padding:24px; background:rgba(255,255,255,0.05); border-radius:16px; border-left:4px solid var(--accent);">
            <h4 style="color:var(--accent); font-weight:800; margin-bottom:12px; font-size:1.2rem;">🧠 Verdetto del Coach:</h4>
            ${_mdToHtml(text)}
        </div>`;
        submitBtn.outerHTML = `<button class="btn btn-outline" data-fn="closeTechPractice" style="width:100%; margin-top:24px; padding:16px; border-radius:12px; font-weight:800;">${t('tech_close_training')}</button>`;
    } catch (e) {
        const msg = !window._fbLoggedIn
            ? 'Accedi con Google per usare il Coach AI.'
            : (e.message || 'Errore di connessione.');
        content.innerHTML += `<p style="color:#ff6b6b; margin-top:20px;">⚠️ ${msg}</p>`;
        input.style.display = 'block';
        submitBtn.style.display = 'block';
    }
}

export function closeTechPractice() {
    const overlay = document.getElementById('tech-practice-overlay');
    if (overlay) overlay.style.display = 'none';
    
    // reset button per futuri click se è stato sovrascritto
    const submitContainer = overlay.querySelector('button[data-fn="closeTechPractice"]:not([style*="position:absolute"])');
    if (submitContainer) {
        submitContainer.outerHTML = `<button id="tech-practice-submit" class="btn btn-primary" data-fn="submitTechPractice" style="display:none; width:100%; margin-top:24px; padding:16px; border-radius:12px; font-weight:800; font-size:1.1rem;">${t('tech_submit_result')}</button>`;
    }
}
