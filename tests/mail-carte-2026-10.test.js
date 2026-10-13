// Test 09/10/2026: mail del giorno dopo con il numero di carte da ripassare.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const pezzo = (inizio, fine) => src.slice(src.indexOf(inizio), src.indexOf(fine));
const codice = pezzo('function contaCarteDaRipassare', 'async function inviaEmail');
const { contaCarteDaRipassare, emailD1 } = new Function('emailLayout', 'EMAILS',
  codice + '\nreturn { contaCarteDaRipassare, emailD1 };')(
  (t, c, cta, url) => `${t}|${c}|${cta}|${url}`, { d1: { subject: 'generica', html: 'generica' } });

describe('Mail giorno dopo con le carte da ripassare', () => {
  it('somma dueCount dei metadati dei mazzi', () => {
    expect(contaCarteDaRipassare({ decksMetadata: [{ dueCount: 3 }, { dueCount: 9 }] })).toBe(12);
  });
  it('dato non affidabile → null (si usa il testo generico)', () => {
    expect(contaCarteDaRipassare({ decksMetadata: [{ dueCount: 3 }, {}] })).toBe(null);
    expect(contaCarteDaRipassare({ migratedToSubcollections: true })).toBe(null);
    expect(contaCarteDaRipassare(null)).toBe(null);
  });
  it('mazzi vecchi nel documento: conta carte nuove e scadute, non quelle future', () => {
    const now = Date.parse('2026-10-09T10:00:00Z');
    const decks = [{ cards: [{}, { nextReview: '2026-10-08T10:00:00Z' }, { nextReview: '2026-10-20T10:00:00Z' }] }];
    expect(contaCarteDaRipassare({ decks }, now)).toBe(2);
  });
  it('testo: numero nel titolo e nell\'oggetto, singolare e plurale, niente emoji', () => {
    expect(emailD1(12).subject).toBe('Hai 12 carte da ripassare');
    expect(emailD1(1).subject).toBe('Hai 1 carta da ripassare');
    expect(emailD1(12).html).toContain('Le tue 12 carte ti aspettano');
    expect(/\p{Extended_Pictographic}/u.test(emailD1(12).subject)).toBe(false);
  });
  it('0 carte o dato mancante → mail generica di prima', () => {
    expect(emailD1(0).subject).toBe('generica');
    expect(emailD1(null).subject).toBe('generica');
  });
  it('la funzione notturna usa il conteggio solo per la mail d1', () => {
    expect(src).toContain("f.tipo === 'd1' ? emailD1(contaCarteDaRipassare(d)) : undefined");
  });
});
