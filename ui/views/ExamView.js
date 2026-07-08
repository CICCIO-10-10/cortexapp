/**
 * ui/views/ExamView.js
 *
 * Simulazione Esame — view gestita da AppRouter (rotta 'exam').
 *
 * Flusso:
 *   1. Utente clicca "🎓 Esame" su un mazzo in MaterialeView
 *   2. examMode.startExam(i) inizializza lo stato e naviga qui
 *   3. ExamView mostra domande con timer 30s + 4 opzioni A/B/C/D
 *   4. Alla fine mostra risultati: voto, barra, resoconto sbagliate
 */

import { Component }                               from '../Component.js';
import { getExamState, submitExamAnswer,
         getExamResults }                          from '../../modules/examMode.js';

const TIMER_SECONDS = 30;

export class ExamView extends Component {

    constructor(store, mountPoint) {
        super(store, mountPoint);
        this._timer    = null;
        this._timeLeft = TIMER_SECONDS;
        this._answered = false;
    }

    mount() {
        this.mountPoint.scrollTop = 0;
        const exam = getExamState();

        if (!exam) {
            // Nessun esame attivo — torna a Materiale
            if (typeof window.__cortexNav === 'function') window.__cortexNav('materiale');
            return;
        }

        if (exam.done) {
            this._renderResults();
        } else {
            this._renderQuestion();
        }
    }

    update() { /* lo stato è tutto in examMode — nessun re-render automatico */ }

    unmount() {
        this._stopTimer();
        this.mountPoint.innerHTML = '';
    }

    // ─── Schermata Domanda ──────────────────────────────────────────────────

    _renderQuestion() {
        const exam = getExamState();
        const q    = exam.questions[exam.current];
        const progPct = Math.round((exam.current / exam.questions.length) * 100);

        this._answered = false;
        this._timeLeft = TIMER_SECONDS;

        this.mountPoint.innerHTML = `
        <div style="padding:100px 24px 60px; max-width:680px; margin:0 auto;">

            <!-- Navbar della view -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
                <button aria-label="Vai alla pagina materiale" class="secondary-btn" data-fn="showPage" data-params='["materiale"]'
                    style="font-size:0.85rem; padding:8px 16px;">← Esci</button>
                <div style="text-align:center; flex:1; padding:0 16px;">
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:2px;">
                        🎓 ${exam.deckName}
                    </div>
                    <div style="font-weight:800; font-size:0.95rem;">
                        Domanda ${exam.current + 1} / ${exam.questions.length}
                    </div>
                </div>
                <div id="exam-timer"
                    style="font-size:2rem; font-weight:900; color:var(--accent);
                           min-width:44px; text-align:right; font-variant-numeric:tabular-nums;">
                    ${TIMER_SECONDS}
                </div>
            </div>

            <!-- Barra progresso domande -->
            <div style="height:3px; background:var(--border); border-radius:2px; margin-bottom:6px;">
                <div style="height:100%; width:${progPct}%; background:var(--accent2); border-radius:2px; transition:width 0.4s;"></div>
            </div>

            <!-- Barra timer (verde→gialla→rossa) -->
            <div style="height:5px; background:var(--border); border-radius:2px; margin-bottom:32px; overflow:hidden;">
                <div id="exam-timer-bar"
                    style="height:100%; width:100%; background:var(--green);
                           border-radius:2px; transition:width 1s linear, background 1s linear;"></div>
            </div>

            <!-- Domanda -->
            <div style="background:var(--surface); border:1px solid var(--border);
                        border-radius:var(--radius-xl); padding:32px 28px;
                        margin-bottom:24px; text-align:center;">
                <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:.1em;
                             color:var(--text-muted); margin-bottom:12px; font-weight:600;">
                    Di cosa si tratta?
                </div>
                <div style="font-size:1.2rem; font-weight:700; line-height:1.55; color:var(--text);">
                    ${q.front}
                </div>
            </div>

            <!-- Opzioni A / B / C / D -->
            <div id="exam-options" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                ${q.options.map((opt, i) => `
                <button id="exam-opt-${i}" data-opt="${i}"
                    style="padding:18px 14px; background:var(--surface); border:2px solid var(--border);
                           border-radius:16px; color:var(--text); font-family:inherit; font-size:0.88rem;
                           cursor:pointer; text-align:left; transition:border-color .2s, background .2s;
                           line-height:1.4; display:flex; align-items:flex-start; gap:10px;">
                    <span style="background:var(--surface2); color:var(--text-muted); border-radius:8px;
                                 padding:2px 8px; font-weight:800; font-size:0.78rem; flex-shrink:0;">
                        ${ ['A','B','C','D'][i] }
                    </span>
                    <span>${opt}</span>
                </button>`).join('')}
            </div>
        </div>`;

        this._startTimer(q.correctIndex);
        this._bindOptionEvents(q.correctIndex);
    }

    // ─── Timer ─────────────────────────────────────────────────────────────

