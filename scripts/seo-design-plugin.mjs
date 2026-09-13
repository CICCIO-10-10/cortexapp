import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const registry = JSON.parse(fs.readFileSync(path.join(projectRoot, 'scripts/seo-pages.json'), 'utf8'));
export const styleBlock = '\n<!-- cortex-seo-pilot:start -->\n' +
  ['tokens', 'components', 'seo-adapters'].map(name => `<link rel="stylesheet" href="/cortex-design/${name}.css">`).join('\n') +
  '\n<!-- cortex-seo-pilot:end -->\n';

// Opt-in local QA instrumentation. Never written to build output.
const auditScript = `<script>(function(){
  var start=0,last=0,session=0,max=0;
  document.documentElement.dataset.cortexCls='0';
  if(window.PerformanceObserver){try{new PerformanceObserver(function(list){
    list.getEntries().forEach(function(e){if(e.hadRecentInput)return;
      if(e.startTime-last<1000&&e.startTime-start<5000){session+=e.value;}
      else{start=e.startTime;session=e.value;}last=e.startTime;max=Math.max(max,session);
      document.documentElement.dataset.cortexCls=String(max);
    });
  }).observe({type:'layout-shift',buffered:true});}catch(e){document.documentElement.dataset.cortexCls='unsupported';}}
})();</script>`;

export function validateRegistry(root = projectRoot) {
  if (registry.mode !== 'pilot' || registry.pages.length !== 13 || registry.expectedPilotCount !== 13)
    throw new Error('SEO pilot guard: exactly 13 explicitly selected pages required. Rollout is disabled.');
  const seen = new Set();
  for (const page of registry.pages) {
    if (!/^[a-z0-9-]+$/.test(page.slug) || !/^[a-z0-9-]+$/.test(page.family) || seen.has(page.slug) || registry.protected.includes(page.slug))
      throw new Error(`Invalid or protected pilot: ${page.slug}`);
    if (![`${page.slug}.html`, `public/${page.slug}.html`].includes(page.source) || !fs.existsSync(path.join(root, page.source)))
      throw new Error(`Missing or invalid source: ${page.source}`);
    seen.add(page.slug);
  }
}

/** Add assets and a scope marker only. Never parse/reserialize the SEO document. */
export function injectDesign(html, page) {
  if (!registry.pages.some(p => p.slug === page.slug && p.family === page.family)) throw new Error('Page outside pilot');
  if (html.includes('<!-- cortex-seo-pilot:start -->')) return html;
  if (!/<\/head>/i.test(html) || !/<body(?:\s[^>]*)?>/i.test(html)) throw new Error(`Invalid HTML: ${page.slug}`);
  return html.replace(/<\/head>/i, styleBlock + '</head>')
    .replace(/<body(?=[\s>])/i, `<body data-cortex-seo="${page.family}"`);
}

export function stripDesign(html) {
  return html.replace(styleBlock, '').replace(/ data-cortex-seo="[a-z-]+"/, '');
}

export default function seoDesignPlugin() {
  let root;
  let outDir;
  let isBuild = false;
  const middleware = (preview = false) => (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    const url = new URL(req.url, 'http://localhost');
    const slug = url.pathname.replace(/^\//, '').replace(/\.html$/, '');
    const page = registry.pages.find(p => p.slug === slug);
    if (!page) return next();
    // Local QA only. Production HTML has no query-controlled styling logic.
    const baseline = url.searchParams.get('cortex-baseline') === '1';
    const source = preview && !baseline ? path.join(outDir, `${page.slug}.html`) : path.join(root, page.source);
    const html = fs.readFileSync(source, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    let response = baseline ? html : injectDesign(html, page);
    if (url.searchParams.get('cortex-audit') === '1') response = response.replace(/<head>/i, '<head>' + auditScript);
    res.end(req.method === 'HEAD' ? undefined : response);
  };
  return {
    name: 'cortex-seo-pilot',
    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
      outDir = path.resolve(root, config.build.outDir);
      validateRegistry(root);
    },
    configureServer(server) { server.middlewares.use(middleware()); },
    configurePreviewServer(server) { server.middlewares.use(middleware(true)); },
    closeBundle() {
      // Public HTML is copied by Vite, while root inputs are compiled. Handle both
      // only after output is complete. No source HTML or nonpilot output is edited.
      if (!isBuild || !outDir || !fs.existsSync(outDir)) return;
      for (const page of registry.pages) {
        const target = path.join(outDir, `${page.slug}.html`);
        if (!fs.existsSync(target)) throw new Error(`Pilot output missing: ${target}`);
        fs.writeFileSync(target, injectDesign(fs.readFileSync(target, 'utf8'), page));
      }
    }
  };
}
