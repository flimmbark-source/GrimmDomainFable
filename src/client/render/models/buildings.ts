/**
 * Original procedural buildings for a settled fairytale valley: limewashed
 * timber-framed cottages, a cider house, a press house, a storehouse, a
 * watermill, a barn and a cart shed.
 *
 * Every building fills exactly the footprint in FOOTPRINTS (walls stand on
 * the collider's edge; only roofs, signs and sills overhang, above head
 * height), so what blocks movement and sight is what is drawn.
 */
import type { Part } from '../bake.ts';
import { Model, Rand, tint, type V3 } from '../modelkit.ts';
import { VALE as C } from '../palette.ts';
import { CHIMNEYS } from '../../../shared/world/orchardVale.ts';
import { FOOTPRINTS, type BuildingKind } from '../../../shared/world/kit.ts';

interface Style {
  plaster: number;
  stain: number;
  timber: number;
  roofA: number;
  roofB: number;
  stone: number;
  stoneB: number;
  shutter: number;
  door: number;
}

function styleFor(variant: number): Style {
  const r = new Rand(variant * 7 + 3);
  const plaster = [C.plaster, C.plasterWarm, C.plasterGrey][variant % 3]!;
  const roof = [C.roof, C.roofWarm, C.roofDark][(variant + (variant >> 1)) % 3]!;
  return {
    plaster: tint(plaster, r.range(-0.02, 0.02)),
    stain: C.plasterStain,
    timber: variant % 2 ? C.timberDark : C.timber,
    roofA: tint(roof, 0.02),
    roofB: tint(roof, -0.05, 0.01),
    stone: C.stone,
    stoneB: C.stoneWarm,
    shutter: [C.shutterGreen, C.shutterBlue, C.shutterRed][variant % 3]!,
    door: tint(C.door, r.range(-0.02, 0.04)),
  };
}

// --- Shared pieces -----------------------------------------------------------------

/** Rubble plinth that also runs below ground, so a building sits on uneven land. */
function plinth(m: Model, w: number, d: number, h: number, st: Style): void {
  m.block(w, h + 1.2, d, st.stone, { p: [0, -1.2, 0], mottle: st.stoneB, shade: 0.3 });
  // A course of larger stones proud of the wall.
  m.block(w + 0.12, 0.22, d + 0.12, st.stoneB, { p: [0, h - 0.22, 0], mottle: st.stone, shade: 0.1 });
}

/**
 * Tiled gable roof with its ridge along local x. Built from overlapping
 * courses so the slopes have real ridges and shadow lines, never one flat slab.
 */
function gableRoof(
  m: Model,
  o: { length: number; span: number; y: number; pitch: number; eave?: number; verge?: number; courses?: number; a: number; b: number; gable: number; timber: number; sag?: number; seed?: number; moss?: boolean },
): void {
  const eave = o.eave ?? 0.55;
  const verge = o.verge ?? 0.4;
  const courses = o.courses ?? 7;
  const half = o.span / 2;
  const angle = Math.atan2(o.pitch, half);
  const run = half + eave;
  const drop = o.pitch * (run / half);
  const slope = Math.hypot(run, drop);
  const r = new Rand((o.seed ?? 0) + 91);
  // Gable-end walls.
  m.prism(o.span, o.pitch, o.length, o.gable, { p: [0, o.y, 0], r: [0, Math.PI / 2, 0], mottle: C.plasterStain, shade: 0.12 });
  for (const sz of [-1, 1]) {
    for (let c = 0; c < courses; c++) {
      const t = (c + 0.5) / courses;
      const len = o.length + verge * 2 + r.range(-0.06, 0.06);
      const sag = (o.sag ?? 0.05) * Math.sin(t * Math.PI);
      m.box(len, 0.13, (slope / courses) * 1.32, c % 2 ? o.a : o.b, {
        p: [r.range(-0.03, 0.03), o.y + o.pitch - t * drop + 0.1 - sag, sz * t * run],
        r: [sz * (angle - 0.07), 0, r.range(-0.006, 0.006)],
        mottle: o.moss && c > courses - 3 ? C.roofMoss : c % 2 ? o.b : o.a,
        shade: 0.22,
      });
    }
    // Barge boards on both gable ends.
    for (const sx of [-1, 1]) {
      m.box(0.1, 0.24, slope + 0.1, o.timber, { p: [sx * (o.length / 2 + verge - 0.03), o.y + o.pitch - drop / 2 + 0.02, (sz * run) / 2], r: [sz * angle, 0, 0], shade: 0.1 });
    }
  }
  m.box(o.length + verge * 2 + 0.1, 0.2, 0.42, o.b, { p: [0, o.y + o.pitch + 0.2, 0], shade: 0.1 });
}

/** A small gabled roof whose ridge runs along local z (porches, dormers, wings). */
function crossRoof(m: Model, p: V3, o: Parameters<typeof gableRoof>[1]): void {
  m.at(p, Math.PI / 2, () => gableRoof(m, { ...o, y: 0 }));
}

/** Timber frame drawn on the +z face of a wall panel (w wide, from y0 to y1). */
function frameFace(m: Model, w: number, y0: number, y1: number, z: number, st: Style, bays: number, braces: boolean, seed: number): void {
  const t = 0.2;
  const r = new Rand(seed);
  const h = y1 - y0;
  m.box(w, t, 0.1, st.timber, { p: [0, y0 + t / 2, z], shade: 0.1 });
  m.box(w, t, 0.1, st.timber, { p: [0, y1 - t / 2, z], shade: 0.1 });
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + t / 2 + (i * (w - t)) / bays;
    m.box(t * (i === 0 || i === bays ? 1.25 : 0.9), h, 0.11, st.timber, { p: [x, y0 + h / 2, z], r: [0, 0, r.range(-0.012, 0.012)], shade: 0.12 });
  }
  if (!braces) return;
  const bay = (w - t) / bays;
  for (const i of [0, bays - 1]) {
    const x = -w / 2 + t / 2 + (i + 0.5) * bay;
    const dir = i === 0 ? 1 : -1;
    const len = Math.hypot(bay, h) * 0.86;
    m.box(0.15, len, 0.09, st.timber, { p: [x, y0 + h / 2, z], r: [0, 0, dir * Math.atan2(bay, h)], shade: 0.1 });
  }
}

