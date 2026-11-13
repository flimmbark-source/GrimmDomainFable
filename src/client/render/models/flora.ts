/**
 * Original procedural trees and plants for the settled valley and the oldwood.
 *
 * Collision contract: a tree's solid part is its trunk, and the trunk radius
 * at scale 1 equals TREES[kind].radius in the shared kit. Crowns start above
 * head height and never count as cover; nothing here draws foliage at eye
 * level that the simulation would see through.
 */
import * as THREE from 'three';
import type { Part } from '../bake.ts';
import { Model, Rand, type V3 } from '../modelkit.ts';
import { VALE as C } from '../palette.ts';

interface Crown {
  dark: number;
  mid: number;
  light: number;
}

/** A crown of overlapping faceted clumps: dark underneath, sunlit on top. */
function crown(m: Model, r: Rand, centre: V3, radius: number, clumps: number, c: Crown, o: { flat?: number; detail?: number; sway?: number; fruit?: number[]; fruitCount?: number } = {}): void {
  const flat = o.flat ?? 0.72;
  const detail = o.detail ?? 1;
  const sway = o.sway ?? 0.1;
  // Core mass.
  m.lump(radius * 0.78, c.dark, { p: centre, s: [1, flat, 1], soft: false, shade: 0.42, sway, tip: c.mid }, detail, Math.floor(r.next() * 99));
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + r.range(-0.4, 0.4);
    const ring = i % 3 === 0 ? 0.25 : 0.62;
    const rr = radius * r.range(0.38, 0.56);
    const up = i % 3 === 0 ? radius * flat * 0.55 : r.range(-0.15, 0.3) * radius * flat;
    m.lump(rr, i % 3 === 0 ? c.light : c.mid, {
      p: [centre[0] + Math.cos(a) * radius * ring, centre[1] + up, centre[2] + Math.sin(a) * radius * ring],
      s: [r.range(0.95, 1.25), flat * r.range(0.8, 1.05), r.range(0.95, 1.25)],
      r: [r.range(-0.3, 0.3), r.range(0, 3), r.range(-0.3, 0.3)],
      soft: false, shade: 0.36, sway: sway * 1.3, tip: i % 3 === 0 ? c.light : c.mid,
    }, clumps <= 5 ? 1 : 0, Math.floor(r.next() * 99), 0.16);
  }
  if (o.fruit) {
    const n = o.fruitCount ?? 14;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2);
      const e = r.range(-0.5, 0.35);
      const rad = radius * r.range(0.82, 1.0);
      m.add(octa(0.075), o.fruit[i % o.fruit.length]!, {
        p: [centre[0] + Math.cos(a) * Math.cos(e) * rad, centre[1] + Math.sin(e) * rad * flat, centre[2] + Math.sin(a) * Math.cos(e) * rad],
        shade: 0.1, sway: sway * 1.3,
      });
    }
  }
}

/** Fruit: a small faceted ball, not a gem. */
const octa = (r: number) => new THREE.IcosahedronGeometry(r, 0);

/** Root flare at the foot of a trunk. */
function roots(m: Model, r: Rand, radius: number, color: number, n: number, reach = 2.2): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.3, 0.3);
    const len = radius * r.range(reach * 0.7, reach);
    m.limb(
      [[Math.cos(a) * radius * 0.5, radius * 1.3, Math.sin(a) * radius * 0.5], [Math.cos(a) * radius * 1.1, radius * 0.45, Math.sin(a) * radius * 1.1], [Math.cos(a) * len, -0.05, Math.sin(a) * len]],
      radius * 0.42, radius * 0.1, color, { shade: 0.3 }, 5,
    );
  }
}

