/**
 * Scope `root`: the model applies on :root as well as under [data-mode], so
 * one build serves pages without the attribute. Default `attribute` is
 * today's output. The render table the recipe writes is all a consumer
 * needs: @formtrieb/tokens-cli renders the tree with it to the same CSS.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runPipeline } from '@formtrieb/tokens-cli';
import { describe, expect, it } from 'vitest';
import { generateModel } from '../src/index.js';
import { loadRecipe } from './fixture.js';

const recipe = loadRecipe();
const rules = (scope?: 'attribute' | 'root', attributeSuffix?: string) =>
  JSON.parse(generateModel(recipe, { prefix: 'mp-', attributeSuffix, scope }).files['render.json'])
    .rules as { theme: string; selector: string; media?: string }[];
const selectorOf = (rs: ReturnType<typeof rules>, theme: string, media?: string) =>
  rs.filter((r) => r.theme === theme && r.media === media).map((r) => r.selector);

describe('scope', () => {
  it('is attribute by default: the same render table as without the option', () => {
    expect(rules('attribute')).toEqual(rules());
    expect(selectorOf(rules(), 'Model/Base')).toEqual(['[data-mode-x]']);
  });

  it('root puts Light and the default sets on :root, Dark stays an attribute', () => {
    const rs = rules('root', '');
    expect(selectorOf(rs, 'Mode/Light')).toEqual([':root, [data-mode="Light"]']);
    expect(selectorOf(rs, 'Mode/Dark')).toEqual(['[data-mode="Dark"]']);
    expect(selectorOf(rs, 'Model/Base')).toEqual([':root, [data-mode]']);
    expect(selectorOf(rs, 'Contrast/Forced', '(forced-colors: active)')).toEqual([':root, [data-mode]']);
    expect(selectorOf(rs, 'Pointer/Coarse', '(pointer: coarse)')).toEqual([':root, [data-mode]']);
    expect(selectorOf(rs, 'Direction/Rtl')).toEqual([
      ':root[dir="rtl"], [dir="rtl"] [data-mode], [data-mode][dir="rtl"]',
    ]);
    // options that are not the default stay attributes
    expect(selectorOf(rs, 'Shape/Round')).toEqual(['[data-shape="round"]']);
  });

  it('declares Base again on every [data-mode], so a nested Dark resolves the aliases against Dark', () => {
    const css = generateModel(recipe, { prefix: 'mp-', attributeSuffix: '', scope: 'root' }).files['model.css'];
    // Base is aliases onto mode tokens …
    expect(css).toMatch(/:root, \[data-mode\] \{[^}]*--mp-ctl-primary-background-idle: var\(--mp-accent-fill\);/);
    // … and the Dark block redefines what they point at, on the nested element
    expect(css).toMatch(/\[data-mode="Dark"\] \{[^}]*--mp-accent-fill: #/);
    // Base's own block matches that nested element too: `[data-mode]`
    const base = /([^{}]+)\{[^}]*--mp-ctl-primary-background-idle/.exec(css)![1].trim();
    expect(base.split(',').map((s) => s.trim())).toContain('[data-mode]');
  });

  it('renders through @formtrieb/tokens-cli to the same CSS (prefix, selectors, declarations)', async () => {
    const out = generateModel(recipe, { prefix: 'mp-', attributeSuffix: '', scope: 'root' });
    const dir = mkdtempSync(join(tmpdir(), 'recipe-scope-'));
    for (const [name, text] of Object.entries(out.files)) {
      const file = join(dir, 'model', name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    const log = console.log;
    console.log = () => {};
    try {
      await runPipeline(
        {
          prefix: 'mp-',
          paths: {
            tokens: join(dir, 'model', 'tokens'),
            output: join(dir, 'css'),
            tokenMap: join(dir, 'css', 'token-map.json'),
          },
          render: join(dir, 'model', 'render.json'),
        },
        { only: ['themes'] },
      );
    } finally {
      console.log = log;
    }
    expect(readFileSync(join(dir, 'css', 'model.css'), 'utf8')).toBe(out.files['model.css']);
  });
});
