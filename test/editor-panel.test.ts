// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountRecipePanel, type PanelState, type RecipeDoc } from '../src/editor/index.js';
import { fixture } from './fixture.js';

const HOSTILE = '<img src=x onerror=alert(1)>';

function setup(options: { file?: boolean; link?: boolean; recipe?: RecipeDoc } = {}) {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const states: PanelState[] = [];
  const recipes: RecipeDoc[] = [];
  const panel = mountRecipePanel(host, {
    recipe: options.recipe ?? (fixture() as RecipeDoc),
    generate: { attributeSuffix: '-x' },
    onChange: (s) => states.push(s),
    onRecipe: (d) => recipes.push(d),
    file: options.file,
    link: options.link,
  });
  const root = host.shadowRoot!;
  const buttons = () => [...root.querySelectorAll('button')].map((b) => b.textContent);
  return { host, panel, root, states, recipes, buttons };
}

describe('recipe panel', () => {
  it('hands out a state the preview can show, and the recipe on every change', () => {
    const { panel, root, states, recipes } = setup({ link: false });
    const first = panel.getState();
    expect(first.css).toContain('--x-');
    expect(first.mode).toBe('Light');
    expect(first.attributeSuffix).toBe('-x');
    expect(first.run?.recipe).toBeDefined();
    expect(states.at(-1)).toEqual(first);
    const chroma = root.querySelector<HTMLInputElement>('.tab label.row input')!;
    chroma.value = '0.3';
    chroma.dispatchEvent(new Event('input'));
    expect((recipes.at(-1) as { chromaMax: number }).chromaMax).toBe(0.3);
    expect(panel.getState().css).not.toBe(first.css);
    panel.destroy();
  });

  it('switches mode and overlays into the state', () => {
    const { panel, root } = setup({ link: false });
    [...root.querySelectorAll<HTMLButtonElement>('.toolbar .seg button')].find((b) => b.textContent === 'Dark')!.click();
    expect(panel.getState().mode).toBe('Dark');
    const box = root.querySelector<HTMLInputElement>('.overlays input[type=checkbox]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(Object.keys(panel.getState().overlays)).toEqual([box.dataset.attribute]);
    panel.destroy();
  });

  it('undoes with ⌘Z from a number field and keeps the browser undo in text fields', () => {
    const { panel, root, recipes } = setup({ link: false });
    const chroma = root.querySelector<HTMLInputElement>('.tab label.row input')!;
    chroma.value = '0.3';
    chroma.dispatchEvent(new Event('change', { bubbles: true }));
    const z = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, composed: true, cancelable: true });
    root.querySelector<HTMLInputElement>('input.hex, .tab input[type=text]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, composed: true }));
    expect((recipes.at(-1) as { chromaMax: number }).chromaMax).toBe(0.3);
    chroma.dispatchEvent(z);
    expect(z.defaultPrevented).toBe(true);
    expect((recipes.at(-1) as { chromaMax: number }).chromaMax).toBe((fixture() as { chromaMax: number }).chromaMax);
    panel.redo();
    expect((recipes.at(-1) as { chromaMax: number }).chromaMax).toBe(0.3);
    panel.destroy();
  });

  it('leaves out file and link when the host keeps them', () => {
    const on = setup({ link: false });
    expect(on.buttons()).toEqual(expect.arrayContaining(['Open…', 'All (.zip)']));
    on.panel.destroy();
    const off = setup({ file: false, link: false });
    expect(off.buttons()).not.toContain('Open…');
    expect(off.buttons()).not.toContain('All (.zip)');
    expect(off.buttons()).not.toContain('Copy link');
    off.panel.destroy();
  });

  it('shows the recipe tab with a section per schema property and the error count on an invalid recipe', () => {
    const { panel, root } = setup({ link: false });
    panel.setRecipe({ ...(fixture() as object), chromaMax: 'much' });
    const jump = root.querySelector<HTMLButtonElement>('.status button.jump')!;
    expect(jump.textContent).toMatch(/recipe invalid \(1\)/);
    jump.click();
    const sections = root.querySelectorAll('.tab.form details');
    expect(sections.length).toBeGreaterThan(20);
    const chroma = [...sections].find((d) => d.querySelector('summary code')!.textContent === 'chromaMax')!;
    expect((chroma as HTMLDetailsElement).open).toBe(true);
    expect(panel.getState().run).toBeDefined(); // the last good run stays
    panel.destroy();
  });

  it('shows names from a recipe as text', () => {
    const doc = fixture() as { hues: { name: string }[] };
    doc.hues[0].name = HOSTILE;
    const { panel, root } = setup({ link: false, recipe: doc as unknown as RecipeDoc });
    expect(root.querySelector('img')).toBeNull();
    expect([...root.querySelectorAll('table.hues code')].map((c) => c.textContent)).toContain(HOSTILE);
    root.querySelectorAll<HTMLButtonElement>('.tabs button')[2].click(); // JSON
    expect(root.querySelector<HTMLTextAreaElement>('textarea.json')!.value).toContain(HOSTILE);
    panel.destroy();
  });
});

describe('recipe link', () => {
  it('packs and unpacks a recipe, and refuses a link that unpacks to more than the limit', async () => {
    const { pack, unpack } = await import('../src/editor/panel.js');
    const doc = fixture() as RecipeDoc;
    expect(await unpack(await pack(doc))).toEqual(doc);
    // a few hundred bytes of link that inflate to megabytes
    const bomb = await pack({ pad: 'x'.repeat(4 << 20) });
    expect(bomb.length).toBeLessThan(20_000);
    await expect(unpack(bomb)).rejects.toThrow(/more than/);
  });
});

describe('pointer gestures', () => {
  it('capture the pointer on a slider, so the gesture ends even when released elsewhere', () => {
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    const panel = mountRecipePanel(host, { recipe: fixture() as RecipeDoc, link: false });
    const range = host.shadowRoot!.querySelector<HTMLInputElement>('td.hue input[type=range]')!;
    const captured: number[] = [];
    range.setPointerCapture = (id: number) => void captured.push(id);
    range.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, composed: true }));
    host.shadowRoot!.querySelector('button')!.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, bubbles: true, composed: true }));
    expect(captured).toEqual([7]);
    panel.destroy();
  });
});
