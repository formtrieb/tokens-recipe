/**
 * The recipe panel: form, colours, JSON, report, file and link — and no
 * preview. It hands out a PanelState; a receiver (the gallery, a host's own
 * pages, a page in an iframe) shows it.
 *
 * Everything is built from DOM nodes; data reaches the page only as
 * `textContent`, `value` or an attribute. Inputs that move with a pointer
 * are patched in place, tabs are kept when hidden, so a drag, a caret or an
 * open section survives every update.
 */
import { z } from 'zod';
import { MODES, type Mode, type Recipe } from '../ramp.js';
import { RecipeSchema } from '../recipe.schema.js';
import { recipeDefaults } from '../index.js';
import type { MountRecipePanel, PanelOptions, PanelState, RecipeDoc, RecipePanel } from './index.js';
import { mountLadderCurve, type LadderCurve } from './ladder-curve.js';
import { toggleSpecs } from './render-rules.js';
import { hits, mountSchemaForm, settled, type JsonSchema, type SchemaForm } from './schema-form.js';
import { defaultsDiff, EditorStore, failSummary, ladderFails, type Quick } from './store.js';
import { zip } from './zip.js';

/** the recipe in the address: `#recipe=` + deflate-raw + base64url */
const LINK_PARAM = 'recipe';
const MODE_NAME: Record<Mode, string> = { light: 'Light', dark: 'Dark' };

