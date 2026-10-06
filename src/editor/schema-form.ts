/**
 * The recipe form, built from the recipe's JSON Schema, recursively: one
 * field per schema node. A field shows the design system's value or, where
 * the recipe leaves a key out, the default marked as inherited; an
 * overridden default gets a reset. Every edit goes out as `(path, value)` —
 * the panel writes it into the recipe.
 *
 * Nothing here knows a recipe section: what is shown, and how, comes from
 * the schema. Texts from schema and recipe only ever reach the DOM as
 * `textContent`, `value` or an attribute, never as markup.
 *
 * Fields are kept across updates and patched in place, so typing, an open
 * colour picker or select survive the re-render that every edit causes.
 */

/** the subset of JSON Schema (draft 2020-12, as zod writes it) the form reads */
export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: JsonSchema | boolean;
  items?: JsonSchema | boolean;
  prefixItems?: JsonSchema[];
  anyOf?: JsonSchema[];
  enum?: string[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  pattern?: string;
}

export type Path = (string | number)[];

/** a problem at a recipe path (`RecipeError.issues`) */
export interface FieldIssue {
  path: string[];
  message: string;
}

export interface FieldChange {
  path: Path;
  /** `undefined` removes the key, so the default shows again */
  value: unknown;
}

export interface SchemaFormView {
  /** the design system's recipe (overrides only) */
  value: unknown;
  /** the defaults it overrides */
  base: unknown;
  /** search text; `''` shows everything */
  query?: string;
  issues?: FieldIssue[];
}

export interface SchemaForm {
  update(view: SchemaFormView): void;
  destroy(): void;
}

type Kind = 'object' | 'record' | 'array' | 'tuple' | 'number' | 'string' | 'boolean' | 'enum' | 'const' | 'union';

/**
 * a number field's text is a finished number — live updates take it while
 * typing; "0." or "0.0" wait for the change event, so the re-rendered value
 * never overwrites what is being typed
 */
export const settled = (v: string) => v.trim() !== '' && String(Number(v)) === v.trim();

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const childOf = (v: unknown, k: string | number) =>
  isObj(v) || Array.isArray(v) ? (v as Record<string, unknown>)[k] : undefined;

/**
 * search: the field or something below it matches `q` (lower case) — in a
 * key, a description or a text value. Walks the way the form renders: an
 * object's properties, a record's keys (recipe and default), list items.
 */
export function hits(s: JsonSchema, value: unknown, base: unknown, label: string, q: string): boolean {
  if (!q) return true;
  const has = (t?: string) => !!t && t.toLowerCase().includes(q);
  if (has(label) || has(s.description)) return true;
  const shown = value ?? base;
  if (s.anyOf) return s.anyOf.some((b) => hits(b, value, base, '', q));
  if (typeof shown === 'string') return has(shown);
  if (s.type === 'object' && s.properties)
    return Object.entries(s.properties).some(([k, ps]) => hits(ps, childOf(value, k), childOf(base, k), k, q));
  if (s.type === 'object') {
    const vs = typeof s.additionalProperties === 'object' ? s.additionalProperties : {};
    const keys = new Set([...(isObj(value) ? Object.keys(value) : []), ...(isObj(base) ? Object.keys(base) : [])]);
    return [...keys].some((k) => hits(vs, childOf(value, k), childOf(base, k), k, q));
  }
  if (s.type === 'array' && Array.isArray(shown)) {
    const item = typeof s.items === 'object' ? s.items : {};
    return shown.some((v, i) => hits(s.prefixItems?.[i] ?? item, v, undefined, `#${i + 1}`, q));
  }
  return false;
}

