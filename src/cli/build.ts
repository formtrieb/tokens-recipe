#!/usr/bin/env node
/**
 * CLI shell around generateModel: loads a recipe file on top of the package
 * defaults, validates it, writes every artefact into the output directory
 * and prints the report.
 *
 *   tokens-recipe <recipe.json> [--out <dir>] [--prefix <p>] [--attribute-suffix <s>] [--scope attribute|root]
 *   tokens-recipe --schema <file>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import recipeDefaults from '../../defaults.json' with { type: 'json' };
import { generateModel } from '../model.js';
import { overlay, parseRecipe, RecipeError } from '../recipe.js';
import { recipeJsonSchema } from './schema.js';

const USAGE = `usage:
  tokens-recipe <recipe.json> [--out <dir>] [--prefix <p>] [--attribute-suffix <s>] [--scope attribute|root]
  tokens-recipe --schema <file>`;

function write(file: string, content: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function main(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', default: 'tokens-model' },
      prefix: { type: 'string' },
      'attribute-suffix': { type: 'string' },
      scope: { type: 'string' },
      schema: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.schema) {
    write(resolve(values.schema), recipeJsonSchema());
    console.log(`JSON Schema written: ${values.schema}`);
    return 0;
  }
  if (
    positionals.length !== 1 ||
    (values.scope !== undefined && !['attribute', 'root'].includes(values.scope))
  ) {
    console.error(USAGE);
    return 2;
  }
  const ds = JSON.parse(readFileSync(resolve(positionals[0]), 'utf8'));
  try {
    const { files, log } = generateModel(
      parseRecipe(overlay(recipeDefaults, ds)),
      {
        prefix: values.prefix,
        attributeSuffix: values['attribute-suffix'],
        scope: values.scope as 'attribute' | 'root' | undefined,
      },
    );
    const dest = resolve(values.out);
    for (const [name, content] of Object.entries(files))
      write(resolve(dest, name), content);
    console.log(log.join('\n'));
    return 0;
  } catch (e) {
    if (e instanceof RecipeError) {
      console.error(e.message);
      return 1;
    }
    throw e;
  }
}

process.exitCode = main();
