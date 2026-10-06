/**
 * What every receiver does with a state: the CSS into a `<style>`, the mode
 * and the overlays as attributes on every root. A host with pages of its own
 * needs nothing else; it never waits for a handshake.
 */
import type { ApplyState, ApplyTarget, PanelState } from './index.js';

/** per target: the attributes it set last time, so the next state can remove what it no longer has */
const applied = new WeakMap<HTMLStyleElement, Set<string>>();

export const applyState: ApplyState = (target: ApplyTarget, state: PanelState) => {
  if (target.style.textContent !== state.css) target.style.textContent = state.css;
  const next = new Map<string, string>(Object.entries(state.overlays));
  // the render table selects mode and overlays on the same element
  next.set(`data-mode${state.attributeSuffix}`, state.mode);
  const before = applied.get(target.style) ?? new Set<string>();
  for (const root of target.roots) {
    for (const name of before) if (!next.has(name)) root.removeAttribute(name);
    for (const [name, value] of next) if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }
  applied.set(target.style, new Set(next.keys()));
};