/** Window on the +z face of the current frame, centred at (x, y). */
function windowAt(m: Model, x: number, y: number, z: number, w: number, h: number, st: Style, lit: boolean, shutters = true): void {
  m.box(w + 0.22, h + 0.22, 0.12, st.timber, { p: [x, y, z + 0.02], shade: 0.05 });
  m.box(w, h, 0.1, lit ? C.windowLit : C.windowDark, { p: [x, y, z + 0.06], shade: lit ? 0 : 0.25, mottle: lit ? 0xffe6a8 : 0x3c4656 });
  m.box(0.06, h, 0.05, st.timber, { p: [x, y, z + 0.12], shade: 0 });
  m.box(w, 0.06, 0.05, st.timber, { p: [x, y + h * 0.12, z + 0.12], shade: 0 });
  m.box(w + 0.4, 0.1, 0.26, st.timber, { p: [x, y - h / 2 - 0.12, z + 0.1], shade: 0 });
  if (shutters) {
    for (const s of [-1, 1]) m.box(w * 0.46, h + 0.06, 0.07, st.shutter, { p: [x + s * (w * 0.74 + 0.1), y, z + 0.06], r: [0, s * 0.16, 0], shade: 0.18 });
  }
}

/** Plank door with stone step on the +z face. */
function doorAt(m: Model, x: number, y: number, z: number, w: number, h: number, st: Style, arched = false): void {
  m.box(w + 0.34, h + 0.2, 0.16, st.timber, { p: [x, y + h / 2 + 0.02, z + 0.02], shade: 0.08 });
  m.box(w, h, 0.12, st.door, { p: [x, y + h / 2, z + 0.08], shade: 0.2, mottle: tint(st.door, 0.05) });
  for (const k of [0.22, 0.72]) m.box(w, 0.1, 0.05, C.iron, { p: [x, y + h * k, z + 0.16], shade: 0 });
  m.box(0.08, 0.08, 0.08, C.iron, { p: [x + w * 0.32, y + h * 0.48, z + 0.18], shade: 0 });
  if (arched) m.cyl(w / 2 + 0.17, w / 2 + 0.17, 0.16, st.timber, { p: [x, y + h, z + 0.02], r: [Math.PI / 2, 0, 0], shade: 0 }, 10);
  m.block(w + 0.7, 0.2, 0.7, C.stoneWarm, { p: [x, y - 0.2, z + 0.4], mottle: C.stone, shade: 0.1 });
}

/** Stone chimney from y0 up to the top given in CHIMNEYS (building frame: +z is the front). */
function chimney(m: Model, kind: BuildingKind, y0: number, st: Style, size = 0.9): void {
  const c = CHIMNEYS[kind];
  const h = c.y - y0;
  m.taper(size * 1.15, size * 1.15, size, size, h, st.stone, { p: [c.x, y0, c.z], mottle: st.stoneB, shade: 0.3 });
  m.block(size + 0.24, 0.2, size + 0.24, st.stoneB, { p: [c.x, c.y - 0.2, c.z], shade: 0 });
  m.post(0.16, 0.2, 0.42, C.roofWarm, { p: [c.x - size * 0.2, c.y, c.z], shade: 0.1 });
  m.post(0.14, 0.18, 0.34, C.roofDark, { p: [c.x + size * 0.22, c.y, c.z + 0.05], shade: 0.1 });
}

/** A thatched ridge: a rolled cap with pegged liggers, built along local x. */
function thatchRidge(m: Model, length: number, x: number, y: number, seed: number): void {
  const r = new Rand(seed + 17);
  m.cyl(0.32, 0.32, length, C.thatchDark, { p: [x, y, 0], r: [0, 0, Math.PI / 2], mottle: C.thatch, shade: 0.15 }, 8);
  for (let i = 0; i < Math.round(length / 0.9); i++) {
    const lx = x - length / 2 + 0.45 + i * 0.9;
    m.box(0.1, 0.06, 0.74, C.timberPale, { p: [lx, y + 0.08, 0], r: [0, r.range(-0.05, 0.05), 0], shade: 0 });
  }
}

/** A patch of ivy climbing the +z face. */
function ivy(m: Model, x: number, y: number, z: number, w: number, h: number, seed: number): void {
  const r = new Rand(seed);
  for (let i = 0; i < 6; i++) {
    m.lump(0.5, i % 2 ? C.ivy : C.hedgeLight, {
      p: [x + r.range(-w / 2, w / 2), y + r.range(0, h) * (1 - Math.abs(r.range(-0.5, 0.5))), z + 0.06],
      s: [r.range(0.8, 1.5), r.range(0.7, 1.3), 0.22], soft: true, shade: 0.3, sway: 0.01,
    }, 0, seed + i);
  }
}

function flowerBox(m: Model, x: number, y: number, z: number, w: number, seed: number): void {
  const r = new Rand(seed);
  m.box(w, 0.18, 0.24, C.board, { p: [x, y, z + 0.14], shade: 0.1 });
  for (let i = 0; i < 4; i++) {
    m.lump(0.12, [C.flowerRed, C.flowerYellow, C.flowerWhite, C.flowerViolet][Math.floor(r.next() * 4)]!, {
      p: [x - w / 2 + 0.12 + (i * (w - 0.24)) / 3, y + 0.18, z + 0.14 + r.range(-0.04, 0.04)], shade: 0.1, soft: true,
    }, 0, seed + i);
  }
  m.lump(0.16, C.hedgeLight, { p: [x, y + 0.1, z + 0.16], s: [w * 3, 0.6, 0.9], shade: 0.2, soft: true }, 0, seed);
}

// --- Cottages ---------------------------------------------------------------------