    _startTimer(correctIndex) {
        this._stopTimer();
        this._timeLeft = TIMER_SECONDS;

        this._timer = setInterval(() => {
            this._timeLeft--;

            const timerEl  = document.getElementById('exam-timer');
            const timerBar = document.getElementById('exam-timer-bar');

            if (timerEl)  timerEl.textContent = this._timeLeft;

            if (timerBar) {
                const pct = (this._timeLeft / TIMER_SECONDS) * 100;
                timerBar.style.width      = pct + '%';
                timerBar.style.background =
                    pct > 50 ? 'var(--green)' :
                    pct > 25 ? 'var(--gold)'  : 'var(--red)';
            }

            if (this._timeLeft <= 0) {
                this._stopTimer();
                this._handleAnswer(null, correctIndex, true);
            }
        }, 1000);
    }

    _stopTimer() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    // ─── Gestione risposta ─────────────────────────────────────────────────

    _bindOptionEvents(correctIndex) {
        this.mountPoint.querySelectorAll('[data-opt]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._handleAnswer(parseInt(btn.dataset.opt), correctIndex, false);
            });
        });
    }

    _handleAnswer(chosenIndex, correctIndex, timedOut) {
        if (this._answered) return;
        this._answered = true;
        this._stopTimer();

        // Feedback visivo sulle opzioni
        this.mountPoint.querySelectorAll('[data-opt]').forEach((btn, i) => {
            btn.style.pointerEvents = 'none';
            btn.style.cursor        = 'default';
            if (i === correctIndex) {
                btn.style.borderColor = 'var(--green)';
                btn.style.background  = 'rgba(16,185,129,0.15)';
            } else if (chosenIndex !== null && i === chosenIndex) {
                btn.style.borderColor = 'var(--red)';
                btn.style.background  = 'rgba(239,68,68,0.15)';
            }
        });

        if (timedOut) {
            const t = document.getElementById('exam-timer');
            if (t) { t.textContent = '⏱'; t.style.color = 'var(--red)'; }
        }

        submitExamAnswer(chosenIndex, timedOut);

        const exam = getExamState();
        setTimeout(() => {
            if (exam.done) this._renderResults();
            else           this._renderQuestion();
        }, 1000);
    }

    // ─── Schermata Risultati ───────────────────────────────────────────────

    _renderResults() {
        const r = getExamResults();
        if (!r) return;

        const wrongHtml = r.wrong.length === 0
            ? `<div style="text-align:center; padding:24px; color:var(--green); font-weight:700; font-size:1rem;">
                   🏆 Perfetto! Zero risposte sbagliate.
               </div>`
            : r.wrong.map(({ q, a }) => `
                <div style="background:var(--surface); border:1px solid rgba(239,68,68,0.25);
                             border-radius:14px; padding:16px; margin-bottom:10px;">
                    <div style="font-weight:700; margin-bottom:8px;">❓ ${q.front}</div>
                    ${ a.timedOut
                        ? `<div style="color:var(--red); font-size:0.83rem; margin-bottom:4px;">⏱ Tempo scaduto</div>`
                        : `<div style="color:var(--red); font-size:0.83rem; margin-bottom:4px;">
                               ✗ Hai risposto: ${a.chosen !== null ? q.options[a.chosen] : '—'}
                           </div>`}
                    <div style="color:var(--green); font-size:0.83rem;">
                        ✓ Risposta corretta: ${q.correct}
                    </div>
                </div>`).join('');

        this.mountPoint.innerHTML = `
        <div style="padding:100px 24px 60px; max-width:680px; margin:0 auto;">

            <!-- Voto -->
            <div style="text-align:center; margin-bottom:36px;">
                <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:6px; letter-spacing:.06em; text-transform:uppercase;">
                    🎓 ${r.deckName}
                </div>
                <div style="font-size:4.5rem; font-weight:900; line-height:1; color:${r.votoColor};">
                    ${r.voto}
                </div>
                <div style="margin-top:10px; color:var(--text-muted); font-size:0.95rem;">
                    ${r.correctCount} / ${r.total} corrette &nbsp;·&nbsp; ${r.pct}%
                </div>
            </div>

            <!-- Barra percentuale -->
            <div style="background:var(--surface); border:1px solid var(--border);
                        border-radius:16px; padding:20px; margin-bottom:32px;">
                <div style="display:flex; justify-content:space-between;
                             font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
                    <span>0%</span><span>50%</span><span>100%</span>
                </div>
                <div style="height:14px; background:var(--border); border-radius:7px; overflow:hidden;">
                    <div style="height:100%; width:${r.pct}%; background:${r.votoColor};
                                 border-radius:7px; transition:width 1s ease;"></div>
                </div>
            </div>

            <!-- Resoconto sbagliate -->
            ${r.wrong.length > 0 ? `
            <h3 style="font-size:1rem; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
                📋 Da ripassare
                <span style="background:rgba(239,68,68,0.15); color:var(--red);
                              border-radius:20px; padding:2px 10px; font-size:0.8rem;">
                    ${r.wrong.length}
                </span>
            </h3>` : ''}
            ${wrongHtml}

            <!-- Azioni -->
            <div style="display:flex; gap:12px; margin-top:32px; flex-wrap:wrap;">
                <button class="btn btn-primary" style="flex:1; min-width:140px;"
                    data-fn="startExam" data-params="[${r.deckIndex}]">
                    🔄 Riprova
                </button>
                <button aria-label="Vai alla pagina materiale" class="btn btn-outline" style="flex:1; min-width:140px;"
                    data-fn="showPage" data-params='["materiale"]'>
                    ← Materiale
                </button>
            </div>
        </div>`;
    }
}
