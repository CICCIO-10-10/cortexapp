// 07/10/2026: IndexNow — avvisa Bing (e Yandex, Seznam…) delle pagine del sito dopo ogni pubblicazione,
// così le vede in poche ore invece che in giorni. Non blocca mai: in caso di errore scrive solo un avviso.
// Uso: node scripts/indexnow.mjs   (lo lancia il menu HQ dopo "Pubblica tutto/sito/UniMe").
import { readFileSync, writeFileSync } from 'node:fs';

const HOST = 'cortexapp.it';
// 08/10/2026: chiave nuova. Bing rifiutava la vecchia (403 "UserForbiddedToAccessSite") mentre Yandex
// l'accettava: Bing l'aveva controllata prima che il file fosse online e se la ricordava come non valida.
const KEY = 'd3b151082c2c890fb95df383446040af';
const SITEMAP = new URL('../public/sitemap.xml', import.meta.url);
// 08/10/2026: si mandano solo le pagine cambiate dall'ultimo invio riuscito (lastmod diverso),
// come chiede Bing, invece di tutte le 135 a ogni pubblicazione.
const SENT = process.env.INDEXNOW_SENT || new URL('./indexnow_sent.json', import.meta.url);

try {
  const xml = readFileSync(SITEMAP, 'utf8');
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)]
    .map(m => [m[1].trim(), (m[2] || '').trim()]).filter(([u]) => u.startsWith('https://' + HOST));
  let sent = {};
  try { sent = JSON.parse(readFileSync(SENT, 'utf8')); } catch { sent = {}; }
  const urls = all.filter(([u, d]) => !d || sent[u] !== d).map(([u]) => u);
  if (!urls.length) { console.log('IndexNow: nessuna pagina cambiata dall\'ultimo invio, salto.'); process.exit(0); }
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: 'https://' + HOST + '/' + KEY + '.txt', urlList: urls.slice(0, 10000) }),
  });
  if (res.status === 200 || res.status === 202) {
    for (const [u, d] of all) if (urls.includes(u)) sent[u] = d;
    writeFileSync(SENT, JSON.stringify(sent, null, 1) + '\n');
  }
  // 200/202 = ricevuto; 403 = chiave non ancora online (succede solo al primo deploy)
  console.log('IndexNow: ' + urls.length + ' pagine cambiate inviate a Bing → risposta ' + res.status + (res.status === 403 ? ' (chiave non ancora online: riprova dopo il deploy)' : ''));
} catch (e) {
  console.log('IndexNow: invio non riuscito (' + e.message + '), il sito è comunque pubblicato.');
}
process.exit(0);
