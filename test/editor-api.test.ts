/**
 * The editor API, partly implemented. These checks run under `tsc`
 * (`pnpm typecheck`): the `@ts-expect-error` lines fail the build if the
 * types stop refusing what they refuse.
 */
import type { RenderRule } from '@formtrieb/tokens-render';
import { describe, expect, it } from 'vitest';
import type {
  ConnectFrame,
  EditorMessage,
  PanelOptions,
  PanelState,
  Simulate,
  ToggleSpecs,
} from '../src/editor/index.js';

declare const connectFrame: ConnectFrame;
declare const frame: HTMLIFrameElement;
declare const simulate: Simulate;
declare const toggleSpecs: ToggleSpecs;

export function typeChecks(state: PanelState, rules: RenderRule[]): void {
  connectFrame(frame, { origin: 'https://example.com' });
  // @ts-expect-error — '*' is no origin
  connectFrame(frame, { origin: '*' });
  // @ts-expect-error — the origin is required
  connectFrame(frame, {});

  const message: EditorMessage = { type: 'tokens-recipe:state', v: 1, state };
  // @ts-expect-error — every message carries the protocol version
  const unversioned: EditorMessage = { type: 'tokens-recipe:ready' };
  void message;
  void unversioned;

  // simulate and toggleSpecs see render rules, never a recipe
  toggleSpecs(simulate(rules), { attributeSuffix: '-x' });

  const host: PanelOptions = { recipe: {}, file: false, link: false, onRecipe() {} };
  void host;
}

describe('@formtrieb/tokens-recipe/editor', () => {
  it('ships the functions implemented so far', async () => {
    expect(Object.keys(await import('../src/editor/index.js'))).toEqual(['mountGallery']);
  });
});