/** a starting value for a schema, so a new key or item is valid at once */
export function emptyFor(s: JsonSchema): unknown {
  if (s.anyOf) return emptyFor(s.anyOf[0]);
  if (s.const !== undefined) return s.const;
  if (s.enum) return s.enum[0];
  if (s.type === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of s.required ?? []) if (s.properties?.[k]) o[k] = emptyFor(s.properties[k]);
    return o;
  }
  if (s.type === 'array') return s.prefixItems ? s.prefixItems.map(emptyFor) : [];
  if (s.type === 'number' || s.type === 'integer') return s.minimum ?? 0;
  if (s.type === 'boolean') return false;
  return '';
}

function kindOf(s: JsonSchema): Kind {
  if (s.anyOf) return 'union';
  if (s.enum) return 'enum';
  if (s.const !== undefined) return 'const';
  if (s.type === 'object') return s.properties ? 'object' : 'record';
  if (s.type === 'array') return s.prefixItems ? 'tuple' : 'array';
  if (s.type === 'number' || s.type === 'integer') return 'number';
  if (s.type === 'boolean') return 'boolean';
  return 'string';
}

/** one object, so a field built from it is kept across updates */
const TEXT: JsonSchema = { type: 'string' };
const itemSchemaOf = (s: JsonSchema): JsonSchema => (typeof s.items === 'object' ? s.items : TEXT);
const valueSchemaOf = (s: JsonSchema): JsonSchema =>
  typeof s.additionalProperties === 'object' ? s.additionalProperties : TEXT;
const primitive = (s: JsonSchema) => s.type === 'number' || s.type === 'integer' || s.type === 'string';

/** union: the branch the value fits */
function branchOf(s: JsonSchema, v: unknown): number {
  const fits = (b: JsonSchema) =>
    b.const !== undefined
      ? v === b.const
      : isObj(v)
        ? b.type === 'object'
        : Array.isArray(v)
          ? b.type === 'array'
          : typeof v === 'number'
            ? b.type === 'number' || b.type === 'integer'
            : typeof v === 'string'
              ? b.type === 'string' || !!b.enum
              : false;
  const bs = s.anyOf ?? [];
  // a fixed value first: "auto" is a string too, but it is the "auto" branch
  const exact = bs.findIndex((b) => b.const !== undefined && b.const === v);
  const i = exact >= 0 ? exact : bs.findIndex(fits);
  return i < 0 ? 0 : i;
}
const variantName = (b: JsonSchema) =>
  b.const !== undefined
    ? String(b.const)
    : b.type === 'object'
      ? 'object'
      : b.type === 'number' || b.type === 'integer'
        ? 'number'
        : b.type === 'array'
          ? 'list'
          : 'text';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(text: string, title: string, onClick: () => void, cls = 'mini'): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
/** a property set only when it differs, so the browser keeps what it has (caret, picker) */
function patch<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  if (target[key] !== value) target[key] = value;
}
/** the children in this order; moves nothing when the order holds, so focus stays */
function order(parent: Element, children: Element[]) {
  const now = [...parent.children];
  if (now.length !== children.length || now.some((c, i) => c !== children[i])) parent.replaceChildren(...children);
}
/** text fields keep the browser's own undo: ⌘Z there never reaches the panel */
function ownUndo(input: HTMLInputElement) {
  input.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (((e.metaKey || e.ctrlKey) && k === 'z') || (e.ctrlKey && k === 'y')) e.stopPropagation();
  });
}

interface Props {
  value: unknown;
  base: unknown;
  query: string;
  issues: FieldIssue[];
}

type Emit = (change: FieldChange) => void;

/** one field of the form and everything below it */
class Field {
  readonly el = el('div', 'sf');
  private readonly kind: Kind;
  private props: Props = { value: undefined, base: undefined, query: '', issues: [] };
  /** child fields by key; rows hold a field plus its buttons */
  private readonly kids = new Map<string, { field: Field; row: HTMLElement }>();
  private readonly optionals = new Map<string, HTMLElement>();
  private built = false;
  // parts, by kind
  private head?: HTMLElement;
  private keyEl?: HTMLElement;
  private body?: HTMLElement;
  private foot?: HTMLElement;
  private resetSlot = el('span', 'reset-slot');
  private issueList = el('div', 'issues');
  private inputs: HTMLInputElement[] = [];
  private select?: HTMLSelectElement;
  private swatch?: HTMLInputElement;
  private branch = -1;
  /** keys this group renders as fields (present properties, record keys, list indices) */
  private rendered = new Set<string>();
  private variant?: HTMLSelectElement;

