# Changelog

All notable changes to `@formtrieb/tokens-recipe` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The reset of the selected-surface context: `[data-on-selected-x="off"]`
  (set `Contrast/Forced-OnSelected-Off`, rendered right after the context
  inside `(forced-colors: active)`) declares every token of the context with
  its value outside it — forced colours where they have one, else Base's
  reference. An overlay inside a selected row (its menu, a popover) sets it,
  so its focus ring is `Highlight` again instead of `HighlightText` on
  `Canvas`.

## [0.10.0] — 2026-10-19

### Added

- The current row: `--{prefix}surface-current` (→ `neutral.tint-hover`, a
  step above a selected row) and `--{prefix}line-current` (`transparent`,
  `Highlight` in forced colours). The surface contract checks it at 1.1:1
  against the selected surface and the surface it sits on; text and the
  focus ring on it are checked like on any text surface.
- Forced colours on a selected surface: the set `Contrast/Forced-OnSelected`,
  rendered under `[data-on-selected-x]` inside `(forced-colors: active)`,
  turns the ink of hierarchies in style `ghost`, `focus-ring` and
  `line-current` to `HighlightText` (focus inverts to `Highlight` on a
  `HighlightText` surface).

- Motion roles for waiting: `delay-skeleton` (delay before a placeholder
  appears, kept under reduced motion), `pulse` (a placeholder breathes,
  standard curve, off under reduced motion) and `progress` (indeterminate
  progress, linear, slowed under reduced motion). Optional per character:
  without a duration of its own a role reads its partner's as a reference
  (`delay-skeleton` → `delay-hint`, `pulse` and `progress` → `loop`), so
  existing recipes keep working. The exception from `contract.motionMaxMs`
  is a property of the role (loops and delays), no longer a list of names.

- `--{prefix}media-{name}`: a fixed box for a picture or a file-type icon,
  recipe `media.sizes` on the size scale (default `md` 64), no coarse step;
  off the scale stops with a `RecipeError` at `media.sizes.{name}`.
- `--{prefix}surface-placeholder` → `neutral.tint` (skeleton, empty picture
  box); the surface contract checks it at ≥ 1.1:1 on page, raised and
  overlay in each mode.
- `--{prefix}content-on-inverted` → `inverted.on-fill`, text on
  `surface-inverted`; contrast line at `textMin` in each mode.
- `--{prefix}control-{size}-checkbox-mark`: the check in a checkbox box,
  icon − 4px (`calc()` off the scale), in the coarse-pointer replacement
  like `switch-*`.

- `status.intents`: further status intents on a semantic hue
  (`{ "new": "brand" }` → `--{prefix}status-new-{surface|content|indicator}-{strong|subtle}`
  on the brand steps `status` assigns). They get every status contract (text
  on surface and fill, text and focus ring on the subtle surface, forced
  colours). A base intent name or a hue outside `semanticHues` stops with a
  `RecipeError` at `status.intents.{intent}`.

- `GenerateOptions.scope: 'attribute' | 'root'` (CLI `--scope root`). With
  `root` the render table puts Light and every default set on `:root` as
  well (`:root, [data-mode="Light"]`, Base and the forced-colours,
  coarse-pointer and reduced-motion sets on `:root, [data-mode]`, RTL on
  `:root[dir="rtl"]` too); Dark, other shapes and motion characters stay
  attributes. Base is declared on every `[data-mode]` as well, so a nested
  Dark subtree resolves its aliases against Dark. `@formtrieb/tokens-cli`
  renders the tree with that `render.json` to the same CSS. The default
  `attribute` is unchanged.

### Changed

- Forced colours: in style `solid` the stroke of unselected cells (enabled
  and readonly) is `CanvasText`. A switch thumb reads that stroke when off
  and is a surface, which the browser would turn into `Canvas`; borders were
  `CanvasText` anyway, so checkbox and radio rings look as before. Light and
  Dark are unchanged.

## [0.9.0] — 2026-10-13

### Added