/** Mature orchard apple: short clean trunk, open goblet of limbs, wide low crown, fruit. */
function apple(variant: number, lod: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 13 + 1);
  const lean = r.range(-0.12, 0.12);
  const fork = 1.55 + r.range(-0.15, 0.2);
  if (lod > 0) {
    m.post(0.2, 0.38, fork + 0.8, C.bark, { r: [0, 0, lean], shade: 0.3 }, 5);
    m.lump(1.9, C.apple, { p: [lean * -2, 3.3, 0], s: [1.15, 0.72, 1.15], soft: false, shade: 0.4, tip: C.appleLight, sway: 0.08 }, 1, variant);
    m.lump(1.2, C.appleLight, { p: [0.5, 3.9, 0.3], s: [1.2, 0.6, 1.1], soft: false, shade: 0.3, sway: 0.08 }, 0, variant + 1);
    return m.parts;
  }
  m.limb([[0, 0, 0], [lean * 0.4, fork * 0.5, r.range(-0.05, 0.05)], [lean, fork, 0]], 0.38, 0.27, C.bark, { mottle: C.barkDark, shade: 0.3 }, 7);
  roots(m, r, 0.38, C.barkDark, 4, 1.6);
  const limbs = 3 + (variant % 2);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r.range(-0.3, 0.3);
    const out = r.range(1.0, 1.5);
    m.limb(
      [[lean, fork - 0.1, 0], [lean + Math.cos(a) * out * 0.5, fork + 0.55, Math.sin(a) * out * 0.5], [lean + Math.cos(a) * out, fork + 1.25 + r.range(-0.1, 0.25), Math.sin(a) * out]],
      0.2, 0.07, C.bark, { shade: 0.2, sway: 0.02 }, 5,
    );
  }
  crown(m, r, [lean, fork + 1.75, 0], 2.15, 7, { dark: C.appleDark, mid: C.apple, light: C.appleLight }, { flat: 0.66, fruit: variant % 4 === 3 ? [C.appleFruitGold, C.appleFruit] : [C.appleFruit, C.appleFruit, C.appleFruitGold], fruitCount: 16 });
  // A pruning scar and a prop under a heavy limb: signs of being looked after.
  m.cyl(0.11, 0.11, 0.04, C.timberPale, { p: [lean + 0.2, fork * 0.8, 0.22], r: [1.2, 0, 0.4], shade: 0 }, 6);
  if (variant % 2 === 0) m.post(0.045, 0.055, fork + 0.9, C.timberPale, { p: [1.25, 0, 0.5], r: [0, 0, 0.16], shade: 0.1 }, 4);
  return m.parts;
}

/** Old orchard survivor: thick, twisted, hollowing trunk, heavy crooked limbs, sparse top. */
function appleOld(variant: number, lod: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 17 + 5);
  const lean = r.range(0.12, 0.26) * (variant % 2 ? 1 : -1);
  if (lod > 0) {
    m.post(0.3, 0.52, 2.4, C.barkOld, { r: [0, 0, lean], shade: 0.3 }, 5);
    m.lump(2.1, C.appleDark, { p: [-lean * 3, 3.6, 0], s: [1.25, 0.7, 1.1], soft: false, shade: 0.4, tip: C.apple, sway: 0.08 }, 1, variant);
    return m.parts;
  }
  m.limb([[0, 0, 0], [lean * 1.4, 0.8, 0.1], [lean * 0.6, 1.5, -0.1], [lean * 2.6, 2.1, 0]], 0.52, 0.34, C.barkOld, { mottle: C.barkGrey, shade: 0.32 }, 8);
  roots(m, r, 0.5, C.barkOld, 5, 1.9);
  m.lump(0.22, 0x241c16, { p: [lean * 1.1 + 0.2, 1.0, 0.36], s: [0.7, 1.3, 0.4], shade: 0 }, 0, 3); // hollow
  m.lump(0.3, C.moss, { p: [lean * 0.4 - 0.3, 0.5, -0.3], s: [1, 0.6, 0.6], soft: false }, 0, 4);
  const top: V3 = [lean * 2.6, 2.1, 0];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r.range(-0.4, 0.4);
    const out = r.range(1.5, 2.2);
    m.limb(
      [top, [top[0] + Math.cos(a) * out * 0.4, top[1] + 0.3, Math.sin(a) * out * 0.4], [top[0] + Math.cos(a) * out * 0.8, top[1] + r.range(0.2, 0.9), Math.sin(a) * out * 0.8], [top[0] + Math.cos(a) * out, top[1] + 1.4, Math.sin(a) * out]],
      0.25, 0.07, C.barkOld, { shade: 0.2, sway: 0.02 }, 5,
    );
  }
  crown(m, r, [top[0], top[1] + 1.7, 0], 2.45, 6, { dark: C.appleDark, mid: C.apple, light: C.appleLight }, { flat: 0.6, fruit: [C.appleFruit, C.appleFruitGold], fruitCount: 10 });
  m.limb([top, [top[0] - 1.2, top[1] + 0.9, 0.8], [top[0] - 1.9, top[1] + 0.8, 1.3]], 0.1, 0.03, C.barkGrey, { shade: 0.1 }, 4); // dead branch
  return m.parts;
}

