// Test 08/10/2026: il banner dei cookie dell'app deve stare sopra alla simulazione TOLC e agli altri overlay.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const zOf = (src, re) => Math.max(...[...src.matchAll(re)].map(m => +m[1]));

describe('banner cookie sopra a tutto', () => {
  it('z-index del banner dell\'app più alto di ogni overlay dell\'app', () => {
    const g = read('modules/gdpr.js');
    const banner = +g.match(/id = 'gdpr-cookie-banner'[\s\S]*?z-index:(\d+)/)[1];
    expect(banner).toBe(2147483000);
    // la simulazione (overlay principale) e gli overlay dell'app restano sotto il banner;
    // solo la domanda "Vuoi ripassare gli errori prima di uscire?" (finestra breve) sta sopra
    const tolcOverlay = zOf(read('modules/tolcSim.js'), /ov\.style\.cssText = 'position:fixed;inset:0;z-index:(\d+)/g);
    expect(tolcOverlay).toBe(99999);
    expect(banner).toBeGreaterThan(tolcOverlay);
  });
  it('stessa chiave del banner delle pagine del sito (una scelta vale per sito e app)', () => {
    expect(read('modules/gdpr.js')).toContain("COOKIE_KEY     = 'cortex_cookie_consent'");
    expect(read('public/cortex-consent.js')).toContain("var KEY = 'cortex_cookie_consent'");
  });
});

describe('pagina /home senza il vecchio contatore Firestore (08/10/2026)', () => {
  it('niente scritture dirette su analytics (rifiutate dalle regole: davano errore a ogni visita)', () => {
    const h = read('home.html');
    expect(h).not.toContain("collection('analytics')");
    expect(h).not.toContain('pageviews_');
  });
});
