// 07/10/2026: IndexNow — avvisa Bing (e Yandex, Seznam…) delle pagine del sito dopo ogni pubblicazione,
// così le vede in poche ore invece che in giorni. Non blocca mai: in caso di errore scrive solo un avviso.
// Uso: node scripts/indexnow.mjs   (lo lancia il menu HQ dopo "Pubblica tutto/sito/UniMe").
import { readFileSync } from 'node:fs';

const HOST = 'cortexapp.it';
const KEY = '49f27d306fb478c050d1ddb3737f33fd';
const SITEMAP = new URL('../public/sitemap.xml', import.meta.url);

try {
  const xml = readFileSync(SITEMAP, 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(u => u.startsWith('https://' + HOST));
  if (!urls.length) { console.log('IndexNow: nessun URL nella sitemap, salto.'); process.exit(0); }
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: 'https://' + HOST + '/' + KEY + '.txt', urlList: urls.slice(0, 10000) }),
  });
  // 200/202 = ricevuto; 403 = chiave non ancora online (succede solo al primo deploy)
  console.log('IndexNow: ' + urls.length + ' pagine inviate a Bing → risposta ' + res.status + (res.status === 403 ? ' (chiave non ancora online: riprova dopo il deploy)' : ''));
} catch (e) {
  console.log('IndexNow: invio non riuscito (' + e.message + '), il sito è comunque pubblicato.');
}
process.exit(0);