/** Newly planted whip, staked and tied. */
function appleYoung(variant: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 7 + 2);
  m.post(0.05, 0.085, 1.9, C.bark, { r: [0, 0, r.range(-0.05, 0.05)], shade: 0.2 }, 5);
  m.post(0.045, 0.05, 1.5, C.timberPale, { p: [0.2, 0, 0.05], shade: 0.1 }, 4);
  m.box(0.26, 0.05, 0.05, C.rope, { p: [0.1, 1.2, 0.03] });
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + r.range(0, 1);
    m.lump(0.5, i ? C.appleLight : C.apple, { p: [Math.cos(a) * 0.3, 2.1 + i * 0.25, Math.sin(a) * 0.3], s: [1, 0.8, 1], soft: false, shade: 0.3, sway: 0.16 }, 0, variant + i);
  }
  // Woven guard against deer.
  m.cyl(0.24, 0.28, 0.7, C.basket, { p: [0, 0.35, 0], shade: 0.3 }, 7);
  return m.parts;
}

/** Feral apple from an abandoned plot: suckered, unpruned, half strangled. */
function appleFeral(variant: number, lod: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 19 + 9);
  if (lod > 0) {
    m.post(0.25, 0.45, 2.6, C.barkGrey, { shade: 0.3 }, 5);
    m.lump(1.9, C.oldwood, { p: [0.3, 3.8, 0], s: [1, 0.95, 1], soft: false, shade: 0.45, tip: C.appleDark, sway: 0.08 }, 1, variant);
    return m.parts;
  }
  m.limb([[0, 0, 0], [0.15, 1.2, 0.1], [-0.1, 2.3, 0]], 0.45, 0.28, C.barkGrey, { mottle: C.moss, shade: 0.35 }, 7);
  roots(m, r, 0.42, C.barkGrey, 4, 1.7);
  for (let i = 0; i < 5; i++) {
    const a = r.range(0, 6.28);
    m.limb([[Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3], [Math.cos(a) * 0.5, 1.2, Math.sin(a) * 0.5], [Math.cos(a) * 0.75, 2.3 + r.range(0, 0.8), Math.sin(a) * 0.75]], 0.05, 0.02, C.barkGrey, { shade: 0.1, sway: 0.03 }, 4);
  }
  crown(m, r, [-0.1, 3.9, 0], 1.9, 6, { dark: C.oldwoodDark, mid: C.appleDark, light: C.apple }, { flat: 0.95, fruit: [C.appleFruitGold], fruitCount: 5 });
  m.lump(0.5, C.ivy, { p: [0.1, 1.5, 0.25], s: [1.1, 2.2, 1.0], soft: false, shade: 0.4 }, 0, 6);
  return m.parts;
}

/**
 * Witness tree: an ancient boundary oak. Trunk radius 1.7 m at scale 1 (the
 * collider), buttressed and hollowed, with limbs as thick as ordinary trees
 * and a crown that starts 5 m up.
 */
