/**
 * Ramps from a compact recipe: hue + chroma scale per colour, one lightness
 * ladder + one chroma curve per mode. Every ramp is checked against a step
 * contract (contrast rules) in both modes. Also the recipe's types.
 *
 * No I/O in here.
 */
import {
  contrastWcag,
  deltaE2000,
  hexToOklch,
  isInSrgbGamut,
  oklchToHex,
} from '@formtrieb/tokens-core';

export type Mode = 'light' | 'dark';

export interface HueDef {
  name: string;
  /** OKLCH hue in degrees. */
  hue: number;
  /** 0..1 — multiplied onto chromaMax * chromaCurve[step]. Ignored when an anchor pins the hue. */
  chromaScale: number;
  /**
   * Optional fixed colour the ramp must pass through exactly, per mode
   * (e.g. the brand colour at step 9). Pins the hue and derives the chroma
   * scale so that step reproduces the hex; the ladder still shapes the rest.
   */
  anchor?: Partial<Record<Mode, { step: number; hex: string }>>;
}

export interface ModeDef {
  /** OKLCH lightness 0..1 per step (index 0 = step 1). */
  lightness: number[];
  /** 0..1 per step — shape of the chroma along the ladder. */
  chromaCurve: number[];
}

export interface Contract {
  textSteps: number[];
  surfaceSteps: number[];
  /** text contrast — the generator checks every text pair against it (WCAG floor 4.5) */
  textMin: number;
  strokeStep: number;
  /** non-text contrast: strokes, icons, focus ring, selection (WCAG 1.4.11 floor 3) */
  strokeMin: number;
  /** surface step 2 must stay visible on the paper pole (a card), in every mode */
  paperMinDeltaE?: number;
  solidStep: number;
  /** text on the solid step (`on-fill` on `fill`, WCAG floor 4.5) */
  solidMin: number;
  /** minimum |ΔL| between adjacent steps. */
  minDeltaL: number;
  /*
   * DS thresholds, standard in defaults.json. `textMin`, `strokeMin`,
   * `solidMin` and `readingCh` have WCAG floors (4.5 · 3 · 4.5 · ≤ 80 ch):
   * the recipe may tighten them, never go below.
   */
  /** smallest font size in px (WCAG sets none; caption, badge) */
  typeMinPx?: number;
  /** reading width range in ch (`width.reading` must sit inside) */
  readingCh?: [number, number];
  /** longest UI transition in ms (loops and delays excepted) */
  motionMaxMs?: number;
  /** strong identity fills apart for normal vision (ΔE × 100) */
  identityMinDeltaE?: number;
  /** every pair of legend colours apart for normal vision (ΔE × 100) */
  legendMinDeltaE?: number;
  /**
   * APCA targets (Lc) for the advisory second lens — never a gate. 75 = the
   * minimum for body-size text, 45 = non-text (APCA-W3 bronze guidance).
   */
  apcaTextLc?: number;
  apcaNonTextLc?: number;
}

/**
 * Mode-dependent constants that sit outside the ramps: e.g. pure white/black
 * for paper and ink in Light while Dark stays near the neutral ramp.
 */
export interface Poles {
  ink: string;
  inkInverted: string;
  paper: string;
  canvas: string;
  /** popover, menu, dialog — in Dark lighter than paper (elevation by lightness) */
  overlay?: string;
  /** well inside a surface (filter bar, code) — darker than its parent in both modes */
  sunken?: string;
  /** backdrop behind a modal (hex8) */
  scrim?: string;
}

/** one chart colour: ramp `hue` at a step per mode */
export interface VizSlot {
  hue: string;
  light: number;
  dark: number;
}

