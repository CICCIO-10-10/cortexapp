// Revisione PR #2 / PR #4 (16/10/2026): metriche degli account in adminDashboard (functions/index.js).
// Si esegue la VERA sezione di index.js che calcola i contatori utente (dal sorgente, come negli altri test),
// con Firestore e Firebase Auth finti e dati sintetici. Nessun dato di produzione.
//
// Difetto: usersActivated, usersFirstReview, usersByPlan, usersPlanUnclassified, usersNoEmail, totalUsers
// contavano TUTTI i documenti users/{uid} tranne l'admin: anche gli ospiti anonimi (che con l'AI hanno un uid
// e, prima della PR #4, una activation) e i documenti di identità non più esistenti. Le metriche Auth
// (registrazioni, attivi) invece escludono già gli anonimi: due definizioni di "utente" nella stessa dashboard.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
const START = SRC.indexOf("const ADMIN_UID = 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2';  // account di Francesco");
const END = SRC.indexOf('// Presenza: breakdown per pagina e sorgente');
const SECTION = SRC.slice(START, END);
const OUT = ['usersActivated', 'usersAiActivated', 'usersFirstReview', 'usersStudyReturned', 'usersByPlan', 'usersPlanUnclassified',
    'usersNoEmail', 'usersWithSparks', 'usersWithFCM', 'authMetricsAvailable', 'authAccountsTotal', 'authAnonymousTotal', 'usersDetail'];
const OPT = ['totalUsers', 'guestProfiles', 'accountMetricsAvailable'];

const ADMIN = 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2';
const T = '2026-10-01T10:00:00Z';
const google = (uid, extra = {}) => ({ uid, providerData: [{ providerId: 'google.com' }], email: uid + '@example.com', metadata: { creationTime: T, lastSignInTime: T }, ...extra });
const anon = (uid) => ({ uid, providerData: [], metadata: { creationTime: T, lastSignInTime: T } });
const act = { activated: true, activatedAt: 1, activatedVia: 'deck', firstReviewCompletedAt: 1, firstReviewDay: '2026-10-01', studyReturnedAt: 2 };

// Dati sintetici: chi è chi.
const PROFILES = {
    [ADMIN]: { plan: 'pro', email: 'admin@example.com', activation: act },                        // admin: mai contato
    'anon-vecchio': { activation: act, gamification: { xp: 30 } },                               // ospite anonimo con activation storica
    'anon-scaduto': { activation: act },                                                          // ospite anonimo non più in Auth
    'acc-1': { plan: 'free', email: 'acc-1@example.com', activation: act },                       // account Google attivato
    'acc-senza-email': { activation: { firstReviewCompletedAt: 1, firstReviewDay: '2026-10-02' } }, // Google, doc senza email (bug 12/09)
    'acc-test': { plan: 'free', email: 'tester@example.com' },                                    // account di test: nessun marcatore lato server
    'pagante': { plan: 'student', email: 'p@example.com', sparksBalance: 50, activation: act },     // abbonato con Sparks
    'eliminato': { plan: 'free', email: 'x@example.com', activation: act },                       // Auth disattivato (recupero eliminazione)
};
const AUTH = [google(ADMIN), anon('anon-vecchio'), google('acc-1'), google('acc-senza-email', { email: undefined }), google('acc-test'),
    google('pagante'), google('eliminato', { disabled: true })];

async function run({ authFails = false } = {}) {
    const usersSnap = { docs: Object.entries(PROFILES).map(([id, d]) => ({ id, data: () => d })) };
    const ctx = vm.createContext({
        usersSnap, today: '2026-10-16', console: { error() {}, log() {} }, Intl, Date, Math, Object, Array, Set, Map, Number, String, JSON, Promise,
        admin: { auth: () => ({ listUsers: async () => { if (authFails) throw new Error('auth down'); return { users: AUTH, pageToken: undefined }; } }) },
        db: { collection: () => ({ doc: () => ({ collection: () => ({ get: async () => ({ forEach() {} }) }) }) }) },
    });
    const ret = '{' + [...OUT, ...OPT.map(k => `${k}: typeof ${k} === 'undefined' ? undefined : ${k}`)].join(',') + '}';
    return vm.runInContext(`(async () => { ${SECTION}\n return ${ret}; })()`, ctx);
}

describe('adminDashboard: metriche degli account registrati', () => {
    it('contano solo gli account collegati (Google), non ospiti anonimi anche storici, admin o account disattivati', async () => {
        const r = await run();
        expect(r.usersActivated).toBe(2);                 // acc-1, pagante
        expect(r.usersFirstReview).toBe(3);               // acc-1, acc-senza-email, pagante
        expect(r.usersStudyReturned).toBe(2);
        expect(r.usersByPlan).toEqual({ free: 2, student: 1, pro: 0, other: 0 });   // acc-1, acc-test | pagante
        expect(r.usersPlanUnclassified).toBe(1);          // acc-senza-email (non gli anonimi)
        expect(r.usersNoEmail).toBe(1);
        expect(r.usersWithSparks).toBe(1);
        expect(r.totalUsers).toBe(4);                     // acc-1, acc-senza-email, acc-test, pagante
        expect(r.usersDetail.map(u => u.uid).sort()).toEqual(['acc-1', 'acc-se', 'acc-te', 'pagant']);
    });
    it('un account Google senza email nel profilo resta un account (non si usa "email presente")', async () => {
        const r = await run();
        expect(r.usersFirstReview).toBe(3);
        expect(r.usersNoEmail).toBe(1);
    });
    it('gli ospiti restano visibili in una metrica separata', async () => {
        const r = await run();
        expect(r.guestProfiles).toEqual({ total: 1, activated: 1, firstReview: 1 });   // anon-vecchio (presente in Auth come anonimo)
    });
    it('le metriche Auth (già corrette) non cambiano', async () => {
        const r = await run();
        expect(r.authAccountsTotal).toBe(4);              // admin e disattivato esclusi
        expect(r.authAnonymousTotal).toBe(1);
    });
    it('se Firebase Auth non risponde i conteggi account sono "non disponibili", non mescolati agli ospiti', async () => {
        const r = await run({ authFails: true });
        expect(r.accountMetricsAvailable).toBe(false);
        expect(r.usersActivated).toBeNull();
        expect(r.usersFirstReview).toBeNull();
        expect(r.totalUsers).toBeNull();
        expect(r.usersDetail).toEqual([]);
    });
});
