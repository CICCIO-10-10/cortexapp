// Test 08/10/2026: pagine TOLC delle città siciliane con i dati veri di ogni ateneo (2026/27).
// Prima avevano la stessa tabella generica (95% di testo uguale) e per Enna, Catania e Palermo era sbagliata.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = c => fs.readFileSync(new URL(`../public/tolc-${c}.html`, import.meta.url), 'utf8');
const text = h => h.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const faqLd = h => JSON.parse(h.match(/<script type="application\/ld\+json">(\{[^<]*"FAQPage"[^<]*\})<\/script>/)[1]);

describe('pagine TOLC delle città', () => {
  it('Enna: la Kore non usa il TOLC (niente più tabella TOLC generica)', () => {
    const h = read('enna'), t = text(h);
    expect(t).toContain('non usa i TOLC del CISIA');
    expect(t).not.toContain('con ogni probabilità dovrai sostenere un TOLC');
    expect(t).not.toMatch(/Che TOLC serve per Ingegneria a Enna/);
    expect(faqLd(h).mainEntity[0].name).toBe("Serve il TOLC per l'Università Kore di Enna?");
  });
  it('Palermo: Biologia e Farmacia usano il TOL di UniPa, Ingegneria il TOLC-I', () => {
    const t = text(read('palermo'));
    expect(t).toContain('Per Biologia e Farmacia a Palermo non serve il TOLC-B o il TOLC-F');
    expect(t).toMatch(/Ingegneria Informatica, Elettronica, Gestionale, Meccanica TOLC-I/);
  });
  it('Catania: Psicologia con TOLC-SU, Farmacia e Biologia senza TOLC', () => {
    const t = text(read('catania'));
    expect(t).toMatch(/Scienze e tecniche psicologiche, Scienze dell'educazione e della formazione TOLC-SU/);
    expect(t).toContain('Nessun TOLC');
  });
  it('Messina: elenco CISIA (Biotecnologie con TOLC-F, Giurisprudenza con TOLC-SU)', () => {
    const t = text(read('messina'));
    expect(t).toMatch(/TOLC-F Biotecnologie; Scienze motorie, sport e salute Programmato/);
    expect(t).toContain('Giurisprudenza');
  });
  it('ogni pagina: fonti con data di verifica, FAQ strutturate valide, testo non più quasi identico', () => {
    const words = {};
    for (const c of ['enna', 'palermo', 'catania', 'messina']) {
      const h = read(c);
      expect(text(h), c).toMatch(/[Vv]erificat[ae] l'8 ottobre 2026/);
      expect(faqLd(h).mainEntity.length, c).toBeGreaterThanOrEqual(4);
      words[c] = new Set(text(h).toLowerCase().split(' '));
    }
    const sim = (a, b) => [...words[a]].filter(w => words[b].has(w)).length / new Set([...words[a], ...words[b]]).size;
    expect(sim('catania', 'palermo')).toBeLessThan(0.8);
    expect(sim('catania', 'enna')).toBeLessThan(0.8);
  });
});
