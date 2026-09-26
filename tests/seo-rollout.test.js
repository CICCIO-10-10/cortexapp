import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { registry, projectRoot, injectDesign, stripDesign, validateRegistry } from '../scripts/seo-design-plugin.mjs';

describe('complete landing design rollout', () => {
  it('covers all public HTML except explicitly excluded technical pages', () => {
    validateRegistry();
    const publicPages = fs.readdirSync(path.join(projectRoot, 'public')).filter(f => f.endsWith('.html'));
    for (const name of publicPages) {
      const slug = name.slice(0, -5);
      expect(registry.pages.some(p => p.slug === slug) || registry.protected.includes(slug), slug).toBe(true);
    }
  });
  it('preserves every source document byte for byte after removing styling', () => {
    for (const page of registry.pages) {
      const source = fs.readFileSync(path.join(projectRoot, page.source), 'utf8');
      const styled = injectDesign(source, page);
      expect(stripDesign(styled), page.slug).toBe(source);
      expect(injectDesign(styled, page), page.slug).toBe(styled);
    }
  });
  it('rejects administration and OAuth pages', () => {
    for (const slug of registry.protected) {
      expect(() => injectDesign('<head></head><body></body>', {slug, family:'legal'})).toThrow();
    }
  });
});
