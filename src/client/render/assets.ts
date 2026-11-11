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
import { bake, type Part } from './bake.ts';
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

function lightHeroParts(): Part[] {
  return [
    { geo: cyl(0.2, 0.24, 0.55, 6), color: P.leather, pos: [-0.24, 0.28, 0] },
    { geo: cyl(0.2, 0.24, 0.55, 6), color: P.leather, pos: [0.24, 0.28, 0] },
    { geo: cyl(0.42, 0.56, 0.95, 8), color: P.lightTeam, pos: [0, 0.95, 0] },
    { geo: cyl(0.58, 0.58, 0.14, 8), color: P.lightTeamTrim, pos: [0, 0.72, 0], shade: 0 },
    // Oversized head and hands: readable from the high camera.
    { geo: blob(0.46), color: P.skin, pos: [0, 1.82, 0.04], shade: 0.15 },
    { geo: cone(0.66, 1.0, 7), color: P.lightTeam, pos: [0, 2.22, -0.14], rot: [-0.3, 0, 0], shade: 0.15 },
    { geo: blob(0.2, 0), color: P.skin, pos: [-0.68, 0.95, 0.12], shade: 0.1 },
    { geo: blob(0.2, 0), color: P.skin, pos: [0.68, 0.95, 0.12], shade: 0.1 },
    { geo: cyl(0.14, 0.17, 0.6, 6), color: P.lightTeam, pos: [-0.56, 1.2, 0.04], rot: [0, 0, -0.5] },
    { geo: cyl(0.14, 0.17, 0.6, 6), color: P.lightTeam, pos: [0.56, 1.2, 0.04], rot: [0, 0, 0.5] },
    { geo: box(0.55, 0.6, 0.3), color: P.leather, pos: [0, 1.1, -0.48] },
    { geo: box(0.1, 0.1, 0.22), color: P.skin, pos: [0, 1.78, 0.5], shade: 0 }, // nose = facing cue
  ];
}

function darkHeroParts(): Part[] {
  return [
    { geo: cone(0.72, 1.7, 8), color: P.darkTeamTrim, pos: [0, 0.85, 0], shade: 0.4 },
    { geo: cyl(0.4, 0.55, 0.9, 8), color: P.darkTeam, pos: [0, 1.45, 0] },
    { geo: blob(0.38, 0), color: P.steel, pos: [-0.62, 1.85, 0], scale: [1.2, 0.8, 1] },
    { geo: blob(0.38, 0), color: P.steel, pos: [0.62, 1.85, 0], scale: [1.2, 0.8, 1] },
    { geo: blob(0.4), color: P.darkTeamTrim, pos: [0, 2.3, 0.02], shade: 0.1 },
    { geo: cone(0.13, 0.85, 5), color: P.steel, pos: [-0.38, 2.82, 0], rot: [0, 0, 0.55], shade: 0 },
    { geo: cone(0.13, 0.85, 5), color: P.steel, pos: [0.38, 2.82, 0], rot: [0, 0, -0.55], shade: 0 },
    { geo: box(0.5, 0.09, 0.12), color: P.eyeGlow, pos: [0, 2.32, 0.36], shade: 0 }, // visor = facing cue
    { geo: box(1.3, 1.9, 0.12), color: P.darkTeam, pos: [0, 1.25, -0.42], rot: [0.16, 0, 0], shade: 0.5 },
  ];
}

function monsterParts(): Part[] {
  const leg = (x: number, z: number): Part => ({ geo: cyl(0.14, 0.2, 0.8, 5), color: P.fur, pos: [x, 0.4, z] });
  return [
    leg(-0.38, 0.6), leg(0.38, 0.6), leg(-0.36, -0.65), leg(0.36, -0.65),
    { geo: blob(0.75), color: P.fur, pos: [0, 1.05, -0.1], scale: [0.85, 0.8, 1.45] },
    { geo: blob(0.62), color: P.furLight, pos: [0, 1.4, 0.55], scale: [0.95, 0.95, 0.9], shade: 0.35 }, // hunched shoulders
    { geo: blob(0.42), color: P.fur, pos: [0, 1.25, 1.2], scale: [0.9, 0.85, 1.1] },
    { geo: cone(0.24, 0.7, 5), color: P.furLight, pos: [0, 1.12, 1.72], rot: [Math.PI / 2, 0, 0], shade: 0.1 },
    { geo: cone(0.13, 0.5, 4), color: P.fur, pos: [-0.26, 1.72, 1.1], rot: [-0.2, 0, 0.3], shade: 0 },
    { geo: cone(0.13, 0.5, 4), color: P.fur, pos: [0.26, 1.72, 1.1], rot: [-0.2, 0, -0.3], shade: 0 },
    { geo: cone(0.16, 1.1, 5), color: P.fur, pos: [0, 1.2, -1.45], rot: [-1.9, 0, 0], shade: 0.1 },
    { geo: cone(0.1, 0.5, 4), color: P.furLight, pos: [0, 1.85, 0.2], rot: [-0.5, 0, 0], shade: 0 },
    { geo: cone(0.1, 0.45, 4), color: P.furLight, pos: [0, 1.72, -0.25], rot: [-0.6, 0, 0], shade: 0 },
  ];
}

const BUILDERS: Record<AssetId, () => Part[]> = {
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
      geo = bake(BUILDERS[id]());
      this.geometries.set(id, geo);
    }
    return geo;
  }

  /** A new scene object for the asset. */
  instantiate(id: AssetId): THREE.Object3D {
    const imported = this.imported.get(id);
    if (imported) return imported.clone(true);
    this.sources[id] ??= 'procedural';
    const mesh = new THREE.Mesh(this.geometry(id), this.stylized);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
