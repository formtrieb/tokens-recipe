import { describe, expect, it } from 'vitest';
import { simulate } from '../src/editor/render-rules.js';
import { generateModel, overlay, parseRecipe, RecipeError, recipeDefaults, renderOptions, tokenSystem } from '../src/index.js';
import { renderVariables } from '@formtrieb/tokens-render';
import { fixture, loadRecipe } from './fixture.js';

describe('avatar sizes', () => {
  const out = generateModel(loadRecipe());
  const css = out.files['model.css'];

  it('are spot sizes on the size scale, from the defaults', () => {
    expect(css).toContain('--x-avatar-xs: var(--x-size-24);');
    expect(css).toContain('--x-avatar-sm: var(--x-size-32);');
    expect(css).toContain('--x-avatar-md: var(--x-size-40);');
  });

  it('do not grow under a coarse pointer, also with the pointer simulated', () => {
    expect(css.match(/--x-avatar-/g)).toHaveLength(3);
    const table = JSON.parse(out.files['render.json']);
    const preview = [...renderVariables(tokenSystem(out.files), simulate(table.rules), renderOptions('x-')).values()].join('\n');
    const coarse = preview.split(/(?=\n[^\n{]*\{)/).filter((block) => block.includes('data-sim-pointer="coarse"'));
    expect(coarse.length).toBeGreaterThan(0);
    for (const block of coarse) expect(block).not.toContain('--x-avatar-');
    // the controls do step up there — the coarse block is not empty by accident
    expect(coarse.join('')).toContain('--x-control-');
  });

  it('take the sizes a recipe sets', () => {
    const doc = { ...(fixture() as object), avatar: { sizes: { sm: 32, lg: 64 } } };
    const own = generateModel(parseRecipe(overlay(recipeDefaults, doc)));
    expect(own.files['model.css']).toContain('--x-avatar-lg: var(--x-size-64);');
  });

  it('refuse a size off the scale, at avatar.sizes.<name>', () => {
    const doc = { ...(fixture() as object), avatar: { sizes: { xs: 24, md: 42 } } };
    let error: unknown;
    try {
      generateModel(parseRecipe(overlay(recipeDefaults, doc)));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).issues).toEqual([
      { path: ['avatar', 'sizes', 'md'], message: expect.stringContaining('42') },
    ]);
  });
});
