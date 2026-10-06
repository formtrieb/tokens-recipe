/**
 * Contrast as the reader sees it: the rendered text colour, faded by every
 * `opacity` between it and its backdrop, composited onto that backdrop. The
 * colour maths is core's; this module only reads the computed styles.
 */
import { alphaOf, composite, contrastWcag, withAlpha } from '@formtrieb/tokens-core';

/** every step unrounded: a chain of 8-bit steps drifts from what is painted */
const EXACT = { format: 'srgb' } as const;

/** the next element towards the page, across a shadow root */
const parentOf = (el: Element): Element | null =>
  el.parentElement ?? ((el.parentNode as ShadowRoot | null)?.host ?? null);

/**
 * an element's text colour and its backdrop: its own and its ancestors'
 * backgrounds down to the first opaque one, on white. `undefined` when a
 * computed colour cannot be read.
 *
 * `opacity` fades the text only. A layer between text and backdrop that has
 * both a translucent background and an opacity below 1 would also fade its
 * own background; that is not modelled — the gallery has no such layer, and
 * the lab measured the same way.
 */
export function seen(el: Element): { fg: string; bg: string } | undefined {
  try {
    const layers: string[] = [];
    let fade = 1;
    for (let n: Element | null = el; n; n = parentOf(n)) {
      const style = getComputedStyle(n);
      // an empty value is no background at all
      const background = style.backgroundColor || 'transparent';
      const alpha = alphaOf(background);
      if (alpha > 0) {
        layers.push(background);
        if (alpha >= 1) break;
      }
      fade *= Number(style.opacity || 1);
    }
    const bg = layers.reduceRight((below, c) => composite(c, below, EXACT), '#ffffff');
    const fg = getComputedStyle(el).color;
    return { fg: composite(withAlpha(fg, alphaOf(fg) * fade, EXACT), bg, EXACT), bg };
  } catch {
    return undefined;
  }
}

/**
 * Writes a badge on every `[data-contrast]` element under `root`: the WCAG
 * ratio as rendered, `✗` below `min`. No verdict on `[data-contrast-exempt]`
 * (disabled) and under simulated forced colours, where the real mode puts a
 * Canvas backplate behind every text.
 */
export function measure(root: ParentNode, host: Element, min: number): void {
  const forced = !!host.closest('[data-sim-forced-colors]');
  for (const el of root.querySelectorAll<HTMLElement>('[data-contrast]')) {
    const pair = seen(el);
    if (!pair) continue;
    const ratio = contrastWcag(pair.fg, pair.bg);
    const judged = !forced && !el.hasAttribute('data-contrast-exempt');
    const fail = judged && ratio < min;
    el.setAttribute('data-ratio', (fail ? '✗ ' : '') + ratio.toFixed(1));
    el.toggleAttribute('data-ratio-fail', fail);
    el.title = `Contrast ${ratio.toFixed(2)} : 1${
      judged
        ? ` (floor ${min})`
        : forced
          ? ' (forced colours: text on a Canvas backplate, no verdict)'
          : ' (disabled, no verdict)'
    }`;
  }
}
