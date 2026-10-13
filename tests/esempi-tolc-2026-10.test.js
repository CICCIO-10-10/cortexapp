// Test 13/10/2026: gli esempi TOLC diventano mini-esercizi (Clarity coihkb: clic sulle risposte senza effetto).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const pagine = ['tolc-av','tolc-b','tolc-e','tolc-f','tolc-i','tolc-lp','tolc-psi','tolc-s','tolc-sps','tolc-su','quiz-logica-tolc'];
const js = fs.readFileSync(new URL('../public/cortex-esempi.js', import.meta.url), 'utf8');

describe('Esempi TOLC interattivi', () => {
  it.each(pagine)('%s carica lo script e ha una sola risposta giusta per esempio', (p) => {
    const html = fs.readFileSync(new URL(`../public/${p}.html`, import.meta.url), 'utf8');
    expect(html).toContain('<script src="/cortex-esempi.js" defer></script>');
    for (const ul of html.match(/<ul>(?:(?!<\/ul>).)*class="ok"(?:(?!<\/ul>).)*<\/ul>/g) || []) {
      expect((ul.match(/class="ok"/g) || []).length).toBe(1);
    }
  });
  it('senza scelta la soluzione è nascosta, dopo la scelta si vedono esito, Perché e link alla prova veloce', () => {
    expect(js).toContain("spieg.forEach(function (e) { e.hidden = true; });");
    expect(js).toContain("spieg.forEach(function (e) { e.hidden = false; });");
    expect(js).toContain("&veloce=1");
    expect(js).toContain("e.key === 'Enter' || e.key === ' '");   // tastiera
  });
});

describe('SEO 13/10: link verso le pagine canoniche e file di verifica Google', () => {
  it('le pagine /simulazione-tolc-X collegano gli altri TOLC alle pagine /tolc-X (canoniche)', () => {
    for (const k of ['av','b','e','f','i','lp','psi','s','sps','su']) {
      const html = fs.readFileSync(new URL(`../public/simulazione-tolc-${k}.html`, import.meta.url), 'utf8');
      expect(html).not.toMatch(/href="\/simulazione-tolc-[a-z]+"/);
      expect(html).toContain(`<link rel="canonical" href="https://cortexapp.it/tolc-${k}">`);
    }
  });
  it('il file di verifica Google resta, ma con noindex nell\'intestazione', () => {
    const fb = JSON.parse(fs.readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
    const h = (fb.hosting.headers || []).find(x => x.source === '/google92cdd6ad9a1c54f5**');
    expect(h.headers).toEqual([{ key: 'X-Robots-Tag', value: 'noindex' }]);
    expect(fs.existsSync(new URL('../public/google92cdd6ad9a1c54f5.html', import.meta.url))).toBe(true);
  });
});
