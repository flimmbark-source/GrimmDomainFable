/**
 * Asset library: every visible model is requested by id through this one
 * interface. An id resolves to an imported GLB when one is listed in
 * GLB_MODELS, otherwise to an original procedural placeholder builder.
 * Replacing a placeholder with authored art is a one-line manifest change.
 *
 * Model conventions (for imported art too): origin on the ground at the centre
 * of the footprint, +Y up, 1 unit = 1 metre, characters face +Z.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PropKind } from '../../shared/sim/map.ts';
import type { BuildingKind } from '../../shared/world/kit.ts';
import { bake, type Part } from './bake.ts';
import { BUILDING_BUILDERS } from './models/buildings.ts';
import { FLORA_BUILDERS, type FloraKind } from './models/flora.ts';
import { PROP_BUILDERS } from './models/props.ts';
import { PALETTE as P } from './palette.ts';

export type AssetId = PropKind | 'hero_light' | 'hero_dark' | 'monster_beast' | 'castle' | 'cache';

/** Ids served from /public/models instead of a procedural builder. */
export const GLB_MODELS: Partial<Record<AssetId, string>> = {
  standing_stone: 'models/standing_stone.glb',
};

const cyl = (rTop: number, rBottom: number, h: number, seg = 7) => new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1);
const cone = (r: number, h: number, seg = 7) => new THREE.ConeGeometry(r, h, seg, 1);
const blob = (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

// --- Trees: three species with deliberately different silhouettes -----------

/** Tall, narrow, layered dark-green spire. */
function pineParts(): Part[] {
  return [
    { geo: cyl(0.22, 0.42, 2.2), color: P.bark, pos: [0, 1.1, 0] },
    { geo: cone(1.9, 2.6, 8), color: P.pineDark, pos: [0, 2.7, 0], rot: [0.05, 0, 0.04] },
    { geo: cone(1.5, 2.3, 8), color: P.pine, pos: [0.08, 4.0, 0], rot: [-0.04, 0.5, 0.05] },
    { geo: cone(1.1, 2.0, 7), color: P.pine, pos: [0, 5.2, 0.06], rot: [0.04, 1.1, -0.05] },
    { geo: cone(0.65, 1.7, 6), color: P.pineDark, pos: [0.05, 6.3, 0], rot: [0, 0.3, 0.08], shade: 0.1 },
  ];
}

/** Squat, wide, bright rounded canopy on a thick bent trunk. */
function oakParts(): Part[] {
  return [
    { geo: cyl(0.42, 0.7, 1.8, 8), color: P.bark, pos: [0, 0.9, 0], rot: [0, 0, 0.08] },
    { geo: cyl(0.3, 0.42, 1.4, 7), color: P.bark, pos: [0.22, 2.3, 0], rot: [0, 0, -0.28] },
    { geo: cyl(0.14, 0.24, 1.5, 6), color: P.barkDark, pos: [-0.75, 2.6, 0.2], rot: [0.2, 0, 0.95] },
    { geo: blob(1.75), color: P.oak, pos: [0.4, 4.0, 0], scale: [1.15, 0.85, 1.1] },
    { geo: blob(1.3), color: P.oakLight, pos: [-1.3, 3.6, 0.5], scale: [1.1, 0.8, 1], shade: 0.35 },
    { geo: blob(1.25), color: P.oak, pos: [1.5, 3.4, -0.7], scale: [1, 0.8, 1.1], shade: 0.4 },
    { geo: blob(1.05), color: P.oakLight, pos: [0.2, 5.0, -0.3], scale: [1.2, 0.75, 1.1], shade: 0.15 },
  ];
}

/** Bare, pale, clawing branches - no foliage at all. */
function deadTreeParts(): Part[] {
  return [
    { geo: cyl(0.22, 0.5, 2.4, 6), color: P.barkDead, pos: [0, 1.2, 0], rot: [0.06, 0, -0.1] },
    { geo: cyl(0.12, 0.24, 2.2, 5), color: P.barkDead, pos: [0.25, 3.3, 0.05], rot: [0.1, 0, -0.22] },
    { geo: cyl(0.05, 0.14, 1.9, 5), color: P.barkDead, pos: [-0.75, 3.0, 0], rot: [0, 0, 1.0], shade: 0.1 },
    { geo: cyl(0.03, 0.08, 1.1, 4), color: P.barkDead, pos: [-1.6, 3.85, 0], rot: [0, 0, 0.35], shade: 0.1 },
    { geo: cyl(0.05, 0.13, 1.7, 5), color: P.barkDead, pos: [0.95, 3.4, 0.3], rot: [0.35, 0, -1.05], shade: 0.1 },
    { geo: cyl(0.03, 0.07, 1.0, 4), color: P.barkDead, pos: [1.75, 4.15, 0.55], rot: [0.3, 0, -0.3], shade: 0.1 },
    { geo: cyl(0.03, 0.09, 1.4, 4), color: P.barkDead, pos: [0.3, 4.7, -0.35], rot: [-0.55, 0, 0.25], shade: 0.1 },
    { geo: cyl(0.02, 0.06, 0.9, 4), color: P.barkDead, pos: [0.75, 4.9, 0.1], rot: [0.2, 0, -0.8], shade: 0.1 },
  ];
}

function rockParts(): Part[] {
  return [
    { geo: blob(0.95, 0), color: P.rock, pos: [0, 0.45, 0], scale: [1.05, 0.75, 0.9], rot: [0.3, 0.4, 0.1] },
    { geo: blob(0.55, 0), color: P.rock, pos: [0.65, 0.25, 0.35], scale: [1, 0.7, 1], rot: [0.9, 0.2, 0.5] },
    { geo: blob(0.4, 0), color: P.moss, pos: [-0.2, 0.92, 0.05], scale: [1.3, 0.3, 1.1], shade: 0.1 },
  ];
}

/** Taller than a hero, so it reads as something you can hide behind.
 *  Footprint radius 1.5 at scale 1 (matches the map collider). */
function boulderParts(): Part[] {
  return [
    { geo: blob(1.5, 1), color: P.rock, pos: [0, 1.25, 0], scale: [1, 1.25, 1], rot: [0.2, 0.5, 0.1], shade: 0.4 },
    { geo: blob(0.9, 0), color: P.rock, pos: [0.75, 0.5, 0.7], scale: [1, 0.8, 1], rot: [0.7, 0.2, 0.4] },
    { geo: blob(0.7, 0), color: P.moss, pos: [-0.3, 2.65, 0.1], scale: [1.4, 0.3, 1.2], shade: 0.1 },
  ];
}

/**
 * Bramble hedge and ruined wall are modelled on a 2 x 2 footprint and are
 * stretched by the renderer to the map collider's half extents, so what you
 * see is exactly what blocks movement and sight.
 */
function thicketParts(): Part[] {
  const parts: Part[] = [];
  const lumps: [number, number, number, number][] = [
    [-0.62, 1.15, -0.25, 0.62], [-0.2, 1.5, 0.3, 0.66], [0.25, 1.3, -0.3, 0.64], [0.66, 1.2, 0.25, 0.6],
    [-0.7, 0.6, 0.45, 0.5], [0.05, 0.65, -0.55, 0.52], [0.7, 0.6, -0.5, 0.5], [0.3, 0.6, 0.55, 0.5],
    [-0.35, 2.0, -0.1, 0.5], [0.45, 2.05, 0.05, 0.48],
  ];
  lumps.forEach(([x, y, z, r], i) => parts.push({ geo: blob(r, 0), color: i % 3 === 0 ? P.pineDark : P.thicket, pos: [x, y * 1.35, z], scale: [1.25, 1.5, 1.6], rot: [i, i * 2, 0], shade: 0.3 }));
  for (const [x, z, lean] of [[-0.8, 0, 0.3], [0.1, 0.4, -0.25], [0.8, -0.2, 0.2]] as const) {
    parts.push({ geo: cyl(0.02, 0.05, 1.3, 4), color: P.barkDark, pos: [x, 3.3, z], rot: [lean, 0, lean], shade: 0 });
  }
  return parts;
}

function ruinWallParts(): Part[] {
  const heights = [2.5, 3.0, 2.7, 1.5, 2.9, 2.3];
  const parts: Part[] = heights.map((h, i) => ({
    geo: box(2 / heights.length + 0.01, h, 1.9), color: i % 2 ? P.ruin : P.ruinDark, pos: [-1 + (i + 0.5) * (2 / heights.length), h / 2, 0], shade: 0.35,
  }));
  parts.push({ geo: box(2, 0.35, 2), color: P.ruinDark, pos: [0, 0.17, 0], shade: 0.1 });
  parts.push({ geo: blob(0.25, 0), color: P.moss, pos: [-0.5, 3.0, 0], scale: [1, 0.4, 3], shade: 0.1 });
  return parts;
}

/** Supply cache: a banded chest. Placeholder for whatever M2 resources become. */
function cacheParts(): Part[] {
  return [
    { geo: box(1.3, 0.7, 0.85), color: P.leather, pos: [0, 0.4, 0] },
    { geo: cyl(0.43, 0.43, 1.3, 8), color: P.timber, pos: [0, 0.78, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 1], shade: 0.15 },
    { geo: box(0.14, 0.95, 0.9), color: P.lightTeamTrim, pos: [-0.4, 0.55, 0], shade: 0 },
    { geo: box(0.14, 0.95, 0.9), color: P.lightTeamTrim, pos: [0.4, 0.55, 0], shade: 0 },
    { geo: box(0.2, 0.25, 0.1), color: P.steel, pos: [0, 0.72, 0.45], shade: 0 },
  ];
}

/** Fallback only: shown if the GLB standing stone fails to load. */
function standingStoneFallbackParts(): Part[] {
  return [{ geo: cyl(0.3, 0.7, 2.6, 6), color: P.rock, pos: [0.1, 1.3, 0], rot: [0, 0, -0.08] }];
}

/**
 * Crooked fairytale cottage. Footprint 6.4 x 5.2 (matches the map collider);
 * the upper storey and roof lean, the footprint itself does not.
 */
function crookedHouseParts(): Part[] {
  const lean = 0.09;
  return [
    { geo: box(6.4, 0.5, 5.2), color: P.rock, pos: [0, 0.25, 0], shade: 0.2 },
    { geo: box(6.0, 2.6, 4.8), color: P.plaster, pos: [0, 1.8, 0], rot: [0, 0, lean * 0.4] },
    // Jettied upper storey, leaning the other way.
    { geo: box(6.5, 2.0, 5.2), color: P.plaster, pos: [0.25, 4.05, 0], rot: [0, 0.03, -lean] },
    // Timber framing.
    { geo: box(6.7, 0.28, 5.4), color: P.timber, pos: [0.12, 3.05, 0], rot: [0, 0, -lean * 0.3], shade: 0.1 },
    { geo: box(0.3, 2.7, 0.3), color: P.timber, pos: [-2.95, 1.8, 2.36], rot: [0, 0, lean * 0.4], shade: 0.1 },
    { geo: box(0.3, 2.7, 0.3), color: P.timber, pos: [3.0, 1.8, 2.36], rot: [0, 0, lean * 0.4], shade: 0.1 },
    { geo: box(0.24, 2.9, 0.2), color: P.timber, pos: [1.2, 4.0, 2.58], rot: [0, 0, 0.5], shade: 0.1 },
    { geo: box(0.24, 2.9, 0.2), color: P.timber, pos: [-1.0, 4.05, 2.58], rot: [0, 0, -0.62], shade: 0.1 },
    // Steep, sagging roof: two slabs meeting off-centre, plus a hat-like peak.
    { geo: box(4.6, 0.35, 6.2), color: P.roof, pos: [-1.55, 6.2, 0], rot: [0, 0.03, 0.9 - lean], shade: 0.35 },
    { geo: box(4.9, 0.35, 6.2), color: P.roofDark, pos: [2.05, 6.05, 0], rot: [0, 0.03, -0.82 - lean], shade: 0.35 },
    { geo: cone(1.1, 2.4, 4), color: P.roof, pos: [0.75, 8.3, -0.6], rot: [0.1, 0.6, -0.3], shade: 0.2 },
    // Leaning chimney.
    { geo: box(0.8, 3.4, 0.8), color: P.rock, pos: [-2.3, 6.9, -1.2], rot: [0.05, 0, 0.16] },
    { geo: box(1.0, 0.3, 1.0), color: P.barkDark, pos: [-2.57, 8.6, -1.28], rot: [0.05, 0, 0.16], shade: 0 },
    // Door (front faces +Z) and step.
    { geo: box(1.2, 2.1, 0.2), color: P.door, pos: [0.3, 1.5, 2.45], rot: [0, 0, 0.05], shade: 0.1 },
    { geo: box(1.8, 0.25, 0.9), color: P.rock, pos: [0.3, 0.4, 2.9], shade: 0.1 },
  ];
}

function castleParts(): Part[] {
  const c = P.castle;
  const tower = (x: number, z: number, r: number, h: number): Part[] => [
    { geo: cyl(r * 0.9, r, h, 8), color: c, pos: [x, h / 2, z], shade: 0.5 },
    { geo: cyl(r * 1.15, r * 0.9, 2.5, 8), color: c, pos: [x, h + 1.2, z], shade: 0.1 },
    { geo: cone(r * 1.25, r * 3.2, 8), color: c, pos: [x, h + 2.4 + r * 1.6, z], shade: 0.1 },
  ];
  return [
    { geo: box(46, 16, 14), color: c, pos: [0, 8, 0], shade: 0.5 },
    { geo: box(18, 34, 14), color: c, pos: [2, 17, -6], shade: 0.4 },
    { geo: cone(13, 16, 4), color: c, pos: [2, 42, -6], rot: [0, Math.PI / 4, 0], shade: 0.1 },
    ...tower(-23, 2, 5, 30),
    ...tower(23, 2, 4.5, 24),
    ...tower(-9, -8, 4, 46),
    ...tower(13, -10, 3.2, 58),
    ...tower(-1, 6, 3, 20),
    { geo: box(8, 11, 3), color: c, pos: [0, 5.5, 8], shade: 0.3 },
  ];
}

// --- Characters (placeholders; hero identities are not decided) -------------

/** A part that swings with a limb instead of being fused into the body. */
type RigPart = Part & { limb?: 'legL' | 'legR' | 'armL' | 'armR' };
const tag = (limb: NonNullable<RigPart['limb']>, parts: Part[]): RigPart[] => parts.map((part) => ({ ...part, limb }));

/** Where each limb hinges, per character (hips and shoulders). */
const LIMB_PIVOTS: Partial<Record<AssetId, Record<NonNullable<RigPart['limb']>, [number, number, number]>>> = {
  hero_light: { legL: [-0.22, 0.7, 0], legR: [0.22, 0.7, 0], armL: [-0.46, 1.36, 0.04], armR: [0.46, 1.36, 0.04] },
  hero_dark: { legL: [-0.26, 1.0, 0], legR: [0.26, 1.0, 0], armL: [-0.68, 1.86, 0.02], armR: [0.68, 1.86, 0.02] },
  monster_beast: { armL: [-0.4, 0.95, 0.6], armR: [0.4, 0.95, 0.6], legL: [-0.38, 0.95, -0.7], legR: [0.38, 0.95, -0.7] },
};

function lightHeroParts(): RigPart[] {
  // Goblin Outlaw: hunched, big-headed, long-eared, hooded in the Light colour
  // with an orange scarf. Built to read from the high camera: the head, ears
  // and blade are oversized on purpose.
  const skin = P.goblinSkin;
  const scarf = 0xd9822b;
  const cloth = 0x4a3a2c;
  const side = (x: 1 | -1): RigPart[] => [
    ...tag(x > 0 ? 'legR' : 'legL', [
      { geo: box(0.3, 0.2, 0.46), color: 0x2e2118, pos: [x * 0.22, 0.1, 0.06], shade: 0.1 }, // boot
      { geo: cyl(0.14, 0.17, 0.5, 6), color: cloth, pos: [x * 0.22, 0.44, 0] }, // leg
    ]),
    ...tag(x > 0 ? 'armR' : 'armL', [
      { geo: cyl(0.12, 0.15, 0.62, 6), color: P.lightTeam, pos: [x * 0.56, 1.14, 0.1], rot: [0.35, 0, x * 0.55] }, // sleeve
      { geo: blob(0.17, 0), color: skin, pos: [x * 0.74, 0.86, 0.26], shade: 0.1 }, // hand
    ]),
    { geo: cone(0.16, 0.78, 4), color: skin, pos: [x * 0.74, 1.98, -0.02], rot: [0, 0, -x * 1.25], shade: 0.05 }, // ear
    { geo: blob(0.075, 0), color: 0xfff2a0, pos: [x * 0.17, 1.9, 0.4], shade: 0 }, // eye
  ];
  return [
    ...side(1), ...side(-1),
    { geo: cyl(0.36, 0.5, 0.82, 8), color: P.leather, pos: [0, 1.0, 0], rot: [0.12, 0, 0] }, // jerkin
    { geo: cyl(0.52, 0.52, 0.12, 8), color: 0x2e2118, pos: [0, 0.74, 0] }, // belt
    { geo: box(0.16, 0.14, 0.08), color: P.lightTeamTrim, pos: [0, 0.74, 0.5], shade: 0 }, // buckle
    { geo: cyl(0.42, 0.34, 0.24, 8), color: scarf, pos: [0, 1.46, 0.04], shade: 0.1 }, // scarf
    { geo: box(0.2, 0.5, 0.08), color: scarf, pos: [0.2, 1.2, 0.36], rot: [0.1, 0, -0.2], shade: 0.1 }, // scarf tail
    { geo: blob(0.44), color: skin, pos: [0, 1.84, 0.08], shade: 0.15 }, // head
    { geo: cone(0.1, 0.4, 5), color: skin, pos: [0, 1.76, 0.56], rot: [Math.PI / 2, 0, 0], shade: 0 }, // nose = facing cue
    { geo: box(0.3, 0.05, 0.08), color: 0x33421f, pos: [0, 1.62, 0.44], shade: 0 }, // grin
    { geo: cone(0.6, 0.95, 7), color: P.lightTeam, pos: [0, 2.2, -0.16], rot: [-0.42, 0, 0], shade: 0.2 }, // hood
    { geo: box(0.92, 1.25, 0.1), color: P.lightTeam, pos: [0, 0.98, -0.4], rot: [0.14, 0, 0], shade: 0.4 }, // cloak
    { geo: box(0.48, 0.44, 0.24), color: P.leather, pos: [-0.2, 0.9, -0.52], rot: [0, 0, 0.1] }, // satchel
    // Blade in the right hand: it swings with the arm.
    ...tag('armR', [
      { geo: box(0.08, 0.1, 0.22), color: 0x2e2118, pos: [0.74, 0.88, 0.42], shade: 0 },
      { geo: cone(0.09, 0.62, 4), color: P.steel, pos: [0.74, 0.9, 0.82], rot: [Math.PI / 2, 0, 0], shade: 0 },
    ]),
  ];
}

function darkHeroParts(): RigPart[] {
  // Dark Hero: tall, plated and horned, with a torn cape and a heavy cleaver.
  const plate = 0x4b4458;
  const side = (x: 1 | -1): RigPart[] => [
    ...tag(x > 0 ? 'legR' : 'legL', [
      { geo: box(0.34, 0.24, 0.52), color: plate, pos: [x * 0.26, 0.12, 0.06], shade: 0.1 }, // sabaton
      { geo: cyl(0.17, 0.2, 0.8, 6), color: P.darkTeamTrim, pos: [x * 0.26, 0.6, 0] }, // leg
    ]),
    { geo: blob(0.4, 0), color: plate, pos: [x * 0.66, 1.98, 0], scale: [1.25, 0.8, 1.1] }, // pauldron
    { geo: cone(0.13, 0.5, 4), color: P.steel, pos: [x * 0.92, 2.26, 0], rot: [0, 0, -x * 0.7], shade: 0 }, // pauldron spike
    ...tag(x > 0 ? 'armR' : 'armL', [
      { geo: cyl(0.15, 0.18, 0.78, 6), color: P.darkTeamTrim, pos: [x * 0.72, 1.5, 0.08], rot: [0.25, 0, x * 0.2] }, // arm
      { geo: blob(0.2, 0), color: plate, pos: [x * 0.78, 1.08, 0.2], shade: 0.1 }, // gauntlet
    ]),
    { geo: cone(0.12, 0.9, 5), color: 0xd8d2c0, pos: [x * 0.4, 2.98, -0.04], rot: [-0.2, 0, -x * 0.6], shade: 0 }, // horn
  ];
  return [
    ...side(1), ...side(-1),
    { geo: cyl(0.5, 0.66, 0.9, 8), color: P.darkTeam, pos: [0, 0.85, 0], shade: 0.3 }, // tabard skirt
    { geo: cyl(0.52, 0.46, 0.86, 8), color: plate, pos: [0, 1.62, 0], shade: 0.1 }, // breastplate
    { geo: box(0.2, 0.9, 0.06), color: P.darkTeam, pos: [0, 1.5, 0.5], shade: 0 }, // crimson stripe
    { geo: cyl(0.6, 0.6, 0.12, 8), color: 0x1b1420, pos: [0, 1.2, 0] }, // belt
    { geo: blob(0.4), color: plate, pos: [0, 2.42, 0.02], scale: [1, 1.1, 1], shade: 0.1 }, // helm
    { geo: box(0.5, 0.09, 0.12), color: P.eyeGlow, pos: [0, 2.44, 0.38], shade: 0 }, // visor = facing cue
    { geo: box(0.1, 0.34, 0.12), color: 0x1b1420, pos: [0, 2.26, 0.4], shade: 0 }, // visor slit
    { geo: box(1.4, 1.5, 0.1), color: P.darkTeam, pos: [0, 1.5, -0.46], rot: [0.14, 0, 0], shade: 0.5 }, // cape
    { geo: box(0.5, 0.7, 0.1), color: P.darkTeam, pos: [-0.44, 0.55, -0.6], rot: [0.2, 0, 0.12], shade: 0.5 }, // torn cape ends
    { geo: box(0.44, 0.5, 0.1), color: P.darkTeam, pos: [0.46, 0.66, -0.58], rot: [0.2, 0, -0.1], shade: 0.5 },
    // Cleaver in the right hand: it swings with the arm.
    ...tag('armR', [
      { geo: cyl(0.05, 0.05, 0.5, 5), color: 0x2e2118, pos: [0.78, 1.1, 0.46], rot: [Math.PI / 2, 0, 0], shade: 0 },
      { geo: box(0.07, 0.5, 0.8), color: P.steel, pos: [0.78, 1.22, 1.06], shade: 0 },
    ]),
  ];
}

function monsterParts(): RigPart[] {
  const leg = (x: number, z: number): RigPart[] => tag(z > 0 ? (x > 0 ? 'armR' : 'armL') : x > 0 ? 'legR' : 'legL', [
    { geo: cyl(0.16, 0.22, 0.62, 5), color: P.fur, pos: [x, 0.62, z], rot: [z > 0 ? 0.25 : -0.3, 0, 0] },
    { geo: cyl(0.1, 0.14, 0.5, 5), color: P.fur, pos: [x, 0.25, z + (z > 0 ? 0.1 : -0.12)] },
    { geo: cone(0.16, 0.34, 4), color: 0x1e1b26, pos: [x, 0.08, z + (z > 0 ? 0.26 : 0.02)], rot: [Math.PI / 2, 0, 0], shade: 0 }, // claws
  ]);
  const spine = [0.55, 0.2, -0.15, -0.5, -0.85].map((z, i): Part => (
    { geo: cone(0.1, 0.5 - i * 0.05, 4), color: P.furLight, pos: [0, 1.86 - i * 0.12, z], rot: [-0.5, 0, 0], shade: 0 }
  ));
  return [
    ...leg(-0.4, 0.6), ...leg(0.4, 0.6), ...leg(-0.38, -0.7), ...leg(0.38, -0.7),
    { geo: blob(0.75), color: P.fur, pos: [0, 1.08, -0.15], scale: [0.85, 0.78, 1.45] }, // barrel
    { geo: blob(0.64), color: P.furLight, pos: [0, 1.42, 0.52], scale: [1, 0.95, 0.9], shade: 0.35 }, // hunched shoulders
    { geo: blob(0.42), color: P.fur, pos: [0, 1.28, 1.18], scale: [0.95, 0.85, 1.05] }, // skull
    { geo: cone(0.25, 0.72, 5), color: P.furLight, pos: [0, 1.2, 1.7], rot: [Math.PI / 2, 0, 0], shade: 0.1 }, // muzzle
    { geo: cone(0.2, 0.6, 5), color: 0x2a2633, pos: [0, 0.98, 1.6], rot: [Math.PI / 2 - 0.3, 0, 0], shade: 0 }, // jaw
    ...[-0.12, 0.12].flatMap((x): Part[] => [
      { geo: cone(0.04, 0.2, 4), color: 0xf2ead8, pos: [x, 1.02, 1.86], rot: [Math.PI, 0, 0], shade: 0 }, // fangs
    ]),
    { geo: cone(0.14, 0.56, 4), color: P.fur, pos: [-0.28, 1.74, 1.08], rot: [-0.25, 0, 0.35], shade: 0 }, // ears
    { geo: cone(0.14, 0.56, 4), color: P.fur, pos: [0.28, 1.74, 1.08], rot: [-0.25, 0, -0.35], shade: 0 },
    { geo: cone(0.16, 1.2, 5), color: P.fur, pos: [0, 1.22, -1.5], rot: [-1.9, 0, 0], shade: 0.1 }, // tail
    ...spine,
  ];
}

const BUILDERS: Partial<Record<AssetId, () => Part[]>> = {
  tree_pine: pineParts,
  tree_oak: oakParts,
  tree_dead: deadTreeParts,
  rock: rockParts,
  boulder: boulderParts,
  thicket: thicketParts,
  ruin_wall: ruinWallParts,
  cache: cacheParts,
  standing_stone: standingStoneFallbackParts,
  crooked_house: crookedHouseParts,
  castle: castleParts,
  hero_light: lightHeroParts,
  hero_dark: darkHeroParts,
  monster_beast: monsterParts,
};

/**
 * Parts for one look-alike variant and level of detail of a prop kind, from
 * the richer settled-valley kit. Returns null for kinds that have no single
 * model (hedges, walls and fences are built to length by the region renderer).
 */
export function variantParts(kind: PropKind | 'field_oak', variant: number, lod: number): Part[] | null {
  if (kind in BUILDING_BUILDERS) return BUILDING_BUILDERS[kind as BuildingKind](variant);
  if (kind in FLORA_BUILDERS) return FLORA_BUILDERS[kind as FloraKind](variant, lod);
  if (kind in PROP_BUILDERS) return PROP_BUILDERS[kind as keyof typeof PROP_BUILDERS](variant);
  const legacy = BUILDERS[kind as AssetId];
  return legacy ? legacy() : null;
}

export class AssetLibrary {
  /** One material for every baked placeholder: vertex colours, faceted. */
  readonly stylized = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  readonly sources: Partial<Record<AssetId, 'glb' | 'procedural' | 'procedural-fallback'>> = {};
  private readonly geometries = new Map<AssetId, THREE.BufferGeometry>();
  private readonly imported = new Map<AssetId, THREE.Object3D>();

  /** Load every GLB in the manifest. A failed import falls back to its builder. */
  async load(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      (Object.entries(GLB_MODELS) as [AssetId, string][]).map(async ([id, url]) => {
        try {
          const gltf = await loader.loadAsync(import.meta.env.BASE_URL + url);
          gltf.scene.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            node.castShadow = true;
            node.receiveShadow = true;
            const material = node.material as THREE.Material;
            if (material instanceof THREE.MeshStandardMaterial) material.flatShading = true;
          });
          this.imported.set(id, gltf.scene);
          this.sources[id] = 'glb';
        } catch (error) {
          console.warn(`[assets] ${id}: could not import ${url}, using procedural fallback`, error);
          this.sources[id] = 'procedural-fallback';
        }
      }),
    );
  }

  /** Baked geometry of a procedural asset (shared; do not mutate). */
  geometry(id: AssetId): THREE.BufferGeometry {
    let geo = this.geometries.get(id);
    if (!geo) {
      const parts = BUILDERS[id]?.() ?? variantParts(id as PropKind, 0, 0);
      if (!parts) throw new Error(`[assets] ${id} has no model: it is drawn by the region renderer`);
      geo = bake(parts);
      this.geometries.set(id, geo);
    }
    return geo;
  }

  private readonly cached = new Map<string, THREE.BufferGeometry>();

  /** Baked geometry built on first use under a caller-chosen key (variants, levels of detail). */
  geometryFor(key: string, build: () => Part[]): THREE.BufferGeometry {
    let geo = this.cached.get(key);
    if (!geo) {
      geo = bake(build());
      this.cached.set(key, geo);
    }
    return geo;
  }

  /** Free every GPU buffer this library created (call when leaving a match). */
  dispose(): void {
    for (const geo of this.geometries.values()) geo.dispose();
    for (const geo of this.cached.values()) geo.dispose();
    this.geometries.clear();
    this.cached.clear();
    this.stylized.dispose();
  }

  /** A new scene object for the asset. */
  instantiate(id: AssetId): THREE.Object3D {
    const imported = this.imported.get(id);
    if (imported) return imported.clone(true);
    this.sources[id] ??= 'procedural';
    const pivots = LIMB_PIVOTS[id];
    const parts = pivots ? (BUILDERS[id]!() as RigPart[]) : null;
    const mesh = new THREE.Mesh(parts ? this.geometryFor(`${id}#body`, () => parts.filter((p) => !p.limb)) : this.geometry(id), this.stylized);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Characters keep their limbs as separate children so they can swing.
    for (const [limb, pivot] of Object.entries(pivots ?? {})) {
      const geo = this.geometryFor(`${id}#${limb}`, () => parts!.filter((p) => p.limb === limb)).clone().translate(-pivot[0], -pivot[1], -pivot[2]);
      const child = new THREE.Mesh(geo, this.stylized);
      child.position.set(...pivot);
      child.castShadow = true;
      child.name = limb;
      mesh.add(child);
    }
    return mesh;
  }
}
