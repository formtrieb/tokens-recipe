/**
 * Motion roles for waiting: delay-skeleton (a delay), pulse and progress
 * (loops). Optional per character: without a duration of its own a role reads
 * its partner's (a reference), so a recipe from before keeps working. Loops
 * and delays may run longer than motionMaxMs; gesture-bound transitions not.
 */
import { describe, expect, it } from 'vitest';
import { generateModel, overlay, parseRecipe, RecipeError, recipeDefaults } from '../src/index.js';
import { fixture } from './fixture.js';

type Doc = Record<string, any>;
const build = (edit: (d: Record<string, Record<string, number>>) => void) => {
  const doc = structuredClone(fixture()) as Doc;
  const durations = Object.fromEntries(
    Object.entries(doc.motion.characters).map(([n, c]) => [n, (c as Doc).durations]),
  );
  edit(durations);
  return generateModel(parseRecipe(overlay(recipeDefaults, doc)));
};
const fails = (out: ReturnType<typeof build>) =>
  out.log.filter((l) => l.includes('✗') && /Dauer|träge|Rolle/.test(l));

describe('wait motion roles', () => {
  it('fall back to their partner as a reference; reduced is the role’s own', () => {
    const out = build((d) => {
      for (const c of Object.values(d)) for (const r of ['delay-skeleton', 'pulse', 'progress']) delete c[r];
    });
    const css = out.files['model.css'];
    expect(css).toContain('--x-motion-delay-skeleton-duration: var(--x-motion-delay-hint-duration);');
    expect(css).toContain('--x-motion-pulse-duration: var(--x-motion-loop-duration);');
    expect(css).toContain('--x-motion-progress-duration: var(--x-motion-loop-duration);');
    const reduced = JSON.parse(out.files['tokens/Motion/Productive-Reduced.json']).motion;
    // pulse is off under reduced motion, though loop is only slowed
    expect(reduced.pulse.duration.$value).toBe('{duration.instant}');
    // progress slows from loop's scale value, not from loop's (already slowed) token
    expect(reduced.progress.duration.$value).toBe('calc({duration.800} * 2)');
    expect(reduced['delay-skeleton']).toBeUndefined();
    expect(fails(out)).toEqual([]);
  });

  it('take a duration of their own from the recipe', () => {
    const css = build(() => {}).files['model.css'];
    expect(css).toContain('--x-motion-delay-skeleton-duration: var(--x-duration-300);');
    expect(css).toContain('--x-motion-pulse-easing: var(--x-easing-standard);');
    expect(css).toContain('--x-motion-progress-easing: var(--x-easing-linear);');
  });

  it('allow loops and delays above motionMaxMs, but no gesture-bound transition', () => {
    expect(fails(build((d) => (d.productive.pulse = 1000)))).toEqual([]);
    expect(fails(build((d) => (d.productive['enter-md'] = 800)))).toEqual([
      '  ✗ productive.enter-md: 800 ms > 500 ms (wirkt träge)',
    ]);
  });

  it('keep the scale rule as before: off the scale stops, like any role', () => {
    const stop = (role: string) => () => build((d) => (d.productive[role] = 1100));
    expect(stop('progress')).toThrow(RecipeError);
    expect(stop('progress')).toThrow(/duration-1100 .*aus motion\.progress\.duration/);
    expect(stop('loop')).toThrow(/duration-1100 .*aus motion\.loop\.duration/);
  });

  it('keep the roles without a partner required, as before (no duration, no token)', () => {
    expect(() => build((d) => delete d.productive.loop)).toThrow(/duration-undefined .*aus motion\.loop\.duration/);
  });
});
