/**
 * Original procedural props for a working orchard valley: the things people
 * use (carts, barrels, presses, ladders, baskets), the things that mark the
 * boundary (witness stones), and small ground cover.
 *
 * Solid props match the footprints in the shared kit (ROUND_PROPS, BOX_PROPS).
 * Dressing has no collider and is kept low or leaned on something solid.
 */
import * as THREE from 'three';
import type { DressingKind } from '../../../shared/sim/region.ts';
import type { Part } from '../bake.ts';
import { Model, Rand, tint } from '../modelkit.ts';
import { VALE as C } from '../palette.ts';
import { barrel } from './buildings.ts';

const octa = (r: number) => new THREE.IcosahedronGeometry(r, 0);

function wheel(m: Model, x: number, y: number, z: number, r: number): void {
  m.cyl(r, r, 0.1, C.timberDark, { p: [x, y, z], r: [0, 0, Math.PI / 2], shade: 0.1 }, 12);
  m.cyl(r * 0.8, r * 0.8, 0.12, C.cartBody, { p: [x, y, z], r: [0, 0, Math.PI / 2], shade: 0.15 }, 12);
  m.cyl(r * 0.2, r * 0.2, 0.2, C.iron, { p: [x, y, z], r: [0, 0, Math.PI / 2], shade: 0 }, 8);
  for (let i = 0; i < 4; i++) m.box(0.13, r * 1.7, 0.07, C.timberPale, { p: [x, y, z], r: [(i * Math.PI) / 4, 0, 0], shade: 0 });
}

/** Farm cart, 3.8 x 1.9 along local x, loaded with apple crates or sacks. */
function cart(variant: number): Part[] {
  const m = new Model();
  const r = new Rand(variant + 3);
  m.block(3.0, 0.14, 1.5, C.cartBody, { p: [0, 0.82, 0], mottle: tint(C.cartBody, 0.05) });
  for (const sz of [-1, 1]) {
    m.box(3.0, 0.5, 0.08, C.cartBody, { p: [0, 1.2, sz * 0.74], mottle: tint(C.cartBody, -0.05), shade: 0.2 });
    m.box(3.1, 0.08, 0.1, C.cartTrim, { p: [0, 1.47, sz * 0.74], shade: 0 });
    for (const x of [-1.3, -0.45, 0.45, 1.3]) m.box(0.08, 0.62, 0.06, C.timberDark, { p: [x, 1.2, sz * 0.8] });
  }
  m.box(0.08, 0.5, 1.5, C.cartBody, { p: [-1.5, 1.2, 0], shade: 0.2 });
  for (const sz of [-1, 1]) {
    m.at([0.2, 0.72, sz * 0.88], Math.PI / 2, () => wheel(m, 0, 0, 0, 0.72));
    m.box(2.0, 0.09, 0.09, C.timberPale, { p: [2.4, 0.62, sz * 0.5], r: [0, 0, -0.16] });
  }
  m.box(0.1, 0.1, 1.1, C.timberPale, { p: [3.3, 0.48, 0] });
  m.block(0.14, 0.8, 0.14, C.timberDark, { p: [1.3, 0, 0] });
  if (variant % 2 === 0) {
    for (const [x, z] of [[-0.9, -0.3], [-0.1, 0.25], [0.7, -0.25]] as const) {
      m.block(0.7, 0.4, 0.6, C.crate, { p: [x, 0.96, z], r: [0, r.range(-0.2, 0.2), 0], mottle: tint(C.crate, -0.06) });
      for (let i = 0; i < 5; i++) m.add(octa(0.12), i % 3 ? C.appleFruit : C.appleFruitGold, { p: [x + r.range(-0.22, 0.22), 1.42, z + r.range(-0.18, 0.18)], shade: 0.1 });
    }
  } else {
    for (let i = 0; i < 5; i++) m.lump(0.36, C.sack, { p: [-1 + i * 0.5, 1.15 + (i % 2) * 0.28, r.range(-0.3, 0.3)], s: [1.2, 0.75, 0.9], soft: true, shade: 0.25 }, 1, i);
  }
  return m.parts;
}

