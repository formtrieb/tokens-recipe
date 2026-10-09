import { describe, expect, it } from 'vitest';
import { generateModel, overlay, parseRecipe, recipeDefaults } from '../src/index.js';
import { fixture, loadRecipe } from './fixture.js';

describe('style outline-hue', () => {
  const css = generateModel(loadRecipe()).files['model.css'];
  // destructive-subtle is the fixture's outline-hue hierarchy (negative)
  const cell = (k: string) => new RegExp(`--x-ctl-destructive-subtle-${k}: ([^;]+);`).exec(css)?.[1];

  it('selects on the tint ladder of its hue', () => {
    expect(cell('background-selected-idle')).toBe('var(--x-negative-tint)');
    expect(cell('background-selected-hover')).toBe('var(--x-negative-tint-hover)');
    expect(cell('background-selected-pressed')).toBe('var(--x-negative-tint-pressed)');
    expect(cell('background-selected-focus')).toBe('var(--x-negative-tint)');
    expect(cell('background-done-idle')).toBe('var(--x-negative-tint)');
    // a tone swaps the hue
    expect(cell('background-selected-warning-idle')).toBe('var(--x-warning-tint)');
  });

  it('keeps stroke, icon and text of a selected outline', () => {
    expect(cell('stroke-selected-idle')).toBe('var(--x-negative-fill)');
    expect(cell('icon-selected-idle')).toBe('var(--x-negative-ink)');
    expect(cell('text-selected-idle')).toBe('var(--x-pole-ink)');
  });

  it('leaves inactive, readonly and disabled to outline', () => {
    expect(cell('background-inactive-hover')).toBe('var(--x-neutral-state-hover)');
    expect(cell('background-readonly-selected-idle')).toBe('var(--x-neutral-state-selected)');
    expect(cell('background-disabled-selected-idle')).toBe('var(--x-neutral-subtle)');
  });

  it('still selects in Highlight under forced colours', () => {
    const forced = css.slice(css.indexOf('forced-colors: active'));
    expect(forced).toContain('--x-ctl-destructive-subtle-background-selected-idle: Highlight;');
  });
});

describe('layer.panel', () => {
  it('sits between sticky and chrome, from the defaults', () => {
    const out = generateModel(loadRecipe());
    expect(out.files['model.css']).toContain('--x-layer-panel: 15;');
    expect(out.log).toContain('Ebenen: layer.sticky 10 · panel 15 · chrome 20, elevation.sticky × 4 Kanten, Vertrag ok');
  });

  it('breaks the contract above chrome', () => {
    const doc = { ...(fixture() as object), layer: { sticky: 10, panel: 25, chrome: 20 } };
    const log = generateModel(parseRecipe(overlay(recipeDefaults, doc))).log.join('\n');
    expect(log).toContain('Vertrag verletzt');
    expect(log).toContain('nicht 0 < sticky 10 < panel 25 < chrome 20');
  });
});
