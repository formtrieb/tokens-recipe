import { describe, expect, it } from 'vitest';
import { generateModel, overlay, parseRecipe, recipeDefaults } from '../src/index.js';
import { fixture, loadRecipe } from './fixture.js';

describe('switch part sizes', () => {
  const css = generateModel(loadRecipe()).files['model.css'];

  it('are four roles per control size, derived from icon-alone, icon and the border width', () => {
    const expected: Record<string, number[]> = {
      xs: [16, 32, 12, 8],
      sm: [20, 32, 16, 12],
      md: [24, 40, 20, 16],
      lg: [28, 48, 24, 20],
    };
    for (const [s, [height, width, thumb, mark]] of Object.entries(expected)) {
      expect(css).toContain(`--x-control-${s}-switch-height: var(--x-size-${height});`);
      expect(css).toContain(`--x-control-${s}-switch-width: var(--x-size-${width});`);
      expect(css).toContain(`--x-control-${s}-switch-thumb: var(--x-size-${thumb});`);
      expect(css).toContain(`--x-control-${s}-switch-mark: var(--x-size-${mark});`);
    }
  });

  it('follow a replaced size under a coarse pointer, like icon-alone', () => {
    expect(css).toContain('--x-control-xs-switch-thumb: var(--x-control-sm-switch-thumb);');
  });

  it('fall back to calc over the roles where a value is off the size scale', () => {
    // 2 px strokes: thumb 20 − 2 × 3 = 14 and mark 10 are not on the scale
    const doc = { ...(fixture() as object), border: { width: { default: 2, strong: 2 } } };
    const own = generateModel(parseRecipe(overlay(recipeDefaults, doc))).files['model.css'];
    expect(own).toContain(
      '--x-control-sm-switch-thumb: calc(var(--x-control-sm-switch-height) - 2 * (var(--x-border-width-default) + 1px));',
    );
    expect(own).toContain('--x-control-sm-switch-mark: calc(var(--x-control-sm-switch-thumb) - 4px);');
    // md: thumb 24 − 6 = 18 off the scale too, the track stays on it
    expect(own).toContain('--x-control-md-switch-height: var(--x-size-24);');
  });
});
