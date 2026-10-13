/**
 * A hierarchy picks a stroke role for its controls (`strokeWidth`, a
 * `border.width` key), never pixels. One token per hierarchy points at the
 * role; a bordered control subtracts it from its inline padding.
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
const heavy = (doc: Doc) => {
  doc.space.scale = [...doc.space.scale, 3].sort((a: number, b: number) => a - b);
  doc.border = { width: { ...doc.border?.width, default: 1, strong: 2, heavy: 3 } };
  doc.hierarchies.secondary.strokeWidth = 'heavy';
};

describe('stroke width per hierarchy', () => {
  it('points every hierarchy at border-width-default unless it picks another role', () => {
    const css = generateModel(parseRecipe(overlay(recipeDefaults, fixture()))).files['model.css'];
    expect(css).toContain('--x-ctl-primary-stroke-width: var(--x-border-width-default);');
  });

  it('takes a further border.width role a hierarchy picks, and emits that role', () => {
    const out = build(heavy);
    const css = out.files['model.css'];
    expect(css).toContain('--x-border-width-heavy: var(--x-size-3);');
    expect(css).toContain('--x-ctl-secondary-stroke-width: var(--x-border-width-heavy);');
    expect(css).toContain('--x-ctl-primary-stroke-width: var(--x-border-width-default);');
    const base = JSON.parse(out.files['tokens/Model/Base.json']);
    expect(base.ctl.secondary['stroke-width'].$value).toBe('{border.width.heavy}');
    expect(out.log.filter((l) => l.includes('✗'))).toEqual([]);
  });

  it('stops on a role border.width does not have', () => {
    const error = errorOf(() => build((doc) => (doc.hierarchies.secondary.strokeWidth = 'heavy')));
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).issues[0].path).toEqual(['hierarchies', 'secondary', 'strokeWidth']);
  });

  it('still needs default and strong', () => {
    const error = errorOf(() => build((doc) => (doc.border = { width: { default: 1, heavy: 3 } })));
    expect((error as RecipeError).issues[0]).toEqual({ path: ['border', 'width'], message: 'strong fehlt' });
  });
});