- Role set `--{prefix}field-*` for fields (text field, text area, select
  trigger), decoupled from the hierarchy `secondary`: style fixed to
  `outline`, cells `{background|stroke|text|text-subtle|icon}` ×
  enabled (`idle`, `hover`, `focus`), `readonly` (`idle`, `focus`),
  `disabled` (`idle`) × tone — 120 tokens, keys as in `ctl`. Recipe
  `field: { hue, strokeWidth?, strokeWidthEmphasis? }` (default
  `{ "hue": "accent" }`): the hue of focus, and two stroke roles emitted as
  `--{prefix}field-stroke-width` and `--{prefix}field-stroke-width-emphasis`
  (focus and tones). An unknown hue or role stops with a `RecipeError` at
  its path. `ctl-secondary-*` is unchanged; with the same hue and `secondary`
  on `outline` every field cell equals it. The field contract lines read the
  field cells, plus `Feldtext` and `Feld-Fokusrand (1.4.11)`, and the cell
  contract checks the field cells. Forced colours remap the field like a
  hierarchy (disabled stroke, text and icon → `GrayText`). The editor gallery
  draws its field from `field-*`.

## [0.8.0] — 2026-10-13

### Added

- `hierarchies.{h}.strokeWidth` picks a stroke role (a `border.width` key,
  default `default`) for a hierarchy's controls. Every hierarchy gets
  `--{prefix}ctl-{h}-stroke-width` → `var(--{prefix}border-width-{role})`; a
  bordered control subtracts it from its inline padding. `border.width`
  keeps `default` and `strong` required and may carry further roles
  (`heavy`), all emitted as `--{prefix}border-width-*`. An unknown role
  stops with a `RecipeError` at `hierarchies.{h}.strokeWidth`.
- Style `outline-fill`: an outline at rest that takes the `solid` fill from
  hover on (stroke = fill, content `on-fill`, pressed `fill-pressed`).
  Selected, done, inactive, readonly and disabled behave like `outline-hue`.
- `hierarchies.{h}.rest`, the rest look a style offers: `outline-fill`
  `hue` (default, rests like `outline-hue`) or `neutral` (rests like
  `outline`); `outline-hue` `ladder` (default, as before) or `anchor` (stroke,
  text and icon at rest in `fill`). With `anchor` the contract adds
  `Text in Ankerfarbe auf Papier ({h})`, `fill` on paper at `textMin`. A
  `rest` the style does not have is a `RecipeError` at
  `hierarchies.{h}.rest`.
- `--{prefix}{hue}-fill-pressed` per mode, a derived token (not a ramp step):
  the pressed state of a fill. `fillStates.{mode}.hover` (`ladder` default,
  or `away-from-text`) sets which way a fill's hover moves. With
  `away-from-text` a fill with dark content gets a lighter hover and a pressed
  state the same distance to the darker side, and a fill with light content
  keeps the ladder's direction. `buildFillStates` and `onFillOf` are
  exported.
- `radius.waive`: nested corners a design system breaks on purpose (square
  tiles holding rounded checkboxes) are named by their pair
  (`{ "nesting": "container/item", "reason": "…" }`). The report shows the
  affected lines as `· … — ausgesetzt: <reason>` instead of `✗`. `reason` is
  required, and an unknown pair stops with a `RecipeError`.

### Changed

- Step 10 (`fill-hover`) and `fill-pressed` now follow an anchor on step 9:
  hover sits the ladder's distance 9→10 from the anchor, pressed 9→11.
  Before, step 10 kept the ladder's global lightness, so a light anchor got a
  dark hover (black text on it failed) and a dark one barely moved. **Recipes
  with an anchor on step 9 change** in `fill-hover`, `fill-pressed`, and in
  `on-fill-hover`/`-selected`/`-pressed`, which follow them. Hues without an
  anchor on 9 stay byte-identical.
- Style `solid` reads `fill-pressed` for pressed (background and stroke)
  instead of `ink-subtle`, and `{hue}-on-fill-pressed` follows it. Values
  are unchanged wherever no anchor sits on step 9.