function witness(variant: number, lod: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 23 + 3);
  const R = 1.55;
  if (lod > 0) {
    m.post(R * 0.62, R, 6.4, C.barkOld, { shade: 0.35 }, 7);
    m.lump(5.4, C.witness, { p: [0, 10.2, 0], s: [1.2, 0.68, 1.2], soft: false, shade: 0.45, tip: C.witnessLight, sway: 0.05 }, 1, variant);
    m.lump(3.4, C.witnessLight, { p: [1.6, 12.3, 0.8], s: [1.2, 0.6, 1.2], soft: false, shade: 0.3, sway: 0.05 }, 1, variant + 1);
    return m.parts;
  }
  // Fluted trunk: a core plus buttress ribs twisting up it.
  m.limb([[0, -0.2, 0], [0.15, 2.2, 0.1], [-0.1, 4.4, -0.1], [0.2, 6.2, 0.1]], R, R * 0.66, C.barkOld, { mottle: C.barkDark, shade: 0.38 }, 10);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r.range(-0.2, 0.2);
    const tw = r.range(0.3, 0.7);
    m.limb(
      [[Math.cos(a) * R * 1.02, -0.2, Math.sin(a) * R * 1.02], [Math.cos(a + tw * 0.3) * R * 0.86, 1.4, Math.sin(a + tw * 0.3) * R * 0.86], [Math.cos(a + tw) * R * 0.68, 3.6, Math.sin(a + tw) * R * 0.68], [Math.cos(a + tw * 1.4) * R * 0.5, 5.6, Math.sin(a + tw * 1.4) * R * 0.5]],
      0.5, 0.26, i % 2 ? C.barkOld : C.barkDark, { mottle: C.barkGrey, shade: 0.3 }, 5,
    );
  }
  // Spreading surface roots, kept inside the trunk's footprint so they are never a trip line.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r.range(-0.2, 0.2);
    m.limb([[Math.cos(a) * R * 0.7, 0.9, Math.sin(a) * R * 0.7], [Math.cos(a) * R * 0.95, 0.35, Math.sin(a) * R * 0.95], [Math.cos(a) * R * 1.08, -0.1, Math.sin(a) * R * 1.08]], 0.4, 0.2, C.barkDark, { shade: 0.3 }, 5);
  }
  // Hollow, burrs and moss.
  m.lump(0.6, 0x1c1612, { p: [Math.cos(variant) * R * 0.86, 1.5, Math.sin(variant) * R * 0.86], s: [0.75, 1.5, 0.75], shade: 0 }, 1, 2);
  for (let i = 0; i < 4; i++) {
    const a = r.range(0, 6.28);
    m.lump(0.45, i % 2 ? C.barkDark : C.moss, { p: [Math.cos(a) * R * 0.86, r.range(1.5, 4.5), Math.sin(a) * R * 0.86], s: [1, 0.8, 0.6], soft: i % 2 === 1, shade: 0.2 }, 0, i);
  }
  // Great limbs.
  const limbCount = 5;
  const tips: V3[] = [];
  for (let i = 0; i < limbCount; i++) {
    const a = (i / limbCount) * Math.PI * 2 + r.range(-0.3, 0.3);
    const out = r.range(4.2, 6.0);
    const rise = r.range(2.2, 4.2);
    const tip: V3 = [Math.cos(a) * out, 6.6 + rise, Math.sin(a) * out];
    tips.push(tip);
    m.limb(
      [[0.1, 5.2, 0], [Math.cos(a) * out * 0.3, 6.6, Math.sin(a) * out * 0.3], [Math.cos(a) * out * 0.65, 6.9 + rise * 0.45, Math.sin(a) * out * 0.65], tip],
      0.62, 0.16, C.barkOld, { mottle: C.barkDark, shade: 0.25, sway: 0.01 }, 6,
    );
  }
  m.limb([[0.2, 6.0, 0.1], [0.5, 8.5, -0.3], [0.1, 11, 0.2]], 0.7, 0.2, C.barkOld, { shade: 0.2 }, 6);
  const c = { dark: C.witnessDark, mid: C.witness, light: C.witnessLight };
  crown(m, r, [0.2, 11.6, 0], 4.3, 8, c, { flat: 0.6, sway: 0.05 });
  for (const tip of tips) crown(m, r, [tip[0] * 1.02, tip[1] + 0.9, tip[2] * 1.02], 2.9, 5, c, { flat: 0.58, sway: 0.06 });
  // A storm-broken stub: the tree has outlived things.
  m.limb([[0, 5.6, 0], [-1.6, 6.6, -1.2], [-2.6, 6.9, -1.9]], 0.4, 0.22, C.barkGrey, { shade: 0.2 }, 5);
  return m.parts;
}

