/**
 * The iframe protocol: `{ type, v: 1, … }`. The page in the frame says
 * `tokens-recipe:ready` first; only then does the panel post states. Both
 * sides take an exact origin and ignore every message from anywhere else.
 *
 * A run carries every file of the model (several MB), and a message is
 * cloned on every post. So a state goes out with its run only when the run is
 * new; otherwise the message says `keepRun` and the receiver keeps the run it
 * has.
 */
import type { ConnectFrame, FrameLink, PanelState, ReceiveState, StateMessage } from './index.js';

const READY = 'tokens-recipe:ready';
const STATE = 'tokens-recipe:state';

function exact(origin: string): string {
  if (!origin || origin === '*') throw new Error(`tokens-recipe: an exact origin is required, not ${JSON.stringify(origin)}`);
  return origin;
}

export const connectFrame: ConnectFrame = (frame, options) => {
  const origin = exact(options.origin);
  let ready = false;
  let latest: PanelState | undefined;
  let sentRun: PanelState['run'];
  const post = () => {
    const target = frame.contentWindow;
    if (!ready || !latest || !target) return;
    const keepRun = latest.run !== undefined && latest.run === sentRun;
    const state = keepRun ? { ...latest, run: undefined } : latest;
    const message: StateMessage = { type: STATE, v: 1, state, ...(keepRun ? { keepRun: true } : {}) };
    target.postMessage(message, origin);
    sentRun = latest.run;
  };
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== origin || e.source !== frame.contentWindow) return;
    if (e.data?.type === READY && e.data.v === 1) {
      // a reloaded frame starts from nothing
      ready = true;
      sentRun = undefined;
      post();
    }
  };
  window.addEventListener('message', onMessage);
  const link: FrameLink = {
    send(state) {
      latest = state;
      post();
    },
    close() {
      window.removeEventListener('message', onMessage);
      ready = false;
    },
  };
  return link;
};

export const receiveState: ReceiveState = (handler, options) => {
  const origin = exact(options.origin);
  let run: PanelState['run'];
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== origin || e.source !== window.parent) return;
    const m = e.data as StateMessage | undefined;
    if (m?.type !== STATE || m.v !== 1) return;
    if (!m.keepRun) run = m.state.run;
    handler({ ...m.state, run });
  };
  window.addEventListener('message', onMessage);
  window.parent.postMessage({ type: READY, v: 1 }, origin);
  return () => window.removeEventListener('message', onMessage);
};