- `Füllung {hue} (1.4.11)`: a fill below 3:1 against the page is a note, not
  a failure, when its `on-fill` reaches 3:1 against the page (the label or
  check carries the edge). The report prints it as a `·` line, and
  `model-report.json` keeps the check with `ok: true` and an `advisory`
  reason. Without that content contrast it stays a failure.

### Fixed

- Control sizes the recipe derives no longer have to lie on `space.scale`.
  Inline padding on the action ladder (`height / 2 − actionInset`), its icon
  side, `gap-plain`, `icon-alone`, `switch-height` and the coarse height past
  the top size read the size scale when they land on it and are `calc()` over
  the size-scale value they come from otherwise (for example
  `calc(var(--x-size-52) / 2 - 4px + var(--x-control-action-pill))`). Before,
  a derived size off the scale (the inline padding 22 of a 52 px button)
  crashed the DTCG export with a reference to a size token that does not
  exist.
- Sizes the recipe names directly (`control.sizes.*.height`/`icon`/`gap`/
  `content`, `control.icons`, `control.rules.pill`, `control.target.*`,
  `control.badge.*.height`, `control.badgeDot`,
  `motion.characters.*.distance.*`) are checked against `space.scale` before
  anything is written and stop with a `RecipeError` naming the path. They
  used to be contract lines (`… fehlt in der Foundation-Skala`) followed by
  the same crash.
- The DTCG export reports a reference to an unknown token as a `RecipeError`
  naming the token it came from, instead of a plain `Error`.

## [0.7.0] — 2026-10-09

### Added

- Layer `layer.panel` between `sticky` and `chrome` (default 15) becomes
  `--{prefix}layer-panel`: a non-modal surface over the content, under the
  frame (side panel, inspector). The contract is now
  `0 < sticky < panel < chrome`.

### Changed

- Style `outline-hue`: selected and done no longer borrow the neutral
  selection of `outline`. The surface moves onto the hue's tint ladder
  (`background-selected-idle`/`-focus` → `{hue}-tint`, `-hover` →
  `{hue}-tint-hover`, `-pressed` → `{hue}-tint-pressed`, tones swap the hue);
  stroke, icon and text stay as before. Forced colours still select in
  `Highlight`.

## [0.6.0] — 2026-10-08

### Added

- Switch part sizes per control size: `--{prefix}control-{size}-switch-height`
  (= `icon-alone`), `-switch-width` (= 2 × `icon`), `-switch-thumb` (= track
  height − 2 × (`border.width.default` + 1px)) and `-switch-mark` (= thumb −
  4px). No new recipe fields. Values on the size scale read `size-*`, others
  are `calc()` over the roles; a size replaced under a coarse pointer takes
  the replacement's switch too.

## [0.5.0] — 2026-10-08

### Added

- Link underline: `link.underline` in the recipe (default `offset` 0.2,
  `thickness` `default`, `thicknessHover` `strong`) becomes
  `--{prefix}link-underline-offset` (em),
  `--{prefix}link-underline-thickness` and
  `--{prefix}link-underline-thickness-hover`, the last two as references to
  `border-width-*`. The hover thickness also serves pressed. Existing
  recipes stay valid through the defaults.

## [0.4.0] — 2026-10-07

### Changed

- Requires `@formtrieb/tokens-core` ^2.0.0 and `@formtrieb/tokens-render`
  ^1.0.0.
- `render.json` carries the output policy instead of a dialect:
  `"options": { "prefix", "units": "source", "color": "source",
  "typographyCompanions": false }`. The CSS of a recipe tree is then the
  same whoever renders it (`@formtrieb/tokens-render` or the CLI
  `@formtrieb/tokens-cli`), whatever their defaults. `model.css` is
  unchanged byte for byte.

## [0.3.0] — 2026-10-06

### Added

- Avatar sizes: `avatar.sizes` in the recipe (default `xs` 24, `sm` 32,
  `md` 40) becomes `--{prefix}avatar-{name}` → `var(--{prefix}size-{px})`.
  Spot sizes without text and without a coarse-pointer step; a size off the
  size scale is a recipe error at `avatar.sizes.<name>`.

## [0.2.0] — 2026-10-06

### Added

