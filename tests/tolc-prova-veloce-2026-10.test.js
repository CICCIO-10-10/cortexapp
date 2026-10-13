// Test 07/10/2026: prova veloce TOLC (10 domande). Logica reale del modulo, nessun servizio esterno.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { TOLC_TESTS, TOLC_ENG_BANCA, tolcTotQ, tolcTotMin } from '../data/tolc.js';

const src = fs.readFileSync(new URL('../modules/tolcSim.js', import.meta.url), 'utf8');
const between = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));

// Carica _shuffle, _quickPlan, _sample, _secsFor, _quickMinutes dal sorgente vero.
function loadSampler() {
  const code = between('function _shuffle(a)', 'function _start(key, quick)');
  const ctx = vm.createContext({ TOLC_ENG_BANCA, tolcTotQ, tolcTotMin, Math });
  vm.runInContext(code + '\nthis.api={_quickPlan,_sample,_secsFor,_quickMinutes};', ctx);
  return ctx.api;
}

describe('prova veloce — scelta delle domande', () => {
  const api = loadSampler();

  it('ogni TOLC provabile: 8 domande delle sezioni + 2 di Inglese, nessun doppione', () => {
    for (const [key, t] of Object.entries(TOLC_TESTS)) {
      if (!t.banca || !t.banca.length) continue;
      for (let run = 0; run < 20; run++) {
        const smp = api._sample(t, true);
        expect(smp.nBase, key).toBe(Math.min(8, smp.fullBase));
        expect(smp.nEng, key).toBe(2);
        expect(smp.qs.length, key).toBe(smp.nBase + 2);
        expect(new Set(smp.qs.map(q => q.q + '|' + q.o.slice().sort().join('|'))).size, key).toBe(smp.qs.length);
        // le ultime 2 sono di Inglese, le altre della banca del TOLC (stesso testo; opzioni mescolate)
        smp.qs.slice(-2).forEach(q => expect(TOLC_ENG_BANCA.map(x => x.q)).toContain(q.q));
        smp.qs.slice(0, -2).forEach(q => expect(t.banca.map(x => x.q)).toContain(q.q));
      }
    }
  });

  it('copre tutte le sezioni quando sono al massimo 8 (es. TOLC-E: 3/2/3)', () => {
    expect(api._quickPlan([13, 10, 13], 8)).toEqual([3, 2, 3]);
    expect(api._quickPlan([20, 15, 5, 5, 5, 5], 8)).toEqual([2, 2, 1, 1, 1, 1]);
    expect(api._quickPlan([5, 3, 5, 4, 5], 8).every(n => n >= 1)).toBe(true);
    expect(api._quickPlan([2, 1], 8)).toEqual([2, 1]);          // banca piccola: non inventa domande
    for (const t of Object.values(TOLC_TESTS)) {
      if (!t.banca || !t.banca.length) continue;
      const smp = api._sample(t, true);
      const secs = new Set(smp.qs.slice(0, -2).map(q => q.s));
      expect(secs.size).toBe(t.sezioni.filter(s => t.banca.some(q => q.s === s.n)).length);
    }
  });

  it('il test completo non cambia: stesse quantità di prima', () => {
    const t = TOLC_TESTS['tolc-e'];
    const smp = api._sample(t, false);
    expect(smp.nBase).toBe(36);
    expect(smp.nEng).toBe(Math.min(t.engQ, TOLC_ENG_BANCA.length));
    // tempo uguale alla formula precedente (90' per 36 domande + 15' per 30 di inglese, in proporzione)
    const old = Math.max(180, Math.round(90 * 60 * 36 / 36) + Math.round(15 * 60 * smp.nEng / 30));
    expect(api._secsFor(t, smp)).toBe(old);
  });

  it('tempo della prova veloce: stesso tempo per domanda del test ufficiale', () => {
    const t = TOLC_TESTS['tolc-e'];
    const smp = api._sample(t, true);
    expect(api._secsFor(t, smp)).toBe(Math.round(150 * 8 + 30 * 2));   // 21 minuti
    expect(api._quickMinutes(t)).toBe(20);
  });
});

