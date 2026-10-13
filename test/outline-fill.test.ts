/**
 * Style `outline-fill`: an outline at rest that fills on hover (from hover on
 * it is `solid`), resting neutral or in the hue. Option `rest` on
 * `outline-hue`: `anchor` rests in the fill colour itself, and the contract
 * checks that colour as text on paper.
 */
import { describe, expect, it } from 'vitest';
import { generateModel, overlay, parseRecipe, RecipeError, recipeDefaults } from '../src/index.js';
import { fixture } from './fixture.js';

type Doc = Record<string, any>;
const build = (edit: (doc: Doc) => void) => {
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

describe('outline-fill and outline-hue rest', () => {
  const out = build((doc) => {
    doc.hierarchies.tertiary = { hue: 'accent', style: 'outline-fill', rest: 'neutral' };
    doc.hierarchies.secondary = { hue: 'accent', style: 'outline-fill' };
    doc.hierarchies['destructive-subtle'] = { hue: 'negative', style: 'outline-hue', rest: 'anchor' };
  });
  const css = out.files['model.css'];
  const cell = (h: string, part: string, key: string) =>
    css.match(new RegExp(`--x-ctl-${h}-${part}-${key}: ([^;]+);`))?.[1];

  it('rests like outline with rest neutral and fills like solid from hover on', () => {
    expect(cell('tertiary', 'background', 'idle')).toBe('var(--x-pole-paper)');
    expect(cell('tertiary', 'stroke', 'idle')).toBe('var(--x-neutral-line-strong)');
    expect(cell('tertiary', 'text', 'idle')).toBe('var(--x-pole-ink)');
    expect(cell('tertiary', 'stroke', 'focus')).toBe('var(--x-neutral-line-strong)');
    expect(cell('tertiary', 'background', 'hover')).toBe('var(--x-accent-fill-hover)');
    expect(cell('tertiary', 'stroke', 'hover')).toBe('var(--x-accent-fill-hover)');
    expect(cell('tertiary', 'text', 'hover')).toBe('var(--x-accent-on-fill)');
    expect(cell('tertiary', 'icon', 'pressed')).toBe('var(--x-accent-on-fill)');
    expect(cell('tertiary', 'background', 'pressed')).toBe('var(--x-accent-fill-pressed)');
    // a tone swaps the hue of the fill and of the content on it
    expect(cell('tertiary', 'text', 'negative-hover')).toBe('var(--x-negative-on-fill)');
  });

  it('rests like outline-hue by default (rest hue) and selects on the tint ladder', () => {
    expect(cell('secondary', 'stroke', 'idle')).toBe('var(--x-accent-line-strong)');
    expect(cell('secondary', 'text', 'idle')).toBe('var(--x-accent-ink-subtle)');
    expect(cell('secondary', 'background', 'hover')).toBe('var(--x-accent-fill-hover)');
    expect(cell('secondary', 'background', 'selected-idle')).toBe('var(--x-accent-tint)');
    expect(cell('secondary', 'background', 'disabled-idle')).toBe('var(--x-neutral-subtle)');
  });

  it('rests outline-hue in the anchor colour with rest anchor, hover and pressed as before', () => {
    expect(cell('destructive-subtle', 'stroke', 'idle')).toBe('var(--x-negative-fill)');
    expect(cell('destructive-subtle', 'text', 'idle')).toBe('var(--x-negative-fill)');
    expect(cell('destructive-subtle', 'icon', 'idle')).toBe('var(--x-negative-fill)');
    expect(cell('destructive-subtle', 'background', 'hover')).toBe('var(--x-negative-canvas)');
    expect(cell('destructive-subtle', 'text', 'hover')).toBe('var(--x-negative-ink)');
  });

  it('checks the anchor colour as text on paper, only where a hierarchy rests in it', () => {
    const checks = JSON.parse(out.files['model-report.json']).checks;
    const line = checks.filter((c: Doc) => c.rule === 'Text in Ankerfarbe auf Papier (destructive-subtle)');
    expect(line.map((c: Doc) => c.mode)).toEqual(['light', 'dark']);
    expect(line.every((c: Doc) => c.min === 4.5 && c.pair === 'negative.fill / pole.paper')).toBe(true);
    const plain = JSON.parse(generateModel(parseRecipe(overlay(recipeDefaults, fixture()))).files['model-report.json']);
    expect(plain.checks.some((c: Doc) => c.rule.startsWith('Text in Ankerfarbe'))).toBe(false);
    expect(out.log.filter((l) => l.includes('✗'))).toEqual([]);
  });

  it('stops on a rest the style does not have', () => {
    const wrong = errorOf(() => build((doc) => (doc.hierarchies['destructive-subtle'].rest = 'neutral')));
    expect(wrong).toBeInstanceOf(RecipeError);
    expect((wrong as RecipeError).issues[0].path).toEqual(['hierarchies', 'destructive-subtle', 'rest']);
    const none = errorOf(() => build((doc) => (doc.hierarchies.primary.rest = 'hue')));
    expect((none as RecipeError).issues[0].message).toBe('Stil solid hat kein rest');
  });
});
