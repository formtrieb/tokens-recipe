/**
 * Two contract lines that read a design decision correctly instead of failing
 * it: a fill whose content carries the edge (1.4.11 asks for the boundary of
 * the label or check, not of the surface), and nested corners a recipe waives
 * on purpose, with a reason.
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
const brandFill = (hex: string, onFill: string) => (doc: Doc) => {
  doc.hues.find((h: Doc) => h.name === 'brand').anchor = { light: { step: 9, hex } };
  doc.onFill.light = onFill;
};
const errorOf = (run: () => unknown) => {
  try {
    run();
  } catch (e) {
    return e;
  }
  throw new Error('expected an error');
};

describe('fill (1.4.11)', () => {
  it('is a note when the fill is light but its dark content stands against the page', () => {
    const out = build(brandFill('#f5d000', 'auto'));
    const check = JSON.parse(out.files['model-report.json']).checks.find(
      (c: Doc) => c.mode === 'light' && c.rule === 'Füllung brand (1.4.11)',
    );
    expect(check.ratio).toBeLessThan(3);
    expect(check.ok).toBe(true);
    expect(check.advisory).toMatch(/^brand\.on-fill \/ pole\.canvas \d+\.\d+ ≥ 3: der Inhalt trägt die Kante$/);
    expect(out.log.some((l) => l.startsWith('  · light Füllung brand (1.4.11):') && l.includes('Hinweis'))).toBe(true);
    expect(out.log.some((l) => l.includes('✗ light Füllung brand'))).toBe(false);
  });

  it('stays a failure when neither the fill nor its white content stands against a light page', () => {
    const out = build(brandFill('#6aa5e0', '#ffffff'));
    expect(out.log.some((l) => l.startsWith('  ✗ light Füllung brand (1.4.11):'))).toBe(true);
  });
});

describe('radius.waive', () => {
  // square tiles: container 0 holds items of 4 — not concentric anywhere
  const square = (doc: Doc) => {
    for (const shape of Object.values(doc.radius.shapes) as Doc[]) shape.container = 0;
  };

  it('fails the nesting without a waiver', () => {
    const out = build(square);
    expect(out.log.filter((l) => l.includes('✗') && l.includes('Checkbox in Karte'))).toHaveLength(3);
  });

  it('shows a waived nesting with its reason, neither ✗ nor ✓', () => {
    const out = build((doc) => {
      square(doc);
      doc.radius.waive = [{ nesting: 'container/item', reason: 'eckige Kacheln' }];
    });
    expect(out.log.filter((l) => l.includes('✗') && l.includes('— item'))).toEqual([]);
    expect(out.log).toContain('  · mixed: Checkbox in Karte — item 4 > 0 (container 0 − Abstand 16) — ausgesetzt: eckige Kacheln');
    expect(out.log.find((l) => l.startsWith('Radius:'))).toMatch(/Vertrag ok$/);
  });

  it('needs a reason', () => {
    const error = errorOf(() => build((doc) => (doc.radius.waive = [{ nesting: 'container/item' }])));
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).issues[0].path).toEqual(['radius', 'waive', '0', 'reason']);
  });

  it('stops on a pair that is no nesting', () => {
    const error = errorOf(() =>
      build((doc) => (doc.radius.waive = [{ nesting: 'card/checkbox', reason: 'x' }])),
    );
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).issues[0].path).toEqual(['radius', 'waive', '0', 'nesting']);
  });
});
