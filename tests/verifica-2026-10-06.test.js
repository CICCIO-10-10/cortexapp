// 06/10/2026 — correzioni dal report di verifica (ChatGPT) e decisioni del titolare.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const source = p => read(p).replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');

describe('attivazione = primo ripasso completato (scelta A)', () => {
  function setup(initial = {}) {
    const rows = { 'users/U': initial };
    const inc = n => ({ __inc: n });
    const ts = () => ({ __ts: true });
    const merge = (old, add) => {
      const out = { ...(old || {}) };
      for (const [k, v] of Object.entries(add)) {
        if (v && typeof v === 'object' && '__inc' in v) out[k] = (out[k] || 0) + v.__inc;
        else if (v && typeof v === 'object' && v.__ts) out[k] = 'TS';
        else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = merge(out[k], v);
        else out[k] = v;
      }
      return out;
    };
    const ref = { path: 'users/U' };
    const db = {
      collection: () => ({ doc: () => ref }),
      runTransaction: async fn => {
        const pending = [];
        const r = await fn({ get: async () => ({ exists: !!rows['users/U'], data: () => rows['users/U'] }), set: (_r, d) => pending.push(d) });
        for (const d of pending) rows['users/U'] = merge(rows['users/U'], d);
        return r;
      },
    };
    const tracked = [];
    const firebase = { apps: [{}], app: () => ({ firestore: () => db }), auth: () => ({ currentUser: { uid: 'U' } }), firestore: { FieldValue: { increment: inc, serverTimestamp: ts } } };
    const ctx = vm.createContext({ firebase, localStorage: { getItem: () => null }, window: {}, track: (e, p) => tracked.push([e, p]), Date });
    vm.runInContext(source('../services/activation.js'), ctx);
    return { ctx, rows, tracked };
  }

  it('ripasso degli errori TOLC (senza AI) completato → attivato, origine tolc_errors', async () => {
    const { ctx, rows, tracked } = setup({});
    await ctx.bumpActivation('cardsStudied', 2, { flow: 'tolc_errors' });
    expect(rows['users/U'].activation).toMatchObject({ activated: true, activatedVia: 'tolc_errors' });
    expect(rows['users/U'].activation.aiActivated).toBeUndefined();
    expect(tracked).toContainEqual(['activated', { flow: 'tolc_errors' }]);
  });
  it('mazzo demo: non attiva; valutare una carta da sola non attiva', async () => {
    const { ctx, rows } = setup({});
    await ctx.bumpActivation('cardsStudied', 5, { flow: 'demo' });
    await ctx.bumpActivation('ratingsGiven', 1);
    expect(rows['users/U'].activation.activated).toBeUndefined();
  });
  it('la regola precedente resta misurata a parte (aiActivated)', async () => {
    const { ctx, rows } = setup({ activation: { cardsGenerated: 3, ratingsGiven: 1 } });
    await ctx.bumpActivation('cardsStudied', 3, { flow: 'deck' });
    expect(rows['users/U'].activation).toMatchObject({ activated: true, activatedVia: 'deck', aiActivated: true });
  });
});

describe('testi e percorsi corretti', () => {
  const sim = read('../modules/tolcSim.js');
  it('un solo errore: "Ripassa il tuo errore"; consegna coerente con il punteggio (0 punti, non errata)', () => {
    expect(sim).toContain("nWrong === 1 ? 'Ripassa il tuo errore'");
    expect(sim).not.toContain('contano come sbagliate');
    expect(sim).toContain('valgono 0 punti');
  });
  it('"Salva Materia" bloccato anche durante la generazione con anteprima (testo e file)', () => {
    const pdf = read('../modules/pdfToFlashcards.js');
    expect((pdf.match(/_lockSave\(true\)/g) || []).length).toBe(2);
    expect((pdf.match(/finally \{ _generating = false; _lockSave\(false\); \}/g) || []).length).toBe(2);
  });
  it('ospite → "Spiegami gli errori con l\'AI" apre il riquadro con "Non ora" (non il login diretto)', () => {
    const deckSrc = read('../modules/tolcErrorDeck.js');
    const fn = deckSrc.slice(deckSrc.indexOf('export function requestAiExplanation'), deckSrc.indexOf("if (typeof window !== 'undefined') {\n    window.__cxTolcErrorStudyEvent"));
    const calls = [];
    const win = { showGuestLoginGate: c => calls.push('gate:' + c), __guestLogin: () => calls.push('login') };
    const store = {};
    const ctx = vm.createContext({ window: win, localStorage: { setItem: (k, v) => { store[k] = v; } }, sessionStorage: { removeItem: () => {} },
      aiNotesFromDeck: () => 'note', _isGuest: () => true, JSON, Date });
    vm.runInContext(fn.replace('export ', ''), ctx);
    ctx.requestAiExplanation({});
    expect(calls).toEqual(['gate:tolc_errors']);
    expect(JSON.parse(store.cortex_pending_ai)).toMatchObject({ source: 'tolc_errors', authRequired: true });
  });
  it('riepilogo della sessione: i riquadri vanno a capo su telefono', () => {
    const app = read('../app.html');
    expect(app).toMatch(/id="session-stats" style="display:flex; flex-wrap:wrap;/);
  });
});

describe('prezzi mostrati = prezzi su Stripe (Student 3,99 €/mese, 39,99 €/anno; Pro 4,99 €/mese)', () => {
  const files = ['../services/settings.js', '../modules/home.js', '../home.html', '../core/ui.js', '../services/notifications.js', '../public/terms.html'];
  it('nessun "Student 4,99" e risparmio annuale corretto (16%, 7,89 €)', () => {
    for (const f of files) {
      const s = read(f);
      expect(s, f).not.toMatch(/Student[^<\n]{0,40}€\s?4[.,]99/);
      expect(s, f).not.toMatch(/-33%|Risparmia 33%/);
    }
    expect(read('../public/terms.html')).toContain('Student (€3,99/mese o €39,99/anno)');
    expect(read('../data/translations.js')).not.toMatch(/19[.,]89/);
  });
});
