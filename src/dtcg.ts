/**
 * The model as a Tokens-Studio tree.
 *
 * model.ts registers every CSS declaration it emits (dot-path, value, set).
 * This module turns that register into what the token pipeline expects:
 *   tokens/$metadata.json · tokens/$themes.json · tokens/<Set>.json
 *     DTCG in the Tokens-Studio flavour: $type/$value, {dot.path} references,
 *     typography and boxShadow composites
 *   token-map.json
 *     figma path → CSS name, the shape @formtrieb/tokens-cli writes
 * The tokens MCP reads the tree directly (tokens_path), Tokens Studio can
 * import it, and @formtrieb/tokens-render writes model.css from it.
 *
 * CSS name = `--{prefix}` + path with dots as dashes. A path is either a leaf
 * or a group, never both (`mark.surface` + `mark.current`, not `mark` +
 * `mark.current`): the emitter stops on a conflict.
 *
 * Sets: Mode/Light|Dark hold the per-mode values; Model/Base everything
 * mode-free; every other set is an overlay a selector or media query switches
 * on (which one, the render table in model.ts says).
 */

export interface TokenEntry {
  set: string;
  path: string;
  value: string;
  /** becomes `$description` (and the trailing comment when rendered) */
  description?: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const SET = {
  light: 'Mode/Light',
  dark: 'Mode/Dark',
  base: 'Model/Base',
  rtl: 'Direction/Rtl',
  forced: 'Contrast/Forced',
  coarse: 'Pointer/Coarse',
  xl: 'Viewport/Xl',
  motion: (character: string) => `Motion/${cap(character)}`,
  reduced: (character: string) => `Motion/${cap(character)}-Reduced`,
  shape: (shape: string) => `Shape/${cap(shape)}`,
};

/**
 * Theme ids (`{group}/{name}`) this module writes into $themes.json — the
 * render table (model.ts) names them, the renderer only reads $themes.json.
 */
export const THEME = {
  mode: (name: string) => `Mode/${name}`,
  base: 'Model/Base',
  rtl: 'Direction/Rtl',
  forced: 'Contrast/Forced',
  coarse: 'Pointer/Coarse',
  xl: 'Viewport/Xl',
  motion: (character: string) => `Motion/${cap(character)}`,
  reduced: (character: string) => `Motion/${cap(character)}-Reduced`,
  shape: (shape: string) => `Shape/${cap(shape)}`,
};

export interface DtcgOptions {
  /** CSS variable prefix without the dashes (`x-`) */
  prefix: string;
  /** the recipe's default motion character and radius shape (theme names) */
  defaults: { motion: string; shape: string };
}

export interface DtcgOutput {
  files: Record<string, string>;
  summary: string;
}

type Leaf = { $type: string; $value: unknown; $description?: string };
type Group = { [key: string]: Group | Leaf };

const SYSTEM_COLORS = new Set([
  'Canvas',
  'CanvasText',
  'LinkText',
  'VisitedText',
  'ActiveText',
  'ButtonFace',
  'ButtonText',
  'ButtonBorder',
  'Field',
  'FieldText',
  'Highlight',
  'HighlightText',
  'SelectedItem',
  'SelectedItemText',
  'Mark',
  'MarkText',
  'GrayText',
  'AccentColor',
  'AccentColorText',
]);
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const NUMBER = /^-?\d+(\.\d+)?$/;
const VAR = /var\((--[a-z0-9-]+)\)/g;
const WHOLE_VAR = /^var\((--[a-z0-9-]+)\)$/;
const FONT_SHORTHAND =
  /^(\d+) var\((--[a-z0-9-]+)\)\/var\((--[a-z0-9-]+)\) var\((--[a-z0-9-]+)\)$/;
const BEZIER = /^cubic-bezier\(([^)]+)\)$/;

