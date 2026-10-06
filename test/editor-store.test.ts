import { describe, expect, it } from 'vitest';
import { recipeDefaults } from '../src/index.js';
import { defaultsDiff, EditorStore, failSummary, MODEL_EVERY, STEP_PAUSE, type Clock } from '../src/editor/store.js';
import { fixture } from './fixture.js';

/** a clock the test moves by hand */
function fakeClock() {
  let t = 1000;
  let queue: { at: number; fn: () => void; id: number }[] = [];
  let ids = 0;
  const clock: Clock = {
    now: () => t,
    later: (fn, ms) => {
      const id = ++ids;
      queue.push({ at: t + ms, fn, id });
      return id;
    },
    cancel: (id) => {
      queue = queue.filter((q) => q.id !== id);
    },
  };
  const advance = (ms: number) => {
    t += ms;
    for (const q of queue.filter((q) => q.at <= t)) {
      queue = queue.filter((x) => x !== q);
      q.fn();
    }
  };
  return { clock, advance };
}
const doc = () => fixture() as Record<string, unknown>;
const store = () => {
  const c = fakeClock();
  return { ...c, s: new EditorStore({ recipe: doc(), defaults: recipeDefaults, clock: c.clock }) };
};

describe('editor store', () => {
  it('runs the model at once, then at most every MODEL_EVERY ms, and always once more at the end', () => {
    const { s, advance } = store();
    expect(s.run).toBeDefined();
    expect(failSummary(s.run!)).toBe('');
    advance(MODEL_EVERY + 1);
    s.patchField({ path: ['chromaMax'], value: 0.3 });
    expect(s.pending).toBe(false); // first change: at once
    s.patchField({ path: ['chromaMax'], value: 0.31 });
    s.patchField({ path: ['chromaMax'], value: 0.32 });
    expect(s.pending).toBe(true);
    expect((s.modelRecipe as { chromaMax: number }).chromaMax).toBe(0.3);
    advance(MODEL_EVERY);
    expect(s.pending).toBe(false);
    expect((s.modelRecipe as { chromaMax: number }).chromaMax).toBe(0.32);
  });

  it('keeps the last good run while the recipe is invalid, with the issues', () => {
    const { s, advance } = store();
    const good = s.lastGood;
    advance(MODEL_EVERY + 1);
    s.patchField({ path: ['chromaMax'], value: 'much' });
    expect(s.run).toBeUndefined();
    expect(s.lastGood).toBe(good);
    expect(s.issues.map((i) => i.path.join('.'))).toContain('chromaMax');
    expect(s.shown).toBe(good);
  });

  it('makes one undo step of a gesture and of edits within STEP_PAUSE, and redoes', () => {
    const { s, advance } = store();
    const start = s.recipe;
    s.patchField({ path: ['chromaMax'], value: 0.3 });
    advance(100);
    s.patchField({ path: ['chromaMax'], value: 0.31 }); // a typed number: same step
    advance(STEP_PAUSE + 1);
    s.startGesture();
    s.patchField({ path: ['chromaMax'], value: 0.4 });
    advance(STEP_PAUSE + 1);
    s.patchField({ path: ['chromaMax'], value: 0.41 }); // same drag, however slow
    s.endGesture();
    expect(s.past).toHaveLength(2);
    s.undo();
    expect((s.recipe as { chromaMax: number }).chromaMax).toBe(0.31);
    s.undo();
    expect(s.recipe).toBe(start);
    s.redo();
    s.redo();
    expect((s.recipe as { chromaMax: number }).chromaMax).toBe(0.41);
    s.undo();
    s.patchField({ path: ['chromaMax'], value: 0.2 });
    expect(s.future).toEqual([]);
  });

  it('writes a field into a copy of the default container, and prunes what a removal empties', () => {
    const { s } = store();
    s.patchField({ path: ['contract', 'readingCh', 1], value: 80 });
    expect((s.recipe as { contract: { readingCh: number[] } }).contract.readingCh).toEqual([45, 80]);
    const r = doc();
    delete r.contract;
    s.load(r, r);
    s.patchField({ path: ['contract', 'typeMinPx'], value: 14 });
    expect(s.recipe.contract).toEqual({ ...(recipeDefaults as { contract: object }).contract, typeMinPx: 14 });
    s.load({ ...r, extra: { only: 1 } }, r);
    s.patchField({ path: ['extra', 'only'], value: undefined });
    expect('extra' in s.recipe).toBe(false);
  });

  it('knows dirty, resets to the saved state and shows it while "before" is held', () => {
    const { s, advance } = store();
    expect(s.dirty).toBe(false);
    advance(MODEL_EVERY + 1);
    s.patchField({ path: ['chromaMax'], value: 0.3 });
    expect(s.dirty).toBe(true);
    const now = s.lastGood;
    s.setComparing(true);
    expect(s.shown).not.toBe(now);
    expect(s.shown!.css).not.toBe(now!.css);
    s.setComparing(false);
    s.reset();
    expect(s.dirty).toBe(false);
  });

  it('turns text that is no JSON into a schema error', () => {
    const { s } = store();
    s.applyJson('{ nope');
    expect(s.error).toBeDefined();
    expect(s.issues.length).toBeGreaterThan(0);
  });

  it('lists the defaults the recipe overrides and inherits', () => {
    const d = defaultsDiff({ contract: { typeMinPx: 14 } }, recipeDefaults);
    expect(d.overrides.map((o) => o.key)).toEqual(['contract.typeMinPx']);
    expect(d.inherited.some((o) => o.key === 'contract.motionMaxMs')).toBe(true);
  });
});