/** Mature oldwood tree: tall straight bole, high dark crown. Trunk radius 0.85 m at scale 1. */
function oldwood(variant: number, lod: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 29 + 7);
  const lean = r.range(-0.08, 0.08);
  const h = 6.8 + (variant % 3) * 0.7;
  const c = variant % 4 === 2 ? { dark: C.oldwoodDark, mid: C.witness, light: C.oldwoodLight } : { dark: C.oldwoodDark, mid: C.oldwood, light: C.oldwoodLight };
  if (lod > 0) {
    m.post(0.45, 0.82, h, C.barkDark, { r: [0, 0, lean], shade: 0.35 }, 6);
    m.lump(3.5, c.mid, { p: [lean * -h, h + 1.8, 0], s: [1.1, 0.8, 1.1], soft: false, shade: 0.45, tip: c.light, sway: 0.05 }, 1, variant);
    return m.parts;
  }
  m.limb([[0, -0.1, 0], [lean * h * 0.3, h * 0.35, r.range(-0.15, 0.15)], [lean * h * 0.7, h * 0.7, 0], [lean * h, h, 0]], 0.82, 0.42, C.barkDark, { mottle: C.barkOld, shade: 0.38 }, 8);
  roots(m, r, 0.8, C.barkDark, 6, 1.5);
  m.lump(0.5, C.moss, { p: [0.5, 0.5, 0.45], s: [1.2, 0.9, 0.7], soft: false, shade: 0.2 }, 0, 2);
  const top: V3 = [lean * h, h, 0];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r.range(-0.4, 0.4);
    const out = r.range(2.2, 3.4);
    m.limb([[top[0] * 0.8, h * 0.8, 0], [top[0] + Math.cos(a) * out * 0.5, h + 0.2, Math.sin(a) * out * 0.5], [top[0] + Math.cos(a) * out, h + r.range(0.9, 2), Math.sin(a) * out]], 0.32, 0.09, C.barkDark, { shade: 0.2, sway: 0.01 }, 5);
  }
  crown(m, r, [top[0], h + 2.1, 0], 3.6, 8, c, { flat: 0.74, sway: 0.05 });
  crown(m, r, [top[0] + r.range(-0.8, 0.8), h + 4.2, r.range(-0.6, 0.6)], 2.3, 4, c, { flat: 0.7, sway: 0.06 });
  // A dead snag low on the bole.
  m.limb([[lean * 2, 3.4, 0], [1.2, 3.9, 0.6], [1.9, 3.7, 1.0]], 0.13, 0.04, C.barkGrey, { shade: 0.1 }, 4);
  return m.parts;
}

