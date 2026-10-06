/**
 * The editor's state without a framework and without the DOM: the recipe,
 * its two runs, the history, the file state and the preview controls. The
 * panel draws it; tests drive it with their own clock.
 *
 * Two runs: the quick one (parse, ramps, ladder contract, a few ms) follows
 * every edit; the full one (model and CSS, ~85 ms) runs on a copy, at once
 * for the first edit, then at most every MODEL_EVERY ms, and always once
 * more at the end. The last good run stays while the recipe is invalid.
 */
import { renderVariables, type RenderFileOptions, type RenderRule } from '@formtrieb/tokens-render';
import { generateModel, tokenSystem, type GenerateOptions, type ModelOutput } from '../model.js';
import { buildRamps, checkContract, MODES, type Finding, type Mode, type Ramps, type Recipe } from '../ramp.js';
import { overlay, parseRecipe, RecipeError, type RecipeIssue } from '../recipe.js';
import type { PanelMode, RecipeDoc } from './index.js';
import { simulate } from './render-rules.js';
import type { FieldChange, Path } from './schema-form.js';

/** while a control moves, the full model runs at most this often (ms); a last run always follows */
export const MODEL_EVERY = 200;
/** edits closer together than this (ms) are one undo step — a drag, a typed number */
export const STEP_PAUSE = 600;

/** the cheap part of a run: it follows every step of a drag */
export interface Quick {
  recipe: Recipe;
  ramps: Ramps;
  findings: Finding[];
}

/** a failed pair or check from model-report.json */
export interface ReportFail {
  mode: string;
  rule: string;
  pair: string;
  ratio: number;
  min: number;
  ok?: boolean;
  hierarchy?: string;
  cell?: string;
}

/** the full run: the model and the CSS the preview reads */
export interface Run extends Quick {
  out: ModelOutput;
  /** every file of the simulated render table, concatenated */
  css: string;
  /** the render table as the preview reads it (media rules as attribute twins) */
  rules: RenderRule[];
  report: { checks: ReportFail[]; cells: { fails: ReportFail[] } };
}

export interface Failure {
  error: string;
  /** a RecipeError's issues, for the form */
  issues?: RecipeIssue[];
}

