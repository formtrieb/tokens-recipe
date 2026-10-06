/**
 * `@formtrieb/tokens-recipe/editor` — the recipe editor's API, framework-free.
 *
 * The editor is cut in two: the **panel** (form, state, undo, file, report)
 * knows no preview and hands out a {@link PanelState}; a **receiver** shows
 * it — the gallery of this package, a host with pages of its own, or a page
 * in an iframe. Pages always come from the host, never from this package.
 *
 * This entry is the only one that touches the DOM. The main entry
 * (`@formtrieb/tokens-recipe`) stays DOM-free, and nothing in it imports
 * from here.
 *
 * The functions below implement the types of this module.
 */
import type { RenderRule } from '@formtrieb/tokens-render';
import type { GenerateOptions, ModelOutput } from '../model.js';

/** A recipe as JSON: the design system's overrides, without the defaults. */
export type RecipeDoc = Record<string, unknown>;

/** Light or dark: the value the receiver sets on `data-mode{attributeSuffix}`. */
export type PanelMode = 'Light' | 'Dark';

/** Everything a receiver needs. A plain object, so it survives `postMessage`. */
export interface PanelState {
  /** every file of the simulated render table (see {@link Simulate}), concatenated */
  css: string;
  mode: PanelMode;
  /** data attribute → value for the overlay toggles; `''` sets a boolean attribute */
  overlays: Record<string, string>;
  /** appended to the model's data attributes (`-x` → `[data-mode-x]`). Default `''` */
  attributeSuffix: string;
  /** the last full run, for gallery, report and download; missing while the recipe is invalid and no run was good yet */
  run?: ModelOutput;
  /** a full run is still due: the preview lags behind the form */
  pending: boolean;
}

export interface PanelOptions {
  recipe: RecipeDoc;
  /** the recipe the overrides apply to. Default: the package's `defaults.json` */
  defaults?: RecipeDoc;
  /** passed to `generateModel`; `attributeSuffix` defaults to `''` here */
  generate?: GenerateOptions;
  /** after every full run, throttled; also when `pending` changes */
  onChange?(state: PanelState): void;
  /** after every change to the recipe — the hook for a host that stores it itself */
  onRecipe?(doc: RecipeDoc): void;
  /** open, save, reset and download (`.zip`) in the panel. Default `true` */
  file?: boolean;
  /** the recipe in the URL, and a button that copies the link. Default `true` */
  link?: boolean;
}

export interface RecipePanel {
  /** replaces the recipe; one undo step */
  setRecipe(doc: RecipeDoc): void;
  /** the current state, for a receiver that subscribes late */
  getState(): PanelState;
  undo(): void;
  redo(): void;
  /** removes the panel and its listeners */
  destroy(): void;
}

/** Mounts the panel into `element`. Renders no preview. */
export type MountRecipePanel = (element: HTMLElement, options: PanelOptions) => RecipePanel;

export interface GalleryOptions {
  /** contrast badges, measured on the rendered colours. Default `false` */
  contrast?: boolean;
}

export interface Gallery {
  update(state: PanelState, options?: GalleryOptions): void;
  destroy(): void;
}

/** The generic preview: reads nothing but the model's variables. */
export type MountGallery = (element: HTMLElement) => Gallery;

/** Where a receiver puts a state: the CSS into `style`, mode and overlays as attributes on every root. */
export interface ApplyTarget {
  style: HTMLStyleElement;
  roots: readonly HTMLElement[];
}

/** What every receiver does with a state; a host with pages of its own needs nothing else. */
export type ApplyState = (target: ApplyTarget, state: PanelState) => void;

/** The receiver is listening; sent once, before the first state. */
export interface ReadyMessage {
  type: 'tokens-recipe:ready';
  v: 1;
}

/** A state for the receiver. */
export interface StateMessage {
  type: 'tokens-recipe:state';
  v: 1;
  /** `run` is left out when it has not changed since the last message; see `keepRun` */
  state: PanelState;
  /** the run is the one sent before: the receiver keeps it */
  keepRun?: true;
}

export type EditorMessage = ReadyMessage | StateMessage;

/** An exact origin such as `https://example.com`. `'*'` is refused, also by the type. */
export type ExactOrigin<O extends string> = O extends '*' ? never : O;

export interface FrameLink {
  /** posts the state, or keeps it until the frame is ready */
  send(state: PanelState): void;
  close(): void;
}

/**
 * The panel's side of the iframe: waits for {@link ReadyMessage} from
 * `origin`, then posts the latest state there and every one after it.
 */
export type ConnectFrame = <O extends string>(
  frame: HTMLIFrameElement,
  options: { origin: ExactOrigin<O> },
) => FrameLink;

/**
 * The page in the iframe: sends {@link ReadyMessage} to the parent at
 * `origin`, then hands every state from there to `handler`, usually
 * {@link ApplyState}. Returns the function that stops listening.
 */
export type ReceiveState = <O extends string>(
  handler: (state: PanelState) => void,
  options: { origin: ExactOrigin<O> },
) => () => void;

/**
 * The preview's render table: a media rule whose theme the table also offers
 * as an attribute rule goes; every other media rule becomes an attribute twin
 * on the same selector — `(pointer: coarse)` → `[data-sim-pointer="coarse"]` —
 * so the overlay toggles decide, not the device. Knows no recipe.
 */
export type Simulate = (rules: readonly RenderRule[]) => RenderRule[];

/** One overlay toggle: one value is a checkbox, several are a choice. `''` is a boolean attribute. */
export interface ToggleSpec {
  attribute: string;
  label: string;
  values: string[];
}

/** Every attribute the rules select on, except `data-mode{attributeSuffix}`. Knows no recipe. */
export type ToggleSpecs = (rules: readonly RenderRule[], options: { attributeSuffix: string }) => ToggleSpec[];

export { mountRecipePanel } from './panel.js';
export { mountGallery } from './gallery.js';
export { applyState } from './apply.js';
export { connectFrame, receiveState } from './frame.js';
export { simulate, toggleSpecs } from './render-rules.js';
