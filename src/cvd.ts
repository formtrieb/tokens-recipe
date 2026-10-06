/**
 * Colour-vision checks for chart palettes.
 * Same math as the dataviz skill's validator: Machado, Oliveira & Fernandes
 * (2009) at severity 1.0 in linear sRGB, distance = Euclidean OKLab × 100.
 */

export type Vision = 'protan' | 'deutan' | 'tritan';

/** Thresholds of the dataviz method (OKLCH L band per mode, ΔE × 100). */
export const VIZ = {
  band: { light: [0.43, 0.77], dark: [0.48, 0.67] } as Record<
    'light' | 'dark',
    [number, number]
  >,
  chromaFloor: 0.1,
  cvdTarget: 8,
  normalFloor: 15,
  contrastMin: 3,
};

const MACHADO: Record<Vision, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const s2lin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const lin = (hex: string) =>
  [1, 3, 5].map((i) => s2lin(parseInt(hex.slice(i, i + 2), 16) / 255));

function oklab([r, g, b]: number[]): number[] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function simulate(hex: string, kind: Vision): number[] {
  const [r, g, b] = lin(hex);
  const M = MACHADO[kind];
  const clamp = (c: number) => Math.max(0, Math.min(1, c));
  return M.map((row) => clamp(row[0] * r + row[1] * g + row[2] * b));
}

/** OKLab distance × 100; without `kind` for normal vision. */
export function deltaE(a: string, b: string, kind?: Vision): number {
  const p = oklab(kind ? simulate(a, kind) : lin(a));
  const q = oklab(kind ? simulate(b, kind) : lin(b));
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The red-green check of the method: the weaker of protan and deutan. */
export const cvdDeltaE = (a: string, b: string) =>
  Math.min(deltaE(a, b, 'protan'), deltaE(a, b, 'deutan'));