  constructor(
    private readonly schema: JsonSchema,
    private readonly path: Path,
    private readonly label: string,
    private readonly emit: Emit,
  ) {
    this.kind = kindOf(schema);
    // where an issue or a search hit can be found from outside
    this.el.dataset.path = path.join('.');
  }

  private get shown() {
    return this.props.value ?? this.props.base;
  }
  private get list(): unknown[] {
    return Array.isArray(this.shown) ? (this.shown as unknown[]) : [];
  }
  private get isGroup() {
    return this.kind === 'object' || this.kind === 'record' || (this.kind === 'array' && !primitive(itemSchemaOf(this.schema)));
  }
  private get selfHit() {
    const q = this.props.query;
    const has = (t?: string) => !!q && !!t && t.toLowerCase().includes(q);
    return has(this.label) || has(this.schema.description);
  }
  /** a matching field shows everything below it */
  private get childQuery() {
    return this.selfHit ? '' : this.props.query;
  }
  private get inherited() {
    return this.props.value === undefined && this.props.base !== undefined;
  }
  private get overridden() {
    return this.props.value !== undefined && this.props.base !== undefined && !same(this.props.value, this.props.base);
  }
  /** the issues at or below this field's path */
  private get subIssues() {
    const p = this.path.map(String);
    return this.props.issues.filter((i) => p.every((s, k) => i.path[k] === s));
  }

  private send(value: unknown) {
    this.emit({ path: this.path, value });
  }
  private sendChild(key: string | number, value: unknown) {
    this.emit({ path: [...this.path, key], value });
  }

  update(props: Props) {
    this.props = props;
    if (!this.built) this.build();
    switch (this.kind) {
      case 'object':
        this.updateObject();
        break;
      case 'record':
        this.updateRecord();
        break;
      case 'array':
        if (primitive(itemSchemaOf(this.schema))) this.updateInline(itemSchemaOf(this.schema), this.list.length);
        else this.updateList();
        break;
      case 'tuple':
        this.updateInline(undefined, this.schema.prefixItems!.length);
        break;
      case 'union':
        this.updateUnion();
        break;
      default:
        this.updateLeaf();
    }
    if (this.head) this.updateHead();
    this.updateReset();
    this.updateIssues();
  }

  destroy() {
    for (const { field } of this.kids.values()) field.destroy();
    this.kids.clear();
    this.el.remove();
  }

