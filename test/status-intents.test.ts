/**
 * Status intents beyond the base five: `status.intents` puts a further intent
 * on a semantic hue (`new` → brand). It gets the same parts and the same
 * contracts as the base intents; the base five stay on their namesake hues.
 */
import { describe, expect, it } from 'vitest';
import { generateModel, overlay, parseRecipe, RecipeError, recipeDefaults } from '../src/index.js';
import { fixture } from './fixture.js';

type Doc = Record<string, any>;
const build = (intents: Record<string, string>) => {
  const doc = structuredClone(fixture()) as Doc;
  doc.status = { intents };
  return generateModel(parseRecipe(overlay(recipeDefaults, doc)));
};
const errorOf = (run: () => unknown) => {
  try {
    run();
  } catch (e) {
    return e;
  }
  throw new Error('expected an error');
};

describe('status.intents', () => {
  const out = build({ new: 'brand' });
  const css = out.files['model.css'];

  it('adds status-new-* on the brand steps the recipe assigns to status', () => {
    const s = recipeDefaults.status as Doc;
    for (const e of ['strong', 'subtle'])
      for (const part of ['surface', 'content', 'indicator'])
        expect(css).toContain(`--x-status-new-${part}-${e}: var(--x-brand-${s[e][part]});`);
  });

  it('runs every status contract for the added intent', () => {
    const rules = JSON.parse(out.files['model-report.json']).checks.map((c: Doc) => c.rule);
    expect(rules).toContain('Status new subtle: Text auf Fläche');
    expect(rules).toContain('Status new strong: Text auf Füllung');
    expect(rules).toContain('content.primary auf status.new.surface.subtle');
    expect(rules).toContain('Fokus-Ring auf status.new.surface.subtle');
    const forced = JSON.parse(out.files['tokens/Contrast/Forced.json']);
    expect(forced.status.new.indicator.strong.$value).toBe('CanvasText');
    expect(out.log.filter((l) => l.includes('✗'))).toEqual([]);
  });

  it('may not override a base intent', () => {
    const error = errorOf(() => build({ info: 'brand' }));
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).issues[0].path).toEqual(['status', 'intents', 'info']);
  });

  it('needs a semantic hue', () => {
    const error = errorOf(() => build({ new: 'violet' }));
    expect((error as RecipeError).issues[0].path).toEqual(['status', 'intents', 'new']);
  });
});
