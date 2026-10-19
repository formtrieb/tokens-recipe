/**
 * The switch thumb is the cell's indicator: off reads `stroke`, on reads
 * `icon` (style solid). In forced colours the thumb is a surface the browser
 * would turn into Canvas, so solid's unselected stroke is CanvasText there.
 */
import { describe, expect, it } from 'vitest';
import { generateModel } from '../src/index.js';
import { loadRecipe } from './fixture.js';

const out = generateModel(loadRecipe());
const forced = JSON.parse(out.files['tokens/Contrast/Forced.json']).ctl;

describe('switch thumb in forced colours', () => {
  it('reads CanvasText for an unselected solid stroke, enabled and readonly', () => {
    for (const h of ['brand', 'primary', 'destructive']) {
      expect(forced[h].stroke['inactive-idle'].$value).toBe('CanvasText');
      expect(forced[h].stroke['inactive-negative-hover'].$value).toBe('CanvasText');
      expect(forced[h].stroke['readonly-inactive-idle'].$value).toBe('CanvasText');
    }
    // disabled stays GrayText, the on state stays Highlight (track) and HighlightText (thumb)
    expect(forced.primary.stroke['disabled-inactive-idle'].$value).toBe('GrayText');
    expect(forced.primary.icon['selected-idle'].$value).toBe('HighlightText');
  });

  it('leaves the other styles alone: no stroke where they draw none', () => {
    for (const h of ['secondary', 'tertiary', 'destructive-subtle', 'on-inverted'])
      expect(forced[h]?.stroke?.['inactive-idle']).toBeUndefined();
    expect(out.log.find((l) => l.startsWith('Hochkontrast'))).toMatch(/Vertrag ok$/);
  });
});