  /** the parts that do not change with the value */
  private build() {
    this.built = true;
    const s = this.schema;
    const desc = s.description ?? '';
    if (this.isGroup) {
      const group = el('div', this.label ? 'group' : 'group root');
      if (this.label) {
        this.head = el('div', 'head');
        this.keyEl = el('span', 'key', this.label);
        this.head.append(this.keyEl);
        if (desc) this.head.append(el('span', 'desc', desc));
        this.head.append(this.resetSlot);
        group.append(this.head);
      }
      this.body = el('div', 'rows');
      this.foot = el('div', 'field foot');
      group.append(this.body, this.foot);
      this.el.append(this.issueList, group);
      if (this.kind === 'record') {
        const key = el('input', 'newkey');
        key.type = 'text';
        key.placeholder = 'new key';
        ownUndo(key);
        this.foot.append(
          key,
          button('+ entry', 'add an entry', () => {
            if (key.value) this.sendChild(key.value, emptyFor(valueSchemaOf(s)));
            key.value = '';
          }),
        );
      } else if (this.kind === 'array') {
        this.foot.append(button('+ entry', 'add an entry', () => this.send([...this.list, emptyFor(itemSchemaOf(s))])));
      }
      return;
    }
    if (this.kind === 'union') {
      this.body = el('div', 'union');
      this.variant = el('select', 'variant');
      this.variant.title = 'another form of the value';
      s.anyOf!.forEach((b, i) => {
        const o = el('option', '', variantName(b));
        o.value = String(i);
        this.variant!.append(o);
      });
      this.variant.addEventListener('change', () => {
        const i = Number(this.variant!.value);
        if (i !== this.branch) this.send(emptyFor(s.anyOf![i]));
      });
      this.body.append(this.variant);
      this.el.append(this.body, this.issueList);
      return;
    }
    // leaves: key, control, reset
    const row = el(this.kind === 'number' || this.kind === 'string' || this.kind === 'enum' || this.kind === 'boolean' ? 'label' : 'div', 'field');
    this.keyEl = el('span', 'key', this.label);
    if (desc && this.kind !== 'const') this.keyEl.title = desc;
    row.append(this.keyEl);
    switch (this.kind) {
      case 'number': {
        const input = this.numberInput(s, (v) => this.send(v));
        if (s.minimum !== undefined || s.exclusiveMinimum !== undefined) input.min = String(s.minimum ?? s.exclusiveMinimum);
        if (s.maximum !== undefined) input.max = String(s.maximum);
        row.append(input);
        this.inputs = [input];
        break;
      }
      case 'string': {
        if (s.pattern?.startsWith('^#')) {
          this.swatch = el('input', 'swatch');
          this.swatch.type = 'color';
          this.swatch.title = 'pick a colour (an alpha part is kept)';
          this.swatch.addEventListener('input', () => {
            const v = this.shown;
            this.send(this.swatch!.value + (typeof v === 'string' && v.length === 9 ? v.slice(7) : ''));
          });
          row.append(this.swatch);
        }
        const input = el('input', this.swatch ? 'hex' : '');
        input.type = 'text';
        ownUndo(input);
        input.addEventListener('change', () => this.send(input.value));
        row.append(input);
        this.inputs = [input];
        break;
      }
      case 'enum': {
        this.select = el('select');
        for (const o of s.enum!) {
          const opt = el('option', '', o);
          opt.value = o;
          this.select.append(opt);
        }
        this.select.addEventListener('change', () => this.send(this.select!.value));
        row.append(this.select);
        break;
      }
      case 'boolean': {
        const input = el('input');
        input.type = 'checkbox';
        input.addEventListener('change', () => this.send(input.checked));
        row.append(input);
        this.inputs = [input];
        break;
      }
      case 'const':
        row.append(el('code', '', String(s.const)));
        break;
      default: {
        // tuple and primitive list: inputs come with the value
        this.body = el('span', 'inline');
        row.append(this.body);
        if (this.kind === 'array') {
          this.foot = el('span', 'inline-buttons');
          this.foot.append(
            button('−', 'remove the last value', () => this.send(this.list.slice(0, -1))),
            button('+', 'append a value', () => this.send([...this.list, emptyFor(itemSchemaOf(s))])),
          );
          row.append(this.foot);
        }
      }
    }
    row.append(this.resetSlot);
    this.el.append(row, this.issueList);
  }

  private numberInput(s: JsonSchema, set: (v: number) => void): HTMLInputElement {
    const input = el('input');
    input.type = 'number';
    input.step = s.type === 'integer' ? '1' : 'any';
    input.addEventListener('input', () => settled(input.value) && set(Number(input.value)));
    input.addEventListener('change', () => set(Number(input.value)));
    return input;
  }

  private updateHead() {
    this.keyEl?.classList.toggle('hit', this.selfHit);
  }