export interface Clock {
  now(): number;
  later(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
}

const SYSTEM_CLOCK: Clock = {
  now: () => performance.now(),
  later: (fn, ms) => setTimeout(fn, ms),
  cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const failure = (e: unknown): Failure => ({
  error: e instanceof Error ? e.message : String(e),
  issues: e instanceof RecipeError ? e.issues : undefined,
});

export function quickRun(doc: RecipeDoc, defaults: RecipeDoc): Quick {
  const recipe = parseRecipe(overlay(defaults, doc));
  const ramps = buildRamps(recipe);
  return { recipe, ramps, findings: checkContract(recipe, ramps) };
}

export function fullRun(doc: RecipeDoc, defaults: RecipeDoc, generate: GenerateOptions): Run {
  const quick = quickRun(doc, defaults);
  const out = generateModel(quick.recipe, generate);
  const table: { options: RenderFileOptions & { prefix: string }; rules: RenderRule[] } = JSON.parse(out.files['render.json']);
  const rules = simulate(table.rules);
  const css = [...renderVariables(tokenSystem(out.files), rules, table.options).values()].join('\n');
  return { ...quick, out, css, rules, report: JSON.parse(out.files['model-report.json']) };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface StoreOptions {
  recipe: RecipeDoc;
  defaults: RecipeDoc;
  generate?: GenerateOptions;
  clock?: Clock;
}

export class EditorStore {
  readonly defaults: RecipeDoc;
  readonly generate: GenerateOptions;
  private readonly clock: Clock;

  /** the design system's recipe, the only edited state */
  recipe: RecipeDoc;
  /** the recipe the full run last ran on — `recipe`, throttled */
  modelRecipe: RecipeDoc;
  /** what the file holds; "before" shows it, `dirty` compares with it */
  saved: RecipeDoc;
  quick?: Quick;
  private quickFailure?: Failure;
  run?: Run;
  private runFailure?: Failure;
  /** the last run that succeeded — the preview keeps it on an invalid recipe */
  lastGood?: Run;

  mode: Mode = 'light';
  /** overlay attributes by name (`''` = boolean, absent = off) */
  overlays: Record<string, string> = {};
  /** "before" is held: the preview shows the saved state */
  comparing = false;
  private savedRun?: { of: RecipeDoc; run?: Run };

  past: RecipeDoc[] = [];
  future: RecipeDoc[] = [];
  /** the state the history last saw, and when it changed (0 = the next edit is a new step) */
  private current: RecipeDoc;
  private lastEdit = 0;
  private dragging = false;

  private timer: unknown;
  private lastRun = -Infinity;
  private readonly listeners = new Set<() => void>();

  constructor(options: StoreOptions) {
    this.defaults = options.defaults;
    this.generate = options.generate ?? {};
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.recipe = this.saved = this.current = this.modelRecipe = options.recipe;
    this.runQuick();
    this.runFull(this.recipe);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify() {
    for (const l of this.listeners) l();
  }

  /** the preview is behind the recipe */
  get pending(): boolean {
    return this.modelRecipe !== this.recipe;
  }
  get dirty(): boolean {
    return !same(this.recipe, this.saved);
  }
  get error(): string | undefined {
    return this.quickFailure?.error ?? this.runFailure?.error;
  }
  /** where the recipe is wrong: schema first, then the generator's names and floors */
  get issues(): RecipeIssue[] {
    return this.quickFailure?.issues ?? this.runFailure?.issues ?? [];
  }
  /** what the preview shows: the saved state while "before" is held, else the last good run */
  get shown(): Run | undefined {
    if (!this.comparing) return this.lastGood;
    if (this.savedRun?.of !== this.saved) {
      let run: Run | undefined;
      try {
        run = fullRun(this.saved, this.defaults, this.generate);
      } catch {
        run = undefined;
      }
      this.savedRun = { of: this.saved, run };
    }
    return this.savedRun.run ?? this.lastGood;
  }
  get panelMode(): PanelMode {
    return this.mode === 'light' ? 'Light' : 'Dark';
  }

  /** an edit: one history step unless it follows the last one within a gesture or STEP_PAUSE */
  edit(doc: RecipeDoc) {
    if (doc === this.recipe) return;
    const now = this.clock.now();
    const newStep = this.lastEdit === 0 || (!this.dragging && now - this.lastEdit > STEP_PAUSE);
    if (newStep) this.past = [...this.past, this.current];
    this.future = [];
    this.current = doc;
    this.lastEdit = now;
    this.set(doc);
  }

  /** a recipe from elsewhere (file, link): a new history; `saved` is what "before" shows */
  load(doc: RecipeDoc, saved?: RecipeDoc) {
    if (saved) this.saved = saved;
    this.current = doc;
    this.past = [];
    this.future = [];
    this.lastEdit = 0;
    this.set(doc);
  }

  undo() {
    const prev = this.past.at(-1);
    if (!prev) return;
    this.future = [this.current, ...this.future];
    this.past = this.past.slice(0, -1);
    this.restore(prev);
  }
  redo() {
    const [next, ...rest] = this.future;
    if (!next) return;
    this.past = [...this.past, this.current];
    this.future = rest;
    this.restore(next);
  }
  /** a pointer gesture is one undo step, however long it moves */
  startGesture() {
    this.dragging = true;
    this.lastEdit = 0;
  }
  endGesture() {
    this.dragging = false;
    this.lastEdit = 0;
  }

  reset() {
    this.edit(structuredClone(this.saved));
  }
  /** the file now holds the current recipe */
  markSaved() {
    this.saved = this.recipe;
    this.notify();
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.notify();
  }
  setOverlay(attribute: string, value: string | undefined) {
    const next = { ...this.overlays };
    if (value === undefined) delete next[attribute];
    else next[attribute] = value;
    this.overlays = next;
    this.notify();
  }
  setComparing(on: boolean) {
    if (on === this.comparing) return;
    this.comparing = on;
    this.notify();
  }

  /**
   * One field changed: write it at its path into the recipe. A missing
   * container on the way is copied from the default first, so an edit inside
   * a default array or object overrides exactly that value. `undefined`
   * removes the key and prunes the containers it leaves empty.
   */
  patchField({ path, value }: FieldChange) {
    const d = structuredClone(this.recipe);
    const baseAt = (p: Path) =>
      p.reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), this.defaults);
    const nodes: Record<string, unknown>[] = [d];
    let node: Record<string, unknown> = d;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (node[k] === undefined || typeof node[k] !== 'object') {
        const fromBase = baseAt(path.slice(0, i + 1));
        node[k] = fromBase !== undefined ? structuredClone(fromBase) : typeof path[i + 1] === 'number' ? [] : {};
      }
      node = node[k] as Record<string, unknown>;
      nodes.push(node);
    }
    const last = path[path.length - 1];
    if (value === undefined) {
      if (Array.isArray(node)) node.splice(last as number, 1);
      else delete node[last];
      for (let i = nodes.length - 1; i > 0; i--)
        if (!Array.isArray(nodes[i]) && Object.keys(nodes[i]).length === 0) delete nodes[i - 1][path[i - 1]];
    } else node[last] = value;
    this.edit(d);
  }

  /** the JSON view's text as the recipe; text that is no JSON shows as a schema error */
  applyJson(text: string) {
    try {
      this.edit(JSON.parse(text));
    } catch (e) {
      this.edit({ ...this.recipe, $invalidJson: String(e) });
    }
  }

  destroy() {
    this.clock.cancel(this.timer);
    this.listeners.clear();
  }

  /** a state from the history, not recorded as an edit */
  private restore(doc: RecipeDoc) {
    this.current = doc;
    this.lastEdit = 0;
    this.set(doc);
  }

  private set(doc: RecipeDoc) {
    this.recipe = doc;
    this.runQuick();
    this.schedule(doc);
    this.notify();
  }

  private runQuick() {
    try {
      this.quick = quickRun(this.recipe, this.defaults);
      this.quickFailure = undefined;
    } catch (e) {
      this.quick = undefined;
      this.quickFailure = failure(e);
    }
  }

  /** the first change runs the model at once; changes within MODEL_EVERY wait for one last run */
  private schedule(doc: RecipeDoc) {
    this.clock.cancel(this.timer);
    const wait = MODEL_EVERY - (this.clock.now() - this.lastRun);
    if (wait <= 0) this.runFull(doc);
    else
      this.timer = this.clock.later(() => {
        this.runFull(doc);
        this.notify();
      }, wait);
  }

  private runFull(doc: RecipeDoc) {
    this.lastRun = this.clock.now();
    this.modelRecipe = doc;
    try {
      this.run = fullRun(doc, this.defaults, this.generate);
      this.runFailure = undefined;
      this.lastGood = this.run;
    } catch (e) {
      this.run = undefined;
      this.runFailure = failure(e);
    }
  }
}

/**
 * Failures by kind, both modes: control cells (one per mode × hierarchy ×
 * cell, however many pairs fail there), scenario checks, ramp rules, and the
 * other contracts that only exist as log lines. `''` when all hold.
 */
export function failSummary(r: Run): string {
  const cellFails = r.report.cells.fails;
  const cells = new Set(cellFails.map((f) => `${f.mode}|${f.hierarchy}|${f.cell}`)).size;
  const checks = r.report.checks.filter((c) => !c.ok).length;
  const ramp = r.findings.filter((f) => !f.ok).length;
  // the log carries one ✗ line per ramp finding, check and cell pair
  const other = r.out.log.filter((l) => l.includes('✗')).length - ramp - checks - cellFails.length;
  return (
    [
      [cells, 'cells'],
      [checks, 'checks'],
      [ramp, 'ramp rules'],
      [other, 'more'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(' · ');
}

/** per mode: ladder index → why its step from the one before breaks the contract */
export function ladderFails(q: Quick): Record<Mode, Map<number, string>> {
  const min = q.recipe.contract.minDeltaL;
  const out = {} as Record<Mode, Map<number, string>>;
  for (const mode of MODES) {
    const m = new Map<number, string>();
    const L = q.recipe.modes[mode].lightness;
    for (let i = 1; i < L.length; i++) {
      const d = L[i] - L[i - 1];
      if ((mode === 'light' ? d < 0 : d > 0) && Math.abs(d) >= min) continue;
      m.set(i, `✗ ${i}→${i + 1}: ΔL ${d.toFixed(3)} (${mode === 'light' ? 'falling' : 'rising'}, |ΔL| ≥ ${min})`);
    }
    out[mode] = m;
  }
  return out;
}

/** dotted keys of the defaults: the ones the recipe overrides (with both values) and the ones it inherits */
export function defaultsDiff(recipe: RecipeDoc, defaults: RecipeDoc) {
  const flat = (o: unknown, at = '', out: Record<string, unknown> = {}) => {
    if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, `${at}${k}.`, out);
    else out[at.slice(0, -1)] = o;
    return out;
  };
  const base = flat(defaults);
  const mine = flat(recipe);
  const rows = Object.entries(base).map(([key, b]) => ({
    key,
    base: JSON.stringify(b),
    value: key in mine && !same(mine[key], b) ? JSON.stringify(mine[key]) : undefined,
  }));
  return { overrides: rows.filter((r) => r.value !== undefined), inherited: rows.filter((r) => r.value === undefined) };
}
