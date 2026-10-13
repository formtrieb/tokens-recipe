/**
 * The states of a fill are a distance to the fill, so they follow an anchor on
 * step 9: fill-hover (step 10) one ladder distance 9→10 away, fill-pressed
 * further on with the ladder (9→11) — or, when hover goes against the ladder
 * (`away-from-text`), the same distance to the other side. Without an anchor
 * on 9 everything stays as the ladder has it.
 */
import { describe, expect, it } from 'vitest';
import { hexToOklch } from '@formtrieb/tokens-core';
import { buildFillStates, generateModel, overlay, parseRecipe, recipeDefaults } from '../src/index.js';
import { fixture } from './fixture.js';

type Doc = Record<string, any>;
const recipeWith = (edit: (doc: Doc) => void) => {
  const doc = structuredClone(fixture()) as Doc;
  edit(doc);
  return parseRecipe(overlay(recipeDefaults, doc));
};
const anchorBrand = (step: number, hex: string, edit: (doc: Doc) => void = () => {}) =>
  recipeWith((doc) => {
    doc.hues.find((h: Doc) => h.name === 'brand').anchor = { light: { step, hex } };
    doc.onFill.light = 'auto';
    edit(doc);
  });
const L = (hex: string) => hexToOklch(hex).l;
/** light ladder of the test recipe */
const ladder = recipeWith(() => {}).modes.light.lightness;
const dh = ladder[8] - ladder[9];
const dp = ladder[8] - ladder[10];
const contentFails = (r: ReturnType<typeof recipeWith>) =>
  generateModel(r).log.filter((l) => /✗ light Inhalt brand .*(hover|pressed)/.test(l));

describe('fill states', () => {
  it('leave every hue without an anchor on 9 as before: fill-pressed is ink-subtle', () => {
    const { ramps, pressed } = buildFillStates(recipeWith(() => {}));
    for (const mode of ['light', 'dark'] as const)
      for (const [hue, ramp] of Object.entries(ramps[mode]))
        if (!(mode === 'light' && hue === 'brand')) expect(pressed[mode][hue].hex).toBe(ramp[10].hex);
  });

  // a light, yellow-like anchor (synthetic) with black content
  const light = '#f5d000';

  it('follow the anchor on 9 with the ladder by default (light: darker)', () => {
    const r = anchorBrand(9, light);
    const { ramps, pressed } = buildFillStates(r);
    const ramp = ramps.light['brand'];
    expect(ramp[8].hex).toBe(light);
    expect(L(ramp[9].hex)).toBeCloseTo(L(light) - dh, 1);
    expect(L(pressed.light['brand'].hex)).toBeCloseTo(L(light) - dp, 1);
    // the content keeps its contrast in hover and pressed, unlike the fixed steps before
    expect(contentFails(r)).toEqual([]);
  });

  it('move away from dark content with away-from-text: hover lighter, pressed darker by the same distance', () => {
    const r = anchorBrand(9, light, (doc) => (doc.fillStates = { light: { hover: 'away-from-text' } }));
    const { ramps, pressed } = buildFillStates(r);
    const l9 = L(light);
    expect(L(ramps.light['brand'][9].hex)).toBeGreaterThan(l9);
    expect(L(pressed.light['brand'].hex)).toBeCloseTo(l9 - dh, 1);
    expect(contentFails(r)).toEqual([]);
  });

  it('go with the ladder under away-from-text when the content is white', () => {
    const blue = '#2f6fb0';
    const away = buildFillStates(
      anchorBrand(9, blue, (doc) => (doc.fillStates = { light: { hover: 'away-from-text' } })),
    );
    const plain = buildFillStates(anchorBrand(9, blue));
    expect(away.ramps.light['brand'][9].hex).toBe(plain.ramps.light['brand'][9].hex);
    expect(away.pressed.light['brand'].hex).toBe(plain.pressed.light['brand'].hex);
    expect(L(away.ramps.light['brand'][9].hex)).toBeLessThan(L(blue));
  });

  it('make nothing relative for an anchor on 8: step 9 is not pinned, fill-pressed is ink-subtle', () => {
    const { ramps, pressed } = buildFillStates(anchorBrand(8, '#4a3fb0'));
    const ramp = ramps.light['brand'];
    expect(ramp[7].anchored).toBe(true);
    expect(ramp[8].anchored).toBe(false);
    expect(L(ramp[9].hex)).toBeCloseTo(ladder[9], 2);
    expect(pressed.light['brand'].hex).toBe(ramp[10].hex);
  });

  it('keep an anchor on 10 pinned; fill-pressed follows the rule from the ladder L9', () => {
    const { ramps, pressed } = buildFillStates(anchorBrand(10, '#463a9e'));
    const ramp = ramps.light['brand'];
    expect(ramp[9]).toMatchObject({ hex: '#463a9e', anchored: true });
    expect(pressed.light['brand'].hex).toBe(ramp[10].hex);
  });

  it('are what solid pressed and on-fill-pressed read', () => {
    const css = generateModel(recipeWith(() => {})).files['model.css'];
    expect(css).toContain('--x-ctl-primary-background-pressed: var(--x-accent-fill-pressed);');
    const pressedHex = css.match(/--x-accent-fill-pressed: (#[0-9a-f]{6});/)![1];
    expect(css).toContain(`--x-accent-on-fill-pressed: ${pressedHex};`);
  });
});
