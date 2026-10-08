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
