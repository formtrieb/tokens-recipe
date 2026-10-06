// @vitest-environment happy-dom
import { contrastWcag } from '@formtrieb/tokens-core';
import { describe, expect, it } from 'vitest';
import { measure, seen } from '../src/editor/contrast.js';

/** a text on a half-black layer over white, itself at half opacity */
function scene(forced = false) {
  const page = document.createElement('div');
  page.style.backgroundColor = 'rgb(255, 255, 255)';
  if (forced) page.setAttribute('data-sim-forced-colors', 'active');
  const layer = document.createElement('div');
  layer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  layer.style.opacity = '0.5';
  const text = document.createElement('span');
  text.style.color = 'rgb(0, 0, 0)';
  text.setAttribute('data-contrast', '');
  layer.append(text);
  page.append(layer);
  document.body.replaceChildren(page);
  return { page, text };
}

describe('contrast as rendered', () => {
  it('composites the backdrop down to the first opaque layer and fades the text by opacity, unrounded', () => {
    const { text } = scene();
    const pair = seen(text)!;
    // backdrop: half black over white = 0.5 grey; text: black at 0.5 over that = 0.25 grey
    expect(contrastWcag(pair.bg, 'color(srgb 0.5 0.5 0.5)')).toBe(1);
    expect(contrastWcag(pair.fg, 'color(srgb 0.25 0.25 0.25)')).toBe(1);
  });

  it('badges the ratio, ✗ below the floor, and judges nothing under simulated forced colours', () => {
    const ratio = contrastWcag('color(srgb 0.25 0.25 0.25)', 'color(srgb 0.5 0.5 0.5)');
    let { page, text } = scene();
    measure(page, page, 4.5);
    expect(text.getAttribute('data-ratio')).toBe(`✗ ${ratio.toFixed(1)}`);
    expect(text.hasAttribute('data-ratio-fail')).toBe(true);
    ({ page, text } = scene(true));
    measure(page, page, 4.5);
    expect(text.getAttribute('data-ratio')).toBe(ratio.toFixed(1));
    expect(text.title).toContain('no verdict');
  });
});
