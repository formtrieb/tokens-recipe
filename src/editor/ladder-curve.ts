/**
 * A ladder (one value 0…1 per step) per mode as curves on one chart. Each
 * point drags vertically or steps with the arrow keys (role slider); every
 * move goes out as `(mode, index, value)` — the panel writes it into the
 * recipe, so a drag is live and one undo step. The active mode is drawn last
 * and strong; points carry a colour per step, breaks of the ladder contract
 * are red.
 *
 * The SVG is built once per shape (modes and step count) and patched on
 * every update, so a point keeps its pointer capture while its value moves.
 */
import { html } from './escape.js';

export interface LadderChange {
  mode: string;
  index: number;
  value: number;
}

export interface LadderView {
  /** the ladder per mode, e.g. `{ light: [0.98, …], dark: [0.16, …] }` */
  values: Record<string, number[]>;
  /** the mode drawn on top */
  active?: string;
  /** per mode: indices whose step down from the one before breaks the contract */
  breaks?: Record<string, number[]>;
  /** per mode: a colour per step for the points */
  swatches?: Record<string, string[]>;
}

export interface LadderOptions {
  /** names the chart and its points for assistive technology */
  label?: string;
  /** the value grid a drag snaps to, and one arrow-key step. Default 0.005 */
  step?: number;
  onChange(change: LadderChange): void;
}

export interface LadderCurve {
  update(view: LadderView): void;
  destroy(): void;
}

const W = 420;
const H = 150;
const PAD = 14;
const GRID = [0, 0.25, 0.5, 0.75, 1];
const SVG = 'http://www.w3.org/2000/svg';

const STYLES = `
svg { display: block; inline-size: 100%; block-size: auto; touch-action: none; user-select: none; }
.grid { stroke: #f0d9c0; stroke-width: 1; }
.tick { font: 9px system-ui, sans-serif; fill: #7a6a5a; }
.line { fill: none; stroke: #c9a27a; stroke-width: 1.5; }
.active .line { stroke: #ff7a00; stroke-width: 2.5; }
.break { stroke: #ff2d55; stroke-width: 3; }
g[data-mode]:not(.active) { opacity: 0.45; }
.pt { stroke: #7a4b12; stroke-width: 1.5; cursor: ns-resize; }
.pt.fail { stroke: #ff2d55; stroke-width: 3; }
.pt:focus-visible { outline: none; stroke: #000; stroke-width: 3; }
`;

