/**
 * The generic preview of a token model: HTML and CSS that read nothing but the
 * model's variables — no components, no product content. What it enumerates
 * (hierarchies, intents, type roles, sizes, chart and identity colours) comes
 * from the recipe, so each design system shows its own model.
 *
 * The receiver applies `state.css` and the mode and overlay attributes
 * (`ApplyState`); the gallery draws into a shadow root below that, so the
 * host's styles stay out and the model's variables come in.
 */
import type { Recipe } from '../ramp.js';
import { measure } from './contrast.js';
import { cssVar, html } from './escape.js';
import type { Gallery, GalleryOptions, MountGallery, PanelState } from './index.js';

/** a failed pair from model-report.json — `cells.fails` or `checks` */
export interface ContractFail {
  mode?: string;
  rule: string;
  pair: string;
  ratio: number;
  min: number;
  ok?: boolean;
  hierarchy?: string;
  cell?: string;
  part?: string;
}

/** everything the gallery draws from */
export interface GalleryInput {
  recipe: Recipe;
  /** the CSS the receiver applied; the gallery reads which colour a control part refers to */
  css: string;
  /** the model's variable prefix, `x-` → `--x-…` */
  prefix: string;
  /** failed control-cell pairs of the shown mode */
  cellFails: ContractFail[];
  /** failed scenario checks of the shown mode */
  checkFails: ContractFail[];
}

/** the control cells the gallery shows per hierarchy (token suffix, label) */
const CELLS: [string, string][] = [
  ['idle', 'idle'],
  ['hover', 'hover'],
  ['pressed', 'pressed'],
  ['focus', 'focus'],
  ['disabled-idle', 'disabled'],
  ['inactive-idle', 'inactive'],
  ['selected-idle', 'selected'],
  ['done-idle', 'done'],
  ['readonly-idle', 'readonly'],
  ['readonly-selected-idle', 'readonly · selected'],
  ['negative-idle', 'negative'],
  ['warning-idle', 'warning'],
  ['positive-idle', 'positive'],
];
const SHOWN = new Set(CELLS.map(([k]) => k));
const STATUS_INTENTS = ['neutral', 'info', 'positive', 'warning', 'negative'];
const FEEDBACK_INTENTS = ['info', 'positive', 'warning', 'negative'];
const SURFACES = [
  ['page', 'surface', 'page'],
  ['raised', 'surface', 'raised'],
  ['overlay', 'surface', 'overlay'],
  ['sunken', 'surface', 'sunken'],
  ['inverted', 'surface', 'inverted'],
] as const;
const ELEVATIONS = ['raised', 'overlay', 'modal'];
const SAMPLE = 'Sphinx of black quartz, judge my vow — 0123456789';

const describeFail = (f: ContractFail) =>
  `${f.rule}${f.part ? ' · ' + f.part : ''}: ${f.pair} = ${f.ratio} < ${f.min}`;

/** the report checks each cell pair on every underground; one line per pair, undergrounds joined */
const UNDERGROUND = /pole\.(canvas|paper|overlay|sunken)/;
function summarise(fails: ContractFail[]): string[] {
  const groups = new Map<string, { f: ContractFail; on: string[]; worst: number }>();
  for (const f of fails) {
    const on = f.pair.match(UNDERGROUND)?.[1] ?? '';
    const k = `${f.rule}|${f.part}|${f.pair.replace(UNDERGROUND, '…')}`;
    const g = groups.get(k);
    if (g) {
      g.on.push(on);
      g.worst = Math.min(g.worst, f.ratio);
    } else groups.set(k, { f, on: [on], worst: f.ratio });
  }
  return [...groups.values()].map(({ f, on, worst }) =>
    describeFail({ ...f, pair: f.pair.replace(UNDERGROUND, `pole.${on.join('|')}`), ratio: worst }),
  );
}

/** `name: value` pairs as a style attribute; a pair whose value is undefined is left out */
function style(decls: Record<string, string | undefined>): string {
  const body = Object.entries(decls)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  return body ? ` style="${html(body)}"` : '';
}

const n = (k: number) => Array.from({ length: k }, (_, i) => String(i + 1));

/**
 * The gallery as HTML. Every text from recipe or report is escaped; every
 * name in a variable reference passes `cssVar`, which leaves out what is no
 * safe name.
 */
