/**
 * scripts/i18n-add-language.js
 * Aggiunge una nuova lingua a translations.js copiando tutte le chiavi dall'italiano.
 * Le stringhe vengono pre-riempite con il testo IT così l'app non crasha mai.
 * Poi puoi tradurre manualmente (o con i18n-translate.js).
 *
 * Uso:  node scripts/i18n-add-language.js <codice_lingua>
 *   es: node scripts/i18n-add-language.js pt
 *       node scripts/i18n-add-language.js ja
 */

import { readFileSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TRANS_PATH = path.join(ROOT, 'data/translations.js');

const newLang = process.argv[2];
if (!newLang) {
    console.error('❌ Specifica il codice lingua: node scripts/i18n-add-language.js <codice>');
    process.exit(1);
}

// Load current translations
const { TRANSLATIONS } = await import(pathToFileURL(TRANS_PATH).href);

if (TRANSLATIONS[newLang]) {
    console.error(`❌ La lingua "${newLang}" esiste già in translations.js`);
    process.exit(1);
}

const baseKeys = TRANSLATIONS['it'];

// Build the new language block, pre-filled with IT values
function escapeVal(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const lines = [
    `    ${newLang}: {`,
    `        // ⚠️  AUTO-GENERATO da i18n-add-language.js — traduci le stringhe!`,
    `        // Partenza: italiano — sostituisci con ${newLang.toUpperCase()}`,
];

for (const [key, val] of Object.entries(baseKeys)) {
    lines.push(`        ${key}: '${escapeVal(val)}',`);
}

lines.push(`    },`);
const block = lines.join('\n');

// Append before the closing `}` of TRANSLATIONS
let content = readFileSync(TRANS_PATH, 'utf-8');
const lastBrace = content.lastIndexOf('\n};');
if (lastBrace === -1) {
    console.error('❌ Non riesco a trovare la fine di TRANSLATIONS in translations.js');
    process.exit(1);
}

content = content.slice(0, lastBrace) + '\n' + block + '\n};';
writeFileSync(TRANS_PATH, content, 'utf-8');

console.log(`\n✅ Lingua "${newLang}" aggiunta a translations.js con ${Object.keys(baseKeys).length} chiavi.`);
console.log(`\n👉 Prossimi passi:`);
console.log(`   1. Apri data/translations.js e cerca il blocco "${newLang}:"`);
console.log(`   2. Traduci le stringhe (o usa i18n-translate.js per farlo con l'AI)`);
console.log(`   3. Aggiungi la lingua al selettore in app.html`);
console.log(`   4. npm run i18n:validate  — verifica che sia tutto completo`);
console.log(`   5. npm run build\n`);
