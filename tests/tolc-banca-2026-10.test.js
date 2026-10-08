// Test 07/10/2026: banche TOLC ampliate (875 domande nuove), strutture ufficiali CISIA,
// banche condivise di TOLC-LP e TOLC-AV, caricamento a parte delle domande nuove.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { TOLC_TESTS, TOLC_ENG_BANCA, tolcTotQ, tolcTotMin, mergeTolcNuove } from '../data/tolc.js';
import * as nuove from '../data/tolc_banca_2026_10.js';

const before = Object.fromEntries(Object.entries(TOLC_TESTS).map(([k, t]) => [k, t.banca.length]));
const engBefore = TOLC_ENG_BANCA.length;
mergeTolcNuove(nuove);
mergeTolcNuove(nuove);   // una seconda volta non deve raddoppiare

// Struttura ufficiale 2025/26 (cisiaonline.it/tolc/<x>/struttura-della-prova-e-sillabo, letta il 07/10/2026)
const UFFICIALE = {
  'tolc-i': [50, 110], 'tolc-e': [36, 90], 'tolc-f': [50, 72], 'tolc-b': [50, 110], 'tolc-s': [55, 120],
  'tolc-su': [50, 100], 'tolc-psi': [50, 100], 'tolc-sps': [40, 90], 'tolc-lp': [30, 90], 'tolc-av': [50, 100],
};

const src = fs.readFileSync(new URL('../modules/tolcSim.js', import.meta.url), 'utf8');
function sampler() {
  const code = src.slice(src.indexOf('function _shuffle(a)'), src.indexOf('function _start(key, quick)'));
  const ctx = vm.createContext({ TOLC_ENG_BANCA, tolcTotQ, tolcTotMin, Math });
  vm.runInContext(code + '\nthis.api={_sample,_secsFor};', ctx);
  return ctx.api;
}

describe('strutture ufficiali CISIA', () => {
  it('quesiti e minuti totali come da CISIA per tutti i 10 TOLC, inglese 30 quesiti / 15 minuti', () => {
    for (const [k, [q, min]] of Object.entries(UFFICIALE)) {
      const t = TOLC_TESTS[k];
      expect(tolcTotQ(t), k).toBe(q);
      expect(tolcTotMin(t), k).toBe(min);
      expect(t.engQ, k).toBe(30);
      expect(t.engMin, k).toBe(15);
      t.sezioni.forEach(s => { expect(s.q, k + ' ' + s.n).toBeGreaterThan(0); expect(s.min, k + ' ' + s.n).toBeGreaterThan(0); });
    }
  });
  it('TOLC-LP e TOLC-AV con le sezioni ufficiali', () => {
    expect(TOLC_TESTS['tolc-lp'].sezioni.map(s => s.n)).toEqual(['Logica', 'Comprensione verbale', 'Matematica']);
    expect(TOLC_TESTS['tolc-av'].sezioni.map(s => [s.n, s.q])).toEqual([['Biologia', 8], ['Chimica', 8], ['Fisica', 8], ['Matematica', 8], ['Logica', 8], ['Comprensione verbale', 10]]);
  });
});

describe('banche ampliate', () => {
  it('le domande nuove si aggiungono una volta sola', () => {
    expect(TOLC_ENG_BANCA.length).toBe(engBefore + nuove.TOLC_ENG_NUOVE.length);
    for (const k of Object.keys(nuove.TOLC_NUOVE)) expect(TOLC_TESTS[k].banca.length, k).toBe(before[k] + nuove.TOLC_NUOVE[k].length);
  });
  it('ogni sezione ha almeno 2 volte (quasi sempre 3) i quesiti ufficiali; inglese almeno 2 test', () => {
    for (const [k, t] of Object.entries(TOLC_TESTS)) {
      for (const s of t.sezioni) {
        const n = t.banca.filter(q => q.s === s.n).length;
        expect(n, k + ' ' + s.n).toBeGreaterThanOrEqual(2 * s.q);
      }
    }
    expect(TOLC_ENG_BANCA.length).toBeGreaterThanOrEqual(60);
  });
  it('formato: 5 opzioni diverse, una giusta valida, sezione esistente, niente doppioni nella stessa banca', () => {
    for (const [k, t] of Object.entries(TOLC_TESTS)) {
      const nomi = new Set(t.sezioni.map(s => s.n));
      const seen = new Set();
      for (const q of t.banca) {
        if (!nomi.has(q.s)) continue;                         // es. vecchie domande LP di "Conoscenze": non usate
        expect(Array.isArray(q.o) && q.o.length >= 4, k).toBe(true);
        expect(new Set(q.o.map(String)).size, k + ': ' + q.q.slice(0, 40)).toBe(q.o.length);
        expect(q.c >= 0 && q.c < q.o.length, k).toBe(true);
        const key = q.q.trim().toLowerCase() + '|' + q.o.map(String).sort().join('|');
        expect(seen.has(key), k + ' doppione: ' + q.q.slice(0, 60)).toBe(false);
        seen.add(key);
      }
    }
    for (const q of nuove.TOLC_ENG_NUOVE) { expect(q.s).toBe('Inglese'); expect(q.o.length).toBe(5); }
  });
  it('il test completo serve esattamente i quesiti ufficiali + 30 di inglese, ogni volta diversi', () => {
    const api = sampler();
    for (const [k, [q]] of Object.entries(UFFICIALE)) {
      const t = TOLC_TESTS[k];
      const a = api._sample(t, false), b = api._sample(t, false);
      expect(a.nBase, k).toBe(q);
      expect(a.nEng, k).toBe(30);
      const same = a.qs.filter(x => b.qs.some(y => y.q === x.q)).length;
      expect(same / a.qs.length, k + ' troppo uguali tra due prove').toBeLessThan(0.8);
    }
  });
});

