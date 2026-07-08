/**
 * tests/unit.test.js — Cortex Unit Tests (Vitest)
 *
 * Strategia: stub delle dipendenze DOM/localStorage per testare
 * la logica pura delle funzioni critiche in ambiente Node.
 *
 * Eseguire con: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// STUB: localStorage (Node non ce l'ha nativamente nel contesto test)
// ─────────────────────────────────────────────────────────────────────────────
const _store = {};
const localStorageStub = {
    getItem:    (k)    => _store[k] ?? null,
    setItem:    (k, v) => { _store[k] = String(v); },
    removeItem: (k)    => { delete _store[k]; },
    clear:      ()     => { Object.keys(_store).forEach(k => delete _store[k]); },
};
global.localStorage = localStorageStub;

// ─────────────────────────────────────────────────────────────────────────────
// FUNZIONI TESTATE (copiate/estratte dalla logica dei moduli per isolarle)
// Questo evita di importare moduli con dipendenze DOM non disponibili in Node.
// ─────────────────────────────────────────────────────────────────────────────

// --- da js/utils.js ---
function sanitizeHTML(str) {
    if (!str) return '';
    // Simula l'escape DOM tramite regex (equivalente funzionale per test Node)
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        // Ripristina tag sicuri (stessa logica di utils.js)
        .replace(/&lt;br&gt;/g, '<br>')
        .replace(/&lt;b&gt;/g, '<b>')
        .replace(/&lt;\/b&gt;/g, '</b>')
        .replace(/&lt;strong&gt;/g, '<strong>')
        .replace(/&lt;\/strong&gt;/g, '</strong>');
}

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function daysDiff(a, b) {
    return Math.floor((new Date(b) - new Date(a)) / 86400000);
}

function fisherYatesShuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// --- da modules/gamification.js ---
const LEVELS = [
    { name: 'Novizio',  cls: 'novizio',  icon: '🌱', min: 0    },
    { name: 'Studente', cls: 'studente', icon: '📖', min: 100  },
    { name: 'Scholar',  cls: 'scholar',  icon: '🎓', min: 300  },
    { name: 'Campione', cls: 'campione', icon: '🏆', min: 700  },
    { name: 'Maestro',  cls: 'maestro',  icon: '⚡', min: 1500 },
];

function getLevel(xp) {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (xp >= LEVELS[i].min) return LEVELS[i];
    }
    return LEVELS[0];
}

function getNextLevel(xp) {
    const cur = getLevel(xp);
    const idx = LEVELS.indexOf(cur);
    return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
}

// --- da modules/architect.js ---
const OWNER_UID   = 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2';
const OWNER_EMAIL = 'francesco1cutugno@gmail.com';

function isAdmin(firebaseUser = null) {
    if (!firebaseUser) return false;
    return firebaseUser.uid === OWNER_UID || firebaseUser.email === OWNER_EMAIL;
}

// --- da services/ai.js ---
const RATE_LIMIT_MS = 2000;
let _lastCall = 0;

function isRateLimited() {
    const now = Date.now();
    const wait = RATE_LIMIT_MS - (now - _lastCall);
    if (wait > 0) return true;
    _lastCall = now;
    return false;
}

function resetRateLimit() { _lastCall = 0; }

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeHTML — sicurezza XSS', () => {
    it('blocca i tag <script>', () => {
        const out = sanitizeHTML('<script>alert("xss")</script>');
        expect(out).not.toContain('<script>');
        expect(out).not.toContain('</script>');
    });

    it('blocca onclick inline (tag HTML neutralizzato via escaping)', () => {
        const out = sanitizeHTML('<img onclick="evil()">');
        // sanitizeHTML converte < e > in entità: il tag non è più eseguibile
        expect(out).not.toContain('<img');       // nessun tag img raw
        expect(out).toContain('&lt;img');         // esiste solo come testo safe
    });

    it('stringa vuota → stringa vuota', () => {
        expect(sanitizeHTML('')).toBe('');
        expect(sanitizeHTML(null)).toBe('');
    });

    it('permette tag <br> dopo il ripristino', () => {
        const out = sanitizeHTML('<br>');
        expect(out).toContain('<br>');
    });

    it('permette <b> e <strong>', () => {
        const out = sanitizeHTML('<b>Bold</b> e <strong>forte</strong>');
        expect(out).toContain('<b>');
        expect(out).toContain('<strong>');
    });
});

describe('escapeHTML — escape di base', () => {
    it('converte < e > in entità', () => {
        const out = escapeHTML('<div>test</div>');
        expect(out).toBe('&lt;div&gt;test&lt;/div&gt;');
    });

    it('gestisce stringa vuota', () => {
        expect(escapeHTML('')).toBe('');
        expect(escapeHTML(null)).toBe('');
    });
});

describe('getLevel / getNextLevel — calcolo XP', () => {
    it('0 XP → Novizio', () => {
        expect(getLevel(0).name).toBe('Novizio');
    });

    it('100 XP → Studente', () => {
        expect(getLevel(100).name).toBe('Studente');
    });

    it('300 XP → Scholar', () => {
        expect(getLevel(300).name).toBe('Scholar');
    });

    it('700 XP → Campione', () => {
        expect(getLevel(700).name).toBe('Campione');
    });

    it('1500 XP → Maestro (livello max)', () => {
        expect(getLevel(1500).name).toBe('Maestro');
        expect(getNextLevel(1500)).toBeNull();
    });

    it('99 XP → next level è Studente (min 100)', () => {
        const next = getNextLevel(99);
        expect(next).not.toBeNull();
        expect(next.min).toBe(100);
    });

    it('XP intermedi (450) → Scholar, next è Campione', () => {
        expect(getLevel(450).name).toBe('Scholar');
        expect(getNextLevel(450).name).toBe('Campione');
    });
});

describe('isAdmin — controllo identità admin', () => {
    it('restituisce false se Firebase non è inizializzato (null)', () => {
        expect(isAdmin(null)).toBe(false);
    });

    it('restituisce false per utente generico', () => {
        expect(isAdmin({ uid: 'abc123', email: 'user@example.com' })).toBe(false);
    });

    it('restituisce true per UID admin corretto', () => {
        expect(isAdmin({ uid: OWNER_UID, email: 'other@test.com' })).toBe(true);
    });

    it('restituisce true per email admin corretta', () => {
        expect(isAdmin({ uid: 'anyuid', email: OWNER_EMAIL })).toBe(true);
    });
});

describe('Rate limit Gemini — throttle anti-spam', () => {
    beforeEach(() => {
        resetRateLimit();
    });

    it('prima chiamata → non bloccata', () => {
        expect(isRateLimited()).toBe(false);
    });

    it('seconda chiamata ravvicinata → bloccata', () => {
        isRateLimited(); // Prima chiamata: registra _lastCall
        expect(isRateLimited()).toBe(true); // Seconda: bloccata
    });
});

describe('fisherYatesShuffle — rimescola array', () => {
    it('mantiene la lunghezza invariata', () => {
        const arr = [1, 2, 3, 4, 5];
        expect(fisherYatesShuffle(arr)).toHaveLength(5);
    });

    it('non muta l\'array originale', () => {
        const arr = [1, 2, 3];
        fisherYatesShuffle(arr);
        expect(arr).toEqual([1, 2, 3]);
    });

    it('contiene gli stessi elementi', () => {
        const arr = [10, 20, 30, 40];
        const result = fisherYatesShuffle(arr);
        expect(result.sort()).toEqual([10, 20, 30, 40]);
    });
});

describe('todayStr + daysDiff — date utils', () => {
    it('todayStr ha formato YYYY-MM-DD', () => {
        expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('daysDiff tra date uguali = 0', () => {
        expect(daysDiff('2024-01-01', '2024-01-01')).toBe(0);
    });

    it('daysDiff di 7 giorni', () => {
        expect(daysDiff('2024-01-01', '2024-01-08')).toBe(7);
    });
});
