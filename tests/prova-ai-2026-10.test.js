// Test 13/10/2026: prova 4 dell'audit (AI da testo, PDF e foto) — problemi trovati sul sito vero.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

describe('Foto degli appunti: la lettura del testo non è bloccata', () => {
  const fb = JSON.parse(read('firebase.json'));
  const csp = fb.hosting.headers.flatMap(h => h.headers).find(x => x.key === 'Content-Security-Policy').value;
  it('la CSP permette WebAssembly (senza unsafe-eval) e lo scarico dei dati della lingua', () => {
    expect(csp).toMatch(/script-src [^;]*'wasm-unsafe-eval'/);
    expect(csp).not.toMatch(/'unsafe-eval'/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/cdn\.jsdelivr\.net/);
  });
  it('se la lettura si blocca, dopo 90 s c\'è un errore chiaro invece della rotella infinita', () => {
    expect(read('services/ai.js')).toContain("setTimeout(() => rej(new Error('tempo scaduto");
  });
});

describe('Nome della materia scelto dallo studente', () => {
  it('il titolo proposto dall\'AI non sostituisce il nome già scritto', () => {
    expect(read('modules/pdfToFlashcards.js')).toContain("nameInput.value = nomeScelto || deckTitle");
  });
});