/** Broad field oak (richer replacement for the M0 oak in this region). Trunk radius 0.75 m. */
function fieldOak(variant: number, lod: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 31 + 4);
  const c = { dark: C.oldwood, mid: C.witnessLight, light: C.appleLight };
  if (lod > 0) {
    m.post(0.45, 0.72, 3.4, C.bark, { shade: 0.35 }, 6);
    m.lump(3.3, c.mid, { p: [0, 5.6, 0], s: [1.2, 0.72, 1.2], soft: false, shade: 0.42, tip: c.light, sway: 0.06 }, 1, variant);
    return m.parts;
  }
  m.limb([[0, -0.1, 0], [0.1, 1.6, 0.05], [-0.05, 3.2, 0]], 0.74, 0.5, C.bark, { mottle: C.barkDark, shade: 0.35 }, 8);
  roots(m, r, 0.72, C.barkDark, 6, 1.6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r.range(-0.3, 0.3);
    const out = r.range(2.2, 3.2);
    m.limb([[0, 2.9, 0], [Math.cos(a) * out * 0.5, 3.9, Math.sin(a) * out * 0.5], [Math.cos(a) * out, 4.9 + r.range(0, 0.8), Math.sin(a) * out]], 0.34, 0.1, C.bark, { shade: 0.2, sway: 0.01 }, 5);
  }
  crown(m, r, [0, 5.9, 0], 3.5, 9, c, { flat: 0.66, sway: 0.07 });
  return m.parts;
}

/** Birch: slim white stem (thin: not cover), light trembling crown. */
function birch(variant: number, lod: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 37 + 6);
  const lean = r.range(-0.1, 0.1);
  const gold = variant % 3 === 1;
  if (lod > 0) {
    m.post(0.1, 0.24, 5.4, C.barkBirch, { r: [0, 0, lean], shade: 0.2 }, 5);
    m.lump(1.6, gold ? C.birchGold : C.birch, { p: [-lean * 5, 5.9, 0], s: [1, 1.3, 1], soft: false, shade: 0.35, sway: 0.14 }, 1, variant);
    return m.parts;
  }
  m.limb([[0, 0, 0], [lean * 2, 2.4, 0.1], [lean * 4.5, 4.8, 0], [lean * 6.5, 6.6, 0]], 0.26, 0.07, C.barkBirch, { mottle: 0x4a4640, shade: 0.2, sway: 0.01 }, 6);
  for (let i = 0; i < 4; i++) m.cyl(0.2 - i * 0.03, 0.21 - i * 0.03, 0.08, 0x3a3632, { p: [lean * (0.8 + i * 0.9), 0.9 + i * 1.1, 0], shade: 0 }, 6);
  const c = { dark: gold ? C.birch : C.hedge, mid: gold ? C.birchGold : C.birch, light: gold ? C.appleFruitGold : C.willowLight };
  crown(m, r, [lean * 5, 5.6, 0], 1.6, 5, c, { flat: 1.25, sway: 0.2, detail: 0 });
  crown(m, r, [lean * 6.5, 7.3, 0], 1.0, 3, c, { flat: 1.2, sway: 0.24, detail: 0 });
  return m.parts;
}

/** Pollard willow by the water: stout bole, mop of long drooping withies. Trunk radius 0.7 m. */
function willow(variant: number, lod: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 41 + 8);
  if (lod > 0) {
    m.post(0.55, 0.68, 2.6, C.barkGrey, { shade: 0.35 }, 6);
    m.lump(2.8, C.willow, { p: [0, 4.0, 0], s: [1.2, 0.85, 1.2], soft: false, shade: 0.4, tip: C.willowLight, sway: 0.14 }, 1, variant);
    return m.parts;
  }
  m.limb([[0, -0.1, 0], [r.range(-0.15, 0.15), 1.3, 0.05], [0, 2.5, 0]], 0.7, 0.6, C.barkGrey, { mottle: C.barkOld, shade: 0.35 }, 8);
  m.lump(0.85, C.barkGrey, { p: [0, 2.75, 0], s: [1, 0.6, 1], shade: 0.3 }, 1, variant); // pollard knuckle
  roots(m, r, 0.66, C.barkOld, 5, 1.5);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
    const out = r.range(2.1, 3.1);
    const droop = r.range(1.6, 2.5);
    m.limb(
      [[Math.cos(a) * 0.4, 2.9, Math.sin(a) * 0.4], [Math.cos(a) * out * 0.55, 4.6 + r.range(0, 0.6), Math.sin(a) * out * 0.55], [Math.cos(a) * out, 4.0, Math.sin(a) * out], [Math.cos(a) * out * 1.12, 4.0 - droop, Math.sin(a) * out * 1.12]],
      0.09, 0.02, C.barkOld, { shade: 0.1, sway: 0.1 }, 4,
    );
    // Hanging leaf curtains, ending above head height at the trunk and lower at the tips.
    m.lump(0.7, i % 2 ? C.willow : C.willowLight, { p: [Math.cos(a) * out * 1.0, 3.9 - droop * 0.35, Math.sin(a) * out * 1.0], s: [0.7, 1.9, 0.7], soft: false, shade: 0.4, sway: 0.3, tip: C.willowLight }, 0, i);
  }
  m.lump(2.3, C.willow, { p: [0, 4.6, 0], s: [1.2, 0.55, 1.2], soft: false, shade: 0.35, sway: 0.16, tip: C.willowLight }, 1, variant + 3);
  return m.parts;
}