describe('tempo dei TOLC senza tempi ufficiali per sezione', () => {
  const api = loadSampler();
  it('senza minuti per sezione: 1,5 minuti a domanda servita (non diviso per i quesiti ufficiali)', () => {
    const t = { sezioni: [{ n: 'A', q: null, min: null }], totQ: 50, engQ: 30, engMin: 15,
      banca: Array.from({ length: 22 }, (_, i) => ({ s: 'A', q: 'q' + i, o: ['1', '2', '3', '4', '5'], c: 0 })) };
    const full = api._sample(t, false);
    expect(api._secsFor(t, full)).toBe(22 * 90 + full.nEng * 30);
  });
  it('TOLC-PSI ora ha i tempi ufficiali CISIA (100 minuti per 50 quesiti)', () => {
    const t = TOLC_TESTS['tolc-psi'];
    expect(tolcTotMin(t)).toBe(100);
    expect(tolcTotQ(t)).toBe(50);
    const quick = api._sample(t, true);
    expect(api._secsFor(t, quick)).toBe(8 * 120 + 2 * 30);
  });
});

describe('prova veloce — pulsanti, risultato, link e misure', () => {
  it('intro (13/10): "Prova veloce" in evidenza sopra il test completo, solo se la banca è pronta', () => {
    const intro = between('function _intro(key, refresh)', 'function _shuffle(a)');
    expect(intro.indexOf('id="tolc-start-quick"')).toBeLessThan(intro.indexOf('id="tolc-start"'));
    expect(intro).toContain("(ready ? '<button id=\"tolc-start-quick\"");
    expect(intro).toContain('⚡ Prova veloce →<span');
    expect(intro).toContain("10 domande · circa ' + _quickMinutes(t) + ' minuti");
  });
  it('click: veloce, completo dopo la veloce, "Riprova" nella stessa modalità', () => {
    expect(src).toContain("if (id === 'tolc-start-quick') return _start(e.target.getAttribute('data-key'), true);");
    expect(src).toContain("if (id === 'tolc-full-after-quick') return _start(e.target.getAttribute('data-key'));");
    expect(src).toContain("if (id === 'tolc-retry') return _start(e.target.getAttribute('data-key'), _state && _state.quick);");
  });
  it('risultato: titolo "prova veloce", invito al test completo, stesso "Ripassa i tuoi errori"', () => {
    const res = between('function _renderResult()', 'function _askBeforeExit');
    expect(res).toContain("(st.quick ? ' · prova veloce' : '')");
    expect(res).toContain('id="tolc-full-after-quick"');
    expect(res).toContain("'Ripassa i tuoi ' + nWrong + ' errori'");
  });
  it('link diretto ?sim=tolc-x&veloce=1 apre la prova veloce', () => {
    const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    expect(main).toContain("const tolcQuick = params.get('veloce') === '1';");
    expect(main).toContain('window.startTolcDirect(tolcCode, { quick: tolcQuick });');
  });
  it('misure: mode quick/full sugli eventi e nuovi eventi contati dalla dashboard', () => {
    expect(src).toContain("mode: quick ? 'quick' : 'full' });");
    expect(src).toContain("track('tolc_quick_start'");
    expect(src).toContain("track('tolc_quick_complete'");
    const js = fs.readFileSync(new URL('../functions/journey-summary.cjs', import.meta.url), 'utf8');
    expect(js).toContain("'tolc_quick_start', 'tolc_quick_complete', 'tolc_returned', 'tolc_reminder_click'];");
  });
});

