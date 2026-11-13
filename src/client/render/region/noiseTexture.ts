/**
 * One small tiling noise texture, generated at load and shared:
 *   R: fine grain for the painted ground (a single fetch, where the shader
 *      used to evaluate two 3D value noises per fragment);
 *   G: soft billows (the water's swell, and baked into the fog-of-war mask).
 * Mipmapped, so both fade to their mean with distance instead of shimmering.
 */
import * as THREE from 'three';

const SIZE = 256;

/** Periodic value noise on a `period` x `period` lattice that wraps across the texture. */
function periodicNoise(period: number, seed: number): (x: number, y: number) => number {
  const lattice = new Float32Array(period * period);
  let state = (Math.imul(seed + 1, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  for (let i = 0; i < lattice.length; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    lattice[i] = state / 4294967296;
  }
  const at = (i: number, j: number) => lattice[((j + period) % period) * period + ((i + period) % period)]!;
  return (x, y) => {
    const fx = (x / SIZE) * period;
    const fy = (y / SIZE) * period;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    let u = fx - i;
    let v = fy - j;
    u = u * u * (3 - 2 * u);
    v = v * v * (3 - 2 * v);
    const a = at(i, j);
    const b = at(i + 1, j);
    const c = at(i, j + 1);
    const d = at(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(octaves: Array<[period: number, weight: number]>, seed: number): (x: number, y: number) => number {
  const layers = octaves.map(([period, weight], k) => ({ noise: periodicNoise(period, seed + k * 101), weight }));
  const total = octaves.reduce((sum, [, w]) => sum + w, 0);
  return (x, y) => layers.reduce((sum, l) => sum + l.noise(x, y) * l.weight, 0) / total;
}

let cached: Uint8Array | null = null;

/** The texels, R then G per texel (generated once). */
function noiseData(): Uint8Array {
  if (cached) return cached;
  const grain = fbm([[128, 0.5], [64, 0.3], [32, 0.2]], 11);
  const billow = fbm([[4, 0.5], [8, 0.28], [16, 0.14], [32, 0.08]], 23);
  const data = new Uint8Array(SIZE * SIZE * 2);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 2;
      // Stretch both to use the full byte range around their mean.
      data[i] = Math.max(0, Math.min(255, Math.round((0.5 + (grain(x, y) - 0.5) * 2.4) * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round((0.5 + (billow(x, y) - 0.5) * 2.2) * 255)));
    }
  }
  return (cached = data);
}

/** The billow channel (0..255) at texture coordinates (u, v), repeating, bilinear: as the GPU would sample it. */
export function billowAt(u: number, v: number): number {
  const data = noiseData();
  const x = (u - Math.floor(u)) * SIZE - 0.5;
  const y = (v - Math.floor(v)) * SIZE - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (i: number, j: number) => data[((((j % SIZE) + SIZE) % SIZE) * SIZE + (((i % SIZE) + SIZE) % SIZE)) * 2 + 1]!;
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
  return top + (bottom - top) * fy;
}

export function tilingNoiseTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(noiseData(), SIZE, SIZE, THREE.RGFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