/** Storey-and-a-half cottage with a jettied front gable. 7.2 x 5.8. */
function cottageA(variant: number): Part[] {
  const m = new Model();
  const st = styleFor(variant);
  const { hx, hz } = FOOTPRINTS.cottage_a;
  const W = hx * 2;
  const D = hz * 2;
  const r = new Rand(variant + 11);
  const wallTop = 3.35;
  plinth(m, W, D, 0.55, st);
  m.block(W - 0.1, wallTop - 0.55, D - 0.1, st.plaster, { p: [0, 0.55, 0], mottle: st.stain, shade: 0.16, r: [0, 0, 0.004] });
  for (const [yaw, w, d] of [[0, W, D], [Math.PI, W, D], [Math.PI / 2, D, W], [-Math.PI / 2, D, W]] as const) {
    m.at([0, 0, 0], yaw, () => frameFace(m, w, 0.55, wallTop, d / 2 - 0.02, st, yaw === 0 || yaw === Math.PI ? 4 : 3, true, variant + w));
  }
  gableRoof(m, { length: W, span: D, y: wallTop, pitch: 3.2, a: st.roofA, b: st.roofB, gable: st.plaster, timber: st.timber, seed: variant, moss: variant % 2 === 0 });
  // Front gable: a jettied half-timbered bay over the door.
  const bayX = variant % 2 ? 1.5 : -1.5;
  m.block(2.7, 1.7, 0.5, st.plaster, { p: [bayX, wallTop - 0.1, hz + 0.02], mottle: st.stain, shade: 0.1 });
  m.at([bayX, 0, 0], 0, () => frameFace(m, 2.7, wallTop - 0.1, wallTop + 1.6, hz + 0.28, st, 2, false, 5));
  crossRoof(m, [bayX, wallTop + 1.6, hz - 0.9], { length: 2.5, span: 2.7, y: 0, pitch: 1.5, eave: 0.3, verge: 0.3, courses: 4, a: st.roofA, b: st.roofB, gable: st.plaster, timber: st.timber, seed: variant + 2 });
  for (const sx of [-1, 1]) m.box(0.16, 0.7, 0.16, st.timber, { p: [bayX + sx * 1.15, wallTop - 0.42, hz + 0.16], r: [0.5, 0, 0], shade: 0 });
  windowAt(m, bayX, wallTop + 0.75, hz + 0.28, 0.8, 0.9, st, r.chance(0.6), false);
  doorAt(m, bayX, 0.55, hz, 1.1, 2.05, st);
  windowAt(m, -bayX * 1.25, 1.95, hz, 1.0, 1.05, st, r.chance(0.5));
  flowerBox(m, -bayX * 1.25, 1.2, hz, 1.3, variant);
  // Back and sides.
  m.at([0, 0, 0], Math.PI, () => {
    windowAt(m, -1.8, 1.95, hz, 0.9, 1.0, st, false);
    windowAt(m, 1.6, 1.95, hz, 0.9, 1.0, st, r.chance(0.4));
    ivy(m, 0.2, 0.8, hz, 2.2, 2.6, variant + 40);
  });
  m.at([0, 0, 0], Math.PI / 2, () => {
    windowAt(m, 0.6, 1.95, hx, 0.85, 1.0, st, false);
    windowAt(m, 0, 4.6, hx - 0.05, 0.7, 0.8, st, r.chance(0.5), false);
  });
  m.at([0, 0, 0], -Math.PI / 2, () => windowAt(m, 0, 4.6, hx - 0.05, 0.7, 0.8, st, false, false));
  chimney(m, 'cottage_a', 2.4, st, 0.95);
  return m.parts;
}

/** Low single-storey cottage with a deep thatch and a lean-to. 6.2 x 5.2. */
function cottageB(variant: number): Part[] {
  const m = new Model();
  const st = styleFor(variant + 1);
  const { hx, hz } = FOOTPRINTS.cottage_b;
  const W = hx * 2;
  const D = hz * 2;
  const r = new Rand(variant + 23);
  const wallTop = 2.75;
  const mainW = W - 1.5;
  const mx = -0.75;
  plinth(m, W, D, 0.45, st);
  m.block(mainW - 0.1, wallTop - 0.45, D - 0.1, st.plaster, { p: [mx, 0.45, 0], mottle: st.stain, shade: 0.18 });
  for (const yaw of [0, Math.PI]) m.at([mx, 0, 0], yaw, () => frameFace(m, mainW, 0.45, wallTop, hz - 0.02, st, 3, true, variant + yaw));
  m.at([mx, 0, 0], -Math.PI / 2, () => frameFace(m, D, 0.45, wallTop, mainW / 2 - 0.02, st, 2, true, 3));
  // Thatch: thick, rounded, low eaves.
  const thA = tint(C.thatch, variant * 0.01);
  gableRoof(m, { length: mainW, span: D, y: wallTop, pitch: 3.0, eave: 0.7, verge: 0.45, courses: 6, a: thA, b: C.thatchDark, gable: st.plaster, timber: st.timber, seed: variant + 5, sag: 0.1 });
  thatchRidge(m, mainW + 0.9, mx, wallTop + 3.1, variant);
  // Lean-to on the right end: weatherboard, mono-pitch.
  m.block(1.5, 1.95, D - 0.9, C.board, { p: [hx - 0.75, 0.45, -0.2], mottle: C.boardGrey, shade: 0.25 });
  m.box(1.9, 0.14, D - 0.5, st.roofB, { p: [hx - 0.72, 2.75, -0.2], r: [0, 0, -0.42], mottle: C.roofMoss, shade: 0.2 });
  m.block(1.5, 0.45, 0.9, st.stone, { p: [hx - 0.75, 0, hz - 0.45], mottle: st.stoneB });
  doorAt(m, mx + 0.9, 0.45, hz, 1.0, 1.9, st);
  windowAt(m, mx - 1.1, 1.7, hz, 0.9, 0.9, st, r.chance(0.6));
  flowerBox(m, mx - 1.1, 1.05, hz, 1.2, variant + 3);
  m.at([mx, 0, 0], Math.PI, () => {
    windowAt(m, 0.9, 1.7, hz, 0.85, 0.9, st, r.chance(0.3));
    ivy(m, -1.2, 0.6, hz, 1.6, 2.2, variant + 60);
  });
  m.at([mx, 0, 0], -Math.PI / 2, () => windowAt(m, 0, 1.7, mainW / 2, 0.8, 0.9, st, false));
  chimney(m, 'cottage_b', 2.0, st, 0.85);
  return m.parts;
}