function barrelStack(variant: number): Part[] {
  const m = new Model();
  barrel(m, [-0.42, 0, 0.28]);
  barrel(m, [0.42, 0, 0.2], 1, false, 0.5);
  barrel(m, [0, 0, -0.5], 1, false, 1.1);
  if (variant % 2) barrel(m, [0, 1.0, 0], 0.95, false, 0.3);
  else barrel(m, [0.05, 1.0, -0.05], 0.95, true, 0.4);
  return m.parts;
}

function crate(m: Model, x: number, y: number, z: number, s: number, yaw: number, apples: boolean, seed: number): void {
  const r = new Rand(seed);
  m.at([x, y, z], yaw, () => {
    m.block(0.8 * s, 0.5 * s, 0.6 * s, C.crate, { mottle: tint(C.crate, -0.07), shade: 0.2 });
    for (const k of [0.12, 0.38]) m.box(0.84 * s, 0.07 * s, 0.64 * s, tint(C.crate, -0.1), { p: [0, k * s, 0], shade: 0 });
    if (apples) for (let i = 0; i < 6; i++) m.add(octa(0.11 * s), i % 3 ? C.appleFruit : C.appleFruitGold, { p: [r.range(-0.28, 0.28) * s, 0.53 * s, r.range(-0.2, 0.2) * s], shade: 0.1 });
  });
}

function crateStack(variant: number): Part[] {
  const m = new Model();
  crate(m, -0.35, 0, 0.15, 1, 0.1, false, 1);
  crate(m, 0.4, 0, -0.2, 1, 0.5, variant % 2 === 0, 2);
  crate(m, 0, 0.5, 0, 0.95, -0.2, true, 3 + variant);
  m.lump(0.34, C.sack, { p: [-0.1, 0.28, -0.6], s: [1.1, 0.8, 0.9], soft: true, shade: 0.25 }, 1, 4);
  return m.parts;
}

/** Tall conical haystack on a pole: 1.7 m radius, well over head height (it is cover). */
function haystack(variant: number): Part[] {
  const m = new Model();
  m.lump(1.75, C.hay, { p: [0, 1.25, 0], s: [1, 0.85, 1], soft: true, shade: 0.4, mottle: C.hayBale }, 2, variant, 0.1);
  m.cone(1.7, 2.6, C.hayBale, { p: [0, 3.2, 0], soft: true, shade: 0.2, mottle: C.hay }, 9);
  m.post(0.06, 0.07, 5.2, C.timberPale, { shade: 0.1 }, 4);
  m.cyl(1.72, 1.72, 0.12, C.thatchDark, { p: [0, 0.08, 0], shade: 0 }, 10);
  for (let i = 0; i < 4; i++) m.post(0.03, 0.03, 1.9, C.rope, { p: [Math.cos(i * 1.57) * 1.25, 2.1, Math.sin(i * 1.57) * 1.25], r: [Math.sin(i * 1.57) * 0.5, 0, -Math.cos(i * 1.57) * 0.5] }, 3);
  return m.parts;
}

/** Stacked cordwood between two stakes, 4 x 1.6 along local x. */
function logPile(variant: number): Part[] {
  const m = new Model();
  const r = new Rand(variant + 9);
  for (let row = 0; row < 4; row++) {
    const n = 5 - (row > 2 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const rad = r.range(0.15, 0.2);
      m.cyl(rad, rad, 3.6 + r.range(-0.2, 0.2), row % 2 ? C.bark : C.barkGrey, { p: [r.range(-0.08, 0.08), 0.2 + row * 0.33, -0.55 + (i + (row % 2) * 0.5) * 0.3], r: [0, 0, Math.PI / 2], shade: 0.15 }, 6);
      m.cyl(rad * 0.82, rad * 0.82, 0.03, C.timberPale, { p: [1.84, 0.2 + row * 0.33, -0.55 + (i + (row % 2) * 0.5) * 0.3], r: [0, 0, Math.PI / 2], shade: 0 }, 6);
    }
  }
  for (const x of [-1.5, 1.5]) for (const z of [-0.75, 0.75]) m.post(0.05, 0.06, 1.7, C.timberDark, { p: [x, 0, z] }, 4);
  return m.parts;
}

