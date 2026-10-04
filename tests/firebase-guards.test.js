// Regressione (04/10/2026): "promise: firebase is not defined" / "Can't find variable: firebase".
// `firebase?.apps` NON protegge da un identificatore globale non dichiarato: quando lo script
// dell'SDK (gstatic) non si carica lancia ReferenceError. Nel codice client è ammesso solo
// `typeof firebase !== 'undefined'` oppure `window.firebase?.…`.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(__dirname, '..');
const DIRS = ['core', 'modules', 'services', 'js', 'ui'];

function files(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...files(p));
        else if (p.endsWith('.js')) out.push(p);
    }
    return out;
}

describe('guardie Firebase nel codice client', () => {
    it('nessun accesso "firebase?." a un identificatore non dichiarato', () => {
        const offenders = [];
        const all = [...DIRS.flatMap(d => files(join(ROOT, d))), join(ROOT, 'main.js')];
        for (const f of all) {
            readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
                if (/(?<![\w.$])firebase\?\./.test(line)) offenders.push(f.replace(ROOT, '') + ':' + (i + 1));
            });
        }
        expect(offenders).toEqual([]);
    });

    it('syncToCloud / loadFromCloud / loadDeckFromSubcollection non lanciano se l\'SDK manca', async () => {
        const src = readFileSync(join(ROOT, 'services/firebase.js'), 'utf8');
        // Estrae una funzione dal sorgente: dalla firma alla prima "}" a inizio riga.
        const fn = sig => { const a = src.indexOf(sig); const b = src.indexOf('\n}\n', a); return src.slice(a, b + 3).replace(/^export /, ''); };
        const ctx = vm.createContext({ window: { _fbUserId: 'u1' }, console, hydrateFromIDB: async () => {} });
        vm.runInContext('let _syncInFlight = false, _syncPending = false;\n' + fn('export async function syncToCloud('), ctx);
        vm.runInContext(fn('export async function loadFromCloud('), ctx);
        vm.runInContext(fn('export async function loadDeckFromSubcollection('), ctx);
        await expect(vm.runInContext('syncToCloud()', ctx)).resolves.toBeUndefined();
        await expect(vm.runInContext('loadFromCloud()', ctx)).resolves.toBeUndefined();
        await expect(vm.runInContext('loadDeckFromSubcollection("d1")', ctx)).resolves.toBeNull();
    });
});