/** Cottage with a cross wing: an L of roofs inside a rectangular footprint. 8.4 x 5.4. */
function cottageC(variant: number): Part[] {
  const m = new Model();
  const st = styleFor(variant + 2);
  const { hx, hz } = FOOTPRINTS.cottage_c;
  const W = hx * 2;
  const D = hz * 2;
  const r = new Rand(variant + 37);
  const wallTop = 3.0;
  plinth(m, W, D, 0.5, st);
  // Hall range along the back two thirds.
  const hallD = D - 1.4;
  m.block(W - 0.1, wallTop - 0.5, hallD, st.plaster, { p: [0, 0.5, -0.7 + 0.05], mottle: st.stain, shade: 0.16 });
  m.at([0, 0, -0.7], Math.PI, () => frameFace(m, W, 0.5, wallTop, hallD / 2, st, 5, true, variant));
  m.at([0, 0, -0.7], 0, () => frameFace(m, W, 0.5, wallTop, hallD / 2, st, 5, false, variant + 1));
  for (const yaw of [Math.PI / 2, -Math.PI / 2]) m.at([0, 0, -0.7], yaw, () => frameFace(m, hallD, 0.5, wallTop, hx - 0.02, st, 2, true, 8));
  gableRoof(m, { length: W, span: hallD, y: wallTop, pitch: 2.9, a: st.roofA, b: st.roofB, gable: st.plaster, timber: st.timber, seed: variant + 9, moss: true });
  // Cross wing at the right end, two storeys, gable to the front.
  const wingW = 3.3;
  const wx = hx - wingW / 2;
  m.block(wingW - 0.1, 4.3, D - 0.1, st.plaster, { p: [wx, 0.5, 0], mottle: st.stain, shade: 0.16 });
  m.at([wx, 0, 0], 0, () => {
    frameFace(m, wingW, 0.5, 2.7, hz - 0.02, st, 2, false, 12);
    frameFace(m, wingW + 0.3, 2.7, 4.8, hz + 0.12, st, 3, true, 13);
  });
  m.block(wingW + 0.3, 2.1, 0.3, st.plaster, { p: [wx, 2.7, hz - 0.05], mottle: st.stain, shade: 0.08 });
  m.at([wx, 0, 0], Math.PI / 2, () => frameFace(m, D, 0.5, 4.8, wingW / 2 - 0.02, st, 3, true, 14));
  crossRoof(m, [wx, 4.8, 0], { length: D + 0.3, span: wingW + 0.3, y: 0, pitch: 2.2, eave: 0.45, a: st.roofA, b: st.roofB, gable: st.plaster, timber: st.timber, seed: variant + 4 });
  m.at([wx, 0, 0], 0, () => {
    windowAt(m, 0, 3.7, hz + 0.12, 1.1, 1.0, st, r.chance(0.6));
    windowAt(m, 0, 1.7, hz, 1.0, 1.0, st, r.chance(0.5));
    flowerBox(m, 0, 3.02, hz + 0.12, 1.4, variant + 8);
  });
  // Door in the hall range, under a little pentice roof.
  const dx = -1.2;
  doorAt(m, dx, 0.5, hz - 1.4, 1.1, 2.0, st, true);
  m.box(2.2, 0.12, 1.3, st.roofB, { p: [dx, 2.95, hz - 0.95], r: [0.42, 0, 0], shade: 0.15 });
  for (const sx of [-1, 1]) m.block(0.14, 2.3, 0.14, st.timber, { p: [dx + sx * 0.95, 0.5, hz - 0.5] });
  m.block(W - wingW, 0.5, 1.4, st.stone, { p: [-wingW / 2, 0, hz - 0.7], mottle: st.stoneB, shade: 0.15 });
  windowAt(m, -3.0, 1.75, hz - 1.4, 0.9, 1.0, st, r.chance(0.5));
  m.at([0, 0, -0.7], Math.PI, () => {
    windowAt(m, -2.4, 1.75, hallD / 2, 0.9, 1.0, st, false);
    windowAt(m, 0.4, 1.75, hallD / 2, 0.9, 1.0, st, r.chance(0.4));
    ivy(m, 2.8, 0.7, hallD / 2, 1.8, 2.4, variant + 70);
  });
  chimney(m, 'cottage_c', 2.4, st, 0.95);
  return m.parts;
}

/** The cider house: stone ground floor, jettied upper floor, dormers, hanging sign. 12 x 6.4. */
function longhouse(variant: number): Part[] {
  const m = new Model();
  const st = styleFor(variant);
  const { hx, hz } = FOOTPRINTS.longhouse;
  const W = hx * 2;
  const D = hz * 2;
  const r = new Rand(variant + 51);
  plinth(m, W, D, 0.4, st);
  // Stone ground floor.
  m.block(W - 0.06, 2.5, D - 0.06, st.stoneB, { p: [0, 0.4, 0], mottle: st.stone, shade: 0.28 });
  // Jettied upper floor: overhangs at 2.9 m, well above head height.
  const up0 = 2.9;
  const up1 = 5.3;
  m.block(W + 0.5, up1 - up0, D + 0.5, st.plaster, { p: [0, up0, 0], mottle: st.stain, shade: 0.14 });
  m.block(W + 0.6, 0.24, D + 0.6, st.timber, { p: [0, up0 - 0.14, 0], shade: 0.05 });
  for (let i = 0; i < 9; i++) m.box(0.2, 0.2, D + 0.7, st.timber, { p: [-hx + 0.4 + i * ((W - 0.8) / 8), up0 - 0.3, 0], shade: 0 });
  for (const yaw of [0, Math.PI]) m.at([0, 0, 0], yaw, () => frameFace(m, W + 0.5, up0, up1, hz + 0.26, st, 7, true, variant + yaw));
  for (const yaw of [Math.PI / 2, -Math.PI / 2]) m.at([0, 0, 0], yaw, () => frameFace(m, D + 0.5, up0, up1, hx + 0.26, st, 3, true, 4));
  gableRoof(m, { length: W + 0.5, span: D + 0.5, y: up1, pitch: 3.3, courses: 8, a: st.roofA, b: st.roofB, gable: st.plaster, timber: st.timber, seed: variant + 3, moss: true });
  // Three dormers on the front slope.
  for (const x of [-3.6, 0, 3.6]) {
    m.block(1.3, 1.2, 1.4, st.plaster, { p: [x, up1 + 0.35, hz - 0.9], mottle: st.stain, shade: 0.1 });
    crossRoof(m, [x, up1 + 1.55, hz - 0.95], { length: 1.7, span: 1.5, y: 0, pitch: 0.8, eave: 0.2, verge: 0.2, courses: 3, a: st.roofA, b: st.roofB, gable: st.plaster, timber: st.timber, seed: variant });
    windowAt(m, x, up1 + 0.95, hz - 0.2, 0.7, 0.75, st, r.chance(0.7), false);
  }
  // Front: arched door, a row of mullioned windows, lanterns.
  doorAt(m, -0.8, 0.4, hz, 1.3, 2.15, st, true);
  for (const x of [-4.4, -2.9, 1.6, 3.3, 4.8]) windowAt(m, x, 1.75, hz, 0.8, 1.05, st, r.chance(0.75), false);
  for (const x of [-4.2, -1.4, 1.4, 4.2]) windowAt(m, x, 4.15, hz + 0.26, 0.95, 1.0, st, r.chance(0.5));
  // Hanging sign on an iron bracket: a painted apple.
  m.box(1.5, 0.08, 0.08, C.iron, { p: [0.75, 3.55, hz + 0.95], r: [0, Math.PI / 2, 0], shade: 0 });
  m.box(0.08, 0.9, 0.9, C.timberPale, { p: [0.75, 2.9, hz + 1.35], shade: 0.1 });
  m.lump(0.26, C.appleFruit, { p: [0.75, 2.9, hz + 1.35], s: [0.5, 1, 1], soft: true, shade: 0.1 }, 1, 1);
  m.at([0, 0, 0], Math.PI, () => {
    for (const x of [-4, -1.2, 2.2, 4.4]) windowAt(m, x, 4.15, hz + 0.26, 0.9, 1.0, st, r.chance(0.3));
    doorAt(m, 3.2, 0.4, hz, 1.0, 1.95, st);
    windowAt(m, -2.4, 1.75, hz, 0.8, 1.0, st, false, false);
    ivy(m, -4.4, 0.6, hz, 2.0, 2.2, variant + 80);
  });
  for (const yaw of [Math.PI / 2, -Math.PI / 2]) m.at([0, 0, 0], yaw, () => windowAt(m, 0, 4.15, hx + 0.26, 0.9, 1.0, st, false));
  chimney(m, 'longhouse', 2.9, st, 1.25);
  // Bench and barrels against the front wall.
  m.block(2.0, 0.12, 0.45, C.board, { p: [3.4, 0.82, hz + 0.32] });
  for (const sx of [-0.8, 0.8]) m.block(0.12, 0.45, 0.4, C.timber, { p: [3.4 + sx, 0.4, hz + 0.32] });
  return m.parts;
}

