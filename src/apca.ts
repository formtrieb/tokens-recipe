/**
 * APCA lightness contrast (Lc) — a second lens next to WCAG 2. Advisory only: WCAG 2.1 AA is the binding
 * measure (BITV 2.0 / EN 301 549), APCA is no standard. Same math as APCA-W3
 * 0.0.98G (Myndex; colorjs.io `contrastAPCA`): sRGB with a plain 2.4 gamma,
 * soft clamp near black, polarity-aware (dark on light ≠ light on dark).
 */

import type { Recipe } from './ramp.js';

const normBG = 0.56;
const normTXT = 0.57;
const revTXT = 0.62;
const revBG = 0.65;
const blkThrs = 0.022;
const blkClmp = 1.414;
const loClip = 0.1;
const deltaYmin = 0.0005;
const scale = 1.14;
const loOffset = 0.027;

/** screen luminance of an opaque #rrggbb */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(
    (i) => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.4,
  );
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  return y >= blkThrs ? y : y + (blkThrs - y) ** blkClmp;
};

/** |Lc| of `text` on `background`, both opaque hex (0 … ~108) */
export function apcaLc(text: string, background: string): number {
  const yt = luminance(text);
  const yb = luminance(background);
  if (Math.abs(yb - yt) < deltaYmin) return 0;
  const c =
    yb > yt
      ? (yb ** normBG - yt ** normTXT) * scale
      : (yb ** revBG - yt ** revTXT) * scale;
  if (Math.abs(c) < loClip) return 0;
  return Math.abs(c > 0 ? c - loOffset : c + loOffset) * 100;
}

/**
 * Lc target for text by use, size and weight — APCA-W3 "APCA in a Nutshell"
 * (git.apcacontrast.com/documentation/APCA_in_a_Nutshell, read 2026-10-02):
 *   Lc 90  body text ≥ 18px/300 · 14px/400 (preferred for body)
 *   Lc 75  body text minimum ≥ 24px/300 · 18px/400 · 16px/500 · 14px/700
 *   Lc 60  content text that is not body ≥ 48px/200 · 36/300 · 24/400 ·
 *          21/500 · 18/600 · 16/700
 *   Lc 45  larger, heavier text ≥ 36px/400 · 24px/700 (headlines)
 * A higher level allows smaller text, so the target is the lowest level whose
 * minimum size the text meets. A weight between table entries reads the next
 * lighter entry (conservative). Below every minimum → null: APCA has no level
 * for that size.
 */
const MIN_SIZE: Record<number, Record<number, number>> = {
  90: { 300: 18, 400: 14 },
  75: { 300: 24, 400: 18, 500: 16, 700: 14 },
  60: { 200: 48, 300: 36, 400: 24, 500: 21, 600: 18, 700: 16 },
  45: { 400: 36, 700: 24 },
};
const minSize = (level: number, weight: number) => {
  const ws = Object.keys(MIN_SIZE[level])
    .map(Number)
    .filter((w) => w <= weight);
  return ws.length ? MIN_SIZE[level][Math.max(...ws)] : Infinity;
};
export type ApcaUse = 'body' | 'content';
export function apcaTarget(
  use: ApcaUse,
  sizePx: number,
  weight: number,
): number | null {
  const levels = use === 'body' ? [75, 90] : [45, 60, 75, 90];
  return levels.find((l) => sizePx >= minSize(l, weight)) ?? null;
}

/** one type step (with emphasis) and its Lc target; null = below APCA's sizes */
export interface ApcaRoleTarget {
  name: string;
  role: string;
  size: number;
  weight: number;
  target: number | null;
}
/** body, lead and quote are body text (columns); every other role is content text */
const APCA_BODY = new Set(['body', 'lead', 'quote']);
/**
 * Lc target of every type step: a fluid step at its small end, every emphasis
 * at its own weight (subtle = fixed weight, strong = default + step, capped).
 */
export function apcaRoleTargets(type: NonNullable<Recipe['type']>) {
  const weightOf = (base: number, e: 'subtle' | 'strong') =>
    e === 'subtle'
      ? type.emphasis.subtle
      : Math.min(base + type.emphasis.strongStep, type.emphasis.max);
  return Object.entries(type.roles).flatMap(([role, def]) =>
    Object.entries(def.steps).flatMap(([step, v]) => {
      const size =
        typeof v === 'number' ? v : Math.min(v.size, v.min ?? v.size);
      const weights: [string, number][] = [
        ['', def.weight],
        ...(def.emphasis ?? []).map(
          (e) => [`-${e}`, weightOf(def.weight, e)] as [string, number],
        ),
      ];
      return weights.map(([suffix, weight]): ApcaRoleTarget => ({
        name: `${role}.${step}${suffix}`,
        role,
        size,
        weight,
        target: apcaTarget(
          APCA_BODY.has(role) ? 'body' : 'content',
          size,
          weight,
        ),
      }));
    }),
  );
}

/**
 * Which roles the quiet text colours carry in the model:
 * content.secondary = supporting (Hilfetext) + caption (Meta);
 * neutral.ink-subtle = label (inactive tab) + supporting (option description);
 * on-fill = label on a fill.
 */
export const APCA_CARRIERS = [
  { colour: 'content.secondary', roles: ['supporting', 'caption'] },
  { colour: 'neutral.ink-subtle', roles: ['label', 'supporting'] },
  { colour: 'on-fill', roles: ['label'] },
];
