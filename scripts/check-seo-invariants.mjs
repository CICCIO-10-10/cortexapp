import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { registry, projectRoot, validateRegistry, injectDesign, stripDesign } from './seo-design-plugin.mjs';

const reportArg = process.argv.find(arg => arg.startsWith('--report-dir='));
const dir = path.resolve(projectRoot, reportArg?.slice('--report-dir='.length) || 'artifacts/metrics-2026-09-20/seo');
fs.mkdirSync(dir, { recursive: true });
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const read = f => fs.readFileSync(path.join(projectRoot, f), 'utf8');
const matches = (s, re) => [...s.matchAll(re)];
const attr = (tag, key) => tag.match(new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(v => v !== undefined) ?? '';
const plain = s => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Raw HTML content invariants complement (not replace) rendered-text browser QA.
export function fingerprint(html, url) {
  const metas = matches(html, /<meta\b[^>]*>/gi);
  const links = matches(html, /<link\b[^>]*>/gi);
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
  const text = body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const hrefs = matches(text, /<(?:a|area)\b[^>]*>/gi).map(m => attr(m[0], 'href'));
  return {
    url, title: html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '',
    description: metas.filter(m => attr(m[0], 'name').toLowerCase() === 'description').map(m => attr(m[0], 'content')),
    canonical: links.filter(m => attr(m[0], 'rel') === 'canonical').map(m => attr(m[0], 'href')),
    robots: metas.filter(m => /^(robots|googlebot|bingbot)$/i.test(attr(m[0], 'name'))).map(m => m[0]),
    social: metas.filter(m => /^(og:|twitter:)/.test(attr(m[0], 'property') || attr(m[0], 'name'))).map(m => m[0]),
    schema: matches(html, /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi).map(m => m[1]),
    headings: matches(text, /<(h[123])\b[^>]*>([\s\S]*?)<\/\1>/gi).map(m => [m[1], plain(m[2])]),
    contentText: plain(text), hrefs, linkCount: hrefs.length,
    internalHrefs: hrefs.filter(h => !/^[a-z]+:/i.test(h) || /^https?:\/\/cortexapp\.it(?:\/|$)/i.test(h)),
    images: matches(text, /<img\b[^>]*>/gi).map(m => [attr(m[0], 'src'), attr(m[0], 'alt')]),
    ids: matches(text, /\bid=["']([^"']+)["']/gi).map(m => m[1])
  };
}

validateRegistry();
const htmlFiles = [...fs.readdirSync(projectRoot).filter(f => f.endsWith('.html')),
  ...fs.readdirSync(path.join(projectRoot, 'public')).filter(f => f.endsWith('.html')).map(f => `public/${f}`)];
const protectedFiles = [...htmlFiles, 'public/sitemap.xml', 'public/robots.txt', 'firebase.json',
  'genera_landing_scuola.py', 'genera_landing_province.py', 'genera_landing_unime.py', 'genera_sitemap.py', 'public/unime/landing_index.json'];
const baselinePath = path.join(dir, 'baseline.json');
if (process.argv.includes('--capture')) {
  if (fs.existsSync(baselinePath)) throw new Error('Baseline already exists; never overwrite the pre-migration reference.');
  const baseline = {
    created: new Date().toISOString(),
    files: Object.fromEntries(protectedFiles.filter(f => fs.existsSync(path.join(projectRoot, f))).map(f => [f, hash(read(f))])),
    pages: Object.fromEntries(registry.pages.map(p => [p.slug, fingerprint(read(p.source), `/${p.slug}`)]))
  };
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  console.log(`Captured ${Object.keys(baseline.files).length} protected files and ${registry.pages.length} selected SEO fingerprints.`);
} else {
  const before = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const report = { created: new Date().toISOString(), sourceChanges: [], pages: [], nonpilotMarkers: [], protectedUniMe: [] };
  report.presentationOnlyChanges = [];
  for (const [f, sha] of Object.entries(before.files)) {
    const current = read(f);
    if (hash(current) === sha) continue;
    // Only these two explicit presentation additions are permitted on the landing.
    const original = f === 'home.html' ? current.replace('<body class="cortex-marketing">', '<body>').replace(/<link rel="stylesheet" href="\/cortex-marketing.css">\r?\n/, '') : current;
    if (f === 'home.html' && hash(original) === sha) report.presentationOnlyChanges.push(f);
    else report.sourceChanges.push(f);
  }
  for (const p of registry.pages) {
    const source = read(p.source);
    const injected = injectDesign(source, p);
    assert.equal(stripDesign(injected), source, `Byte round trip: ${p.slug}`);
    assert.equal(injectDesign(injected, p), injected, `Idempotency: ${p.slug}`);
    const output = read(`dist/${p.slug}.html`);
    const after = fingerprint(output, `/${p.slug}`);
    const changes = Object.keys(after).filter(k => JSON.stringify(before.pages[p.slug][k]) !== JSON.stringify(after[k]));
    const marker = output.includes(`data-cortex-seo="${p.family}"`);
    const exactPublicOutput = !p.source.startsWith('public/') || stripDesign(output) === source;
    report.pages.push({ slug: p.slug, changes, marker, exactPublicOutput, linkCount: after.linkCount, headings: after.headings.length });
  }
  for (const f of htmlFiles) {
    const out = `dist/${path.basename(f)}`;
    if (registry.pages.some(p => p.source === f) || !fs.existsSync(path.join(projectRoot, out))) continue;
    if (read(out).includes('data-cortex-seo=')) report.nonpilotMarkers.push(f);
    // Every static nonpilot must be copied without a single byte changing.
    if (f.startsWith('public/') && read(out) !== read(f)) report.sourceChanges.push(`output:${f}`);
  }
  for (const slug of registry.protected) report.protectedUniMe.push({ slug, unchanged: read(`public/${slug}.html`) === read(`dist/${slug}.html`) });
  report.pass = !report.sourceChanges.length && !report.nonpilotMarkers.length && report.pages.every(p => !p.changes.length && p.marker && p.exactPublicOutput) && report.protectedUniMe.every(p => p.unchanged);
  fs.writeFileSync(path.join(dir, 'seo-diff.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