// --- Working buildings ---------------------------------------------------------------

function barrel(m: Model, p: V3, s = 1, lying = false, yaw = 0): void {
  m.at(p, yaw, () => {
    const rot: V3 = lying ? [0, 0, Math.PI / 2] : [0, 0, 0];
    const y = lying ? 0.42 * s : 0.5 * s;
    m.cyl(0.34 * s, 0.34 * s, 1.0 * s, C.barrel, { p: [0, y, 0], r: rot, mottle: tint(C.barrel, -0.06), shade: 0.2 }, 10);
    m.cyl(0.41 * s, 0.41 * s, 0.5 * s, C.barrel, { p: [0, y, 0], r: rot, shade: 0.15 }, 10);
    for (const k of [-0.36, 0.36]) m.cyl(0.39 * s, 0.39 * s, 0.07 * s, C.barrelBand, { p: lying ? [k * s, y, 0] : [0, y + k * s, 0], r: rot, shade: 0 }, 10);
  });
}

/**
 * The press house: stone gable ends, an open timber arcade closed by a
 * half-height stone wall, the big screw press inside, barrels in the bays.
 * 11.2 x 7.2. (The arcade reads as a working front; the wall and the barrel
 * stacks close it, matching the solid collider.)
 */
function pressHouse(variant: number): Part[] {
  const m = new Model();
  const st = styleFor(variant + 1);
  const { hx, hz } = FOOTPRINTS.press_house;
  const W = hx * 2;
  const D = hz * 2;
  const top = 3.5;
  plinth(m, W, D, 0.4, st);
  // Back wall and both gable ends in stone and plaster.
  m.block(W - 0.06, top - 0.4, 0.6, st.stoneB, { p: [0, 0.4, -hz + 0.3], mottle: st.stone, shade: 0.28 });
  for (const sx of [-1, 1]) {
    m.block(0.6, top - 0.4, D - 0.06, st.stoneB, { p: [sx * (hx - 0.3), 0.4, 0], mottle: st.stone, shade: 0.28 });
    m.at([0, 0, 0], sx * Math.PI / 2, () => windowAt(m, 0, 2.1, hx, 0.8, 0.9, st, false, false));
  }
  // Dark interior.
  m.block(W - 1.2, top - 0.5, D - 1.0, 0x2e2620, { p: [0, 0.4, -0.2], shade: 0.5 });
  // Arcade: five bays of posts and curved braces, half wall between them.
  const bays = 5;
  const bayW = (W - 0.6) / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -hx + 0.3 + i * bayW;
    m.block(0.34, top - 0.4, 0.34, st.timber, { p: [x, 0.4, hz - 0.17], shade: 0.15 });
    m.block(0.5, 0.3, 0.5, st.stone, { p: [x, 0.4, hz - 0.25] });
    if (i < bays) {
      for (const s of [-1, 1]) m.box(0.16, 1.0, 0.16, st.timber, { p: [x + bayW / 2 + s * (bayW / 2 - 0.42), top - 0.5, hz - 0.17], r: [0, 0, s * 0.72], shade: 0 });
      m.block(bayW - 0.34, 1.05, 0.4, st.stone, { p: [x + bayW / 2, 0.4, hz - 0.2], mottle: st.stoneB, shade: 0.2 });
      m.block(bayW - 0.3, 0.1, 0.5, st.stoneB, { p: [x + bayW / 2, 1.45, hz - 0.2], shade: 0 });
    }
  }
  m.box(W, 0.36, 0.36, st.timber, { p: [0, top - 0.18, hz - 0.17], shade: 0.05 });
  // The press, seen through the arcade: bed, cheeks, cross-head, screw, pomace cheese.
  m.at([-0.6, 0.4, 0.3], 0, () => {
    m.block(2.6, 0.5, 2.0, C.timberPale, { p: [0, 0, 0], shade: 0.2 });
    for (const sx of [-1, 1]) m.block(0.4, 2.7, 0.5, C.timber, { p: [sx * 1.25, 0, 0], shade: 0.2 });
    m.block(3.1, 0.5, 0.6, C.timber, { p: [0, 2.5, 0], shade: 0.1 });
    m.post(0.14, 0.14, 1.5, C.iron, { p: [0, 1.2, 0] }, 8);
    m.block(1.5, 0.7, 1.4, C.thatch, { p: [0, 0.5, 0], mottle: C.appleFruitGold, shade: 0.25 });
    m.block(1.7, 0.16, 1.6, C.timberPale, { p: [0, 1.2, 0] });
    m.box(2.6, 0.1, 0.1, C.timberPale, { p: [0.6, 2.2, 0.2], r: [0, 0.5, 0] });
  });
  // Barrels stacked in the end bays, vats at the back.
  for (const [x, z] of [[-4.4, 1.9], [-3.7, 2.0], [4.3, 1.9], [3.5, 2.05], [2.9, 1.5]] as const) barrel(m, [x, 0.4, z], 1.05);
  barrel(m, [-4.0, 1.45, 1.95], 1.0, true, 0.2);
  barrel(m, [3.9, 1.45, 1.95], 1.0, true, -0.1);
  // Broad roof with a louvred vent on the ridge.
  gableRoof(m, { length: W + 0.2, span: D + 0.3, y: top, pitch: 3.3, courses: 9, eave: 0.75, a: st.roofA, b: st.roofB, gable: st.plaster, timber: st.timber, seed: variant + 21, moss: true, sag: 0.09 });
  m.block(2.4, 0.7, 1.1, C.board, { p: [1.6, top + 3.1, 0], mottle: C.boardGrey });
  crossRoof(m, [1.6, top + 3.8, 0], { length: 1.4, span: 2.7, y: 0, pitch: 0.6, eave: 0.2, verge: 0.2, courses: 3, a: st.roofA, b: st.roofB, gable: C.board, timber: st.timber });
  // Gable framing in the plaster above the stone.
  for (const sx of [-1, 1]) {
    m.at([0, 0, 0], sx * Math.PI / 2, () => {
      m.box(D, 0.2, 0.1, st.timber, { p: [0, top + 0.1, hx + 0.08] });
      m.box(0.18, 3.0, 0.1, st.timber, { p: [0, top + 1.5, hx + 0.08] });
      for (const s of [-1, 1]) m.box(0.15, 2.2, 0.09, st.timber, { p: [s * 1.5, top + 1.0, hx + 0.08], r: [0, 0, s * -0.75] });
    });
  }
  chimney(m, 'press_house', 2.8, st, 1.0);
  m.at([0, 0, 0], Math.PI, () => {
    doorAt(m, 2.8, 0.4, hz, 1.5, 2.2, st);
    ivy(m, -2.6, 0.5, hz, 3, 2.6, variant + 90);
    windowAt(m, -3.6, 2.3, hz, 0.8, 0.8, st, false, false);
  });
  return m.parts;
}