/** Stone well with a windlass and a shingled cap. Radius 1.15. */
function well(): Part[] {
  const m = new Model();
  m.cyl(1.1, 1.15, 0.95, C.stone, { p: [0, 0.47, 0], mottle: C.stoneWarm, shade: 0.3 }, 12);
  m.cyl(1.16, 1.16, 0.14, C.stoneWarm, { p: [0, 0.98, 0], shade: 0 }, 12);
  m.cyl(0.82, 0.82, 0.1, 0x1c2a30, { p: [0, 0.99, 0], shade: 0 }, 12);
  for (const sx of [-1, 1]) m.block(0.18, 2.6, 0.18, C.timber, { p: [sx * 0.98, 0, 0] });
  m.cyl(0.12, 0.12, 2.0, C.timberPale, { p: [0, 1.95, 0], r: [0, 0, Math.PI / 2] }, 7);
  m.box(0.06, 0.4, 0.06, C.iron, { p: [1.2, 1.78, 0] });
  m.post(0.025, 0.025, 0.9, C.rope, { p: [0.1, 1.05, 0] }, 3);
  m.cyl(0.2, 0.16, 0.3, C.barrel, { p: [0.1, 1.12, 0] }, 7);
  m.prism(2.9, 0.9, 2.0, C.roofDark, { p: [0, 2.6, 0], r: [0, Math.PI / 2, 0], mottle: C.roofMoss, shade: 0.2 });
  m.block(2.3, 0.1, 0.5, C.stoneDark, { p: [0.4, 0, 1.5], mottle: C.stone });
  return m.parts;
}

/** Outdoor screw press on a stone bed. Radius 1.25. */
function ciderPress(): Part[] {
  const m = new Model();
  m.cyl(1.2, 1.25, 0.4, C.stone, { p: [0, 0.2, 0], mottle: C.stoneWarm, shade: 0.2 }, 10);
  m.block(1.7, 0.3, 1.5, C.timberPale, { p: [0, 0.4, 0] });
  for (const sx of [-1, 1]) m.block(0.26, 2.3, 0.34, C.timber, { p: [sx * 0.9, 0.4, 0] });
  m.block(2.2, 0.36, 0.44, C.timber, { p: [0, 2.5, 0] });
  m.post(0.1, 0.1, 1.4, C.iron, { p: [0, 1.25, 0] }, 7);
  m.box(2.4, 0.08, 0.08, C.timberPale, { p: [0, 2.3, 0], r: [0, 0.6, 0] });
  m.block(1.1, 0.55, 1.0, C.thatch, { p: [0, 0.7, 0], mottle: C.appleFruitGold });
  m.block(1.25, 0.12, 1.15, C.timberPale, { p: [0, 1.25, 0] });
  m.cyl(0.36, 0.3, 0.4, C.barrel, { p: [0.2, 0.2, 1.35] }, 8);
  return m.parts;
}

function trough(): Part[] {
  const m = new Model();
  m.block(2.6, 0.5, 0.9, C.stone, { p: [0, 0.12, 0], mottle: C.stoneWet, shade: 0.25 });
  m.block(2.3, 0.06, 0.62, 0x4c7a80, { p: [0, 0.58, 0], shade: 0 });
  for (const x of [-1.0, 1.0]) m.block(0.5, 0.14, 0.9, C.stoneDark, { p: [x, 0, 0] });
  return m.parts;
}

/** Fingerpost with three arms (no text: shapes only). */
function signpost(): Part[] {
  const m = new Model();
  m.post(0.09, 0.12, 3.1, C.timber, {}, 6);
  // Arms start at the post and point three ways.
  m.at([0, 2.7, 0], 0.2, () => m.box(0.9, 0.2, 0.05, C.plaster, { p: [0.5, 0, 0], shade: 0.05 }));
  m.at([0, 2.42, 0], 2.3, () => m.box(0.8, 0.2, 0.05, C.plasterWarm, { p: [0.45, 0, 0], shade: 0.05 }));
  m.at([0, 2.14, 0], -1.5, () => m.box(0.7, 0.18, 0.05, C.plaster, { p: [0.4, 0, 0], shade: 0.05 }));
  m.cone(0.16, 0.3, C.timberDark, { p: [0, 3.2, 0] }, 5);
  m.cyl(0.3, 0.36, 0.3, C.stone, { p: [0, 0.14, 0], mottle: C.moss }, 7);
  return m.parts;
}

