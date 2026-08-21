/**
 * tolcSim.js — Simulazione TOLC (selettore + strutture ufficiali CISIA)
 *
 * Flusso: openTolcSim() -> SELETTORE (tutti i TOLC) -> INTRO (struttura
 * ufficiale del TOLC scelto) -> SIMULAZIONE a tempo -> RISULTATO (corrette/totale).
 * Strutture e banche in data/tolc.js. Domande ORIGINALI in stile TOLC.
 */

import { TOLC_TESTS, TOLC_ENG_BANCA, tolcTotQ, tolcTotMin } from '../data/tolc.js';

let _state = null;
let _timer = null;

function _el(id) { return document.getElementById(id); }
function _fmt(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
var _SUP = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','n':'ⁿ','x':'ˣ','a':'ᵃ','b':'ᵇ','i':'ⁱ'};
var _SUB = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','n':'ₙ','x':'ₓ','i':'ᵢ'};
function _supStr(p) { return String(p).split('').map(function (c) { return _SUP[c] || c; }).join(''); }
// Rende leggibili le notazioni matematiche ASCII (sqrt, ^, /, inf, ecc.)
function _math(str) {
  if (str == null) return str;
  var s = String(str);
  s = s.replace(/\bsqrt\s*/gi, '√');
  s = s.replace(/\^\(([^)]+)\)/g, function (m, p) { return _supStr(p); });   // ^( ... )
  s = s.replace(/\^(-?[0-9a-zA-Z]+)/g, function (m, p) { return _supStr(p); }); // ^2, ^-1, ^n
  s = s.replace(/_\{([^}]+)\}/g, function (m, p) { return p.split('').map(function (c) { return _SUB[c] || c; }).join(''); });
  s = s.replace(/_([0-9a-zA-Z])/g, function (m, p) { return _SUB[p] || ('_' + p); }); // log_2
  s = s.replace(/\+\s*inf(inity)?\b/gi, '+∞').replace(/-\s*inf(inity)?\b/gi, '−∞').replace(/\binf(inity)?\b/gi, '∞');
  s = s.replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠').replace(/<>/g, '≠');
  s = s.replace(/ U /g, ' ∪ ');
  s = s.replace(/\bpi\b/g, 'π').replace(/\*/g, '·');
  s = s.replace(/ - /g, ' − ').replace(/\(-/g, '(−').replace(/,\s*-/g, ', −'); // meno tipografico
  return s;
}
function _clearTimer() { if (_timer) { clearInterval(_timer); _timer = null; } }
function _remove() { _clearTimer(); const ov = _el('tolc-sim-overlay'); if (ov) ov.remove(); _state = null; }

function _shell(inner) {
  return '<div style="max-width:940px;width:min(94vw,940px);max-height:92vh;overflow-y:auto;background:rgba(16,16,22,0.96);border:1px solid rgba(168,85,247,0.28);border-radius:22px;padding:28px;box-shadow:0 40px 120px rgba(168,85,247,0.18);color:#e8e8ee;font-family:Inter,system-ui,sans-serif;">' + inner + '</div>';
}

export function openTolcSim() {
  _remove();
  const ov = document.createElement('div');
  ov.id = 'tolc-sim-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(3,3,6,0.94);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML = _selectorHTML();
  document.body.appendChild(ov);
  ov.addEventListener('click', function (e) { if (e.target === ov) _remove(); });
  try { if (window.track) window.track('tolc_sim_open'); } catch (e) {}
}

function _selectorHTML() {
  const cards = Object.entries(TOLC_TESTS).map(function (pair) {
    const key = pair[0], t = pair[1];
    const totQ = tolcTotQ(t), nSez = t.sezioni.length;
    const ready = (t.banca && t.banca.length > 0);
    const badge = ready ? ' <span style="font-size:.62rem;color:#86efac;background:rgba(34,197,94,.15);padding:1px 6px;border-radius:10px;vertical-align:middle;">provabile</span>' : '';
    return '<button class="tolc-pick" data-key="' + key + '" style="text-align:left;padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#e8e8ee;cursor:pointer;display:flex;flex-direction:column;gap:3px;">' +
      '<div style="font-weight:800;font-size:.98rem;">' + t.emoji + ' ' + t.nome + badge + '</div>' +
      '<div style="font-size:.76rem;color:rgba(255,255,255,.5);line-height:1.3;">' + t.area + '</div>' +
      '<div style="font-size:.72rem;color:rgba(255,255,255,.4);">' + nSez + ' sezioni' + (totQ ? ' · ' + totQ + ' quesiti' : '') + ' + Inglese</div>' +
      '</button>';
  }).join('');
  return _shell(
    '<div style="text-align:center;margin-bottom:16px;">' +
      '<div style="font-size:1.8rem;">🎯</div>' +
      '<h2 style="font-family:Outfit,sans-serif;font-weight:900;margin:6px 0 3px;">Simulazione TOLC</h2>' +
      '<p style="color:rgba(255,255,255,.55);margin:0;font-size:.9rem;">Scegli il tuo test. Struttura ufficiale, a tempo.</p>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' + cards + '</div>' +
    '<button id="tolc-close" style="width:100%;padding:12px;margin-top:14px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.6);font-weight:700;cursor:pointer;">Chiudi</button>'
  );
}

