# Changelog

All notable changes to `@formtrieb/tokens-recipe` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