/** Storehouse: stone undercroft, weatherboarded loft, hoist gable, outside stair. 8.8 x 6.8. */
function storehouse(variant: number): Part[] {
  const m = new Model();
  const st = styleFor(variant + 2);
  const { hx, hz } = FOOTPRINTS.storehouse;
  const W = hx * 2;
  const D = hz * 2;
  const stairW = 1.3;
  const bodyW = W - stairW;
  const bx = -stairW / 2;
  plinth(m, W, D, 0.4, st);
  m.block(bodyW - 0.06, 2.6, D - 0.06, st.stone, { p: [bx, 0.4, 0], mottle: st.stoneB, shade: 0.3 });
  // Loft in vertical boards.
  const l0 = 3.0;
  const l1 = 5.6;
  m.block(bodyW, l1 - l0, D, C.board, { p: [bx, l0, 0], mottle: C.boardGrey, shade: 0.22 });
  for (let i = 0; i < 12; i++) {
    const x = bx - bodyW / 2 + 0.3 + i * ((bodyW - 0.6) / 11);
    for (const sz of [-1, 1]) m.box(0.07, l1 - l0, 0.05, C.timberDark, { p: [x, (l0 + l1) / 2, sz * (hz + 0.01)], shade: 0.05 });
  }
  m.block(bodyW + 0.14, 0.22, D + 0.14, st.timber, { p: [bx, l0 - 0.12, 0] });
  // Roof with the ridge along z: the gable, door and hoist face the front.
  crossRoof(m, [bx, l1, 0], { length: D, span: bodyW, y: 0, pitch: 3.1, courses: 8, eave: 0.5, verge: 0.9, a: st.roofA, b: st.roofB, gable: C.board, timber: st.timber, seed: variant + 31, moss: true });
  // Hoist: beam under a little hood, rope, hook and a sack on its way up.
  m.box(0.24, 0.26, 2.0, st.timber, { p: [bx, l1 + 1.9, hz + 0.8] });
  m.box(1.5, 0.1, 1.3, st.roofB, { p: [bx, l1 + 2.25, hz + 0.9], r: [0.2, 0, 0] });
  m.post(0.035, 0.035, 2.9, C.rope, { p: [bx, l1 - 1.1, hz + 1.5] }, 4);
  m.lump(0.34, C.sack, { p: [bx, l1 - 1.35, hz + 1.5], s: [1, 1.3, 0.9], soft: true, shade: 0.25 }, 1, 2);
  // Loft loading door and ground-floor cart door.
  m.box(1.5, 1.8, 0.1, st.door, { p: [bx, l0 + 1.1, hz + 0.03], mottle: tint(st.door, 0.05), shade: 0.2 });
  m.box(1.7, 0.14, 0.14, st.timber, { p: [bx, l0 + 2.05, hz + 0.05] });
  doorAt(m, bx, 0.4, hz, 2.0, 2.2, st, true);
  for (const x of [-2.5, 2.3]) m.box(0.55, 0.4, 0.1, C.windowDark, { p: [bx + x, 2.3, hz + 0.02], shade: 0.2 });
  // Outside stair up the right side to a loft door, on a stone base.
  for (let i = 0; i < 9; i++) {
    m.block(stairW - 0.1, 0.34 + i * 0.3, 0.62, st.stoneB, { p: [hx - stairW / 2, 0, hz - 0.45 - i * 0.62], mottle: st.stone, shade: 0.2 });
  }
  m.block(stairW - 0.1, 3.0, D - 9 * 0.62 - 0.1, st.stoneB, { p: [hx - stairW / 2, 0, -hz + (D - 9 * 0.62) / 2 + 0.05], mottle: st.stone, shade: 0.2 });
  m.box(0.08, 0.08, 6.4, st.timber, { p: [hx - 0.08, 2.6, -0.2], r: [0.44, 0, 0] });
  for (let i = 0; i < 5; i++) m.block(0.1, 1.0, 0.1, st.timber, { p: [hx - 0.08, 0.7 + i * 0.62, hz - 0.5 - i * 1.3] });
  m.box(0.1, 1.8, 1.0, st.door, { p: [bx + bodyW / 2 + 0.03, l0 + 1.0, -hz + 1.0], shade: 0.2 });
  // Back and far side: small barred windows, a lean of ivy.
  m.at([bx, 0, 0], Math.PI, () => {
    for (const x of [-2.2, 0, 2.2]) m.box(0.55, 0.4, 0.1, C.windowDark, { p: [x, 2.3, hz + 0.02], shade: 0.2 });
    windowAt(m, 0, l0 + 1.3, hz + 0.02, 0.9, 0.9, st, false);
    ivy(m, 2.4, 0.5, hz, 2, 2.4, variant + 95);
  });
  m.at([bx, 0, 0], -Math.PI / 2, () => {
    for (const x of [-1.8, 1.8]) m.box(0.55, 0.4, 0.1, C.windowDark, { p: [x, 2.3, bodyW / 2 + 0.02], shade: 0.2 });
  });
  return m.parts;
}