function _intro(key) {
  const t = TOLC_TESTS[key];
  const totQ = tolcTotQ(t), totMin = tolcTotMin(t);
  const rows = t.sezioni.map(function (s) {
    return '<tr>' +
      '<td style="padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06);">' + s.n + '</td>' +
      '<td style="padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06);text-align:right;color:rgba(255,255,255,.7);">' + (s.q != null ? s.q : '—') + '</td>' +
      '<td style="padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06);text-align:right;color:rgba(255,255,255,.7);">' + (s.min != null ? s.min + "'" : '—') + '</td>' +
    '</tr>';
  }).join('');
  const ready = (t.banca && t.banca.length > 0);
  const ov = _el('tolc-sim-overlay'); if (!ov) return;
  const warn = ready ? '' : '<br><b style="color:#fbbf24;">Banca domande in arrivo per questo TOLC</b> — al momento e provabile solo il TOLC-I.';
  const startStyle = ready ? 'linear-gradient(135deg,#a855f7,#6366f1)' : 'rgba(255,255,255,.08)';
  const startCur = ready ? 'pointer' : 'not-allowed';
  const startTxt = ready ? 'Inizia la simulazione →' : 'Domande non ancora disponibili';
  ov.innerHTML = _shell(
    '<div style="text-align:center;margin-bottom:14px;">' +
      '<div style="font-size:1.6rem;">' + t.emoji + '</div>' +
      '<h2 style="font-family:Outfit,sans-serif;font-weight:900;margin:4px 0 2px;">' + t.nome + '</h2>' +
      '<p style="color:rgba(255,255,255,.55);margin:0;font-size:.85rem;">' + t.area + '</p>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:.86rem;margin-bottom:8px;">' +
      '<thead><tr style="color:#c084fc;font-size:.72rem;text-transform:uppercase;">' +
        '<th style="text-align:left;padding:4px;">Sezione</th><th style="text-align:right;padding:4px;">Quesiti</th><th style="text-align:right;padding:4px;">Tempo</th>' +
      '</tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr style="font-weight:800;">' +
        '<td style="padding:8px 4px;">Totale + Inglese</td>' +
        '<td style="padding:8px 4px;text-align:right;">' + (totQ ? totQ : (t.totQ || '—')) + ' + ' + t.engQ + '</td>' +
        '<td style="padding:8px 4px;text-align:right;">' + (totMin ? totMin + "'" : '—') + ' + ' + t.engMin + "'</td>" +
      '</tr></tfoot>' +
    '</table>' +
    (warn ? '<p style="font-size:.72rem;color:rgba(255,255,255,.4);margin:0 0 16px;line-height:1.5;">' + warn + '</p>' : '') +
    '<button id="tolc-start" data-key="' + key + '" ' + (ready ? '' : 'disabled') + ' style="width:100%;padding:14px;border-radius:12px;border:none;font-weight:800;font-size:1rem;color:#fff;background:' + startStyle + ';cursor:' + startCur + ';">' + startTxt + '</button>' +
    '<button id="tolc-back" style="width:100%;padding:11px;margin-top:9px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.6);font-weight:700;cursor:pointer;">← Scegli un altro TOLC</button>'
  );
}

