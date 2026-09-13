import fs from 'node:fs';
import path from 'node:path';
import { registry, projectRoot } from './seo-design-plugin.mjs';
const read = f => fs.readFileSync(path.join(projectRoot, f), 'utf8');
const exists = f => fs.existsSync(path.join(projectRoot, f));
const attrs = s => [...s.matchAll(/\b(href|src)=["']([^"']+)["']/g)].map(m => m[2].replaceAll('&amp;', '&'));
const resolve = pathname => {
  const p = decodeURIComponent(pathname).replace(/^\//, '');
  if (!p) return 'index.html';
  if (p === 'app' || p.startsWith('app/') || p === 'settings') return 'app.html';
  return [p, `public/${p}`, `${p}.html`, `public/${p}.html`].find(f => exists(f) && fs.statSync(path.join(projectRoot, f)).isFile());
};
const report = { internal: [], external: [], assets: [] };
const external = new Set();
for (const page of registry.pages) {
  const html = read(page.source).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const broken = [];
  const urls = attrs(html);
  for (const href of urls) {
    if (/^(mailto:|tel:|data:|javascript:)/i.test(href)) continue;
    let url;
    try { url = new URL(href, `https://cortexapp.it/${page.slug}`); } catch { broken.push({ href, reason: 'malformed URL' }); continue; }
    if (url.origin !== 'https://cortexapp.it') { if (/^https?:/.test(url.protocol)) external.add(url.href); continue; }
    const file = resolve(url.pathname);
    if (!file) broken.push({ href, reason: 'no local destination' });
    else if (url.hash && file.endsWith('.html') && !read(file).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)) broken.push({ href, reason: 'anchor not found in static HTML; may be dynamic' });
  }
  report.internal.push({ slug: page.slug, referenceCount: urls.length, broken });
}
for (const name of fs.readdirSync(path.join(projectRoot, 'public/cortex-design')).filter(n => /\.(css|woff2)$/.test(n))) {
  const res = await fetch(`http://127.0.0.1:5175/cortex-design/${name}`);
  report.assets.push({ name, status: res.status, type: res.headers.get('content-type'), bytes: Number(res.headers.get('content-length')) });
}
// External responses are diagnostics, not authorization to rewrite existing URLs.
if (process.argv.includes('--external')) {
  const list = [...external];
  for (let i = 0; i < list.length; i += 6) {
    report.external.push(...await Promise.all(list.slice(i, i + 6).map(async url => {
      try { const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000), redirect: 'follow' }); return { url, status: res.status, finalUrl: res.url }; }
      catch (e) { return { url, error: e.cause?.code || e.name }; }
    })));
  }
} else report.external = [...external].map(url => ({ url, status: 'not checked' }));
fs.writeFileSync(path.join(projectRoot, 'artifacts/seo-pilot/links.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pages: report.internal.length, broken: report.internal.filter(p => p.broken.length), assets: report.assets, external: report.external }, null, 2));