/** Open-fronted cart shed: stone back, posts, a cart tail and tools inside. 7.2 x 4.4. */
function cartShed(variant: number): Part[] {
  const m = new Model();
  const st = styleFor(variant);
  const { hx, hz } = FOOTPRINTS.cart_shed;
  const W = hx * 2;
  const D = hz * 2;
  plinth(m, W, D, 0.25, st);
  m.block(W - 0.06, 2.5, 0.5, st.stone, { p: [0, 0.25, -hz + 0.25], mottle: st.stoneB, shade: 0.28 });
  for (const sx of [-1, 1]) m.block(0.5, 2.3, D - 0.06, C.board, { p: [sx * (hx - 0.25), 0.25, 0], mottle: C.boardGrey, shade: 0.25 });
  m.block(W - 1.0, 2.2, D - 0.8, 0x33291f, { p: [0, 0.25, -0.1], shade: 0.5 });
  for (const x of [-hx + 0.2, -1.2, 1.2, hx - 0.2]) {
    m.block(0.3, 2.6, 0.3, st.timber, { p: [x, 0.25, hz - 0.15], shade: 0.15 });
    m.block(0.44, 0.3, 0.44, st.stone, { p: [x, 0.25, hz - 0.22] });
  }
  // Rails closing the bays at waist height, a parked cart tail, wheels and tools.
  for (const x of [-2.35, 0, 2.35]) m.box(2.1, 0.12, 0.1, st.timber, { p: [x, 1.25, hz - 0.15] });
  m.block(1.7, 0.6, 2.2, C.cartBody, { p: [-2.3, 0.75, 0.2], mottle: tint(C.cartBody, 0.05) });
  for (const sx of [-1, 1]) m.cyl(0.62, 0.62, 0.1, C.timberDark, { p: [-2.3 + sx * 0.95, 0.85, 0.3], r: [0, 0, Math.PI / 2] }, 12);
  m.cyl(0.6, 0.6, 0.1, C.timberPale, { p: [1.6, 0.9, hz - 0.5], r: [Math.PI / 2 - 0.25, 0, 0] }, 12);
  barrel(m, [2.6, 0.25, -0.6], 0.95);
  barrel(m, [0.3, 0.25, -0.9], 0.9);
  m.box(W + 0.7, 0.16, D + 1.0, st.roofA, { p: [0, 3.25, 0.1], r: [0.3, 0, 0], mottle: st.roofB, shade: 0.2 });
  for (let i = 0; i < 5; i++) m.box(W + 0.74, 0.1, 0.5, i % 2 ? st.roofB : st.roofA, { p: [0, 3.94 - i * 0.33, -hz + 0.35 + i * 1.05], r: [0.3 + 0.07, 0, 0], mottle: C.roofMoss, shade: 0.15 });
  m.box(W + 0.2, 0.26, 0.26, st.timber, { p: [0, 2.9, hz - 0.15] });
  return m.parts;
}