function _shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
function _sample(t) {
  // Campiona una "versione" del test: per ogni sezione prende (a caso) fino al
  // numero ufficiale di quesiti disponibili nella banca. Ogni run e' diverso.
  var bySec = {};
  t.banca.forEach(function (q) { (bySec[q.s] = bySec[q.s] || []).push(q); });
  var out = [];
  t.sezioni.forEach(function (sec) {
    var pool = _shuffle((bySec[sec.n] || []).slice());
    var take = sec.q ? Math.min(sec.q, pool.length) : pool.length;
    out = out.concat(pool.slice(0, take));
  });
  if (!out.length) out = _shuffle(t.banca.slice());
  // Sezione Inglese: comune a tutti i TOLC, sempre in fondo
  var eng = _shuffle(TOLC_ENG_BANCA.slice()).slice(0, Math.min(t.engQ || TOLC_ENG_BANCA.length, TOLC_ENG_BANCA.length));
  return { qs: out.concat(eng), nBase: out.length, nEng: eng.length };
}
function _start(key) {
  const t = TOLC_TESTS[key];
  if (!t.banca || !t.banca.length) return;
  const smp = _sample(t);
  const qs = smp.qs;
  const totMin = tolcTotMin(t) || (smp.nBase * 1.5);
  const baseSecs = Math.round(totMin * 60 * smp.nBase / (tolcTotQ(t) || smp.nBase));
  const engSecs = Math.round((t.engMin || 15) * 60 * smp.nEng / (t.engQ || smp.nEng || 1));
  const secs = Math.max(180, baseSecs + engSecs);
  _state = { key: key, test: t, qs: qs, i: 0, answers: new Array(qs.length).fill(null), checked: new Array(qs.length).fill(false), left: secs };
  _renderQ();
  _clearTimer();
  _timer = setInterval(function () {
    if (!_state) return;
    _state.left--;
    const te = _el('tolc-timer'); if (te) te.textContent = _fmt(_state.left);
    if (_state.left <= 0) _finish();
  }, 1000);
}

