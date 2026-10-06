// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { emptyFor, mountSchemaForm, settled, type FieldChange, type FieldIssue, type JsonSchema } from '../src/editor/schema-form.js';
import { generateModel, overlay, parseRecipe, RecipeError, RecipeSchema, recipeDefaults } from '../src/index.js';
import { fixture } from './fixture.js';

const schema = z.toJSONSchema(RecipeSchema) as JsonSchema;
const HOSTILE = '<img src=x onerror=alert(1)>';

function setup(value: unknown = fixture(), issues: FieldIssue[] = [], query = '') {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const changes: FieldChange[] = [];
  const form = mountSchemaForm(host, { schema, onChange: (c) => changes.push(c) });
  form.update({ value, base: recipeDefaults, issues, query });
  const root = host.shadowRoot!;
  const field = (path: string) => root.querySelector<HTMLElement>(`.sf[data-path="${path}"]`)!;
  const input = (path: string, sel = 'input') => field(path).querySelector<HTMLInputElement>(sel)!;
  return { host, form, root, field, input, changes };
}
const type = (input: HTMLInputElement, value: string, event = 'input') => {
  input.value = value;
  input.dispatchEvent(new Event(event, { bubbles: true }));
};

describe('schema form', () => {
  it('renders every kind of field the recipe schema has', () => {
    const { field, input } = setup();
    expect(field('steps').querySelector('code')!.textContent).toBe('12');
    expect(input('chromaMax').type).toBe('number');
    expect(input('hues.0.name').type).toBe('text');
    expect(input('poles.light.ink', 'input[type=color]')).not.toBeNull();
    expect(field('modes.light.lightness').querySelectorAll('.inline input').length).toBe(12);
    expect(field('contract.readingCh').querySelectorAll('.inline input').length).toBeGreaterThan(1);
    expect(input('type.scaling.strategy', 'select')).not.toBeNull();
    expect(field('onFill.light').querySelector('select.variant')).not.toBeNull();
    expect(field('hierarchies').querySelectorAll(':scope > .group > .rows > .record-row').length).toBeGreaterThan(0);
  });

  it('shows overrides against the defaults: inherited in italics, overridden with a reset', () => {
    const fx = fixture() as { contract: object };
    const doc = { ...fx, contract: { ...fx.contract, typeMinPx: 14 } };
    const { field, input, changes } = setup(doc);
    expect(input('contract.typeMinPx').classList.contains('inherited')).toBe(false);
    expect(input('contract.motionMaxMs').classList.contains('inherited')).toBe(true);
    expect(field('contract.textMin').querySelector('.reset, .badge')).toBeNull(); // no default to compare with
    const reset = field('contract.typeMinPx').querySelector<HTMLButtonElement>('.reset')!;
    expect(reset.title).toMatch(/^default: /);
    expect(input('contract.readingCh').classList.contains('inherited') || field('contract.readingCh').querySelector('.badge')).toBeTruthy();
    expect(field('status').querySelector('.badge')!.textContent).toBe('default');
    reset.click();
    expect(changes.at(-1)).toEqual({ path: ['contract', 'typeMinPx'], value: undefined });
  });

  it('sends each edit as path and value', () => {
    const { field, input, changes } = setup();
    type(input('chromaMax'), '0.');
    expect(changes).toEqual([]); // not a finished number yet
    type(input('chromaMax'), '0.3');
    expect(changes.at(-1)).toEqual({ path: ['chromaMax'], value: 0.3 });
    type(input('hues.0.name'), 'sky', 'change');
    expect(changes.at(-1)).toEqual({ path: ['hues', 0, 'name'], value: 'sky' });
    const select = input('type.scaling.strategy', 'select') as unknown as HTMLSelectElement;
    select.value = select.options[select.options.length - 1].value;
    select.dispatchEvent(new Event('change'));
    expect(changes.at(-1)!.path).toEqual(['type', 'scaling', 'strategy']);
    const ladder = field('modes.light.lightness').querySelectorAll<HTMLInputElement>('.inline input');
    type(ladder[2], '0.5');
    expect((changes.at(-1)!.value as number[])[2]).toBe(0.5);
    field('hues').querySelector<HTMLButtonElement>(':scope > .group > .foot button')!.click();
    expect(changes.at(-1)!.path).toEqual(['hues']);
    expect((changes.at(-1)!.value as unknown[]).length).toBe((fixture() as { hues: unknown[] }).hues.length + 1);
  });

  it('keeps the alpha of #rrggbbaa when a colour is picked', () => {
    const doc = fixture() as { poles: { light: { ink: string } } };
    doc.poles.light.ink = '#11223380';
    const { input, changes } = setup(doc);
    type(input('poles.light.ink', 'input[type=color]'), '#ff0000');
    expect(changes.at(-1)).toEqual({ path: ['poles', 'light', 'ink'], value: '#ff000080' });
  });

  it('shows a fixed union value as that branch, even where a text branch would fit too', () => {
    const doc = fixture() as { onFill: Record<string, unknown> };
    doc.onFill.light = 'auto';
    const { field } = setup(doc);
    expect(field('onFill.light').querySelector('code')!.textContent).toBe('auto');
    expect(field('onFill.light').querySelector<HTMLSelectElement>('select.variant')!.selectedOptions[0].textContent).toBe('auto');
  });

  it('switches a union to the starting value of the other branch', () => {
    const { field, changes } = setup();
    const variant = field('onFill.light').querySelector<HTMLSelectElement>('select.variant')!;
    const other = [...variant.options].find((o) => !o.selected)!;
    variant.value = other.value;
    variant.dispatchEvent(new Event('change'));
    expect(changes.at(-1)!.path).toEqual(['onFill', 'light']);
  });

  it('offers unset properties and record entries', () => {
    const { field, changes } = setup();
    const optional = field('hues.0').querySelector<HTMLElement>('.field.optional')!;
    optional.querySelector('button')!.click();
    expect(changes.at(-1)!.path).toEqual(['hues', 0, optional.querySelector('.key')!.textContent]);
    const foot = field('semanticHues').querySelector(':scope > .group > .foot')!;
    const key = foot.querySelector<HTMLInputElement>('input.newkey')!;
    key.value = 'extra';
    foot.querySelector('button')!.click();
    expect(changes.at(-1)).toEqual({ path: ['semanticHues', 'extra'], value: emptyFor({ type: 'string' }) });
  });

  it('puts an issue at its field, and one for a key the form does not render at the parent', () => {
    const issues = [
      { path: ['contract', 'textMin'], message: 'below WCAG' },
      { path: ['hues', '0', 'nope'], message: 'unknown' },
    ];
    const { field } = setup(fixture(), issues);
    expect(field('contract.textMin').classList.contains('has-issue')).toBe(true);
    expect(field('contract.textMin').querySelector('.issue')!.textContent).toBe('✗ below WCAG');
    expect(field('contract').querySelector(':scope > .issues .issue')).toBeNull();
    expect(field('hues.0').querySelector(':scope > .issues .issue')!.textContent).toBe('✗ nope: unknown');
  });

  it('puts real RecipeError issues, from schema and generator, at the field of their path', () => {
    const issuesOf = (doc: unknown) => {
      try {
        generateModel(parseRecipe(overlay(recipeDefaults, doc)));
      } catch (e) {
        if (e instanceof RecipeError) return e.issues;
        throw e;
      }
      throw new Error('expected a RecipeError');
    };
    const bad = fixture() as { chromaMax: unknown; hierarchies: Record<string, { hue: string; style: string }> };
    bad.chromaMax = 'much';
    const schemaIssues = issuesOf(bad);
    const invented = fixture() as typeof bad;
    const first = Object.keys(invented.hierarchies)[0];
    invented.hierarchies[first] = { ...invented.hierarchies[first], hue: 'invented' };
    const generatorIssues = issuesOf(invented);
    for (const [doc, issues] of [[bad, schemaIssues], [invented, generatorIssues]] as const) {
      expect(issues.length).toBeGreaterThan(0);
      const { root } = setup(doc, issues);
      for (const issue of issues) {
        // the deepest field on the issue's path carries it
        let path = issue.path.join('.');
        while (path && !root.querySelector(`.sf[data-path="${path}"]`)) path = path.split('.').slice(0, -1).join('.');
        const at = root.querySelector(`.sf[data-path="${path}"]`)!;
        expect(at.classList.contains('has-issue'), `${issue.path.join('.')} at ${path}`).toBe(true);
        expect([...at.querySelectorAll(':scope > .issues .issue, :scope > .field + .issues .issue')].some((p) => p.textContent!.includes(issue.message))).toBe(true);
      }
    }
    expect(schemaIssues.some((i) => i.path.join('.') === 'chromaMax')).toBe(true);
  });

  it('shows only what matches the search, marked', () => {
    const { field, root } = setup(fixture(), [], 'readingch');
    expect(field('contract.readingCh').querySelector('.key')!.classList.contains('hit')).toBe(true);
    expect(root.querySelector('.sf[data-path="hues"]')).toBeNull();
    expect(root.querySelector('.sf[data-path="contract.textMin"]')).toBeNull();
  });

  it('shows a hierarchy named <img src=x onerror=alert(1)> as text, from any source', () => {
    const doc = fixture() as { hierarchies: Record<string, unknown>; hues: { name: string }[] };
    doc.hierarchies[HOSTILE] = { hue: HOSTILE, style: 'solid' };
    doc.hues[0].name = `"><script>alert(1)</script>`;
    const { root, field } = setup(doc);
    expect(root.querySelector('img, script')).toBeNull();
    const keys = [...field('hierarchies').querySelectorAll('.key')].map((k) => k.textContent);
    expect(keys).toContain(HOSTILE);
    expect(root.querySelector<HTMLInputElement>(`.sf[data-path="hues.0.name"] input`)!.value).toBe(`"><script>alert(1)</script>`);
  });

  it('patches in place: the input being typed in stays the same node, with its text', () => {
    const { form, input, changes } = setup();
    const before = input('chromaMax');
    type(before, '0.31');
    const doc = { ...(fixture() as object), chromaMax: changes.at(-1)!.value };
    form.update({ value: doc, base: recipeDefaults });
    expect(input('chromaMax')).toBe(before);
    expect(before.value).toBe('0.31');
    type(before, '0.310', 'input'); // not settled as typed: no emit, and the next update keeps the text
    form.update({ value: doc, base: recipeDefaults });
    expect(before.value).toBe('0.310');
  });

  it('lets ⌘Z in a text field stay with the browser, not with the panel', () => {
    const { host, input } = setup();
    const seen: string[] = [];
    host.addEventListener('keydown', (e) => seen.push((e.target as HTMLElement).tagName + ':' + (e.target as HTMLInputElement).type));
    input('hues.0.name').dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, composed: true }));
    input('chromaMax').dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, composed: true }));
    expect(seen).toHaveLength(1);
  });

  it('settled() takes finished numbers only', () => {
    expect(['1', '0.5', '-2', '12'].every(settled)).toBe(true);
    expect(['', '0.', '0.50', '1e', '-'].some(settled)).toBe(false);
  });
});