describe('caricamento a parte', () => {
  it('la banca nuova non finisce nel pacchetto iniziale (import dinamico, chunk separato)', () => {
    const data = fs.readFileSync(new URL('../data/tolc.js', import.meta.url), 'utf8');
    expect(data).not.toMatch(/^import .*tolc_banca_2026_10/m);
    expect(data).toContain("import('./tolc_banca_2026_10.js')");
    const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
    expect(vite).toContain("!id.includes('tolc_banca_')");
  });
  it('il simulatore aspetta le domande nuove prima di iniziare (e parte comunque se offline)', () => {
    expect(src).toContain('if (TOLC_TESTS.__nuove) return _startNow(key, quick);');
    expect(src).toContain("loadTolcNuove().then(function () { if (_el('tolc-sim-overlay')) _startNow(key, quick); });");
    const data = fs.readFileSync(new URL('../data/tolc.js', import.meta.url), 'utf8');
    expect(data).toContain('.catch(function () { _nuovePromise = null; return false; })');
  });
});

describe('risposte sbagliate trovate nelle banche vecchie (verifica alla cieca del 07/10/2026)', () => {
  const all = Object.values(TOLC_TESTS).flatMap(t => t.banca);
  const giusta = start => { const q = all.find(x => x.q.includes(start)); return q.o[q.c]; };
  it('5 risposte corrette', () => {
    expect(giusta('Se la media di 4 numeri è 7')).toBe('6');                       // (28 - 22)
    expect(giusta('3^(x+1) = 27^(x-1)')).toBe('x = 2');                            // x+1 = 3x-3
    expect(giusta('3, 7, 13, 21, 31')).toBe('43');                                 // differenze 4,6,8,10,12
    expect(giusta('firmata la Costituzione')).toBe('1947');                        // promulgata il 27/12/1947
    expect(giusta("Nessun gatto ama l'acqua")).toMatch(/^Non si può dedurre/);
  });
  it('domande ambigue sistemate (una sola risposta difendibile)', () => {
    const q = all.find(x => x.q.includes('Date le funzioni f(x) = x^2 + 1'));
    expect(q.o).not.toContain('(x - 3)^2 + 1');
    expect(all.find(x => x.q.includes('combustione completa del propano')).o).not.toContain('2C₃H₈ + 10O₂ → 6CO₂ + 8H₂O');
    expect(all.find(x => x.q.includes('Quanto fa (2/3) × (3/4)')).o).not.toContain('2/4');
    expect(all.find(x => x.q.includes('Andrea è arrivato prima di Bruno')).q).toContain('Dario è arrivato dopo Bruno');
    expect(giusta("primo filosofo dell'Occidente")).toBe('Talete');
  });
});

describe('pagine TOLC: dati ufficiali e domande d\'esempio corrette', () => {
  const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  it('niente più strutture "—" o "variabile", tabelle con i totali ufficiali', () => {
    for (const [k, [q, min]] of Object.entries(UFFICIALE)) {
      const g = read('public/' + k + '.html'), l = read('public/simulazione-' + k + '.html');
      expect(g, k).not.toMatch(/<td>—<\/td>|variabile — verifica|verifica la ripartizione/);
      expect(g, k).toContain('<tr class="trtot"><td>Totale</td><td>' + q + '</td><td>' + min + ' min</td></tr>');
      expect(l, k).toContain(q + ' + 30</td><td class="n">' + min + '′ + 15′');
      expect(g, k).toContain('struttura-della-prova-e-sillabo');
    }
  });
  it('domande d\'esempio sulle pagine: risposte giuste', () => {
    expect(read('public/tolc-psi.html')).toContain('<li class="ok">✅ 43</li>');
    expect(read('public/tolc-s.html')).toContain('<li class="ok">✅ x = 2</li>');
    expect(read('public/quiz-logica-tolc.html')).not.toContain('<li>E) Domenica</li>');
  });
  it('ogni domanda d\'esempio delle pagine tolc-X ha il suo "Perché"', () => {
    let tot = 0;
    for (const k of Object.keys(UFFICIALE)) {
      const g = read('public/' + k + '.html');
      const nOk = (g.match(/class="ok"/g) || []).length, nWhy = (g.match(/<strong>Perché:<\/strong>/g) || []).length;
      expect(nWhy, k).toBe(nOk);
      tot += nWhy;
    }
    expect(tot).toBe(27);
  });
  it('durata di tutti i TOLC nella guida e llms.txt per i motori di risposta', () => {
    const g = read('public/come-funziona-il-tolc.html');
    expect(g).toContain('id="durata-tolc"');
    expect(g).not.toMatch(/[Cc]irca (<strong>)?due ore/);
    expect(read('public/llms.txt')).toContain('| TOLC-PSI | Psicologia | 50 | 100 | 1 h 55 min |');
  });
});
