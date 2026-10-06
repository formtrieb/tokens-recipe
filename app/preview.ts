/** The page in the iframe: a receiver in a few lines. */
import { applyState, mountGallery, receiveState, type PanelState } from '@formtrieb/tokens-recipe/editor';

const style = document.getElementById('model') as HTMLStyleElement;
const root = document.getElementById('root')!;
const contrast = document.getElementById('contrast') as HTMLInputElement;
const gallery = mountGallery(document.getElementById('gallery')!);
let last: PanelState | undefined;
const show = () => last && gallery.update(last, { contrast: contrast.checked });

receiveState(
  (state) => {
    last = state;
    applyState({ style, roots: [root] }, state);
    show();
  },
  { origin: location.origin },
);
contrast.addEventListener('change', show);
