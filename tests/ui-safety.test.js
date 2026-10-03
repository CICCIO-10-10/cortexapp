// Audit 2026-10 — Fase 1.4b/c: HTML non attendibile e XP del profilo pubblico.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { escapeHTML, escapeDeep } from '../js/utils.js';

const HOSTILE = `<img src=x onerror="alert(1)">'"`;
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const slice = (src, from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a + from.length); expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeGreaterThan(a); return src.slice(a, b).replace(/\bexport /g, ''); };
const noActiveHtml = html => { expect(html).not.toContain('<img'); expect(html).not.toMatch(/onerror="/); };

describe('escapeHTML / escapeDeep', () => {
  it('neutralizza tag e virgolette (sicuro anche negli attributi)', () => {
    expect(escapeHTML(HOSTILE)).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&quot;');
    expect(escapeHTML(null)).toBe(''); expect(escapeHTML(undefined)).toBe(''); expect(escapeHTML(0)).toBe('0');
  });
  it('escapeDeep copia senza modificare l\'originale', () => {
    const src = { title: HOSTILE, n: 3, list: [HOSTILE, { x: '<b>' }] };
    const out = escapeDeep(src);
    expect(out.title).not.toContain('<'); expect(out.list[1].x).toBe('&lt;b&gt;'); expect(out.n).toBe(3);
    expect(src.title).toBe(HOSTILE);
  });
});

describe('viste reali con contenuti ostili (nome mazzo, testi AI)', () => {
  const arch = read('modules/architect.js');
  it('renderDeckGrid e renderNeuralStrips non eseguono HTML del nome mazzo', () => {
    const decks = [{ name: HOSTILE, cards: [] }];
    const ctx = { _deps: { state: { decks } }, escapeHTML, escapeDeep, t: k => k };
    vm.runInNewContext(slice(arch, 'export function renderDeckGrid()', 'function dummyReplacement'), ctx);
    noActiveHtml(ctx.renderDeckGrid());
    vm.runInNewContext(slice(arch, 'export function renderNeuralStrips()', '\nexport function'), ctx);
    noActiveHtml(String(ctx.renderNeuralStrips()));
  });
  it('piano AI (renderAuraPlanDashboard): titolo, note, strategie e trucchi restano testo', () => {
    const el = { innerHTML: '' };
    const ctx = { _deps: { state: { decks: [{ name: HOSTILE }] } }, escapeHTML, escapeDeep, t: k => k, document: { getElementById: () => el, querySelectorAll: () => [] }, setTimeout() {}, window: {} };
    vm.runInNewContext(slice(arch, 'export function renderAuraPlanDashboard(b)', '\nexport function'), ctx);
    try {
      ctx.renderAuraPlanDashboard({ title: HOSTILE, description: HOSTILE, dailyGoal: HOSTILE, suggestedTechnique: HOSTILE, efficiencyScore: 80, notes: HOSTILE, strategies: [{ feature: HOSTILE, advice: HOSTILE }], hacks: [HOSTILE] });
    } catch (_) { /* eventuali effetti successivi al render non interessano qui */ }
    expect(el.innerHTML.length).toBeGreaterThan(100);
    noActiveHtml(el.innerHTML);
  });
  it('mini-markdown delle tecniche: prima escape, poi formattazione', () => {
    const ctx = { escapeHTML };
    vm.runInNewContext(slice(read('modules/techniques.js'), 'function _mdToHtml(text)', '\n}\n') + '\n}', ctx);
    const html = ctx._mdToHtml(`**ok** ${HOSTILE}`);
    expect(html).toContain('<strong>ok</strong>');
    noActiveHtml(html);
  });
  it('mappa mentale: titolo e parole come testo SVG', () => {
    const src = read('modules/mindMap.js');
    expect(src).toContain('${escapeHTML(String(title || \'\').slice(0, 18))}');
    expect(src).toContain('${escapeHTML(word)}');
  });
  it('nessun inserimento diretto dei campi noti nei punti corretti', () => {
    const checks = {
      'modules/architect.js': [/>\$\{deck\.name\}</, />\$\{d\.name\}</, />\$\{q\.q\}</, /<span>\$\{o\}<\/span>/, />\$\{source\.name\}</, /\$\{b\.(title|description|dailyGoal|notes)\}/],
      'modules/studyPlan.js': [/\$\{d\.name\}/],
      'modules/deckForm.js': [/>\$\{att\.name/],
      'modules/neuralPodcast.js': [/\$\{line\.text\}/, /\$\{line\.speaker\}/],
      'modules/pao.js': [/>\$\{pao\.[pao]\}</],
      'services/referralLeaderboard.js': [/\$\{e\.displayName\}/, /src="\$\{e\.photoURL\}"/],
    };
    for (const [file, patterns] of Object.entries(checks)) {
      const src = read(file);
      for (const re of patterns) expect(src, file + ' ' + re).not.toMatch(re);
    }
  });
});

describe('profilo pubblico: XP che salgono per gradi (regole: +1000 per aggiornamento, 1 ogni 60s)', () => {
  const comm = read('modules/community.js');
  function load({ prev, localXp }) {
    let written = null; let gets = 0;
    const ref = { get: async () => { gets++; return { exists: !!prev, data: () => prev }; }, set: async d => { written = d; } };
    const ctx = {
      _deps: { getDB: () => ({ collection: () => ({ doc: () => ref }) }), state: { username: 'ciccio', userId: 'U1' }, getGState: () => ({ xp: localXp }), getLevel: () => ({ name: 'L1' }) },
      firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } }, Date, Math, Number, String, console: { error() {} },
    };
    vm.runInNewContext(slice(comm, '// Audit 2026-10 (fase 1.4): le regole accettano', 'export function sortCommunity'), ctx);
    return { run: () => ctx.syncPublicProfile(), get written() { return written; }, get gets() { return gets; } };
  }
  it('nuovo profilo: parte da al massimo 1000 XP', async () => {
    const h = load({ prev: null, localXp: 7000 }); await h.run();
    expect(h.written).toMatchObject({ uid: 'U1', xp: 1000, lastSync: 'TS' });
  });
  it('profilo esistente: +1000 per volta verso gli XP locali, mai oltre', async () => {
    const a = load({ prev: { uid: 'U1', xp: 1500 }, localXp: 7000 }); await a.run(); expect(a.written.xp).toBe(2500);
    const b = load({ prev: { uid: 'U1', xp: 1500 }, localXp: 1700 }); await b.run(); expect(b.written.xp).toBe(1700);
  });
  it('username di un altro utente: nessuna scrittura; chiamate ravvicinate: una sola', async () => {
    const a = load({ prev: { uid: 'OTHER', xp: 10 }, localXp: 50 }); await a.run(); expect(a.written).toBeNull();
    const b = load({ prev: null, localXp: 50 }); await b.run(); await b.run(); expect(b.gets).toBe(1);
  });
});
