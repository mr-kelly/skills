// Deterministic seeded PRNG (mulberry32) + a string hash seed helper.
// Pure module: no fs, no network, no Date.now(), no Math.random() — every
// number stream is 100% reproducible from the seed string. This is what makes
// the "predicted next action" and the backtest reproducible across runs.

export function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seedText: string): () => number {
  return mulberry32(hashSeed(seedText));
}

export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randFloat(rng: () => number, min: number, max: number, digits = 2): number {
  const value = rng() * (max - min) + min;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)];
}