/** recipe → compact text for the URL */
export async function pack(doc: RecipeDoc): Promise<string> {
  const stream = new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
/**
 * the most a link may unpack to: a recipe is a few dozen KB, and a shared
 * link is someone else's input — a small link must not inflate into memory
 */
export const LINK_MAX_BYTES = 1 << 20;

/** link text → recipe; throws on anything that unpacks to more than `max` bytes */
export async function unpack(text: string, max = LINK_MAX_BYTES): Promise<RecipeDoc> {
  const bin = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  const stream = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error(`the link unpacks to more than ${max} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** the bit of the File System Access API the panel uses */
interface FsHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(text: string, title: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
function numberInput(attrs: { min?: number; max?: number; step: number }, set: (v: number) => void): HTMLInputElement {
  const input = el('input');
  input.type = 'number';
  if (attrs.min !== undefined) input.min = String(attrs.min);
  if (attrs.max !== undefined) input.max = String(attrs.max);
  input.step = String(attrs.step);
  input.addEventListener('input', () => settled(input.value) && set(Number(input.value)));
  input.addEventListener('change', () => set(Number(input.value)));
  return input;
}
/** a value written only when it changed, so a value being typed stays */
function show(input: HTMLInputElement | HTMLTextAreaElement, v: unknown) {
  const text = v === undefined || v === null ? '' : String(v);
  if (input.dataset.shown !== text) {
    input.dataset.shown = text;
    input.value = text;
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Tab = 'colors' | 'form' | 'json' | 'report' | 'diff';
const TABS: [Tab, string][] = [
  ['colors', 'Colours'],
  ['form', 'Recipe'],
  ['json', 'JSON'],
  ['report', 'Report'],
  ['diff', 'Defaults'],
];

/** the parts of the recipe the colour tab edits */
type ColourDoc = Pick<Recipe, 'chromaMax' | 'hues' | 'modes'>;

export const mountRecipePanel: MountRecipePanel = (element, options) => new Panel(element, options).api;

class Panel {
  readonly api: RecipePanel;
  private readonly store: EditorStore;
  private readonly root: ShadowRoot;
  private readonly attributeSuffix: string;
  private readonly fileOn: boolean;
  private readonly linkOn: boolean;
  private tab: Tab = 'colors';
  private readonly tabs = new Map<Tab, { el: HTMLElement; update(): void }>();
  private handle?: FsHandle;
  private lastState?: PanelState;
  private lastRecipe: RecipeDoc;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private packing = 0;
  private linkedFor?: RecipeDoc;
  private readonly cleanup: (() => void)[] = [];

  // chrome
  private readonly status = el('span', 'status');
  private readonly pending = el('span', 'pending', 'computing…');
  private readonly dirty = el('span', 'dirty');
  private readonly notice = el('span', 'notice');
  private readonly fileName = el('span', 'file');
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly beforeBtn: HTMLButtonElement;
  private readonly modeBtns = new Map<Mode, HTMLButtonElement>();
  private readonly saveBtn: HTMLButtonElement;
  private readonly zipBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly overlayBar = el('div', 'toolbar overlays');
  private overlayKey = '';
  private readonly tabBtns = new Map<Tab, HTMLButtonElement>();
  private readonly body = el('div', 'body');

  constructor(
    private readonly element: HTMLElement,
    private readonly options: PanelOptions,
  ) {
    this.attributeSuffix = options.generate?.attributeSuffix ?? '';
    this.fileOn = options.file !== false;
    this.linkOn = options.link !== false;
    this.store = new EditorStore({
      recipe: options.recipe,
      defaults: options.defaults ?? (recipeDefaults as RecipeDoc),
      generate: { ...options.generate, attributeSuffix: this.attributeSuffix },
    });
    this.lastRecipe = this.store.recipe;
    this.root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });

    this.undoBtn = button('↶', 'Undo (⌘Z / Ctrl-Z)', () => this.store.undo(), 'hist');
    this.redoBtn = button('↷', 'Redo (⇧⌘Z / Ctrl-Y)', () => this.store.redo(), 'hist');
    this.beforeBtn = button('Before', 'hold: the preview shows the saved state (pointer or space)', () => {}, 'compare');
    this.holdToCompare(this.beforeBtn);
    this.saveBtn = button('Download', '', () => void this.save());
    this.zipBtn = button('All (.zip)', 'everything as ZIP: recipe.json, model.css, the token tree, token-map.json, render.json, report, Figma and SCSS files', () => void this.downloadAll());
    this.resetBtn = button('Reset', 'back to the saved state', () => this.store.reset());

    this.build();
    this.listen();
    this.store.subscribe(() => this.update());
    if (this.linkOn) this.readLink();
    this.update();

    const store = this.store;
    this.api = {
      setRecipe: (doc) => store.edit(doc),
      getState: () => this.state(),
      undo: () => store.undo(),
      redo: () => store.redo(),
      destroy: () => this.destroy(),
    };
  }

  // ---------------------------------------------------------------- output

  private state(): PanelState {
    const shown = this.store.shown;
    return {
      css: shown?.css ?? '',
      mode: this.store.panelMode,
      overlays: this.store.overlays,
      attributeSuffix: this.attributeSuffix,
      run: shown?.out,
      pending: this.store.pending,
    };
  }

  private emit() {
    const s = this.state();
    const l = this.lastState;
    if (!l || l.css !== s.css || l.mode !== s.mode || l.overlays !== s.overlays || l.run !== s.run || l.pending !== s.pending) {
      this.lastState = s;
      this.options.onChange?.(s);
    }
    if (this.store.recipe !== this.lastRecipe) {
      this.lastRecipe = this.store.recipe;
      this.options.onRecipe?.(this.store.recipe);
    }
  }

  // ---------------------------------------------------------------- frame

  private build() {
    const style = el('style');
    style.textContent = STYLES;
    const head = el('header', 'head');
    head.append(this.status, this.pending, this.dirty);

    const modes = el('span', 'seg');
    for (const m of MODES) {
      const b = button(MODE_NAME[m], '', () => this.store.setMode(m));
      this.modeBtns.set(m, b);
      modes.append(b);
    }
    const history = el('span', 'seg');
    history.append(this.undoBtn, this.redoBtn);
    const toolbar = el('div', 'toolbar');
    toolbar.append(history, this.beforeBtn, modes, el('span', 'spacer'), this.notice);
    if (this.fileOn) toolbar.append(this.fileName);
    if (this.linkOn) toolbar.append(button('Copy link', 'copy the address with the recipe in it (#recipe=…)', () => void this.copyLink()));
    if (this.fileOn)
      toolbar.append(
        button('Open…', 'open a recipe.json and save straight into it (File System Access API)', () => void this.openFile()),
        this.saveBtn,
        this.zipBtn,
      );
    toolbar.append(this.resetBtn);

    const nav = el('nav', 'tabs');
    for (const [id, label] of TABS) {
      const b = button(label, '', () => this.showTab(id));
      this.tabBtns.set(id, b);
      nav.append(b);
    }
    const panel = el('div', 'panel');
    panel.append(head, toolbar, this.overlayBar, nav, this.body);
    this.root.replaceChildren(style, panel);
    this.showTab('colors');
  }

  private listen() {
    // ⌘Z / ⇧⌘Z / Ctrl-Y; text fields and the JSON keep the browser's own undo
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const t = e.composedPath()[0];
      if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && (t.type === 'text' || t.type === 'search'))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) this.store.undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') this.store.redo();
      else return;
      // a number field would undo its own text as well
      e.preventDefault();
    };
    // a pointer gesture (down … up) on a slider or a ladder point is one undo step.
    // The control captures the pointer, so its up comes back here even when
    // released over an iframe, where the window would never hear it.
    const down = (e: PointerEvent) => {
      const t = e.composedPath()[0];
      const slider = t instanceof HTMLInputElement && t.type === 'range';
      const point = t instanceof Element && t.matches('circle.pt');
      if (!slider && !point) return;
      this.store.startGesture();
      (t as Element).setPointerCapture?.(e.pointerId);
      (t as Element).addEventListener('lostpointercapture', up, { once: true });
    };
    const up = () => this.store.endGesture();
    this.element.addEventListener('keydown', onKey);
    this.element.addEventListener('pointerdown', down);
    this.element.addEventListener('pointerup', up);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    this.cleanup.push(() => {
      this.element.removeEventListener('keydown', onKey);
      this.element.removeEventListener('pointerdown', down);
      this.element.removeEventListener('pointerup', up);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    });
  }

  private holdToCompare(b: HTMLButtonElement) {
    const on = () => this.store.setComparing(true);
    const off = () => this.store.setComparing(false);
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('blur', off);
    b.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        on();
      }
    });
    b.addEventListener('keyup', (e) => e.key === ' ' && off());
  }

  private showTab(id: Tab) {
    this.tab = id;
    let t = this.tabs.get(id);
    if (!t) {
      t = this.makeTab(id);
      this.tabs.set(id, t);
      this.body.append(t.el);
    }
    for (const [k, v] of this.tabs) v.el.hidden = k !== id;
    for (const [k, b] of this.tabBtns) b.classList.toggle('on', k === id);
    t.update();
  }

  private makeTab(id: Tab) {
    switch (id) {
      case 'colors':
        return this.colorsTab();
      case 'form':
        return this.formTab();
      case 'json':
        return this.jsonTab();
      case 'report':
        return this.reportTab();
      case 'diff':
        return this.diffTab();
    }
  }

  // ---------------------------------------------------------------- update

  private update() {
    const s = this.store;
    const run = s.run;
    if (run) {
      const fs = failSummary(run);
      this.status.className = `status ${fs ? 'bad' : 'ok'}`;
      this.status.title = 'Light and Dark together; details in the Report tab';
      this.status.replaceChildren(fs ? `✗ ${fs}` : '✓ contracts hold');
    } else {
      this.status.className = 'status';
      const n = s.issues.length;
      this.status.replaceChildren(button(`✗ recipe invalid${n ? ` (${n})` : ''}`, 'to the errors in the form', () => this.showTab('form'), 'bad jump'));
    }
    this.pending.hidden = !s.pending;
    this.dirty.textContent = s.dirty ? '● unsaved' : '';
    this.undoBtn.disabled = !s.past.length;
    this.redoBtn.disabled = !s.future.length;
    this.beforeBtn.disabled = !s.dirty;
    this.beforeBtn.classList.toggle('on', s.comparing);
    this.beforeBtn.setAttribute('aria-pressed', String(s.comparing));
    this.beforeBtn.textContent = s.comparing ? 'Before: saved state' : 'Before';
    for (const [m, b] of this.modeBtns) b.classList.toggle('on', m === s.mode);
    this.fileName.textContent = this.handle ? this.handle.name : '';
    this.saveBtn.textContent = this.handle ? 'Save' : 'Download';
    this.saveBtn.disabled = !s.dirty;
    this.zipBtn.disabled = !s.run;
    this.resetBtn.disabled = !s.dirty;
    this.updateOverlays();
    this.tabs.get(this.tab)?.update();
    if (this.linkOn) this.writeLink();
    this.emit();
  }

  /** a toggle per attribute the render table selects on; media rules are simulated as attributes */
  private updateOverlays() {
    const rules = this.store.lastGood?.rules ?? [];
    const specs = toggleSpecs(rules, { attributeSuffix: this.attributeSuffix });
    const key = JSON.stringify(specs);
    if (key !== this.overlayKey) {
      this.overlayKey = key;
      const label = el('span', 'muted', 'Overlays');
      label.title = 'attributes from the render table; media queries are attributes here, the device settings do not count';
      this.overlayBar.replaceChildren(...(specs.length ? [label] : []));
      for (const t of specs) {
        const l = el('label');
        if (t.values.length === 1) {
          const box = el('input');
          box.type = 'checkbox';
          box.dataset.attribute = t.attribute;
          box.addEventListener('change', () => this.store.setOverlay(t.attribute, box.checked ? t.values[0] : undefined));
          l.append(box, `${t.label}${t.values[0] ? `: ${t.values[0]}` : ''}`);
        } else {
          const sel = el('select');
          sel.dataset.attribute = t.attribute;
          const none = el('option', '', 'default');
          none.value = '';
          sel.append(none);
          for (const v of t.values) {
            const o = el('option', '', v);
            o.value = v;
            sel.append(o);
          }
          sel.addEventListener('change', () => this.store.setOverlay(t.attribute, sel.value || undefined));
          l.append(`${t.label} `, sel);
        }
        this.overlayBar.append(l);
      }
    }
    this.overlayBar.hidden = !specs.length;
    for (const input of this.overlayBar.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-attribute]')) {
      const v = this.store.overlays[input.dataset.attribute!];
      if (input instanceof HTMLInputElement) input.checked = v !== undefined;
      else input.value = v ?? '';
    }
  }

  // ---------------------------------------------------------------- tabs

  private colorsTab() {
    const s = this.store;
    const tab = el('div', 'tab');
    const colour = () => s.recipe as unknown as ColourDoc;

    // hues
    const hues = el('section', 'block');
    hues.append(el('h2', '', 'Hues'));
    const chroma = numberInput({ min: 0, max: 0.4, step: 0.005 }, (v) => s.patchField({ path: ['chromaMax'], value: v }));
    const cmRow = el('label', 'row');
    cmRow.append(el('span', '', 'chromaMax'), chroma);
    const table = el('table', 'hues');
    const thead = el('thead');
    const tr = el('tr');
    for (const h of ['Name', 'Hue °', 'Chroma ×', 'Anchor (Light)']) tr.append(el('th', '', h));
    thead.append(tr);
    const tbody = el('tbody');
    table.append(thead, tbody);
    hues.append(cmRow, table);
    let hueShape = '';
    type HueRow = { hue: HTMLInputElement; range: HTMLInputElement; scale: HTMLInputElement; pick?: HTMLInputElement; hex?: HTMLInputElement };
    let rows: HueRow[] = [];

    // ladders
    const ladder = el('section', 'block');
    const ladderHead = el('h2', '', 'Ladder ');
    const seg = el('span', 'seg');
    const segBtns = new Map<Mode, HTMLButtonElement>();
    for (const m of MODES) {
      const b = button(MODE_NAME[m], '', () => s.setMode(m));
      segBtns.set(m, b);
      seg.append(b);
    }
    ladderHead.append(seg);
    const lCurveHost = el('div');
    const cCurveHost = el('div');
    const lRow = el('div', 'ladder');
    const cRow = el('div', 'ladder');
    lRow.append(el('span', 'lab', 'L'));
    cRow.append(el('span', 'lab', 'C'));
    ladder.append(ladderHead, lCurveHost, lRow, cCurveHost, cRow);
    const setLadder = (key: 'lightness' | 'chromaCurve') => (c: { mode: string; index: number; value: number }) =>
      s.patchField({ path: ['modes', c.mode, key, c.index], value: c.value });
    const lCurve: LadderCurve = mountLadderCurve(lCurveHost, { label: 'Lightness L', step: 0.005, onChange: setLadder('lightness') });
    const cCurve: LadderCurve = mountLadderCurve(cCurveHost, { label: 'Chroma curve C', step: 0.01, onChange: setLadder('chromaCurve') });
    this.cleanup.push(() => {
      lCurve.destroy();
      cCurve.destroy();
    });
    const lInputs: HTMLInputElement[] = [];
    const cInputs: HTMLInputElement[] = [];
    const ladderInputs = (row: HTMLElement, list: HTMLInputElement[], n: number, key: 'lightness' | 'chromaCurve', step: number) => {
      while (list.length > n) list.pop()!.remove();
      while (list.length < n) {
        const i = list.length;
        const input = numberInput({ min: 0, max: 1, step }, (v) => setLadder(key)({ mode: s.mode, index: i, value: v }));
        list.push(input);
        row.append(input);
      }
    };

    // ramps
    const ramps = el('section', 'block');

    tab.append(hues, ladder, ramps);

    const update = () => {
      const d = colour();
      const q = s.quick;
      show(chroma, d.chromaMax);
      // the hue table: rebuilt when its shape changes, patched otherwise
      const shape = JSON.stringify((d.hues ?? []).map((h) => [h.name, !!h.anchor?.light]));
      if (shape !== hueShape) {
        hueShape = shape;
        rows = [];
        tbody.replaceChildren(
          ...(d.hues ?? []).map((h, i) => {
            const row = el('tr');
            const name = el('td');
            name.append(el('code', '', h.name));
            const hueCell = el('td', 'hue');
            const range = el('input');
            range.type = 'range';
            range.min = '0';
            range.max = '360';
            range.step = '0.1';
            range.addEventListener('input', () => s.patchField({ path: ['hues', i, 'hue'], value: Number(range.value) }));
            const hue = numberInput({ min: 0, max: 360, step: 0.1 }, (v) => s.patchField({ path: ['hues', i, 'hue'], value: v }));
            hueCell.append(range, hue);
            const scaleCell = el('td');
            const scale = numberInput({ min: 0, max: 1.5, step: 0.01 }, (v) => s.patchField({ path: ['hues', i, 'chromaScale'], value: v }));
            scaleCell.append(scale);
            const anchorCell = el('td', 'anchor');
            const r: HueRow = { hue, range, scale };
            const a = h.anchor?.light;
            if (a) {
              const setAnchor = (hex: string) => s.patchField({ path: ['hues', i, 'anchor', 'light', 'hex'], value: hex.trim().toLowerCase() });
              r.pick = el('input', 'pick');
              r.pick.type = 'color';
              r.pick.title = 'pick the anchor colour';
              r.pick.addEventListener('input', () => setAnchor(r.pick!.value));
              r.hex = el('input', 'hex');
              r.hex.type = 'text';
              r.hex.addEventListener('change', () => setAnchor(r.hex!.value));
              anchorCell.append(r.pick, r.hex, el('small', '', `step ${a.step}`));
            }
            rows.push(r);
            row.append(name, hueCell, scaleCell, anchorCell);
            return row;
          }),
        );
      }
      (d.hues ?? []).forEach((h, i) => {
        const r = rows[i];
        const anchored = !!h.anchor?.light;
        show(r.range, h.hue);
        show(r.hue, h.hue);
        show(r.scale, h.chromaScale);
        r.range.disabled = r.hue.disabled = r.scale.disabled = anchored;
        if (r.pick && h.anchor?.light) {
          show(r.pick, h.anchor.light.hex.slice(0, 7));
          show(r.hex!, h.anchor.light.hex);
        }
      });

      // ladders
      for (const [m, b] of segBtns) b.classList.toggle('on', m === s.mode);
      const fails = q ? ladderFails(q) : undefined;
      const per = (key: 'lightness' | 'chromaCurve') => Object.fromEntries(MODES.map((m) => [m, d.modes?.[m]?.[key] ?? []]));
      lCurve.update({
        values: per('lightness'),
        active: s.mode,
        breaks: fails ? Object.fromEntries(MODES.map((m) => [m, [...fails[m].keys()]])) : {},
        swatches: swatchesOf(q, 'neutral'),
      });
      cCurve.update({ values: per('chromaCurve'), active: s.mode, swatches: swatchesOf(q, 'accent') });
      const L = d.modes?.[s.mode]?.lightness ?? [];
      const C = d.modes?.[s.mode]?.chromaCurve ?? [];
      ladderInputs(lRow, lInputs, L.length, 'lightness', 0.005);
      ladderInputs(cRow, cInputs, C.length, 'chromaCurve', 0.01);
      L.forEach((v, i) => {
        show(lInputs[i], v);
        const why = fails?.[s.mode].get(i);
        lInputs[i].classList.toggle('fail', !!why);
        lInputs[i].title = `step ${i + 1}${why ? `\n${why}` : ''}`;
      });
      C.forEach((v, i) => {
        show(cInputs[i], v);
        cInputs[i].title = `step ${i + 1}`;
      });

      // ramps with their contract marks
      if (!q) {
        ramps.replaceChildren();
        return;
      }
      const h2 = el('h2', '', `Ramps ${MODE_NAME[s.mode]}`);
      const blocks = (d.hues ?? []).map((h) => {
        const block = el('div', 'ramp');
        const head = el('div', 'ramp-head');
        head.append(el('code', '', h.name));
        const f = q.findings.filter((x) => x.mode === s.mode && (x.hue === h.name || x.hue === '*') && !x.ok).map((x) => `${x.rule}: ${x.value.toFixed(2)} (${x.detail})`);
        const mark = el('span', f.length ? 'bad' : 'ok', f.length ? `✗ ${f.length}` : '✓');
        mark.title = f.join('\n');
        head.append(mark);
        const strip = el('div', 'strip');
        for (const sw of q.ramps[s.mode][h.name] ?? []) {
          const sf = q.findings
            .filter((x) => !x.ok && x.mode === s.mode && x.hue === h.name && (x.step === sw.step || x.against === sw.step))
            .map((x) => `${x.rule}: ${x.value.toFixed(2)} (${x.detail})`);
          const span = el('span', sf.length ? 'fail' : '');
          span.style.background = sw.hex;
          span.title = `${sw.step}  L ${sw.l.toFixed(3)}  ${sw.hex}${sw.clamped ? '  ⚑ gamut' : ''}${sw.anchored ? '  ⚓' : ''}${sf.length ? `\n✗ ${sf.join('\n✗ ')}` : ''}`;
          strip.append(span);
        }
        block.append(head, strip);
        return block;
      });
      ramps.replaceChildren(h2, ...blocks);
    };
    return { el: tab, update };
  }

  private formTab() {
    const s = this.store;
    const tab = el('div', 'tab form');
    const schema = z.toJSONSchema(RecipeSchema) as JsonSchema;
    const hint = el('p', 'muted', 'Every field of the recipe schema. Italic = the default, ↺ = back to the default.');
    const search = el('input', 'search');
    search.type = 'search';
    search.placeholder = 'Search: field, description or text (e.g. radius, focus)';
    const errors = el('div');
    const empty = el('p', 'muted');
    const list = el('div');
    tab.append(hint, search, errors, empty, list);
    search.addEventListener('input', () => update());
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        search.value = '';
        update();
      }
    });
    const defaults = s.defaults as Record<string, unknown>;
    const sections = Object.entries(schema.properties ?? {})
      .filter(([k]) => !k.startsWith('$'))
      .map(([key, sch]) => {
        const details = el('details');
        const summary = el('summary');
        const code = el('code', '', key);
        const count = el('span', 'bad');
        summary.append(code, count, el('span', 'muted', sch.description ?? ''));
        const host = el('div');
        details.append(summary, host);
        let form: SchemaForm | undefined;
        let wantOpen: boolean | undefined;
        return { key, schema: sch, details, code, count, host, form, wantOpen };
      });
    this.cleanup.push(() => sections.forEach((x) => x.form?.destroy()));

    const update = () => {
      const q = search.value.trim().toLowerCase();
      const recipe = s.recipe as Record<string, unknown>;
      const issues = s.issues;
      // errors at the top: a count, and those without a path
      if (s.error) {
        errors.replaceChildren(
          ...(issues.length
            ? [el('p', 'bad', `✗ ${issues.length} errors in the recipe — marked at their field`), ...issues.filter((i) => !i.path.length).map((i) => el('p', 'bad', `✗ ${i.message}`))]
            : [el('pre', 'error', s.error)]),
        );
      } else errors.replaceChildren();
      const visible = sections.filter((x) => hits(x.schema, recipe[x.key], defaults[x.key], x.key, q));
      empty.textContent = q && !visible.length ? `No field matches “${search.value}”.` : '';
      for (const x of visible) {
        const si = issues.filter((i) => i.path[0] === x.key);
        x.count.textContent = si.length ? ` ✗ ${si.length} ` : ' ';
        x.code.classList.toggle('hit', !!q && x.key.toLowerCase().includes(q));
        // open while searching, with errors, and the hues at the start; a user's toggle stays until that changes
        const open = q ? true : si.length > 0 || x.key === 'hues';
        if (open !== x.wantOpen) {
          x.wantOpen = open;
          x.details.open = open;
        }
        const own = x.key.toLowerCase().includes(q) || (x.schema.description ?? '').toLowerCase().includes(q);
        if (!x.form) x.form = mountSchemaForm(x.host, { schema: x.schema, path: [x.key], onChange: (c) => s.patchField(c) });
        x.form.update({ value: recipe[x.key], base: defaults[x.key], query: own ? '' : q, issues: si });
      }
      const els = visible.map((x) => x.details);
      if (els.length !== list.children.length || els.some((e, i) => list.children[i] !== e)) list.replaceChildren(...els);
    };
    return { el: tab, update };
  }

  private jsonTab() {
    const s = this.store;
    const tab = el('div', 'tab');
    const text = el('textarea', 'json');
    text.spellcheck = false;
    const error = el('pre', 'error');
    const actions = el('div', 'actions');
    let shownFor: RecipeDoc | undefined;
    actions.append(
      button('Apply', '', () => s.applyJson(text.value)),
      button('Discard', '', () => {
        shownFor = undefined;
        update();
      }),
    );
    tab.append(el('h2', '', 'Recipe (without the defaults)'), text, actions, error);
    const update = () => {
      // the text follows the recipe, edits elsewhere included
      if (shownFor !== s.recipe) {
        shownFor = s.recipe;
        text.value = JSON.stringify(s.recipe, null, 2);
      }
      error.textContent = s.error ?? '';
      error.hidden = !s.error;
    };
    return { el: tab, update };
  }

  private reportTab() {
    const s = this.store;
    const tab = el('div', 'tab');
    const body = el('div');
    tab.append(el('h2', '', 'Report'), body);
    let shownFor: unknown;
    const update = () => {
      const key = s.run ?? s.error;
      if (key === shownFor) return;
      shownFor = key;
      if (s.run) {
        const ol = el('ol', 'log');
        for (const line of s.run.out.log) {
          const li = el('li', '', line);
          li.classList.toggle('fail', line.includes('✗'));
          li.classList.toggle('note', line.trimStart().startsWith('·'));
          ol.append(li);
        }
        body.replaceChildren(ol);
      } else body.replaceChildren(el('pre', 'error', s.error ?? ''));
    };
    return { el: tab, update };
  }

  private diffTab() {
    const s = this.store;
    const tab = el('div', 'tab');
    const summary = el('p', 'muted');
    const table = el('table', 'diff');
    tab.append(el('h2', '', 'Against the defaults'), summary, table);
    let shownFor: RecipeDoc | undefined;
    const update = () => {
      if (shownFor === s.recipe) return;
      shownFor = s.recipe;
      const d = defaultsDiff(s.recipe, s.defaults);
      summary.textContent = `${d.overrides.length} values overridden, ${d.inherited.length} values from the defaults.`;
      const rows = [
        ...d.overrides.map((o) => {
          const tr = el('tr');
          const k = el('td');
          k.append(el('code', '', o.key));
          const v = el('td');
          v.append(el('s', '', o.base), ' → ', el('b', '', o.value!));
          tr.append(k, v);
          return tr;
        }),
        ...d.inherited.map((o) => {
          const tr = el('tr', 'muted');
          const k = el('td');
          k.append(el('code', '', o.key));
          tr.append(k, el('td', '', o.base));
          return tr;
        }),
      ];
      table.replaceChildren(...rows);
    };
    return { el: tab, update };
  }

  // ---------------------------------------------------------------- file and link

  private say(text: string) {
    this.notice.textContent = text;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice.textContent = ''), 4000);
  }

  private readLink() {
    const linked = new RegExp(`${LINK_PARAM}=([\\w-]+)`).exec(location.hash)?.[1];
    if (linked)
      unpack(linked)
        .then((doc) => this.store.load(doc))
        .catch(() => this.say('the link holds no readable recipe — the given recipe is loaded'));
  }

  /** the address carries the recipe as the model last ran on it; the saved state needs none */
  private writeLink() {
    const doc = this.store.modelRecipe;
    if (doc === this.linkedFor) return;
    this.linkedFor = doc;
    const plain = same(doc, this.store.saved);
    const seq = ++this.packing;
    (plain ? Promise.resolve('') : pack(doc)).then((text) => {
      // a newer edit wins over a slower compression
      if (seq !== this.packing) return;
      const url = new URL(location.href);
      url.hash = text ? `${LINK_PARAM}=${text}` : '';
      history.replaceState(history.state, '', url);
    });
  }

  private async copyLink() {
    const url = new URL(location.href);
    url.hash = `${LINK_PARAM}=${await pack(this.store.recipe)}`;
    try {
      await navigator.clipboard.writeText(url.href);
      this.say(`link copied (${url.href.length} characters)`);
    } catch {
      this.say('copying is not allowed — the address bar carries the recipe');
    }
  }

  private async openFile() {
    const picker = (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FsHandle[]> }).showOpenFilePicker;
    if (!picker) {
      this.say('this browser cannot open a file and save into it (File System Access API) — Chrome or Edge; downloading works everywhere');
      return;
    }
    try {
      const [h] = await picker({ types: [{ description: 'Recipe', accept: { 'application/json': ['.json'] } }] });
      const doc = JSON.parse(await (await h.getFile()).text()) as RecipeDoc;
      this.handle = h;
      this.store.load(doc, doc);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') this.say(`could not open: ${(e as Error).message}`);
    }
  }

  /** into the opened file, or a download when none is open */
  private async save() {
    const text = JSON.stringify(this.store.recipe, null, 2) + '\n';
    if (!this.handle) {
      this.saveBlob(new Blob([text], { type: 'application/json' }), 'recipe.json');
      return;
    }
    const w = await this.handle.createWritable();
    await w.write(text);
    await w.close();
    this.store.markSaved();
  }

  /** the model as the CLI writes it, plus the recipe and the report — one ZIP */
  private async downloadAll() {
    const run = this.store.run;
    if (!run) return;
    const files = {
      'recipe.json': JSON.stringify(this.store.modelRecipe, null, 2) + '\n',
      'report.txt': run.out.log.join('\n') + '\n',
      ...run.out.files,
    };
    const blob = await zip(files);
    this.saveBlob(blob, 'token-model.zip');
    this.say(`${Object.keys(files).length} files, ${Math.round(blob.size / 1024)} KB`);
  }

  private saveBlob(blob: Blob, name: string) {
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    // Safari reads the URL after the click returns
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private destroy() {
    for (const c of this.cleanup) c();
    clearTimeout(this.noticeTimer);
    this.store.destroy();
    this.root.replaceChildren();
  }
}

/** a semantic hue's ramp colours per mode, for the ladder's points */
function swatchesOf(q: Quick | undefined, semantic: string): Record<string, string[]> {
  if (!q) return {};
  const ramp = q.recipe.semanticHues?.[semantic] ?? q.recipe.hues[0]?.name;
  return Object.fromEntries(MODES.map((m) => [m, (q.ramps[m][ramp] ?? []).map((s) => s.hex)]));
}

const STYLES = `
:host { display: block; }
.panel { display: grid; gap: 8px; font: 13px/1.4 system-ui, sans-serif; color: #2a1a08; }
.head, .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.toolbar.overlays { font-size: 12px; }
.toolbar label { display: inline-flex; align-items: center; gap: 4px; }
[hidden] { display: none !important; }
.spacer { flex: 1; }
.status.ok, .ok { color: #1f7a3a; }
.status.bad, .bad { color: #c0392b; }
.pending { color: #b36b00; font-style: italic; }
.dirty { color: #b36b00; }
.notice { color: #5a3a10; font-size: 12px; }
.file { font-family: ui-monospace, monospace; font-size: 12px; color: #7a6a5a; }
.muted { color: #7a6a5a; }
button { font: inherit; font-size: 12px; padding: 2px 8px; border: 1px solid #e2c6a6; border-radius: 4px; background: #fff; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: default; }
button.on { background: #ff7a00; border-color: #ff7a00; color: #fff; }
button.bad.jump { color: #c0392b; border-color: #c0392b; }
.seg { display: inline-flex; }
.seg button { border-radius: 0; }
.seg button:first-child { border-radius: 4px 0 0 4px; }
.seg button:last-child { border-radius: 0 4px 4px 0; }
.tabs { display: flex; gap: 2px; border-block-end: 1px solid #f0d9c0; }
.tabs button { border-radius: 4px 4px 0 0; border-block-end: 0; }
.block { display: grid; gap: 6px; margin-block-end: 12px; }
h2 { margin: 0; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.row { display: flex; gap: 8px; align-items: center; }
input[type='number'], input[type='text'], input[type='search'], select, textarea { font: inherit; padding: 2px 4px; border: 1px solid #d9c3a6; border-radius: 3px; background: #fff; }
input[type='number'] { inline-size: 64px; }
table.hues { border-collapse: collapse; }
table.hues th { text-align: start; font-weight: 500; color: #7a6a5a; font-size: 11px; }
table.hues td { padding: 2px 4px; }
td.hue input[type='range'] { inline-size: 120px; vertical-align: middle; }
td.anchor { display: flex; gap: 4px; align-items: center; }
input.hex { font-family: ui-monospace, monospace; inline-size: 88px; }
input.pick { inline-size: 24px; block-size: 20px; padding: 0; border: 1px solid #0003; }
.ladder { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; }
.ladder .lab { inline-size: 16px; font-weight: 600; }
.ladder input { inline-size: 56px; }
.ladder input.fail { border-color: #c0392b; background: #fff0f0; }
.ramp { display: grid; gap: 2px; }
.ramp-head { display: flex; gap: 8px; align-items: baseline; }
.strip { display: grid; grid-template-columns: repeat(12, 1fr); block-size: 22px; }
.strip span.fail { outline: 2px solid #ff2d55; outline-offset: -2px; }
.form .search { inline-size: 100%; box-sizing: border-box; }
details { border-block-end: 1px solid #f0d9c0; padding-block: 4px; }
summary { cursor: pointer; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
summary code.hit { background: #ffe08a; }
summary .muted { font-size: 11px; flex-basis: 100%; }
textarea.json { inline-size: 100%; min-block-size: 360px; box-sizing: border-box; font: 12px/1.4 ui-monospace, monospace; }
.actions { display: flex; gap: 6px; }
pre.error { white-space: pre-wrap; color: #c0392b; font-size: 12px; margin: 0; }
ol.log { font: 12px/1.5 ui-monospace, monospace; padding-inline-start: 2em; margin: 0; }
ol.log .fail { color: #c0392b; }
ol.log .note { color: #7a6a5a; }
table.diff { border-collapse: collapse; font-size: 12px; }
table.diff td { padding: 1px 6px; vertical-align: top; }
`;
