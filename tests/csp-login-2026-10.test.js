// 04/10/2026 — l'accesso con Google era rotto: la CSP non permetteva https://apis.google.com/js/api.js,
// che l'SDK Firebase Auth carica per popup e redirect → "auth/internal-error" (riprodotto sul sito vero).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
describe('CSP compatibile con l\'accesso Google (Firebase Auth)', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  const hostings = Array.isArray(cfg.hosting) ? cfg.hosting : [cfg.hosting];
  const csp = hostings.flatMap(h => h.headers || []).flatMap(x => x.headers).filter(y => y.key === 'Content-Security-Policy').map(y => y.value);
  it('ogni CSP permette lo script e i frame di Google usati dal login', () => {
    expect(csp.length).toBeGreaterThan(0);
    for (const v of csp) {
      const dir = name => (v.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '');
      expect(dir('script-src')).toContain('https://apis.google.com');
      expect(dir('frame-src')).toContain('https://apis.google.com');
      expect(dir('frame-src')).toMatch(/'self'/);
      expect(dir('connect-src')).toContain('https://identitytoolkit.googleapis.com');
      expect(dir('connect-src')).toContain('https://securetoken.googleapis.com');
    }
  });
});