export interface Recipe {
  /** always 12 — one per entry of STEP_NAMES */
  steps: number;
  poles: Record<Mode, Poles>;
  /** content on `fill` per mode: a fixed colour, or 'auto' = higher contrast of white/black */
  onFill?: Record<Mode, string>;
  /**
   * Foundation alpha ladder per mode (same length in every mode). The
   * mode-free Auswahl picks a step number; the value may differ per mode
   * (content.secondary is stronger in Dark).
   */
  alpha: Record<Mode, number[]>;
  /**
   * Size grid: `base` (px) and the Foundation scale, named by value. Contract:
   * below `base` whole pixels (hairline 1, 2), up to 2 × base half steps,
   * above that multiples of `base`.
   */
  space: { base: number; scale: number[] };
  /**
   * Breakpoints (px, min-width). Media and container queries cannot read CSS
   * variables, so these go out as JSON + SCSS map as well — one source for
   * Figma, SCSS and JS.
   */
  breakpoints: Record<string, number>;
  /**
   * Shadows per mode and elevation level (box-shadow strings). Light conveys
   * elevation by shadow, Dark mainly by lighter surfaces (poles) — its shadows
   * are darker but barely visible.
   */
  elevation?: Record<Mode, Record<string, string>>;
  /**
   * Search hit (`<mark>`) per mode: [ramp step name, alpha] of `hue`. Light can
   * stay opaque (all surfaces are near white); Dark needs a translucent, light
   * source so the hit is lighter than any surface it lands on (popover, card).
   */
  mark?: { hue: string } & Record<
    Mode,
    Record<'surface' | 'current', [string, number]>
  >;
  /**
   * z-index for the document only: everything floating
   * lives in the browser's top layer, components isolate their internals.
   * `sticky` table head, save bar · `panel` non-modal surface over the
   * content, under the frame (side panel, inspector) · `chrome` app frame.
   */
  layer?: { sticky: number; panel: number; chrome: number };
  /**
   * Motion. `character` picks the set emitted on
   * `[data-mode]`; the others go under `[data-motion="…"]` — only to check
   * them, not a mode. Per character: three curves (cubic-bezier points), an
   * optional spring (only for position/size), one duration per role in ms
   * (0 = instant), travel per overlay size and the scale of large overlays.
   * Durations must sit in `scale` (Foundation).
   */
  motion?: {
    character: string;
    scale: number[];
    characters: Record<
      string,
      {
        curves: Record<
          'standard' | 'enter' | 'exit',
          [number, number, number, number]
        >;
        spring?: { damping: number; settle: number; points: number };
        durations: Record<string, number>;
        distance: Record<'sm' | 'md' | 'lg', number>;
        scale: Partial<Record<'sm' | 'md' | 'lg', number>>;
      }
    >;
    reduced: { loopFactor: number };
  };
  /**
   * Corner radius per role. `round` = fully round (pill/circle). A shape is a
   * set of role values; `default` is emitted on `[data-mode-x]`, the others
   * under `[data-shape-x="…"]` — only to check that every shape works, not a
   * decision for a Shape mode (one product, no Shape mode).
   * `sizeRatio`: a control's corner grows with its size — at most this share
   * of the control height, rounded down onto the Foundation scale, capped by
   * the role (the role value is the large-size value); round stays round.
   */
  radius?: {
    default: string;
    shapes: Record<string, Record<string, number | 'round'>>;
    sizeRatio?: number;
  };
  /**
   * Typography: font stacks, one size scale, five line-height classes and
   * the roles with their steps. Line height = size × class factor, rounded to
   * 2 px (an exact tie goes to the 4px grid). A step is a size, or
   * {size, min?, cls?} — `min` makes it scale between the breakpoints named
   * in `scaling` (strategy fluid | steps | fixed — names never change).
   */
  type?: {
    families: Record<string, string>;
    scale: number[];
    classes: Record<string, number>;
    scaling: {
      strategy: 'fluid' | 'steps' | 'fixed';
      from: string;
      to: string;
    };
    /** emphasis weights: subtle = fixed weight, strong = default + step (capped) */
    emphasis: { subtle: number; strongStep: number; max: number };
    /**
     * Letter spacing as a rule, not per role: a curve by size (anchors
     * [px, em], linear between, flat outside — a property of the FONT), plus
     * a bonus for bold small text (weight ≥ from: +amount at `at` px, fading
     * to 0 at `until`), plus a fixed bonus for uppercase.
     */
    tracking: {
      anchors: [number, number][];
      weightBonus: { from: number; amount: number; at: number; until: number };
      uppercase: number;
    };
    /** prose rhythm in em of the element it sits on (paragraph on p, heading-* on the heading) */
    prose: Record<string, number>;
    /** inline features in em of the surrounding text */
    inline: Record<string, number>;
    roles: Record<
      string,
      {
        cls: string;
        family?: string;
        weight: number;
        case?: string;
        numeric?: boolean;
        /** emphasis variants besides `default` (semantic: quieter / louder) */
        emphasis?: ('subtle' | 'strong')[];
        steps: Record<
          string,
          number | { size: number; min?: number; cls?: string }
        >;
      }
    >;
  };
  /**
   * Control sizes as a two-tier bundle. Per
   * size: height (a MIN height — controls grow when text wraps or is
   * enlarged), icon, text steps (`label` for action/chip, `read` = value/
   * option step for field/row), gap and the content-family padding. Rules:
   * action padding = height / 2 − actionInset; icon side = padding −
   * iconSide; pill + pill; controls without a surface gap − plainGap; icon
   * alone = next icon step, rand ≥ aloneRand. Coarse pointer: every height
   * moves up `stepUp` sizes (the largest extends the ladder), sizes in
   * `replace` become another size entirely; rows grow to ≥ target.coarse.
   * Badges are below xs and not interactive (no target).
   */
  control?: {
    sizes: Record<
      string,
      {
        height: number;
        icon: number;
        label: string;
        read: string;
        gap: number;
        content: number;
      }
    >;
    icons: number[];
    rules: {
      actionInset: number;
      iconSide: number;
      pill: number;
      plainGap: number;
      aloneRand: number;
    };
    target: { fine: number; coarse: number };
    coarse: { stepUp: number; replace: Record<string, string> };
    badge: Record<string, { height: number; text: string }>;
    /** status dot without text (unread, presence) */
    badgeDot?: number;
  };
  /**
   * Data visualisation. Own list, not the
   * UI hues by purpose: `categorical` in fixed order (ramp step per mode),
   * `other` for everything past the list; `sequential` = classes of one hue,
   * steps per mode (the Dark ladder is denser in the middle); `diverging` =
   * two offers (neutral: above/below, rated: better/worse) on the same arm
   * steps with a grey midpoint; `marks` in px (Foundation scale).
   */
  dataviz?: {
    categorical: VizSlot[];
    other: VizSlot;
    sequential: { hue: string } & Record<Mode, number[]>;
    diverging: {
      neutral: { low: string; high: string };
      rated: { low: string; high: string };
      arm: Record<Mode, number[]>;
      mid: VizSlot;
    };
    marks: { line: number; gap: number; marker: number };
  };
  /**
   * Icons outside controls. `text`: icon size next to
   * text of a font size (px → px) — the same pairing the controls use; a
   * text step gets `-icon` from it (sizes above the table: no icon token).
   * `spot`: standalone icons without text (empty state, feature, onboarding).
   */
  icon?: { text: Record<string, number>; spot: Record<string, number> };
  /**
   * Avatars: spot sizes without text (px, on the size scale). No coarse
   * step — an avatar is no hit target; an avatar that is a button takes the
   * control height, not its own.
   */
  avatar?: { sizes: Record<string, number> };
  /**
   * The link underline: typography of the inline text, so it sits next to
   * `type.inline`. `offset` in em of the text; the thicknesses name a
   * `border.width` key, so the underline follows the DS's strokes.
   * `thicknessHover` serves hover and pressed (a link has no pressed
   * surface of its own). The colour comes from the text.
   */
  link?: {
    underline: {
      offset: number;
      thickness: 'default' | 'strong';
      thicknessHover: 'default' | 'strong';
    };
  };
  /**
   * Identity colours: mark someone or something
   * without meaning — avatars without a photo, user labels. Fixed list of
   * ramp hues (order = hash order), steps like the status chip: `strong` =
   * fill + on-fill, `subtle` = light surface + ink + dot. `neutral` is added.
   */
  identity?: {
    hues: string[];
    strong: { surface: number };
    subtle: { surface: number; content: number; indicator: number };
  };
  /**
   * Semantic hue → recipe ramp (`positive` → `green`). The names are the same
   * in every DS; which ramp shows them is the DS's choice.
   */
  semanticHues?: Record<string, string>;
  /**
   * Emphasis levels of all controls: a semantic hue (or `inverted`) and a
   * style from the generator's library (`solid`, `outline`, `ghost`,
   * `outline-hue`, `ghost-on-fill`). Names are universal, every one is set.
   */
  hierarchies?: Record<string, { hue: string; style: string }>;
  /**
   * Space roles in px, each on the `space.scale`.
   *   gap.tight    label ↔ field, title ↔ description
   *   gap.related  button row, radios, data rows
   *   gap.group    field ↔ field, cards in a grid
   *   gap.section  cards of a page, header ↔ content
   *   gap.region   parts of a content page
   *   inset.container          card, dialog
   *   inset.container-compact  alert, popover, dense card
   *   inset.list               container ↔ its rows: menu, listbox, dropdown list,
   *                            command palette — rows keep their own hover surface
   *   inset.page
   */
  spaceRoles?: {
    gap: Record<string, number>;
    inset: Record<string, number>;
  };
  /**
   * Stroke widths in px: `default` field, card, divider, hairline · `strong`
   * selected card, active tab indicator, emphasis.
   */
  border?: { width: Record<string, number> };
  /**
   * Focus indicator: `ring` = an Auswahl name (`pole.ink`, `accent.fill`),
   * width and offset in px (WCAG 2.4.7 / 2.4.13: ≥ 2px, ≥ 3:1 against every
   * surface — the contract checks the ring on all of them).
   */
  focus?: { ring: string; width: number; offset: number };
  /**
   * Width roles as CSS lengths. `main` the working area of an app page (was `page`)
   * (title column + content; a side/profile column comes on top) ·
   * `column.sm|md|lg` the column ladder (title column / field min ·
   * side column / field max · narrow column = content min) · `reading`
   * prose (~65–70 characters) · `form` single-column form, login ·
   * `dialog.*` · `drawer` side panel · `popover.min|max` · `tooltip` max ·
   * `navigation.expanded|collapsed`. A value `{column.lg}` references another
   * width role (emitted as `var()`), so roles that are one column stay one.
   */
  width?: Record<string, string | Record<string, string>>;
  /**
   * Which alpha step (1-based, recipe `alpha`) each translucent Auswahl entry
   * reads: state layers, the elevated edge, layers on a fill, text emphasis.
   * Standard in defaults.json.
   */
  alphaSteps?: Record<string, number>;
  /**
   * Status role (chip, badge, status tile) per emphasis and part → step name
   * of the intent's hue. Standard in defaults.json.
   */
  status?: Record<'strong' | 'subtle', Record<string, string>>;
  /** Feedback role (alert, message at a field) per part → step name. Standard in defaults.json. */
  feedback?: Record<string, string>;
  /** OKLCH chroma ceiling (≈0.0–0.37 in sRGB). */
  chromaMax: number;
  hues: HueDef[];
  modes: Record<Mode, ModeDef>;
  contract: Contract;
}

