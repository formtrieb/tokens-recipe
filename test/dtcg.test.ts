/**
 * The DTCG tree the generator writes next to model.css: complete (every
 * reference resolves inside the themes that use it), structurally valid
 * (no path is both leaf and group — the emitter throws), and shaped the way
 * Tokens Studio and the tokens MCP expect.
 */
import { describe, expect, it } from 'vitest';
import { loadRecipe } from './fixture.js';
import { generateModel } from '../src/index.js';

type Node = { $type?: string; $value?: unknown } & Record<string, unknown>;

const { files } = generateModel(loadRecipe());
const json = (name: string) => JSON.parse(files[name]);
const themes: {
  group: string;
  name: string;
  selectedTokenSets: Record<string, string>;
}[] = json('tokens/$themes.json');
const order: string[] = json('tokens/$metadata.json').tokenSetOrder;

/** flat map path → leaf of one set */
function leaves(set: string, node: Node = json(`tokens/${set}.json`), at = '') {
  const out = new Map<string, Node>();
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    const n = v as Node;
    if ('$value' in n) out.set(at + k, n);
    else for (const [p, leaf] of leaves(set, n, `${at}${k}.`)) out.set(p, leaf);
  }
  return out;
}
const refsIn = (v: unknown): string[] =>
  typeof v === 'string'
    ? [...v.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
    : v && typeof v === 'object'
      ? Object.values(v).flatMap(refsIn)
      : [];

describe('DTCG tree', () => {
  it('lists every set in $metadata and writes it', () => {
    expect(order.slice(0, 3)).toEqual([
      'Mode/Light',
      'Mode/Dark',
      'Model/Base',
    ]);
    for (const set of order) expect(files[`tokens/${set}.json`]).toBeDefined();
  });

  it('resolves every reference inside its theme', () => {
    for (const t of themes) {
      const active = new Map<string, Node>();
      for (const set of order)
        if (t.selectedTokenSets[set])
          for (const [p, leaf] of leaves(set)) active.set(p, leaf);
      const missing: string[] = [];
      for (const [p, leaf] of active)
        for (const r of refsIn(leaf.$value))
          if (!active.has(r)) missing.push(`${p} → ${r}`);
      expect(missing, `${t.group}/${t.name}`).toEqual([]);
    }
  });

  it('types the values', () => {
    const light = leaves('Mode/Light');
    const base = leaves('Model/Base');
    expect(light.get('accent.fill')?.$type).toBe('color');
    expect(light.get('alpha.1')).toEqual({ $type: 'number', $value: 0.06 });
    expect(light.get('elevation.raised-value')?.$type).toBe('boxShadow');
    expect(light.get('elevation.raised-value')?.$value).toEqual([
      {
        x: '0',
        y: '1px',
        blur: '2px',
        spread: '0',
        color: '#0000000f',
        type: 'dropShadow',
      },
      {
        x: '0',
        y: '1px',
        blur: '3px',
        spread: '0',
        color: '#0000001a',
        type: 'dropShadow',
      },
    ]);
    expect(base.get('ctl.primary.background.idle')).toEqual({
      $type: 'color',
      $value: '{accent.fill}',
    });
    expect(base.get('size.16')).toEqual({ $type: 'dimension', $value: '16px' });
    expect(base.get('space.gap.tight')?.$type).toBe('dimension');
    expect(base.get('easing.standard')).toEqual({
      $type: 'cubicBezier',
      $value: [0.2, 0, 0.38, 0.9],
    });
    expect(base.get('duration.150')).toEqual({
      $type: 'duration',
      $value: '150ms',
    });
    expect(base.get('font.text')?.$type).toBe('fontFamilies');
    expect(base.get('type.body.md')).toEqual({
      $type: 'typography',
      $value: {
        fontFamily: '{font.text}',
        fontWeight: '{type.body.md-weight}',
        fontSize: '{type.body.md-size}',
        lineHeight: '{type.body.md-line-height}',
        letterSpacing: '{type.body.md-tracking}',
      },
    });
    expect(base.get('type.eyebrow.md')?.$value).toMatchObject({
      textCase: '{type.eyebrow.md-case}',
    });
    expect(base.get('control.md.action.text')).toEqual({
      $type: 'typography',
      $value: '{type.label.lg}',
    });
    expect(base.get('control.md.action.inline-icon')?.$value).toBe(
      'calc({size.12} + {control.action.pill})',
    );
  });

  it('spans the axes as themes with a default each', () => {
    const groups: Record<string, typeof themes> = {};
    for (const t of themes) (groups[t.group] ??= []).push(t);
    expect(groups.Mode?.map((t) => t.name)).toEqual(['Light', 'Dark']);
    expect(groups.Shape?.map((t) => t.name)).toEqual([
      'Mixed',
      'Square',
      'Round',
    ]);
    // character × reduced motion on one axis: Tokens Studio knows no theme
    // over two axes, so each character has its own -Reduced theme
    expect(groups.Motion?.map((t) => t.name)).toEqual([
      'Productive',
      'Expressive',
      'Productive-Reduced',
      'Expressive-Reduced',
    ]);
    expect(groups.Reduced).toBeUndefined();
    expect(
      groups.Motion?.find((t) => t.name === 'Expressive-Reduced')
        ?.selectedTokenSets,
    ).toEqual({
      'Mode/Light': 'source',
      'Model/Base': 'source',
      'Motion/Expressive': 'source',
      'Motion/Expressive-Reduced': 'enabled',
    });
    expect(groups.Pointer?.map((t) => t.name)).toEqual(['Fine', 'Coarse']);
    expect(groups.Contrast?.map((t) => t.name)).toEqual(['Normal', 'Forced']);
    expect(groups.Direction?.map((t) => t.name)).toEqual(['Ltr', 'Rtl']);
    // the default of an axis has no set of its own
    expect(Object.values(groups.Shape![0].selectedTokenSets)).not.toContain(
      'enabled',
    );
  });

  it('writes the token-map in the resolver shape', () => {
    const map = json('token-map.json');
    expect(map.prefix).toBe('--x-');
    expect(map.figmaToCSS['ctl/primary/background/idle']).toBe(
      '--x-ctl-primary-background-idle',
    );
    expect(map.figmaToCSS['type/table/header/md']).toBe(
      '--x-type-table-header-md',
    );
    expect(map.count).toBe(Object.keys(map.figmaToCSS).length);
    // every CSS variable of model.css is a token with a figma path, and the
    // other way round (the canonical dialect derives no companions)
    const declared = new Set(
      [...files['model.css'].matchAll(/^ {2}(--x-[a-z0-9-]+):/gm)].map(
        (m) => m[1],
      ),
    );
    const mapped = new Set(Object.values(map.figmaToCSS));
    expect([...declared].filter((n) => !mapped.has(n))).toEqual([]);
    expect(declared.size).toBe(mapped.size);
  });
});