/** Row of straw skeps on a bench, 3.4 x 1 along local x. */
function beehives(): Part[] {
  const m = new Model();
  m.block(3.3, 0.1, 0.8, C.board, { p: [0, 0.55, 0] });
  for (const x of [-1.4, 0, 1.4]) m.block(0.14, 0.55, 0.7, C.timber, { p: [x, 0, 0] });
  for (const x of [-1.1, 0, 1.1]) {
    m.lump(0.4, C.thatch, { p: [x, 0.95, 0], s: [1, 1.1, 1], soft: true, mottle: C.thatchDark, shade: 0.3 }, 1, 3, 0.05);
    m.box(0.12, 0.06, 0.05, 0x2a221a, { p: [x, 0.72, 0.38] });
  }
  m.box(3.5, 0.08, 1.1, C.thatchDark, { p: [0, 1.62, -0.1], r: [0.2, 0, 0], shade: 0.1 });
  for (const x of [-1.6, 1.6]) m.post(0.05, 0.05, 1.7, C.timber, { p: [x, 0, -0.45] }, 4);
  return m.parts;
}

/**
 * Witness stone: a chest-high dressed boundary marker with a notch cut in
 * its top and a band worn smooth by hands. Low enough to see over.
 */
function boundaryStone(variant: number): Part[] {
  const m = new Model();
  const r = new Rand(variant + 5);
  const lean = r.range(-0.07, 0.07);
  m.taper(0.74, 0.5, 0.6, 0.4, 1.25, C.stoneWarm, { r: [lean, r.range(0, 0.4), lean * 0.6], mottle: C.stone, shade: 0.3 });
  m.box(0.7, 0.09, 0.5, tint(C.stoneWarm, 0.08), { p: [0, 0.82, 0], r: [lean, 0, lean * 0.6], shade: 0 });
  m.box(0.16, 0.16, 0.5, C.stoneDark, { p: [0, 1.24, 0], r: [lean, 0, 0], shade: 0 });
  m.lump(0.3, C.moss, { p: [-0.2, 0.2, 0.15], s: [1.3, 0.6, 1], soft: true }, 0, variant);
  m.cyl(0.62, 0.7, 0.1, C.gravel, { p: [0, 0.03, 0], shade: 0 }, 8);
  // A ribbon tied round it at the last walk (cosmetic; no meaning in play).
  if (variant % 2 === 0) m.box(0.72, 0.05, 0.52, [C.clothRed, C.clothBlue][variant % 4 ? 1 : 0]!, { p: [0, 1.0, 0], r: [lean, 0, lean * 0.6], shade: 0 });
  return m.parts;
}

/** The same stone, pulled up and left lying where it was dragged. */
function boundaryStoneFallen(): Part[] {
  const m = new Model();
  m.taper(0.74, 0.5, 0.6, 0.4, 1.25, C.stone, { p: [-0.5, 0.25, 0], r: [0.1, 0.3, 1.42], mottle: C.moss, shade: 0.3 });
  m.lump(0.5, C.moss, { p: [0.1, 0.4, 0], s: [1.6, 0.4, 0.9], soft: true }, 0, 2);
  m.lump(0.3, C.ivy, { p: [-0.4, 0.3, 0.3], s: [1.2, 0.5, 0.8], soft: true }, 0, 3);
  return m.parts;
}

