// Test 09/10/2026: riquadro "Cosa studiare oggi" nella home dell'app.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../modules/home.js', import.meta.url), 'utf8');
const corpo = src.slice(src.indexOf('export function todayPlan'), src.indexOf('function _todayHtml')).replace('export function', 'function');
const todayPlan = new Function(corpo + '\nreturn todayPlan;')();
const html = new Function('todayPlan', src.slice(src.indexOf('function _todayHtml'), src.indexOf('// Clic sul riquadro')) + '\nreturn _todayHtml;')();

describe('Cosa studiare oggi', () => {
  const now = new Date('2026-10-09T10:00:00').getTime();
  it('somma le carte da ripassare e parte dalla materia più indietro', () => {
    const p = todayPlan([{ id: 1, dueCount: 3 }, { id: 2, dueCount: 9 }, { id: 3, dueCount: 0 }], [], now);
    expect(p.due).toBe(12); expect(p.decks).toBe(2); expect(p.topDeckId).toBe(2); expect(p.tolc).toBe(null);
  });
  it('prende l\'ultima prova TOLC dallo storico', () => {
    const h = [{ k: 'tolc-e', q: true, s: 4.5, n: 8, t: new Date('2026-10-06T18:00:00').getTime() },
               { k: 'tolc-i', q: false, s: 20, n: 50, t: new Date('2026-10-08T18:00:00').getTime() }];
    const p = todayPlan([], h, now);
    expect(p.tolc).toEqual({ key: 'tolc-i', name: 'TOLC-I', quick: false, score: 20, n: 50, days: 1 });
  });
  it('niente da fare → nessun riquadro', () => {
    expect(html(todayPlan([], [], now))).toBe('');
    expect(html(todayPlan([{ id: 1, dueCount: 0 }], 'rotto', now))).toBe('');
  });
  it('testi: plurale/singolare, punteggio con la virgola, quando', () => {
    const h = [{ k: 'tolc-e', q: true, s: 4.75, n: 8, t: new Date('2026-10-09T08:00:00').getTime() }];
    const out = html(todayPlan([{ id: 7, dueCount: 1 }], h, now));
    expect(out).toContain('1 carta da ripassare');
    expect(out).toContain('Rifai la prova del TOLC-E');
    expect(out).toContain('prova veloce: 4,75/8, oggi');
    expect(out).toContain('data-fn="todayCardClick"');
  });
  it('i parametri dei pulsanti sono JSON valido dopo la decodifica dell\'HTML', () => {
    const out = html(todayPlan([{ id: "a'b", dueCount: 2 }], [], now));
    const raw = out.match(/data-params='([^']*)'/)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    expect(JSON.parse(raw)).toEqual(['ripasso', "a'b"]);
  });
});
