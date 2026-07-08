import { t } from '../core/i18n.js';
/**
 * modules/challengeMode.js — Phase 28
 *
 * Neural Trial (Exam Generator) + Challenge Mode con timer.
 * Estratto da main.js (NEURAL TRIAL block).
 *
 * Dipendenze iniettate via init():
 *   showToast           — notifiche UI
 *   getActiveContext    — getter per contesto file attivo del deck
 *   callGeminiWithSearch — AI call con grounding
 *   discoverGeminiModel — scopre il modello migliore disponibile
 *
 * Import diretti:
 *   awardXP  ← modules/gamification.js
 */
import { awardXP } from './gamification.js';

// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = {
    showToast:            () => {},
    getActiveContext:     () => '',
    callGeminiWithSearch: async () => '',
};

export function init(deps) { _deps = { ..._deps, ...deps }; }

// ── Stato modulo ──────────────────────────────────────────────────────────────

let currentExam = { questions: [], answers: [], currentStep: 0, deckId: null, isChallenge: false };
let challengeTimer = null;
let timeLeft = 60;

// ── Helpers privati ───────────────────────────────────────────────────────────

function startTimer() {
    if (challengeTimer) clearInterval(challengeTimer);
    timeLeft = 60;
    challengeTimer = setInterval(() => {
        timeLeft--;
        updateTimerUI();
        if (timeLeft <= 0) {
            clearInterval(challengeTimer);
            handleTimeOut();
        }
    }, 1000);
}

function handleTimeOut() {
    const textarea = document.getElementById('user-answer');
    if (textarea) {
        textarea.disabled     = true;
        textarea.style.opacity = "0.5";
        textarea.value        = "[SISTEMA: TEMPO SCADUTO - Analisi neurale interrotta]";
    }
    setTimeout(() => { submitExamAnswer(); }, 1000);
}

function updateTimerUI() {
    const timerEl = document.getElementById('exam-timer');
    if (timerEl) {
        timerEl.innerText = `TEMPO RIMASTO: ${timeLeft}s`;
        if (timeLeft < 15) timerEl.style.color = "#ef4444";
    }
}

function renderExamUI() {
    const container = document.getElementById('page-home');
    if (!container) return;
    const q = currentExam.questions[currentExam.currentStep];

    container.innerHTML = `
        <div class="exam-container" style="max-width: 700px; margin: 0 auto; padding: 60px 20px;">
            <div style="margin-bottom: 40px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-family: monospace; opacity: 0.5; color: var(--text-main);">TRIAL_SESSION_${currentExam.deckId}</span>
                <span style="color: var(--accent); font-weight: bold;">${currentExam.currentStep + 1} / 5</span>
            </div>
            <div class="progress-bar" style="width: 100%; height: 2px; background: var(--border-color); margin-bottom: 20px;">
                <div style="width: ${(currentExam.currentStep + 1) * 20}%; height: 100%; background: var(--accent); transition: 0.5s;"></div>
            </div>
            <div id="exam-timer" style="font-family: monospace; font-weight: bold; color: var(--accent); letter-spacing: 2px; text-align: right; margin-bottom: 30px;">
                ${currentExam.isChallenge ? `TEMPO RIMASTO: ${timeLeft}s` : t('challenge_standard')}
            </div>
            <h2 style="font-size: 1.5rem; line-height: 1.4; margin-bottom: 30px; color: var(--text-main);">${q.q}</h2>
            <textarea id="user-answer" placeholder="Digita la tua analisi qui..."
                      style="width: 100%; height: 150px; background: transparent; border: 1px solid var(--border-color); color: var(--text-main); padding: 20px; border-radius: 12px; font-size: 1rem; outline: none; resize: none;"></textarea>
            <button aria-label="Invia la tua risposta" class="btn-architect" data-fn="submitExamAnswer" style="margin-top: 30px; width: 100%; padding: 15px; background: var(--text-main); color: var(--bg-color); border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">
                Invia Risposta & Valuta 🧠
            </button>
        </div>
    `;

    if (currentExam.isChallenge) {
        startTimer();
        const timerEl = document.getElementById('exam-timer');
        if (timerEl) timerEl.style.color = "var(--accent)";
    }
}

function calculateArchitectLevel(stats) {
    const sum = Object.values(stats).reduce((acc, curr) => acc + curr, 0);
    return Math.floor(sum / 100) || 1;
}