/** Free-standing chimney stack of the ruined house. Radius 1.0. */
function ruinChimney(): Part[] {
  const m = new Model();
  m.taper(1.7, 1.5, 1.2, 1.0, 3.2, C.stone, { mottle: C.stoneDark, shade: 0.35 });
  m.taper(1.15, 1.0, 0.8, 0.75, 2.4, C.stoneWarm, { p: [0.05, 3.2, 0], r: [0, 0, 0.04], mottle: C.stoneDark, shade: 0.2 });
  m.block(0.9, 0.6, 0.2, 0x1e1a18, { p: [0, 0.2, 0.72], shade: 0 });
  m.block(1.2, 0.2, 0.3, C.stoneDark, { p: [0, 0.85, 0.72] });
  m.lump(0.6, C.ivy, { p: [-0.5, 2.6, 0.5], s: [1, 2.2, 0.7], soft: true, shade: 0.4 }, 1, 4);
  m.lump(0.5, C.moss, { p: [0.2, 5.5, 0], s: [1.4, 0.4, 1.2], soft: true }, 0, 5);
  return m.parts;
}

// --- Dressing (no colliders) -------------------------------------------------------------

const DRESSING: Record<DressingKind, (variant: number) => Part[]> = {
  /** Orchard ladder leaning away from +z at the top (feet at the origin, head ~1 m behind). */
  ladder: () => {
    const m = new Model();
    m.at([0, 0, 0], 0, () => {
      for (const sx of [-1, 1]) m.box(0.07, 3.6, 0.07, C.timberPale, { p: [sx * (0.3 - 0.05), 1.7, -0.55], r: [-0.32, 0, sx * 0.03], shade: 0.15 });
      for (let i = 0; i < 8; i++) m.box(0.5 - i * 0.012, 0.05, 0.05, C.timber, { p: [0, 0.35 + i * 0.4, -0.12 - i * 0.125], shade: 0 });
    });
    return m.parts;
  },
  basket: (v) => {
    const m = new Model();
    m.cyl(0.36, 0.27, 0.34, C.basket, { p: [0, 0.17, 0], mottle: tint(C.basket, -0.08), shade: 0.25 }, 9);
    m.cyl(0.38, 0.38, 0.05, tint(C.basket, 0.06), { p: [0, 0.35, 0], shade: 0 }, 9);
    const r = new Rand(v);
    if (v % 3 !== 2) for (let i = 0; i < 8; i++) m.add(octa(0.1), i % 3 ? C.appleFruit : C.appleFruitGold, { p: [r.range(-0.22, 0.22), 0.38 + r.range(0, 0.06), r.range(-0.22, 0.22)], shade: 0.1 });
    return m.parts;
  },
  apple_pile: (v) => {
    const m = new Model();
    const r = new Rand(v + 3);
    for (let i = 0; i < 16; i++) {
      const a = r.range(0, 6.28);
      const d = r.range(0, 0.7);
      m.add(octa(0.1), i % 4 === 0 ? C.appleFruitGold : i % 5 === 0 ? 0x8a4a2a : C.appleFruit, { p: [Math.cos(a) * d, 0.07 + (d < 0.3 ? 0.12 : 0), Math.sin(a) * d], shade: 0.1 });
    }
    return m.parts;
  },
  barrel: () => {
    const m = new Model();
    barrel(m, [0, 0, 0]);
    return m.parts;
  },
  crate: (v) => {
    const m = new Model();
    crate(m, 0, 0, 0, 1, 0, v % 2 === 0, v);
    return m.parts;
  },
  sack: (v) => {
    const m = new Model();
    m.lump(0.36, C.sack, { p: [0, 0.3, 0], s: [1, 1.1, 0.85], soft: true, mottle: tint(C.sack, -0.08), shade: 0.3 }, 1, v);
    m.lump(0.12, C.sack, { p: [0.05, 0.74, 0], s: [1, 0.8, 1], soft: true }, 0, v);
    return m.parts;
  },
  bucket: () => {
    const m = new Model();
    m.cyl(0.2, 0.15, 0.3, C.barrel, { p: [0, 0.15, 0], shade: 0.2 }, 8);
    m.cyl(0.21, 0.21, 0.04, C.barrelBand, { p: [0, 0.27, 0] }, 8);
    return m.parts;
  },
  bench: () => {
    const m = new Model();
    m.block(1.8, 0.09, 0.42, C.board, { p: [0, 0.45, 0] });
    for (const sx of [-0.7, 0.7]) m.block(0.1, 0.45, 0.38, C.timber, { p: [sx, 0, 0] });
    return m.parts;
  },
  handcart: () => {
    const m = new Model();
    m.block(1.2, 0.36, 0.8, C.cartBody, { p: [0, 0.42, 0], mottle: tint(C.cartBody, 0.05) });
    m.at([0, 0.4, 0], Math.PI / 2, () => {
      for (const s of [-1, 1]) wheel(m, s * 0.48, 0, 0.1, 0.4);
    });
    for (const sz of [-1, 1]) m.box(1.3, 0.06, 0.06, C.timberPale, { p: [1.1, 0.5, sz * 0.36], r: [0, 0, -0.2] });
    m.lump(0.3, C.hayBale, { p: [0, 0.82, 0], s: [1.6, 0.6, 1.1], soft: true }, 0, 1);
    return m.parts;
  },
  stepping_stone: (v) => {
    const m = new Model();
    m.lump(0.5, v % 2 ? C.stoneWet : C.stone, { p: [0, -0.02, 0], s: [1.1, 0.3, 0.9], mottle: C.stoneDark, shade: 0.2 }, 0, v, 0.12);
    return m.parts;
  },
  lantern_post: () => {
    const m = new Model();
    m.post(0.07, 0.1, 2.5, C.timberDark, {}, 6);
    m.box(0.6, 0.07, 0.07, C.iron, { p: [0.25, 2.45, 0] });
    m.block(0.26, 0.34, 0.26, C.lantern, { p: [0.5, 2.0, 0], shade: 0 });
    m.block(0.32, 0.06, 0.32, C.iron, { p: [0.5, 2.34, 0] });
    m.block(0.3, 0.05, 0.3, C.iron, { p: [0.5, 1.96, 0] });
    return m.parts;
  },
  washing_line: (v) => {
    const m = new Model();
    for (const sx of [-1, 1]) m.post(0.05, 0.06, 2.3, C.timberPale, { p: [sx * 2.2, 0, 0] }, 5);
    m.box(4.4, 0.025, 0.025, C.rope, { p: [0, 2.2, 0] });
    const cloths = [C.cloth, C.clothBlue, C.cloth, C.clothRed, C.cloth];
    cloths.forEach((c, i) => m.box(0.6, 0.8 + ((i + v) % 2) * 0.3, 0.03, c, { p: [-1.6 + i * 0.8, 1.75 - ((i + v) % 2) * 0.15, 0], r: [0.08, 0, 0], shade: 0.15, sway: 0.25 }));
    return m.parts;
  },
  cart_rut_stone: (v) => {
    const m = new Model();
    m.lump(0.4, C.stoneDark, { p: [0, 0.05, 0], s: [1.4, 0.4, 0.8], mottle: C.moss, shade: 0.2 }, 0, v, 0.15);
    m.lump(0.25, C.stone, { p: [0.5, 0.03, 0.3], s: [1, 0.4, 1], shade: 0.2 }, 0, v + 1);
    return m.parts;
  },
  stump: (v) => {
    const m = new Model();
    m.cyl(0.42, 0.55, 0.5, C.barkOld, { p: [0, 0.25, 0], mottle: C.moss, shade: 0.3 }, 8);
    m.cyl(0.4, 0.4, 0.04, C.timberPale, { p: [0, 0.51, 0], shade: 0 }, 8);
    if (v % 2) m.lump(0.2, 0xd8c8a8, { p: [0.4, 0.2, 0.1], s: [1, 0.4, 1], soft: true }, 0, v);
    return m.parts;
  },
  grindstone: () => {
    const m = new Model();
    m.cyl(0.7, 0.7, 0.22, C.stoneWarm, { p: [0, 0.6, 0], r: [Math.PI / 2 - 0.3, 0, 0], mottle: C.stone, shade: 0.2 }, 14);
    m.cyl(0.12, 0.12, 0.26, C.stoneDark, { p: [0, 0.6, 0], r: [Math.PI / 2 - 0.3, 0, 0] }, 6);
    return m.parts;
  },
  flower_tub: (v) => {
    const m = new Model();
    const r = new Rand(v + 1);
    m.cyl(0.36, 0.3, 0.4, C.barrel, { p: [0, 0.2, 0], shade: 0.2 }, 8);
    m.lump(0.34, C.hedgeLight, { p: [0, 0.5, 0], s: [1, 0.6, 1], soft: true }, 0, v);
    for (let i = 0; i < 6; i++) m.lump(0.1, [C.flowerRed, C.flowerYellow, C.flowerWhite, C.flowerViolet][(i + v) % 4]!, { p: [r.range(-0.24, 0.24), 0.66 + r.range(0, 0.1), r.range(-0.24, 0.24)], soft: true, shade: 0 }, 0, i);
    return m.parts;
  },
  chopping_block: () => {
    const m = new Model();
    m.cyl(0.36, 0.4, 0.5, C.bark, { p: [0, 0.25, 0], shade: 0.3 }, 8);
    m.cyl(0.35, 0.35, 0.03, C.timberPale, { p: [0, 0.51, 0], shade: 0 }, 8);
    m.box(0.05, 0.7, 0.05, C.timberPale, { p: [0.1, 0.8, 0], r: [0, 0, -0.5] });
    m.box(0.2, 0.16, 0.05, C.iron, { p: [-0.02, 0.58, 0], r: [0, 0, -0.5] });
    for (const [x, z, a] of [[0.7, 0.2, 0.3], [0.9, -0.2, 1.2], [-0.6, 0.5, 2]] as const) m.box(0.5, 0.14, 0.16, C.timberPale, { p: [x, 0.08, z], r: [0, a, 0] });
    return m.parts;
  },
  milestone: () => {
    const m = new Model();
    m.taper(0.5, 0.34, 0.44, 0.3, 0.8, C.stone, { mottle: C.moss, shade: 0.3 });
    m.lump(0.24, C.stone, { p: [0, 0.8, 0], s: [1, 0.5, 0.7], shade: 0.1 }, 0, 1);
    return m.parts;
  },
};