  private updateReset() {
    if (this.kind === 'union' || this.kind === 'const') return;
    if (this.overridden) {
      const b = this.resetSlot.firstElementChild;
      const title = `default: ${JSON.stringify(this.props.base)}`;
      if (b?.classList.contains('reset')) patch(b as HTMLButtonElement, 'title', title);
      else this.resetSlot.replaceChildren(button('↺', title, () => this.send(undefined), 'mini reset'));
    } else if (this.inherited) {
      if (!this.resetSlot.firstElementChild?.classList.contains('badge')) {
        const badge = el('span', 'badge', 'default');
        badge.title = 'from the defaults';
        this.resetSlot.replaceChildren(badge);
      }
    } else if (this.resetSlot.firstChild) this.resetSlot.replaceChildren();
  }

  /**
   * issues shown here: this path's own, and those of a key the form does not
   * render as a field (a missing name, an unset property). A union hands
   * everything to the field it renders.
   */
  private updateIssues() {
    const own: string[] = [];
    if (this.kind !== 'union') {
      const depth = this.path.length;
      const rendered = this.isGroup ? this.rendered : new Set<string>();
      for (const i of this.subIssues) {
        const rest = i.path.slice(depth);
        if (rest.length === 0 || !rendered.has(rest[0])) own.push(rest.length ? `${rest.join('.')}: ${i.message}` : i.message);
      }
    }
    this.el.classList.toggle('has-issue', own.length > 0);
    const now = [...this.issueList.children].map((p) => p.textContent);
    const next = own.map((m) => `✗ ${m}`);
    if (!same(now, next)) this.issueList.replaceChildren(...next.map((m) => el('p', 'issue', m)));
  }

  /** a child field at `key`, kept while its schema stays, inside `row` */
  private kid(
    key: string,
    schema: JsonSchema,
    label: string,
    props: Props,
    wrap?: (field: Field) => HTMLElement,
    path: Path = [...this.path, this.kind === 'array' ? Number(key) : key],
  ) {
    let k = this.kids.get(key);
    if (k && k.field.schema !== schema) {
      k.field.destroy();
      k.row.remove();
      k = undefined;
    }
    if (!k) {
      const field = new Field(schema, path, label, this.emit);
      k = { field, row: wrap ? wrap(field) : field.el };
      this.kids.set(key, k);
    }
    k.field.update(props);
    return k.row;
  }
  private dropKids(keep: Set<string>) {
    for (const [key, k] of this.kids)
      if (!keep.has(key)) {
        k.field.destroy();
        k.row.remove();
        this.kids.delete(key);
      }
  }
  private childProps(key: string | number, withBase = true): Props {
    return {
      value: childOf(this.props.value, key),
      base: withBase ? childOf(this.props.base, key) : undefined,
      query: this.childQuery,
      issues: this.subIssues,
    };
  }
  private shows(s: JsonSchema, v: unknown, b: unknown, label: string) {
    return hits(s, v, b, label, this.childQuery);
  }

  private updateObject() {
    const s = this.schema;
    // objects merge key by key, so a key the default sets is in effect even when the recipe sets others
    const set = (k: string) =>
      (isObj(this.props.value) && k in this.props.value) || (isObj(this.props.base) && k in this.props.base) || (s.required ?? []).includes(k);
    this.rendered = new Set(Object.keys(s.properties ?? {}).filter((k) => !k.startsWith('$') && set(k)));
    const rows: HTMLElement[] = [];
    const keep = new Set<string>();
    for (const [key, ps] of Object.entries(s.properties ?? {})) {
      if (key.startsWith('$')) continue;
      const present = this.rendered.has(key);
      const p = this.childProps(key);
      if (!this.shows(ps, p.value, p.base, key)) continue;
      if (present) {
        keep.add(key);
        rows.push(this.kid(key, ps, key, p));
      } else {
        let opt = this.optionals.get(key);
        if (!opt) {
          opt = el('div', 'field optional');
          opt.append(el('span', 'key', key), button('+ set', ps.description ?? '', () => this.sendChild(key, emptyFor(ps))));
          this.optionals.set(key, opt);
        }
        opt.firstElementChild!.classList.toggle('hit', !!this.childQuery && key.toLowerCase().includes(this.childQuery));
        rows.push(opt);
      }
    }
    this.dropKids(keep);
    order(this.body!, rows);
    this.foot!.hidden = true;
  }

