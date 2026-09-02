// dailyQuiz.js — "Quiz del giorno" in home: 1 quiz di logica al giorno (uguale per tutti),
// con streak che sale. Motivo di ritorno quotidiano. Zero dipendenze esterne.
import { DAILY_QUIZZES } from './dailyQuizData.js';

const K_LAST = 'cortex_dq_last';     // YYYY-MM-DD ultimo giorno completato
const K_STREAK = 'cortex_dq_streak'; // streak corrente
const L = ['A', 'B', 'C', 'D', 'E'];

function _ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _today() { return _ymd(new Date()); }
function _yesterday() { return _ymd(new Date(Date.now() - 86400000)); }
function _todayIdx() { return Math.floor(Date.now() / 86400000) % DAILY_QUIZZES.length; }
function _get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
function _set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function _ansKey() { return 'cortex_dq_ans_' + _today(); }
function _streak() { return parseInt(_get(K_STREAK, '0'), 10) || 0; }

function _registerDone() {
  const today = _today();
  if (_get(K_LAST, '') === today) return;
  const s = (_get(K_LAST, '') === _yesterday()) ? _streak() + 1 : 1;
  _set(K_LAST, today);
  _set(K_STREAK, String(s));
}

export function renderDailyQuiz() {
  const slot = document.getElementById('daily-quiz-slot');
  if (!slot || !DAILY_QUIZZES.length) return;
  const q = DAILY_QUIZZES[_todayIdx()];
  const chosenRaw = (function () { try { return localStorage.getItem(_ansKey()); } catch (e) { return null; } })();
  const chosen = (chosenRaw === null || chosenRaw === '') ? null : parseInt(chosenRaw, 10);
  const answered = chosen !== null && !isNaN(chosen);
  const streak = _streak();

  const streakBadge = streak > 0
    ? `<span style="font-size:0.8rem;font-weight:800;color:#f59e0b;background:rgba(245,158,11,0.14);border:1px solid rgba(245,158,11,0.35);padding:4px 12px;border-radius:100px;">🔥 ${streak} ${streak === 1 ? 'giorno' : 'giorni'}</span>`
    : '';

  const opts = q.o.map((o, i) => {
    let bg = 'rgba(139,92,246,0.10)', bd = 'rgba(139,92,246,0.30)', lc = '#a78bfa', tc = 'var(--text,#f5f4fa)', op = '1';
    if (answered) {
      if (i === q.c) { bg = 'rgba(34,197,94,0.14)'; bd = '#22c55e'; lc = '#4ade80'; tc = '#4ade80'; }
      else if (i === chosen) { bg = 'rgba(239,68,68,0.12)'; bd = '#ef4444'; lc = '#f87171'; tc = '#f87171'; }
      else { op = '0.5'; }
    }
    return `<button class="dq-opt" data-i="${i}" ${answered ? 'disabled' : ''} style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;margin:6px 0;padding:12px 14px;border-radius:12px;background:${bg};border:1.5px solid ${bd};cursor:${answered ? 'default' : 'pointer'};opacity:${op};transition:all .12s;">
      <span style="font-weight:800;color:${lc};min-width:20px;">${L[i]}</span>
      <span style="font-weight:600;color:${tc};font-size:0.98rem;">${o}</span>
    </button>`;
  }).join('');

  const sol = answered
    ? `<div style="margin-top:12px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);">
         <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:.08em;color:${chosen === q.c ? '#4ade80' : '#f87171'};font-weight:800;margin-bottom:4px;">${chosen === q.c ? '✓ Esatto!' : '✗ Sbagliato'}</div>
         <div style="font-size:0.92rem;color:var(--text-muted,#9aa0b4);line-height:1.45;">${q.sol || ''}</div>
       </div>
       <div style="margin-top:10px;font-size:0.82rem;color:var(--text-muted,#9aa0b4);text-align:center;">Torna domani per il prossimo 🔥</div>`
    : `<div style="margin-top:8px;font-size:0.8rem;color:var(--text-muted,#9aa0b4);text-align:center;">Tocca la risposta · torna ogni giorno per la streak</div>`;

  slot.innerHTML = `
    <div style="max-width:900px;margin:0 auto 18px;">
      <div style="border-radius:22px;padding:20px 20px 18px;background:radial-gradient(ellipse at 30% 0%, rgba(139,92,246,0.16) 0%, transparent 60%), rgba(16,14,26,0.9);border:1px solid rgba(139,92,246,0.28);box-shadow:0 10px 34px rgba(124,58,237,0.18);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <span style="font-size:0.78rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a78bfa;">🧠 Quiz del giorno</span>
          ${streakBadge}
        </div>
        <div style="font-size:1.08rem;font-weight:700;color:var(--text,#f5f4fa);line-height:1.35;">${q.domanda || ''}</div>
        ${q.linea ? `<div style="font-size:1.15rem;font-weight:800;color:var(--text,#f5f4fa);margin-top:8px;letter-spacing:.02em;">${q.linea}</div>` : ''}
        <div style="margin-top:14px;">${opts}</div>
        ${sol}
      </div>
    </div>`;

  if (!answered) {
    slot.querySelectorAll('.dq-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-i'), 10);
        _set(_ansKey(), String(i));
        _registerDone();
        renderDailyQuiz();
      });
    });
  }
}