async function syncNeuralProfile(stats) {
    if (!window.firebase) return;
    const user = firebase.auth().currentUser;
    if (!user) return;
    const db         = firebase.firestore();
    const profileRef = db.collection('userProfiles').doc(user.uid);
    try {
        const doc = await profileRef.get();
        let updatedStats = { ...stats };
        if (doc.exists) {
            const currentData = doc.data().neuralStats || {};
            Object.keys(stats).forEach(key => {
                if (currentData[key]) {
                    updatedStats[key] = Math.round((currentData[key] * 0.7) + (stats[key] * 0.3));
                }
            });
        }
        await profileRef.set({
            neuralStats:    updatedStats,
            lastUpdate:     new Date().toISOString(),
            architectLevel: calculateArchitectLevel(updatedStats)
        }, { merge: true });
    } catch (e) {
        console.error("Errore Sync Profilo:", e);
    }
}

function generateRadarSVG(stats) {
    const points = [];
    const keys   = Object.keys(stats);
    const center = 100, radius = 80;
    keys.forEach((key, i) => {
        const angle = (Math.PI * 2 / keys.length) * i - Math.PI / 2;
        const val   = stats[key] / 100;
        points.push(`${center + radius * val * Math.cos(angle)},${center + radius * val * Math.sin(angle)}`);
    });
    return `
        <svg viewBox="0 0 200 200" style="width: 250px; height: 250px; margin: 0 auto; display: block;">
            <polygon points="100,20 176,75 147,165 53,165 24,75" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            <polygon points="100,60 138,87 123,132 77,132 62,87" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            <polygon points="${points.join(' ')}" fill="rgba(124, 58, 237, 0.3)" stroke="var(--accent)" stroke-width="2" />
        </svg>
    `;
}

