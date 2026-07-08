import { t } from '../core/i18n.js';
/**
 * modules/studyPlan.js — Phase 19
 *
 * Piano di studio: generazione, visualizzazione, rigenerazione AI.
 * Estratto da main.js (saveAndGeneratePlan, showStudyPlan,
 * regeneratePlanWithAI, generateStudyPlan).
 *
 * Dipendenze iniettate via init():
 *   state                — app state (decks, geminiKey, globalStudyMethod)
 *   saveState            — persiste state su localStorage
 *   showToast            — notifiche UI
 *   showView             — navigazione vista
 *   discoverGeminiModel  — rileva il modello Gemini disponibile
 *   getCurrentDeckIndex  — getter per currentDeckIndex (main.js scope)
 *   setCurrentDeckIndex  — setter per currentDeckIndex (main.js scope)
 *
 * Import diretti:
 *   buildDeckObject      ← modules/deckForm.js  (per saveAndGeneratePlan)
 */
import { buildDeckObject } from './deckForm.js';
import { callGemini } from '../services/firebase.js';
import { handleAIError } from '../js/utils.js';

// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = {
    state:                { decks: [], geminiKey: '' },
    saveState:            () => {},
    showToast:            () => {},
    showView:             () => {},
    discoverGeminiModel:  async () => 'gemini-2.5-flash',
    getCurrentDeckIndex:  () => null,
    setCurrentDeckIndex:  () => {},
};