export function emitDtcg(
  register: TokenEntry[],
  options: DtcgOptions,
): DtcgOutput {
  const { prefix } = options;
  const cssName = (path: string) => `--${prefix}${path.replaceAll('.', '-')}`;

  // CSS name → path (unique), path → first value (the base wins) for type lookup
  const byName = new Map<string, string>();
  const firstValue = new Map<string, string>();
  for (const e of register) {
    const name = cssName(e.path);
    const known = byName.get(name);
    if (known && known !== e.path)
      throw new Error(`DTCG: ${name} steht für ${known} und ${e.path}`);
    byName.set(name, e.path);
    if (e.set === SET.base || !firstValue.has(e.path))
      firstValue.set(e.path, e.value);
  }
  const pathOf = (name: string) => {
    const p = byName.get(name);
    if (!p) throw new Error(`DTCG: ${name} ist kein Token des Modells`);
    return p;
  };
  const refs = (v: string) => v.replace(VAR, (_, n) => `{${pathOf(n)}}`);

  /** $type of a literal value, by value first, then by what the path says */
  const literalType = (path: string, v: string): string => {
    const leaf = path.slice(path.lastIndexOf('.') + 1);
    if (HEX.test(v) || v === 'transparent' || SYSTEM_COLORS.has(v))
      return 'color';
    if (/ms$/.test(v)) return 'duration';
    if (NUMBER.test(v))
      return leaf.endsWith('-weight') ? 'fontWeights' : 'number';
    if (leaf.endsWith('-tracking')) return 'letterSpacing';
    if (leaf.endsWith('-case')) return 'textCase';
    if (path.startsWith('font.') || leaf.endsWith('-family'))
      return 'fontFamilies';
    if (/^(calc|clamp|round)\(/.test(v) || /(px|em|rem|ch)$/.test(v)) {
      if (path.startsWith('type.') && leaf.endsWith('-size'))
        return 'fontSizes';
      if (leaf.endsWith('-line-height')) return 'lineHeights';
      return 'dimension';
    }
    if (BEZIER.test(v)) return 'cubicBezier';
    if (path.startsWith('elevation.') && /px/.test(v)) return 'boxShadow';
    return 'other';
  };
  /** $type of any value: a whole reference takes its target's type */
  const typeOf = (
    path: string,
    v: string,
    seen = new Set<string>(),
  ): string => {
    const whole = WHOLE_VAR.exec(v);
    if (whole) {
      const target = pathOf(whole[1]);
      if (seen.has(target)) throw new Error(`DTCG: Zyklus bei ${target}`);
      const tv = firstValue.get(target);
      if (tv === undefined) throw new Error(`DTCG: ${target} ohne Wert`);
      return typeOf(target, tv, seen.add(target));
    }
    if (FONT_SHORTHAND.test(v)) return 'typography';
    if (/var\(/.test(v))
      return /^(calc|clamp)\(/.test(v) ? 'dimension' : 'other';
    return literalType(path, v);
  };

  /** `0 1px 2px #0000000f, 0 4px 8px -2px #00000029` → Tokens-Studio shadows */
  const shadows = (v: string) =>
    v.split(',').map((part) => {
      const words = part.trim().split(/\s+/);
      const color = words.pop()!;
      const [x, y, blur = '0', spread = '0'] = words;
      return { x, y, blur, spread, color, type: 'dropShadow' };
    });

  const leaf = (path: string, v: string): Leaf => {
    const $type = typeOf(path, v);
    // a composite from the shorthand; a reference to one stays a reference
    if ($type === 'typography' && FONT_SHORTHAND.test(v)) {
      const m = FONT_SHORTHAND.exec(v)!;
      const sizePath = pathOf(m[2]);
      const base = sizePath.slice(0, -'-size'.length);
      const value: Record<string, string> = {
        fontFamily: `{${pathOf(m[4])}}`,
        fontWeight: `{${path}-weight}`,
        fontSize: `{${sizePath}}`,
        lineHeight: `{${pathOf(m[3])}}`,
        letterSpacing: `{${path}-tracking}`,
      };
      if (firstValue.has(`${base}-case`)) value['textCase'] = `{${base}-case}`;
      for (const r of Object.values(value))
        if (!firstValue.has(r.slice(1, -1)))
          throw new Error(`DTCG: ${path} verweist auf ${r}, das es nicht gibt`);
      return { $type, $value: value };
    }
    if ($type === 'boxShadow' && !WHOLE_VAR.test(v))
      return { $type, $value: shadows(v) };
    if ($type === 'cubicBezier' && !WHOLE_VAR.test(v))
      return { $type, $value: BEZIER.exec(v)![1].split(',').map(Number) };
    if (($type === 'number' || $type === 'fontWeights') && NUMBER.test(v))
      return { $type, $value: Number(v) };
    return { $type, $value: refs(v) };
  };

  // ---------- sets ----------
  const setOrder = [SET.light, SET.dark, SET.base];
  for (const e of register) if (!setOrder.includes(e.set)) setOrder.push(e.set);
  const trees: Record<string, Group> = {};
  for (const e of register) {
    const root = (trees[e.set] ??= {});
    const segs = e.path.split('.');
    let node: Group = root;
    for (const s of segs.slice(0, -1)) {
      const next = (node[s] ??= {});
      if ('$value' in next)
        throw new Error(
          `DTCG: ${e.path} — ${segs.slice(0, segs.indexOf(s) + 1).join('.')} ist schon ein Token, keine Gruppe`,
        );
      node = next as Group;
    }
    const last = segs[segs.length - 1];
    if (last in node)
      throw new Error(
        '$value' in node[last]
          ? `DTCG: ${e.path} doppelt in ${e.set}`
          : `DTCG: ${e.path} ist schon eine Gruppe`,
      );
    node[last] = e.description
      ? { ...leaf(e.path, e.value), $description: e.description }
      : leaf(e.path, e.value);
  }

  // ---------- themes ----------
  interface Theme {
    id: string;
    name: string;
    group: string;
    selectedTokenSets: Record<string, 'enabled' | 'source'>;
  }
  const themes: Theme[] = [];
  const theme = (
    group: string,
    name: string,
    sets: Record<string, 'enabled' | 'source'>,
  ) =>
    themes.push({
      id: `${group}-${name}`.toLowerCase(),
      name,
      group,
      selectedTokenSets: sets,
    });
  theme('Mode', 'Light', { [SET.light]: 'enabled' });
  theme('Mode', 'Dark', { [SET.dark]: 'enabled' });
  theme('Model', 'Base', { [SET.light]: 'source', [SET.base]: 'enabled' });
  const src: Record<string, 'enabled' | 'source'> = {
    [SET.light]: 'source',
    [SET.base]: 'source',
  };
  /** an axis of overlays: the default has no set of its own, every other name enables one */
  const overlayAxis = (
    group: string,
    defaultName: string,
    variants: [name: string, set: string][],
  ) => {
    const present = variants.filter(([, set]) => setOrder.includes(set));
    if (!present.length) return;
    theme(group, defaultName, { ...src });
    for (const [name, set] of present)
      theme(group, name, { ...src, [set]: 'enabled' });
  };
  const after = (p: string) => (s: string) => s.slice(p.length);
  overlayAxis(
    'Shape',
    cap(options.defaults.shape),
    setOrder
      .filter((s) => s.startsWith('Shape/'))
      .map((s) => [after('Shape/')(s), s]),
  );
  // Motion: one axis for character × reduced motion. Tokens Studio knows no
  // theme that depends on two axes, so `{Character}-Reduced` is a theme of
  // its own, the character's set as source (the default character has none).
  const motionThemes: [
    name: string,
    sets: Record<string, 'enabled' | 'source'>,
  ][] = [
    [cap(options.defaults.motion), { ...src }],
    ...setOrder
      .filter((s) => s.startsWith('Motion/') && !s.endsWith('-Reduced'))
      .map((s): (typeof motionThemes)[number] => [
        after('Motion/')(s),
        { ...src, [s]: 'enabled' },
      ]),
  ];
  for (const [name, sets] of motionThemes) theme('Motion', name, sets);
  for (const [name, sets] of motionThemes) {
    const reduced = SET.reduced(name);
    if (!setOrder.includes(reduced)) continue;
    const asSource = Object.fromEntries(
      Object.entries(sets).map(([s]) => [s, 'source' as const]),
    );
    theme('Motion', `${name}-Reduced`, { ...asSource, [reduced]: 'enabled' });
  }
  overlayAxis('Pointer', 'Fine', [['Coarse', SET.coarse]]);
  overlayAxis('Contrast', 'Normal', [['Forced', SET.forced]]);
  overlayAxis('Direction', 'Ltr', [['Rtl', SET.rtl]]);
  overlayAxis('Viewport', 'Base', [['Xl', SET.xl]]);

  // ---------- token-map ----------
  const figmaToCSS: Record<string, string> = {};
  for (const e of register) {
    const figma = e.path.replaceAll('.', '/');
    if (!(figma in figmaToCSS)) figmaToCSS[figma] = cssName(e.path);
  }
  const tokenMap = {
    prefix: `--${prefix}`,
    count: Object.keys(figmaToCSS).length,
    transform: `Each Figma path becomes a CSS variable: join the segments with '-' and prepend '--${prefix}'.`,
    categories: categories(Object.keys(figmaToCSS)),
    figmaToCSS,
  };

  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  const files: Record<string, string> = {
    'tokens/$metadata.json': json({ tokenSetOrder: setOrder }),
    'tokens/$themes.json': json(themes),
  };
  for (const set of setOrder) files[`tokens/${set}.json`] = json(trees[set]);
  files['token-map.json'] = json(tokenMap);

  const groups = new Set(themes.map((t) => t.group)).size;
  return {
    files,
    summary: `DTCG: ${register.length} Einträge, ${tokenMap.count} Pfade, ${setOrder.length} Sets, ${themes.length} Themes auf ${groups} Achsen; token-map ${tokenMap.count}`,
  };
}

/**
 * Top-of-file index of the token-map (same rule as the resolver): groups with
 * more than 100 tokens expand one level, up to depth 4.
 */
function categories(paths: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (ps: string[], depth: number) => {
    const grouped: Record<string, string[]> = {};
    for (const p of ps)
      (grouped[p.split('/').slice(0, depth).join('/')] ??= []).push(p);
    for (const [key, group] of Object.entries(grouped)) {
      const deeper =
        group.length > 100 &&
        depth < 4 &&
        group.some((p) => p.split('/').length > depth);
      if (deeper) walk(group, depth + 1);
      else out[key] = group.length;
    }
  };
  walk(paths, 1);
  return out;
}