export function dressingParts(kind: DressingKind, variant: number): Part[] {
  return DRESSING[kind](variant);
}

// --- Ground cover (instanced by the thousand, all well below knee height) ---------------

export type CoverKind = 'grass_tuft' | 'flower_red' | 'flower_yellow' | 'flower_white' | 'flower_violet' | 'reed' | 'fern' | 'mushroom' | 'pebble' | 'windfall';

function blade(m: Model, x: number, z: number, h: number, w: number, lean: number, yaw: number, color: number, tipColor: number, sway: number, shade = 0.45): void {
  const geo = new THREE.BufferGeometry();
  // A single tapering triangle pair, double sided through winding duplication.
  const v = [-w, 0, 0, w, 0, 0, lean, h, 0, w, 0, 0, -w, 0, 0, lean, h, 0];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  m.at([x, 0, z], yaw, () => m.add(geo, color, { shade, tip: tipColor, sway }));
}

function flower(color: number): () => Part[] {
  return () => {
    const m = new Model();
    for (let i = 0; i < 4; i++) {
      const x = Math.cos(i * 2.2) * 0.16;
      const z = Math.sin(i * 2.2) * 0.16;
      blade(m, x, z, 0.3, 0.03, 0.03, i * 0.9, C.grass, C.grassLight, 0.5);
      m.add(octa(0.07), color, { p: [x + 0.03, 0.33, z], s: [1, 0.6, 1], shade: 0, sway: 0.5 });
    }
    return m.parts;
  };
}

