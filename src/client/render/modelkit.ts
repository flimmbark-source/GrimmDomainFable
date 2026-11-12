/**
 * Modelling kit for original procedural art. A Model is a list of coloured
 * parts positioned through a small transform stack, baked (see bake.ts) into
 * one vertex-coloured geometry. Buildings, trees and props are all written
 * against this, so an authored GLB can replace any of them later through the
 * asset manifest without touching a caller.
 *
 * Conventions: metres, +Y up, origin on the ground at the centre of the
 * footprint, fronts face +Z.
 */
import * as THREE from 'three';
import type { Part } from './bake.ts';

export type V3 = [number, number, number];

export interface PartOptions {
  /** Position. */
  p?: V3;
  /** Euler rotation (XYZ order), radians. */
  r?: V3;
  /** Scale. */
  s?: V3 | number;
  shade?: number;
  sway?: number;
  soft?: boolean;
  mottle?: number;
  tip?: number;
}

/** Small deterministic generator for per-variant differences. */
export class Rand {
  private state: number;
  constructor(seed: number) {
    this.state = (Math.imul(seed + 1, 2654435761) ^ 0x6d2b79f5) >>> 0 || 1;
  }
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Shift a colour's lightness and warmth a little (variant tinting). */
export function tint(color: number, lightness: number, warmth = 0): number {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + warmth + 1) % 1, hsl.s, Math.max(0, Math.min(1, hsl.l + lightness)));
  return c.getHex();
}

