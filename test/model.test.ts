/**
 * Golden master for the generator: every artefact of the test recipe must
 * come out exactly as committed under __snapshots__/golden/. model.css is
 * rendered from the DTCG tree, so its snapshot is also the proof that the
 * tree is complete. A deliberate change to the recipe or the generator
 * updates them with `vitest -u`, and the diff shows what moved.
 */
import { describe, expect, it } from 'vitest';
import { generateModel, parseRecipe } from '../src/index.js';
import { loadRecipe } from './fixture.js';

describe('generateModel', () => {
  const recipe = loadRecipe();
  const out = generateModel(recipe);

  it('produces the committed artefacts (golden master)', async () => {
    expect(Object.keys(out.files)).toEqual(
      expect.arrayContaining([
        '_breakpoints.scss',
        '_containers.scss',
        'breakpoints.json',
        'containers.json',
        'control-figma.json',
        'model-report.json',
        'model.css',
        'motion-figma.json',
        'type-figma.json',
        'tokens/$metadata.json',
        'tokens/$themes.json',
        'render.json',
        'tokens/Model/Base.json',
        'token-map.json',
      ]),
    );
    for (const [name, content] of Object.entries(out.files))
      await expect(content).toMatchFileSnapshot(`__snapshots__/golden/${name}`);
    await expect(out.log.join('\n') + '\n').toMatchFileSnapshot(
      '__snapshots__/golden/report.txt',
    );
  });

  it('keeps every contract (no ✗, no "verletzt")', () => {
    expect(out.log.filter((l) => l.includes('✗'))).toEqual([]);
    expect(out.log.filter((l) => l.includes('verletzt'))).toEqual([]);
  });

  it('is deterministic: a second run is identical', () => {
    expect(generateModel(loadRecipe())).toEqual(out);
  });

  it('stops on a threshold below WCAG', () => {
    const weak = parseRecipe({
      ...recipe,
      contract: { ...recipe.contract, textMin: 4 },
    });
    expect(() => generateModel(weak)).toThrow(/contract\.textMin: 4 < 4\.5/);
  });

  it('stops on an invented role name', () => {
    const odd = parseRecipe({
      ...recipe,
      spaceRoles: {
        ...recipe.spaceRoles,
        gap: { ...recipe.spaceRoles!.gap, huge: 96 },
      },
    });
    expect(() => generateModel(odd)).toThrow(/huge ist kein bekannter Name/);
  });

  it('refuses a value that would end its declaration, even past the schema', () => {
    const bad = structuredClone(recipe);
    bad.type!.families['text'] = 'Arial; } body { color: red';
    expect(() => generateModel(bad)).toThrow(/unsicherer CSS-Wert/);
  });
});
