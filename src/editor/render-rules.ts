/**
 * The preview's view of a render table. Both functions read render rules
 * only, never a recipe: what a host previews comes from the table.
 */
import type { RenderRule } from '@formtrieb/tokens-render';
import type { Simulate, ToggleSpec, ToggleSpecs } from './index.js';

/**
 * A media rule whose theme the table also offers as an attribute rule goes;
 * every other media rule becomes an attribute twin on the same selector —
 * `(pointer: coarse)` → `[data-sim-pointer="coarse"]` — so the overlay
 * toggles decide, not the device.
 */
export const simulate: Simulate = (rules) => {
  const byAttr = new Set(rules.filter((r) => !r.media).map((r) => r.theme));
  return rules.flatMap((r): RenderRule[] => {
    if (!r.media) return [r];
    if (byAttr.has(r.theme)) return [];
    const m = /^\(([a-z-]+):\s*([a-z-]+)\)$/.exec(r.media);
    if (!m) return [r];
    const attr = `[data-sim-${m[1]}="${m[2]}"]`;
    const selector = r.selector
      .split(',')
      .map((part) => part.trim() + attr)
      .join(', ');
    return [{ theme: r.theme, selector, references: r.references, file: r.file }];
  });
};

/** Every attribute the rules select on, except the mode; one value is a checkbox, several a choice. */
export const toggleSpecs: ToggleSpecs = (rules, { attributeSuffix }) => {
  const mode = `data-mode${attributeSuffix}`;
  const found = new Map<string, Set<string>>();
  for (const r of rules)
    for (const [, attr, v] of r.selector.matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/g)) {
      if (attr === mode) continue;
      found.set(attr, (found.get(attr) ?? new Set()).add(v ?? ''));
    }
  const label = (attribute: string) => {
    const name = attribute.replace(/^data-(sim-)?/, '');
    return attributeSuffix && name.endsWith(attributeSuffix) ? name.slice(0, -attributeSuffix.length) : name;
  };
  return [...found].map(([attribute, values]): ToggleSpec => ({ attribute, label: label(attribute), values: [...values] }));
};
