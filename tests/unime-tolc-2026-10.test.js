// Test 08/10/2026: riquadro "Test d'ingresso" sulle pagine dei corsi UniMe (dati dalla scheda CISIA di UniMe).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = s => fs.readFileSync(new URL(`../public/${s}.html`, import.meta.url), 'utf8');
const box = h => (h.match(/<div class="card tolcbox"[\s\S]*?<\/div>/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('corsi UniMe: quale TOLC serve', () => {
  it('casi controllati sulla scheda CISIA', () => {
    expect(box(read('farmacia-messina'))).toMatch(/serve il TOLC-F · accesso libero\. Vale anche il TOLC-B/);
    expect(box(read('scienze-motorie-sport-e-salute-messina'))).toMatch(/TOLC-F · accesso programmato/);
    expect(box(read('giurisprudenza-messina'))).toMatch(/TOLC-SU/);
    expect(box(read('ingegneria-civile-messina'))).toMatch(/TOLC-I/);
    expect(box(read('scienze-e-tecniche-psicologiche-messina'))).toMatch(/TOLC-PSI · accesso programmato/);
    expect(box(read('heritage-innovation-engineering-messina'))).toMatch(/CEnT-S/);
  });
  it('niente riquadro dove la scheda CISIA non dice nulla (magistrali, sanitarie, altre sedi)', () => {
    for (const s of ['medicina-e-chirurgia-messina', 'infermieristica-messina', 'scienze-e-tecniche-psicologiche-noto', 'giurisprudenza-siracusa', 'bioingegneria-messina'])
      expect(read(s), s).not.toContain('tolcbox');
  });
  it('link alla prova veloce del TOLC giusto, FAQ in testa, fonte con data', () => {
    const h = read('farmacia-messina');
    expect(h).toContain('href="/app?guest=1&sim=tolc-f&veloce=1&utm_source=seo&utm_campaign=farmacia-messina&utm_content=corso_tolc"');
    expect(h).toContain('"name": "Che TOLC serve per Farmacia a Messina?"');
    expect(box(h)).toContain("verificata l'8 ottobre 2026");
  });
  it('37 corsi con il riquadro', () => {
    const files = fs.readdirSync(new URL('../public/', import.meta.url)).filter(f => f.endsWith('-messina.html'));
    expect(files.filter(f => read(f.slice(0, -5)).includes('tolcbox')).length).toBe(37);
  });
});

describe('titoli Google dei corsi UniMe (08/10/2026)', () => {
  const title = s => read(s).match(/<title>([^<]*)<\/title>/)[1];
  it('il TOLC nel titolo, corto, nomi con le minuscole giuste', () => {
    expect(title('farmacia-messina')).toBe('Farmacia Messina: TOLC-F, esami e programma | Cortex');
    expect(title('scienze-motorie-sport-e-salute-messina')).toBe('Scienze Motorie, Sport e Salute Messina: TOLC-F, esami e programma');   // oltre 70 caratteri: senza marchio
    expect(title('medicina-e-chirurgia-messina')).not.toContain('TOLC');
  });
  it('triennale e magistrale con lo stesso nome restano distinte; nessun titolo doppio', () => {
    expect(title('chimica-messina')).toContain('(triennale)');
    expect(title('chimica-magistrale-messina')).toContain('(magistrale)');
    const files = fs.readdirSync(new URL('../public/', import.meta.url)).filter(f => /-(messina|siracusa|noto)\.html$/.test(f));
    const ts = files.map(f => read(f.slice(0, -5)).match(/<title>([^<]*)/)[1]);
    expect(new Set(ts).size).toBe(ts.length);
  });
});

describe('pagina principale e pagine legali per Google (08/10/2026)', () => {
  const root = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  it('titolo vero e un H1', () => {
    expect(root).toContain('<title>Cortex — Simulazione TOLC gratis e flashcard AI</title>');
    expect((root.match(/<h1[\s>]/g) || []).length).toBe(1);
  });
  it('privacy e termini con la descrizione', () => {
    for (const f of ['public/privacy.html', 'public/terms.html', 'privacy.html'])
      expect(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), f).toMatch(/<meta name="description" content="[^"]{60,160}">/);
  });
});

describe('Dashboard 09/10: visite di oggi senza documento del giorno', () => {
  it('se il documento pageviews di oggi non esiste ancora, la dashboard riceve 0 e non n/d', () => {
    const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf('const visitesToday = pageviewsDoc.exists'), src.indexOf('const sourceBreakdown'));
    expect(block).toContain('{ landing: 0, app: 0 }');
    expect(block).not.toContain('{ landing: null, app: null }');
  });
});

describe('Privacy 09/10: cookie di analisi descritti e scelta modificabile', () => {
  const p = fs.readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
  it('nomina Google Analytics, Clarity e le statistiche interne, solo con consenso', () => {
    expect(p).toContain('Google Analytics 4');
    expect(p).toContain('Microsoft Clarity');
    expect(p).toContain('Statistiche interne di Cortex');
    expect(p).toContain('Accetta analisi facoltative');
  });
  it('ha i pulsanti per cambiare la scelta, con la stessa chiave del banner', () => {
    expect(p).toContain("KEY='cortex_cookie_consent'");
    expect(p).toContain('data-cookie="declined"');
    expect(p).toContain('data-cookie="accepted"');
  });
  it('le sezioni sono numerate da 1 a 8 senza buchi', () => {
    const n = [...p.matchAll(/<h2[^>]*>(\d+)\./g)].map(m => +m[1]);
    expect(n).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('Dashboard 13/10: campo del giorno assente = 0', () => {
  it('se il documento di oggi ha solo "app", "landing" vale 0 e il totale non diventa n/d', () => {
    const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    expect(src).toContain("const countOrZero = value => (value === undefined ? 0 : validCount(value));");
    expect(src).toContain("{ landing: countOrZero(pvData.landing), app: countOrZero(pvData.app) }");
  });
});