const COVER: Record<CoverKind, () => Part[]> = {
  grass_tuft: () => {
    const m = new Model();
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      blade(m, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.24 + (i % 3) * 0.09, 0.04, ((i % 3) - 1) * 0.12, a, C.grassLight, C.willowLight, 0.55, 0.2);
    }
    return m.parts;
  },
  flower_red: flower(C.flowerRed),
  flower_yellow: flower(C.flowerYellow),
  flower_white: flower(C.flowerWhite),
  flower_violet: flower(C.flowerViolet),
  reed: () => {
    const m = new Model();
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      blade(m, Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.75 + (i % 3) * 0.14, 0.045, ((i % 3) - 1) * 0.1, a, C.hedge, C.reed, 0.6);
    }
    m.cyl(0.035, 0.035, 0.16, 0x5a3c26, { p: [0.05, 0.86, 0.05], sway: 0.6, shade: 0 }, 4);
    return m.parts;
  },
  fern: () => {
    const m = new Model();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      blade(m, 0, 0, 0.36, 0.11, 0.42, a + Math.PI / 2, C.oldwood, C.hedgeLight, 0.3);
    }
    return m.parts;
  },
  mushroom: () => {
    const m = new Model();
    for (const [x, z, s] of [[0, 0, 1], [0.15, 0.08, 0.7], [-0.1, 0.14, 0.55]] as const) {
      m.post(0.03 * s, 0.035 * s, 0.14 * s, 0xe8e0cc, { p: [x, 0, z] }, 4);
      m.cone(0.1 * s, 0.08 * s, 0xb84a34, { p: [x, 0.17 * s, z], shade: 0.1 }, 6);
    }
    return m.parts;
  },
  pebble: () => {
    const m = new Model();
    m.lump(0.13, C.gravel, { p: [0, 0.02, 0], s: [1.2, 0.5, 1], mottle: C.stoneDark, shade: 0.2 }, 0, 1, 0.15);
    m.lump(0.08, C.stone, { p: [0.2, 0.01, 0.1], s: [1, 0.5, 1.2], shade: 0.2 }, 0, 2, 0.15);
    return m.parts;
  },
  windfall: () => {
    const m = new Model();
    for (const [x, z, c] of [[0, 0, C.appleFruit], [0.3, 0.12, C.appleFruitGold], [-0.15, 0.3, C.appleFruit], [0.1, -0.3, 0x8a4a2a]] as const) m.add(octa(0.07), c, { p: [x, 0.05, z], shade: 0.1 });
    return m.parts;
  },
};

