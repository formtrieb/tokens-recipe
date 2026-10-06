/**
 * The test recipe: the package defaults with a synthetic design system on
 * top (fixtures/recipe.json — neutral hues, system fonts, no real brand).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlay, parseRecipe, recipeDefaults, type Recipe } from '../src/index.js';

export const fixture = (): unknown =>
  JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'recipe.json'), 'utf8'),
  );

export const loadRecipe = (): Recipe =>
  parseRecipe(overlay(recipeDefaults, fixture()));