export function galleryHtml(input: GalleryInput): string {
  const { recipe, prefix: P } = input;
  const v = (...path: string[]) => cssVar(P, ...path);

  /** control token → the colour it refers to (`ctl-brand-text-selected-idle` → `pole-ink`), first block */
  const refs = new Map<string, string>();
  const ref = new RegExp(`--${P.replace(/[^a-z0-9-]/g, '')}(ctl-[a-z0-9-]+): var\\(--${P.replace(/[^a-z0-9-]/g, '')}([a-z0-9-]+)\\)`, 'g');
  for (const [, name, target] of input.css.matchAll(ref)) if (!refs.has(name)) refs.set(name, target);
  /**
   * the model's cell contract, rule 1: text in a page colour next to a
   * hue-coloured shape sits beside it (checkbox label, step title), so the
   * gallery draws shape and label apart
   */
  const beside = (h: string, c: string) => {
    const page = /^(pole|neutral|content)-/;
    const text = refs.get(`ctl-${h}-text-${c}`);
    const bg = refs.get(`ctl-${h}-background-${c}`);
    return !!text && !!bg && page.test(text) && !page.test(bg);
  };

  const byCell = new Map<string, ContractFail[]>();
  for (const f of input.cellFails) {
    const k = `${f.hierarchy}|${f.cell}`;
    byCell.set(k, [...(byCell.get(k) ?? []), f]);
  }
  const hidden = new Map<string, string[]>();
  for (const [k, fs] of byCell) {
    const [h, cell] = k.split('|');
    if (SHOWN.has(cell)) continue;
    const worst = Math.min(...fs.map((f) => f.ratio));
    hidden.set(h, [...(hidden.get(h) ?? []), `${cell}: ${fs.length} pairs, min ${worst}`]);
  }

  const ctlStyle = (h: string, c: string) => ({
    background: v('ctl', h, 'background', c),
    'border-color': v('ctl', h, 'stroke', c),
    color: v('ctl', h, 'text', c),
  });
  const dot = (bg: string | undefined) => `<span class="dot"${style({ background: bg })}></span>`;

  const out: string[] = [];
  out.push('<div class="gallery">');
  out.push(
    '<p class="legend">Contrast — WCAG ratio of text to background as rendered (✗ below contract.textMin; disabled and forced colours without verdict)</p>',
  );

  if (byCell.size || input.checkFails.length) {
    out.push(
      `<details class="contract" role="status"><summary>✗ Contract broken: ${byCell.size} cells in the control matrix (marked red, the tooltip shows pair and value), ${input.checkFails.length} scenario checks</summary>`,
      ...input.checkFails.map((f) => `<p>${html(describeFail(f))}</p>`),
      '</details>',
    );
  }

  // surfaces and lines
  out.push('<section><h2>Surfaces and lines</h2><div class="row surfaces">');
  for (const [name, ...token] of SURFACES) {
    out.push(
      `<div class="surface${name === 'inverted' ? ' inverted' : ''}"${style({ background: v(...token) })}>`,
      `<strong data-contrast>${name}</strong>`,
      `<p class="primary" data-contrast>Primary content on ${token.join('.')}</p>`,
      '<p class="secondary" data-contrast>Secondary text, help, meta</p>',
      '<hr class="subtle">',
      '<span class="line-sample base">line.base</span><span class="line-sample strong">line.strong</span>',
      '</div>',
    );
  }
  out.push('</div></section>');

  // control matrix
  out.push(
    `<section><h2>Controls: hierarchy × cell</h2><div class="matrix"${style({ 'grid-template-columns': `120px repeat(${CELLS.length}, max-content)` })}>`,
    '<span></span>',
    ...CELLS.map(([, label]) => `<span class="col">${label}</span>`),
  );
  for (const [h, d] of Object.entries(recipe.hierarchies ?? {})) {
    const hf = hidden.get(h);
    out.push(
      `<span class="rowh">${html(h)}<small>${html(d.hue)} · ${html(d.style)}</small>`,
      hf ? `<small class="fail-note" title="${html(hf.join('\n'))}">✗ ${hf.length} more cells</small>` : '',
      '</span>',
    );
    for (const [c] of CELLS) {
      const fails = byCell.get(`${h}|${c}`);
      const cls = `cellwrap${d.hue === 'inverted' ? ' on-inverted' : ''}${fails ? ' fail' : ''}`;
      const title = fails ? ` title="${html(summarise(fails).join('\n'))}"` : '';
      const icon = dot(v('ctl', h, 'icon', c));
      out.push(`<span class="${cls}"${title}>`);
      if (beside(h, c)) {
        // page-colour text next to a hue shape (checkbox, step): label beside the box
        out.push(
          `<span class="ctl box"${style(ctlStyle(h, c))}>${icon}</span>`,
          `<span class="beside" data-contrast${style({ color: v('ctl', h, 'text', c) })}>Aa</span>`,
        );
      } else {
        out.push(
          `<span class="ctl${c === 'focus' ? ' focus' : ''}" data-contrast${c === 'disabled-idle' ? ' data-contrast-exempt' : ''}${style(ctlStyle(h, c))}>${icon}Aa</span>`,
        );
      }
      out.push('</span>');
    }
  }
  out.push('</div></section>');

  // status and feedback
  out.push('<section><h2>Status and feedback</h2>');
  for (const strength of ['strong', 'subtle']) {
    out.push('<div class="row">');
    for (const i of STATUS_INTENTS)
      out.push(
        `<span class="chip" data-contrast${style({ background: v('status', i, 'surface', strength), color: v('status', i, 'content', strength) })}>${dot(v('status', i, 'indicator', strength))}${i}</span>`,
      );
    out.push('</div>');
  }
  out.push('<div class="row">');
  for (const i of FEEDBACK_INTENTS)
    out.push(
      `<div class="alert" data-contrast${style({ background: v('feedback', i, 'surface'), 'border-color': v('feedback', i, 'line'), color: v('feedback', i, 'content') })}>${dot(v('feedback', i, 'icon'))}<span><strong>${i}</strong> — a message that says what to do.</span></div>`,
    );
  out.push('</div></section>');

  // typography
  out.push('<section><h2>Typography</h2>');
  for (const [role, def] of Object.entries(recipe.type?.roles ?? {})) {
    out.push(`<div class="type-role"><span class="meta">${html(role)}</span><div>`);
    for (const [step, s] of Object.entries(def.steps)) {
      const px = typeof s === 'number' ? s : s.size;
      out.push(
        `<div class="type-line"><span class="meta">${html(step)} · ${html(px)} px</span>`,
        `<span${style({ font: v('type', role, step), 'letter-spacing': v('type', role, step, 'tracking'), 'text-transform': def.case === 'uppercase' ? 'uppercase' : undefined })}>${SAMPLE}</span></div>`,
      );
    }
    out.push('</div></div>');
  }
  out.push('</section>');

  // sizes, spaces, radii, elevation
  out.push('<section><h2>Sizes</h2><div class="row sizes">');
  for (const s of Object.keys(recipe.control?.sizes ?? {})) {
    out.push(
      `<span class="size"><span class="ctl btn"${style({
        'block-size': v('control', s, 'height'),
        'padding-inline': v('control', s, 'action-inline'),
        gap: v('control', s, 'gap'),
        'border-radius': v('control', s, 'action-radius'),
        font: v('control', s, 'action-text'),
        'letter-spacing': v('control', s, 'action-tracking'),
        background: v('ctl', 'primary', 'background', 'idle'),
        'border-color': v('ctl', 'primary', 'stroke', 'idle'),
        color: v('ctl', 'primary', 'text', 'idle'),
      })}>${dot(v('ctl', 'primary', 'icon', 'idle'))}Action ${html(s)}</span>`,
      `<span class="field"${style({
        'block-size': v('control', s, 'height'),
        'padding-inline': v('control', s, 'field-inline'),
        'border-radius': v('control', s, 'field-radius'),
        font: v('control', s, 'field-text'),
      })}>Field ${html(s)}</span></span>`,
    );
  }
  out.push('</div><div class="row">');
  for (const kind of ['gap', 'inset'] as const)
    for (const g of Object.keys(recipe.spaceRoles?.[kind] ?? {}))
      out.push(
        `<span class="bar"><span class="meta">${kind}.${html(g)}</span><span class="fill"${style({ 'inline-size': v('space', kind, g) })}></span></span>`,
      );
  out.push('</div><div class="row">');
  const radius = recipe.radius;
  for (const r of radius ? Object.keys(radius.shapes[radius.default] ?? {}) : [])
    out.push(`<span class="radius"${style({ 'border-radius': v('radius', r) })}>${html(r)}</span>`);
  out.push('</div><div class="row">');
  for (const e of ELEVATIONS)
    out.push(`<span class="card"${style({ 'box-shadow': v('elevation', e) })}>elevation.${e}</span>`);
  out.push('<span class="card focus-sample">Focus ring</span></div></section>');

  // chart and identity colours
  const viz = recipe.dataviz;
  const arm = n(viz?.diverging.arm.light.length ?? 0);
  const sw = (bg: string | undefined) => `<span class="sw"${style({ background: bg })}></span>`;
  out.push(
    '<section><h2>Chart and identity colours</h2>',
    `<div class="row swatches">${n(viz?.categorical.length ?? 0).map((i) => sw(v('dataviz', 'category', i))).join('')}${sw(v('dataviz', 'category', 'other'))}<span class="meta">categories + other</span></div>`,
    `<div class="row swatches">${n(viz?.sequential.light.length ?? 0).map((i) => sw(v('dataviz', 'sequential', i))).join('')}<span class="meta">sequential</span></div>`,
  );
  for (const offer of ['neutral', 'rated'])
    out.push(
      `<div class="row swatches">${[...arm].reverse().map((i) => sw(v('dataviz', 'diverging', offer, 'low', i))).join('')}${sw(v('dataviz', 'diverging', offer, 'mid'))}${arm.map((i) => sw(v('dataviz', 'diverging', offer, 'high', i))).join('')}<span class="meta">diverging ${offer}</span></div>`,
    );
  out.push('<div class="row">');
  for (const i of [...n(recipe.identity?.hues.length ?? 0), 'neutral'])
    out.push(
      `<span class="chip" data-contrast${style({ background: v('identity', i, 'surface', 'strong'), color: v('identity', i, 'content', 'strong') })}>${i}</span>`,
      `<span class="chip" data-contrast${style({ background: v('identity', i, 'surface', 'subtle'), color: v('identity', i, 'content', 'subtle') })}>${dot(v('identity', i, 'indicator', 'subtle'))}${i}</span>`,
    );
  out.push('</div></section>');

  // motion
  const motion = recipe.motion;
  const durations = motion?.characters[motion.character]?.durations ?? {};
  out.push(
    '<section><h2>Motion</h2>',
    '<label class="meta play"><input type="checkbox"> End state — toggling plays every role with its duration and easing (distance × motion.travel, fade in)</label>',
    '<div class="motion">',
  );
  for (const role of Object.keys(durations)) {
    const d = v('motion', role, 'duration');
    const e = cssVar(P, 'motion', role, 'easing');
    const md = cssVar(P, 'motion', role, 'move-duration');
    const me = cssVar(P, 'motion', role, 'move-easing');
    out.push(
      `<span class="meta">${html(role)}</span>`,
      `<span class="track"${style({
        '--_d': d,
        '--_e': e && e.replace(/\)$/, ', linear)'),
        '--_move-d': md && md.replace(/\)$/, ', var(--_d))'),
        '--_move-e': me && me.replace(/\)$/, ', var(--_e))'),
      })}><span class="mover"></span></span>`,
    );
  }
  out.push('</div></section></div>');
  return out.join('');
}

