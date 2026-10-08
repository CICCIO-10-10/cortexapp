// Test 08/10/2026: spiegazione "perché" per ogni domanda TOLC e storico dei punteggi sul dispositivo.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { TOLC_TESTS, TOLC_ENG_BANCA, mergeTolcNuove, setTolcSpiegazioni, getTolcSpiegazione, tolcKeyHash } from '../data/tolc.js';
import * as nuove from '../data/tolc_banca_2026_10.js';
import * as spieg from '../data/tolc_spiegazioni_2026_10.js';
import { collectWrongAnswers, buildTolcErrorDeck, TOLC_ERROR_WITH_EXPLANATION } from '../modules/tolcErrorCards.js';

mergeTolcNuove(nuove);
const src = fs.readFileSync(new URL('../modules/tolcSim.js', import.meta.url), 'utf8');

describe('spiegazioni', () => {
  it('prima del caricamento nessuna spiegazione, dopo una per ogni domanda di ogni banca', () => {
    const q0 = TOLC_TESTS['tolc-e'].banca[0];
    expect(getTolcSpiegazione(q0)).toBe('');
    setTolcSpiegazioni(spieg);
    const all = [...Object.values(TOLC_TESTS).flatMap(t => t.banca.filter(q => t.sezioni.some(s => s.n === q.s))), ...TOLC_ENG_BANCA];
    const missing = all.filter(q => !getTolcSpiegazione(q));
    expect(missing.map(q => q.q.slice(0, 50))).toEqual([]);
  });
  it('vale anche con le opzioni mescolate (chiave = testo, non posizione)', () => {
    const q = TOLC_TESTS['tolc-psi'].banca[3];
    const mix = { s: q.s, q: q.q, o: q.o.slice().reverse(), c: q.o.length - 1 - q.c };
    expect(getTolcSpiegazione(mix)).toBe(getTolcSpiegazione(q));
    expect(tolcKeyHash('abc')).toBe('7aigaz');      // stesso hash usato per generare il file
  });
  it('nessuna spiegazione cita le opzioni per lettera o posizione', () => {
    const bad = Object.values(spieg.TOLC_SPIEGAZIONI).filter(t => /\b(risposta|opzione|alternativa|lettera)\s+[A-E]\b|\b(la prima|la seconda|la terza|la quarta|la quinta|l'ultima) (opzione|risposta|alternativa)/i.test(t));
    expect(bad).toEqual([]);
  });
  it('nel test: "Perché" dopo la verifica, testo protetto', () => {
    expect(src).toContain("const _why = isChecked ? getTolcSpiegazione(d) : '';");
    expect(src).toContain("_math(_esc(_why))");
    expect(src).toContain("try { loadTolcSpiegazioni(); } catch (eS) {}");
  });
  it('nel mazzo degli errori: ogni carta ha il perché', () => {
    const qs = [{ s: 'Logica', q: 'Domanda?', o: ['a', 'b', 'c'], c: 1, p: 'Perché sì.' }];
    const { wrong } = collectWrongAnswers(qs, [0]);
    const deck = buildTolcErrorDeck({ attemptId: 't1', testKey: 'tolc-e', testName: 'TOLC-E', wrong, today: '2026-10-08' });
    expect(deck.cards[0].a).toContain('Perché: Perché sì.');
    expect(deck.text).toBe(TOLC_ERROR_WITH_EXPLANATION);
    expect(src).toContain('qs: _withWhy(st2.qs)');
  });
});

describe('storico punteggi', () => {
  function load(store) {
    const code = src.slice(src.indexOf("var HIST_KEY = 'cortex_tolc_history';"), src.indexOf('function _withWhy(qs) {'));
    const fmt = src.slice(src.indexOf('function _fmtScore(v) {'), src.indexOf('function _secScore('));
    const ctx = vm.createContext({ localStorage: store, JSON, Date, Math, Number, String, Array });
    vm.runInContext(code + fmt + src.slice(src.indexOf('function _histHTML(st) {'), src.indexOf('function _renderResult() {')) + '\nthis.api={_histLoad,_histSave,_histFor,_histHTML,_fmtScore};', ctx);
    return ctx.api;
  }
  const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
  it('salva e filtra per TOLC e modalità; massimo 60 prove', () => {
    const api = load(mem());
    for (let i = 0; i < 65; i++) api._histSave({ k: i % 2 ? 'tolc-e' : 'tolc-i', q: i % 3 === 0, s: i, n: 36, t: 1e12 + i });
    expect(api._histLoad().length).toBe(60);
    expect(api._histFor('tolc-e', false).every(r => r.k === 'tolc-e' && !r.q)).toBe(true);
  });
  it('prima prova: invito a rifarla; poi progresso con il segno', () => {
    const api = load(mem());
    const st = { _histScore: 12.5, quick: false, test: { nome: 'TOLC-E' }, _prevHist: [] };
    expect(api._histHTML(st)).toContain('Prima prova complete TOLC-E salvata');
    st._prevHist = [{ s: 9, t: Date.parse('2026-10-06T10:00:00') }];
    const h = api._histHTML(st);
    expect(h).toContain('9</span> → <b style="color:#fff;">12,5</b>');
    expect(h).toContain('+3,5');
    expect(api._fmtScore(-0.75)).toBe('-0,75');
  });
  it('misura chi torna: evento tolc_returned con i giorni passati', () => {
    expect(src).toContain("track('tolc_returned', { test: key, mode: quick ? 'quick' : 'full', days_after:");
    const js = fs.readFileSync(new URL('../functions/journey-summary.cjs', import.meta.url), 'utf8');
    expect(js).toContain("'tolc_returned'");
  });
});
