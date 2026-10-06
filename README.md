# @formtrieb/tokens-recipe

**Generates a complete design-token model from a recipe: colour ramps,
roles, controls, typography, motion. The output is a Tokens-Studio tree with
its render table, and every accessibility contract is checked on the way.
Pure functions. The CSS is rendered by
[`@formtrieb/tokens-render`](https://github.com/formtrieb/tokens/tree/main/packages/render).**

## What a recipe is

A recipe is a JSON file that describes the *decisions* of a design system,
not its tokens. It names hues and how colourful they are, one lightness
ladder per mode, a size grid, a type scale, and the hue and style each
emphasis level uses. The generator turns those few hundred lines into
thousands of tokens. Their names are fixed and the same in every design
system (`ctl-primary-background-hover`, `space-gap-related`,
`type-body-md`), so components can be written once against them.

The recipe is opinionated:

- Every ramp has the same 12 OKLCH steps with fixed names and meanings
  (`canvas`, `subtle`, `tint`, … `fill`, `ink`; `STEP_NAMES`). A recipe
  chooses their values (lightness ladder, chroma curve, hue, anchor), not
  their number.
- Role names are universal. A recipe assigns values to them, and a missing
  or invented name is an error.
- Each control hierarchy is a hue × style pair (`primary` = accent, solid).
- Accessibility is part of the contract. WCAG floors (text 4.5:1,
  non-text 3:1, reading width ≤ 80ch) can be tightened by a recipe, never
  lowered. APCA is reported as a second lens and never fails a build.

[`defaults.json`](defaults.json) carries the standard every system starts
from: alpha steps, status and feedback mapping, and the contract thresholds.
A design system's recipe goes on top. Objects merge key by key, and arrays
and values replace the default as a whole.

## Layers

| Layer | From the recipe | Becomes |
|---|---|---|
| Foundation | `hues`, `modes`, `alpha`, `space`, `motion.scale` | ramps per mode, alpha ladder, `size-*`, `duration-*` |
| Selection | `semanticHues`, `poles`, `onFill`, `mark` | per mode: `{hue}-{step}`, `pole-*`, state layers, `content-*` |
| Roles | `hierarchies`, `status`, `feedback`, `spaceRoles`, `width`, `radius`, `type`, `control`, `motion`, `dataviz`, `identity`, … | `ctl-*`, `status-*`, `feedback-*`, `surface-*`, `space-*`, `type-*`, `control-*`, `motion-*`, … |
| Overlays | `radius.shapes`, `motion.characters`, `control.coarse` | sets switched by selector or media query: dark mode, RTL, reduced motion, forced colours, coarse pointer, shapes |

Components read roles only. The Foundation is there for the roles to point
at.

## Output

`generateModel(recipe, options)` returns `{ files, log }`:

| File | What |
|---|---|
| `tokens/$metadata.json`, `tokens/$themes.json`, `tokens/<Set>.json` | the Tokens-Studio tree; Tokens Studio imports it, [`@formtrieb/tokens-mcp`](https://github.com/formtrieb/tokens/tree/main/packages/mcp) reads it |
| `render.json` | the render table (which theme lands under which selector or media query) and the render options (`prefix`, `dialect: "canonical"`), in the render-file format of `@formtrieb/tokens-render`; the resolver CLI renders the tree as `model.css` does |
| `model.css` | rendered from tree and table by `@formtrieb/tokens-render` |
| `token-map.json` | Figma path → CSS variable |
| `breakpoints.json`, `_breakpoints.scss`, `containers.json`, `_containers.scss` | for media and container queries, which cannot read variables |
| `type-figma.json`, `control-figma.json`, `motion-figma.json` | px values for Figma, which has no `em`, `clamp()` or `calc()` |
| `model-report.json` | every contrast check, the cell contract, APCA notes |

`log` is the report as lines: one line per contract, and every violation
marked `✗`.

## Use

```bash
npm install @formtrieb/tokens-recipe
```

ESM only, Node ≥ 20.10.

```ts
import {
  generateModel,
  overlay,
  parseRecipe,
  recipeDefaults,
  RecipeError,
} from '@formtrieb/tokens-recipe';

const recipe = parseRecipe(overlay(recipeDefaults, myRecipe)); // throws RecipeError
const { files, log } = generateModel(recipe, {
  prefix: 'ds-', //          --ds-accent-fill        (default 'x-')
  attributeSuffix: '', //    [data-mode="Dark"]      (default '-x')
});
```

`RecipeError.issues` lists each problem with its path in the recipe, so an
editor can show it at the field.

The CLI does the same with files:

```bash
tokens-recipe my-recipe.json --out tokens-model --prefix ds- --attribute-suffix ''
tokens-recipe --schema recipe.schema.json   # JSON Schema for $schema in a recipe
```

A complete recipe: [`test/fixtures/recipe.json`](test/fixtures/recipe.json)
(a synthetic system with neutral hues and system fonts).

### Switching modes and overlays

The model's CSS hangs on data attributes (default suffix `-x`):

```html
<html data-mode-x="Light">            <!-- or Dark -->
<section data-shape-x="round">        <!-- other radius shapes -->
<div data-motion-x="expressive">      <!-- other motion characters -->
```

Reduced motion, forced colours, coarse pointers and RTL switch by media query
or `dir`. Nothing else is needed.

### Reading a type role

The `font` shorthand cannot carry letter-spacing, case or numerals, so a type
step has them as tokens of its own:

```css
.eyebrow {
  font: var(--x-type-eyebrow-md);
  letter-spacing: var(--x-type-eyebrow-md-tracking);
  text-transform: var(--x-type-eyebrow-md-case);           /* roles with a case */
}
.metric { font-variant-numeric: var(--x-type-metric-sm-numeric); } /* numeric roles */
```

`model.css` is rendered in the `canonical` dialect of `@formtrieb/tokens-render`:
values as the recipe wrote them, and no derived companion variables next to
these tokens.

## Relation to formtrieb/tokens

This package depends on [formtrieb/tokens](https://github.com/formtrieb/tokens),
never the other way round. `tokens` is format-neutral: it reads any
Tokens-Studio tree, resolves it and renders CSS. This package is one
opinionated way to *write* such a tree. It brings no renderer of its own: the
tree and `render.json` are its interface to `@formtrieb/tokens-render`.

## Development

```bash
pnpm install
pnpm test         # golden master, contracts, DTCG tree, schema
pnpm typecheck
pnpm build
```

The golden master (`test/__snapshots__/golden/`) pins every artefact of the
test recipe. After a deliberate change, run `pnpm vitest run -u` and read the
diff.

## License

Apache-2.0