/** the gallery's own styles; editor chrome (badges, contract marks) is deliberately off-model */
export function galleryStyles(prefix: string): string {
  return STYLES.replaceAll('--x-', `--${prefix.replace(/[^a-z0-9-]/g, '')}`);
}

const STYLES = `
:host { display: block; }
.legend { display: none; margin: 0; font: 12px system-ui, sans-serif; color: var(--x-content-secondary); }
.contrast-on .legend { display: block; }
.contrast-on [data-ratio] { position: relative; }
.contrast-on [data-ratio]::after {
  content: attr(data-ratio); position: absolute; inset-block-end: -9px; inset-inline-end: -6px; z-index: 1;
  padding: 0 3px; border-radius: 3px; background: #1a1a1a; color: #fff;
  font: 600 9px/13px system-ui, sans-serif; letter-spacing: 0; text-transform: none; white-space: nowrap;
}
.contrast-on [data-ratio-fail]::after { background: #ff2d55; }
/* the page the model sits on, as a host's preview root would paint it */
.gallery { padding: var(--x-space-inset-page); display: grid; gap: var(--x-space-gap-section); background: var(--x-surface-page); font: var(--x-type-body-md); color: var(--x-content-primary); }
section { display: grid; gap: var(--x-space-gap-related); }
h2 { margin: 0; font: var(--x-type-title-md); color: var(--x-content-primary); }
.meta { font: var(--x-type-caption-sm); color: var(--x-content-secondary); }
.row { display: flex; flex-wrap: wrap; gap: var(--x-space-gap-related); align-items: center; }
.surfaces { align-items: stretch; }
.surface { flex: 1 1 180px; padding: var(--x-space-inset-container-compact); border-radius: var(--x-radius-container); border: var(--x-border-width-default) solid var(--x-line-edge); display: grid; gap: var(--x-space-gap-tight); align-content: start; }
.surface strong { font: var(--x-type-label-md); }
.surface p { margin: 0; font: var(--x-type-supporting-sm); }
.surface .primary { color: var(--x-content-primary); }
.surface .secondary { color: var(--x-content-secondary); }
.surface.inverted .primary, .surface.inverted strong { color: var(--x-inverted-on-fill); }
.surface.inverted .secondary { color: var(--x-inverted-on-fill); opacity: 0.72; }
.surface.inverted .line-sample { color: var(--x-inverted-on-fill); border-color: var(--x-inverted-on-fill); }
hr.subtle { inline-size: 100%; border: 0; border-block-start: var(--x-border-width-default) solid var(--x-line-subtle); margin: 0; }
.line-sample { font: var(--x-type-caption-sm); padding: 2px 6px; border: var(--x-border-width-default) solid; border-radius: var(--x-radius-item); inline-size: max-content; }
.line-sample.base { border-color: var(--x-line-base); }
.line-sample.strong { border-color: var(--x-line-strong); }
.matrix { display: grid; gap: var(--x-space-gap-tight) var(--x-space-gap-related); align-items: center; overflow-x: auto; }
.col, .rowh { font: var(--x-type-caption-sm); color: var(--x-content-secondary); }
.rowh { font: var(--x-type-label-sm); color: var(--x-content-primary); display: grid; }
.rowh small { font: var(--x-type-caption-sm); color: var(--x-content-secondary); }
.cellwrap { display: inline-flex; padding: var(--x-space-gap-tight); border-radius: var(--x-radius-item); }
.cellwrap.on-inverted { background: var(--x-surface-inverted); }
.cellwrap.fail { position: relative; outline: 2px solid #ff2d55; outline-offset: 1px; }
.cellwrap.fail::after { content: '✗'; position: absolute; inset-block-start: -7px; inset-inline-end: -7px; inline-size: 14px; block-size: 14px; border-radius: 50%; background: #ff2d55; color: #fff; font: 700 9px/14px system-ui, sans-serif; text-align: center; }
.fail-note { color: #ff2d55 !important; cursor: help; }
.contract { display: grid; gap: var(--x-space-gap-tight); padding: var(--x-space-inset-container-compact); border: 2px solid #ff2d55; border-radius: var(--x-radius-container); }
.contract summary { cursor: pointer; font: var(--x-type-label-md); color: #ff2d55; }
.contract p { margin: 0; font: var(--x-type-supporting-sm); }
.ctl { display: inline-flex; align-items: center; gap: var(--x-control-sm-gap); block-size: var(--x-control-sm-height); padding-inline: var(--x-control-sm-action-inline); border: var(--x-border-width-default) solid transparent; border-radius: var(--x-control-sm-action-radius); font: var(--x-control-sm-action-text); letter-spacing: var(--x-control-sm-action-tracking); white-space: nowrap; }
.ctl.box { padding-inline: 0; inline-size: var(--x-control-sm-height); justify-content: center; }
.cellwrap .beside { align-self: center; margin-inline-start: var(--x-space-gap-tight); font: var(--x-control-sm-action-text); }
.ctl.focus { outline: var(--x-focus-width) solid var(--x-focus-ring); outline-offset: var(--x-focus-offset); }
.dot { inline-size: 10px; block-size: 10px; border-radius: var(--x-radius-round); flex: none; }
.chip { display: inline-flex; align-items: center; gap: var(--x-space-gap-tight); block-size: var(--x-badge-md-height); padding-inline: var(--x-badge-md-inline); border-radius: var(--x-radius-badge); font: var(--x-badge-md-text); letter-spacing: var(--x-badge-md-tracking); }
.chip .dot { inline-size: var(--x-badge-dot); block-size: var(--x-badge-dot); }
.alert { flex: 1 1 220px; display: flex; gap: var(--x-space-gap-related); align-items: flex-start; padding: var(--x-space-inset-container-compact); border: var(--x-border-width-default) solid; border-radius: var(--x-radius-container); font: var(--x-type-supporting-sm); }
.alert .dot { margin-block-start: 4px; }
.type-role { display: grid; grid-template-columns: 120px 1fr; gap: var(--x-space-gap-related); align-items: start; padding-block: var(--x-space-gap-tight); border-block-end: var(--x-border-width-default) solid var(--x-line-subtle); }
.type-line { display: grid; grid-template-columns: 96px 1fr; gap: var(--x-space-gap-related); align-items: baseline; overflow: hidden; }
.type-line > span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sizes { align-items: flex-end; }
.size { display: inline-flex; gap: var(--x-space-gap-tight); align-items: center; }
.field { display: inline-flex; align-items: center; border: var(--x-border-width-default) solid var(--x-ctl-secondary-stroke-idle); background: var(--x-ctl-secondary-background-idle); color: var(--x-ctl-secondary-text-subtle-idle); white-space: nowrap; }
.bar { display: inline-grid; gap: 2px; }
.bar .fill { block-size: 8px; background: var(--x-accent-fill); border-radius: var(--x-radius-item); }
.radius { inline-size: 72px; block-size: 48px; display: inline-flex; align-items: center; justify-content: center; border: var(--x-border-width-strong) solid var(--x-line-strong); font: var(--x-type-caption-sm); }
.card { display: inline-flex; align-items: center; padding: var(--x-space-inset-container-compact); border-radius: var(--x-radius-container); background: var(--x-surface-raised); font: var(--x-type-caption-sm); }
.focus-sample { outline: var(--x-focus-width) solid var(--x-focus-ring); outline-offset: var(--x-focus-offset); }
.sw { inline-size: 28px; block-size: 28px; border-radius: var(--x-dataviz-radius); }
.swatches { gap: var(--x-dataviz-gap); }
.swatches .meta { margin-inline-start: var(--x-space-gap-related); }
.motion { display: grid; grid-template-columns: 120px minmax(0, 360px); gap: var(--x-space-gap-tight) var(--x-space-gap-related); align-items: center; }
.track { position: relative; block-size: 12px; border-radius: var(--x-radius-round); background: var(--x-line-subtle); }
/* a transition, not a loop: an instant role would strobe as a loop */
.mover { position: absolute; inset-block: 0; inset-inline-start: 0; inline-size: 12px; border-radius: var(--x-radius-round); background: var(--x-accent-fill); opacity: 0.35; transition: inset-inline-start var(--_move-d) var(--_move-e), opacity var(--_d) var(--_e); }
section:has(.play input:checked) .mover { inset-inline-start: calc(var(--x-motion-travel) * (100% - 12px)); opacity: 1; }
`;

