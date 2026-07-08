/**
 * scripts/i18n-validate.js
 * Valida che tutte le lingue abbiano tutte le chiavi presenti in IT (lingua base).
 *
 * Uso:  node scripts/i18n-validate.js
 *       node scripts/i18n-validate.js --strict   (esce con codice 1 se ci sono missing)
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load translations via dynamic import
const { TRANSLATIONS } = await import(
    pathToFileURL(path.join(ROOT, 'data/translations.js')).href
);

const strict = process.argv.includes('--strict');
const LANGS = Object.keys(TRANSLATIONS);
const BASE = 'it';
const baseKeys = new Set(Object.keys(TRANSLATIONS[BASE]));

console.log(`\n📋 i18n validation — base: ${BASE} (${baseKeys.size} chiavi)\n`);

let totalMissing = 0;
let totalExtra = 0;

for (const lang of LANGS) {
    if (lang === BASE) continue;
    const langKeys = new Set(Object.keys(TRANSLATIONS[lang]));

    const missing = [...baseKeys].filter(k => !langKeys.has(k));
    const extra   = [...langKeys].filter(k => !baseKeys.has(k));

    if (missing.length === 0 && extra.length === 0) {
        console.log(`  ✅  ${lang}  — completo`);
    } else {
        console.log(`  ❌  ${lang}  — ${missing.length} mancanti, ${extra.length} extra`);
        if (missing.length) {
            missing.forEach(k => console.log(`        MISSING: ${k}`));
        }
        if (extra.length) {
            extra.forEach(k => console.log(`        EXTRA:   ${k}`));
        }
    }
    totalMissing += missing.length;
    totalExtra   += extra.length;
}

console.log(`\n${totalMissing === 0 ? '✅ Tutto ok' : `⚠️  ${totalMissing} chiavi mancanti in totale`}\n`);

if (strict && totalMissing > 0) process.exit(1);
