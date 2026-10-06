# Changelog

All notable changes to `@formtrieb/tokens-recipe` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