/** Watermill: tall stone house on the bank, timber loft, wheel pit side at the back. 8.8 x 7.2. */
function mill(variant: number): Part[] {
  const m = new Model();
  const st = styleFor(variant + 1);
  const { hx, hz } = FOOTPRINTS.mill;
  const W = hx * 2;
  const D = hz * 2;
  const r = new Rand(variant + 77);
  m.block(W, 2.4, D, C.stoneWet, { p: [0, -2.0, 0], mottle: C.stoneDark, shade: 0.2 });
  m.taper(W + 0.1, D + 0.1, W - 0.1, D - 0.1, 3.6, st.stone, { p: [0, 0.3, 0], mottle: C.stoneDark, shade: 0.32 });
  m.block(W + 0.16, 0.24, D + 0.16, st.stoneB, { p: [0, 3.78, 0] });
  const l0 = 4.0;
  const l1 = 6.3;
  m.block(W - 0.1, l1 - l0, D - 0.1, st.plaster, { p: [0, l0, 0], mottle: st.stain, shade: 0.14 });
  for (const yaw of [0, Math.PI]) m.at([0, 0, 0], yaw, () => frameFace(m, W - 0.1, l0, l1, hz - 0.04, st, 5, true, variant + yaw));
  for (const yaw of [Math.PI / 2, -Math.PI / 2]) m.at([0, 0, 0], yaw, () => frameFace(m, D - 0.1, l0, l1, hx - 0.04, st, 4, true, 3));
  gableRoof(m, { length: W - 0.1, span: D - 0.1, y: l1, pitch: 3.4, courses: 8, eave: 0.6, a: st.roofA, b: st.roofB, gable: st.plaster, timber: st.timber, seed: variant + 41, moss: true, sag: 0.08 });
  // Lucam (sack-hoist dormer) projecting over the yard door.
  m.block(1.9, 1.9, 1.5, C.board, { p: [1.6, l1 - 0.2, hz - 0.1], mottle: C.boardGrey, shade: 0.2 });
  crossRoof(m, [1.6, l1 + 1.7, hz - 0.2], { length: 2.0, span: 2.2, y: 0, pitch: 1.0, eave: 0.2, verge: 0.25, courses: 3, a: st.roofA, b: st.roofB, gable: C.board, timber: st.timber });
  m.box(1.0, 1.2, 0.08, st.door, { p: [1.6, l1 + 0.7, hz + 0.66] });
  m.post(0.035, 0.035, 3.6, C.rope, { p: [1.6, l1 - 3.5, hz + 0.9] }, 4);
  // Yard front.
  doorAt(m, 1.6, 0.3, hz + 0.04, 1.5, 2.3, st, true);
  for (const x of [-2.6, -0.8]) windowAt(m, x, 2.2, hz + 0.02, 0.8, 1.0, st, r.chance(0.6));
  for (const x of [-2.6, -0.6]) windowAt(m, x, l0 + 1.2, hz - 0.04, 0.85, 0.95, st, r.chance(0.4));
  m.block(2.4, 0.3, 1.1, st.stoneB, { p: [1.6, 0, hz + 0.3], mottle: st.stone });
  // Back (river side): the axle housing and a launder trough to the wheel.
  m.at([0, 0, 0], Math.PI, () => {
    m.block(1.6, 1.6, 0.5, C.board, { p: [0, 0.6, hz], mottle: C.boardGrey });
    m.cyl(0.3, 0.3, 0.9, C.timberDark, { p: [0, 1.45, hz + 0.4], r: [Math.PI / 2, 0, 0] }, 8);
    m.box(4.6, 0.16, 0.9, C.board, { p: [-2.6, 3.9, hz + 0.9], r: [0, 0, 0.05], mottle: C.boardGrey });
    for (const sx of [-1, 1]) m.box(4.6, 0.4, 0.08, C.board, { p: [-2.6, 4.1, hz + 0.9 + sx * 0.45], r: [0, 0, 0.05] });
    for (const x of [-4.4, -2.6]) m.block(0.2, 5.4, 0.2, st.timber, { p: [x, -1.4, hz + 0.9] });
    for (const x of [-2.8, 2.6]) windowAt(m, x, l0 + 1.2, hz - 0.04, 0.8, 0.9, st, false);
    ivy(m, 2.8, 0.3, hz + 0.02, 2.4, 3, variant + 99);
  });
  for (const yaw of [Math.PI / 2, -Math.PI / 2]) m.at([0, 0, 0], yaw, () => {
    windowAt(m, 0.6, 2.2, hx + 0.02, 0.8, 1.0, st, false, false);
    windowAt(m, 0, l1 + 1.3, hx - 0.1, 0.7, 0.8, st, false, false);
  });
  return m.parts;
}

/** Board barn on a stone footing, great doors, hay door in the gable. 10.4 x 7.2. */
function barn(variant: number): Part[] {
  const m = new Model();
  const st = styleFor(variant + 2);
  const { hx, hz } = FOOTPRINTS.barn;
  const W = hx * 2;
  const D = hz * 2;
  plinth(m, W, D, 0.7, st);
  const top = 3.9;
  m.block(W - 0.08, top - 0.7, D - 0.08, C.board, { p: [0, 0.7, 0], mottle: C.boardGrey, shade: 0.26 });
  for (let i = 0; i < 16; i++) {
    const x = -hx + 0.3 + i * ((W - 0.6) / 15);
    for (const sz of [-1, 1]) m.box(0.07, top - 0.7, 0.05, C.timberDark, { p: [x, (top + 0.7) / 2, sz * (hz - 0.02)], shade: 0.05 });
  }
  for (const yaw of [0, Math.PI]) m.at([0, 0, 0], yaw, () => frameFace(m, W, 0.7, top, hz - 0.01, st, 4, false, 3));
  for (const yaw of [Math.PI / 2, -Math.PI / 2]) m.at([0, 0, 0], yaw, () => frameFace(m, D, 0.7, top, hx - 0.01, st, 3, true, 5));
  gableRoof(m, { length: W, span: D, y: top, pitch: 3.7, courses: 9, eave: 0.7, verge: 0.5, a: tint(C.thatch, -0.02), b: C.thatchDark, gable: C.board, timber: st.timber, seed: variant + 61, sag: 0.12 });
  thatchRidge(m, W + 1.0, 0, top + 3.8, variant + 4);
  // Great doors (one leaf ajar is drawn flat: the barn is solid), with cross braces.
  for (const sx of [-1, 1]) {
    m.box(1.7, 3.0, 0.12, st.door, { p: [sx * 0.9, 2.2, hz + 0.04], mottle: tint(st.door, 0.06), shade: 0.2 });
    m.box(0.12, 3.4, 0.06, C.timberPale, { p: [sx * 0.9, 2.2, hz + 0.12], r: [0, 0, sx * 0.5] });
    for (const y of [1.0, 3.4]) m.box(1.7, 0.12, 0.06, C.iron, { p: [sx * 0.9, y, hz + 0.12] });
  }
  m.box(3.9, 0.3, 0.3, st.timber, { p: [0, 3.85, hz + 0.02] });
  m.block(3.8, 0.7, 1.6, C.stoneWarm, { p: [0, 0, hz + 0.1], mottle: st.stone, shade: 0.15 });
  // Hay door and owl hole in the side gable; a hay heap at the back door.
  m.at([0, 0, 0], Math.PI / 2, () => {
    m.box(1.2, 1.4, 0.1, st.door, { p: [0, top + 1.2, hx + 0.02] });
    m.lump(0.5, C.hayBale, { p: [0, top + 0.5, hx + 0.1], s: [1.4, 0.5, 0.5], soft: true }, 0, 3);
    m.box(0.3, 0.3, 0.1, C.windowDark, { p: [0, top + 2.7, hx + 0.02] });
  });
  m.at([0, 0, 0], Math.PI, () => {
    doorAt(m, -2.6, 0.7, hz, 1.1, 2.0, st);
    ivy(m, 2.6, 0.6, hz, 3, 2.6, variant + 85);
  });
  return m.parts;
}

export const BUILDING_BUILDERS: Record<BuildingKind, (variant: number) => Part[]> = {
  cottage_a: cottageA,
  cottage_b: cottageB,
  cottage_c: cottageC,
  longhouse,
  press_house: pressHouse,
  storehouse,
  cart_shed: cartShed,
  mill,
  barn,
};

export { barrel };
