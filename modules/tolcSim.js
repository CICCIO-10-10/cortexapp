/**
 * tolcSim.js — Simulazione TOLC (selettore + strutture ufficiali CISIA)
 *
 * Flusso: openTolcSim() -> SELETTORE (tutti i TOLC) -> INTRO (struttura
 * ufficiale del TOLC scelto) -> SIMULAZIONE a tempo -> RISULTATO (corrette/totale).
 * Strutture e banche in data/tolc.js. Domande ORIGINALI in stile TOLC.
 */

import { TOLC_TESTS, TOLC_ENG_BANCA, tolcTotQ, tolcTotMin } from '../data/tolc.js';
import { track } from '../core/analytics.js';

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
  ov.addEventListener('click', function (e) {
    if (e.target !== ov) return;
    // FIX 25/08: durante una simulazione attiva un clic fuori NON deve chiudere
    // (si perdeva tutto il progresso e "il risultato non veniva ricevuto").
    if (_state && (_state.running || _state.finished)) return;
    _remove();
  });
  track('tolc_sim_open');
}

// Deep-link: apre DRITTO un TOLC specifico sulla prima domanda (salta selettore + intro).
// Usato dai CTA "Simula il TOLC-X" via ?sim=tolc-<codice>: meno attrito = più attivazione.
export function startTolcDirect(key) {
  const t = TOLC_TESTS[key];
  // Codice inesistente o banca non pronta → ripiega sul selettore, niente schermata rotta.
  if (!t || !t.banca || !t.banca.length) { openTolcSim(); return; }
  _remove();
  const ov = document.createElement('div');
  ov.id = 'tolc-sim-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(3,3,6,0.94);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;';
  document.body.appendChild(ov);
  ov.addEventListener('click', function (e) {
    if (e.target !== ov) return;
    if (_state && (_state.running || _state.finished)) return;
    _remove();
  });
  track('tolc_sim_open', { direct: key });
  _start(key);
}

