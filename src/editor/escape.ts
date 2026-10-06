/**
 * The editor builds HTML as strings, and a recipe may come from a shared
 * link — someone else's input. Every text taken from a recipe or a report
 * goes through `html()` before it reaches markup; every name that becomes
 * part of a CSS variable name goes through `ident()`.
 */
import { kebab } from '@formtrieb/tokens-render';

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** text for an HTML text node or a quoted attribute value */
export const html = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** what a kebab-cased name may hold: lowercase letters, digits, single hyphens */
const IDENT = /^[\p{Ll}\p{Lo}\d]+(?:-[\p{Ll}\p{Lo}\d]+)*$/u;

/**
 * a name as a segment of a CSS variable name, cased as the renderer writes it
 * (`Display 1` → `display-1`); `undefined` when nothing safe is left
 */
export function ident(name: string): string | undefined {
  const out = kebab(name);
  return IDENT.test(out) ? out : undefined;
}

/**
 * `var(--{prefix}{a}-{b}…)` for a token path, or `undefined` when a segment
 * is no safe name — the caller leaves that declaration out
 */
export function cssVar(prefix: string, ...path: string[]): string | undefined {
  const segments = path.map(ident);
  if (!/^[a-z0-9-]*$/.test(prefix) || segments.some((s) => s === undefined)) return undefined;
  return `var(--${prefix}${segments.join('-')})`;
}