function _renderQ() {
  const st = _state, d = st.qs[st.i];
  const ov = _el('tolc-sim-overlay'); if (!ov) return;
  const prog = Math.round(st.i / st.qs.length * 100);
  const isChecked = st.checked[st.i];
  const opts = d.o.map(function (o, idx) {
    const sel = st.answers[st.i] === idx;
    var bd, bg, lc = '#c084fc';
    if (isChecked) {
      if (idx === d.c) { bd = 'rgba(34,197,94,.7)'; bg = 'rgba(34,197,94,.14)'; lc = '#4ade80'; }
      else if (sel) { bd = 'rgba(239,68,68,.7)'; bg = 'rgba(239,68,68,.14)'; lc = '#f87171'; }
      else { bd = 'rgba(255,255,255,.10)'; bg = 'rgba(255,255,255,.02)'; }
    } else {
      bd = sel ? 'rgba(168,85,247,.7)' : 'rgba(255,255,255,.12)';
      bg = sel ? 'rgba(168,85,247,.15)' : 'rgba(255,255,255,.03)';
    }
    return '<button class="tolc-opt" data-idx="' + idx + '" style="text-align:left;padding:12px 15px;border-radius:12px;border:1px solid ' + bd + ';background:' + bg + ';color:#e8e8ee;font-size:.94rem;cursor:' + (isChecked ? 'default' : 'pointer') + ';">' +
      '<b style="color:' + lc + ';margin-right:8px;">' + String.fromCharCode(65 + idx) + '</b>' + _math(o) + '</button>';
  }).join('');
  const fb = !isChecked ? '' : (st.answers[st.i] === d.c
    ? '<div style="margin-top:12px;padding:10px 14px;border-radius:12px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);color:#4ade80;font-weight:700;font-size:.9rem;">✔ Corretta</div>'
    : '<div style="margin-top:12px;padding:10px 14px;border-radius:12px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#f87171;font-weight:700;font-size:.9rem;">✘ Sbagliata — la risposta corretta è ' + String.fromCharCode(65 + d.c) + '</div>');
  const canCheck = st.answers[st.i] !== null && !isChecked;
  const nextTxt = (st.i === st.qs.length - 1) ? 'Termina ✓' : 'Prossima →';
  // Dashboard navigazione ad accordion: chip sezioni colorate; clic su una
  // sezione -> si aprono i suoi numeri domanda (cliccabili per saltare).
  var PAL = ['#a855f7', '#d946ef', '#06b6d4', '#3b82f6', '#f59e0b', '#22c55e'];
  var groups = [];
  st.qs.forEach(function (q, gi) {
    var g = groups[groups.length - 1];
    if (!g || g.name !== q.s) { g = { name: q.s, idxs: [] }; groups.push(g); }
    g.idxs.push(gi);
  });
  if (st.navSec === undefined) st.navSec = d.s;
  var chips = groups.map(function (g, i) {
    var col = PAL[i % PAL.length];
    var open = g.name === st.navSec;
    var done = g.idxs.filter(function (gi) { return st.answers[gi] !== null; }).length;
    return '<button class="tolc-sec" data-sec="' + g.name + '" style="padding:7px 13px;border-radius:20px;border:1px solid ' + col + (open ? '' : '55') + ';background:' + (open ? col : col + '1a') + ';color:' + (open ? '#fff' : col) + ';font-size:.7rem;font-weight:800;letter-spacing:.4px;text-transform:uppercase;cursor:pointer;">' + g.name + ' <span style="opacity:.75;font-weight:700;">' + done + '/' + g.idxs.length + '</span></button>';
  }).join('');
  var numsRow = '';
  groups.forEach(function (g, i) {
    if (g.name !== st.navSec) return;
    var col = PAL[i % PAL.length];
    var nChk = 0, nOk = 0;
    var btns = g.idxs.map(function (gi, k) {
      var cur = gi === st.i, ans = st.answers[gi] !== null;
      var c = col;
      if (st.checked[gi]) { var ok = st.answers[gi] === st.qs[gi].c; c = ok ? '#22c55e' : '#ef4444'; nChk++; if (ok) nOk++; }
      return '<button class="tolc-jump" data-jump="' + gi + '" style="min-width:28px;height:28px;padding:0 5px;border-radius:8px;border:1px solid ' + (cur ? c : (ans ? c + '88' : 'rgba(255,255,255,.14)')) + ';background:' + (cur ? c : (ans ? c + '2e' : 'rgba(255,255,255,.05)')) + ';color:' + (cur ? '#fff' : (ans ? c : 'rgba(255,255,255,.55)')) + ';font-size:.72rem;font-weight:800;cursor:pointer;">' + (k + 1) + '</button>';
    }).join('');
    numsRow = '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;align-items:center;">' + btns +
      '<button class="tolc-checksec" data-sec="' + g.name + '" style="height:28px;padding:0 10px;border-radius:8px;border:1px solid rgba(34,197,94,.45);background:rgba(34,197,94,.10);color:#4ade80;font-size:.68rem;font-weight:800;cursor:pointer;">Verifica sezione ✓</button>' +
      (nChk ? '<span style="font-size:.7rem;font-weight:800;color:' + (nOk === nChk ? '#4ade80' : '#e8e8ee') + ';">' + nOk + '/' + nChk + ' corrette</span>' : '') +
      '</div>';
  });
  var nav = '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + chips + '</div>' + numsRow;
  ov.innerHTML = _shell(
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<span style="font-size:.76rem;font-weight:700;color:#c084fc;text-transform:uppercase;letter-spacing:.5px;">' + st.test.nome + ' · ' + d.s + '</span>' +
      '<span style="font-size:.9rem;font-weight:800;color:#fff;background:rgba(168,85,247,.18);padding:4px 12px;border-radius:20px;">⏱ <span id="tolc-timer">' + _fmt(st.left) + '</span></span>' +
    '</div>' +
    '<div style="margin-bottom:12px;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02);">' + nav + '</div>' +
    '<div style="height:5px;background:rgba(255,255,255,.08);border-radius:4px;margin-bottom:16px;overflow:hidden;"><div style="height:100%;width:' + prog + '%;background:linear-gradient(90deg,#a855f7,#6366f1);"></div></div>' +
    '<div style="font-size:.78rem;color:rgba(255,255,255,.45);margin-bottom:6px;">Domanda ' + (st.i + 1) + ' di ' + st.qs.length + '</div>' +
    '<h3 style="font-size:1.1rem;font-weight:700;line-height:1.4;margin:0 0 16px;">' + _math(d.q) + '</h3>' +
    '<div style="display:flex;flex-direction:column;gap:9px;">' + opts + '</div>' + fb +
    '<div style="display:flex;gap:10px;margin-top:18px;">' +
      '<button id="tolc-skip" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.6);font-weight:700;cursor:pointer;">Salta</button>' +
      (canCheck ? '<button id="tolc-check" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(34,197,94,.5);background:rgba(34,197,94,.12);color:#4ade80;font-weight:800;cursor:pointer;">Verifica ✓</button>' : '') +
      '<button id="tolc-next" style="flex:2;padding:12px;border-radius:12px;border:none;font-weight:800;color:#fff;background:linear-gradient(135deg,#a855f7,#6366f1);cursor:pointer;">' + nextTxt + '</button>' +
    '</div>'
  );
}

