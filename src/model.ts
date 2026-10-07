/**
 * The token model, built forwards from the recipe. Names below with the
 * default prefix `x-` and attribute suffix `-x` (both GenerateOptions).
 *
 *   Auswahl    --x-{hue}-{canvas|subtle|tint|…|fill|fill-hover|ink-subtle|ink|on-fill|state-*}
 *              --x-pole-{ink|ink-inverted|paper|canvas}      (per mode)
 *   Controls   --x-ctl-{hierarchy}-{part}[-readonly|-disabled][-inactive|-selected|-done][-negative|-warning|-positive]-{interaction}
 *   Status     --x-status-{intent}-{surface|content|indicator}-{strong|subtle}
 *   Feedback   --x-feedback-{intent}-{surface|line|content|icon}
 *   Content    --x-content-{primary|secondary|disabled}   (pole ink + alpha, per mode)
 *   Mark       --x-mark-surface · --x-mark-current (search hit; source per mode in recipe `mark`)
 *   Space      --x-size-{px} (Foundation)  ·  --x-space-{gap|inset}-{role}
 *              --x-border-width-* · --x-focus-{width|offset} · --x-width-*
 *   Radius     --x-radius-{round|action|field|field-multiline|item|tag|badge|container|container-large}
 *   Type       --x-type-{role}-{step}[-subtle|-strong] (font shorthand) + -size · -line-height · -weight · -family · -tracking
 *              --x-prose-* (em) · --x-type-inline-{code|sup}-size (em) · type-figma.json (px per mode)
 *   Breakpoints breakpoints.json + _breakpoints.scss (media queries can't read vars)
 *   Foundation --x-alpha-{1…8}   alpha ladder per mode (recipe `alpha`); the
 *              Auswahl values above are precomputed from it
 *   Focus      --x-focus-ring · --x-focus-offset-inset (ring inside, dense arrangements)
 *   Control    --x-control-{xs|sm|md|lg}-{height|icon|icon-alone|gap|gap-plain|row-height}
 *              --x-control-{size}-{action|tag|field|row}-{text|tracking|inline|inline-icon|block|radius}
 *              --x-control-{sm|md|lg}-field-tag-radius (tag inside that field, concentric)
 *              --x-control-{family}-pill (per shape) · --x-target-min · --x-badge-{sm|md}-*
 *              @media (pointer: coarse) overrides · control-figma.json (px, fine/coarse)
 *   Layers     --x-layer-{sticky|chrome} (document only; floating = top layer)
 *              --x-elevation-sticky-{top|bottom|start|end} (per mode; RTL swaps start/end)
 *   Dataviz    --x-dataviz-category-{1…6|other} · -sequential-{1…6} · -diverging-{neutral|rated}-{low|high}-{1…3}|-mid
 *              --x-dataviz-{surface|grid|baseline|label|value|line|gap|marker|radius}
 *   Identity   --x-identity-{1…6|neutral}-{surface|content|indicator}-{strong|subtle} (avatar, user labels)
 *   Icons      --x-type-{role}-{step}-icon (icon next to that text) · --x-icon-spot-{sm|md|lg}
 *   Avatars    --x-avatar-{xs|sm|md} (spot sizes, no coarse step)
 *   Forced     @media (forced-colors: active): selection/disabled/focus/edge/status dot/mark → system colours
 *   Motion     --x-duration-{instant|ms} · --x-easing-{standard|enter|exit|linear|spring}
 *              --x-motion-{role}-{duration|easing|move-duration|move-easing|distance|scale}
 *              --x-motion-travel · [data-motion-x] (other characters, check only)
 *              @media (prefers-reduced-motion) + [data-reduced-motion-x] (test hook)
 *              motion-figma.json
 *
 * Controls axes: availability × selection × tone × interaction. Tone is the
 * colour overlay in tonality names; components map their events onto it
 * (validation error → negative, step warning → warning). Rule: the tone
 * swaps the hue wherever the style uses it (plus neutral strokes); what the
 * style keeps neutral stays neutral; disabled suppresses the tone.
 *
 * Hierarchies are emphasis levels for ALL controls (primary: button, checkbox,
 * radio, progress steps; secondary: text field, text area, outline button,
 * list rows; tertiary: tertiary/link/icon button, tabs). All three on accent,
 * styles `solid`, `outline`, `ghost`. `brand` = (brand, solid): the
 * committing action at the end of a flow (create, buy). Destructive actions: `destructive`
 * (negative, solid — only in the confirmation) and `destructive-subtle`
 * (negative, outline-hue — everyday).
 *
 * Pure core: `generateModel(recipe, options)` returns every artefact as a
 * string plus the report lines — no file system, no console. The CSS comes
 * from @formtrieb/tokens-render, fed with the DTCG tree and the render table.
 */
import {
  over,
  contrastWcag,
  deltaE2000,
  hexToOklch,
  parseThemes,
  withAlpha,
} from '@formtrieb/tokens-core';
import {
  renderVariables,
  type RenderFile,
  type RenderFileOptions,
  type RenderRule,
  type TokenSystem,
} from '@formtrieb/tokens-render';
import { APCA_CARRIERS, apcaLc, apcaRoleTargets } from './apca.js';
import { cvdDeltaE, deltaE, VIZ } from './cvd.js';
import { SET, THEME, emitDtcg, type TokenEntry } from './dtcg.js';
import {
  MODES,
  STEP_NAMES,
  buildRamps,
  checkContract,
  type Recipe,
  type VizSlot,
} from './ramp.js';
import { RecipeError } from './recipe.js';

export interface GenerateOptions {
  /** CSS variable prefix without the leading dashes (`x-` → `--x-accent-fill`) */
  prefix?: string;
  /**
   * appended to every data attribute the model's selectors read
   * (`-x` → `[data-mode-x]`, `[data-motion-x]`, `[data-shape-x]`,
   * `[data-reduced-motion-x]`); `''` for the plain names
   */
  attributeSuffix?: string;
}

export interface ModelOutput {
  /** generated artefacts by file name (model.css, model-report.json, …) */
  files: Record<string, string>;
  /** the run's report, one line each (what the CLI prints) */
  log: string[];
  /** the recipe the model was generated from, defaults applied */
  recipe: Recipe;
}

/**
 * what generateModel writes as render.json: the render options and the
 * render table, in the render-file format of @formtrieb/tokens-render
 */
export type RenderTable = Extract<RenderFile, { rules: RenderRule[] }>;