export function mountLadderCurve(element: HTMLElement, options: LadderOptions): LadderCurve {
  const step = options.step ?? 0.005;
  const label = options.label ?? '';
  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
  let view: LadderView = { values: {} };
  let shape = '';
  let svg: SVGSVGElement | undefined;
  let dragging: { mode: string; index: number } | undefined;
  /**
   * the last value a key sent, until the new values come back — two quick key
   * presses (or a held key) must not both start from the old value
   */
  let sent: LadderChange | undefined;

  const count = () => Object.values(view.values)[0]?.length ?? 1;
  const x = (i: number) => PAD + 18 + (i * (W - 2 * PAD - 18)) / Math.max(1, count() - 1);
  const y = (v: number) => PAD + (1 - v) * (H - 2 * PAD);
  const snap = (v: number) => {
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    return Number(Math.min(1, Math.max(0, Math.round(v / step) * step)).toFixed(decimals + 1));
  };

  /** the skeleton: grid, one group per mode with its line and points */
  function build() {
    const groups = Object.entries(view.values)
      .map(
        ([mode, values]) =>
          `<g data-mode="${html(mode)}"><polyline class="line"></polyline><g class="breaks"></g>${values
            .map(
              (_, i) =>
                `<circle class="pt" r="6" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="1" data-index="${i}" aria-label="${html(`${label} ${mode} step ${i + 1}`)}"><title></title></circle>`,
            )
            .join('')}</g>`,
      )
      .join('');
    const grid = GRID.map(
      (g) =>
        `<line class="grid" x1="${PAD}" x2="${W - PAD}" y1="${y(g)}" y2="${y(g)}"></line><text class="tick" x="2" y="${y(g) + 3}">${g}</text>`,
    ).join('');
    root.innerHTML = `<style>${STYLES}</style><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${html(`${label}: ladder per mode, drag the points`)}">${grid}${groups}</svg>`;
    svg = root.querySelector('svg')!;
  }

  /** every value, colour, break and the order of the curves, in place */
  function patch() {
    for (const [mode, values] of Object.entries(view.values)) {
      const g = [...svg!.querySelectorAll<SVGGElement>('g[data-mode]')].find((n) => n.dataset.mode === mode)!;
      const breaks = view.breaks?.[mode] ?? [];
      const swatches = view.swatches?.[mode] ?? [];
      g.classList.toggle('active', mode === view.active);
      g.querySelector('polyline')!.setAttribute('points', values.map((v, i) => `${x(i)},${y(v)}`).join(' '));
      const lines = g.querySelector('.breaks')!;
      lines.replaceChildren(
        ...breaks
          .filter((i) => i > 0 && i < values.length)
          .map((i) => {
            const line = document.createElementNS(SVG, 'line');
            line.setAttribute('class', 'break');
            line.setAttribute('x1', String(x(i - 1)));
            line.setAttribute('y1', String(y(values[i - 1])));
            line.setAttribute('x2', String(x(i)));
            line.setAttribute('y2', String(y(values[i])));
            return line;
          }),
      );
      g.querySelectorAll('circle').forEach((c, i) => {
        const fail = breaks.includes(i);
        c.classList.toggle('fail', fail);
        c.setAttribute('cx', String(x(i)));
        c.setAttribute('cy', String(y(values[i])));
        c.setAttribute('fill', swatches[i] ?? '#fff');
        c.setAttribute('aria-valuenow', String(values[i]));
        c.querySelector('title')!.textContent = `${mode} · step ${i + 1} · ${values[i]}${fail ? ' · ✗ ladder contract' : ''}`;
      });
    }
    // the active curve last, so it lies on top
    const active = [...svg!.querySelectorAll<SVGGElement>('g[data-mode]')].find((n) => n.dataset.mode === view.active);
    if (active && active !== svg!.lastElementChild) svg!.appendChild(active);
  }

  const point = (e: Event) => {
    const c = (e.target as Element).closest?.('circle.pt');
    const mode = (c?.parentNode as SVGGElement | null)?.dataset.mode;
    return c && mode !== undefined ? { c, mode, index: Number(c.getAttribute('data-index')) } : undefined;
  };

  function move(e: PointerEvent) {
    const ctm = svg?.getScreenCTM();
    if (!dragging || !ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const value = snap(1 - (p.y - PAD) / (H - 2 * PAD));
    if (value !== view.values[dragging.mode]?.[dragging.index]) options.onChange({ ...dragging, value });
  }
  const onDown = (e: PointerEvent) => {
    const p = point(e);
    if (!p) return;
    p.c.setPointerCapture?.(e.pointerId);
    dragging = { mode: p.mode, index: p.index };
    move(e);
  };
  const onUp = () => {
    dragging = undefined;
  };
  const onKey = (e: KeyboardEvent) => {
    const p = point(e);
    if (!p) return;
    const v = sent?.mode === p.mode && sent.index === p.index ? sent.value : view.values[p.mode][p.index];
    const by = (e.shiftKey ? 10 : 1) * step;
    const next =
      e.key === 'ArrowUp' || e.key === 'ArrowRight'
        ? v + by
        : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
          ? v - by
          : undefined;
    if (next === undefined) return;
    e.preventDefault();
    // keys move a fine-tuned value by exactly one step (no snap to the grid)
    sent = { mode: p.mode, index: p.index, value: Number(Math.min(1, Math.max(0, next)).toFixed(4)) };
    options.onChange(sent);
  };
  root.addEventListener('pointerdown', onDown as EventListener);
  root.addEventListener('pointermove', move as EventListener);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('keydown', onKey as EventListener);

  return {
    update(next: LadderView) {
      view = next;
      sent = undefined;
      const now = JSON.stringify(Object.entries(next.values).map(([m, v]) => [m, v.length]));
      if (now !== shape || !svg) {
        shape = now;
        build();
      }
      patch();
    },
    destroy() {
      root.removeEventListener('pointerdown', onDown as EventListener);
      root.removeEventListener('pointermove', move as EventListener);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('keydown', onKey as EventListener);
      root.innerHTML = '';
      svg = undefined;
      shape = '';
    },
  };
}
