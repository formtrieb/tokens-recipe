/**
 * The test recipe: the package defaults with a synthetic design system on
 * top (fixtures/recipe.json — neutral hues, system fonts, no real brand).
 */
import { readFileSync } from 'node:fs';
import { overlay, parseRecipe, recipeDefaults, type Recipe } from '../src/index.js';

export const fixture = (): unknown =>
  JSON.parse(
    readFileSync(new URL('./fixtures/recipe.json', import.meta.url), 'utf8'),
  );

export const loadRecipe = (): Recipe =>
  parseRecipe(overlay(recipeDefaults, fixture()));