describe('risposte mescolate a ogni prova (07/10/2026)', () => {
  const api = loadSampler();
  const all = [...Object.values(TOLC_TESTS).flatMap(t => t.banca || []), ...TOLC_ENG_BANCA];
  const keyOf = q => q.q + '|' + q.o.slice().sort().join('|');   // alcuni testi si ripetono con opzioni diverse
  const byKey = new Map(all.map(q => [keyOf(q), q]));

  it('la risposta giusta resta la stessa (stesso testo), cambia solo la posizione', () => {
    for (const t of Object.values(TOLC_TESTS)) {
      if (!t.banca || !t.banca.length) continue;
      for (const q of api._sample(t, false).qs) {
        const orig = byKey.get(keyOf(q));
        expect(orig).toBeTruthy();
        expect(q.o[q.c]).toBe(orig.o[orig.c]);
      }
    }
  });
  it('la banca originale non viene toccata', () => {
    const t = TOLC_TESTS['tolc-e'];
    const before = JSON.stringify(t.banca);
    for (let i = 0; i < 10; i++) api._sample(t, false);
    expect(JSON.stringify(t.banca)).toBe(before);
  });
  it('posizioni della risposta giusta distribuite (nessuna lettera sopra il 30% su 2000 domande)', () => {
    const count = [0, 0, 0, 0, 0]; let n = 0;
    for (let i = 0; i < 60; i++) for (const t of Object.values(TOLC_TESTS)) {
      if (!t.banca || !t.banca.length) continue;
      for (const q of api._sample(t, false).qs) { if (q.o.length === 5) { count[q.c]++; n++; } }
    }
    expect(n).toBeGreaterThan(2000);
    count.forEach(c => expect(c / n).toBeLessThan(0.30));
  });
  it('"Nessuna (delle precedenti)" resta l\'ultima opzione', () => {
    const pinned = all.filter(q => /^\s*nessun|precedent/i.test(String(q.o[q.o.length - 1])));
    expect(pinned.length).toBeGreaterThan(5);
    const ctx = vm.createContext({ TOLC_ENG_BANCA, tolcTotQ, tolcTotMin, Math });
    vm.runInContext(between('function _shuffle(a)', 'function _start(key, quick)') + '\nthis.f=_shuffleOpts;', ctx);
    for (const q of pinned) for (let i = 0; i < 20; i++) {
      const s = ctx.f(q);
      expect(s.o[s.o.length - 1]).toBe(q.o[q.o.length - 1]);
      expect(s.o[s.c]).toBe(q.o[q.c]);
    }
  });
});

describe('link diretti ?sim=tolc-x: prima la scelta (08/10/2026)', () => {
  const direct = between('export function startTolcDirect(key, opts)', 'function _selectorHTML()');
  it('senza &veloce=1 mostra la scheda del TOLC con test completo e prova veloce (non parte più il test di 2 ore)', () => {
    expect(direct).toContain('if (quick) { _start(key, true); return; }');
    expect(direct).toContain('_intro(key);');
    expect(direct).not.toMatch(/_start\(key, quick\);\s*\}/);
    expect(direct).toContain("mode: quick ? 'quick' : 'choice'");
  });
  it('il pulsante del test completo dice quanto dura', () => {
    const intro = between('function _intro(key, refresh)', 'function _shuffle(a)');
    expect(intro).toContain("'Test completo<span");
    expect(intro).toContain("_durata(totMin + (t.engMin || 0))");
    const ctx = vm.createContext({});
    vm.runInContext(between('function _durata(min)', 'function _intro(key, refresh)') + '\nthis.d=_durata;', ctx);
    expect(ctx.d(115)).toBe('1 h 55 min');
    expect(ctx.d(105)).toBe('1 h 45 min');
    expect(ctx.d(120)).toBe('2 h');
    expect(ctx.d(45)).toBe('45 min');
  });
});

describe('promemoria nel calendario dal risultato (08/10/2026)', () => {
  it('link Google Calendar e file .ics per riprovare la prova veloce tra 3 giorni, con misura', () => {
    const res = between('function _renderResult()', 'function _askBeforeExit');
    expect(res).toContain('_reminderHTML(st)');
    const h = between('function _reminderData(st)', 'function _askBeforeExit');
    expect(h).toContain('d.setDate(d.getDate() + 3); d.setHours(17, 0, 0, 0);');
    expect(h).toContain("&veloce=1&utm_source=promemoria&utm_medium=calendario");
    expect(h).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
    expect(h).toContain("'BEGIN:VCALENDAR'");
    expect(src).toContain("track('tolc_reminder_click', { test: _state.key, how: 'ics'");
    expect(src).toContain("track('tolc_reminder_click', { test: _state.key, how: 'google'");
  });
});
