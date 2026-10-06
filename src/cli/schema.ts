/**
 * The recipe schema as JSON Schema — for `$schema` in a recipe file, so an
 * editor validates and completes it. Written from the zod schema; the
 * descriptions are the help texts.
 */
import { z } from 'zod';
import { RecipeSchema } from '../recipe.schema.js';

export const recipeJsonSchema = (): string =>
  JSON.stringify(z.toJSONSchema(RecipeSchema), null, 2) + '\n';