export interface Swatch {
  step: number;
  /** OKLCH of the written colour (after gamut mapping) */
  l: number;
  c: number;
  h: number;
  /** the chroma the ladder asked for */
  requestedC: number;
  hex: string;
  /** the ladder asked for a colour outside sRGB; `hex` is its gamut-mapped stand-in */
  clamped: boolean;
  /** true when this step is pinned by a hue anchor. */
  anchored: boolean;
}

export type Ramps = Record<Mode, Record<string, Swatch[]>>;

export const MODES: Mode[] = ['light', 'dark'];

/**
 * The names of the ramp steps, in order. They are the recipe's shared
 * vocabulary: every design system has exactly these steps; what a recipe
 * chooses is their values.
 */
export const STEP_NAMES = [
  'canvas',
  'subtle',
  'tint',
  'tint-hover',
  'tint-pressed',
  'line-subtle',
  'line',
  'line-strong',
  'fill',
  'fill-hover',
  'ink-subtle',
  'ink',
] as const;

export function buildRamps(r: Recipe): Ramps {
  const out: Ramps = { light: {}, dark: {} };
  for (const mode of MODES) {
    const m = r.modes[mode];
    for (const hue of r.hues) {
      const anchor = hue.anchor?.[mode];
      const anchorOk = anchor ? hexToOklch(anchor.hex) : undefined;
      const h = anchorOk?.h ?? hue.hue;
      const scale =
        anchor && anchorOk
          ? (anchorOk.c ?? 0) /
            (r.chromaMax * (m.chromaCurve[anchor.step - 1] || 1))
          : hue.chromaScale;
      out[mode][hue.name] = Array.from({ length: r.steps }, (_, i) => {
        const pinned = !!anchor && anchorOk && i === anchor.step - 1;
        const requestedC = pinned
          ? (anchorOk.c ?? 0)
          : r.chromaMax * (m.chromaCurve[i] ?? 0) * scale;
        const want = {
          l: pinned ? anchorOk.l : m.lightness[i],
          c: requestedC,
          h,
        };
        // Gamut mapping as CSS Color 4 §13 specifies it, from core, so one
        // OKLCH value gives one colour across the tools: reduce OKLCH chroma
        // until the clipped colour is within a just-noticeable difference
        // (ΔEOK 0.02), then clip. It keeps more chroma than a pure chroma
        // clamp and lets lightness and hue move a little; the step contract
        // checks the result.
        const hex = pinned
          ? anchor.hex.toLowerCase()
          : oklchToHex(want.l, want.c, want.h);
        const got = pinned ? want : hexToOklch(hex);
        return {
          step: i + 1,
          l: got.l,
          c: got.c ?? 0,
          h: got.h ?? h,
          requestedC,
          hex,
          clamped:
            !pinned && !isInSrgbGamut(`oklch(${want.l} ${want.c} ${want.h})`),
          anchored: !!pinned,
        };
      });
    }
  }
  return out;
}

