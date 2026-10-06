// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { galleryHtml, galleryInput, mountGallery } from '../src/editor/gallery.js';
import type { PanelState } from '../src/editor/index.js';
import { generateModel } from '../src/index.js';
import { loadRecipe } from './fixture.js';

const run = generateModel(loadRecipe());
const state: PanelState = {
  css: run.files['model.css'],
  mode: 'Light',
  overlays: {},
  attributeSuffix: '-x',
  run,
  pending: false,
};
const HOSTILE = '<img src=x onerror=alert(1)>';

describe('gallery', () => {
  it('draws the model from the recipe of the run', () => {
    const input = galleryInput(state)!;
    const page = galleryHtml(input);
    for (const h of Object.keys(run.recipe.hierarchies ?? {})) expect(page).toContain(`var(--x-ctl-${h}-background-idle)`);
    for (const role of Object.keys(run.recipe.type?.roles ?? {})) expect(page).toContain(`>${role}<`);
    expect(page).not.toMatch(/var\(--(?!x-|_)/);
  });

  it('takes the prefix from render.json', () => {
    const own = generateModel(loadRecipe(), { prefix: 'ds-' });
    const page = galleryHtml(galleryInput({ ...state, css: own.files['model.css'], run: own })!);
    expect(page).toContain('var(--ds-ctl-');
    expect(page).not.toContain('--x-');
  });

  it('shows a hierarchy named <img src=x onerror=alert(1)> as text', () => {
    const input = galleryInput(state)!;
    const recipe = { ...input.recipe, hierarchies: { [HOSTILE]: { hue: HOSTILE, style: 'solid' } } };
    const el = document.createElement('div');
    el.innerHTML = galleryHtml({ ...input, recipe });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.rowh')!.textContent).toContain(HOSTILE);
    // the name reaches variable references only kebab-cased: letters, digits, hyphens
    for (const node of el.querySelectorAll('[style]'))
      for (const [ref] of node.getAttribute('style')!.matchAll(/var\(--[^,)]*/g))
        expect(ref).toMatch(/^var\(--_?[\p{Ll}\d-]+$/u);
    expect(el.innerHTML).toContain('var(--x-ctl-img-src-x-onerror-alert-1-background-idle)');
  });

  it('escapes report texts in titles and lines', () => {
    const input = galleryInput(state)!;
    const fail = { rule: HOSTILE, pair: '"><script>', ratio: 1, min: 4.5 };
    const h = Object.keys(input.recipe.hierarchies ?? {})[0];
    const el = document.createElement('div');
    el.innerHTML = galleryHtml({ ...input, checkFails: [fail], cellFails: [{ ...fail, hierarchy: h, cell: 'idle' }] });
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.querySelector('.contract p')!.textContent).toContain(HOSTILE);
    expect(el.querySelector('.cellwrap.fail')!.getAttribute('title')).toContain('"><script>');
  });

  it('marks the failed cells of the shown mode only', () => {
    const report = JSON.parse(run.files['model-report.json']);
    const h = Object.keys(run.recipe.hierarchies ?? {})[0];
    report.cells.fails = [{ mode: 'dark', rule: 'r', pair: 'p', ratio: 1, min: 4.5, hierarchy: h, cell: 'idle' }];
    const files = { ...run.files, 'model-report.json': JSON.stringify(report) };
    expect(galleryInput({ ...state, run: { ...run, files } })!.cellFails).toEqual([]);
    expect(galleryInput({ ...state, mode: 'Dark', run: { ...run, files } })!.cellFails).toHaveLength(1);
  });

  it('mounts into a shadow root and keeps the DOM while the drawing is the same', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const gallery = mountGallery(el);
    gallery.update({ ...state, run: undefined });
    expect(el.shadowRoot!.textContent).toContain('No model yet');
    gallery.update(state);
    const first = el.shadowRoot!.querySelector('.gallery');
    expect(first).not.toBeNull();
    gallery.update({ ...state, overlays: { 'data-shape-x': 'square' } }, { contrast: true });
    expect(el.shadowRoot!.querySelector('.gallery')).toBe(first);
    expect(first!.classList.contains('contrast-on')).toBe(true);
    gallery.destroy();
    expect(el.shadowRoot!.innerHTML).toBe('');
  });
});