/** Coppice stool: a ring of many straight poles from one old base, densely leaved from the ground up. Radius 0.95 m, and it is drawn as the solid screen the simulation treats it as. */
function coppice(variant: number, lod: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 43 + 2);
  m.lump(0.7, C.barkOld, { p: [0, 0.15, 0], s: [1.2, 0.5, 1.2], shade: 0.3, mottle: C.moss }, 0, variant);
  const n = lod > 0 ? 5 : 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
    const base = r.range(0.25, 0.6);
    const spread = r.range(0.75, 0.95);
    m.limb([[Math.cos(a) * base, 0.1, Math.sin(a) * base], [Math.cos(a) * spread, 2.2, Math.sin(a) * spread], [Math.cos(a) * spread * 1.1, 4.4 + r.range(-0.5, 0.6), Math.sin(a) * spread * 1.1]], 0.085, 0.035, i % 2 ? C.barkGrey : C.bark, { shade: 0.15, sway: 0.03 }, 4);
  }
  const leaves = lod > 0 ? 3 : 7;
  for (let i = 0; i < leaves; i++) {
    const a = r.range(0, 6.28);
    const y = 1.0 + (i / leaves) * 3.4;
    m.lump(0.85, i % 3 === 0 ? C.hedgeLight : i % 2 ? C.birch : C.hedge, { p: [Math.cos(a) * 0.3, y, Math.sin(a) * 0.3], s: [1.15, 1.0, 1.15], soft: false, shade: 0.4, sway: 0.14, tip: C.birch }, lod > 0 ? 0 : 1, variant + i);
  }
  return m.parts;
}

/** Self-sown sapling: a thin whip with a few leaves. Blocks a step, hides nothing. */
function sapling(variant: number): Part[] {
  const m = new Model();
  const r = new Rand(variant * 47 + 1);
  const lean = r.range(-0.2, 0.2);
  m.limb([[0, 0, 0], [lean, 1.4, 0.05], [lean * 1.8, 2.8, 0]], 0.09, 0.025, C.bark, { shade: 0.2, sway: 0.05 }, 4);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    m.lump(0.3, i % 2 ? C.birch : C.oldwoodLight, { p: [lean * (1 + i * 0.3) + Math.cos(a) * 0.3, 2.0 + i * 0.33, Math.sin(a) * 0.3], s: [1, 0.7, 1], soft: false, shade: 0.3, sway: 0.25 }, 0, i);
  }
  return m.parts;
}

export type FloraKind = 'tree_apple' | 'tree_apple_old' | 'tree_apple_young' | 'tree_apple_feral' | 'tree_witness' | 'tree_oldwood' | 'tree_birch' | 'tree_willow' | 'coppice_stool' | 'sapling' | 'field_oak';

export const FLORA_BUILDERS: Record<FloraKind, (variant: number, lod: number) => Part[]> = {
  tree_apple: apple,
  tree_apple_old: appleOld,
  tree_apple_young: appleYoung,
  tree_apple_feral: appleFeral,
  tree_witness: witness,
  tree_oldwood: oldwood,
  tree_birch: birch,
  tree_willow: willow,
  coppice_stool: coppice,
  sapling,
  field_oak: fieldOak,
};