export interface Finding {
  mode: Mode;
  hue: string;
  rule: string;
  step: number;
  /** the other step of a step pair (text on surface, stroke on surface) */
  against?: number;
  ok: boolean;
  value: number;
  detail: string;
}

export function checkContract(r: Recipe, ramps: Ramps): Finding[] {
  const f: Finding[] = [];
  const C = r.contract;
  for (const mode of MODES) {
    // ladder shape is per mode, not per hue
    const L = r.modes[mode].lightness;
    const bad: string[] = [];
    for (let i = 1; i < r.steps; i++) {
      const d = L[i] - L[i - 1];
      const dirOk = mode === 'light' ? d < 0 : d > 0;
      if (!dirOk || Math.abs(d) < C.minDeltaL)
        bad.push(`${i}→${i + 1} (ΔL ${d.toFixed(3)})`);
    }
    f.push({
      mode,
      hue: '*',
      rule: 'Leiter monoton, |ΔL| ≥ ' + C.minDeltaL,
      step: 0,
      ok: bad.length === 0,
      value: bad.length,
      detail: bad.length ? bad.join(', ') : 'ok',
    });

    for (const hue of r.hues) {
      const s = ramps[mode][hue.name];
      const at = (n: number) => s[n - 1].hex;
      for (const t of C.textSteps) {
        for (const b of C.surfaceSteps) {
          const v = contrastWcag(at(t), at(b));
          f.push({
            mode,
            hue: hue.name,
            rule: `Text ${t} auf ${b}`,
            step: t,
            against: b,
            ok: v >= C.textMin,
            value: v,
            detail: `≥ ${C.textMin}`,
          });
        }
      }
      const sv = contrastWcag(at(C.strokeStep), at(C.surfaceSteps[0]));
      f.push({
        mode,
        hue: hue.name,
        rule: `Stroke ${C.strokeStep} auf ${C.surfaceSteps[0]}`,
        step: C.strokeStep,
        against: C.surfaceSteps[0],
        ok: sv >= C.strokeMin,
        value: sv,
        detail: `≥ ${C.strokeMin}`,
      });
      // the poles are not ladder steps: a card (paper) can sit inside the dark ladder
      const paper = r.poles[mode].paper;
      const sp = contrastWcag(at(C.strokeStep), paper);
      f.push({
        mode,
        hue: hue.name,
        rule: `Stroke ${C.strokeStep} auf Karte`,
        step: C.strokeStep,
        ok: sp >= C.strokeMin,
        value: sp,
        detail: `≥ ${C.strokeMin}`,
      });
      if (C.paperMinDeltaE !== undefined) {
        const d = deltaE2000(at(2), paper);
        f.push({
          mode,
          hue: hue.name,
          rule: 'Fläche 2 auf Karte sichtbar',
          step: 2,
          ok: d >= C.paperMinDeltaE,
          value: d,
          detail: `ΔE ≥ ${C.paperMinDeltaE}`,
        });
      }
      const w = contrastWcag('#ffffff', at(C.solidStep));
      const k = contrastWcag('#000000', at(C.solidStep));
      const v = Math.max(w, k);
      f.push({
        mode,
        hue: hue.name,
        rule: `Text-on-color auf ${C.solidStep}`,
        step: C.solidStep,
        ok: v >= C.solidMin,
        value: v,
        detail: (w >= k ? 'weiß' : 'schwarz') + ` ≥ ${C.solidMin}`,
      });
    }
  }
  return f;
}

