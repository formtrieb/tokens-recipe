/**
 * The recipe without a file system: the defaults overlay and the schema
 * check. The CLI reads the files; an editor can call this in the browser.
 */
import type { Recipe } from './ramp.js';
import { z } from 'zod';
import { RecipeSchema } from './recipe.schema.js';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** one problem at a place in the recipe (path [] = the recipe as a whole) */
export interface RecipeIssue {
  path: string[];
  message: string;
}
/**
 * a recipe that cannot be generated: the lines as before — "path: message"
 * or "path fehlt" — plus each line's path, so an editor can show it at the
 * field. Schema (zod) and generator (names, floors) both throw it.
 */
export class RecipeError extends Error {
  readonly issues: RecipeIssue[];
  /** `issues` when the caller knows the paths (zod); else read from the lines */
  constructor(lines: string[], issues?: RecipeIssue[]) {
    super(`Rezept fehlerhaft:\n  ${lines.join('\n  ')}`);
    this.name = 'RecipeError';
    this.issues =
      issues ??
      lines.map((line) => {
        const m = /^([\w$-]+(?:\.[\w$-]+)*)(?::\s*|\s+)([\s\S]*)$/.exec(line);
        return m
          ? { path: m[1].split('.'), message: m[2] }
          : { path: [], message: line };
      });
  }
}

/** objects merge key by key; arrays and values replace the default whole */
export function overlay(base: unknown, over: unknown): unknown {
  if (!isObject(base) || !isObject(over))
    return over === undefined ? base : over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = overlay(base[k], v);
  return out;
}

/** a recipe object (defaults already applied) checked against the schema */
export function parseRecipe(merged: unknown): Recipe {
  // German messages for this parse only — no global z.config, so a host
  // app's own zod setup stays untouched; the schema's own messages win
  const r = RecipeSchema.safeParse(merged, {
    error: z.locales.de().localeError,
  });
  if (!r.success)
    throw new RecipeError(
      r.error.issues.map(
        (i) => `${i.path.map(String).join('.') || '(Wurzel)'}: ${i.message}`,
      ),
      r.error.issues.map((i) => ({
        path: i.path.map(String),
        message: i.message,
      })),
    );
  const recipe: Recipe = r.data;
  return recipe;
}
