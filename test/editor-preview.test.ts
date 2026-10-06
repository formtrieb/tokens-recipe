// @vitest-environment happy-dom
import type { RenderRule } from '@formtrieb/tokens-render';
import { describe, expect, it, vi } from 'vitest';
import { applyState } from '../src/editor/apply.js';
import { connectFrame, receiveState } from '../src/editor/frame.js';
import type { PanelState } from '../src/editor/index.js';
import { simulate, toggleSpecs } from '../src/editor/render-rules.js';

const rule = (theme: string, selector: string, media?: string): RenderRule => ({ theme, selector, references: true, file: 'm.css', ...(media ? { media } : {}) });
const RULES = [
  rule('Mode/Light', '[data-mode-x="Light"]'),
  rule('Motion/Reduced', '[data-mode-x][data-reduced-motion-x]'),
  rule('Motion/Reduced', '[data-mode-x]', '(prefers-reduced-motion: reduce)'),
  rule('Forced/On', '[data-mode-x]', '(forced-colors: active)'),
  rule('Shape/Square', '[data-shape-x="square"]'),
  rule('Shape/Pill', '[data-shape-x="pill"]'),
];
const state = (over: Partial<PanelState> = {}): PanelState => ({ css: ':root{}', mode: 'Light', overlays: {}, attributeSuffix: '-x', pending: false, ...over });

describe('render rules for the preview', () => {
  it('drops a media rule the table also offers by attribute, and twins the others', () => {
    const out = simulate(RULES);
    expect(out.some((r) => r.media)).toBe(false);
    expect(out.find((r) => r.theme === 'Forced/On')!.selector).toBe('[data-mode-x][data-sim-forced-colors="active"]');
    expect(out.filter((r) => r.theme === 'Motion/Reduced')).toHaveLength(1);
  });

  it('lists every attribute but the mode, with its values and a label without the suffix', () => {
    expect(toggleSpecs(simulate(RULES), { attributeSuffix: '-x' })).toEqual([
      { attribute: 'data-reduced-motion-x', label: 'reduced-motion', values: [''] },
      { attribute: 'data-sim-forced-colors', label: 'forced-colors', values: ['active'] },
      { attribute: 'data-shape-x', label: 'shape', values: ['square', 'pill'] },
    ]);
  });
});

describe('applyState', () => {
  it('sets the mode on every root and removes an overlay the next state no longer has', () => {
    const style = document.createElement('style');
    const roots = [document.createElement('div'), document.createElement('div')];
    applyState({ style, roots }, state({ overlays: { 'data-shape-x': 'square', 'data-sim-forced-colors': 'active' } }));
    for (const r of roots) expect(r.getAttribute('data-shape-x')).toBe('square');
    applyState({ style, roots }, state({ mode: 'Dark', overlays: { 'data-sim-forced-colors': 'active' }, css: ':root{--x:1}' }));
    for (const r of roots) {
      expect(r.hasAttribute('data-shape-x')).toBe(false);
      expect(r.getAttribute('data-mode-x')).toBe('Dark');
      expect(r.getAttribute('data-sim-forced-colors')).toBe('active');
    }
    expect(style.textContent).toBe(':root{--x:1}');
  });
});

describe('iframe protocol', () => {
  const ORIGIN = 'https://preview.example';
  function frame() {
    const posted: { message: unknown; origin: string }[] = [];
    const contentWindow = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
    return { frame: { contentWindow } as unknown as HTMLIFrameElement, posted, contentWindow };
  }
  const fromFrame = (source: unknown, data: unknown, origin = ORIGIN) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));

  it('waits for ready from the right origin and window, then sends the latest state', () => {
    const { frame: f, posted, contentWindow } = frame();
    const link = connectFrame(f, { origin: ORIGIN });
    link.send(state());
    expect(posted).toHaveLength(0);
    fromFrame(contentWindow, { type: 'tokens-recipe:ready', v: 1 }, 'https://evil.example');
    fromFrame({}, { type: 'tokens-recipe:ready', v: 1 });
    expect(posted).toHaveLength(0);
    fromFrame(contentWindow, { type: 'tokens-recipe:ready', v: 1 });
    expect(posted).toEqual([{ message: { type: 'tokens-recipe:state', v: 1, state: state() }, origin: ORIGIN }]);
    link.close();
  });

  it('sends a run only when it is new', () => {
    const { frame: f, posted, contentWindow } = frame();
    const link = connectFrame(f, { origin: ORIGIN });
    fromFrame(contentWindow, { type: 'tokens-recipe:ready', v: 1 });
    const run = { files: {}, log: [] } as unknown as PanelState['run'];
    link.send(state({ run }));
    link.send(state({ run, mode: 'Dark' }));
    const [first, second] = posted.map((p) => p.message as { state: PanelState; keepRun?: true });
    expect(first.state.run).toBe(run);
    expect(second.keepRun).toBe(true);
    expect(second.state.run).toBeUndefined();
    link.close();
  });

  it('refuses a missing or wildcard origin', () => {
    expect(() => connectFrame(frame().frame, { origin: '*' as never })).toThrow(/exact origin/);
    expect(() => receiveState(() => {}, { origin: '' })).toThrow(/exact origin/);
  });

  it('receives: says ready to the parent, keeps the run across keepRun, ignores other origins', () => {
    const toParent = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const got: PanelState[] = [];
    const stop = receiveState((s) => got.push(s), { origin: ORIGIN });
    expect(toParent).toHaveBeenCalledWith({ type: 'tokens-recipe:ready', v: 1 }, ORIGIN);
    const run = { files: {}, log: [] } as unknown as PanelState['run'];
    fromFrame(window.parent, { type: 'tokens-recipe:state', v: 1, state: state({ run }) });
    fromFrame(window.parent, { type: 'tokens-recipe:state', v: 1, state: state({ mode: 'Dark' }), keepRun: true });
    fromFrame(window.parent, { type: 'tokens-recipe:state', v: 1, state: state() }, 'https://evil.example');
    expect(got).toHaveLength(2);
    expect(got[1].run).toBe(run);
    expect(got[1].mode).toBe('Dark');
    stop();
    toParent.mockRestore();
  });
});