/** (hue, step) pairs an existing token set references, per mode — for `coverage`. */
export interface UsageEntry {
  hue: string;
  step: number;
  count: number;
}

/** hue → an existing system's resolved hex values, index = step-1. */
export type CurrentRamps = Record<string, string[]>;

export interface CoverageRow {
  mode: Mode;
  hue: string;
  todayStep: number;
  count: number;
  todayHex: string;
  nearestStep: number;
  nearestHex: string;
  deltaE: number;
}

/**
 * How closely the recipe reproduces an existing system: for every colour that
 * system uses, the nearest step of the recipe ramp of the same hue (ΔE),
 * worst first. A migration aid, not part of the model.
 */
export function coverage(
  ramps: Ramps,
  mode: Mode,
  usage: UsageEntry[],
  current: CurrentRamps,
): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const u of usage) {
    const todayHex = current[u.hue]?.[u.step - 1];
    const ramp = ramps[mode][u.hue];
    if (!todayHex || !ramp) continue;
    let best = ramp[0];
    let bestD = Infinity;
    for (const s of ramp) {
      const d = deltaE2000(todayHex, s.hex);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    rows.push({
      mode,
      hue: u.hue,
      todayStep: u.step,
      count: u.count,
      todayHex,
      nearestStep: best.step,
      nearestHex: best.hex,
      deltaE: bestD,
    });
  }
  return rows.sort((a, b) => b.deltaE - a.deltaE);
}
