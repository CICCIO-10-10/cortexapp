import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { guardTracking, stripTrackingGuard, clarityPrefix } from '../scripts/tracking-guard.mjs';

describe('Clarity production and opt-out guard', () => {
  const source = clarityPrefix + 'c.loaded=true;})(window);';
  function run(hostname, search = '', optout = null) {
    const window = {};
    vm.runInNewContext(guardTracking(source), { window, location: { hostname, search }, URLSearchParams, localStorage: { getItem: () => optout } });
    return window.loaded === true;
  }
  it('allows production only and honors both opt-outs', () => {
    expect(run('cortexapp.it')).toBe(true);
    expect(run('www.cortexapp.it')).toBe(true);
    expect(run('127.0.0.1')).toBe(false);
    expect(run('cortexapp.it', '?notrack=1')).toBe(false);
    expect(run('cortexapp.it', '', '1')).toBe(false);
    expect(run('cortexapp.it.example.com')).toBe(false);
  });
  it('is reversible and idempotent without changing content', () => {
    expect(stripTrackingGuard(guardTracking(source))).toBe(source);
    expect(guardTracking(guardTracking(source))).toBe(guardTracking(source));
  });
});
