# Changelog

All notable changes to `@formtrieb/tokens-recipe` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
