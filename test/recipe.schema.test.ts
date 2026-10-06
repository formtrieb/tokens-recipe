import { describe, expect, it } from 'vitest';
import { fixture, loadRecipe } from './fixture.js';
import { overlay, parseRecipe, recipeDefaults, RecipeSchema } from '../src/index.js';

describe('RecipeSchema', () => {
  const recipe = loadRecipe();

  it('accepts the DS recipe on top of the defaults', () => {
    expect(RecipeSchema.safeParse(recipe).success).toBe(true);
  });

  it('names the path of a wrong value', () => {
    const r = RecipeSchema.safeParse({
      ...recipe,
      focus: { ring: 'pole.ink', width: '2', offset: 2 },
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path.join('.')).toBe('focus.width');
  });

  it('rejects an unknown section', () => {
    const r = RecipeSchema.safeParse({ ...recipe, shadows: {} });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toMatch(/shadows/);
  });

  it('fixes steps at 12 and needs no recipe to say so', () => {
    expect(RecipeSchema.safeParse({ ...recipe, steps: 10 }).success).toBe(false);
    const { steps: _, ...rest } = fixture() as Record<string, unknown>;
    expect(parseRecipe(overlay(recipeDefaults, rest)).steps).toBe(12);
  });

  it('rejects a ladder whose length is not steps', () => {
    const r = RecipeSchema.safeParse({
      ...recipe,
      modes: {
        ...recipe.modes,
        dark: { ...recipe.modes.dark, lightness: [0.2, 0.9] },
      },
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path.join('.')).toBe('modes.dark.lightness');
  });

  // free CSS values reach model.css and the editor's <style> verbatim — a
  // shared link must not be able to end the declaration
  const escape = 'x; } body { background: url(https://example.com/x) } a {';
  it.each([
    ['width.main', { width: { ...recipe.width, main: escape } }],
    [
      'elevation.light.raised',
      {
        elevation: {
          ...recipe.elevation,
          light: { ...recipe.elevation!.light, raised: `0 1px ${escape}` },
        },
      },
    ],
    [
      'type.families.text',
      {
        type: {
          ...recipe.type,
          families: { ...recipe.type!.families, text: `Arial, ${escape}` },
        },
      },
    ],
    [
      'type.roles.eyebrow.case',
      {
        type: {
          ...recipe.type,
          roles: {
            ...recipe.type!.roles,
            eyebrow: { ...recipe.type!.roles['eyebrow'], case: escape },
          },
        },
      },
    ],
  ])('rejects a CSS escape in %s', (path, patch) => {
    const r = RecipeSchema.safeParse({ ...recipe, ...patch });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path.join('.')).toBe(path);
  });

  it('accepts the CSS value forms the DS uses', () => {
    const r = RecipeSchema.safeParse({
      ...recipe,
      width: { ...recipe.width, main: '80rem', reading: '66ch' },
      elevation: {
        ...recipe.elevation,
        light: {
          ...recipe.elevation!.light,
          raised: '0 1px 2px #0000000f, 0 4px 8px -2px #00000029',
          overlay: 'none',
        },
      },
      type: {
        ...recipe.type,
        families: {
          ...recipe.type!.families,
          text: `Inter, "Helvetica Neue", system-ui, sans-serif`,
        },
      },
    });
    expect(r.success).toBe(true);
  });
});