  private updateRecord() {
    const vs = valueSchemaOf(this.schema);
    const keys = new Set<string>();
    for (const o of [this.props.value, this.props.base]) if (isObj(o)) for (const k of Object.keys(o)) keys.add(k);
    this.rendered = keys;
    const rows: HTMLElement[] = [];
    const keep = new Set<string>();
    for (const key of keys) {
      const p = this.childProps(key);
      if (!this.shows(vs, p.value, p.base, key)) continue;
      keep.add(key);
      rows.push(
        this.kid(key, vs, key, p, (field) => {
          const row = el('div', 'record-row');
          // a key from the recipe goes away and the default shows again; a
          // default-only key stays — the generator needs every universal name
          row.append(field.el, button('×', 'remove the entry', () => this.sendChild(key, undefined)));
          return row;
        }),
      );
    }
    this.dropKids(keep);
    order(this.body!, rows);
    this.foot!.hidden = !!this.childQuery;
  }

  private updateList() {
    const item = itemSchemaOf(this.schema);
    this.rendered = new Set(this.list.map((_, i) => String(i)));
    const rows: HTMLElement[] = [];
    const keep = new Set<string>();
    this.list.forEach((v, i) => {
      if (!this.shows(item, v, undefined, `#${i + 1}`)) return;
      const key = String(i);
      keep.add(key);
      rows.push(
        this.kid(key, item, `#${i + 1}`, { ...this.childProps(i, false), value: v }, (field) => {
          const row = el('div', 'record-row');
          row.append(field.el, button('×', 'remove the entry', () => this.send(this.list.filter((_, j) => j !== i))));
          return row;
        }),
      );
    });
    this.dropKids(keep);
    order(this.body!, rows);
    this.foot!.hidden = !!this.childQuery;
  }

  /** a row of inputs: a tuple (`item` undefined: one schema per place) or a primitive list */
  private updateInline(item: JsonSchema | undefined, count: number) {
    const list = this.list;
    while (this.inputs.length > count) this.inputs.pop()!.remove();
    while (this.inputs.length < count) {
      const i = this.inputs.length;
      const s = item ?? this.schema.prefixItems![i];
      const set = (raw: string) => {
        const next = [...this.list];
        next[i] = s.type === 'string' ? raw : Number(raw);
        this.send(next);
      };
      let input: HTMLInputElement;
      if (s.type === 'string') {
        input = el('input');
        input.type = 'text';
        ownUndo(input);
        input.addEventListener('change', () => set(input.value));
      } else input = this.numberInput(s, (v) => set(String(v)));
      this.inputs.push(input);
      this.body!.append(input);
    }
    this.inputs.forEach((input, i) => this.setValue(input, list[i]));
    this.keyEl!.classList.toggle('hit', this.selfHit);
  }

  private updateUnion() {
    const i = branchOf(this.schema, this.shown);
    if (i !== this.branch) {
      this.branch = i;
      this.dropKids(new Set());
    }
    const row = this.kid('branch', this.schema.anyOf![i], this.label, { ...this.props, issues: this.subIssues }, undefined, this.path);
    if (row.parentElement !== this.body) this.body!.prepend(row);
    patch(this.variant!, 'value', String(i));
  }

