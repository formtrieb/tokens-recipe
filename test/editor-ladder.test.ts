// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountLadderCurve, type LadderChange } from '../src/editor/ladder-curve.js';

function setup() {
  const el = document.createElement('div');
  document.body.append(el);
  const changes: LadderChange[] = [];
  const curve = mountLadderCurve(el, { label: '<b>Neutral</b>', step: 0.01, onChange: (c) => changes.push(c) });
  const view = { values: { light: [0.9, 0.5, 0.2], dark: [0.1, 0.4, 0.8] }, active: 'light', breaks: { dark: [2] } };
  curve.update(view);
  return { el, curve, view, changes, root: el.shadowRoot! };
}

describe('ladder curve', () => {
  it('draws one point per step and mode, the active curve last, breaks red', () => {
    const { root } = setup();
    expect(root.querySelectorAll('circle.pt')).toHaveLength(6);
    const groups = root.querySelectorAll<SVGGElement>('g[data-mode]');
    expect(groups[groups.length - 1].dataset.mode).toBe('light');
    expect(root.querySelectorAll('g[data-mode="dark"] .break')).toHaveLength(1);
    expect(root.querySelector('g[data-mode="dark"] circle[data-index="2"]')!.classList.contains('fail')).toBe(true);
    expect(root.querySelector('b')).toBeNull();
  });

  it('steps with the arrow keys from the value it sent last', () => {
    const { root, changes } = setup();
    const pt = root.querySelector<SVGCircleElement>('g[data-mode="light"] circle[data-index="1"]')!;
    pt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    pt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    pt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
    expect(changes).toEqual([
      { mode: 'light', index: 1, value: 0.51 },
      { mode: 'light', index: 1, value: 0.52 },
      { mode: 'light', index: 1, value: 0.42 },
    ]);
  });

  it('patches values in place, so a dragged point stays the same node', () => {
    const { root, curve, view } = setup();
    const pt = root.querySelector('g[data-mode="light"] circle[data-index="1"]');
    const before = pt!.getAttribute('cy');
    curve.update({ ...view, values: { ...view.values, light: [0.9, 0.7, 0.2] } });
    const after = root.querySelector('g[data-mode="light"] circle[data-index="1"]');
    expect(after).toBe(pt);
    expect(after!.getAttribute('cy')).not.toBe(before);
    curve.update({ ...view, values: { ...view.values, light: [0.9, 0.7] } });
    expect(root.querySelector('g[data-mode="light"] circle[data-index="1"]')).not.toBe(pt);
  });
});
