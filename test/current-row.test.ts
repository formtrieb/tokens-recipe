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

describe('the reset of the selected-surface context', () => {
  const ctx = json('tokens/Contrast/Forced-OnSelected.json');
  const off = json('tokens/Contrast/Forced-OnSelected-Off.json');
  const forcedSet = json('tokens/Contrast/Forced.json');
  const base = json('tokens/Model/Base.json');
  const leaves = (node: Doc, at = ''): [string, string][] =>
    Object.entries(node).flatMap(([k, v]) =>
      v && typeof v === 'object' && '$value' in v
        ? [[`${at}${k}`, (v as Doc).$value as string]]
        : leaves(v as Doc, `${at}${k}.`),
    );
  const at = (tree: Doc, path: string) =>
    path.split('.').reduce<Doc | undefined>((n, k) => n?.[k], tree)?.$value;

  it('declares every context token exactly once, with its value outside the context', () => {
    const inCtx = leaves(ctx).map(([p]) => p);
    const reset = leaves(off);
    expect(reset.map(([p]) => p).sort()).toEqual([...inCtx].sort());
    expect(new Set(reset.map(([p]) => p)).size).toBe(reset.length);
    for (const [p, v] of reset) expect(v).toBe(at(forcedSet, p) ?? at(base, p));
    // the ring that vanished in a row menu: back on Highlight
    expect(at(off, 'focus.ring')).toBe('Highlight');
  });

  it('is rendered after the context, as [data-on-selected-x="off"] inside forced colours', () => {
    const rules = json('render.json').rules as Doc[];
    const i = rules.findIndex((r) => r.theme === 'Contrast/Forced-OnSelected');
    expect(rules[i + 1]).toMatchObject({
      theme: 'Contrast/Forced-OnSelected-Off',
      selector: '[data-on-selected-x="off"]',
      media: '(forced-colors: active)',
    });
    expect(css.indexOf('[data-on-selected-x="off"] {')).toBeGreaterThan(css.indexOf('[data-on-selected-x] {'));
  });
});