export function init(deps) {
    _deps = { ..._deps, ...deps };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Salva il mazzo dal form e mostra subito il piano. Chiamato da data-fn. */
export function saveAndGeneratePlan() {
    const deck = buildDeckObject();
    if (!deck) return;

    // Assign global study method if no specific one exists
    if (!deck.studyMethod && _deps.state.globalStudyMethod) {
        deck.studyMethod = _deps.state.globalStudyMethod;
    }

    const currentDeckIndex = _deps.getCurrentDeckIndex();
    if (currentDeckIndex !== null) {
        _deps.state.decks[currentDeckIndex] = deck;
    } else {
        _deps.state.decks.push(deck);
    }
    _deps.saveState();
    const idx = currentDeckIndex !== null ? currentDeckIndex : _deps.state.decks.length - 1;
    showStudyPlan(idx);
}

/** Mostra il piano di studio per il mazzo all'indice i. */
export function showStudyPlan(i) {
    _deps.setCurrentDeckIndex(i);
    const d = _deps.state.decks[i];

    let content = '';
    if (d.aiSummary) {
        content = `
            <div class="ai-plan-viz" style="margin-bottom:32px; padding:24px; background:var(--surface); border:1px solid var(--accent); border-radius:12px;">
                <h3 style="margin-bottom:16px; display:flex; align-items:center; gap:10px;">✨ Riassunto Intelligente</h3>
                <div style="line-height:1.7; font-size:1.05rem;">${d.aiSummary}</div>
            </div>
            <hr style="border:0; border-top:1px solid var(--border); margin:32px 0;">
            <h3>📅 Tabella di Marcia (Metodo Cortex)</h3>
        `;
    }

    content += generateStudyPlan(d, i);
    // Phase 17: naviga PRIMA (mount sincrono crea #plan-content), poi riempie.
    _deps.showView('view-plan');
    const planEl = document.getElementById('plan-content');
    if (planEl) planEl.innerHTML = content;
    window.scrollTo(0, 0);
}

/** Rigenera il riassunto AI tramite Gemini e aggiorna il piano. */
export async function regeneratePlanWithAI() {
    // Gate premium
    const premium = await (window.isPremiumSafe?.() ?? Promise.resolve(window.isPremium?.()));
    if (!premium) {
        if (window.showPaywall) window.showPaywall('studyplan');
        return;
    }
    const currentDeckIndex = _deps.getCurrentDeckIndex();
    const d = _deps.state.decks[currentDeckIndex];
    const instructionsEl = document.getElementById('plan-ai-instructions');
    const instructions = instructionsEl ? instructionsEl.value.trim() : '';
    if (!d || !d.text) {
        _deps.showToast(t('studyplan_no_material'), "error");
        return;
    }

    _deps.showToast("Rigenerazione riassunto in corso... 🧠", "info");

    try {
        const prompt = `Analizza questo materiale di studio e genera un NUOVO riassunto strutturato e denso di nozioni.

IMPORTANTE - Segui queste istruzioni aggiuntive dell'utente: "${instructions}"

TESTO:
${d.text.substring(0, 15000)}

Rispondi ESCLUSIVAMENTE in formato JSON: {"summary": "..."}`;

        const text = await callGemini(prompt, {
            temperature: 0.7,
            responseMimeType: 'application/json'
        });

        const result = JSON.parse(text);
        if (result && result.summary) {
            const htmlSummary = result.summary.replace(/\n/g, '<br>');
            _deps.state.decks[currentDeckIndex].aiSummary = htmlSummary;
            _deps.saveState();
            showStudyPlan(currentDeckIndex);
            _deps.showToast("Riassunto aggiornato con successo! ✨", "success");
            if (instructionsEl) instructionsEl.value = '';
        }
    } catch (e) {
        handleAIError(e, 'rigenerazione piano', _deps.showToast);
    }
}

// ── Generatore piano (privato) ────────────────────────────────────────────────

export function generateStudyPlan(d, deckIdx) {
    const text = d.text || '';
    const wordCount = text.split(/\s+/).filter(w => w.length > 1).length;
    const charCount = text.length;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const examDate  = d.examDate ? new Date(d.examDate) : null;
    const daysLeft  = examDate ? Math.max(1, Math.ceil((examDate - today) / 86400000)) : 30;
    const examType  = d.examType || '';
    const topics    = d.examTopics || '';
    const readMinutes  = wordCount > 0 ? Math.ceil(wordCount / 200) : 15;
    const studyHours   = Math.ceil(readMinutes / 60 * 4);
    const dailyMinutes = Math.ceil(studyHours * 60 / daysLeft);
    const p1Days = Math.max(1, Math.round(daysLeft * 0.30));
    const p2Days = Math.max(1, Math.round(daysLeft * 0.25));
    const p3Days = Math.max(1, Math.round(daysLeft * 0.25));
    const p4Days = Math.max(2, daysLeft - p1Days - p2Days - p3Days);
    function addDays(base, n) { const r = new Date(base); r.setDate(r.getDate() + n); return r; }
    function fmt(x) { return x.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }); }
    const p1End    = addDays(today, p1Days - 1);
    const p2Start  = addDays(today, p1Days),       p2End = addDays(today, p1Days + p2Days - 1);
    const p3Start  = addDays(today, p1Days + p2Days), p3End = addDays(today, p1Days + p2Days + p3Days - 1);
    const p4Start  = addDays(today, p1Days + p2Days + p3Days);
    const p4End    = examDate ? addDays(examDate, -1) : addDays(today, daysLeft - 1);
    const isOral      = examType.includes('orale');
    const isPractical = examType === 'pratico' || examType === 'progetto';
    const phase2Techs = isOral
        ? [t('plan_tech_feynman'), t('plan_tech_ar_voice'), t('plan_tech_mind_map')]
        : isPractical
            ? ['Pomodoro + Deep Work', t('plan_tech_guided'), t('plan_tech_chunking')]
            : [t('plan_tech_active_recall'), t('plan_tech_mind_map'), t('plan_tech_feynman')];
    const phase3Techs = isOral
        ? ['Spaced Repetition', 'Simulazione interrogazione', 'Memory Palace']
        : ['Spaced Repetition', 'Flashcard', 'Memory Palace'];
    const sizeLabel  = charCount < 5000 ? 'materiale compatto' : charCount < 30000 ? 'materiale medio' : 'materiale ampio';
    const urgentWarn = daysLeft < 3
        ? `<div class="tip-box" style="margin-bottom:24px;border-color:rgba(239,68,68,0.4);background:rgba(239,68,68,0.07);"><span>⚠️</span><p style="color:var(--red)">Meno di 3 giorni all'esame! Concentrati solo sui punti chiave e riposati bene.</p></div>`
        : '';
    const examBadges = [
        d.examDate ? `<span class="exam-badge" style="background:rgba(245,158,11,0.12);color:var(--gold);border:1px solid rgba(245,158,11,0.3)">📅 ${examDate.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}</span>` : '',
        d.examType ? `<span class="exam-badge" style="background:rgba(124,106,247,0.12);color:var(--accent2);border:1px solid rgba(124,106,247,0.3)">${d.examType}</span>` : '',
        `<span class="exam-badge" style="background:rgba(${daysLeft < 7 ? '239,68,68' : daysLeft < 14 ? '245,158,11' : '16,185,129'},0.12);color:var(--${daysLeft < 7 ? 'red' : daysLeft < 14 ? 'gold' : 'green'});border:1px solid rgba(${daysLeft < 7 ? '239,68,68' : daysLeft < 14 ? '245,158,11' : '16,185,129'},0.3)">${daysLeft} giorni</span>`,
        wordCount > 0 ? `<span class="exam-badge" style="background:rgba(6,182,212,0.1);color:#22d3ee;border:1px solid rgba(6,182,212,0.25)">~${wordCount.toLocaleString()} parole</span>` : '',
    ].filter(Boolean).join('');
    const hasCards = d.cards && d.cards.length > 0;
    const studyBtn = hasCards
        ? `<button aria-label="Inizia sessione di studio con Spaced Repetition" class="btn btn-primary" data-fn="startStudy" data-params="[${deckIdx}]">▶ Inizia Spaced Repetition</button>`
        : `<button aria-label="Aggiungi flashcard a ${d.name}" class="btn btn-outline" data-fn="editDeckAndScrollFlashcards" data-params="[${deckIdx}]">+ Aggiungi Flashcard ad ${d.name}</button>`;
    const attHtml = (d.attachments && d.attachments.length > 0) ? `
                <div style="margin-top:16px; margin-bottom:16px;">
                    <h4 style="font-size:0.85rem;color:var(--accent2);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">📎 Allegati Esame</h4>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        ${d.attachments.map(a => {
        const isImg = a.type && a.type.startsWith('image/');
        if (isImg) {
            return '<a href="' + a.data + '" target="_blank" rel="noopener noreferrer" style="display:block;border:1px solid var(--border);border-radius:8px;overflow:hidden;width:80px;height:80px;"><img src="' + a.data + '" style="width:100%;height:100%;object-fit:cover;" /></a>';
        } else {
            return '<a href="' + a.data + '" download="' + a.name + '" style="display:flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:8px;width:80px;height:80px;background:var(--surface2);color:var(--text);text-decoration:none;font-size:0.7rem;text-align:center;padding:4px;">📄<br>' + (a.name || t('plan_document')) + '</a>';
        }
    }).join('')}
                    </div>
                </div>
            ` : '';

    return `
<div class="plan-header"><h2>${t('plan_title')} — ${d.name}</h2><p>${d.subject || ''}${topics ? ' · Focus: ' + topics : ''}</p></div>
<div class="exam-badge-row">${examBadges}</div>
${urgentWarn}
<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px 20px;margin-bottom:24px;">
  <p style="font-size:0.78rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;">STIMA</p>
  <p style="font-size:0.92rem;">${sizeLabel} · ~${readMinutes} min lettura · <strong>${studyHours}h totali</strong> → <strong>${dailyMinutes} min/giorno</strong></p>
</div>
${attHtml}
<div class="plan-phases">
  <div class="plan-phase">
    <div class="phase-header"><div class="phase-num">1</div><div><div class="phase-title">${t('plan_phase1_title')}</div><div class="phase-dates">${fmt(today)} → ${fmt(p1End)} (${p1Days}g)</div></div></div>
    <div class="phase-body">Leggi tutto il materiale senza sottolineare. Dopo ogni sezione, chiudi il libro e scrivi tutto quello che ricordi. L'obiettivo è capire la struttura generale.${topics ? `<br><br>🎯 <strong>Focus su:</strong> ${topics}` : ''}</div>
    <div class="phase-tech"><span class="tech-chip">📖 Prima Lettura</span><span class="tech-chip">🔁 Active Recall</span><span class="tech-chip">🗺️ Mind Map</span></div>
  </div>
  <div class="plan-phase phase-gold">
    <div class="phase-header"><div class="phase-num">2</div><div><div class="phase-title">${t('plan_phase2_title')}</div><div class="phase-dates">${fmt(p2Start)} → ${fmt(p2End)} (${p2Days}g)</div></div></div>
    <div class="phase-body">Per ogni concetto chiave: spiegalo ad alta voce come se insegnassi. Dove ti blocchi = il tuo punto debole. Torna al materiale solo per quelli.${isOral ? '<br><br>🗣️ <strong>Per l\'orale:</strong> simula domande dell\'esaminatore.' : ''}</div>
    <div class="phase-tech">${phase2Techs.map(t => `<span class="tech-chip">${t}</span>`).join('')}</div>
  </div>
  <div class="plan-phase phase-green">
    <div class="phase-header"><div class="phase-num">3</div><div><div class="phase-title">${t('plan_phase3_title')}</div><div class="phase-dates">${fmt(p3Start)} → ${fmt(p3End)} (${p3Days}g)</div></div></div>
    <div class="phase-body">Spaced Repetition ogni giorno con le flashcard. Per liste e sequenze usa il Memory Palace — associa ogni concetto a un posto della tua casa.${!isOral && !isPractical ? '<br><br>✍️ <strong>Per lo scritto:</strong> fai domande aperte senza appunti.' : ''}</div>
    <div class="phase-tech">${phase3Techs.map(t => `<span class="tech-chip">${t}</span>`).join('')}</div>
  </div>
  <div class="plan-phase phase-red">
    <div class="phase-header"><div class="phase-num">4</div><div><div class="phase-title">${t('plan_phase4_title')}</div><div class="phase-dates">${fmt(p4Start)} → ${examDate ? fmt(p4End) : 'Esame'} (${p4Days}g)</div></div></div>
    <div class="phase-body">Non studiare materiale nuovo. Solo flashcard in scadenza e mappe. L'ultima sera: niente studio, risposa. Il cervello consolida durante il sonno.</div>
    <div class="phase-tech"><span class="tech-chip">⚡ Spaced Repetition</span><span class="tech-chip">🗺️ Rilettura Mind Map</span><span class="tech-chip">😴 Sonno 8h</span></div>
  </div>
</div>
<div class="tip-box"><span>💡</span><p><strong>Regola d'oro:</strong> ${dailyMinutes} minuti al giorno, ogni giorno, valgono più di un'intera giornata di studio a caso.</p></div>
<div style="margin-top:20px;">${studyBtn}</div>`;
}
