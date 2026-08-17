import type { TurnRng } from "@rpengineext/contracts";

/**
 * Creates a seeded mulberry32 PRNG for deterministic mechanics.
 *
 * @param seed - string or number seed
 */
export function createSeededRng(seed: string | number): TurnRng {
  let state = hashSeed(seed);
  return {
    next(): number {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min: number, max: number): number {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
        throw new RangeError(`invalid rng.int range: ${min}..${max}`);
      }
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(this.next() * (hi - lo + 1));
    },
  };
}

function hashSeed(seed: string | number): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed | 0;
  }
  const text = String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
