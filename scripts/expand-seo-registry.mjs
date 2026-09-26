import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const file = new URL('./seo-pages.json', import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const current = JSON.parse(fs.readFileSync(file, 'utf8'));
const courses = new Set(JSON.parse(fs.readFileSync(path.join(root, 'public/unime/landing_index.json'), 'utf8')).map(p => p.slug));
const excluded = ['admin-tiktok', 'oauth-callback', 'google92cdd6ad9a1c54f5'];
const pages = new Map(current.pages.map(p => [p.slug, p]));
for (const name of fs.readdirSync(path.join(root, 'public')).filter(f => f.endsWith('.html')).sort()) {
  const slug = name.slice(0, -5);
  if (excluded.includes(slug) || pages.has(slug)) continue;
  let family;
  if (slug === 'corsi-unime-messina') family = 'unime-catalog';
  else if (courses.has(slug)) family = 'unime-course';
  else if (slug.startsWith('scuole-superiori-')) family = 'province';
  else if (/^(liceo-|istituto-tecnico-)/.test(slug)) family = 'school-track';
  else if (slug.startsWith('simulazione-tolc-')) family = 'simulation';
  else if (/^tolc-(i|e|f|b|av|s|su|sps|psi|lp)$/.test(slug)) family = 'tolc-type';
  else if (/^tolc-(messina|catania|palermo|enna)$/.test(slug)) family = 'tolc-local';
  else if (slug === 'quiz-logica-tolc') family = 'quiz-guide';
  else if (['privacy', 'terms'].includes(slug)) family = 'legal';
  else if (slug.includes('tolc')) family = 'tolc-guide';
  else throw new Error(`Classify this page before rollout: ${slug}`);
  pages.set(slug, { slug, family, source: `public/${name}`, reason: 'Rebranding completo richiesto il 26/09/2026' });
}
pages.set('index', {slug:'index', family:'entry-hub', source:'index.html', reason:'Ingresso Cortex coerente con app e landing'});
const registry = {mode:'rollout', expectedPageCount:pages.size, protected:excluded,
  pages:[...pages.values()].sort((a,b)=>a.slug.localeCompare(b.slug))};
fs.writeFileSync(file, JSON.stringify(registry,null,2)+'\n');
console.log(JSON.stringify({count:pages.size, families: registry.pages.reduce((a,p)=>(a[p.family]=(a[p.family]||0)+1,a),{})}));
