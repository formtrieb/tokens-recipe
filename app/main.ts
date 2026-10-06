/**
 * The standalone editor: the panel here, the preview in an iframe. The frame
 * is created after the link listens, so its ready message cannot come early.
 */
import { connectFrame, mountRecipePanel } from '@formtrieb/tokens-recipe/editor';
import recipe from '../test/fixtures/recipe.json';

const frame = document.createElement('iframe');
frame.id = 'preview';
frame.title = 'preview';
const link = connectFrame(frame, { origin: location.origin });
mountRecipePanel(document.getElementById('panel')!, {
  recipe,
  generate: { attributeSuffix: '-x' },
  onChange: (state) => link.send(state),
});
frame.src = './preview.html';
document.body.append(frame);
