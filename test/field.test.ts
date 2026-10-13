/**
 * Fields have their own role set, `field-*`: style fixed to outline, the axes
 * a field has (no selection, no pressed, no track), a hue for focus and two
 * stroke roles. A button style on `secondary` no longer reaches the forms.
 */
import { describe, expect, it } from 'vitest';
import { generateModel, overlay, parseRecipe, RecipeError, recipeDefaults } from '../src/index.js';
import { fixture } from './fixture.js';

type Doc = Record<string, any>;
const build = (edit: (doc: Doc) => void = () => {}) => {
  const doc = structuredClone(fixture()) as Doc;
  edit(doc);
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
/** the field cells in the base set (first declaration; forced colours come later) */
const fieldTokens = (css: string) => [
  ...new Map(
    [...css.matchAll(/--x-field-((?:background|stroke|text-subtle|text|icon)-[a-z-]+): ([^;]+);/g)]
      .map((m) => [m[1], m[2]] as const)
      .filter(([k]) => !k.startsWith('stroke-width'))
      .reverse(),
  ),
];

describe('field roles', () => {
  const css = build().files['model.css'];
  const tokens = fieldTokens(css);

  it('are 24 cells × 5 parts: idle, hover, focus · enabled, readonly, disabled · tones', () => {
    expect(tokens).toHaveLength(120);
    const keys = new Set(tokens.map(([k]) => k.replace(/^(background|stroke|text-subtle|text|icon)-/, '')));
    expect(keys.size).toBe(24);
    expect(keys.has('hover')).toBe(true);
    expect(keys.has('readonly-hover')).toBe(false);
    expect([...keys].some((k) => k.includes('pressed') || k.includes('selected'))).toBe(false);
    expect(css).not.toMatch(/--x-field-track-/);
  });

  it('equal the ctl-secondary cells while secondary is an outline on the same hue', () => {
    for (const [k, v] of tokens) expect(css).toContain(`--x-ctl-secondary-${k}: ${v};`);
  });

  it('stay neutral when secondary becomes an outline-hue resting in the anchor colour', () => {
    const own = build((doc) => {
      doc.hierarchies.secondary = { hue: 'accent', style: 'outline-hue', rest: 'anchor' };
    }).files['model.css'];
    expect(own).toContain('--x-ctl-secondary-stroke-idle: var(--x-accent-fill);');
    expect(own).toContain('--x-field-stroke-idle: var(--x-neutral-line-strong);');
    expect(own).toContain('--x-field-text-idle: var(--x-pole-ink);');
    expect(own).toContain('--x-field-stroke-focus: var(--x-accent-fill);');
    expect(own).toContain('--x-field-stroke-negative-idle: var(--x-negative-line-strong);');
  });

  it('take the forced-colours remapping of ctl: disabled → GrayText', () => {
    const forced = JSON.parse(build().files['tokens/Contrast/Forced.json']);
    expect(forced.field.stroke['disabled-idle'].$value).toBe('GrayText');
    expect(forced.field.text['disabled-negative-idle'].$value).toBe('GrayText');
    expect(forced.field.background).toBeUndefined();
  });

  it('give the stroke two widths: at rest, and on focus or with a tone', () => {
    expect(css).toContain('--x-field-stroke-width: var(--x-border-width-default);');
    expect(css).toContain('--x-field-stroke-width-emphasis: var(--x-border-width-default);');
    const own = build((doc) => (doc.field = { hue: 'accent', strokeWidthEmphasis: 'strong' })).files['model.css'];
    expect(own).toContain('--x-field-stroke-width: var(--x-border-width-default);');
    expect(own).toContain('--x-field-stroke-width-emphasis: var(--x-border-width-strong);');
  });

  it('take their focus from field.hue', () => {
    const own = build((doc) => (doc.field = { hue: 'brand' })).files['model.css'];
    expect(own).toContain('--x-field-stroke-focus: var(--x-brand-fill);');
  });

  it('are checked by the contract: rest, text, placeholder, focus, and every cell pair', () => {
    const out = build();
    const rules = JSON.parse(out.files['model-report.json']).checks.map((c: Doc) => c.rule);
    for (const r of ['Feldrand auf Weiß (1.4.11)', 'Platzhalter im Feld', 'Feldtext', 'Feld-Fokusrand (1.4.11)'])
      expect(rules).toContain(r);
  });

  it('stop on an unknown stroke role or hue', () => {
    const role = errorOf(() => build((doc) => (doc.field = { hue: 'accent', strokeWidthEmphasis: 'heavy' })));
    expect(role).toBeInstanceOf(RecipeError);
    expect((role as RecipeError).issues[0].path).toEqual(['field', 'strokeWidthEmphasis']);
    const hue = errorOf(() => build((doc) => (doc.field = { hue: 'violet' })));
    expect((hue as RecipeError).issues[0].path).toEqual(['field', 'hue']);
  });
});
