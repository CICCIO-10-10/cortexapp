// Test 08/10/2026: IndexNow manda solo le pagine cambiate (lastmod diverso dall'ultimo invio riuscito).
// Nessuna rete: fetch finto caricato prima dello script.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Windows: percorso vero dello script e --import come file:// (C:\... non è accettato)
const script = fileURLToPath(new URL('../scripts/indexnow.mjs', import.meta.url));
const sitemap = fs.readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].map(m => [m[1], m[2]]);

function run(sent, status = 200) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inow-'));
  const sentFile = path.join(dir, 'sent.json');
  const logFile = path.join(dir, 'body.json');
  if (sent) fs.writeFileSync(sentFile, JSON.stringify(sent));
  const pre = path.join(dir, 'pre.mjs');
  fs.writeFileSync(pre, `import fs from 'node:fs'; globalThis.fetch = async (u, o) => { fs.writeFileSync(${JSON.stringify(logFile)}, o.body); return { status: ${status} }; };`);
  const out = execFileSync(process.execPath, ['--import', pathToFileURL(pre).href, script], { env: { ...process.env, INDEXNOW_SENT: sentFile }, encoding: 'utf8' });
  const body = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : null;
  const after = fs.existsSync(sentFile) ? JSON.parse(fs.readFileSync(sentFile, 'utf8')) : null;
  return { out, body, after };
}

describe('sitemap: lastmod vero per pagina', () => {
  it('ogni URL ha una data valida, non tutte uguali', () => {
    expect(pages.length).toBeGreaterThan(100);
    pages.forEach(([, d]) => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/));
    expect(new Set(pages.map(([, d]) => d)).size).toBeGreaterThan(1);
  });
  it('il generatore tiene l\'impronta di ogni pagina', () => {
    const db = JSON.parse(fs.readFileSync(new URL('../scripts/sitemap_lastmod.json', import.meta.url), 'utf8'));
    for (const [u, d] of pages) expect(db[u.replace('https://cortexapp.it', '')]?.date, u).toBe(d);
  });
});

describe('IndexNow: solo pagine cambiate', () => {
  it('primo invio: tutte; salva cosa ha mandato', () => {
    const r = run(null);
    expect(r.body.urlList.length).toBe(pages.length);
    expect(Object.keys(r.after).length).toBe(pages.length);
  });
  it('niente di cambiato: non chiama Bing', () => {
    const r = run(Object.fromEntries(pages));
    expect(r.body).toBe(null);
    expect(r.out).toContain('nessuna pagina cambiata');
  });
  it('una pagina con data nuova: manda solo quella', () => {
    const sent = Object.fromEntries(pages);
    sent[pages[3][0]] = '2000-01-01';
    const r = run(sent);
    expect(r.body.urlList).toEqual([pages[3][0]]);
    expect(r.after[pages[3][0]]).toBe(pages[3][1]);
  });
  it('se Bing rifiuta (403) non segna nulla come inviato', () => {
    const sent = Object.fromEntries(pages);
    sent[pages[3][0]] = '2000-01-01';
    const r = run(sent, 403);
    expect(r.after[pages[3][0]]).toBe('2000-01-01');
  });
});
