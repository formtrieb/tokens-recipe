import { describe, expect, it } from 'vitest';
import { generateModel, overlay, parseRecipe, RecipeError, recipeDefaults } from '../src/index.js';
import { fixture, loadRecipe } from './fixture.js';

describe('link underline', () => {
  const out = generateModel(loadRecipe());
  const css = out.files['model.css'];

  it('is three roles from the defaults: offset in em, thicknesses on the stroke roles', () => {
    expect(css).toContain('--x-link-underline-offset: 0.2em;');
    expect(css).toContain('--x-link-underline-thickness: var(--x-border-width-default);');
    expect(css).toContain('--x-link-underline-thickness-hover: var(--x-border-width-strong);');
    expect(css.match(/--x-link-underline-[a-z-]+:/g)).toHaveLength(3);
  });

  it('stands in the tree as references to border.width', () => {
    const base = JSON.parse(out.files['tokens/Model/Base.json']);
    expect(base.link.underline).toEqual({
      offset: { $type: 'dimension', $value: '0.2em' },
      thickness: { $type: 'dimension', $value: '{border.width.default}' },
      'thickness-hover': { $type: 'dimension', $value: '{border.width.strong}' },
    });
  });

  it('takes the values a recipe sets', () => {
    const doc = {
      ...(fixture() as object),
      link: { underline: { offset: 0.15, thickness: 'strong', thicknessHover: 'strong' } },
    };
    const own = generateModel(parseRecipe(overlay(recipeDefaults, doc))).files['model.css'];
    expect(own).toContain('--x-link-underline-offset: 0.15em;');
    expect(own).toContain('--x-link-underline-thickness: var(--x-border-width-strong);');
  });

  it('refuses a thickness that is no border.width key, at link.underline.thickness', () => {
    const doc = { ...(fixture() as object), link: { underline: { thickness: '2px' } } };
    let error: unknown;
    try {
      parseRecipe(overlay(recipeDefaults, doc));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).issues.map((i) => i.path)).toEqual([['link', 'underline', 'thickness']]);
  });
});