/** the whole model from one recipe — pure: no file system, no console */
export function generateModel(
  recipe: Recipe,
  options: GenerateOptions = {},
): ModelOutput {
  const P = options.prefix ?? 'x-';
  const ATTR_SUFFIX = options.attributeSuffix ?? '-x';
  /** `mode` → `data-mode-x` */
  const attr = (name: string) => `data-${name}${ATTR_SUFFIX}`;
  const files: Record<string, string> = {};
  const log: string[] = [];
  /**
   * One declaration = one token: `decl` registers the token (dot-path,
   * value, set) the DTCG tree is written from (dtcg.ts) and returns its
   * path. CSS name = prefix + path with dots as dashes; a value refers to
   * another token as `var(--{prefix}{name})`.
   */
  const register: TokenEntry[] = [];
  const decl = (
    path: string,
    value: string | number,
    set: string = SET.base,
    comment?: string,
  ) => {
    // second line behind the schema: nothing may end the declaration or
    // reach outside it (`;`, braces, `<`, comments, escapes, `url(`)
    if (/[;{}<>\\]|\/\*|url\(/i.test(String(value)))
      throw new Error(`unsicherer CSS-Wert für ${path}: ${String(value)}`);
    register.push({
      set,
      path,
      value: String(value),
      ...(comment ? { description: comment } : {}),
    });
    return path;
  };
  const ramps = buildRamps(recipe);

  /**
   * Names are universal, the recipe assigns them. A
   * name the recipe leaves out or invents is a recipe error, not a contract
   * finding: without it there is nothing to generate, so the run stops.
   */
  const recipeErrors: string[] = [];
  const requireKeys = (
    what: string,
    obj: object | undefined,
    names: readonly string[],
  ) => {
    const have = Object.keys(obj ?? {});
    for (const n of names)
      if (!have.includes(n)) recipeErrors.push(`${what}: ${n} fehlt`);
    for (const n of have)
      if (!names.includes(n))
        recipeErrors.push(`${what}: ${n} ist kein bekannter Name`);
  };
  const assertRecipe = () => {
    if (recipeErrors.length) throw new RecipeError(recipeErrors);
  };

  /** semantic hue → recipe ramp (recipe `semanticHues`) */
  const SEMANTIC_HUES = [
    'neutral',
    'brand',
    'accent',
    'positive',
    'negative',
    'warning',
    'info',
  ] as const;
  requireKeys('semanticHues', recipe.semanticHues, SEMANTIC_HUES);
  const HUES: Record<string, string> = Object.fromEntries(
    SEMANTIC_HUES.map((h) => [h, recipe.semanticHues?.[h] ?? '']),
  );
  for (const [h, ramp] of Object.entries(HUES))
    if (ramp && !recipe.hues.some((d) => d.name === ramp))
      recipeErrors.push(`semanticHues.${h}: Ramp ${ramp} fehlt in hues`);
  assertRecipe();

  /**
   * Thresholds: the DS sets them in `contract` (standard in
   * defaults.json). Where WCAG sets a floor, the recipe may tighten it,
   * never go below — a weaker value is a recipe error.
   */
  const C = recipe.contract;
  const WCAG_FLOORS = [
    ['textMin', 4.5, 'WCAG 1.4.3'],
    ['strokeMin', 3, 'WCAG 1.4.11'],
    ['solidMin', 4.5, 'WCAG 1.4.3'],
  ] as const;
  for (const [k, floor, ref] of WCAG_FLOORS)
    if (!(C[k] >= floor))
      recipeErrors.push(`contract.${k}: ${C[k]} < ${floor} (${ref})`);
  for (const k of [
    'typeMinPx',
    'motionMaxMs',
    'identityMinDeltaE',
    'legendMinDeltaE',
  ] as const)
    if (typeof C[k] !== 'number') recipeErrors.push(`contract.${k} fehlt`);
  const [READING_MIN, READING_MAX] = C.readingCh ?? [NaN, NaN];
  if (!(READING_MIN < READING_MAX))
    recipeErrors.push(`contract.readingCh: ${C.readingCh} ist kein Bereich`);
  if (READING_MAX > 80)
    recipeErrors.push(
      `contract.readingCh: ${READING_MAX} > 80 Zeichen (WCAG 1.4.8)`,
    );
  assertRecipe();
  // every step has a fixed name; a ladder of another length has no names to give
  const NAMES = STEP_NAMES;
  if (recipe.steps !== NAMES.length)
    throw new RecipeError([
      `steps: ${recipe.steps} — jede Ramp hat genau ${NAMES.length} Stufen (${NAMES.join(' · ')})`,
    ]);
  const MODE_ATTR: Record<string, string> = { light: 'Light', dark: 'Dark' };

  /**
   * Sticky elevation is directional: a shadow token can't
   * turn around, and `raised`/`overlay` fall downwards — out of the scroller at a
   * save bar. Named by the edge the element sticks to: top casts down, bottom up,
   * start (fixed first table column) towards inline-end, end towards
   * inline-start. start/end are physical in CSS, so RTL swaps them (CSS block).
   */
  const STICKY_EDGES = ['top', 'bottom', 'start', 'end'] as const;
  type StickyEdge = (typeof STICKY_EDGES)[number];

  /** turn a box-shadow list written for `top` (casting down) towards another edge */
  function turnShadow(list: string, edge: StickyEdge): string {
    const len = (n: number) => (n === 0 ? '0' : `${n}px`);
    return list
      .split(',')
      .map((sh) => {
        const parts = sh.trim().split(/\s+/);
        const color = parts.pop()!;
        const [x, y, ...rest] = parts.map((p) => parseFloat(p));
        const [nx, ny] =
          edge === 'top'
            ? [x, y]
            : edge === 'bottom'
              ? [x, -y]
              : edge === 'start'
                ? [y, x]
                : [-y, x];
        return [len(nx + 0), len(ny + 0), ...rest.map(len), color].join(' ');
      })
      .join(', ');
  }

  /**
   * Alpha comes from the Foundation (recipe `alpha`, one ladder per mode). The
   * Auswahl is mode-free and only names a step number — like it names ramp
   * steps (recipe `alphaSteps`, standard in defaults.json). `edge` is the
   * supporting edge of an elevated surface (with its shadow).
   *
   * Text emphasis `content` = pole ink with alpha: takes on
   * the tint of any surface and stays mode-safe; step 8 is stronger in Dark,
   * which loses more contrast on its lighter surfaces. Two readable levels only;
   * finer hierarchy comes from typography. `disabled` is deliberately below AA
   * (WCAG exempts inactive components) and named so nobody sets body text in it.
   */
  const ALPHA_ROLES = [
    'state-hover',
    'state-selected',
    'state-pressed',
    'edge',
    'on-fill-hover',
    'on-fill-selected',
    'on-fill-pressed',
    'on-fill-disabled',
    'content-disabled',
    'content-secondary',
  ] as const;
  requireKeys('alphaSteps', recipe.alphaSteps, ALPHA_ROLES);
  for (const [k, s] of Object.entries(recipe.alphaSteps ?? {}))
    if (!Number.isInteger(s) || s < 1 || s > recipe.alpha.light.length)
      recipeErrors.push(
        `alphaSteps.${k}: ${s} liegt nicht auf der Alpha-Leiter 1–${recipe.alpha.light.length}`,
      );
  assertRecipe();
  const ALPHA_STEP = recipe.alphaSteps as Record<
    (typeof ALPHA_ROLES)[number],
    number
  >;
  const CONTENT_STEP: Record<string, number | null> = {
    primary: null,
    secondary: ALPHA_STEP['content-secondary'],
    disabled: ALPHA_STEP['content-disabled'],
  };

  // ---------- Auswahl (per mode) ----------
  const values: Record<string, Record<string, string>> = {};
  for (const mode of MODES) {
    const v: Record<string, string> = {};
    const p = recipe.poles[mode];
    v['pole.ink'] = p.ink;
    v['pole.ink-inverted'] = p.inkInverted;
    v['pole.paper'] = p.paper;
    v['pole.canvas'] = p.canvas;
    v['pole.overlay'] = p.overlay ?? p.paper;
    v['pole.sunken'] = p.sunken ?? p.canvas;
    v['pole.scrim'] = p.scrim ?? '#00000066';
    for (const [lvl, sh] of Object.entries(recipe.elevation?.[mode] ?? {}))
      if (lvl === 'sticky')
        // written once in its top form, turned into the four edges it can stick to
        for (const edge of STICKY_EDGES)
          v[`elevation.sticky-${edge}-value`] = turnShadow(sh, edge);
      else v[`elevation.${lvl}-value`] = sh;
    // Foundation: alpha ladder of this mode, 1-based like the ramps
    const alpha = (step: number) => recipe.alpha[mode][step - 1];
    recipe.alpha[mode].forEach((a, i) => (v[`alpha.${i + 1}`] = String(a)));
    for (const [hue, ramp] of Object.entries(HUES)) {
      ramps[mode][ramp].forEach((s, i) => (v[`${hue}.${NAMES[i]}`] = s.hex));
      const fill = v[`${hue}.fill`];
      const pref = recipe.onFill?.[mode] ?? 'auto';
      v[`${hue}.on-fill`] =
        pref !== 'auto'
          ? pref
          : contrastWcag('#ffffff', fill) >= contrastWcag('#000000', fill)
            ? '#ffffff'
            : '#000000';
    }
    // search hit: per mode a ramp step of the mark hue + alpha (recipe `mark`)
    for (const k of ['surface', 'current'] as const) {
      const [step, a] = recipe.mark![mode][k];
      const c = v[`${recipe.mark!.hue}.${step}`];
      v[k === 'surface' ? 'mark.value' : 'mark.current-value'] = withAlpha(c, a);
    }
    // translucent ink edge: crisp on any surface and mode, never a frame
    v['neutral.edge'] = withAlpha(p.ink, alpha(ALPHA_STEP.edge));
    for (const name of [
      'state-hover',
      'state-pressed',
      'state-selected',
    ] as const)
      v[`neutral.${name}`] = withAlpha(p.ink, alpha(ALPHA_STEP[name]));
    for (const [lvl, step] of Object.entries(CONTENT_STEP))
      v[`content.${lvl}`] =
        step === null ? p.ink : withAlpha(p.ink, alpha(step));
    // the inverted surface (toast, dark sidebar) behaves like a fill: pole ink is its surface
    v['inverted.fill'] = p.ink;
    v['inverted.on-fill'] = p.inkInverted;
    // surfaces for controls that sit ON a fill. They must move AWAY from the
    // on-fill colour: a white layer on brand red would drop white text below
    // 4.5:1. A hue fill therefore uses its next ramp steps (like the solid
    // button); the inverted surface sits at the pole already and has the
    // headroom for translucent on-fill layers.
    for (const hue of [...Object.keys(HUES), 'inverted']) {
      const on = v[`${hue}.on-fill`];
      const layer = (a: number) => withAlpha(on, a);
      const ramp = hue !== 'inverted';
      const a = (k: keyof typeof ALPHA_STEP) => layer(alpha(ALPHA_STEP[k]));
      v[`${hue}.on-fill-hover`] = ramp
        ? v[`${hue}.fill-hover`]
        : a('on-fill-hover');
      v[`${hue}.on-fill-pressed`] = ramp
        ? v[`${hue}.ink-subtle`]
        : a('on-fill-pressed');
      v[`${hue}.on-fill-selected`] = ramp
        ? v[`${hue}.fill-hover`]
        : a('on-fill-selected');
      v[`${hue}.on-fill-disabled`] = a('on-fill-disabled');
    }
    values[mode] = v;
  }

  // ---------- Controls ----------
  type Avail = 'enabled' | 'readonly' | 'disabled';
  type Sel = 'none' | 'selected' | 'inactive' | 'done';
  type Tone = 'none' | 'negative' | 'warning' | 'positive';
  type Inter = 'idle' | 'hover' | 'pressed' | 'focus';
  interface Cell {
    avail: Avail;
    sel: Sel;
    tone: Tone;
    inter: Inter;
  }
  const PARTS = [
    'background',
    'stroke',
    'icon',
    'text',
    'text-subtle',
    'track',
  ] as const;
  type Part = (typeof PARTS)[number];
  const AVAIL: Record<Avail, Inter[]> = {
    enabled: ['idle', 'hover', 'pressed', 'focus'],
    readonly: ['idle', 'focus'],
    disabled: ['idle'],
  };
  const SEL: Sel[] = ['none', 'inactive', 'selected', 'done'];
  const TONES: Tone[] = ['none', 'negative', 'warning', 'positive'];
  type Style = (p: Part, c: Cell) => string;

  /**
   * style `solid` — one rule set for every control of a hierarchy. The selection
   * axis keeps its four meanings apart, so one hierarchy serves all of them:
   *
   *   none      resting action, no choice involved (button)      → filled
   *   inactive  option not chosen (empty box, open step, tab)    → ring
   *   selected  chosen / current (checked box, current step)     → filled
   *   done      completed (step behind the current one)          → tinted, no ring
   *
   * Tokens are an offer: a component reads only the parts and cells it needs
   * (the empty checkbox reads no background). Text never takes a tone on the
   * page; text on a fill or tint follows that surface.
   */
  const solid: Style = (part, c) => {
    const s = c.sel;
    if (c.avail === 'disabled') {
      const bg = {
        none: 'neutral.subtle',
        inactive: 'transparent',
        // visible disabled shapes read `line` (step 7): step 6 is decoration only
        selected: 'neutral.line',
        done: 'neutral.subtle',
      }[s];
      return {
        background: bg,
        stroke: bg === 'transparent' ? 'neutral.line' : bg,
        icon: 'neutral.line-strong',
        text: 'neutral.line-strong',
        'text-subtle': 'neutral.line',
        track: 'neutral.line-subtle',
      }[part];
    }
    if (c.avail === 'readonly') {
      // value readable, not changeable: the choice shows as a tint with a quiet edge
      return {
        background: s === 'inactive' ? 'transparent' : 'hue.tint',
        stroke: {
          none: 'hue.line',
          inactive: 'neutral.line',
          selected: 'hue.line',
          done: 'hue.tint',
        }[s],
        icon: s === 'inactive' ? 'neutral.ink-subtle' : 'hue.ink',
        text: s === 'none' ? 'hue.ink' : 'pole.ink',
        'text-subtle': 'neutral.ink-subtle',
        track: s === 'done' ? 'hue.fill' : 'neutral.line-subtle',
      }[part];
    }
    const i = c.inter === 'focus' ? 'idle' : c.inter;
    const fill = {
      idle: 'hue.fill',
      hover: 'hue.fill-hover',
      pressed: 'hue.ink-subtle',
    }[i];
    const bg = {
      none: fill,
      selected: fill,
      done: {
        idle: 'hue.tint',
        hover: 'hue.tint-hover',
        pressed: 'hue.tint-pressed',
      }[i],
      inactive: {
        idle: 'transparent',
        hover: 'neutral.state-hover',
        pressed: 'neutral.state-pressed',
      }[i],
    }[s];
    return {
      background: bg,
      stroke:
        s === 'inactive'
          ? {
              idle: 'neutral.line-strong',
              hover: 'hue.fill',
              pressed: 'hue.fill-hover',
            }[i]
          : bg,
      icon: {
        none: 'hue.on-fill',
        selected: 'hue.on-fill',
        done: 'hue.ink',
        inactive: 'neutral.ink-subtle',
      }[s],
      text: s === 'none' ? 'hue.on-fill' : 'pole.ink',
      'text-subtle': s === 'none' ? 'hue.on-fill' : 'neutral.ink-subtle',
      track: s === 'done' ? 'hue.fill' : 'neutral.line-subtle',
    }[part];
  };

  /**
   * The tone swaps the hue wherever it appears, plus neutral strokes; disabled
   * suppresses. Text follows its surface: it takes the tone only when it sits on
   * a hue-coloured background (on-fill on a red fill), never on the page.
   */
  function applyTone(part: Part, ref: string, c: Cell, bg: string): string {
    if (c.tone === 'none' || c.avail === 'disabled') return ref;
    if ((part === 'text' || part === 'text-subtle') && !bg.startsWith('hue.'))
      return ref;
    if (ref.startsWith('hue.')) return `${c.tone}.${ref.slice(4)}`;
    if (
      part === 'stroke' &&
      ref.startsWith('neutral.') &&
      !ref.includes('state')
    )
      return `${c.tone}.${ref.slice(8)}`;
    return ref;
  }

  /**
   * style `outline` — the quieter controls: text field, text area, outline
   * button (`none`), list rows (`inactive` = option, `selected` = chosen).
   * Focus is visible on the field itself: the stroke takes the hue. A selected
   * row or card keeps a neutral surface; the hue shows in stroke and check only.
   */
  const outline: Style = (part, c) => {
    const s = c.sel === 'done' ? 'selected' : c.sel;
    if (c.avail === 'disabled') {
      return {
        background: s === 'inactive' ? 'transparent' : 'neutral.subtle',
        stroke: s === 'inactive' ? 'transparent' : 'neutral.line',
        icon: 'neutral.line-strong',
        text: 'neutral.line-strong',
        'text-subtle': 'neutral.line',
        track: 'neutral.line-subtle',
      }[part];
    }
    // readonly drops the stroke: the stroke says "you can type here", which a
    // readonly field never offers; disabled keeps a faded one (a field that is
    // switched off). A selected row keeps its hue line next to the check.
    if (c.avail === 'readonly') {
      return {
        // a state layer, not a fixed step: neutral.subtle can equal
        // surface.overlay in Dark — readonly would vanish in a modal
        // (1.00:1); the layer reads the same on page, card and modal. The field
        // stays a field (an adopted address that a checkbox makes editable);
        // showing a value as plain text instead is the product's choice.
        background: s === 'inactive' ? 'transparent' : 'neutral.state-selected',
        stroke: s === 'selected' ? 'hue.line' : 'transparent',
        icon: s === 'selected' ? 'hue.ink' : 'neutral.ink-subtle',
        text: 'pole.ink',
        'text-subtle': 'neutral.ink-subtle',
        track: 'neutral.line-subtle',
      }[part];
    }
    const i = c.inter;
    const layer = {
      idle: 'transparent',
      hover: 'neutral.state-hover',
      pressed: 'neutral.state-pressed',
      focus: 'transparent',
    }[i];
    return {
      background: {
        // hover keeps the paper — only the stroke turns to ink; pressed adds a
        // brief light layer (a grey hover surface looks dirty). The text field reads only the
        // stroke anyway; list rows (inactive / selected) keep their layer.
        none: {
          idle: 'pole.paper',
          hover: 'pole.paper',
          pressed: 'neutral.state-hover',
          focus: 'pole.paper',
        }[i],
        inactive: layer,
        // a list never gets an accent surface: the choice shows in stroke and check
        selected: {
          idle: 'neutral.state-selected',
          hover: 'neutral.state-pressed',
          pressed: 'neutral.state-pressed',
          focus: 'neutral.state-selected',
        }[i],
      }[s],
      stroke: {
        none: {
          idle: 'neutral.line-strong',
          hover: 'neutral.ink',
          pressed: 'neutral.ink',
          focus: 'hue.fill',
        }[i],
        inactive: 'transparent',
        selected: 'hue.fill',
      }[s],
      icon: s === 'selected' ? 'hue.ink' : 'neutral.ink-subtle',
      text: 'pole.ink',
      'text-subtle': 'neutral.ink-subtle',
      track: 'neutral.line-subtle',
    }[part];
  };

  /**
   * style `ghost` — controls without a surface of their own: tertiary button,
   * link button, icon button (`none`), tabs and nav items (`inactive` /
   * `selected`). Text stays neutral — colour is scarce: the hue appears only in
   * the selected indicator (stroke, track). State layers work on any underground.
   */
  const ghost: Style = (part, c) => {
    const s = c.sel === 'done' ? 'selected' : c.sel;
    if (c.avail === 'disabled') {
      return {
        background: 'transparent',
        stroke: s === 'selected' ? 'neutral.line' : 'transparent',
        icon: 'neutral.line-strong',
        text: 'neutral.line-strong',
        'text-subtle': 'neutral.line',
        track: 'neutral.line-subtle',
      }[part];
    }
    const i = c.avail === 'readonly' || c.inter === 'focus' ? 'idle' : c.inter;
    const active = i !== 'idle';
    const ink = s === 'inactive' && !active ? 'neutral.ink-subtle' : 'pole.ink';
    return {
      background:
        s === 'selected' && i === 'idle'
          ? 'neutral.state-selected'
          : {
              idle: 'transparent',
              hover: 'neutral.state-hover',
              pressed: 'neutral.state-pressed',
            }[i],
      stroke: s === 'selected' ? 'hue.fill' : 'transparent',
      icon: ink,
      text: ink,
      'text-subtle': 'neutral.ink-subtle',
      track: s === 'selected' ? 'hue.fill' : 'neutral.line-subtle',
    }[part];
  };

  /**
   * style `outline-hue` — an outline that carries its hue at rest: hue stroke
   * and hue text on paper (everyday destructive actions: „Löschen" in a row,
   * „Kündigen" as bulk action). Selection values behave like `outline`.
   */
  const outlineHue: Style = (part, c) => {
    if (c.sel !== 'none' || c.avail !== 'enabled') return outline(part, c);
    const i = c.inter === 'focus' ? 'idle' : c.inter;
    return {
      background: {
        idle: 'pole.paper',
        hover: 'hue.canvas',
        pressed: 'hue.subtle',
      }[i],
      stroke: {
        idle: 'hue.line-strong',
        hover: 'hue.fill',
        pressed: 'hue.fill-hover',
      }[i],
      icon: i === 'idle' ? 'hue.ink-subtle' : 'hue.ink',
      text: i === 'idle' ? 'hue.ink-subtle' : 'hue.ink',
      'text-subtle': 'neutral.ink-subtle',
      track: 'neutral.line-subtle',
    }[part];
  };

  /**
   * style `ghost-on-fill` — controls that sit ON a filled surface: transient
   * surfaces (toast, tooltip → `on-inverted`), or any fill a DS adds (a promo
   * banner); chrome (top bar, sidebar) stays neutral and uses plain
   * `tertiary`. Not an axis: the surface is the hierarchy's hue, the
   * control takes that surface's on-fill colour; state layers are made of the
   * on-fill colour instead of ink. Selected = layer + indicator in on-fill.
   */
  const ghostOnFill: Style = (part, c) => {
    const s = c.sel === 'done' ? 'selected' : c.sel;
    if (c.avail === 'disabled') {
      return {
        background: 'transparent',
        stroke: 'transparent',
        icon: 'hue.on-fill-disabled',
        text: 'hue.on-fill-disabled',
        'text-subtle': 'hue.on-fill-disabled',
        track: 'transparent',
      }[part];
    }
    const i = c.avail === 'readonly' || c.inter === 'focus' ? 'idle' : c.inter;
    return {
      background:
        i === 'idle'
          ? s === 'selected'
            ? 'hue.on-fill-selected'
            : 'transparent'
          : i === 'hover'
            ? 'hue.on-fill-hover'
            : 'hue.on-fill-pressed',
      stroke: s === 'selected' ? 'hue.on-fill' : 'transparent',
      icon: 'hue.on-fill',
      text: 'hue.on-fill',
      'text-subtle': 'hue.on-fill',
      track: s === 'selected' ? 'hue.on-fill' : 'transparent',
    }[part];
  };

  /** the style library; the recipe picks one per hierarchy by name */
  const STYLES: Record<string, Style> = {
    solid,
    outline,
    ghost,
    'outline-hue': outlineHue,
    'ghost-on-fill': ghostOnFill,
  };
  /** recipe `hierarchies`: (semantic hue or `inverted`, style name) per level */
  const HIERARCHY_NAMES = [
    'brand',
    'primary',
    'secondary',
    'tertiary',
    'destructive',
    'destructive-subtle',
    'on-inverted',
  ] as const;
  requireKeys('hierarchies', recipe.hierarchies, HIERARCHY_NAMES);
  for (const [h, d] of Object.entries(recipe.hierarchies ?? {})) {
    if (!(d.style in STYLES))
      recipeErrors.push(
        `hierarchies.${h}: Stil ${d.style} fehlt (${Object.keys(STYLES).join(' · ')})`,
      );
    if (!(d.hue in HUES) && d.hue !== 'inverted')
      recipeErrors.push(
        `hierarchies.${h}: Farbton ${d.hue} fehlt in semanticHues`,
      );
  }
  assertRecipe();
  const HIERARCHIES: Record<string, { hue: string; style: Style }> =
    Object.fromEntries(
      HIERARCHY_NAMES.map((h) => {
        const d = recipe.hierarchies![h];
        return [h, { hue: d.hue, style: STYLES[d.style] }];
      }),
    );
  const key = (c: Cell) =>
    [
      c.avail !== 'enabled' ? c.avail : '',
      c.sel !== 'none' ? c.sel : '',
      c.tone !== 'none' ? c.tone : '',
      c.inter,
    ]
      .filter(Boolean)
      .join('-');
  const cssRef = (ref: string, hue: string) => {
    if (ref === 'transparent') return 'transparent';
    const r = ref.startsWith('hue.') ? `${hue}.${ref.slice(4)}` : ref;
    return `var(--${P}${r.replace('.', '-')})`;
  };

  const ctl: string[] = [];
  const cells: Cell[] = [];
  for (const avail of Object.keys(AVAIL) as Avail[])
    for (const sel of SEL)
      for (const tone of TONES)
        for (const inter of AVAIL[avail])
          cells.push({ avail, sel, tone, inter });
  for (const [h, def] of Object.entries(HIERARCHIES))
    for (const part of PARTS)
      for (const c of cells)
        ctl.push(
          decl(
            `ctl.${h}.${part}.${key(c)}`,
            cssRef(
              applyTone(
                part,
                def.style(part, c),
                c,
                def.style('background', c),
              ),
              def.hue,
            ),
          ),
        );

  // ---------- Status + feedback + focus ----------
  /**
   * Two roles on the same steps, named by purpose:
   * `status` describes the state of a thing (chip, badge, status tile), closed
   * set of intents, emphasis strong (filled) | subtle (pill on `subtle`).
   * A dot-only status is the subtle chip that doesn't read `surface`.
   * `feedback` evaluates or reports (alert, message at a field), no neutral.
   */
  const STATUS_INTENTS = ['neutral', 'info', 'positive', 'warning', 'negative'];
  const FEEDBACK_INTENTS = ['info', 'positive', 'warning', 'negative'];
  // steps per part: recipe `status` / `feedback` (standard in defaults.json)
  const STATUS_PARTS = ['surface', 'content', 'indicator'];
  const FEEDBACK_PARTS = ['surface', 'line', 'content', 'icon'];
  const EMPHASES = ['strong', 'subtle'] as const;
  for (const e of EMPHASES)
    requireKeys(`status.${e}`, recipe.status?.[e], STATUS_PARTS);
  requireKeys('feedback', recipe.feedback, FEEDBACK_PARTS);
  const stepExists = (intents: string[], step: string) =>
    intents.every((i) => `${i}.${step}` in values['light']);
  for (const e of EMPHASES)
    for (const [part, step] of Object.entries(recipe.status?.[e] ?? {}))
      if (!stepExists(STATUS_INTENTS, step))
        recipeErrors.push(
          `status.${e}.${part}: Stufe ${step} fehlt in der Auswahl`,
        );
  for (const [part, step] of Object.entries(recipe.feedback ?? {}))
    if (!stepExists(FEEDBACK_INTENTS, step))
      recipeErrors.push(`feedback.${part}: Stufe ${step} fehlt in der Auswahl`);
  // focus ring: any Auswahl entry (recipe `focus.ring`); the contract checks it on every surface
  requireKeys('focus', recipe.focus, ['ring', 'width', 'offset']);
  const FOCUS_RING = recipe.focus?.ring ?? '';
  if (!(FOCUS_RING in values['light']))
    recipeErrors.push(`focus.ring: ${FOCUS_RING} fehlt in der Auswahl`);
  assertRecipe();
  const STATUS = recipe.status!;
  const FEEDBACK = recipe.feedback!;
  const extra = [
    ...STATUS_INTENTS.flatMap((i) =>
      EMPHASES.flatMap((emph) =>
        STATUS_PARTS.map((part) =>
          decl(
            `status.${i}.${part}.${emph}`,
            `var(--${P}${i}-${STATUS[emph][part]})`,
          ),
        ),
      ),
    ),
    ...FEEDBACK_INTENTS.flatMap((i) =>
      FEEDBACK_PARTS.map((part) =>
        decl(`feedback.${i}.${part}`, `var(--${P}${i}-${FEEDBACK[part]})`),
      ),
    ),
    decl('focus.ring', cssRef(FOCUS_RING, '')),
    // on a fill the page ring disappears (black on a dark sidebar): the ring takes the surface's on-fill
    decl('focus.ring-on-inverted', `var(--${P}inverted-on-fill)`),
  ];

  // ---------- Surfaces, lines, elevation ----------
  /**
   * Surface roles. Two-track elevation: Light shows a
   * level by its shadow (page and card differ by ΔE 1.5 only), Dark by a lighter
   * surface (overlay above paper above canvas) — the poles carry that per mode.
   * Sunken is darker than its parent in both modes. Lines: subtle = divider
   * (decoration), base = calm border, strong = meaningful border ≥ 3:1.
   */
  const SURFACE_ROLES: Record<string, string> = {
    'surface.page': 'pole.canvas',
    'surface.raised': 'pole.paper', //   card, panel, top bar
    'surface.overlay': 'pole.overlay', // popover, menu, dialog, drawer
    'surface.sunken': 'pole.sunken', //   well: filter bar, code, table header
    'surface.inverted': 'inverted.fill', // toast, tooltip
    scrim: 'pole.scrim',
    // edge = supports a shadow (popover, dialog, card with shadow) — translucent
    // ink, no contrast duty; subtle = divider/decoration; base = visible border
    // (disabled field); strong = meaningful border ≥ 3:1
    'line.edge': 'neutral.edge',
    'line.subtle': 'neutral.line-subtle',
    'line.base': 'neutral.line',
    'line.strong': 'neutral.line-strong',
  };
  /**
   * Search hit (`<mark>`): a marker
   * colour behind matched text — search results, filtered tables, find in
   * document; `current` = the hit you are at. Not accent: accent means selection
   * here. Light: warning.subtle opaque; Dark: warning.fill-hover translucent —
   * the fixed step had 1.01:1 on the popover. Text on it stays content.primary
   * (contract: ≥ 4.5 on every text surface, visible ≥ 1.3:1).
   */
  const markTokens = [
    decl('mark.surface', `var(--${P}mark-value)`),
    decl('mark.current', `var(--${P}mark-current-value)`),
  ];
  const surfaceTokens = [
    ...Object.entries(SURFACE_ROLES).map(([role, ref]) =>
      decl(role, `var(--${P}${ref.replace('.', '-')})`),
    ),
    ...[
      'raised',
      'overlay',
      'modal',
      ...STICKY_EDGES.map((e) => `sticky-${e}`),
    ].map((l) => decl(`elevation.${l}`, `var(--${P}elevation-${l}-value)`)),
  ];
  // RTL: start/end are physical in box-shadow — the pair swaps
  const stickyRtlTokens = [
    decl(
      'elevation.sticky-start',
      `var(--${P}elevation-sticky-end-value)`,
      SET.rtl,
    ),
    decl(
      'elevation.sticky-end',
      `var(--${P}elevation-sticky-start-value)`,
      SET.rtl,
    ),
  ];

  // ---------- Space ----------
  /**
   * Spacing as roles.
   * Foundation = the grid from the recipe, named by value (`size.16`), never read
   * by components. Roles name a relationship, not a family: how closely two
   * things belong together (gap) or how far content sits from its edge (inset).
   * One role set serves applications and content pages (portal, blog): a page
   * reads the roles it needs — an app separates cards with `section`, a content
   * page separates its parts with `region`.
   * Everything INSIDE a control (padding, icon gap, part sizes) belongs to the
   * control sizes, not here.
   * Strokes: every border reads a role, so `calc(padding - border.width.default)`
   * stays right when a DS chooses 2px borders. Optical nudges (icons) are not
   * tokens — they live inside the icon component.
   * Values: recipe `spaceRoles`, `border`, `focus` (meanings in ramp.ts).
   */
  const GAP_ROLES = ['tight', 'related', 'group', 'section', 'region'];
  const INSET_ROLES = ['container', 'container-compact', 'list', 'page'];
  requireKeys('spaceRoles.gap', recipe.spaceRoles?.gap, GAP_ROLES);
  requireKeys('spaceRoles.inset', recipe.spaceRoles?.inset, INSET_ROLES);
  requireKeys('border.width', recipe.border?.width, ['default', 'strong']);
  assertRecipe();
  const SPACE_ROLES: Record<string, number> = {
    ...Object.fromEntries(
      GAP_ROLES.map((r) => [`gap.${r}`, recipe.spaceRoles!.gap[r]]),
    ),
    ...Object.fromEntries(
      INSET_ROLES.map((r) => [`inset.${r}`, recipe.spaceRoles!.inset[r]]),
    ),
    'border.width.default': recipe.border!.width['default'],
    'border.width.strong': recipe.border!.width['strong'],
    'focus.width': recipe.focus!.width,
    'focus.offset': recipe.focus!.offset,
  };
  const space = recipe.space;
  const sizeTokens = space.scale.map((n) => decl(`size.${n}`, `${n}px`));
  const spaceTokens = Object.entries(SPACE_ROLES).map(([role, px]) => {
    const name =
      role.startsWith('gap.') || role.startsWith('inset.')
        ? `space.${role}`
        : role;
    return decl(name, `var(--${P}size-${px})`);
  });
  /**
   * Widths as roles.
   * Universal set, checked against app pages, content pages/blogs, forms,
   * overlays and navigation. 480 is the narrow column: form, small dialog and
   * drawer share it, so the same content fits all three. Navigation: 240 gives long German entries room
   * (Polaris/Atlassian 240, Carbon 256); collapsed = row 40 + 12 each side.
   * Values: recipe `width` (meanings in ramp.ts).
   */
  const WIDTH_NAMES = [
    'main',
    'column.sm',
    'column.md',
    'column.lg',
    'reading',
    'form',
    'dialog.small',
    'dialog.base',
    'dialog.large',
    'drawer',
    'popover.min',
    'popover.max',
    'tooltip',
    'navigation.expanded',
    'navigation.collapsed',
  ];
  /** `{ dialog: { small } }` → `dialog.small` */
  const flatten = (o: object, at = ''): [string, unknown][] =>
    Object.entries(o).flatMap(([k, v]) =>
      v !== null && typeof v === 'object'
        ? flatten(v, `${at}${k}.`)
        : [[`${at}${k}`, v] as [string, unknown]],
    );
  const widthIn = Object.fromEntries(flatten(recipe.width ?? {}));
  requireKeys('width', widthIn, WIDTH_NAMES);
  assertRecipe();
  /** `{column.lg}` → `column.lg` (a width role that is another width role) */
  const widthRef = (v: unknown) => /^\{([a-z.]+)\}$/.exec(String(v))?.[1];
  for (const n of WIDTH_NAMES) {
    const r = widthRef(widthIn[n]);
    if (r && (!WIDTH_NAMES.includes(r) || widthRef(widthIn[r])))
      throw new RecipeError([
        `width.${n}: Verweis {${r}} unbekannt oder selbst ein Verweis`,
      ]);
  }
  /** resolved length of a width role (px, or ch for reading) */
  const widthValue = (n: string): string => {
    const r = widthRef(widthIn[n]);
    return String(r ? widthIn[r] : widthIn[n]);
  };
  const WIDTH_ROLES: Record<string, string> = Object.fromEntries(
    WIDTH_NAMES.map((n) => [`width.${n}`, widthValue(n)]),
  );
  const widthTokens = WIDTH_NAMES.map((n) => {
    const r = widthRef(widthIn[n]);
    const v = r
      ? `var(--${P}width-${r.replaceAll('.', '-')})`
      : String(widthIn[n]);
    return decl(`width.${n}`, v);
  });
  const bpTokens = Object.entries(recipe.breakpoints).map(([k, v]) =>
    decl(
      `breakpoint.${k}`,
      `${v}px`,
      SET.base,
      'reference only — media queries use the SCSS map',
    ),
  );

  /**
   * Container constants derived from the column ladder (container queries cannot
   * read variables either → JSON + SCSS map, like the breakpoints):
   * - `aside-fold` section width below which a title column folds above its
   *   content, so the content never gets narrower than column.lg:
   *   column.sm + gap.section + column.lg
   * - `side-fold` width of a page with a side (profile) column below which the
   *   side column stacks: column.md + gap.section + column.lg
   * - `field-pair` below this a field grid goes single-column:
   *   2 × column.sm + gap.group (also expressible without a query)
   */
  const colPx = (k: 'sm' | 'md' | 'lg') =>
    parseFloat(WIDTH_ROLES[`width.column.${k}`]);
  const CONTAINERS: Record<string, number> = {
    'aside-fold': colPx('sm') + SPACE_ROLES['gap.section'] + colPx('lg'),
    'side-fold': colPx('md') + SPACE_ROLES['gap.section'] + colPx('lg'),
    'field-pair': 2 * colPx('sm') + SPACE_ROLES['gap.group'],
  };
  const containerTokens = Object.entries(CONTAINERS).map(([k, v]) =>
    decl(
      `container.${k}`,
      `${v}px`,
      SET.base,
      'reference only — container queries use the SCSS map',
    ),
  );

  /**
   * Corner radius as roles, not a size ladder (xs…xl). The values are design
   * decisions of the recipe; a shape (square · mixed · round) assigns them.
   *   round              always fully round, in every shape: radio, avatar,
   *                      icon button, progress, status dot, step circle
   *   action             button, labelled icon button, filter chip — split from
   *                      `field` so a DS can have round buttons and square
   *                      fields (Material 3); also tells an outline button
   *                      apart from an input without colour
   *   field              single-line input, select, combobox
   *   field-multiline    text area — a pill cannot grow lines, so a round
   *                      field shape still needs a finite value here
   *   item               element inside a container: checkbox, list/menu row,
   *                      table cell — stays square-ish in every shape
   *   tag                removable tag, mostly inside a field (multi-select) —
   *                      follows the field shape (concentric); a standalone
   *                      filter chip is an action and reads `action`
   *   badge              status chip, count, label badge — standalone, its own
   *                      value (often round in every shape)
   *   container          card, popover, sidebar, status bar, empty state
   *   container-large    dialog, command palette, task modal
   */
  const RADIUS_ROUND = '9999px';
  const radius = recipe.radius!;
  const radiusPx = (v: number | 'round') =>
    v === 'round' ? RADIUS_ROUND : `var(--${P}size-${v})`;
  const radiusDecls = (
    shape: Record<string, number | 'round'>,
    set = SET.base,
  ) =>
    Object.entries(shape).map(([role, v]) =>
      decl(`radius.${role}`, radiusPx(v), set),
    );
  const radiusTokens = [
    decl('radius.round', RADIUS_ROUND),
    ...radiusDecls(radius.shapes[radius.default]),
  ];

  /**
   * Typography. Roles say what the text is; line height belongs to the role
   * and comes from one rule: size × class factor, rounded to 2 px, an exact
   * tie goes to the 4px grid. label reads the ui class (1.4): controls have a MIN height with block padding = (height −
   * line height) / 2, so one line keeps its height and wrapped lines don't
   * touch — line height doesn't move the vertical centring (measured).
   * Scaling (fluid/steps/fixed) is a recipe strategy; names never change.
   */
  const type = recipe.type!;
  const lineHeight = (size: number, cls: string) => {
    const x = Math.round(size * type.classes[cls] * 1000) / 1000;
    const lo = Math.floor(x / 2) * 2;
    if (x - lo === 1) return lo % 4 === 0 ? lo : lo + 2;
    return Math.round(x / 2) * 2;
  };
  interface TypeStep {
    role: string;
    step: string;
    size: number;
    min?: number;
    cls: string;
  }
  const typeSteps: TypeStep[] = Object.entries(type.roles).flatMap(
    ([role, def]) =>
      Object.entries(def.steps).map(([step, v]) =>
        typeof v === 'number'
          ? { role, step, size: v, cls: def.cls }
          : { role, step, size: v.size, min: v.min, cls: v.cls ?? def.cls },
      ),
  );
  const bpFrom = recipe.breakpoints[type.scaling.from];
  const bpTo = recipe.breakpoints[type.scaling.to];
  /** fluid value between two px values across [from, to] */
  const fluid = (min: number, max: number) => {
    const slope = (max - min) / (bpTo - bpFrom);
    const icpt = min - slope * bpFrom;
    return `clamp(${min}px, calc(${+icpt.toFixed(3)}px + ${+(slope * 100).toFixed(4)}vw), ${max}px)`;
  };
  const typeName = (t: TypeStep) =>
    `type-${t.role.replace('.', '-')}-${t.step}`;
  /**
   * Icons next to text: every text step names
   * the icon that sits beside it, from one pairing table in the recipe — the
   * same one the controls use (12/14 → 16, 16 → 20, 18 → 24). Display sizes
   * have no icon. Fluid steps scale the icon along with the text.
   */
  const iconFor = (px: number): number | undefined =>
    recipe.icon!.text[String(px)];
  /**
   * Emphasis is semantic — normal, quieter, louder OF THE ROLE; the weight is
   * an assignment (label.default is bold, body.default regular). Naming roles
   * get `subtle`, reading roles get `strong` (inline emphasis).
   */
  const emphasisWeight = (base: number, e: 'subtle' | 'strong') =>
    e === 'subtle'
      ? type.emphasis.subtle
      : Math.min(base + type.emphasis.strongStep, type.emphasis.max);
  /** letter spacing in em for a size + weight (+ uppercase), from the recipe rule */
  const tracking = (size: number, weight: number, upper: boolean) => {
    const { anchors, weightBonus: wb, uppercase } = type.tracking;
    let e: number;
    if (size <= anchors[0][0]) e = anchors[0][1];
    else if (size >= anchors[anchors.length - 1][0])
      e = anchors[anchors.length - 1][1];
    else {
      const i = anchors.findIndex(([p]) => p >= size);
      const [p0, e0] = anchors[i - 1];
      const [p1, e1] = anchors[i];
      e = e0 + ((size - p0) / (p1 - p0)) * (e1 - e0);
    }
    if (weight >= wb.from)
      e +=
        wb.amount *
        Math.max(0, Math.min(1, (wb.until - size) / (wb.until - wb.at)));
    if (upper) e += uppercase;
    return Math.round(e * 1000) / 1000;
  };
  /**
   * declarations for one step; `at` = which end for non-fluid strategies;
   * `partsOnly` = just size, line height and icon (the breakpoint overlay)
   */
  const typeDecls = (
    t: TypeStep,
    at: 'min' | 'max' | 'fluid',
    set = SET.base,
    partsOnly = false,
  ) => {
    const def = type.roles[t.role];
    const n = typeName(t);
    const lh = lineHeight(t.size, t.cls);
    const size =
      t.min === undefined || at === 'max'
        ? `${t.size}px`
        : at === 'min'
          ? `${t.min}px`
          : fluid(t.min, t.size);
    const lhv =
      t.min === undefined || at === 'max'
        ? `${lh}px`
        : at === 'min'
          ? `${lineHeight(t.min, t.cls)}px`
          : fluid(lineHeight(t.min, t.cls), lh);
    const fam = `var(--${P}font-${def.family ?? 'text'})`;
    const ic = iconFor(t.size);
    const icMin = t.min === undefined ? ic : iconFor(t.min);
    const icv =
      ic === undefined || icMin === undefined
        ? undefined
        : t.min === undefined || at === 'max' || ic === icMin
          ? `var(--${P}size-${at === 'min' ? icMin : ic})`
          : at === 'min'
            ? `var(--${P}size-${icMin})`
            : fluid(icMin, ic);
    // dot-path: the role may itself be dotted (`table.header`) — same CSS name
    const p = `type.${t.role}.${t.step}`;
    const parts = [
      decl(`${p}-size`, size, set),
      decl(`${p}-line-height`, lhv, set),
      ...(icv ? [decl(`${p}-icon`, icv, set)] : []),
    ];
    if (partsOnly) return parts;
    return [
      ...parts,
      decl(`${p}-weight`, def.weight, set),
      decl(`${p}-family`, fam, set),
      decl(
        p,
        `${def.weight} var(--${P}${n}-size)/var(--${P}${n}-line-height) ${fam}`,
        set,
      ),
      // tracking at the large end; a fluid step differs by < 0.002em at its small end
      decl(
        `${p}-tracking`,
        `${tracking(t.size, def.weight, def.case === 'uppercase')}em`,
        set,
      ),
      ...(def.case ? [decl(`${p}-case`, def.case, set)] : []),
      ...(def.numeric ? [decl(`${p}-numeric`, 'tabular-nums', set)] : []),
      ...(def.emphasis ?? []).flatMap((e) => {
        const w = emphasisWeight(def.weight, e);
        return [
          decl(`${p}-${e}-weight`, w, set),
          decl(
            `${p}-${e}-tracking`,
            `${tracking(t.size, w, def.case === 'uppercase')}em`,
            set,
          ),
          decl(
            `${p}-${e}`,
            `${w} var(--${P}${n}-size)/var(--${P}${n}-line-height) ${fam}`,
            set,
          ),
        ];
      }),
    ];
  };
  const strategy = type.scaling.strategy;
  const typeTokens = [
    ...Object.entries(type.families).map(([k, v]) => decl(`font.${k}`, v)),
    ...typeSteps.flatMap((t) =>
      typeDecls(
        t,
        strategy === 'fluid' ? 'fluid' : strategy === 'steps' ? 'min' : 'max',
      ),
    ),
  ];
  // prose rhythm (em of the element it sits on) and inline features (em of
  // the surrounding text). sup gets line-height 0 in use so it never opens
  // the line.
  typeTokens.push(
    ...Object.entries(type.prose).map(
      // rounded to the 2px grid at the use site — same rule as Figma below
      ([k, v]) => decl(`prose.${k}`, `round(nearest, ${v}em, 2px)`),
    ),
    ...Object.entries(type.inline).map(([k, v]) =>
      decl(`type.inline.${k}-size`, `${v}em`),
    ),
  );
  // strategy `steps`: the large values switch on at the `to` breakpoint
  const typeStepOverrides =
    strategy === 'steps'
      ? typeSteps
          .filter((t) => t.min !== undefined)
          .flatMap((t) => typeDecls(t, 'max', SET.xl, true))
      : [];

  // type contract
  const typeFails: string[] = [];
  for (const t of typeSteps) {
    const n = `${t.role}.${t.step}`;
    for (const v of [t.size, t.min].filter((x) => x !== undefined) as number[])
      if (!type.scale.includes(v))
        typeFails.push(`${n}: ${v} fehlt in der Skala`);
    if (t.min !== undefined && t.min >= t.size)
      typeFails.push(`${n}: min ${t.min} ≥ ${t.size}`);
    if (Math.min(t.size, t.min ?? t.size) < C.typeMinPx!)
      typeFails.push(`${n}: kleiner als ${C.typeMinPx} px`);
    if (!(t.cls in type.classes)) typeFails.push(`${n}: Klasse ${t.cls} fehlt`);
  }
  if (type.classes['read'] < 1.5)
    typeFails.push(`read: Faktor ${type.classes['read']} < 1,5 (WCAG 1.4.8)`);
  // step order: numbered steps shrink (1 is largest), sm < md < lg grows
  const ORDER = ['xs', 'sm', 'md', 'lg', 'xl'];
  for (const role of Object.keys(type.roles)) {
    const st = typeSteps.filter((t) => t.role === role);
    const numbered = st.every((t) => /^\d+$/.test(t.step));
    const sorted = numbered
      ? [...st].sort((a, b) => +b.step - +a.step)
      : [...st].sort((a, b) => ORDER.indexOf(a.step) - ORDER.indexOf(b.step));
    if (sorted.some((t, i) => i > 0 && t.size <= sorted[i - 1].size))
      typeFails.push(
        `${role}: Stufen nicht streng steigend (${sorted.map((t) => t.step + ' ' + t.size).join(' · ')})`,
      );
  }
  for (const [role, def] of Object.entries(type.roles))
    for (const e of def.emphasis ?? []) {
      const w = emphasisWeight(def.weight, e);
      if (e === 'subtle' && !(w < def.weight))
        typeFails.push(
          `${role}.subtle: ${w} nicht leiser als default ${def.weight}`,
        );
      if (e === 'strong' && !(w > def.weight))
        typeFails.push(
          `${role}.strong: ${w} nicht lauter als default ${def.weight}`,
        );
    }
  if (!(type.prose['heading-before'] > type.prose['heading-after']))
    typeFails.push(
      'prose: Abstand vor Überschrift muss größer sein als danach',
    );
  {
    const an = type.tracking.anchors;
    if (
      an.some(([p, e], i) => i > 0 && (p <= an[i - 1][0] || e > an[i - 1][1]))
    )
      typeFails.push(
        'tracking: Stützpunkte müssen nach Größe steigen und die Sperrung fallen',
      );
  }
  if (!(bpFrom < bpTo))
    typeFails.push(
      `scaling: ${type.scaling.from} muss < ${type.scaling.to} sein`,
    );

  // grid contract
  const spaceFails: string[] = [];
  const onGrid = (n: number) =>
    n < space.base
      ? Number.isInteger(n)
      : n < 2 * space.base
        ? n % (space.base / 2) === 0
        : n % space.base === 0;
  for (const n of space.scale)
    if (!onGrid(n))
      spaceFails.push(`size.${n} liegt nicht im ${space.base}er-Raster`);
  for (const [role, px] of Object.entries(SPACE_ROLES))
    if (!space.scale.includes(px))
      spaceFails.push(`${role} = ${px} fehlt in der Skala`);
  const readingCh = parseFloat(WIDTH_ROLES['width.reading']);
  if (readingCh < READING_MIN || readingCh > READING_MAX)
    spaceFails.push(
      `width.reading ${readingCh}ch außerhalb ${READING_MIN}–${READING_MAX} (WCAG 1.4.8: ≤ 80 Zeichen)`,
    );
  // width contract: the ladder rises, the working area holds a section with a
  // title column
  const widthFails: string[] = [];
  const columnLadder = (['sm', 'md', 'lg'] as const).map(colPx);
  if (columnLadder.some((v, i) => i > 0 && v <= columnLadder[i - 1]))
    widthFails.push(
      `Spalten-Leiter nicht streng steigend: ${columnLadder.join(' · ')}`,
    );
  if (parseFloat(WIDTH_ROLES['width.main']) < CONTAINERS['aside-fold'])
    widthFails.push(
      `width.main ${WIDTH_ROLES['width.main']} < aside-fold ${CONTAINERS['aside-fold']}px (Titelspalte + Inhalt passen nicht)`,
    );
  // (no check that a field pair fits column.lg: in form, dialog and drawer
  // fields stand single-column on purpose — field-pair 496 > 480 is wanted)
  const bps = Object.values(recipe.breakpoints);
  if (bps.some((b, i) => i > 0 && b <= bps[i - 1]))
    spaceFails.push(`Breakpoints nicht streng steigend: ${bps.join(' · ')}`);
  if (SPACE_ROLES['focus.width'] < 2)
    spaceFails.push('focus.width < 2 px (WCAG 2.4.13)');
  const gaps = ['tight', 'related', 'group', 'section', 'region'].map(
    (g) => SPACE_ROLES[`gap.${g}`],
  );
  if (gaps.some((g, i) => i > 0 && g <= gaps[i - 1]))
    spaceFails.push(`gap-Leiter nicht streng steigend: ${gaps.join(' · ')}`);

  // radius contract: every shape names every role; values on the scale; nested
  // corners concentric — where the padding is smaller than the outer radius,
  // inner ≤ outer − padding, otherwise inner ≤ outer
  const radiusFails: string[] = [];
  const ROLES = Object.keys(radius.shapes[radius.default]);
  // tag in field: the smallest size sits in every larger field with equal air
  // all round, (field − tag) / 2 — the role check takes the tightest of them
  const heights = Object.values(recipe.control!.sizes).map((z) => z.height);
  const tagAir = Math.min(...heights.slice(1).map((h) => (h - heights[0]) / 2));
  const NESTING: [
    outer: string,
    inner: string,
    padding: number,
    where: string,
  ][] = [
    ['container', 'item', SPACE_ROLES['inset.list'], 'Menüzeile im Popover'],
    ['field', 'tag', tagAir, 'Tag im Feld (Multi-Select)'],
    [
      'container-large',
      'container',
      SPACE_ROLES['inset.container'],
      'Karte im Dialog',
    ],
    [
      'container',
      'item',
      SPACE_ROLES['inset.container-compact'],
      'Checkbox in Karte',
    ],
  ];
  const px = (v: number | 'round') => (v === 'round' ? Infinity : v);
  for (const [name, shape] of Object.entries(radius.shapes)) {
    for (const role of ROLES)
      if (!(role in shape)) radiusFails.push(`${name}: radius.${role} fehlt`);
    for (const [role, v] of Object.entries(shape))
      if (v !== 'round' && !space.scale.includes(v))
        radiusFails.push(`${name}: radius.${role} = ${v} fehlt in der Skala`);
    if (shape['field-multiline'] === 'round')
      radiusFails.push(`${name}: field-multiline kann nicht rund sein`);
    for (const [outer, inner, pad, where] of NESTING) {
      const o = px(shape[outer]),
        i = px(shape[inner]);
      // a round outer needs a round inner (concentric); otherwise subtract the padding
      if (o === Infinity && i !== Infinity) {
        radiusFails.push(
          `${name}: ${where} — ${inner} ${i} in rundem ${outer} (nicht konzentrisch)`,
        );
        continue;
      }
      const max = pad < o ? o - pad : o;
      if (i > max)
        radiusFails.push(
          `${name}: ${where} — ${inner} ${i} > ${max} (${outer} ${o} − Abstand ${pad})`,
        );
    }
  }

  // ---------- Control sizes ----------
  /**
   * Control sizes. Two tiers: per size (height, icon, icon alone,
   * text, gap) and per family (inline padding):
   *   action  button, labelled icon button      label · action ladder · radius action
   *   tag     tag, chip                         label · action ladder · radius tag
   *   field   input, select, combobox           value · content ladder · radius field
   *   row     menu/list row, checkbox/radio row option · content ladder · radius item
   * Every height is a MIN height (WCAG 1.4.4 / 1.4.12): block padding =
   * (height − line height) / 2 as calc, so it follows the coarse height and
   * single-line controls keep their exact height. Inline padding is measured
   * from the OUTER edge — a bordered control subtracts its border
   * (`calc(… − var(--x-border-width-default))`), a rule, not a token. A round
   * radius adds the pill surcharge via `--x-control-{family}-pill` (set per
   * shape), so the shape and the coarse pointer never fight over a value.
   * Not tokens (component work): glyph-flush alignment of embedded icon
   * buttons, which sizes a component offers, part sizes (checkbox box = icon,
   * avatar = height).
   */
  const control = recipe.control!;
  const SIZES = Object.keys(control.sizes);
  const CR = control.rules;
  const typeStepOf = (role: string, step: string) =>
    typeSteps.find((t) => t.role === role && t.step === step);
  const lhOf = (role: string, step: string) => {
    const t = typeStepOf(role, step);
    return t ? lineHeight(t.size, t.cls) : NaN;
  };
  const FAMILIES: Record<
    string,
    {
      role: string;
      step: 'label' | 'read';
      ladder: 'action' | 'content';
      radius: string;
    }
  > = {
    action: {
      role: 'label',
      step: 'label',
      ladder: 'action',
      radius: 'action',
    },
    tag: { role: 'label', step: 'label', ladder: 'action', radius: 'tag' },
    field: { role: 'value', step: 'read', ladder: 'content', radius: 'field' },
    row: { role: 'option', step: 'read', ladder: 'content', radius: 'item' },
  };
  const inlinePad = (s: string, ladder: 'action' | 'content') =>
    ladder === 'action'
      ? control.sizes[s].height / 2 - CR.actionInset
      : control.sizes[s].content;
  /** icon alone: the next icon step, but at least `aloneRand` around it */
  const iconAlone = (s: string) => {
    const z = control.sizes[s];
    const next = control.icons.find((i) => i > z.icon) ?? z.icon;
    return Math.max(z.icon, Math.min(next, z.height - 2 * CR.aloneRand));
  };
  /** coarse pointer: `stepUp` sizes higher; past the top the last step repeats */
  const coarseHeight = (s: string) => {
    const i = SIZES.indexOf(s) + control.coarse.stepUp;
    if (i < SIZES.length) return control.sizes[SIZES[i]].height;
    const last = control.sizes[SIZES[SIZES.length - 1]].height;
    const prev = control.sizes[SIZES[SIZES.length - 2]].height;
    return last + (last - prev) * (i - SIZES.length + 1);
  };
  const sz = (n: number) => `var(--${P}size-${n})`;
  const ctlName = (s: string, k: string) => `--${P}control-${s}-${k}`;
  /** dot-path of a control-size token: family keys nest (`action-text` → action.text) */
  const ctlPath = (s: string, k: string) => {
    const f = Object.keys(FAMILIES).find((f) => k.startsWith(`${f}-`));
    return f
      ? `control.${s}.${f}.${k.slice(f.length + 1)}`
      : `control.${s}.${k}`;
  };
  /** pill surcharge per shape: families whose radius role is round in that shape */
  const pillDecls = (shape: Record<string, number | 'round'>, set = SET.base) =>
    Object.entries(FAMILIES).map(([f, def]) =>
      decl(
        `control.${f}.pill`,
        shape[def.radius] === 'round' ? sz(CR.pill) : '0px',
        set,
      ),
    );
  /**
   * corner per control size (grows with the size):
   * at most `sizeRatio` × height, rounded down onto the Foundation scale,
   * capped by the role (= the large-size value); round stays round. A 24 px
   * field with the 8 px of a 40 px field reads almost like a pill.
   */
  const sizeRadius = (v: number | 'round', h: number): number | 'round' => {
    if (v === 'round' || !radius.sizeRatio) return v;
    const cap = Math.min(v, radius.sizeRatio * h);
    return Math.max(...space.scale.filter((n) => n <= cap));
  };
  /**
   * tag inside a field of size s (multi-select; the tag is always the smallest
   * size): concentric with the field — inner ≤ outer − air, onto the scale,
   * capped by the tag role; round in a round field. The field decides the
   * shape of what sits in it.
   */
  const tagInField = (shape: Record<string, number | 'round'>, s: string) => {
    const o = sizeRadius(shape['field'], control.sizes[s].height);
    const t = shape['tag'];
    if (o === 'round' || t === 'round') return t;
    const air = (control.sizes[s].height - control.sizes[SIZES[0]].height) / 2;
    const cap = Math.min(t, air < o ? o - air : o);
    return Math.max(...space.scale.filter((n) => n <= cap));
  };
  const sizeRadiusDecls = (
    shape: Record<string, number | 'round'>,
    set = SET.base,
  ) => [
    ...SIZES.flatMap((s) =>
      Object.entries(FAMILIES).map(([f, def]) =>
        decl(
          ctlPath(s, `${f}-radius`),
          radiusPx(sizeRadius(shape[def.radius], control.sizes[s].height)),
          set,
        ),
      ),
    ),
    ...SIZES.slice(1).map((s) =>
      decl(ctlPath(s, 'field-tag-radius'), radiusPx(tagInField(shape, s)), set),
    ),
  ];
  const controlTokens: string[] = [
    decl('target.min', sz(control.target.fine)),
    decl('focus.offset-inset', `calc(-1 * var(--${P}focus-width))`),
    ...pillDecls(radius.shapes[radius.default]),
    ...sizeRadiusDecls(radius.shapes[radius.default]),
  ];
  for (const s of SIZES) {
    const z = control.sizes[s];
    controlTokens.push(
      decl(ctlPath(s, 'height'), sz(z.height)),
      decl(ctlPath(s, 'icon'), sz(z.icon)),
      decl(ctlPath(s, 'icon-alone'), sz(iconAlone(s))),
      decl(ctlPath(s, 'gap'), sz(z.gap)),
      // controls without a surface (tertiary, link): icon and text one step closer
      decl(ctlPath(s, 'gap-plain'), sz(z.gap - CR.plainGap)),
      decl(ctlPath(s, 'row-height'), `var(${ctlName(s, 'height')})`),
    );
    for (const [f, def] of Object.entries(FAMILIES)) {
      const step = z[def.step];
      const t = `--${P}type-${def.role}-${step}`;
      const pad = inlinePad(s, def.ladder);
      const h = f === 'row' ? ctlName(s, 'row-height') : ctlName(s, 'height');
      controlTokens.push(
        decl(ctlPath(s, `${f}-text`), `var(${t})`),
        decl(ctlPath(s, `${f}-tracking`), `var(${t}-tracking)`),
        decl(
          ctlPath(s, `${f}-inline`),
          `calc(${sz(pad)} + var(--${P}control-${f}-pill))`,
        ),
        decl(
          ctlPath(s, `${f}-inline-icon`),
          `calc(${sz(pad - CR.iconSide)} + var(--${P}control-${f}-pill))`,
        ),
        decl(
          ctlPath(s, `${f}-block`),
          `calc((var(${h}) - var(${t}-line-height)) / 2)`,
        ),
      );
    }
  }
  // badges: below xs, not interactive (no target); action ladder, always round
  for (const [b, def] of Object.entries(control.badge)) {
    const t = `--${P}type-caption-${def.text}`;
    const round = radius.shapes[radius.default]['badge'] === 'round';
    const pad = def.height / 2 - CR.actionInset + (round ? CR.pill : 0);
    controlTokens.push(
      decl(`badge.${b}.height`, sz(def.height)),
      decl(`badge.${b}.text`, `var(${t})`),
      decl(`badge.${b}.tracking`, `var(${t}-tracking)`),
      decl(`badge.${b}.inline`, `${pad}px`),
      decl(
        `badge.${b}.block`,
        `calc((var(--${P}badge-${b}-height) - var(${t}-line-height)) / 2)`,
      ),
      // counter: min-width = height, so one digit stays round
      decl(`badge.${b}.inline-counter`, `${def.height / 4}px`),
    );
  }
  if (control.badgeDot)
    controlTokens.push(decl('badge.dot', sz(control.badgeDot)));
  // coarse pointer (`@media (pointer: coarse)`, not a breakpoint): heights one
  // step up, replaced sizes become another size entirely, rows ≥ target.coarse
  const coarseRowHeight = (s: string) =>
    Math.max(coarseHeight(s), control.target.coarse);
  const coarseTokens: string[] = [
    decl('target.min', sz(control.target.coarse), SET.coarse),
  ];
  for (const s of SIZES) {
    const into = control.coarse.replace[s];
    if (into) {
      const keys = [
        'height',
        'icon',
        'icon-alone',
        'gap',
        'gap-plain',
        'row-height',
        ...Object.keys(FAMILIES).flatMap((f) =>
          ['text', 'tracking', 'inline', 'inline-icon', 'block', 'radius'].map(
            (k) => `${f}-${k}`,
          ),
        ),
      ];
      coarseTokens.push(
        ...keys.map((k) =>
          decl(ctlPath(s, k), `var(${ctlName(into, k)})`, SET.coarse),
        ),
      );
    } else
      coarseTokens.push(
        decl(ctlPath(s, 'height'), sz(coarseHeight(s)), SET.coarse),
        decl(ctlPath(s, 'row-height'), sz(coarseRowHeight(s)), SET.coarse),
      );
  }

  // control contract
  const controlFails: string[] = [];
  {
    const hs = SIZES.map((s) => control.sizes[s].height);
    if (hs.some((h, i) => i > 0 && h <= hs[i - 1]))
      controlFails.push(`Höhen nicht streng steigend: ${hs.join(' · ')}`);
    const ic = control.icons;
    if (ic.some((v, i) => i > 0 && v <= ic[i - 1]))
      controlFails.push(`Icon-Stufen nicht streng steigend: ${ic.join(' · ')}`);
    const used = new Set<number>([control.target.fine, control.target.coarse]);
    for (const s of SIZES) {
      const z = control.sizes[s];
      const al = iconAlone(s);
      used
        .add(z.height)
        .add(coarseHeight(s))
        .add(coarseRowHeight(s))
        .add(z.icon)
        .add(al);
      used.add(z.gap).add(z.gap - CR.plainGap);
      if (z.height < control.target.fine)
        controlFails.push(
          `${s}: Höhe ${z.height} < target.fine ${control.target.fine} (WCAG 2.5.8)`,
        );
      if (!ic.includes(z.icon))
        controlFails.push(`${s}: Icon ${z.icon} keine Icon-Stufe`);
      if (!ic.includes(al))
        controlFails.push(`${s}: Icon allein ${al} keine Icon-Stufe`);
      if ((z.height - al) / 2 < CR.aloneRand)
        controlFails.push(
          `${s}: Icon allein ${al} lässt < ${CR.aloneRand} px Rand`,
        );
      if (z.gap - CR.plainGap <= 0)
        controlFails.push(`${s}: Lücke ohne Fläche ≤ 0`);
      for (const [f, def] of Object.entries(FAMILIES)) {
        const step = z[def.step];
        const lh = lhOf(def.role, step);
        if (Number.isNaN(lh)) {
          controlFails.push(`${s}.${f}: type.${def.role}.${step} fehlt`);
          continue;
        }
        if (z.height < lh)
          controlFails.push(`${s}.${f}: Höhe ${z.height} < Zeilenhöhe ${lh}`);
        const pad = inlinePad(s, def.ladder);
        used.add(pad).add(pad - CR.iconSide);
        if (pad - CR.iconSide < 0)
          controlFails.push(`${s}.${f}: Icon-Seite < 0`);
      }
      if (coarseRowHeight(s) < control.target.coarse)
        controlFails.push(`${s}: Zeile grob < target.coarse`);
    }
    // text never shrinks as the size grows
    for (const [f, def] of Object.entries(FAMILIES)) {
      const px = SIZES.map(
        (s) => typeStepOf(def.role, control.sizes[s][def.step])?.size ?? 0,
      );
      if (px.some((p, i) => i > 0 && p < px[i - 1]))
        controlFails.push(`${f}: Text fällt mit der Größe (${px.join(' · ')})`);
    }
    // a tag of the smallest size inside every field size keeps ≥ 4 px air
    const tagH = control.sizes[SIZES[0]].height;
    for (const s of SIZES.slice(1)) {
      const air = (control.sizes[s].height - tagH) / 2;
      if (air < CR.iconSide)
        controlFails.push(
          `${s}-Feld: ${SIZES[0]}-Tag lässt nur ${air} px Luft`,
        );
    }
    // corners per size: never shrink with the size, and the smallest tag sits
    // concentric in every field size (inner ≤ outer − air, round in round)
    for (const [name, shape] of Object.entries(radius.shapes)) {
      for (const [f, def] of Object.entries(FAMILIES)) {
        const rs = SIZES.map((s) =>
          sizeRadius(shape[def.radius], control.sizes[s].height),
        );
        const n = rs.map((v) => (v === 'round' ? Infinity : v));
        if (n.some((v, i) => i > 0 && v < n[i - 1]))
          controlFails.push(
            `${name}: ${f}-Radius fällt mit der Größe (${rs.join(' · ')})`,
          );
      }
      for (const s of SIZES.slice(1)) {
        const tagR = tagInField(shape, s);
        const o = sizeRadius(shape['field'], control.sizes[s].height);
        const air = (control.sizes[s].height - tagH) / 2;
        if (o === 'round') {
          if (tagR !== 'round')
            controlFails.push(
              `${name}: ${SIZES[0]}-Tag eckig im runden ${s}-Feld`,
            );
          continue;
        }
        const max = air < o ? o - air : o;
        if (tagR === 'round' ? tagH / 2 > max : tagR > max)
          controlFails.push(
            `${name}: ${SIZES[0]}-Tag ${tagR} im ${s}-Feld ${o} nicht konzentrisch (≤ ${max})`,
          );
      }
    }
    for (const [b, def] of Object.entries(control.badge)) {
      used.add(def.height);
      const lh = lhOf('caption', def.text);
      if (Number.isNaN(lh))
        controlFails.push(`badge.${b}: type.caption.${def.text} fehlt`);
      else if (def.height < lh)
        controlFails.push(`badge.${b}: Höhe ${def.height} < Zeilenhöhe ${lh}`);
      // a badge may reach the xs height (status chip), never exceed it
      if (def.height > tagH)
        controlFails.push(`badge.${b}: größer als ${SIZES[0]} (${tagH})`);
      if (control.badgeDot && control.badgeDot >= def.height)
        controlFails.push(
          `badge.dot ${control.badgeDot} nicht kleiner als badge.${b}`,
        );
    }
    for (const n of used)
      if (!space.scale.includes(n))
        controlFails.push(`${n} px fehlt in der Foundation-Skala`);
  }

  // ---------- Layers ----------
  /**
   * z-index for the document only. Popover, dialog,
   * toast, tooltip live in the top layer (opening order, z-index has no
   * effect there) — no tokens for them. Components isolate their internals
   * (`isolation: isolate`), third-party widgets (maps) sit in an isolated box.
   */
  const layer = recipe.layer!;
  const layerTokens = [
    decl('layer.sticky', layer.sticky), // sticky in content: table head, save bar
    decl('layer.chrome', layer.chrome), // app frame when the document scrolls
  ];
  const layerFails: string[] = [];
  if (!(Number.isInteger(layer.sticky) && Number.isInteger(layer.chrome)))
    layerFails.push('Ebenen keine ganzen Zahlen');
  if (!(layer.sticky > 0 && layer.sticky < layer.chrome))
    layerFails.push(
      `layer.sticky ${layer.sticky} nicht zwischen 0 und chrome ${layer.chrome}`,
    );
  // sticky shadows cast away from their edge (main shadow = the last of the list)
  for (const mode of MODES)
    for (const edge of STICKY_EDGES) {
      const v = values[mode][`elevation.sticky-${edge}-value`];
      if (!v) {
        layerFails.push(`${mode}: elevation.sticky fehlt`);
        break;
      }
      const [x, y] = v.split(',').pop()!.trim().split(/\s+/).map(parseFloat);
      const ok = { top: y > 0, bottom: y < 0, start: x > 0, end: x < 0 }[edge];
      if (!ok)
        layerFails.push(
          `${mode}: sticky-${edge} wirft nicht von seiner Kante weg (${v})`,
        );
    }

  // ---------- Motion ----------
  /**
   * Motion.
   * Recipe: the character (productive · expressive) with its curves, an
   * optional spring, one duration per role, travel per overlay size.
   * Foundation: --x-duration-{ms} (+ `instant` = 0.01ms, so transitionend and
   * animationend still fire), --x-easing-{standard|enter|exit|linear|spring}.
   * Roles: --x-motion-{role}-duration · -easing (colour, opacity — never
   * overshoots) · -move-duration · -move-easing (position, size, rotation;
   * expressive may spring) · -distance · -scale (overlays) · --x-motion-travel
   * (1, reduced 0: factor for travel that is no token, e.g. a drawer's width).
   * Reduced motion is a mode below (`prefers-reduced-motion`), measured against
   * WCAG 2.3.3: what changes position, size or shape goes; colour and opacity
   * stay. fade = no travel, only the fade · still = colour fades, position
   * jumps · off = instant · slow = loops at a fraction of the speed.
   * Not tokens: whether a component animates, staggering, keyframes, exiting the
   * top layer (`overlay`, allow-discrete).
   */
  type Reduced = 'keep' | 'fade' | 'still' | 'off' | 'slow';
  type CurveName = 'standard' | 'enter' | 'exit' | 'linear';
  interface MotionRole {
    /** null = a delay, not a transition */
    curve: CurveName | null;
    /** moves position, size or rotation → -move-* tokens */
    spatial?: boolean;
    /** may use the character's spring for its movement */
    springy?: boolean;
    size?: 'sm' | 'md' | 'lg';
    reduced: Reduced;
  }
  const MOTION_ROLES: Record<string, MotionRole> = {
    'state-in': { curve: 'linear', reduced: 'keep' }, //    hover/pressed in: instant
    'state-out': { curve: 'standard', reduced: 'keep' }, // leaving: soft
    toggle: {
      curve: 'standard',
      spatial: true,
      springy: true,
      reduced: 'still',
    }, // switch thumb, check, chevron, tab indicator
    'enter-sm': { curve: 'enter', spatial: true, size: 'sm', reduced: 'fade' }, //  tooltip, menu, listbox
    'exit-sm': { curve: 'exit', spatial: true, size: 'sm', reduced: 'fade' },
    'enter-md': {
      curve: 'enter',
      spatial: true,
      springy: true,
      size: 'md',
      reduced: 'fade',
    }, // popover, toast
    'exit-md': { curve: 'exit', spatial: true, size: 'md', reduced: 'fade' },
    'enter-lg': {
      curve: 'enter',
      spatial: true,
      springy: true,
      size: 'lg',
      reduced: 'fade',
    }, // dialog, drawer, scrim
    'exit-lg': { curve: 'exit', spatial: true, size: 'lg', reduced: 'fade' },
    expand: { curve: 'standard', spatial: true, reduced: 'off' }, //  accordion, sidebar, message at a field
    move: { curve: 'standard', spatial: true, springy: true, reduced: 'off' }, // reorder, remove (view transitions)
    loop: { curve: 'linear', reduced: 'slow' }, //  spinner: one turn
    scroll: { curve: 'standard', reduced: 'keep' }, // shadow when sticking
    attention: { curve: 'standard', spatial: true, reduced: 'off' }, // offer: shake, pulse — once, never alone
    'delay-hint': { curve: null, reduced: 'keep' }, // tooltip appears after dwelling
  };
  const motion = recipe.motion!;
  const CHARACTERS = Object.keys(motion.characters);
  // longer feels sluggish in a UI (loops and delays excepted); recipe `contract.motionMaxMs`
  const UI_MAX_MS = C.motionMaxMs!;
  const bezier = (p: number[]) => `cubic-bezier(${p.join(', ')})`;
  /** damped spring sampled as CSS linear(): 1 − e^(−s·t)(cos ωd·t + ζ/√(1−ζ²) sin ωd·t) */
  const springPoints = (s: {
    damping: number;
    settle: number;
    points: number;
  }) => {
    const z = s.damping;
    const wd = (s.settle / z) * Math.sqrt(1 - z * z);
    const pts = Array.from({ length: s.points }, (_, i) => {
      const t = i / (s.points - 1);
      const x =
        1 -
        Math.exp(-s.settle * t) *
          (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
      return Number(x.toFixed(4));
    });
    pts[pts.length - 1] = 1;
    return pts;
  };
  const durRef = (ms: number) =>
    `var(--${P}duration-${ms === 0 ? 'instant' : ms})`;
  const motionFoundation = [
    decl('duration.instant', '0.01ms'), // "no motion" that still fires transitionend
    // factor for travel that is no token (drawer/sheet = its own width, page
    // slide): 1, reduced 0 — components never need their own media query
    decl('motion.travel', 1),
    ...motion.scale.map((ms) => decl(`duration.${ms}`, `${ms}ms`)),
  ];
  /** all motion tokens of one character (curves + roles) */
  const motionDecls = (name: string, set: string = SET.base) => {
    const ch = motion.characters[name];
    const out = [
      ...Object.entries(ch.curves).map(([k, p]) =>
        decl(`easing.${k}`, bezier(p), set),
      ),
      decl('easing.linear', 'linear', set),
    ];
    if (ch.spring)
      out.push(
        decl(
          'easing.spring',
          `linear(${springPoints(ch.spring).join(', ')})`,
          set,
        ),
      );
    for (const [role, def] of Object.entries(MOTION_ROLES)) {
      const n = `--${P}motion-${role}`;
      const p = `motion.${role}`;
      out.push(decl(`${p}.duration`, durRef(ch.durations[role]), set));
      if (!def.curve) continue;
      out.push(decl(`${p}.easing`, `var(--${P}easing-${def.curve})`, set));
      if (def.spatial)
        out.push(
          decl(`${p}.move-duration`, `var(${n}-duration)`, set),
          decl(
            `${p}.move-easing`,
            `var(--${P}easing-${def.springy && ch.spring ? 'spring' : def.curve})`,
            set,
          ),
        );
      if (def.size)
        out.push(
          decl(`${p}.distance`, sz(ch.distance[def.size]), set),
          decl(`${p}.scale`, ch.scale[def.size] ?? 1, set),
        );
    }
    return out;
  };
  /** what reduced motion changes for one character */
  const motionReducedDecls = (name: string, set: string) => {
    const ch = motion.characters[name];
    const out: string[] = [decl('motion.travel', 0, set)];
    for (const [role, def] of Object.entries(MOTION_ROLES)) {
      const n = `--${P}motion-${role}`;
      const p = `motion.${role}`;
      if (def.reduced === 'fade')
        out.push(
          decl(`${p}.distance`, '0px', set),
          decl(`${p}.scale`, 1, set),
          decl(`${p}.move-easing`, `var(${n}-easing)`, set),
        );
      if (def.reduced === 'still')
        out.push(decl(`${p}.move-duration`, `var(--${P}duration-instant)`, set));
      if (def.reduced === 'off') {
        out.push(decl(`${p}.duration`, `var(--${P}duration-instant)`, set));
        if (def.spatial)
          out.push(
            decl(`${p}.move-duration`, `var(--${P}duration-instant)`, set),
          );
      }
      if (def.reduced === 'slow')
        out.push(
          decl(
            `${p}.duration`,
            `calc(${durRef(ch.durations[role])} * ${motion.reduced.loopFactor})`,
            set,
          ),
        );
    }
    return out;
  };

  // motion contract
  const motionFails: string[] = [];
  {
    /** y of a cubic-bezier at progress x (bisection on x(t)) */
    const bezierY = ([x1, y1, x2, y2]: number[], x: number) => {
      const at = (a: number, b: number, t: number) =>
        3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (at(x1, x2, mid) < x) lo = mid;
        else hi = mid;
      }
      return at(y1, y2, (lo + hi) / 2);
    };
    const sc = motion.scale;
    if (sc.some((v, i) => v <= 0 || (i > 0 && v <= sc[i - 1])))
      motionFails.push(
        `Dauer-Skala nicht streng steigend > 0: ${sc.join(' · ')}`,
      );
    if (!motion.characters[motion.character])
      motionFails.push(`character „${motion.character}" nicht im Rezept`);
    if (!(motion.reduced.loopFactor >= 1))
      motionFails.push('reduced.loopFactor < 1 (Schleife würde schneller)');
    for (const [role, def] of Object.entries(MOTION_ROLES))
      if (def.spatial && !['fade', 'still', 'off'].includes(def.reduced))
        motionFails.push(
          `${role}: räumlich, aber bei reduzierter Bewegung nicht abschaltbar (WCAG 2.3.3)`,
        );
    for (const name of CHARACTERS) {
      const ch = motion.characters[name];
      const d = ch.durations;
      for (const role of Object.keys(MOTION_ROLES))
        if (d[role] === undefined)
          motionFails.push(`${name}: Rolle ${role} ohne Dauer`);
      for (const role of Object.keys(d))
        if (!MOTION_ROLES[role])
          motionFails.push(`${name}: unbekannte Rolle ${role}`);
      for (const [role, ms] of Object.entries(d)) {
        if (ms !== 0 && !sc.includes(ms))
          motionFails.push(
            `${name}.${role}: ${ms} ms fehlt in der Dauer-Skala`,
          );
        if (!['loop', 'delay-hint'].includes(role) && ms > UI_MAX_MS)
          motionFails.push(
            `${name}.${role}: ${ms} ms > ${UI_MAX_MS} ms (wirkt träge)`,
          );
      }
      if (!(d['state-in'] < d['state-out']))
        motionFails.push(
          `${name}: Zustand rein ${d['state-in']} nicht schneller als raus ${d['state-out']}`,
        );
      const sizes = ['sm', 'md', 'lg'] as const;
      for (const s of sizes)
        if (!(d[`exit-${s}`] < d[`enter-${s}`]))
          motionFails.push(
            `${name}: exit-${s} ${d[`exit-${s}`]} nicht kürzer als enter-${s} ${d[`enter-${s}`]}`,
          );
      for (const k of ['enter', 'exit'])
        if (
          sizes.some(
            (s, i) => i > 0 && d[`${k}-${s}`] <= d[`${k}-${sizes[i - 1]}`],
          )
        )
          motionFails.push(
            `${name}: ${k} wächst nicht mit der Größe (${sizes.map((s) => d[`${k}-${s}`]).join(' · ')})`,
          );
      const dist = sizes.map((s) => ch.distance[s]);
      if (dist.some((v, i) => i > 0 && v <= dist[i - 1]))
        motionFails.push(
          `${name}: Weg wächst nicht mit der Größe (${dist.join(' · ')})`,
        );
      for (const v of dist)
        if (!space.scale.includes(v))
          motionFails.push(
            `${name}: Weg ${v} px fehlt in der Foundation-Skala`,
          );
      for (const [s, v] of Object.entries(ch.scale))
        if (!(v! > 0.9 && v! <= 1))
          motionFails.push(`${name}: scale.${s} ${v} außerhalb (0,9 … 1]`);
      // effects curves never overshoot; enter decelerates, exit accelerates
      for (const [k, p] of Object.entries(ch.curves)) {
        if (p.some((v) => v < 0 || v > 1))
          motionFails.push(`${name}: Kurve ${k} schwingt über (${bezier(p)})`);
        const y = bezierY(p, 0.25);
        if (k === 'enter' && !(y > 0.25))
          motionFails.push(
            `${name}: enter bremst nicht ab (y(0,25) = ${y.toFixed(2)})`,
          );
        if (k === 'exit' && !(y < 0.25))
          motionFails.push(
            `${name}: exit beschleunigt nicht (y(0,25) = ${y.toFixed(2)})`,
          );
      }
      if (ch.spring) {
        const pts = springPoints(ch.spring);
        if (!(ch.spring.damping > 0 && ch.spring.damping < 1))
          motionFails.push(
            `${name}: Feder-Dämpfung ${ch.spring.damping} nicht in (0, 1)`,
          );
        if (Math.abs(pts[pts.length - 2] - 1) > 0.01)
          motionFails.push(
            `${name}: Feder kommt nicht zur Ruhe (vorletzter Punkt ${pts[pts.length - 2]})`,
          );
      }
    }
  }

  // ---------- Icons outside controls ----------
  const iconTokens = Object.entries(recipe.icon!.spot).map(([k, v]) =>
    decl(`icon.spot.${k}`, `var(--${P}size-${v})`),
  );
  // ---------- Avatars ----------
  // spot sizes without text, on the size scale; no coarse step — an avatar is no hit target
  for (const [k, v] of Object.entries(recipe.avatar!.sizes))
    if (!space.scale.includes(v))
      recipeErrors.push(`avatar.sizes.${k}: ${v} px fehlt in der Größenskala`);
  assertRecipe();
  for (const [k, v] of Object.entries(recipe.avatar!.sizes))
    decl(`avatar.${k}`, `var(--${P}size-${v})`);
  const iconFails: string[] = [];
  {
    const pairs = Object.entries(recipe.icon!.text)
      .map(([k, v]) => [Number(k), v] as const)
      .sort((a, b) => a[0] - b[0]);
    for (const [i, [font, ic]] of pairs.entries()) {
      if (!space.scale.includes(ic))
        iconFails.push(`Icon ${ic} (Text ${font}) fehlt in der Skala`);
      if (ic < font) iconFails.push(`Icon ${ic} kleiner als Text ${font}`);
      if (i > 0 && ic < pairs[i - 1][1])
        iconFails.push(`Icon fällt mit der Schrift (${font} → ${ic})`);
    }
    const maxFont = pairs[pairs.length - 1][0];
    for (const t of typeSteps)
      for (const px of [t.size, t.min].filter(
        (n): n is number => n !== undefined,
      ))
        if (px <= maxFont && iconFor(px) === undefined)
          iconFails.push(`type.${t.role}.${t.step}: Text ${px} ohne Icon-Paar`);
    // the controls use the same pairing (label step of each size)
    for (const s of SIZES) {
      const z = control.sizes[s];
      const lbl = typeSteps.find(
        (t) => t.role === 'label' && t.step === z.label,
      );
      if (lbl && iconFor(lbl.size) !== z.icon)
        iconFails.push(
          `${s}: Control-Icon ${z.icon} ≠ Paar für label.${z.label} (${iconFor(lbl.size)})`,
        );
    }
    const spots = Object.values(recipe.icon!.spot);
    if (spots.some((v, i) => i > 0 && v <= spots[i - 1]))
      iconFails.push('Spot-Größen nicht streng steigend');
    for (const v of spots)
      if (!space.scale.includes(v))
        iconFails.push(`Spot ${v} fehlt in der Skala`);
    if (spots[0] < Math.max(...pairs.map((p) => p[1])))
      iconFails.push('kleinstes Spot-Icon kleiner als das größte Text-Icon');
  }

  // ---------- Forced colours (Windows high contrast) ----------
  /**
   * In `forced-colors` the browser replaces author colours with the user's
   * system palette (measured in Chromium): fills become Canvas,
   * borders CanvasText (a transparent border becomes visible), shadows go,
   * translucent layers keep their alpha — and system colours survive, also
   * through var(). So the model remaps what carries meaning to system colours;
   * components get it for free:
   *   selected (enabled)  background/stroke/track → Highlight, icon → HighlightText
   *                       (text stays: it sits on its Canvas backplate, readable)
   *   disabled            text/icon/stroke → GrayText
   *   focus ring → Highlight · line.edge (translucent) → CanvasText ·
   *   status dot → CanvasText (the label carries the meaning) · mark → Mark
   * Hover/pressed layers stay invisible (focus ring and cursor remain).
   * Charts opt out on their plot (`forced-color-adjust: none`, own surface).
   */
  const forcedOf = (part: Part, c: Cell): string | null => {
    if (c.avail === 'disabled')
      return part === 'background' || part === 'track' ? null : 'GrayText';
    if (c.avail === 'enabled' && c.sel === 'selected')
      return part === 'background' || part === 'stroke' || part === 'track'
        ? 'Highlight'
        : // text keeps its forced colour: Chromium paints a Canvas backplate
          // behind text, HighlightText on it vanished (measured); SVG has none
          part === 'icon'
          ? 'HighlightText'
          : null;
    return null;
  };
  const forcedTokens: string[] = [
    decl('focus.ring', 'Highlight', SET.forced),
    decl('focus.ring-on-inverted', 'Highlight', SET.forced),
    decl('line.edge', 'CanvasText', SET.forced),
    decl('content.disabled', 'GrayText', SET.forced),
    decl('mark.surface', 'Mark', SET.forced),
    decl('mark.current', 'Highlight', SET.forced),
    ...STATUS_INTENTS.flatMap((i) =>
      ['strong', 'subtle'].map((e) =>
        decl(`status.${i}.indicator.${e}`, 'CanvasText', SET.forced),
      ),
    ),
  ];
  for (const h of Object.keys(HIERARCHIES))
    for (const part of PARTS)
      for (const c of cells) {
        const v = forcedOf(part, c);
        if (v)
          forcedTokens.push(decl(`ctl.${h}.${part}.${key(c)}`, v, SET.forced));
      }
  // contract: a filled hierarchy keeps a border, or its shape disappears with
  // the fill; every enabled selected cell is remapped
  const forcedFails: string[] = [];
  const idle: Cell = {
    avail: 'enabled',
    sel: 'none',
    tone: 'none',
    inter: 'idle',
  };
  for (const [h, def] of Object.entries(HIERARCHIES)) {
    if (
      def.style('background', idle) !== 'transparent' &&
      def.style('stroke', idle) === 'transparent'
    )
      forcedFails.push(
        `${h}: gefüllt ohne Rand — Form verschwindet im Hochkontrast`,
      );
    for (const c of cells.filter(
      (c) => c.avail === 'enabled' && c.sel === 'selected',
    ))
      if (
        forcedOf('background', c) !== 'Highlight' &&
        forcedOf('stroke', c) !== 'Highlight'
      )
        forcedFails.push(`${h}: ${key(c)} ohne Systemfarbe`);
  }

  // ---------- Identity colours ----------
  /**
   * Identity colours: mark someone or something without
   * meaning — avatar without a photo (colour from a hash of the id, so a person
   * keeps it everywhere), labels users colour themselves. Not status (fixed
   * meaning), not accent (selection), not brand. Same shape as the status chip:
   * strong = fill + on-fill, subtle = light surface + ink + dot. The light
   * surfaces of all hues share one lightness and look alike — strong tells
   * apart, subtle leans on text and dot; identity is never colour alone
   * (initials, name, label text are always there).
   */
  const ident = recipe.identity!;
  const identNames = [...ident.hues.map((_, i) => String(i + 1)), 'neutral'];
  const identHue = (n: string) =>
    n === 'neutral' ? 'neutral' : ident.hues[Number(n) - 1];
  const onFillOf = (mode: (typeof MODES)[number], fill: string) => {
    const pref = recipe.onFill?.[mode] ?? 'auto';
    if (pref !== 'auto') return pref;
    return contrastWcag('#ffffff', fill) >= contrastWcag('#000000', fill)
      ? '#ffffff'
      : '#000000';
  };
  for (const mode of MODES)
    for (const n of identNames) {
      const ramp = ramps[mode][identHue(n)];
      const fill = ramp[ident.strong.surface - 1].hex;
      const v = values[mode];
      v[`identity.${n}-surface-strong`] = fill;
      v[`identity.${n}-content-strong`] = onFillOf(mode, fill);
      v[`identity.${n}-indicator-strong`] = onFillOf(mode, fill);
      v[`identity.${n}-surface-subtle`] = ramp[ident.subtle.surface - 1].hex;
      v[`identity.${n}-content-subtle`] = ramp[ident.subtle.content - 1].hex;
      v[`identity.${n}-indicator-subtle`] =
        ramp[ident.subtle.indicator - 1].hex;
    }
  // contract: text ≥ 4.5 on its surface (both emphases), dot ≥ 3 on the light
  // surface, strong fills apart for normal vision (IDENT_FLOOR, recipe
  // `contract.identityMinDeltaE`); the light surfaces are not required to differ (noted)
  const IDENT_FLOOR = C.identityMinDeltaE!;
  const identFails: string[] = [];
  const identNotes: string[] = [];
  for (const mode of MODES) {
    const v = values[mode];
    const g = (n: string, k: string) => v[`identity.${n}-${k}`];
    for (const n of identNames)
      for (const [a, b, min] of [
        ['content-strong', 'surface-strong', C.textMin],
        ['content-subtle', 'surface-subtle', C.textMin],
        ['indicator-subtle', 'surface-subtle', C.strokeMin],
      ] as const) {
        const c = contrastWcag(g(n, a), g(n, b));
        if (c < min)
          identFails.push(
            `${mode}: identity-${n} ${a} auf ${b} ${c.toFixed(2)} < ${min}`,
          );
      }
    const hues = identNames.filter((n) => n !== 'neutral');
    let worstSubtle = 99;
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++) {
        const d = deltaE(
          g(hues[i], 'surface-strong'),
          g(hues[j], 'surface-strong'),
        );
        if (d < IDENT_FLOOR)
          identFails.push(
            `${mode}: identity ${identHue(hues[i])}↔${identHue(hues[j])} strong ΔE ${d.toFixed(1)} < ${IDENT_FLOOR}`,
          );
        worstSubtle = Math.min(
          worstSubtle,
          deltaE(g(hues[i], 'surface-subtle'), g(hues[j], 'surface-subtle')),
        );
      }
    identNotes.push(
      `${mode}: leise Flächen untereinander ΔE ≥ ${worstSubtle.toFixed(1)} — Unterscheidung über Text und Punkt`,
    );
  }

  // ---------- Data visualisation ----------
  /**
   * Chart colours. Own list, read straight
   * from the ramps per mode like `mark`: categorical slots in fixed order (never
   * cycled — past the list comes `other`, grey), sequential classes of one hue
   * (low = near the surface in both modes, the ramps are contrast-ordered),
   * diverging as two offers on the same arm steps around a grey midpoint:
   * `neutral` (above/below) and `rated` (better/worse, on the status hues).
   * Chrome reads existing roles: grid = decoration, baseline = meaning (≥ 3:1).
   */
  const viz = recipe.dataviz!;
  const slotHex = (mode: (typeof MODES)[number], s: VizSlot) =>
    ramps[mode][s.hue][s[mode] - 1].hex;
  const vizHues = (mode: (typeof MODES)[number]) => {
    const v: Record<string, string> = {};
    viz.categorical.forEach(
      (s, i) => (v[`dataviz.category-${i + 1}`] = slotHex(mode, s)),
    );
    v['dataviz.category-other'] = slotHex(mode, viz.other);
    viz.sequential[mode].forEach(
      (step, i) =>
        (v[`dataviz.sequential-${i + 1}`] =
          ramps[mode][viz.sequential.hue][step - 1].hex),
    );
    const arm = viz.diverging.arm[mode];
    for (const [offer, ends] of Object.entries({
      neutral: viz.diverging.neutral,
      rated: viz.diverging.rated,
    })) {
      // low-n … low-1 · mid · high-1 … high-n (1 = next to the midpoint)
      arm.forEach((step, i) => {
        v[`dataviz.diverging-${offer}-low-${i + 1}`] =
          ramps[mode][ends.low][step - 1].hex;
        v[`dataviz.diverging-${offer}-high-${i + 1}`] =
          ramps[mode][ends.high][step - 1].hex;
      });
      v[`dataviz.diverging-${offer}-mid`] = slotHex(mode, viz.diverging.mid);
    }
    return v;
  };
  for (const mode of MODES) Object.assign(values[mode], vizHues(mode));
  const vizTokens = [
    decl('dataviz.surface', `var(--${P}surface-raised)`),
    decl('dataviz.grid', `var(--${P}line-subtle)`), //       decoration
    decl('dataviz.baseline', `var(--${P}line-strong)`), //   zero line, axis — meaning
    decl('dataviz.label', `var(--${P}content-secondary)`), // ticks, axis titles
    decl('dataviz.value', `var(--${P}content-primary)`), //   direct labels, tooltip value
    decl('dataviz.line', `var(--${P}size-${viz.marks.line})`),
    decl('dataviz.gap', `var(--${P}size-${viz.marks.gap})`), //  between fills, ring on overlap
    decl('dataviz.marker', `var(--${P}size-${viz.marks.marker})`),
    decl('dataviz.radius', `var(--${P}radius-item)`), // data end of a bar
  ];
  /** relative names of the colour tokens, for the report */
  const vizNames = Object.keys(vizHues('light'));

  // contract — the dataviz method's checks (cvd.ts) plus a legend floor: every
  // pair stays apart for normal vision, not only neighbours (a legend shows all);
  // recipe `contract.legendMinDeltaE`
  const LEGEND_FLOOR = C.legendMinDeltaE!;
  const vizFails: string[] = [];
  const vizNotes: string[] = [];
  const f1 = (n: number) => n.toFixed(1);
  for (const mode of MODES) {
    const cat = viz.categorical.map((s) => slotHex(mode, s));
    const names = viz.categorical.map((s) => s.hue);
    const [lo, hi] = VIZ.band[mode];
    const p = recipe.poles[mode];
    // charts sit on page or card; on an overlay (chart in a dialog) Dark is
    // lighter — there the chart brings its own surface (dataviz.surface) or
    // labels its marks directly: noted, not a fail
    const surfaces = [p.paper, p.canvas];
    cat.forEach((hex, i) => {
      const o = hexToOklch(hex);
      if (o.l < lo || o.l > hi)
        vizFails.push(
          `${mode}: category-${i + 1} (${names[i]}) L ${o.l.toFixed(3)} außerhalb ${lo}–${hi}`,
        );
      if ((o.c ?? 0) < VIZ.chromaFloor)
        vizFails.push(
          `${mode}: category-${i + 1} (${names[i]}) wirkt grau (C ${(o.c ?? 0).toFixed(3)})`,
        );
      for (const s of surfaces)
        if (contrastWcag(hex, s) < VIZ.contrastMin)
          vizFails.push(
            `${mode}: category-${i + 1} (${names[i]}) ${contrastWcag(hex, s).toFixed(2)}:1 auf ${s}`,
          );
      if (p.overlay && contrastWcag(hex, p.overlay) < VIZ.contrastMin)
        vizNotes.push(
          `${mode}: category-${i + 1} (${names[i]}) ${contrastWcag(hex, p.overlay).toFixed(2)}:1 auf overlay`,
        );
    });
    for (let i = 1; i < cat.length; i++) {
      const c = cvdDeltaE(cat[i - 1], cat[i]);
      const n = deltaE(cat[i - 1], cat[i]);
      if (c < VIZ.cvdTarget)
        vizFails.push(
          `${mode}: Nachbarn ${names[i - 1]}↔${names[i]} Fehlsicht-ΔE ${f1(c)} < ${VIZ.cvdTarget}`,
        );
      if (n < VIZ.normalFloor)
        vizFails.push(
          `${mode}: Nachbarn ${names[i - 1]}↔${names[i]} ΔE ${f1(n)} < ${VIZ.normalFloor}`,
        );
    }
    for (let i = 0; i < cat.length; i++)
      for (let j = i + 1; j < cat.length; j++) {
        if (deltaE(cat[i], cat[j]) < LEGEND_FLOOR)
          vizFails.push(
            `${mode}: Legende ${names[i]}↔${names[j]} ΔE ${f1(deltaE(cat[i], cat[j]))} < ${LEGEND_FLOOR}`,
          );
        // the first three also go into scatter plots and maps: all pairs
        if (j < 3 && cvdDeltaE(cat[i], cat[j]) < VIZ.cvdTarget)
          vizFails.push(
            `${mode}: erste drei ${names[i]}↔${names[j]} Fehlsicht-ΔE ${f1(cvdDeltaE(cat[i], cat[j]))} < ${VIZ.cvdTarget}`,
          );
      }
    // other: grey, visible, apart from every slot
    const other = slotHex(mode, viz.other);
    if ((hexToOklch(other).c) > 0.02)
      vizFails.push(`${mode}: other ist nicht grau`);
    if (contrastWcag(other, p.paper) < VIZ.contrastMin)
      vizFails.push(
        `${mode}: other ${contrastWcag(other, p.paper).toFixed(2)}:1 auf paper`,
      );
    for (const [i, hex] of cat.entries())
      if (deltaE(other, hex) < LEGEND_FLOOR)
        vizFails.push(
          `${mode}: other↔${names[i]} ΔE ${f1(deltaE(other, hex))} < ${LEGEND_FLOOR}`,
        );
    // sequential: one hue, every class a visible step away from the last,
    // moving away from the surface; the strongest class ≥ 3:1
    const seq = viz.sequential[mode].map(
      (s) => ramps[mode][viz.sequential.hue][s - 1],
    );
    const away = mode === 'light' ? -1 : 1;
    for (let i = 1; i < seq.length; i++)
      if ((seq[i].l - seq[i - 1].l) * away < 0.06)
        vizFails.push(
          `${mode}: sequential ${i}→${i + 1} ΔL ${Math.abs(seq[i].l - seq[i - 1].l).toFixed(3)} < 0,06 oder falsche Richtung`,
        );
    if (contrastWcag(seq[seq.length - 1].hex, p.paper) < VIZ.contrastMin)
      vizFails.push(`${mode}: sequential stärkste Klasse < 3:1`);
    // diverging: arms on the same steps (same lightness), grey midpoint lighter
    // than the first arm step towards the surface, poles apart in every vision
    const arm = viz.diverging.arm[mode];
    const mid = slotHex(mode, viz.diverging.mid);
    if ((hexToOklch(mid).c) > 0.02)
      vizFails.push(`${mode}: diverging-mid ist nicht grau`);
    for (const [offer, ends] of Object.entries({
      neutral: viz.diverging.neutral,
      rated: viz.diverging.rated,
    })) {
      for (const [k, step] of arm.entries()) {
        const a = ramps[mode][ends.low][step - 1].hex;
        const b = ramps[mode][ends.high][step - 1].hex;
        const c = cvdDeltaE(a, b);
        const msg = `${mode}: diverging-${offer} Stufe ${k + 1} ${ends.low}↔${ends.high} Fehlsicht-ΔE ${f1(c)} < ${VIZ.cvdTarget}`;
        // rated sits on the status hues (red/green): allowed only with the
        // sign in the form (bar direction, +/−) — noted, not hidden
        if (c < VIZ.cvdTarget)
          (offer === 'rated' ? vizNotes : vizFails).push(msg);
        if (deltaE(a, mid) < LEGEND_FLOOR || deltaE(b, mid) < LEGEND_FLOOR)
          if (k === 0)
            vizFails.push(
              `${mode}: diverging-${offer} Stufe 1 zu nah an der Mitte`,
            );
      }
    }
  }
  // marks on the Foundation scale
  for (const [k, n] of Object.entries(viz.marks))
    if (!space.scale.includes(n))
      vizFails.push(`marks.${k} ${n} px fehlt in der Foundation-Skala`);

  // ---------- Register: per-mode values and the overlay sets ----------
  // Registration order is the order of the sets in $metadata.json and of the
  // tokens inside each set; the render table below follows it.
  for (const mode of MODES)
    for (const [k, v] of Object.entries(values[mode])) decl(k, v, SET[mode]);
  motionDecls(motion.character);
  // other motion characters: only to check them (like radius shapes), not a mode
  const otherCharacters = CHARACTERS.filter((c) => c !== motion.character);
  for (const c of otherCharacters) motionDecls(c, SET.motion(c));
  motionReducedDecls(motion.character, SET.reduced(motion.character));
  for (const c of otherCharacters) motionReducedDecls(c, SET.reduced(c));
  for (const [name, shape] of Object.entries(radius.shapes))
    if (name !== radius.default) {
      radiusDecls(shape, SET.shape(name));
      pillDecls(shape, SET.shape(name));
      sizeRadiusDecls(shape, SET.shape(name));
    }

  // ---------- contrast checks (accessibility is part of the contract) ----------
  interface Check {
    mode: string;
    rule: string;
    pair: string;
    ratio: number;
    min: number;
    ok: boolean;
  }
  const checks: Check[] = [];
  // every hue a control shows: the hierarchies' hues (not the inverted surface)
  // and the tone hues — derived, so a hue the recipe adds is checked too
  const TONE_HUES = TONES.filter((t) => t !== 'none');
  const CONTROL_HUES = [
    ...new Set([
      ...Object.values(HIERARCHIES)
        .map((d) => d.hue)
        .filter((h) => h !== 'inverted'),
      ...TONE_HUES,
    ]),
  ];
  // the scenario checks below model one hierarchy's cell each; they read that
  // hierarchy's hue, so a DS that moves a hierarchy to another hue gets it checked
  const PRIMARY = HIERARCHIES['primary'].hue;
  const SECONDARY = HIERARCHIES['secondary'].hue;
  const TERTIARY = HIERARCHIES['tertiary'].hue;
  const DESTRUCTIVE_SUBTLE = HIERARCHIES['destructive-subtle'].hue;
  const ON_INVERTED = HIERARCHIES['on-inverted'].hue;
  /**
   * APCA as a second lens (apca.ts) — advisory, never fails: text pairs against
   * `contract.apcaTextLc`, non-text against `contract.apcaNonTextLc`. Each
   * distinct pair is noted once (first place it was met).
   */
  interface ApcaNote {
    mode: string;
    where: string;
    pair: string;
    lc: number;
    target: number;
  }
  const apcaNotes: ApcaNote[] = [];
  const apcaSeen = new Set<string>();
  const apcaNote = (
    mode: string,
    where: string,
    pair: string,
    fg: string,
    bg: string,
    text: boolean,
  ) => {
    const target = text ? C.apcaTextLc! : C.apcaNonTextLc!;
    const id = `${mode} ${pair} ${target}`;
    if (apcaSeen.has(id)) return;
    apcaSeen.add(id);
    const lc = apcaLc(fg, bg);
    if (lc < target)
      apcaNotes.push({ mode, where, pair, lc: Number(lc.toFixed(1)), target });
  };
  const opaqueHex = (x: string) => /^#[0-9a-f]{6}(ff)?$/i.test(x);
  for (const mode of MODES) {
    const v = values[mode];
    const canvas = v['pole.canvas'];
    const add = (
      rule: string,
      pair: string,
      a: string,
      b: string,
      min: number,
    ) => {
      const ratio = contrastWcag(a, b);
      if (!opaqueHex(a) || !opaqueHex(b))
        throw new Error(`APCA braucht deckende Farben: ${rule} (${a} / ${b})`);
      apcaNote(
        mode,
        rule,
        pair,
        a.slice(0, 7),
        b.slice(0, 7),
        min !== C.strokeMin,
      );
      checks.push({
        mode,
        rule,
        pair,
        ratio: Number(ratio.toFixed(2)),
        min,
        ok: ratio >= min,
      });
    };
    add(
      'Label auf Seite',
      'pole.ink / pole.canvas',
      v['pole.ink'],
      canvas,
      C.textMin,
    );
    for (const surf of [
      'pole.canvas',
      'pole.paper',
      'pole.overlay',
      'pole.sunken',
    ]) {
      for (const k of ['mark.value', 'mark.current-value'])
        add(
          `Text auf Suchtreffer (${k})`,
          `pole.ink / ${k} über ${surf}`,
          v['pole.ink'],
          over(v[k], v[surf]),
          C.textMin,
        );
    }
    add(
      'Hilfetext auf Seite',
      'neutral.ink-subtle / pole.canvas',
      v['neutral.ink-subtle'],
      canvas,
      C.textMin,
    );
    add(
      'Rand unausgewählt neutral (1.4.11)',
      'neutral.line-strong / pole.canvas',
      v['neutral.line-strong'],
      canvas,
      C.strokeMin,
    );
    for (const hue of CONTROL_HUES) {
      add(
        `Füllung ${hue} (1.4.11)`,
        `${hue}.fill / pole.canvas`,
        v[`${hue}.fill`],
        canvas,
        C.strokeMin,
      );
      add(
        `Haken/Ziffer auf Füllung ${hue}`,
        `${hue}.on-fill / ${hue}.fill`,
        v[`${hue}.on-fill`],
        v[`${hue}.fill`],
        C.solidMin,
      );
      add(
        `Rand unausgewählt ${hue} (1.4.11)`,
        `${hue}.line-strong / pole.canvas`,
        v[`${hue}.line-strong`],
        canvas,
        C.strokeMin,
      );
      add(
        `Titel/Ziffer ${hue} auf Seite`,
        `${hue}.ink / pole.canvas`,
        v[`${hue}.ink`],
        canvas,
        C.textMin,
      );
    }
    for (const i of TONE_HUES)
      add(
        `Meldungstext ${i}`,
        `${i}.ink-subtle / pole.canvas`,
        v[`${i}.ink-subtle`],
        canvas,
        C.textMin,
      );
    add(
      'Readonly-Haken auf Tönung (1.4.11)',
      `${PRIMARY}.ink / ${PRIMARY}.tint`,
      v[`${PRIMARY}.ink`],
      v[`${PRIMARY}.tint`],
      C.strokeMin,
    );
    add(
      'Feldrand auf Weiß (1.4.11)',
      'neutral.line-strong / pole.paper',
      v['neutral.line-strong'],
      v['pole.paper'],
      C.strokeMin,
    );
    add(
      'Platzhalter im Feld',
      'neutral.ink-subtle / pole.paper',
      v['neutral.ink-subtle'],
      v['pole.paper'],
      C.textMin,
    );
    add(
      'Readonly-Feld Text',
      'pole.ink / neutral.subtle',
      v['pole.ink'],
      v['neutral.subtle'],
      C.textMin,
    );
    add(
      'Readonly-Feld Platzhalter',
      'neutral.ink-subtle / neutral.subtle',
      v['neutral.ink-subtle'],
      v['neutral.subtle'],
      C.textMin,
    );
    add(
      'Haken gewählte Zeile (1.4.11)',
      `${SECONDARY}.ink / pole.paper`,
      v[`${SECONDARY}.ink`],
      v['pole.paper'],
      C.strokeMin,
    );
    add(
      'Rand gewählte Karte (1.4.11)',
      `${SECONDARY}.fill / pole.paper`,
      v[`${SECONDARY}.fill`],
      v['pole.paper'],
      C.strokeMin,
    );
    add(
      'Destructive-subtle Rand (1.4.11)',
      `${DESTRUCTIVE_SUBTLE}.line-strong / pole.paper`,
      v[`${DESTRUCTIVE_SUBTLE}.line-strong`],
      v['pole.paper'],
      C.strokeMin,
    );
    add(
      'Destructive-subtle Text',
      `${DESTRUCTIVE_SUBTLE}.ink-subtle / pole.paper`,
      v[`${DESTRUCTIVE_SUBTLE}.ink-subtle`],
      v['pole.paper'],
      C.textMin,
    );
    add(
      'Destructive-subtle Text hover',
      `${DESTRUCTIVE_SUBTLE}.ink / ${DESTRUCTIVE_SUBTLE}.canvas`,
      v[`${DESTRUCTIVE_SUBTLE}.ink`],
      v[`${DESTRUCTIVE_SUBTLE}.canvas`],
      C.textMin,
    );
    add(
      'Auswahl-Indikator auf Karte (1.4.11)',
      `${TERTIARY}.fill / pole.paper`,
      v[`${TERTIARY}.fill`],
      v['pole.paper'],
      C.strokeMin,
    );
    add(
      'Inaktiver Tab auf Karte',
      'neutral.ink-subtle / pole.paper',
      v['neutral.ink-subtle'],
      v['pole.paper'],
      C.textMin,
    );
    add(
      'Button-Text readonly auf Tönung',
      `${PRIMARY}.ink / ${PRIMARY}.tint`,
      v[`${PRIMARY}.ink`],
      v[`${PRIMARY}.tint`],
      C.textMin,
    );
    // solid `done` (progress steps); a tone only on problems
    for (const hue of new Set([PRIMARY, 'negative', 'warning']))
      for (const t of ['tint', 'tint-hover', 'tint-pressed'])
        add(
          `Haken erledigt auf ${t} ${hue} (1.4.11)`,
          `${hue}.ink / ${hue}.${t}`,
          v[`${hue}.ink`],
          v[`${hue}.${t}`],
          C.strokeMin,
        );
    // `brand` stands for any future fill controls may sit on (not a hierarchy)
    for (const hue of new Set(['brand', ON_INVERTED])) {
      const fill = v[`${hue}.fill`],
        on = v[`${hue}.on-fill`];
      for (const layer of [
        'on-fill-hover',
        'on-fill-pressed',
        'on-fill-selected',
      ])
        add(
          `Text auf ${hue}-Fläche über ${layer}`,
          `${hue}.on-fill / ${hue}.${layer} über ${hue}.fill`,
          on,
          over(v[`${hue}.${layer}`], fill),
          C.textMin,
        );
      add(
        `Fokus-Ring auf ${hue}-Fläche`,
        `${hue}.on-fill / ${hue}.fill`,
        on,
        fill,
        C.strokeMin,
      );
    }
    // pairs follow the recipe's step assignment, so an override is checked too
    for (const i of STATUS_INTENTS) {
      const sub = STATUS.subtle,
        str = STATUS.strong;
      add(
        `Status ${i} subtle: Text auf Fläche`,
        `${i}.${sub['content']} / ${i}.${sub['surface']}`,
        v[`${i}.${sub['content']}`],
        v[`${i}.${sub['surface']}`],
        C.textMin,
      );
      add(
        `Status ${i} strong: Text auf Füllung`,
        `${i}.${str['content']} / ${i}.${str['surface']}`,
        v[`${i}.${str['content']}`],
        v[`${i}.${str['surface']}`],
        C.textMin,
      );
    }
    for (const i of FEEDBACK_INTENTS) {
      add(
        `Feedback ${i}: Text auf Fläche`,
        `${i}.${FEEDBACK['content']} / ${i}.${FEEDBACK['surface']}`,
        v[`${i}.${FEEDBACK['content']}`],
        v[`${i}.${FEEDBACK['surface']}`],
        C.textMin,
      );
      add(
        `Feedback ${i}: Icon auf Fläche (1.4.11)`,
        `${i}.${FEEDBACK['icon']} / ${i}.${FEEDBACK['surface']}`,
        v[`${i}.${FEEDBACK['icon']}`],
        v[`${i}.${FEEDBACK['surface']}`],
        C.strokeMin,
      );
    }
    // content on every surface text may meet: pages, raised/sunken, tints,
    // feedback and status surfaces
    const textSurfaces: Record<string, string> = {
      'pole.canvas': canvas,
      'pole.paper': v['pole.paper'],
      'surface.overlay': v['pole.overlay'],
      'surface.sunken': v['pole.sunken'],
      'neutral.subtle': v['neutral.subtle'],
      'neutral.tint': v['neutral.tint'],
      [`${PRIMARY}.tint`]: v[`${PRIMARY}.tint`], // readonly / done control
    };
    for (const i of FEEDBACK_INTENTS)
      textSurfaces[`feedback.${i}.surface`] = v[`${i}.${FEEDBACK['surface']}`];
    for (const i of STATUS_INTENTS)
      textSurfaces[`status.${i}.surface.subtle`] =
        v[`${i}.${STATUS.subtle['surface']}`];
    for (const lvl of ['primary', 'secondary'])
      for (const [name, bg] of Object.entries(textSurfaces))
        add(
          `content.${lvl} auf ${name}`,
          `content.${lvl} / ${name}`,
          over(v[`content.${lvl}`], bg),
          bg,
          C.textMin,
        );
    for (const surf of ['pole.paper', 'pole.overlay', 'pole.sunken'])
      add(
        `line.strong auf ${surf} (1.4.11)`,
        `neutral.line-strong / ${surf}`,
        v['neutral.line-strong'],
        v[surf],
        C.strokeMin,
      );
    // the offset puts the ring on whatever surrounds the control, so it must
    // hold on every surface a control may sit on, not just the page
    for (const [name, bg] of Object.entries(textSurfaces))
      add(
        `Fokus-Ring auf ${name}`,
        `focus.ring / ${name}`,
        v[FOCUS_RING],
        bg,
        C.strokeMin,
      );
    // inside ring (focus.offset-inset): lies on the row's own state surface
    for (const surf of ['pole.paper', 'pole.overlay'])
      for (const st of ['state-hover', 'state-selected'])
        add(
          `Fokus-Ring innen auf Zeile ${st} über ${surf}`,
          `focus.ring / neutral.${st} über ${surf}`,
          v[FOCUS_RING],
          over(v[`neutral.${st}`], v[surf]),
          C.strokeMin,
        );
  }

  // ---------- cell contract ----------
  /**
   * The scenario checks above sample single cells; this contract derives every
   * pair a control reads from the styles — every hierarchy, every valid cell
   * except disabled (WCAG exempts it) and focus (the ring is checked above), on
   * every surface a control may sit on (`on-inverted` on its own fill).
   *   Rule 1  text and text-subtle ≥ 4.5, icon ≥ 3 against the control's own
   *           surface, composited onto the underground where it is translucent
   *           or transparent. Text in page colours next to a hue-coloured shape
   *           (checkbox label, step title) sits beside it → against the
   *           underground.
   *   Rule 2  enabled `selected` ≥ 3 against `inactive` in at least one of
   *           background, stroke, track. `readonly` + `selected` and `done` are
   *           quiet on purpose and rely on a glyph (check, dot) — allowed by
   *           rule 2; a component without a glyph must not use them. Noted,
   *           not failed.
   * The report keeps counts and failures only (model-report.json `cells`).
   */
  interface CellFail {
    mode: string;
    rule: string;
    hierarchy: string;
    cell: string;
    part: string;
    pair: string;
    ratio: number;
    min: number;
  }
  const CELL_SURFACES = [
    'pole.canvas',
    'pole.paper',
    'pole.overlay',
    'pole.sunken',
  ];
  const cellFails: CellFail[] = [];
  const cellPairs = new Set<string>();
  let cellCount = 0;
  let selectCount = 0;
  const glyphOnly = new Set<string>();
  for (const mode of MODES) {
    const v = values[mode];
    const opaque = (hex: string) =>
      hex.length === 7 || hex.toLowerCase().endsWith('ff');
    /** a ref's colour on an underground (transparent → the underground) */
    const onSurface = (ref: string, surf: string) =>
      ref === 'transparent'
        ? v[surf]
        : opaque(v[ref])
          ? v[ref].slice(0, 7)
          : over(v[ref], v[surf]);
    const pageColour = (ref: string) => /^(pole|neutral|content)\./.test(ref);
    for (const [h, def] of Object.entries(HIERARCHIES)) {
      const refOf = (part: Part, c: Cell) => {
        const r = applyTone(
          part,
          def.style(part, c),
          c,
          def.style('background', c),
        );
        return r.startsWith('hue.') ? `${def.hue}.${r.slice(4)}` : r;
      };
      const surfaces =
        def.hue === 'inverted' ? ['inverted.fill'] : CELL_SURFACES;
      const fail = (f: Omit<CellFail, 'mode' | 'hierarchy'>) =>
        cellFails.push({ mode, hierarchy: h, ...f });
      for (const c of cells) {
        if (c.avail === 'disabled' || c.inter === 'focus') continue;
        const bg = refOf('background', c);
        for (const part of ['text', 'text-subtle', 'icon'] as Part[]) {
          const fg = refOf(part, c);
          if (fg === 'transparent') continue;
          const beside =
            part !== 'icon' &&
            pageColour(fg) &&
            bg !== 'transparent' &&
            !pageColour(bg);
          const min = part === 'icon' ? C.strokeMin : C.textMin;
          for (const surf of surfaces) {
            const pair = `${fg} / ${beside ? surf : `${bg} über ${surf}`}`;
            const ratio = contrastWcag(
              onSurface(fg, surf),
              beside ? v[surf] : onSurface(bg, surf),
            );
            cellCount++;
            cellPairs.add(`${mode} ${pair} ${min}`);
            apcaNote(
              mode,
              `${h} ${key(c)} ${part}`,
              pair,
              onSurface(fg, surf),
              beside ? v[surf] : onSurface(bg, surf),
              part !== 'icon',
            );
            if (ratio < min)
              fail({
                rule: 'Inhalt',
                cell: key(c),
                part,
                pair,
                ratio: Number(ratio.toFixed(2)),
                min,
              });
          }
        }
      }
      // rule 2: selected next to inactive (idle, per availability and tone)
      for (const avail of ['enabled', 'readonly'] as Avail[])
        for (const sel of ['selected', 'done'] as Sel[])
          for (const tone of TONES) {
            const on: Cell = { avail, sel, tone, inter: 'idle' };
            const off: Cell = { ...on, sel: 'inactive' };
            for (const surf of surfaces) {
              let best = 0;
              let bestPart = '';
              for (const part of ['background', 'stroke', 'track'] as Part[]) {
                const ratio = contrastWcag(
                  onSurface(refOf(part, on), surf),
                  onSurface(refOf(part, off), surf),
                );
                if (ratio > best) {
                  best = ratio;
                  bestPart = `${part}: ${refOf(part, on)} ↔ ${refOf(part, off)} über ${surf}`;
                }
              }
              if (best >= C.strokeMin) continue;
              if (avail === 'enabled' && sel === 'selected')
                fail({
                  rule: 'Auswahl',
                  cell: key(on),
                  part: 'background|stroke|track',
                  pair: bestPart,
                  ratio: Number(best.toFixed(2)),
                  min: C.strokeMin,
                });
              else glyphOnly.add(`${h} ${key(on)}`);
            }
            if (avail === 'enabled' && sel === 'selected') selectCount++;
          }
    }
  }

  // ---------- APCA by type role (advisory) ----------
  /**
   * APCA judges text by size and weight (apca.ts `apcaTarget`). Every type step
   * gets its Lc target — a fluid step at its small end, every emphasis at its
   * own weight; body, lead and quote are body text, the rest content text.
   * Then each quiet text colour is checked against the roles the model gives
   * it: content.secondary = supporting (Hilfetext) + caption
   * (Meta); neutral.ink-subtle = label (inactive tab) + supporting (option
   * description); on-fill = label on a fill. A colour carries a step where it
   * reaches the step's target at its weakest place. Steps below APCA's
   * smallest size have no target and are listed apart.
   */
  const roleTargets = apcaRoleTargets(type);
  interface Carrier {
    mode: string;
    colour: string;
    lc: number;
    weakestOn: string;
    carries: string[];
    cannot: { name: string; target: number }[];
  }
  const apcaCarriers: Carrier[] = [];
  for (const mode of MODES) {
    const v = values[mode];
    for (const { colour, roles } of APCA_CARRIERS) {
      const places: [string, number][] =
        colour === 'on-fill'
          ? CONTROL_HUES.map((h) => [
              `${h}.fill`,
              apcaLc(v[`${h}.on-fill`], v[`${h}.fill`]),
            ])
          : CELL_SURFACES.map((surf) => {
              const fg = opaqueHex(v[colour])
                ? v[colour].slice(0, 7)
                : over(v[colour], v[surf]);
              return [surf, apcaLc(fg, v[surf])];
            });
      const [weakestOn, lc] = places.reduce((a, b) => (b[1] < a[1] ? b : a));
      const steps = roleTargets.filter(
        (r) => roles.includes(r.role) && r.target !== null,
      );
      apcaCarriers.push({
        mode,
        colour,
        lc: Number(lc.toFixed(1)),
        weakestOn,
        carries: steps.filter((r) => r.target! <= lc).map((r) => r.name),
        cannot: steps
          .filter((r) => r.target! > lc)
          .map((r) => ({ name: r.name, target: r.target! })),
      });
    }
  }
  const apcaTooSmall = roleTargets.filter((r) => r.target === null);

  // surface contract: sunken darker than its parents; in Dark the overlay must be
  // visibly lighter than paper (elevation by lightness)
  const surfaceFails: string[] = [];
  for (const mode of MODES) {
    const v = values[mode];
    // search hit visible on the surfaces hits sit on: hue AND lightness — Light
    // reads by hue (ΔE 12.5 at 1.18:1 is fine), Dark needs lightness (ΔE 16.6 at
    // 1.01:1 is not visible on a popover)
    for (const surf of ['pole.canvas', 'pole.paper', 'pole.overlay']) {
      const hit = over(v['mark.value'], v[surf]);
      const de = deltaE2000(hit, v[surf]);
      const lr = contrastWcag(hit, v[surf]);
      if (de < 10 || lr < 1.1)
        surfaceFails.push(
          `${mode}: Suchtreffer auf ${surf} kaum sichtbar (ΔE ${de.toFixed(1)}, ${lr.toFixed(2)}:1; Regel ΔE ≥ 10 und ≥ 1,1:1)`,
        );
    }
    const L = (k: string) => hexToOklch(v[k]).l;
    for (const parent of ['pole.canvas', 'pole.paper'])
      if (L('pole.sunken') >= L(parent))
        surfaceFails.push(`${mode}: sunken nicht dunkler als ${parent}`);
    if (
      mode === 'dark' &&
      deltaE2000(v['pole.overlay'], v['pole.paper']) < recipe.contract.paperMinDeltaE!
    )
      surfaceFails.push(
        `dark: overlay ↔ paper ΔE ${deltaE2000(v['pole.overlay'], v['pole.paper']).toFixed(1)} < ${recipe.contract.paperMinDeltaE}`,
      );
  }

  files['breakpoints.json'] =
    JSON.stringify(recipe.breakpoints, null, 2) + '\n';
  files['_breakpoints.scss'] =
    '// generated by @formtrieb/tokens-recipe\n$breakpoints: (\n' +
    Object.entries(recipe.breakpoints)
      .map(([k, v]) => `  ${k}: ${v}px,`)
      .join('\n') +
    '\n);\n';
  files['containers.json'] = JSON.stringify(CONTAINERS, null, 2) + '\n';
  files['_containers.scss'] =
    '// generated by @formtrieb/tokens-recipe (derived from width.column.*)\n$containers: (\n' +
    Object.entries(CONTAINERS)
      .map(([k, v]) => `  ${k}: ${v}px,`)
      .join('\n') +
    '\n);\n';
  files['model-report.json'] =
    JSON.stringify(
      {
        checks,
        cells: {
          checked: cellCount,
          pairs: cellPairs.size,
          fails: cellFails,
          glyphOnly: glyphOnly.size,
        },
        apca: {
          targets: { text: C.apcaTextLc, nonText: C.apcaNonTextLc },
          pairs: apcaSeen.size,
          below: apcaNotes,
          roles: roleTargets,
          carriers: apcaCarriers,
        },
      },
      null,
      2,
    ) + '\n';
  // Figma: text styles + prose spacing in px per mode (Figma has no em and no
  // clamp) — `mobile` = the small end of a scaling step, `desktop` = the large
  /** CSS round(nearest, x, 2px): ties go up, like CSS */
  const snap2 = (px: number) => Math.round(px / 2) * 2;
  const figmaStyles: Record<string, unknown> = {};
  const figmaSpacing: Record<string, { mobile: number; desktop: number }> = {};
  for (const t of typeSteps) {
    const def = type.roles[t.role];
    const at = (size: number) => ({
      size,
      lineHeight: lineHeight(size, t.cls),
    });
    const variants: Record<string, number> = { default: def.weight };
    for (const e of def.emphasis ?? [])
      variants[e] = emphasisWeight(def.weight, e);
    for (const [e, weight] of Object.entries(variants))
      figmaStyles[`${t.role}/${t.step}/${e}`] = {
        family: def.family ?? 'text',
        weight,
        mobile: {
          ...at(t.min ?? t.size),
          tracking: tracking(t.min ?? t.size, weight, def.case === 'uppercase'),
        },
        desktop: {
          ...at(t.size),
          tracking: tracking(t.size, weight, def.case === 'uppercase'),
        },
        ...(def.case ? { case: def.case } : {}),
        paragraphSpacing:
          def.cls === 'read'
            ? snap2((t.min ?? t.size) * type.prose['paragraph'])
            : 0,
      };
    if (t.role === 'heading')
      for (const k of ['heading-before', 'heading-after'])
        figmaSpacing[`prose/${k.replace('heading-', '')}/heading-${t.step}`] = {
          mobile: snap2((t.min ?? t.size) * type.prose[k]),
          desktop: snap2(t.size * type.prose[k]),
        };
  }
  files['type-figma.json'] =
    JSON.stringify({ styles: figmaStyles, spacing: figmaSpacing }, null, 2) +
    '\n';
  // Figma: control sizes in px per pointer mode (fein/grob) — Figma has no calc,
  // so the pill surcharge of the DEFAULT shape is already in `inline`
  const defaultShape = radius.shapes[radius.default];
  const pillOf = (f: string) =>
    defaultShape[FAMILIES[f].radius] === 'round' ? CR.pill : 0;
  const controlFigma: Record<string, unknown> = {};
  for (const s of SIZES) {
    const z = control.sizes[s];
    const at = (h: number, rowH: number) => ({
      height: h,
      rowHeight: rowH,
      icon: z.icon,
      iconAlone: iconAlone(s),
      gap: z.gap,
      gapPlain: z.gap - CR.plainGap,
      ...(s === SIZES[0]
        ? {}
        : { fieldTagRadius: tagInField(defaultShape, s) }),
      families: Object.fromEntries(
        Object.entries(FAMILIES).map(([f, def]) => {
          const step = z[def.step];
          const pad = inlinePad(s, def.ladder);
          const lh = lhOf(def.role, step);
          return [
            f,
            {
              text: `${def.role}/${step}`,
              inline: pad + pillOf(f),
              inlineIcon: pad - CR.iconSide + pillOf(f),
              block: ((f === 'row' ? rowH : h) - lh) / 2,
              // per size, not per pointer: coarse keeps the fine corner
              radius: sizeRadius(defaultShape[def.radius], z.height),
            },
          ];
        }),
      ),
    });
    const into = control.coarse.replace[s];
    controlFigma[s] = {
      fine: at(z.height, z.height),
      coarse: into ? { sameAs: into } : at(coarseHeight(s), coarseRowHeight(s)),
    };
  }
  files['control-figma.json'] =
    JSON.stringify(
      {
        sizes: controlFigma,
        target: control.target,
        shape: radius.default,
        pill: {
          amount: CR.pill,
          families: Object.fromEntries(
            Object.keys(FAMILIES).map((f) => [f, pillOf(f)]),
          ),
        },
        note: 'inline/inlineIcon from the OUTER edge; Figma strokes sit inside without layout space, so no border subtraction there',
      },
      null,
      2,
    ) + '\n';
  // Figma: motion per character (prototype animations take ms + bezier; a
  // spring is listed by its parameters — Figma's custom spring is physical)
  files['motion-figma.json'] =
    JSON.stringify(
      {
        character: motion.character,
        characters: Object.fromEntries(
          CHARACTERS.map((c) => {
            const ch = motion.characters[c];
            return [
              c,
              {
                curves: ch.curves,
                ...(ch.spring ? { spring: ch.spring } : {}),
                roles: Object.fromEntries(
                  Object.entries(MOTION_ROLES).map(([role, def]) => [
                    role,
                    {
                      duration: ch.durations[role],
                      ...(def.curve ? { easing: def.curve } : {}),
                      ...(def.spatial
                        ? {
                            moveEasing:
                              def.springy && ch.spring ? 'spring' : def.curve,
                          }
                        : {}),
                      ...(def.size
                        ? {
                            distance: ch.distance[def.size],
                            scale: ch.scale[def.size] ?? 1,
                          }
                        : {}),
                      reduced: def.reduced,
                    },
                  ]),
                ),
              },
            ];
          }),
        ),
        layer,
      },
      null,
      2,
    ) + '\n';
  const fails = checks.filter((c) => !c.ok);
  // ladder contract (ramp.ts): every recipe ramp, not only the semantic hues
  const ladder = checkContract(recipe, ramps);
  const ladderFails = ladder.filter((f) => !f.ok);
  log.push(
    `Leiter-Vertrag: ${ladder.length - ladderFails.length}/${ladder.length} ok (${recipe.hues.length} Ramps × ${MODES.length} Modes)`,
  );
  for (const f of ladderFails)
    log.push(
      `  ✗ ${f.mode} ${f.hue} ${f.rule}: ${f.value.toFixed(2)} (${f.detail})`,
    );
  log.push(
    `model.css: ${ctl.length} Control-Tokens (${Object.keys(HIERARCHIES).length} Hierarchien × ${cells.length} Zellen × ${PARTS.length} Parts), Auswahl je Mode ${Object.keys(values['light']).length}`,
  );
  log.push(
    `Kontrast-Checks: ${checks.length - fails.length}/${checks.length} ok`,
  );
  for (const f of fails)
    log.push(`  ✗ ${f.mode} ${f.rule}: ${f.ratio} < ${f.min} (${f.pair})`);
  log.push(
    `Zell-Vertrag: ${cellPairs.size} Farbpaare aus ${cellCount} Zell-Prüfungen, Auswahl in ${selectCount} Zellen, Vertrag ${cellFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of cellFails)
    log.push(
      `  ✗ ${f.mode} ${f.rule} ${f.hierarchy} ${f.cell} ${f.part}: ${f.ratio} < ${f.min} (${f.pair})`,
    );
  if (glyphOnly.size)
    log.push(
      `  · ${glyphOnly.size} Zellen (readonly selected, done) nur über ein Zeichen unterscheidbar — Komponente zeigt Haken oder Punkt`,
    );
  {
    const per = (m: string) => apcaNotes.filter((n) => n.mode === m).length;
    const worst = [...apcaNotes].sort(
      (a, b) => a.lc / a.target - b.lc / b.target,
    )[0];
    log.push(
      `APCA (Hinweis, kein Gate): ${apcaNotes.length}/${apcaSeen.size} Paare unter Lc-Ziel (Text ${C.apcaTextLc} · Nicht-Text ${C.apcaNonTextLc}) — light ${per('light')} · dark ${per('dark')}`,
    );
    if (worst)
      log.push(
        `  · schwächstes: ${worst.mode} ${worst.pair} Lc ${worst.lc} < ${worst.target} (${worst.where})`,
      );
    const targets = roleTargets.flatMap((r) => (r.target ? [r.target] : []));
    log.push(
      `APCA je Typo-Rolle (Hinweis): ${roleTargets.length} Stufen mit Betonung, Ziele Lc ${Math.min(...targets)}–${Math.max(...targets)}; ${apcaTooSmall.length} unter APCA-Mindestgröße (${[...new Set(apcaTooSmall.map((r) => `${r.size} px`))].join(', ')})`,
    );
    for (const c of apcaCarriers)
      log.push(
        `  · ${c.mode} ${c.colour} Lc ${c.lc} (${c.weakestOn}): trägt ${c.carries.length}/${c.carries.length + c.cannot.length}${c.cannot.length ? ` — nicht: ${c.cannot.map((x) => `${x.name} (${x.target})`).join(', ')}` : ''}`,
      );
  }
  log.push(
    `Raster: ${space.scale.length} Stufen, ${Object.keys(SPACE_ROLES).length} Abstands-Rollen, Vertrag ${spaceFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of spaceFails) log.push(`  ✗ ${f}`);
  log.push(
    `Breiten: Leiter ${columnLadder.join(' · ')}, Grenzen ${Object.entries(
      CONTAINERS,
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}, Vertrag ${widthFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of widthFails) log.push(`  ✗ ${f}`);
  log.push(
    `Typo: ${Object.keys(type.roles).length} Rollen, ${typeSteps.length} Stufen, Skalierung ${strategy}, Vertrag ${typeFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of typeFails) log.push(`  ✗ ${f}`);
  log.push(
    `Radius: ${ROLES.length + 1} Rollen, Formen ${Object.keys(radius.shapes).join(' · ')}, Vertrag ${radiusFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of radiusFails) log.push(`  ✗ ${f}`);
  log.push(
    `Controls: ${SIZES.length} Größen × ${Object.keys(FAMILIES).length} Familien, ${controlTokens.length} Tokens + ${coarseTokens.length} grob, ${Object.keys(control.badge).length} Badge-Größen, Vertrag ${controlFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of controlFails) log.push(`  ✗ ${f}`);
  log.push(`Flächen-Vertrag: ${surfaceFails.length ? 'verletzt' : 'ok'}`);
  for (const f of surfaceFails) log.push(`  ✗ ${f}`);
  log.push(
    `Ebenen: layer.sticky ${layer.sticky} · chrome ${layer.chrome}, elevation.sticky × ${STICKY_EDGES.length} Kanten, Vertrag ${layerFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of layerFails) log.push(`  ✗ ${f}`);
  log.push(
    `Bewegung: ${Object.keys(MOTION_ROLES).length} Rollen × ${CHARACTERS.length} Charaktere (Standard ${motion.character}), Skala ${motion.scale.length} Dauern, Vertrag ${motionFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of motionFails) log.push(`  ✗ ${f}`);
  log.push(
    `Datenvisualisierung: ${viz.categorical.length} Kategorien + other, ${viz.sequential.light.length} sequenziell, divergierend 2 × ${viz.diverging.arm.light.length * 2 + 1}, ${vizNames.length} Farb-Tokens, Vertrag ${vizFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of vizFails) log.push(`  ✗ ${f}`);
  for (const f of vizNotes) log.push(`  · ${f}`);
  log.push(
    `Icons: ${Object.keys(recipe.icon!.text).length} Text-Paare, Spot ${Object.values(recipe.icon!.spot).join(' · ')}, Vertrag ${iconFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of iconFails) log.push(`  ✗ ${f}`);
  log.push(
    `Avatare: ${Object.entries(recipe.avatar!.sizes)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')} (ohne Coarse-Sprung)`,
  );
  log.push(
    `Hochkontrast: ${forcedTokens.length} Umlegungen auf Systemfarben, Vertrag ${forcedFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of forcedFails) log.push(`  ✗ ${f}`);
  log.push(
    `Kennfarben: ${identNames.length - 1} + neutral, strong/subtle, Vertrag ${identFails.length ? 'verletzt' : 'ok'}`,
  );
  for (const f of identFails) log.push(`  ✗ ${f}`);
  for (const f of identNotes) log.push(`  · ${f}`);
  // ---------- DTCG: Tokens-Studio tree + token-map from the register ----------
  const dtcg = emitDtcg(register, {
    prefix: P,
    defaults: { motion: motion.character, shape: radius.default },
  });
  Object.assign(files, dtcg.files);
  log.push(dtcg.summary);
  // render table (shaped like @formtrieb/tokens-render): which theme lands
  // under which selector or media query. The theme ids are the ones emitDtcg
  // wrote; later blocks win on equal specificity.
  const REDUCED = '(prefers-reduced-motion: reduce)';
  const ROOT = `[${attr('mode')}]`;
  const motionSel = (c: string) => `[${attr('motion')}="${c}"]`;
  const reducedHook = `[${attr('reduced-motion')}]`;
  const rule = (theme: string, selector: string, media?: string): RenderRule => ({
    theme,
    selector,
    ...(media ? { media } : {}),
    references: true,
    file: 'model.css',
  });
  const output = renderOptions(P);
  const render: RenderTable = {
    options: output,
    rules: [
      ...MODES.map((m) =>
        rule(
          THEME.mode(MODE_ATTR[m]),
          `[${attr('mode')}="${MODE_ATTR[m]}"]`,
        ),
      ),
      rule(THEME.base, ROOT),
      rule(THEME.rtl, `[dir="rtl"] ${ROOT}, ${ROOT}[dir="rtl"]`),
      ...otherCharacters.map((c) => rule(THEME.motion(c), motionSel(c))),
      // reduced motion: the real switch, then a test hook for previews
      rule(THEME.reduced(motion.character), ROOT, REDUCED),
      ...otherCharacters.map((c) =>
        rule(THEME.reduced(c), motionSel(c), REDUCED),
      ),
      rule(THEME.reduced(motion.character), `${ROOT}${reducedHook}`),
      ...otherCharacters.map((c) =>
        rule(THEME.reduced(c), `${motionSel(c)}${reducedHook}`),
      ),
      rule(THEME.forced, ROOT, '(forced-colors: active)'),
      rule(THEME.coarse, ROOT, '(pointer: coarse)'),
      ...(typeStepOverrides.length
        ? [rule(THEME.xl, ROOT, `(min-width: ${bpTo}px)`)]
        : []),
      ...Object.keys(radius.shapes)
        .filter((n) => n !== radius.default)
        .map((n) => rule(THEME.shape(n), `[${attr('shape')}="${n}"]`)),
    ],
  };
  files['render.json'] = JSON.stringify(render, null, 2) + '\n';
  // model.css (and any other file the table names) from @formtrieb/tokens-render
  for (const [file, text] of renderVariables(
    tokenSystem(files),
    render.rules,
    output,
  ))
    files[file] = text;
  return { files, log, recipe };
}

/** the generated tree (`tokens/$metadata.json`, `tokens/$themes.json`, `tokens/<Set>.json`) as a TokenSystem */
export function tokenSystem(files: Record<string, string>): TokenSystem {
  const order: string[] = JSON.parse(
    files['tokens/$metadata.json'],
  ).tokenSetOrder;
  const sets = new Map<string, Record<string, unknown>>(
    order.map((s) => [s, JSON.parse(files[`tokens/${s}.json`])]),
  );
  const themes = parseThemes(JSON.parse(files['tokens/$themes.json']));
  return { order, sets, themes };
}

/**
 * The model's render options, written to render.json and used for model.css:
 * lengths and colours as the recipe wrote them (px, em, ch; hex, system
 * colours) and no typography companions — the model carries tracking, case
 * and numerals as tokens of its own (`-tracking`, `-case`, `-numeric`). The
 * policy is written out, so the CSS does not depend on who renders the tree.
 */
export function renderOptions(prefix: string): RenderFileOptions & { prefix: string } {
  return { prefix, units: 'source', color: 'source', typographyCompanions: false };
}
