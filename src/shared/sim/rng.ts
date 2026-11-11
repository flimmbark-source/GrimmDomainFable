/**
 * Seeded PRNG (mulberry32). The whole generator state is one uint32 stored in
 * the simulation state, so a state copy fully captures future randomness.
 */
export function rngNext(state: number): { state: number; value: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: s, value };
}

export function seedToState(seed: number): number {
  return (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
}