function renderFinalReport() {
    const container = document.getElementById('page-home');
    if (!container) return;
    const totalScore = currentExam.answers.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const average    = Math.round(totalScore / currentExam.questions.length);
    const multiplier = currentExam.isChallenge ? 1.5 : 1;
    const xpGained   = Math.round((average * 10) * multiplier);
    const bonusLabel = currentExam.isChallenge ? `<span style="color:var(--accent);"> (SFIDA x1.5)</span>` : "";

    const stats = {
        Logica:        currentExam.answers.find((a, i) => currentExam.questions[i]?.dimension === 'Logica')?.score        || 0,
        Sintesi:       currentExam.answers.find((a, i) => currentExam.questions[i]?.dimension === 'Sintesi')?.score       || 0,
        Applicazione:  currentExam.answers.find((a, i) => currentExam.questions[i]?.dimension === 'Applicazione')?.score  || 0,
        Critica:       currentExam.answers.find((a, i) => currentExam.questions[i]?.dimension === 'Critica')?.score       || 0,
        ProblemSolving:currentExam.answers.find((a, i) => currentExam.questions[i]?.dimension === 'Problem Solving')?.score || 0
    };

    container.innerHTML = `
        <div class="report-container" style="max-width: 800px; margin: 0 auto; padding: 60px 20px;">
            <header style="text-align: center; margin-bottom: 30px;">
                <h1 style="font-size: 2.5rem; margin-bottom: 10px; color: var(--text-main);">Trial Completato</h1>
                <div style="font-size: 4rem; font-weight: 800; color: var(--accent);">${average}%</div>
                <p style="text-transform: uppercase; letter-spacing: 3px; opacity: 0.6; color: var(--text-sub);">Neural Affinity Score ${bonusLabel}</p>
                <div style="margin-top: 10px; font-weight: bold; color: #10b981;">+ ${xpGained} XP Guadagnati</div>
            </header>
            <div class="neural-radar-card" style="background: var(--card-bg); border: 1px solid var(--border-color); padding: 30px; border-radius: 24px; margin-bottom: 40px; text-align: center;">
                <h3 style="text-transform: uppercase; letter-spacing: 2px; font-size: 0.9rem; margin-bottom: 20px; opacity: 0.7; color: var(--text-main);">Analisi Attitudinale Architect</h3>
                ${generateRadarSVG(stats)}
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 25px; text-align: left; font-size: 0.85rem;">
                    ${Object.entries(stats).map(([key, val]) => `
                        <div style="padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--border-color);">
                            <span style="opacity: 0.6; color: var(--text-main);">${key}:</span>
                            <span style="float: right; font-weight: bold; color: var(--accent);">${val}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="feedback-grid" style="display: grid; gap: 20px;">
                ${currentExam.answers.map((ans, i) => `
                    <div style="background: var(--card-bg); border: 1px solid var(--border-color); padding: 25px; border-radius: 16px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                            <strong style="color: var(--accent);">DOMANDA ${i + 1}</strong>
                            <span style="opacity: 0.5; color: var(--text-main);">Score: ${(ans.score || 0)}/100</span>
                        </div>
                        <p style="margin-bottom: 10px; font-weight: 500; color: var(--text-main);">"${currentExam.questions[i]?.q || ''}"</p>
                        <p style="font-size: 0.9rem; color: var(--text-sub); line-height: 1.6;"><span style="color: #10b981;">●</span> ${ans.feedback || ''}</p>
                    </div>
                `).join('')}
            </div>
            <button aria-label="Torna alla home" class="btn-architect" data-fn="renderHome" style="margin-top: 60px; width: 100%; background: var(--text-main); color: var(--bg-color); border: none; padding: 15px; border-radius: 8px; font-weight: 700; cursor: pointer;">
                Torna alla Workspace ⟲
            </button>
        </div>
    `;

    awardXP(xpGained, `🏆 Neural Trial Completato!${currentExam.isChallenge ? " [MODALITÀ SFIDA]" : ""}`);
    syncNeuralProfile(stats);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startChallengeMode(deckId) {
    currentExam.isChallenge = true;
    await startNeuralTrial(deckId);
}

export async function startNeuralTrial(deckId) {
    if (currentExam.isChallenge !== true) currentExam.isChallenge = false;
    const context = _deps.getActiveContext(deckId);
    if (!context) {
        _deps.showToast(t('challenge_no_source'), "error");
        return;
    }
    _deps.showToast(t('challenge_generating'), "info");

    const examPrompt = `
        MODALITÀ ARCHITECT PROFILING:
        Usa il contesto: ${context}
        Genera 5 domande che mappino esattamente queste 5 dimensioni cognitive:
        1. LOGICA: Capacità di dedurre regole dai dati.
        2. SINTESI: Capacità di riassumere concetti complessi senza perdere info.
        3. APPLICAZIONE: Risoluzione di un problema pratico usando i file.
        4. CRITICA: Confronto tra i file e le tendenze attuali del web.
        5. PROBLEM SOLVING: Cosa faresti se il concetto X fallisse nel contesto Y?
        RESTITUISCI JSON: [
            {"q": "domanda complessa", "dimension": "Logica", "focus": "criterio"},
            {"q": "domanda complessa", "dimension": "Sintesi", "focus": "criterio"},
            {"q": "domanda complessa", "dimension": "Applicazione", "focus": "criterio"},
            {"q": "domanda complessa", "dimension": "Critica", "focus": "criterio"},
            {"q": "domanda complessa", "dimension": "Problem Solving", "focus": "criterio"}
        ]
    `;

    try {
        const response = await _deps.callGeminiWithSearch(examPrompt);
        const jsonStr  = response.match(/\[.*\]/s)[0];
        currentExam.questions    = JSON.parse(jsonStr);
        currentExam.currentStep  = 0;
        currentExam.deckId       = deckId;
        currentExam.answers      = [];
        renderExamUI();
    } catch (e) {
        console.error("Errore Generazione Trial:", e);
        _deps.showToast(t('challenge_err_gen'), "error");
    }
}

export async function submitExamAnswer() {
    if (challengeTimer) clearInterval(challengeTimer);
    const answer = document.getElementById('user-answer')?.value;
    if (!answer) { _deps.showToast("Inserire una risposta per procedere", "info"); return; }

    _deps.showToast(t('challenge_evaluating'), "info");
    const question = currentExam.questions[currentExam.currentStep];
    const context  = _deps.getActiveContext(currentExam.deckId);

    const evalPrompt = `
        DOMANDA (${question.dimension}): ${question.q}
        RISPOSTA UTENTE: ${answer}
        FONTE: ${context}
        VALUTAZIONE ATTITUDINALE:
        1. Analizza la coerenza tecnica rispetto alla dimensione "${question.dimension}".
        2. Valuta la profondità del linguaggio utilizzato.
        3. Identifica se l'utente ha "copiato" o se ha "elaborato" il concetto.
        RESTITUISCI JSON: {"score": (0-100), "feedback": "...", "dimension_analysis": "...", "neural_strength": 8}
    `;

    try {
        const evalResult = await _deps.callGeminiWithSearch(evalPrompt);
        const result = JSON.parse(evalResult.match(/\{.*\}/s)[0]);
        currentExam.answers.push(result);
        if (currentExam.currentStep < 4) {
            currentExam.currentStep++;
            renderExamUI();
        } else {
            renderFinalReport();
        }
    } catch (e) {
        console.error("Errore valutazione:", e);
        _deps.showToast(t('err_response'), "error");
    }
}
