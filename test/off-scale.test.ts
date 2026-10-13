/**
 * Sizes the recipe derives (inline padding from the height, the plain gap,
 * icon alone, coarse heights past the top) need not lie on the size scale:
 * off it they are calc over what they come from. Sizes the recipe names are
 * checked against the scale before anything is written — a recipe error with
 * the path, never a crash in the DTCG export.
 */
import { describe, expect, it } from 'vitest';
import { generateModel, overlay, parseRecipe, RecipeError, recipeDefaults } from '../src/index.js';
import { emitDtcg, SET } from '../src/dtcg.js';
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

describe('sizes off the scale', () => {
  // heights 44 and 52 on a 4 px scale: inline padding 44/2 − 4 = 18 and
  // 52/2 − 4 = 22 are not on it, the coarse lg height 52 + 8 = 60 neither
  const out = build((doc) => {
    doc.space.scale = [...doc.space.scale, 52].sort((a: number, b: number) => a - b);
    doc.control.sizes.md.height = 44;
    doc.control.sizes.lg.height = 52;
  });
  const css = out.files['model.css'];

  it('are calc over the size-scale value they derive from', () => {
    expect(css).toContain(
      '--x-control-md-action-inline: calc(var(--x-size-44) / 2 - 4px + var(--x-control-action-pill));',
    );
    expect(css).toContain(
      '--x-control-lg-action-inline-icon: calc(var(--x-size-52) / 2 - 8px + var(--x-control-action-pill));',
    );
    expect(css).toContain('--x-control-lg-height: calc(var(--x-size-52) + 8px);');
  });

  it('stay byte-equal where they land on the scale', () => {
    expect(css).toContain(
      '--x-control-xs-action-inline: calc(var(--x-size-8) + var(--x-control-action-pill));',
    );
  });

  it('come out of the DTCG export as references, and no contract line flags them', () => {
    const base = JSON.parse(out.files['tokens/Model/Base.json']);
    expect(base.control.md.action.inline.$value).toBe(
      'calc({size.44} / 2 - 4px + {control.action.pill})',
    );
    expect(out.log.filter((l) => l.includes('Foundation-Skala'))).toEqual([]);
  });
});

describe('sizes the recipe names', () => {
  it('stop with the path when they are off the scale', () => {
    const error = errorOf(() => build((doc) => (doc.control.sizes.lg.height = 52)));
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).issues).toEqual([
      { path: ['control', 'sizes', 'lg', 'height'], message: '52 liegt nicht auf space.scale' },
    ]);
  });

  it('include the motion distance', () => {
    const error = errorOf(() =>
      build((doc) => {
        const ch = Object.values(doc.motion.characters)[0] as Doc;
        ch.distance.md = 10;
      }),
    );
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).issues[0].path.slice(-2)).toEqual(['distance', 'md']);
  });
});

describe('the DTCG export', () => {
  it('turns a reference to no token into a recipe error naming the token it came from', () => {
    const error = errorOf(() =>
      emitDtcg([{ set: SET.base, path: 'control.md.gap', value: 'var(--x-size-22)' }], {
        prefix: 'x-',
        defaults: { motion: 'calm', shape: 'soft' },
      }),
    );
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).message).toContain(
      '--x-size-22 ist kein Token des Modells (aus control.md.gap; 22 px liegt nicht auf space.scale)',
    );
  });
});