function _selectorHTML() {
  const cards = Object.entries(TOLC_TESTS).map(function (pair) {
    const key = pair[0], t = pair[1];
    const totQ = tolcTotQ(t), nSez = t.sezioni.length;
    // Quesiti REALMENTE disponibili nella banca (evita di promettere piu' domande
    // di quante ne servira' la simulazione). Auto-cresce quando aggiungi domande.
    const _bc = {}; (t.banca || []).forEach(function (q) { _bc[q.s] = (_bc[q.s] || 0) + 1; });
    const _realQ = t.sezioni.reduce(function (a, s) { var av = _bc[s.n] || 0; return a + (s.q != null ? (av > 0 ? Math.min(s.q, av) : s.q) : av); }, 0);
    const _showQ = (t.banca && t.banca.length) ? _realQ : totQ;
    const ready = (t.banca && t.banca.length > 0);
    const badge = ready ? ' <span style="font-size:.62rem;color:#86efac;background:rgba(34,197,94,.15);padding:1px 6px;border-radius:10px;vertical-align:middle;">provabile</span>' : '';
    return '<button class="tolc-pick" data-key="' + key + '" style="text-align:left;padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#e8e8ee;cursor:pointer;display:flex;flex-direction:column;gap:3px;">' +
      '<div style="font-weight:800;font-size:.98rem;">' + t.emoji + ' ' + t.nome + badge + '</div>' +
      '<div style="font-size:.76rem;color:rgba(255,255,255,.5);line-height:1.3;">' + t.area + '</div>' +
      '<div style="font-size:.72rem;color:rgba(255,255,255,.4);">' + nSez + ' sezioni' + (_showQ ? ' · ' + _showQ + ' quesiti' : '') + ' + Inglese</div>' +
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
  // Conteggio reale dei quesiti per sezione dalla banca: per i TOLC le cui
  // sezioni non hanno il numero ufficiale (q:null), la simulazione serve tutta
  // la banca di quella sezione, quindi questo e' il numero effettivo di quesiti.
  var _cnt = {};
  (t.banca || []).forEach(function (q) { _cnt[q.s] = (_cnt[q.s] || 0) + 1; });
  // Mostra la colonna Tempo solo se il test ha tempi per sezione (evita muri di "—").
  var hasTime = t.sezioni.some(function (s) { return s.min != null; });
  // Inglese realmente servito = min tra numero ufficiale e domande in banca.
  var realEng = Math.min(t.engQ || TOLC_ENG_BANCA.length, TOLC_ENG_BANCA.length);
  var shownTotQ = 0;
  const rows = t.sezioni.map(function (s) {
    var nq = (s.q != null ? ((_cnt[s.n] || 0) > 0 ? Math.min(s.q, _cnt[s.n]) : s.q) : (_cnt[s.n] || null));
    if (nq) shownTotQ += nq;
    return '<tr>' +
      '<td style="padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06);">' + s.n + '</td>' +
      '<td style="padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06);text-align:right;color:rgba(255,255,255,.7);">' + (nq != null ? nq : '—') + '</td>' +
      (hasTime ? '<td style="padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06);text-align:right;color:rgba(255,255,255,.7);">' + (s.min != null ? s.min + "'" : '—') + '</td>' : '') +
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
        '<th style="text-align:left;padding:4px;">Sezione</th><th style="text-align:right;padding:4px;">Quesiti</th>' + (hasTime ? '<th style="text-align:right;padding:4px;">Tempo</th>' : '') +
      '</tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr style="font-weight:800;">' +
        '<td style="padding:8px 4px;">Totale + Inglese</td>' +
        '<td style="padding:8px 4px;text-align:right;">' + ((shownTotQ || t.totQ) || '—') + ' + ' + realEng + '</td>' +
        (hasTime ? '<td style="padding:8px 4px;text-align:right;">' + (totMin ? totMin + "'" : '—') + ' + ' + t.engMin + "'</td>" : '') +
      '</tr></tfoot>' +
    '</table>' +
    (warn ? '<p style="font-size:.72rem;color:rgba(255,255,255,.4);margin:0 0 16px;line-height:1.5;">' + warn + '</p>' : '') +
    '<p style="font-size:.68rem;color:rgba(255,255,255,.4);line-height:1.5;margin:0 0 14px;">Punteggio CISIA: +1 corretta, -0,25 errata, 0 non data (Inglese senza penalita’, a parte). Le regole di ammissione (soglie/OFA) variano per ateneo.</p>' +
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
  _state = { key: key, test: t, qs: qs, i: 0, answers: new Array(qs.length).fill(null), checked: new Array(qs.length).fill(false), left: secs, running: true };
  _renderQ();
  track('tolc_test_start', { test: key });   // avvio REALE della prova (1a domanda mostrata), distinto da tolc_sim_open (= apertura selettore)
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
    '<h3 class="selectable-text" style="font-size:1.1rem;font-weight:700;line-height:1.4;margin:0 0 16px;">' + _math(d.q) + '</h3>' +
    '<div style="display:flex;flex-direction:column;gap:9px;">' + opts + '</div>' + fb +
    '<div style="display:flex;gap:10px;margin-top:18px;">' +
      '<button id="tolc-skip" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.6);font-weight:700;cursor:pointer;">Salta</button>' +
      (canCheck ? '<button id="tolc-check" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(34,197,94,.5);background:rgba(34,197,94,.12);color:#4ade80;font-weight:800;cursor:pointer;">Verifica ✓</button>' : '') +
      '<button id="tolc-next" style="flex:2;padding:12px;border-radius:12px;border:none;font-weight:800;color:#fff;background:linear-gradient(135deg,#a855f7,#6366f1);cursor:pointer;">' + nextTxt + '</button>' +
    '</div>'
  );
}

function _next() { if (_state.i < _state.qs.length - 1) { _state.i++; _state.navSec = _state.qs[_state.i].s; _renderQ(); } else _confirmFinish(); }

function _confirmFinish() {
  // Conferma prima di consegnare: evita che, skippando veloce, il test si
  // "consegni" da solo e l'utente sbatta sul risultato senza vederlo.
  const st = _state; if (!st) return;
  const answered = st.answers.filter(function (a) { return a !== null; }).length;
  const tot = st.qs.length;
  const ov = _el('tolc-sim-overlay'); if (!ov) return;
  ov.innerHTML = _shell(
    '<div style="text-align:center;">' +
      '<div style="font-size:2.2rem;">\uD83D\uDCDD</div>' +
      '<h2 style="font-family:Outfit,sans-serif;font-weight:900;margin:10px 0 6px;font-size:1.5rem;">Consegni il test?</h2>' +
      '<p style="color:rgba(255,255,255,.72);margin:0 0 4px;font-weight:600;">Hai risposto a ' + answered + ' su ' + tot + ' domande.</p>' +
      '<p style="color:rgba(255,255,255,.5);margin:0 0 22px;font-size:.9rem;">Dopo la consegna vedi subito il tuo risultato. Le domande senza risposta contano come sbagliate.</p>' +
      '<button id="tolc-consegna" style="width:100%;padding:14px;border-radius:12px;border:none;font-weight:800;font-size:1rem;color:#fff;background:linear-gradient(135deg,#a855f7,#6366f1);cursor:pointer;">\u2713 Consegna e vedi il risultato</button>' +
      '<button id="tolc-annulla-consegna" style="width:100%;padding:11px;margin-top:9px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.6);font-weight:700;cursor:pointer;">\u2190 Torna al test</button>' +
    '</div>'
  );
}

// ── Punteggio ufficiale CISIA: +1 corretta, -0,25 errata, 0 non data; sezione
// Inglese senza penalita' e a parte. Il singolo ateneo puo' usare regole di
// graduatoria diverse (es. solo corrette / nessuna penalita', come Messina).
function _sectionStats(st) {
  var order = [], by = {};
  st.qs.forEach(function (q, i) {
    if (!by[q.s]) { by[q.s] = { name: q.s, n: 0, ok: 0, wrong: 0, blank: 0 }; order.push(q.s); }
    var g = by[q.s]; g.n++;
    var a = st.answers[i];
    if (a === null || a === undefined) g.blank++;
    else if (a === q.c) g.ok++;
    else g.wrong++;
  });
  return order.map(function (n) { return by[n]; });
}
function _fmtScore(v) {
  var r = Math.round(v * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(2).replace(/0$/, '');
}
function _secScore(g, mode) {
  if (g.name === 'Inglese') return g.ok;          // inglese: mai penalita'
  var pen = (mode === 'nopen') ? 0 : 0.25;
  return g.ok - g.wrong * pen;
}

function _finish() {
  _clearTimer();
  const st = _state; if (!st || !st.qs) return;   // guard anti-crash
  st.running = false; st.finished = true;
  if (!st.scoreMode) st.scoreMode = 'cisia';
  var correct = _sectionStats(st).reduce(function (a, g) { return a + g.ok; }, 0);
  var pct = Math.max(0, Math.round(correct / (st.qs.length || 1) * 100));
  track('tolc_sim_complete', { test: st.key, correct: correct, pct: pct });
  try { if (window.addXP) window.addXP(correct * 5); } catch (e) {}
  _renderResult();
}

function _renderResult() {
  const st = _state; if (!st) return;
  const ov = _el('tolc-sim-overlay'); if (!ov) return;
  const mode = st.scoreMode || 'cisia';
  var stats = _sectionStats(st);
  var base = stats.filter(function (g) { return g.name !== 'Inglese'; });
  var eng = stats.filter(function (g) { return g.name === 'Inglese'; })[0];
  var totScore = base.reduce(function (a, g) { return a + _secScore(g, mode); }, 0);
  var totQ = base.reduce(function (a, g) { return a + g.n; }, 0);
  var correct = stats.reduce(function (a, g) { return a + g.ok; }, 0);
  var pct = Math.max(0, Math.round(correct / (st.qs.length || 1) * 100));
  var emoji = pct >= 60 ? '🎉' : '💪';
  var th = 'padding:8px 6px;font-size:.62rem;text-transform:uppercase;letter-spacing:.4px;color:#c084fc;font-weight:800;';
  var td = 'padding:9px 6px;border-top:1px solid rgba(255,255,255,.07);font-size:.85rem;';
  var rows = base.map(function (g) {
    return '<tr>' +
      '<td style="' + td + 'text-align:left;font-weight:700;">' + g.name + '</td>' +
      '<td style="' + td + 'text-align:center;color:rgba(255,255,255,.65);">' + g.n + '</td>' +
      '<td style="' + td + 'text-align:center;color:#4ade80;font-weight:700;">' + g.ok + '</td>' +
      '<td style="' + td + 'text-align:center;color:rgba(255,255,255,.55);">' + g.blank + '</td>' +
      '<td style="' + td + 'text-align:center;color:#f87171;font-weight:700;">' + g.wrong + '</td>' +
      '<td style="' + td + 'text-align:right;font-weight:800;">' + _fmtScore(_secScore(g, mode)) + '</td>' +
    '</tr>';
  }).join('');
  var mbtn = function (m, label) {
    var on = mode === m;
    return '<button class="tolc-mode" data-mode="' + m + '" style="flex:1;padding:9px;border-radius:10px;border:1px solid ' + (on ? '#a855f7' : 'rgba(255,255,255,.15)') + ';background:' + (on ? 'rgba(168,85,247,.18)' : 'transparent') + ';color:' + (on ? '#fff' : 'rgba(255,255,255,.6)') + ';font-weight:800;font-size:.74rem;cursor:pointer;">' + label + '</button>';
  };
  var note = (mode === 'cisia')
    ? 'Regola CISIA: +1 corretta, -0,25 errata, 0 non data. Inglese senza penalita’, punteggio a parte.'
    : 'Modalita’ "solo corrette": nessuna penalita’ sulle errate (usata in graduatoria da alcuni atenei, es. Messina).';
  var TB = 'border-top:2px solid rgba(255,255,255,.18);';
  ov.innerHTML = _shell(
    '<div style="position:relative;height:0;">' +
      '<button id="tolc-close" title="Chiudi" style="position:absolute;top:-10px;right:-8px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#e8e8ee;font-size:1.05rem;font-weight:800;line-height:1;cursor:pointer;">\u2715</button>' +
    '</div>' +
    '<div style="text-align:center;margin-bottom:12px;">' +
      '<div style="font-size:1.9rem;">' + emoji + '</div>' +
      '<h2 style="font-family:Outfit,sans-serif;font-weight:900;margin:6px 0 2px;font-size:1.5rem;">Esito ' + st.test.nome + '</h2>' +
      '<p style="color:rgba(255,255,255,.6);margin:0;font-size:.86rem;">Punteggio totale test: <b style="color:#fff;">' + _fmtScore(totScore) + '</b> / ' + totQ + (eng ? '  ·  Inglese: <b style="color:#fff;">' + _fmtScore(_secScore(eng, mode)) + '</b> / ' + eng.n : '') + '</p>' +
    '</div>' +
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
      '<span style="font-size:.66rem;color:rgba(255,255,255,.45);font-weight:800;">MODALITA’</span>' + mbtn('cisia', 'CISIA standard (-0,25)') + mbtn('nopen', 'Senza penalita’') +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin:4px 0;">' +
      '<thead><tr>' +
        '<th style="' + th + 'text-align:left;">Sezione</th>' +
        '<th style="' + th + 'text-align:center;">Quesiti</th>' +
        '<th style="' + th + 'text-align:center;">Esatte</th>' +
        '<th style="' + th + 'text-align:center;">Non date</th>' +
        '<th style="' + th + 'text-align:center;">Sbagliate</th>' +
        '<th style="' + th + 'text-align:right;">Punteggio</th>' +
      '</tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot>' +
        '<tr style="font-weight:900;">' +
          '<td style="' + td + TB + 'text-align:left;">Punteggio totale test</td>' +
          '<td style="' + td + TB + 'text-align:center;">' + totQ + '</td>' +
          '<td colspan="3" style="' + td + TB + '"></td>' +
          '<td style="' + td + TB + 'text-align:right;color:#c084fc;">' + _fmtScore(totScore) + '</td>' +
        '</tr>' +
        (eng ? '<tr style="font-weight:800;">' +
          '<td style="' + td + 'text-align:left;">Inglese <span style="font-weight:600;color:rgba(255,255,255,.45);">(a parte)</span></td>' +
          '<td style="' + td + 'text-align:center;">' + eng.n + '</td>' +
          '<td style="' + td + 'text-align:center;color:#4ade80;">' + eng.ok + '</td>' +
          '<td style="' + td + 'text-align:center;color:rgba(255,255,255,.55);">' + eng.blank + '</td>' +
          '<td style="' + td + 'text-align:center;color:#f87171;">' + eng.wrong + '</td>' +
          '<td style="' + td + 'text-align:right;color:#c084fc;">' + _fmtScore(_secScore(eng, mode)) + '</td>' +
        '</tr>' : '') +
      '</tfoot>' +
    '</table>' +
    '<p style="font-size:.66rem;color:rgba(255,255,255,.4);line-height:1.55;margin:8px 0 14px;">' + note +
      ' Le regole di ammissione (soglie, OFA, uso dell’inglese, penalita’ in graduatoria) <b>variano per ateneo</b>: fa fede il bando. Fonte: CISIA.' +
    '</p>' +
    '<div style="text-align:center;font-size:.82rem;color:#cbc6e8;margin:2px 0 10px;line-height:1.5;">📈 <b style="color:#fff;">Crea un account gratis</b> per salvare i progressi, sbloccare tutti i 10 TOLC e vedere se <b style="color:#fff;">migliori</b> nel tempo.</div>' +
    '<button id="tolc-enter" style="width:100%;padding:15px;border-radius:12px;border:none;font-weight:800;font-size:1rem;color:#fff;background:linear-gradient(135deg,#a855f7,#6366f1);cursor:pointer;">Salva i progressi su Cortex →</button>' +
    '<button id="tolc-gen-errors" style="width:100%;padding:14px;margin-top:9px;border-radius:12px;border:1px solid rgba(34,197,94,.5);background:rgba(34,197,94,.14);color:#4ade80;font-weight:800;font-size:.98rem;cursor:pointer;">🎯 Genera flashcard sui tuoi errori</button>' +
    '<button id="tolc-share" style="width:100%;padding:14px;margin-top:9px;border-radius:12px;border:1px solid rgba(56,189,248,.5);background:rgba(56,189,248,.14);color:#38bdf8;font-weight:800;font-size:.98rem;cursor:pointer;">📤 Condividi il punteggio</button>' +
    '<div style="display:flex;gap:9px;margin-top:9px;">' +
      '<button id="tolc-retry" data-key="' + st.key + '" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(168,85,247,.5);background:rgba(168,85,247,.12);color:#c084fc;font-weight:800;cursor:pointer;">↻ Riprova</button>' +
      '<button id="tolc-back" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.6);font-weight:700;cursor:pointer;">← Altri TOLC</button>' +
    '</div>'
  );
}

function _ensureH2C(cb) {
  if (window.html2canvas) { cb(window.html2canvas); return; }
  var sc = document.createElement('script');
  sc.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  sc.onload = function () { cb(window.html2canvas || null); };
  sc.onerror = function () { cb(null); };
  document.head.appendChild(sc);
}

function _shareTolc() {
  var ov = _el('tolc-sim-overlay'); if (!ov) return;
  var st2 = _state; if (!st2) return;
  var card = ov.firstElementChild; if (!card) return;
  try { track('tolc_share_click', { test: st2.key }); } catch (e) {}
  if (window.showToast) window.showToast('Preparo l\'immagine\u2026', 'info');
  var hide = card.querySelectorAll('#tolc-close, #tolc-enter, #tolc-gen-errors, #tolc-share, #tolc-retry, #tolc-back, .tolc-mode');
  var prev = [];
  hide.forEach(function (el, i) { prev[i] = el.style.display; el.style.display = 'none'; });
  var restore = function () { hide.forEach(function (el, i) { el.style.display = prev[i] || ''; }); };
  _ensureH2C(function (h2c) {
    if (!h2c) { restore(); if (window.showToast) window.showToast('Condivisione non disponibile ora, riprova.', 'error'); return; }
    h2c(card, { backgroundColor: '#101016', scale: 2, useCORS: true, logging: false }).then(function (canvas) {
      restore();
      var ref = ''; try { if (window._fbUserId) ref = '&ref=' + String(window._fbUserId).slice(0, 8); } catch (e) {}
      var url = 'https://cortexapp.it/simulazione-tolc?utm_source=share&utm_medium=student' + ref;
      var stats = _sectionStats(st2), correct = stats.reduce(function (a, g) { return a + g.ok; }, 0), totQ = st2.qs.length;
      var testName = (st2.test && st2.test.nome) ? st2.test.nome : 'TOLC';
      var text = 'Ho fatto ' + correct + '/' + totQ + ' al ' + testName + ' su Cortex! Provala anche tu \uD83D\uDC47';
      canvas.toBlob(function (blob) {
        if (!blob) return;
        try {
          var file = new File([blob], 'cortex-tolc.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], text: text, url: url }).catch(function () {}); return; }
        } catch (e) {}
        try { if (navigator.share) { navigator.share({ title: 'Cortex TOLC', text: text + ' ' + url }).catch(function () {}); return; } } catch (e) {}
        try {
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cortex-tolc.png';
          document.body.appendChild(a); a.click(); a.remove();
          if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).catch(function () {});
          if (window.showToast) window.showToast('Immagine scaricata e link copiato! \uD83D\uDCE4', 'success');
        } catch (e) {}
      }, 'image/png');
    }).catch(function () { restore(); if (window.showToast) window.showToast('Non riesco a catturare l\'immagine, riprova.', 'error'); });
  });
}

document.addEventListener('click', function (e) {
  const ov = _el('tolc-sim-overlay'); if (!ov) return;
  const id = (e.target && e.target.id) || (e.target && e.target.closest && e.target.closest('button') && e.target.closest('button').id) || '';
  const pick = e.target.closest && e.target.closest('.tolc-pick');
  const opt = e.target.closest && e.target.closest('.tolc-opt');
  const jump = e.target.closest && e.target.closest('.tolc-jump');
  const md = e.target.closest && e.target.closest('.tolc-mode');
  if (md && _state) { _state.scoreMode = md.getAttribute('data-mode'); _renderResult(); return; }
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
  if (id === 'tolc-enter') {
    try { track('tolc_sim_enter_cortex'); } catch (e) {}
    // CATTURA VERA: converti l'ospite in account (login Google), cosi' i progressi si salvano davvero.
    try { localStorage.setItem('cortex_sim','tolc'); } catch(e){}
    if (typeof window.__guestLogin === 'function') { window.__guestLogin(); return; }
    if (typeof window.loginWithGoogle === 'function') { window.loginWithGoogle(); return; }
    location.href = '/app?sim=tolc&utm_source=tolcsim&utm_medium=result&utm_content=salva_progressi';
    return;
  }
  if (id === 'tolc-gen-errors') {
    var st2 = _state; if (!st2) return;
    var lines = [];
    (st2.qs || []).forEach(function (q, i) {
      var a = st2.answers ? st2.answers[i] : null;
      if (a !== null && a !== undefined && a !== q.c) {
        var corr = (q.o && q.o[q.c] != null) ? q.o[q.c] : String.fromCharCode(65 + q.c);
        lines.push('[' + (q.s || '') + '] ' + String(q.q || '').replace(/\s+/g, ' ').slice(0, 280) + '\nRisposta corretta: ' + String(corr).slice(0, 160));
      }
    });
    try { track('tolc_errors_generate_click', { n: lines.length }); } catch (e) {}
    if (!lines.length) { if (window.showToast) window.showToast('Nessun errore da ripassare — ottimo! \uD83C\uDF89', 'success'); return; }
    var notes = 'Argomenti che ho SBAGLIATO nella simulazione ' + ((st2.test && st2.test.nome) ? st2.test.nome : 'TOLC') + '. Crea flashcard di ripasso mirate su questi concetti:\n\n' + lines.join('\n\n');
    try { localStorage.setItem('cortex_pending_ai', JSON.stringify({ text: notes, instructions: 'Flashcard di ripasso sugli errori della simulazione TOLC: spiega il concetto corretto, non solo la lettera della risposta.', ts: Date.now() })); } catch (e) {}
    _remove();
    if (window._fbLoggedIn) {
      if (window.__resumePendingAI) { window.__resumePendingAI(); return; }
      location.href = '/app'; return;
    }
    try { localStorage.setItem('cortex_sim', 'tolc'); } catch (e) {}
    if (typeof window.__guestLogin === 'function') { window.__guestLogin(); return; }
    if (typeof window.loginWithGoogle === 'function') { window.loginWithGoogle(); return; }
    location.href = '/app?utm_source=tolcsim&utm_medium=result&utm_content=genera_errori';
    return;
  }
  if (id === 'tolc-share') { _shareTolc(); return; }
  if (id === 'tolc-back') { _clearTimer(); _state = null; ov.innerHTML = _selectorHTML(); return; }
  if (id === 'tolc-start' && !e.target.disabled) return _start(e.target.getAttribute('data-key'));
  if (id === 'tolc-retry') return _start(e.target.getAttribute('data-key'));
  if (id === 'tolc-skip') { if (_state) { if (!_state.checked[_state.i]) _state.answers[_state.i] = null; _next(); } return; }
  if (id === 'tolc-consegna') return _finish();
  if (id === 'tolc-annulla-consegna') { if (_state) _renderQ(); return; }
  if (id === 'tolc-next') return _next();
  if (opt && _state) { if (_state.checked[_state.i]) return; _state.answers[_state.i] = parseInt(opt.getAttribute('data-idx'), 10); if (!_state._firstAns) { _state._firstAns = true; track('tolc_first_answer', { test: _state.key }); } _renderQ(); }
});

if (typeof window !== 'undefined') { window.openTolcSim = openTolcSim; window.startTolcDirect = startTolcDirect; }
