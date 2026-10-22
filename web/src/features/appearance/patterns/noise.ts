type Noise3D = (x: number, y: number, z: number) => number;

/** Seeded uniform random numbers in [0, 1), so still frames are reproducible. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gradients = [
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1,
  0, -1, -1,
];
const F3 = 1 / 3;
const G3 = 1 / 6;

/** Deterministic 3D simplex noise in roughly [-1, 1]; the seed keeps patterns stable across reloads. */
export function createNoise(seed: number): Noise3D {
  let state = seed >>> 0;
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const source = Array.from({ length: 256 }, (_, index) => index);
  for (let index = 255; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [source[index], source[swap]] = [source[swap] ?? 0, source[index] ?? 0];
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let index = 0; index < 512; index++) {
    perm[index] = source[index & 255] ?? 0;
    permMod12[index] = (perm[index] ?? 0) % 12;
  }
  const p = (index: number): number => perm[index] ?? 0;
  const corner = (gradient: number, x: number, y: number, z: number): number => {
    let t = 0.6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    t *= t;
    const g = gradient * 3;
    return t * t * ((gradients[g] ?? 0) * x + (gradients[g + 1] ?? 0) * y + (gradients[g + 2] ?? 0) * z);
  };

  return (xin, yin, zin) => {
    const skew = (xin + yin + zin) * F3;
    const i = Math.floor(xin + skew);
    const j = Math.floor(yin + skew);
    const k = Math.floor(zin + skew);
    const unskew = (i + j + k) * G3;
    const x0 = xin - (i - unskew);
    const y0 = yin - (j - unskew);
    const z0 = zin - (k - unskew);
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const g0 = permMod12[ii + p(jj + p(kk))] ?? 0;
    const g1 = permMod12[ii + i1 + p(jj + j1 + p(kk + k1))] ?? 0;
    const g2 = permMod12[ii + i2 + p(jj + j2 + p(kk + k2))] ?? 0;
    const g3 = permMod12[ii + 1 + p(jj + 1 + p(kk + 1))] ?? 0;
    return (
      32 *
      (corner(g0, x0, y0, z0) +
        corner(g1, x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3) +
        corner(g2, x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3) +
        corner(g3, x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3))
    );
  };
}
