/**
 * scripts/i18n-translate.js
 * Traduce automaticamente le chiavi mancanti usando Gemini.
 * Richiede GEMINI_API_KEY come variabile d'ambiente.
 *
 * Uso:  GEMINI_API_KEY=xxx node scripts/i18n-translate.js <codice_lingua>
 *   es: GEMINI_API_KEY=xxx node scripts/i18n-translate.js de
 *       GEMINI_API_KEY=xxx node scripts/i18n-translate.js pt   (dopo add-language)
 */

import { readFileSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TRANS_PATH = path.join(ROOT, 'data/translations.js');

const targetLang = process.argv[2];
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!targetLang) {
    console.error('❌ Specifica il codice lingua: node scripts/i18n-translate.js <codice>');
    process.exit(1);
}
if (!GEMINI_KEY) {
    console.error('❌ Manca GEMINI_API_KEY. Esporta la variabile prima di lanciare.');
    process.exit(1);
}

const { TRANSLATIONS } = await import(pathToFileURL(TRANS_PATH).href);

if (!TRANSLATIONS[targetLang]) {
    console.error(`❌ La lingua "${targetLang}" non esiste in translations.js. Usa prima i18n-add-language.js.`);
    process.exit(1);
}

const baseKeys   = TRANSLATIONS['it'];
const targetKeys = TRANSLATIONS[targetLang];
const LANG_NAMES = { en:'English', es:'Spanish', fr:'French', de:'German', pt:'Portuguese', ja:'Japanese', zh:'Chinese', ar:'Arabic' };
const langName   = LANG_NAMES[targetLang] || targetLang;

// Find keys that are still identical to IT (untranslated stubs)
const toTranslate = Object.entries(baseKeys).filter(([k, v]) => targetKeys[k] === v);

if (toTranslate.length === 0) {
    console.log(`✅ Nessuna chiave da tradurre per "${targetLang}".`);
    process.exit(0);
}

console.log(`\n🌐 Traduco ${toTranslate.length} chiavi IT → ${langName}...\n`);

// Batch translate via Gemini (max 80 keys per request to stay under token limit)
const BATCH = 80;
const translated = {};

for (let i = 0; i < toTranslate.length; i += BATCH) {
    const batch = toTranslate.slice(i, i + BATCH);
    const jsonInput = JSON.stringify(Object.fromEntries(batch), null, 2);

    const prompt = `You are a professional UI translator. Translate the following JSON object values from Italian to ${langName}.
Rules:
- Keep the keys exactly as-is (do NOT translate keys)
- Preserve emojis, HTML entities, and placeholders like {name} or %s exactly
- UI strings must be concise and natural in ${langName}
- Return ONLY valid JSON, no explanation

Input:
${jsonInput}`;

    const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
    );

    if (!resp.ok) {
        console.error(`❌ Gemini error ${resp.status}: ${await resp.text()}`);
        process.exit(1);
    }

    const data = await resp.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonStr = raw.match(/```json\n?([\s\S]*?)\n?```/)?.[1] || raw.trim();

    try {
        const result = JSON.parse(jsonStr);
        Object.assign(translated, result);
        process.stdout.write(`  batch ${Math.floor(i/BATCH)+1}/${Math.ceil(toTranslate.length/BATCH)} ✓\n`);
    } catch {
        console.error(`❌ JSON parse error nella risposta Gemini:\n${jsonStr}`);
        process.exit(1);
    }
}

// Patch translations.js: replace the target language block
function escapeVal(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Merge: existing manually-translated keys + new Gemini translations
const merged = { ...targetKeys, ...translated };

const newBlock = [
    `    ${targetLang}: {`,
    ...Object.entries(merged).map(([k, v]) => `        ${k}: '${escapeVal(v)}',`),
    `    },`,
].join('\n');

let content = readFileSync(TRANS_PATH, 'utf-8');

// Replace existing block for this language
const langRegex = new RegExp(
    `(    ${targetLang}: \\{)[\\s\\S]*?(    \\},)`,
    'g'
);
const matches = [...content.matchAll(langRegex)];
if (matches.length !== 1) {
    console.error(`❌ Trovati ${matches.length} blocchi per "${targetLang}" in translations.js. Controlla manualmente.`);
    process.exit(1);
}

content = content.replace(langRegex, newBlock);
writeFileSync(TRANS_PATH, content, 'utf-8');

console.log(`\n✅ ${Object.keys(translated).length} chiavi tradotte e salvate in translations.js`);
console.log(`👉 Verifica: npm run i18n:validate`);
console.log(`👉 Build:    npm run build\n`);