interface Report {
  cells: { fails: ContractFail[] };
  checks: ContractFail[];
}

/** what the gallery draws from a panel state; `undefined` while there is no good run */
export function galleryInput(state: PanelState): GalleryInput | undefined {
  const run = state.run;
  if (!run) return undefined;
  const mode = state.mode.toLowerCase();
  const report: Report = JSON.parse(run.files['model-report.json']);
  const prefix: string = JSON.parse(run.files['render.json']).options?.prefix ?? 'x-';
  return {
    recipe: run.recipe,
    css: state.css,
    prefix,
    cellFails: report.cells.fails.filter((f) => f.mode === mode),
    checkFails: report.checks.filter((c) => c.mode === mode && !c.ok),
  };
}

export const mountGallery: MountGallery = (element) => {
  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
  let shown = '';
  let frame = 0;
  const gallery: Gallery = {
    update(state: PanelState, options: GalleryOptions = {}) {
      const input = galleryInput(state);
      const markup = input
        ? `<style>${galleryStyles(input.prefix)}</style>${galleryHtml(input)}`
        : '<p>No model yet.</p>';
      // only a new drawing replaces the DOM: open details and the motion toggle stay
      if (markup !== shown) {
        root.innerHTML = markup;
        shown = markup;
      }
      root.querySelector('.gallery')?.classList.toggle('contrast-on', !!options.contrast);
      cancelAnimationFrame(frame);
      if (input && options.contrast)
        // measure once the receiver's CSS and this DOM have settled
        frame = requestAnimationFrame(() => measure(root, element, input.recipe.contract.textMin));
    },
    destroy() {
      cancelAnimationFrame(frame);
      root.innerHTML = '';
      shown = '';
    },
  };
  return gallery;
};
