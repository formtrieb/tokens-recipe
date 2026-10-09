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
| Roles | `hierarchies`, `status`, `feedback`, `spaceRoles`, `width`, `radius`, `type`, `control`, `motion`, `dataviz`, `identity`, `icon`, `avatar`, `link`, `layer`, … | `ctl-*`, `status-*`, `feedback-*`, `surface-*`, `space-*`, `type-*`, `control-*`, `control-{size}-switch-*`, `motion-*`, `icon-spot-*`, `avatar-*`, `link-underline-*`, `layer-*`, … |
| Overlays | `radius.shapes`, `motion.characters`, `control.coarse` | sets switched by selector or media query: dark mode, RTL, reduced motion, forced colours, coarse pointer, shapes |

Components read roles only. The Foundation is there for the roles to point
at.

Spot sizes stand without text: `icon-spot-*` for icons, `avatar-*` for
avatars (default `xs` 24, `sm` 32, `md` 40). Both point at `size-*` and must
lie on the size scale; neither steps up under a coarse pointer — an avatar is
no hit target, and an avatar that is a button takes the control height.

The link underline is typography of the inline text, next to `prose-*` and
`type-inline-*`: `link-underline-offset` in em (default `0.2`),
`link-underline-thickness` and `link-underline-thickness-hover` as references
to a stroke role (`link.underline.thickness` / `thicknessHover` name a
`border.width` key, default `default` and `strong`). The hover thickness also
serves pressed; the colour comes from the text.

```css
a {
  text-decoration-line: underline;
  text-underline-offset: var(--x-link-underline-offset);
  text-decoration-thickness: var(--x-link-underline-thickness);
}
a:hover, a:active { text-decoration-thickness: var(--x-link-underline-thickness-hover); }
```

Part sizes of the switch are roles in the control bundle, derived without
recipe fields of their own: `control-{size}-switch-height` = `icon-alone`,
`-switch-width` = 2 × `icon`, `-switch-thumb` = track height − 2 ×
(`border.width.default` + 1px), `-switch-mark` (the check in the thumb) =
thumb − 4px. A value on the size scale reads `size-*`; off the scale it is a
`calc()` over the roles. A size the coarse pointer replaces takes the
replacement's switch as well.

A hierarchy picks a style for its controls. `outline-hue` is an outline
that carries its hue at rest (hue stroke and text on paper, for everyday
destructive actions); selected and done move its surface onto the hue's tint
ladder (`tint`, `tint-hover`, `tint-pressed`), with stroke, icon and text as
in a selected `outline`. Inactive, readonly and disabled behave like `outline`.

`layer-*` are z-index values for the document only, in this order:
`sticky` (table head, save bar) < `panel` (a non-modal surface over the
content and under the frame: side panel, inspector; default 15) < `chrome`
(the app frame when the document scrolls). Popover, dialog, toast and tooltip
live in the browser's top layer and need none.

## Output

`generateModel(recipe, options)` returns `{ files, log, recipe }` — `recipe` is the
recipe the model was generated from, defaults applied — with these files:

| File | What |
|---|---|
| `tokens/$metadata.json`, `tokens/$themes.json`, `tokens/<Set>.json` | the Tokens-Studio tree; Tokens Studio imports it, [`@formtrieb/tokens-mcp`](https://github.com/formtrieb/tokens/tree/main/packages/mcp) reads it |
| `render.json` | the render table (which theme lands under which selector or media query) and the render options (`prefix`, `units: "source"`, `color: "source"`, `typographyCompanions: false`), in the render-file format of `@formtrieb/tokens-render`; the CLI (`@formtrieb/tokens-cli`) renders the tree as `model.css` does |
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

`model.css` is rendered by `@formtrieb/tokens-render` with the options the
recipe writes into `render.json`: values as the recipe wrote them
(`units: "source"`, `color: "source"`), and no derived companion variables
next to these tokens (`typographyCompanions: false`).

## Editor

`@formtrieb/tokens-recipe/editor` is the recipe editor for the browser,
without a framework: a panel that edits the recipe, and receivers that show
the model it produces.

```ts
import { mountRecipePanel, mountGallery } from '@formtrieb/tokens-recipe/editor';

const gallery = mountGallery(preview);
const panel = mountRecipePanel(element, {
  recipe,                                   // the design system's overrides
  generate: { attributeSuffix: '-x' },      // default ''
  onChange(state) { gallery.update(state) },
  onRecipe(doc) { store(doc) },             // a host that stores the recipe itself
  file: false,                              // open/save/zip, default true
  link: false,                              // recipe in the URL, default true; off where the address is the host's
});
panel.getState(); panel.setRecipe(doc); panel.undo(); panel.redo(); panel.destroy();
```

**Panel and receiver.** The panel holds the colours (hues, ladders, ramps
with their contracts), the form built from the recipe schema, the JSON, the
report, the defaults it overrides, undo and redo, file and link — and renders
no preview. A model run follows an edit at once, then at most every 200 ms,
and once more at the end; the last good run stays while the recipe is
invalid. Edits within 600 ms, or within one pointer gesture, are one undo
step; text fields keep the browser's own undo. It hands out a `PanelState`: the model's CSS, the
mode, the overlay attributes, the attribute suffix, the last good run and
whether a run is still pending. A receiver shows it:

- the gallery of this package: `mountGallery(element).update(state, { contrast })`.
  It draws into a shadow root, paints the page surface and reads only the
  model's variables; with `contrast` it badges every text with its WCAG ratio
  as rendered (translucent layers and `opacity` included);
- a host with pages of its own: `applyState({ style, roots }, state)` writes
  the CSS into a `<style>` and sets mode and overlays on its preview roots;
- a page in an iframe, over `postMessage`.

Pages always come from the host.

**The iframe protocol.** Messages are `{ type, v: 1, … }`. The page in the
iframe sends `tokens-recipe:ready` first (`receiveState`); only then does the
panel post `tokens-recipe:state` with the latest state (`connectFrame`). Both
sides take an exact `origin`; `'*'` is refused, also by the type. A run holds
every file of the model, so a state carries its run only when the run is new
(`keepRun` otherwise); the receiver keeps the last one.

```ts
// the page in the iframe
receiveState((state) => {
  applyState({ style, roots: [root] }, state);
  gallery.update(state);
}, { origin: 'https://editor.example' });
```

**Escaping.** A shared link is someone else's input. The recipe schema's
grammars and the generator's declaration guard keep it out of the CSS; the
editor escapes every text it takes from a recipe (names, font stacks, labels)
before it reaches HTML.

**Simulated media.** `simulate(rules)` turns media rules into attribute rules,
`(pointer: coarse)` → `[data-sim-pointer="coarse"]`, so the preview's toggles
decide instead of the device; `toggleSpecs(rules, { attributeSuffix })` lists
the attributes the rules select on. Both read render rules, never a recipe.

**Entries.** The main entry stays free of the DOM, for the CLI and for Node;
nothing in it imports from `editor`. `pnpm typecheck` checks both.

**Standalone app.** `pnpm app` starts the editor on the test recipe: the
panel, and the gallery in an iframe as receiver (`app/`, Vite, not part of
the package).

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
