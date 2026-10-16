// Test 16/10/2026: il banner "Attiva le notifiche" non deve coprire il ripasso (a 390 px prendeva i tocchi
// dei pulsanti di valutazione). Prova nel browser: scripts/banner-notifiche-2026-10/repro-390.cjs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../modules/study.js', import.meta.url), 'utf8');
const helpers = src.slice(src.indexOf('function _hideNotifBannerForStudy'), src.indexOf('// ── Privata (chiamata da showCard)'));
const { hide, restore } = new Function(helpers + '\nreturn { hide: _hideNotifBannerForStudy, restore: _restoreNotifBannerAfterStudy };')();

function banner(display = '') {
  return { style: { display }, dataset: {} };
}
function doc(list) {
  return {
    querySelectorAll(sel) {
      if (sel === '.notif-banner') return list;
      if (sel === '.notif-banner[data-cx-study-hidden="1"]') return list.filter(b => b.dataset.cxStudyHidden === '1');
      return [];
    },
  };
}

describe('banner notifiche durante il ripasso', () => {
  it('startStudy lo nasconde e closeStudy lo rimette', () => {
    const start = src.slice(src.indexOf('export async function startStudy('), src.indexOf('export function closeStudy'));
    expect(start).toContain('_hideNotifBannerForStudy(document)');
    const close = src.slice(src.indexOf('export function closeStudy'), src.indexOf('function _hideNotifBannerForStudy'));
    expect(close).toContain('_restoreNotifBannerAfterStudy(document)');
  });

  it('nasconde il banner visibile e alla chiusura lo mostra di nuovo', () => {
    const b = banner();
    const d = doc([b]);
    hide(d);
    expect(b.style.display).toBe('none');
    restore(d);
    expect(b.style.display).toBe('');
    expect(b.dataset.cxStudyHidden).toBeUndefined();
  });

  it('non riaccende un banner nascosto da altri (mazzo errori TOLC)', () => {
    const b = banner('none');
    b.dataset.cxTolcHidden = '1';
    const d = doc([b]);
    hide(d);
    restore(d);
    expect(b.style.display).toBe('none');
    expect(b.dataset.cxTolcHidden).toBe('1');
  });

  it('senza banner non fa nulla', () => {
    expect(() => { hide(doc([])); restore(doc([])); }).not.toThrow();
  });
});
