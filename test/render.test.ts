/**
 * model.css comes from @formtrieb/tokens-render: the generator writes the
 * DTCG tree and the render table (render.json), the renderer turns them into
 * CSS. The golden master pins the result; these tests pin the seam — the
 * table, the options, and that prefix and attribute names are parameters
 * that never reach the tree.
 */
import { renderVariables } from '@formtrieb/tokens-render';
import { describe, expect, it } from 'vitest';
import {
  generateModel,
  renderOptions,
  tokenSystem,
  type RenderTable,
} from '../src/index.js';
import { loadRecipe } from './fixture.js';

describe('model.css from @formtrieb/tokens-render', () => {
  const recipe = loadRecipe();
  const out = generateModel(recipe);
  const table: RenderTable = JSON.parse(out.files['render.json']);
  const system = tokenSystem(out.files);

  it('writes every file the table names', () => {
    for (const file of new Set(table.rules.map((r) => r.file)))
      expect(out.files[file], file).toContain('{');
    expect(out.files['model.css']).toContain('--x-pole-ink:');
  });

  it('writes no typography companions (canonical dialect)', () => {
    expect(out.files['model.css']).not.toMatch(
      /-(letter-spacing|text-transform|text-decoration|fvn): /,
    );
  });

  it('names only themes that $themes.json defines', () => {
    const ids = new Set(system.themes.map((t) => `${t.group}/${t.name}`));
    for (const r of table.rules) expect(ids, r.theme).toContain(r.theme);
  });

  it('takes prefix and attribute suffix from the options', () => {
    const own = generateModel(recipe, { prefix: 'ds-', attributeSuffix: '' });
    const css = own.files['model.css'];
    expect(css).toContain(
      '  --ds-ctl-primary-background-idle: var(--ds-accent-fill);',
    );
    expect(css).toContain('[data-mode="Light"] {');
    expect(css).toContain('[data-shape="square"] {');
    expect(css).not.toContain('--x-');
    expect(css).not.toMatch(/data-[a-z-]+-x\b/);
    expect(JSON.parse(own.files['render.json']).options.prefix).toBe('ds-');
    expect(JSON.parse(own.files['token-map.json']).prefix).toBe('--ds-');
  });

  it('keeps prefix and attributes out of the tree', () => {
    const own = generateModel(recipe, { prefix: 'ds-', attributeSuffix: '' });
    for (const [name, content] of Object.entries(out.files))
      if (name.startsWith('tokens/'))
        expect(own.files[name], name).toBe(content);
  });

  it('resolves references to literals when the rule says so', () => {
    const css = renderVariables(
      system,
      [
        {
          theme: 'Model/Base',
          selector: ':root',
          references: false,
          file: 'f.css',
        },
      ],
      renderOptions('x-'),
    ).get('f.css');
    expect(css).not.toContain('var(--');
    expect(css).toMatch(/--x-ctl-primary-background-idle: #[0-9a-f]{6}/);
  });
});