- `@formtrieb/tokens-recipe/editor`: a second entry with the recipe editor
  for the browser, without a framework; the main entry stays free of the
  DOM. The package is marked `sideEffects: false`.
- `mountGallery`: the generic preview of a model, drawn into a shadow root
  from the run in a `PanelState`; contrast badges measured as rendered,
  with the colour maths of `@formtrieb/tokens-core`. Every text taken from a
  recipe or report is escaped, every name in a variable reference checked.
- `generateModel` returns the recipe the model was generated from, defaults
  applied (`ModelOutput.recipe`).
- `mountRecipePanel`: the recipe editor without a preview — colours, the
  form from the recipe schema, JSON, report, defaults, undo and redo,
  file (File System Access or download, ZIP of the whole model) and the
  recipe in the link; file and link can be switched off.
- `applyState`, `connectFrame`, `receiveState`: showing a panel state in a
  host's own pages or in an iframe (protocol `v: 1`, ready first, exact
  origin; a run is sent only when it is new).
- `simulate`, `toggleSpecs`: the preview's render table and its overlay
  toggles, from render rules alone.

### Changed

- Requires `@formtrieb/tokens-core` ^1.7.0.

## [0.1.4] — 2026-10-06

### Changed

- `render.json` carries the dialect: `options` is now
  `{ prefix, dialect: "canonical" }`, the same options `model.css` is
  rendered with. A tree rendered by `@formtrieb/token-resolver` 0.7 from this
  file comes out as `model.css` does instead of in the `style-dictionary`
  dialect.
- `RenderTable` is the object form of `RenderFile` from
  `@formtrieb/tokens-render` instead of a type of its own;
  `renderOptions()` returns `RenderFileOptions`. Requires
  `@formtrieb/tokens-render` ^0.4.0.

## [0.1.3] — 2026-10-06

### Changed

- `@formtrieb/tokens-render` 0.3: `model.css` lists variables in source
  order within each block instead of sorting them by reference. Same
  variables, same values; only the order changes.

## [0.1.2] — 2026-10-06

### Changed

- Colour conversion, gamut mapping, WCAG contrast, CIEDE2000, compositing
  and alpha now come from `@formtrieb/tokens-core` 1.6. Same procedure, same
  numbers: every generated artefact is byte-identical. `culori` is no longer
  a direct dependency.

## [0.1.1] — 2026-10-06

### Fixed

- `steps` is fixed at 12 in the schema and set in `defaults.json`, so a
  recipe no longer needs it and an editor built from the schema no longer
  offers it as a free number. Every ramp has exactly the twelve named steps
  (`STEP_NAMES`, now exported); what a recipe chooses is their values.
  Before, another length either stopped with a misleading message or wrote
  a token named `undefined`. `generateModel` now refuses it with a clear
  message, also when the schema was bypassed.

## [0.1.0] — 2026-10-06

First release.

### Added

- `generateModel(recipe, options)`: a complete token model from a recipe —
  OKLCH ramps, selection per mode, control hierarchies, status and feedback,
  surfaces, space, widths, radius, typography, control sizes, motion,
  data visualisation, identity colours, forced-colours and coarse-pointer
  overlays. Returns the Tokens-Studio tree, the render table, `model.css`
  (rendered by `@formtrieb/tokens-render` in its `canonical` dialect), the
  token map, side outputs for media/container queries and Figma, and a
  report.
- Contracts checked on every run: WCAG 2 contrast for every pair a control
  reads, step ladders, type, grid, radius nesting, motion, chart colours
  under colour-vision deficiency. A recipe may tighten WCAG floors, never
  lower them. APCA is reported as a second lens and never fails.
- `GenerateOptions`: CSS variable prefix and data-attribute suffix.
- `parseRecipe`, `overlay`, `RecipeError` with a path per problem,
  `RecipeSchema` (zod) and `recipeDefaults` (`defaults.json`).
- Ramps gamut-mapped as CSS Color 4 specifies.
- CLI `tokens-recipe <recipe.json> [--out] [--prefix] [--attribute-suffix]`
  and `tokens-recipe --schema <file>` for a JSON Schema of the recipe.
