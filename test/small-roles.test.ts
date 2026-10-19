/**
 * Small roles for what components otherwise read from the Foundation or the
 * Auswahl: media boxes, the placeholder surface, text on the inverted
 * surface, and the check inside a checkbox box.
 */
import { describe, expect, it } from 'vitest';
import { generateModel, overlay, parseRecipe, RecipeError, recipeDefaults } from '../src/index.js';
import { fixture } from './fixture.js';

type Doc = Record<string, any>;
const build = (edit: (doc: Doc) => void = () => {}) => {
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

describe('small roles', () => {
  const out = build();
  const css = out.files['model.css'];

  it('media boxes sit on the size scale, without a coarse step', () => {
    expect(css).toContain('--x-media-md: var(--x-size-64);');
    expect(JSON.parse(out.files['tokens/Pointer/Coarse.json']).media).toBeUndefined();
    const error = errorOf(() => build((doc) => (doc.media = { sizes: { md: 62 } })));
    expect(error).toBeInstanceOf(RecipeError);
    expect((error as RecipeError).issues[0].path).toEqual(['media', 'sizes', 'md']);
  });

  it('surface.placeholder is neutral.tint, and must show on page, raised and overlay', () => {
    expect(css).toContain('--x-surface-placeholder: var(--x-neutral-tint);');
    expect(out.log.find((l) => l.startsWith('Flächen-Vertrag'))).toBe('Flächen-Vertrag: ok');
    // a tint equal to the paper vanishes on a card
    const flat = build((doc) => {
      doc.modes.light.lightness[2] = 1;
      doc.poles.light.paper = '#ffffff';
    });
    expect(flat.log.some((l) => l.includes('surface.placeholder auf surface.raised kaum sichtbar'))).toBe(true);
  });

  it('content.on-inverted is the inverted surface’s on-fill, checked at 4.5:1 in each mode', () => {
    expect(css).toContain('--x-content-on-inverted: var(--x-inverted-on-fill);');
    const line = JSON.parse(out.files['model-report.json']).checks.filter(
      (c: Doc) => c.rule === 'content.on-inverted auf surface.inverted',
    );
    expect(line.map((c: Doc) => [c.mode, c.min, c.ok])).toEqual([
      ['light', 4.5, true],
      ['dark', 4.5, true],
    ]);
  });

  it('checkbox-mark is icon − 4 per size, off the scale a calc, replaced under a coarse pointer', () => {
    // fixture icons 16 · 16 · 20 · 24 → marks 12 · 12 · 16 · 20
    expect(css).toContain('--x-control-md-checkbox-mark: var(--x-size-16);');
    expect(css).toContain('--x-control-xs-checkbox-mark: var(--x-control-sm-checkbox-mark);');
    const off = build((doc) => (doc.control.sizes.lg.icon = 28)).files['model.css'];
    // 28 − 4 = 24 is on the scale; 18 is not
    expect(off).toContain('--x-control-lg-checkbox-mark: var(--x-size-24);');
    const calc = build((doc) => {
      doc.control.icons = [16, 20, 22, 24, 28];
      doc.space.scale = [...doc.space.scale, 22].sort((a: number, b: number) => a - b);
      doc.control.sizes.md.icon = 22;
    });
    expect(calc.files['model.css']).toContain(
      '--x-control-md-checkbox-mark: calc(var(--x-control-md-icon) - 4px);',
    );
  });
});
