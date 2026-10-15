import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const start = html.lastIndexOf('(function(){', html.indexOf('window.__cxLib=function'));
const code = html.slice(start, html.indexOf('</script>', start));
afterEach(() => vi.useRealTimers());

describe('library loading and retry', () => {
  function setup() {
    const scripts = [];
    const context = {window: {addEventListener() {}}, document: {
      createElement: () => ({setAttribute() {}, remove() {this.removed = true;}}),
      head: {appendChild: s => scripts.push(s)}
    }, setTimeout, clearTimeout, Promise, Error};
    vm.runInNewContext(code, context);
    return {load: context.window.__cxLib, scripts};
  }
  it('expires a blocked request and allows a fresh successful retry', async () => {
    vi.useFakeTimers();
    const {load, scripts} = setup();
    const first = load('pdf');
    expect(load('pdf')).toBe(first);
    const failure = first.catch(e => e);
    const lateLoad = scripts[0].onload;
    await vi.advanceTimersByTimeAsync(30001);
    expect((await failure).message).toMatch(/scaduto/);
    expect(scripts[0].removed).toBe(true);
    const retry = load('pdf');
    expect(scripts[1].src).not.toBe(scripts[0].src);
    lateLoad();
    expect(load('pdf')).toBe(retry);
    scripts[1].onload();
    await retry;
    await vi.advanceTimersByTimeAsync(30001);
    expect(load('pdf')).toBe(retry);
    expect(scripts[1].removed).not.toBe(true);
  });
  it('network failure removes the script and frees the cached request', async () => {
    const {load, scripts} = setup();
    const first = load('pdf').catch(e => e);
    scripts[0].onerror(new Error('network'));
    expect((await first).message).toBe('network');
    const retry = load('pdf');
    scripts[1].onload();
    await retry;
    expect(scripts).toHaveLength(2);
  });
});