function _next() { if (_state.i < _state.qs.length - 1) { _state.i++; _state.navSec = _state.qs[_state.i].s; _renderQ(); } else _finish(); }

function _finish() {
  _clearTimer();
  const st = _state, b = st.qs;
  let correct = 0;
  st.answers.forEach(function (a, i) { if (a !== null && a === b[i].c) correct++; });
  const max = b.length;
  const pct = Math.max(0, Math.round(correct / max * 100));
  const ov = _el('tolc-sim-overlay'); if (!ov) return;
  const emoji = pct >= 60 ? '🎉' : '💪';
  const msg = pct >= 60 ? 'Ottimo ritmo!' : 'Buon inizio — ci si allena cosi.';
  ov.innerHTML = _shell(
    '<div style="text-align:center;">' +
      '<div style="font-size:2.4rem;">' + emoji + '</div>' +
      '<h2 style="font-family:Outfit,sans-serif;font-weight:900;margin:10px 0 6px;font-size:1.8rem;">' + correct + ' / ' + max + '</h2>' +
      '<p style="color:rgba(255,255,255,.7);margin:0 0 6px;font-weight:600;">' + st.test.nome + ' — risposte corrette</p>' +
      '<p style="color:rgba(255,255,255,.5);margin:0 0 22px;font-size:.92rem;">' + msg + '</p>' +
      '<button id="tolc-retry" data-key="' + st.key + '" style="width:100%;padding:14px;border-radius:12px;border:none;font-weight:800;font-size:1rem;color:#fff;background:linear-gradient(135deg,#a855f7,#6366f1);cursor:pointer;">Riprova →</button>' +
      '<button id="tolc-back" style="width:100%;padding:11px;margin-top:9px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.6);font-weight:700;cursor:pointer;">← Altri TOLC</button>' +
    '</div>'
  );
  try { if (window.track) window.track('tolc_sim_complete', { test: st.key, correct: correct, pct: pct }); } catch (e) {}
  try { if (window.addXP) window.addXP(correct * 5); } catch (e) {}
}

document.addEventListener('click', function (e) {
  const ov = _el('tolc-sim-overlay'); if (!ov) return;
  const id = e.target && e.target.id;
  const pick = e.target.closest && e.target.closest('.tolc-pick');
  const opt = e.target.closest && e.target.closest('.tolc-opt');
  const jump = e.target.closest && e.target.closest('.tolc-jump');
  if (jump && _state) { _state.i = parseInt(jump.getAttribute('data-jump'), 10); _state.navSec = _state.qs[_state.i].s; _renderQ(); return; }
  const sec = e.target.closest && e.target.closest('.tolc-sec');
  if (sec && _state) { var sn = sec.getAttribute('data-sec'); _state.navSec = (_state.navSec === sn ? '' : sn); _renderQ(); return; }
  const cs = e.target.closest && e.target.closest('.tolc-checksec');
  if (cs && _state) {
    var nm = cs.getAttribute('data-sec');
    _state.qs.forEach(function (q, gi) { if (q.s === nm && _state.answers[gi] !== null) _state.checked[gi] = true; });
    _renderQ(); return;
  }
  if (id === 'tolc-check') { if (_state && _state.answers[_state.i] !== null) { _state.checked[_state.i] = true; _renderQ(); } return; }
  if (pick) return _intro(pick.getAttribute('data-key'));
  if (id === 'tolc-close') return _remove();
  if (id === 'tolc-back') { ov.innerHTML = _selectorHTML(); return; }
  if (id === 'tolc-start' && !e.target.disabled) return _start(e.target.getAttribute('data-key'));
  if (id === 'tolc-retry') return _start(e.target.getAttribute('data-key'));
  if (id === 'tolc-skip') { if (_state) { if (!_state.checked[_state.i]) _state.answers[_state.i] = null; _next(); } return; }
  if (id === 'tolc-next') return _next();
  if (opt && _state) { if (_state.checked[_state.i]) return; _state.answers[_state.i] = parseInt(opt.getAttribute('data-idx'), 10); _renderQ(); }
});

if (typeof window !== 'undefined') window.openTolcSim = openTolcSim;