  private updateLeaf() {
    const v = this.shown;
    this.keyEl!.classList.toggle('hit', this.selfHit);
    switch (this.kind) {
      case 'number':
      case 'string': {
        const input = this.inputs[0];
        this.setValue(input, v ?? '');
        input.classList.toggle('inherited', this.inherited);
        if (this.kind === 'string') {
          const q = this.props.query;
          input.classList.toggle('hit', !!q && typeof v === 'string' && v.toLowerCase().includes(q));
          if (this.swatch) patch(this.swatch, 'value', typeof v === 'string' && /^#[0-9a-f]{6}/i.test(v) ? v.slice(0, 7).toLowerCase() : '#000000');
        }
        break;
      }
      case 'enum':
        patch(this.select!, 'value', String(v ?? ''));
        this.select!.classList.toggle('inherited', this.inherited);
        break;
      case 'boolean':
        patch(this.inputs[0], 'checked', !!v);
        break;
    }
  }

  /** writes a value only when it changed since the last write, so a value being typed stays */
  private setValue(input: HTMLInputElement, v: unknown) {
    const text = v === undefined || v === null ? '' : String(v);
    if (input.dataset.shown !== text) {
      input.dataset.shown = text;
      input.value = text;
    }
  }
}

const STYLES = `
:host { display: block; }
.group { border-inline-start: 2px solid #f0d9c0; padding-inline-start: 8px; margin-block: 4px; }
.group.root { border: 0; padding: 0; margin: 0; }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin-block: 4px 2px; }
.key { font-family: ui-monospace, monospace; font-weight: 600; color: #5a3a10; min-inline-size: 96px; }
.key:empty { display: none; }
.desc { color: #7a6a5a; flex-basis: 100%; font-size: 11px; }
.field { display: flex; align-items: center; gap: 6px; padding-block: 1px; flex-wrap: wrap; }
.field[hidden] { display: none; }
.field.optional .key { color: #a08a70; font-weight: 400; }
.record-row { display: flex; align-items: flex-start; gap: 4px; }
.record-row > .sf { flex: 1; min-inline-size: 0; }
.inline, .inline-buttons { display: inline-flex; flex-wrap: wrap; gap: 2px; }
.field .inline input { inline-size: 48px; }
input[type='number'], input[type='text'], select { font: inherit; padding: 2px 4px; border: 1px solid #d9c3a6; border-radius: 3px; inline-size: 88px; background: #fff; }
input.hex { font-family: ui-monospace, monospace; }
input.newkey { inline-size: 120px; }
.inherited { color: #8a7a6a; font-style: italic; background: #fffdf9; }
.swatch { inline-size: 22px; block-size: 18px; padding: 0; border: 1px solid #0003; border-radius: 3px; background: none; cursor: pointer; }
.issue { margin: 2px 0 4px; color: #c0392b; font-size: 11px; }
.sf.has-issue > .field input, .sf.has-issue > .field select { border-color: #c0392b; background: #fff0f0; }
.key.hit, input.hit { background: #ffe08a; border-radius: 2px; }
.badge { font-size: 10px; color: #8a7a6a; border: 1px solid #e2c6a6; border-radius: 3px; padding: 0 4px; }
.mini { font: inherit; font-size: 11px; padding: 1px 6px; border: 1px solid #e2c6a6; border-radius: 3px; background: #fff; cursor: pointer; }
.mini.reset { color: #b36b00; }
.union { display: flex; align-items: flex-start; gap: 4px; }
.union > .sf { flex: 1; min-inline-size: 0; }
select.variant { inline-size: auto; font-size: 10px; }
code { font-size: 11px; }
`;

/**
 * Mounts the form for `schema` into a shadow root of `element`. Each edit
 * calls `onChange`; the caller writes it into the recipe and calls `update`
 * with the new value.
 */
export function mountSchemaForm(
  element: HTMLElement,
  options: {
    schema: JsonSchema;
    onChange(change: FieldChange): void;
    /** where `schema` sits in the recipe, for a form of one section. Default `[]` */
    path?: Path;
  },
): SchemaForm {
  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
  const style = el('style');
  style.textContent = STYLES;
  const field = new Field(options.schema, options.path ?? [], '', (c) => options.onChange(c));
  root.replaceChildren(style, field.el);
  return {
    update(view) {
      field.update({ value: view.value, base: view.base, query: (view.query ?? '').toLowerCase(), issues: view.issues ?? [] });
    },
    destroy() {
      field.destroy();
      root.replaceChildren();
    },
  };
}
