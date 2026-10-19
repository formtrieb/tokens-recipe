/**
 * The current row (aria-current) a step above selected, and forced colours on
 * a selected surface: a narrow role pair and a context, not a selection value
 * or a hierarchy.
 */
import { describe, expect, it } from 'vitest';
import { generateModel } from '../src/index.js';
import { loadRecipe } from './fixture.js';

type Doc = Record<string, any>;
const out = generateModel(loadRecipe());
const css = out.files['model.css'];
const json = (name: string) => JSON.parse(out.files[name]);

describe('current row', () => {
  it('is surface.current on tint-hover, with a line that only forced colours draw', () => {
    expect(css).toContain('--x-surface-current: var(--x-neutral-tint-hover);');
    expect(json('tokens/Model/Base.json').line.current.$value).toBe('transparent');
    expect(json('tokens/Contrast/Forced.json').line.current.$value).toBe('Highlight');
  });

  it('is checked: apart from selected and from the surface, text and focus ring on it', () => {
    expect(out.log.find((l) => l.startsWith('Flächen-Vertrag'))).toBe('Flächen-Vertrag: ok');
    const rules = json('model-report.json').checks.map((c: Doc) => c.rule);
    for (const r of ['content.primary auf surface.current', 'content.secondary auf surface.current', 'Fokus-Ring auf surface.current'])
      expect(rules).toContain(r);
  });
});

describe('forced colours on a selected surface', () => {
  const rule = json('render.json').rules.find((r: Doc) => r.theme === 'Contrast/Forced-OnSelected');
  const set = json('tokens/Contrast/Forced-OnSelected.json');

  it('is a context: [data-on-selected-x] inside (forced-colors: active)', () => {
    expect(rule).toMatchObject({ selector: '[data-on-selected-x]', media: '(forced-colors: active)' });
    // the same attribute in the root scope: a context, not a default
    const root = JSON.parse(generateModel(loadRecipe(), { scope: 'root', attributeSuffix: '' }).files['render.json']);
    expect(root.rules.find((r: Doc) => r.theme === 'Contrast/Forced-OnSelected').selector).toBe('[data-on-selected]');
  });

  it('turns the ink of surface-less controls, the focus ring and the current line to HighlightText; focus inverts', () => {
    expect(set['focus']['ring'].$value).toBe('HighlightText');
    expect(set.line.current.$value).toBe('HighlightText');
    const t = set.ctl.tertiary;
    expect(t.icon.idle.$value).toBe('HighlightText');
    expect(t.stroke.hover.$value).toBe('HighlightText');
    expect(t.text.pressed.$value).toBe('HighlightText');
    expect(t.icon.focus.$value).toBe('Highlight');
    expect(t.background.focus.$value).toBe('HighlightText');
    // only hierarchies without a surface of their own (style ghost)
    expect(Object.keys(set.ctl)).toEqual(['tertiary']);
  });
});