export function coverParts(kind: CoverKind): Part[] {
  return COVER[kind]();
}

/** Mill wheel, built about its axle (the local z axis). Rotated by the scene, not the simulation. */
export function wheelParts(radius: number, width: number): Part[] {
  const m = new Model();
  const paddles = 16;
  for (const sz of [-1, 1]) {
    const z = sz * width * 0.5;
    for (let i = 0; i < paddles; i++) {
      const a = (i / paddles) * Math.PI * 2;
      const b = ((i + 1) / paddles) * Math.PI * 2;
      const mx = (Math.cos(a) + Math.cos(b)) / 2;
      const my = (Math.sin(a) + Math.sin(b)) / 2;
      m.box(radius * 0.4, 0.12, 0.12, C.timberDark, { p: [mx * radius * 0.97, my * radius * 0.97, z], r: [0, 0, (a + b) / 2 + Math.PI / 2], shade: 0 });
      m.box(radius * 0.34, 0.1, 0.1, C.timber, { p: [mx * radius * 0.78, my * radius * 0.78, z], r: [0, 0, (a + b) / 2 + Math.PI / 2], shade: 0 });
    }
    for (let i = 0; i < 4; i++) m.box(radius * 1.95, 0.14, 0.1, C.timber, { p: [0, 0, z], r: [0, 0, (i / 4) * Math.PI], shade: 0 });
  }
  for (let i = 0; i < paddles; i++) {
    const a = (i / paddles) * Math.PI * 2;
    m.box(radius * 0.24, 0.05, width, i % 3 === 0 ? C.boardGrey : C.board, { p: [Math.cos(a) * radius * 0.88, Math.sin(a) * radius * 0.88, 0], r: [0, 0, a], mottle: C.stoneWet, shade: 0 });
  }
  m.cyl(0.24, 0.24, width + 1.6, C.timberDark, { r: [Math.PI / 2, 0, 0], shade: 0 }, 8);
  m.cyl(0.36, 0.36, width * 0.7, C.iron, { r: [Math.PI / 2, 0, 0], shade: 0 }, 8);
  return m.parts;
}

export const PROP_BUILDERS = {
  cart,
  barrel_stack: barrelStack,
  crate_stack: crateStack,
  haystack,
  log_pile: logPile,
  well,
  cider_press: ciderPress,
  trough,
  signpost,
  beehives,
  boundary_stone: boundaryStone,
  boundary_stone_fallen: boundaryStoneFallen,
  ruin_chimney: ruinChimney,
} as const;
