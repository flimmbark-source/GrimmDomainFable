/**
 * Tiny procedural-modelling helper. A model is described as coloured
 * primitive parts and baked into ONE vertex-coloured, flat-shaded geometry, so
 * every stylised prop shares a single material and costs a single draw call
 * (or one instanced draw call for a whole forest).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
  /** 0..1: how much to darken the lowest vertices (hand-painted depth cue). */
  shade?: number;
  /** How much this part moves in the wind (0 = rigid). Scaled by height within the part. */
  sway?: number;
  /** Rounded shading (foliage, thatch) instead of hard facets. */
  soft?: boolean;
  /** Second colour: vertices are tinted towards it by a blotchy pattern. */
  mottle?: number;
  /** Lighten the top of the part towards this colour (sun-bleached crowns). */
  tip?: number;
}

const tmpColor = new THREE.Color();
const tmpColor2 = new THREE.Color();

/** Cheap 3D hash in [0, 1): blotches that are identical for coincident vertices. */
function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(Math.round(x * 3.1) | 0, 374761393) ^ Math.imul(Math.round(y * 3.7) | 0, 668265263) ^ Math.imul(Math.round(z * 2.9) | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function bake(parts: Part[]): THREE.BufferGeometry {
  const baked: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    const geo = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    geo.deleteAttribute('uv');
    const s = part.scale ?? 1;
    const scale = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...(part.pos ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rot ?? [0, 0, 0]))),
      scale,
    );
    geo.applyMatrix4(matrix);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const height = Math.max(box.max.y - box.min.y, 1e-6);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const sway = new Float32Array(pos.count);
    const shade = part.shade ?? 0.28;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - box.min.y) / height;
      tmpColor.setHex(part.color);
      if (part.mottle !== undefined) {
        const m = hash3(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (m > 0.45) tmpColor.lerp(tmpColor2.setHex(part.mottle), (m - 0.45) * 1.5);
      }
      if (part.tip !== undefined) tmpColor.lerp(tmpColor2.setHex(part.tip), t * t * 0.75);
      tmpColor.multiplyScalar(1 - shade * (1 - t));
      colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
      if (part.sway) sway[i] = part.sway * (0.35 + 0.65 * t);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
    if (part.soft) {
      // Rounded: normals radiate from the part's centre, biased upward so crowns catch the light.
      const cx = (box.min.x + box.max.x) / 2;
      const cy = box.min.y + height * 0.3;
      const cz = (box.min.z + box.max.z) / 2;
      const normals = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const nx = pos.getX(i) - cx;
        const ny = pos.getY(i) - cy;
        const nz = pos.getZ(i) - cz;
        const len = Math.hypot(nx, ny, nz) || 1;
        normals.set([nx / len, ny / len, nz / len], i * 3);
      }
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    } else {
      geo.computeVertexNormals(); // non-indexed => faceted, low-poly look
    }
    baked.push(geo);
  }
  const merged = mergeGeometries(baked, false);
  if (!merged) throw new Error('bake: could not merge parts');
  merged.computeBoundingSphere();
  return merged;
}

/** Deterministic value noise in [0, 1) for cosmetic variation (render only). */
export function hash2(x: number, z: number): number {
  let h = Math.imul(Math.floor(x * 73.13) | 0, 374761393) ^ Math.imul(Math.floor(z * 91.71) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function smoothNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const g = (ix: number, iz: number) => hash2(ix / 73.13 + 0.001, iz / 91.71 + 0.001);
  const a = g(x0, z0), b = g(x0 + 1, z0), c = g(x0, z0 + 1), d = g(x0 + 1, z0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