export function mix(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

/** Triangular prism: gable end in the XY plane, extruded along Z. Base at y = 0. */
export function prismGeo(width: number, height: number, depth: number, apexOffset = 0): THREE.BufferGeometry {
  const w = width / 2;
  const d = depth / 2;
  const a = apexOffset;
  // prettier-ignore
  const v = [
    // front (z = +d) and back triangles
    -w, 0, d,  w, 0, d,  a, height, d,
     w, 0, -d, -w, 0, -d,  a, height, -d,
    // left slope
    -w, 0, -d, -w, 0, d,  a, height, d,
    -w, 0, -d,  a, height, d,  a, height, -d,
    // right slope
     w, 0, d,  w, 0, -d,  a, height, -d,
     w, 0, d,  a, height, -d,  a, height, d,
    // underside
    -w, 0, -d,  w, 0, -d,  w, 0, d,
    -w, 0, -d,  w, 0, d, -w, 0, d,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return geo;
}

/** A box whose top face is narrower than its base (battered walls, plinths, stones). */
export function taperGeo(wBottom: number, dBottom: number, wTop: number, dTop: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > 0;
    pos.setXYZ(i, pos.getX(i) * (top ? wTop : wBottom), (pos.getY(i) + 0.5) * height, pos.getZ(i) * (top ? dTop : dBottom));
  }
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  return geo;
}

/** Lumpy sphere: foliage clump, boulder, haystack. Deterministic per seed. */
export function lumpGeo(radius: number, detail: number, seed: number, roughness = 0.22): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Hash of the rounded direction: coincident vertices move together.
    const qx = Math.round((x / radius) * 5);
    const qy = Math.round((y / radius) * 5);
    const qz = Math.round((z / radius) * 5);
    let h = Math.imul(qx + 17, 374761393) ^ Math.imul(qy + 31, 668265263) ^ Math.imul(qz + 47 + seed * 13, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const k = 1 + (((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5) * 2 * roughness;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  return geo;
}

/** A tube bent through points (tree limbs, roots). Radii taper from r0 to r1. */
export function limbGeo(points: V3[], r0: number, r1: number, sides = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const segments = Math.max(2, (points.length - 1) * 3);
  const geo = new THREE.TubeGeometry(curve, segments, 1, sides, false);
  const pos = geo.getAttribute('position');
  // TubeGeometry lays vertices out ring by ring: rescale each ring about its centre.
  const centre = new THREE.Vector3();
  for (let ring = 0; ring <= segments; ring++) {
    curve.getPointAt(ring / segments, centre);
    const r = r0 + (r1 - r0) * (ring / segments);
    for (let k = 0; k <= sides; k++) {
      const i = ring * (sides + 1) + k;
      pos.setXYZ(i, centre.x + (pos.getX(i) - centre.x) * r, centre.y + (pos.getY(i) - centre.y) * r, centre.z + (pos.getZ(i) - centre.z) * r);
    }
  }
  return geo;
}

export class Model {
  readonly parts: Part[] = [];
  private readonly stack: THREE.Matrix4[] = [new THREE.Matrix4()];

  /** Enter a local frame: translate, then turn about Y, then optional scale. */
  push(p: V3, yaw = 0, s: V3 | number = 1, tilt?: V3): this {
    const scale = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt?.[0] ?? 0, yaw + (tilt?.[1] ?? 0), tilt?.[2] ?? 0, 'YXZ'));
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...p), q, scale);
    this.stack.push(this.stack.at(-1)!.clone().multiply(local));
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  /** Run `fn` inside a local frame. */
  at(p: V3, yaw: number, fn: () => void, s: V3 | number = 1, tilt?: V3): this {
    this.push(p, yaw, s, tilt);
    fn();
    return this.pop();
  }

  add(geo: THREE.BufferGeometry, color: number, o: PartOptions = {}): this {
    const s = o.s ?? 1;
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...(o.p ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.r ?? [0, 0, 0]))),
      typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s),
    );
    const world = this.stack.at(-1)!.clone().multiply(local);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(world);
    // A mirrored frame flips triangle winding: put it back.
    if (world.determinant() < 0) {
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i += 3) {
        const x = pos.getX(i + 1), y = pos.getY(i + 1), z = pos.getZ(i + 1);
        pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
        pos.setXYZ(i + 2, x, y, z);
      }
    }
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    const part: Part = { geo: g, color };
    if (o.shade !== undefined) part.shade = o.shade;
    if (o.sway !== undefined) part.sway = o.sway;
    if (o.soft) part.soft = true;
    if (o.mottle !== undefined) part.mottle = o.mottle;
    if (o.tip !== undefined) part.tip = o.tip;
    this.parts.push(part);
    return this;
  }

  /** Box centred on p. */
  box(w: number, h: number, d: number, color: number, o: PartOptions = {}): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, o);
  }

  /** Box standing on y = p.y (p is the centre of its base). */
  block(w: number, h: number, d: number, color: number, o: PartOptions = {}): this {
    const p = o.p ?? [0, 0, 0];
    return this.box(w, h, d, color, { ...o, p: [p[0], p[1] + h / 2, p[2]] });
  }

  cyl(rTop: number, rBottom: number, h: number, color: number, o: PartOptions = {}, sides = 8): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, sides, 1), color, o);
  }

  /** Cylinder standing on y = p.y. */
  post(rTop: number, rBottom: number, h: number, color: number, o: PartOptions = {}, sides = 6): this {
    const p = o.p ?? [0, 0, 0];
    return this.cyl(rTop, rBottom, h, color, { ...o, p: [p[0], p[1] + h / 2, p[2]] }, sides);
  }

  cone(r: number, h: number, color: number, o: PartOptions = {}, sides = 7): this {
    return this.add(new THREE.ConeGeometry(r, h, sides, 1), color, o);
  }

  lump(r: number, color: number, o: PartOptions = {}, detail = 1, seed = 0, roughness = 0.22): this {
    return this.add(lumpGeo(r, detail, seed, roughness), color, o);
  }

  prism(w: number, h: number, d: number, color: number, o: PartOptions = {}, apexOffset = 0): this {
    return this.add(prismGeo(w, h, d, apexOffset), color, o);
  }

  taper(wB: number, dB: number, wT: number, dT: number, h: number, color: number, o: PartOptions = {}): this {
    return this.add(taperGeo(wB, dB, wT, dT, h), color, o);
  }

  limb(points: V3[], r0: number, r1: number, color: number, o: PartOptions = {}, sides = 6): this {
    return this.add(limbGeo(points, r0, r1, sides), color, o);
  }
}
