/**
 * Placed props (buildings, trees, carts, stones...) drawn as instanced
 * meshes, grouped by map chunk so that whole groups are frustum-culled, with
 * a cheaper far model for trees. Also loose dressing and ground cover.
 *
 * Everything stands on the shared ground height. Ground cover is generated
 * here, on the client, from the map: it has no collider, is all well below
 * knee height, and so never looks like somewhere to hide.
 */
import * as THREE from 'three';
import { isBlocked } from '../../../shared/sim/geometry.ts';
import { boundsOf, type MapDef, type PropKind } from '../../../shared/sim/map.ts';
import type { RegionDef } from '../../../shared/sim/region.ts';
import { polylineNearest, valueNoise, type ChannelFeature } from '../../../shared/sim/terrain.ts';
import { variantParts, type AssetLibrary } from '../assets.ts';
import { FLORA_BUILDERS } from '../models/flora.ts';
import { coverParts, dressingParts, type CoverKind } from '../models/props.ts';

type Height = (x: number, z: number) => number;

/** Kinds drawn elsewhere (built to length, or not drawn at all). */
const NOT_INSTANCED = new Set<PropKind>(['hedge', 'stone_wall', 'terrace_wall', 'fence', 'bridge_parapet', 'ruin_fragment', 'water']);
/** How many look-alike variants each kind has. */
const VARIANTS: Partial<Record<PropKind, number>> = {
  tree_apple: 4, tree_apple_old: 3, tree_apple_young: 2, tree_apple_feral: 3, tree_witness: 4, tree_oldwood: 4, tree_birch: 3,
  tree_willow: 3, coppice_stool: 3, sapling: 3, tree_oak: 3, cottage_a: 3, cottage_b: 3, cottage_c: 3,
  cart: 2, barrel_stack: 2, crate_stack: 2, haystack: 2, log_pile: 2, boundary_stone: 4,
};
/** In this region the M0 oak placeholder is replaced by the richer field oak. */
const ALIAS: Partial<Record<PropKind, PropKind | 'field_oak'>> = { tree_oak: 'field_oak' };
const HAS_LOD = (kind: string): boolean => kind in FLORA_BUILDERS && kind !== 'sapling' && kind !== 'tree_apple_young';

interface LodPair {
  near: THREE.InstancedMesh;
  far: THREE.InstancedMesh | null;
  cx: number;
  cz: number;
}

export interface InstanceLayer {
  group: THREE.Group;
  /** Swap near and far tree models by distance from the camera. */
  update(camera: THREE.Vector3): void;
  counts: { props: number; dressing: number; cover: number };
}

function instanced(geo: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], name: string, shadow: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.name = name;
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildInstances(
  map: MapDef, region: RegionDef, assets: AssetLibrary, heightAt: Height,
  materials: { solid: THREE.Material; card: THREE.Material }, chunk: number, lodDistance: number,
): InstanceLayer {
  const group = new THREE.Group();
  group.name = 'instances';
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const compose = (x: number, y: number, z: number, yaw: number, sx: number, sy = sx, sz = sx) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new THREE.Vector3(sx, sy, sz));

  // --- Props -----------------------------------------------------------------
  const buckets = new Map<string, { kind: PropKind; variant: number; cx: number; cz: number; matrices: THREE.Matrix4[] }>();
  let propCount = 0;
  for (const prop of map.props) {
    if (NOT_INSTANCED.has(prop.kind)) continue;
    if (prop.kind === 'ruin_wall' && prop.collider.shape === 'obox') continue;
    const variant = (prop.variant ?? 0) % (VARIANTS[prop.kind] ?? 1);
    const ci = Math.floor(prop.x / chunk);
    const cj = Math.floor(prop.z / chunk);
    const key = `${prop.kind}:${variant}:${ci}:${cj}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = { kind: prop.kind, variant, cx: (ci + 0.5) * chunk, cz: (cj + 0.5) * chunk, matrices: [] }));
    const y = heightAt(prop.x, prop.z);
    if (prop.collider.shape === 'box' && (prop.kind === 'thicket' || prop.kind === 'ruin_wall')) {
      // M1 kit: modelled on a 2 x 2 footprint and stretched to the collider.
      bucket.matrices.push(compose(prop.x, y - 0.05, prop.z, 0, prop.collider.hx, 1, prop.collider.hz));
    } else {
      // Small vertical variety for trees; buildings and objects keep their true size.
      const isTree = prop.kind.startsWith('tree_') || prop.kind === 'coppice_stool' || prop.kind === 'sapling';
      const tall = isTree ? 0.92 + valueNoise(prop.x * 0.37, prop.z * 0.41, 7) * 0.22 : 1;
      bucket.matrices.push(compose(prop.x, y - (isTree ? 0.06 : 0.02), prop.z, prop.yaw, prop.scale, prop.scale * tall, prop.scale));
    }
    propCount++;
  }
  const lods: LodPair[] = [];
  for (const [key, b] of buckets) {
    const kind = ALIAS[b.kind] ?? b.kind;
    const near = assets.geometryFor(`${kind}:${b.variant}:0`, () => variantParts(kind, b.variant, 0)!);
    const nearMesh = instanced(near, materials.solid, b.matrices, key, true);
    group.add(nearMesh);
    let farMesh: THREE.InstancedMesh | null = null;
    if (HAS_LOD(kind)) {
      const far = assets.geometryFor(`${kind}:${b.variant}:1`, () => variantParts(kind, b.variant, 1)!);
      farMesh = instanced(far, materials.solid, b.matrices, `${key}:far`, true);
      farMesh.visible = false;
      group.add(farMesh);
    }
    lods.push({ near: nearMesh, far: farMesh, cx: b.cx, cz: b.cz });
  }

  // --- Dressing ----------------------------------------------------------------
  const dress = new Map<string, THREE.Matrix4[]>();
  region.dressing.forEach((d, i) => {
    const key = `${d.kind}:${i % 3}`;
    let list = dress.get(key);
    if (!list) dress.set(key, (list = []));
    list.push(compose(d.x, heightAt(d.x, d.z) - 0.01, d.z, d.yaw, d.scale));
  });
  for (const [key, list] of dress) {
    const [kind, variant] = key.split(':') as [RegionDef['dressing'][number]['kind'], string];
    const geo = assets.geometryFor(`dress:${key}`, () => dressingParts(kind, Number(variant)));
    group.add(instanced(geo, materials.solid, list, `dressing:${key}`, true));
  }

  // --- Ground cover ----------------------------------------------------------------
  const b = boundsOf(map);
  const channel = map.terrain?.features.find((f): f is ChannelFeature => f.type === 'channel');
  const cover = new Map<CoverKind, THREE.Matrix4[]>();
  const put = (kind: CoverKind, x: number, z: number, scale: number, yaw: number) => {
    let list = cover.get(kind);
    if (!list) cover.set(kind, (list = []));
    list.push(compose(x, heightAt(x, z) - 0.02, z, yaw, scale, scale * (0.8 + ((x * 7 + z * 3) % 1 + 1) % 1 * 0.5), scale));
  };
  let seed = 424242;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const onPath = (x: number, z: number, pad: number): boolean => {
    for (const path of region.paths) {
      if (path.kind === 'old_road') continue; // grass has taken the old road back
      const need = path.width / 2 + pad;
      for (let i = 0; i < path.points.length - 1; i++) {
        const a = path.points[i]!;
        const c = path.points[i + 1]!;
        const abx = c.x - a.x;
        const abz = c.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
        if (Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)) < need) return true;
      }
    }
    return false;
  };
  const patchAt = (x: number, z: number): string | null => {
    for (const p of region.patches) {
      const d = p.x2 === undefined || p.z2 === undefined
        ? Math.hypot(x - p.x, z - p.z)
        : (() => {
            const abx = p.x2 - p.x;
            const abz = p.z2 - p.z;
            const t = Math.max(0, Math.min(1, ((x - p.x) * abx + (z - p.z) * abz) / (abx * abx + abz * abz || 1)));
            return Math.hypot(x - (p.x + abx * t), z - (p.z + abz * t));
          })();
      if (d < p.radius * 0.85) return p.kind;
    }
    return null;
  };
  const step = 1.55;
  for (let gz = b.minZ - 8; gz < b.maxZ + 8; gz += step) {
    for (let gx = b.minX - 8; gx < b.maxX + 8; gx += step) {
      const x = gx + (rnd() - 0.5) * step;
      const z = gz + (rnd() - 0.5) * step;
      const roll = rnd();
      const yaw = rnd() * Math.PI * 2;
      const size = 0.8 + rnd() * 0.7;
      const inside = x > b.minX + 0.3 && x < b.maxX - 0.3 && z > b.minZ + 0.3 && z < b.maxZ - 0.3;
      const river = channel ? polylineNearest(channel.points, x, z) : null;
      if (river && channel && river.dist < channel.halfWidth + 2.4) {
        // Reeds on the banks, in the shallows; none on the ford or under the bridge.
        const ford = channel.fords.some((f) => Math.abs(river.along - f.along) < f.halfLength + 2);
        const deck = map.terrain!.features.some((f) => f.type === 'deck' && Math.hypot(x - f.x, z - f.z) < f.hx);
        if (!ford && !deck && river.dist > channel.halfWidth - 0.9 && roll < 0.75) put('reed', x, z, size * 1.15, yaw);
        else if (ford && roll < 0.2) put('pebble', x, z, size, yaw);
        continue;
      }
      if (inside && isBlocked(map, x, z, 0.12)) continue;
      const patch = patchAt(x, z);
      if (patch === 'cobbles' || patch === 'garden') continue;
      if (onPath(x, z, 0.1)) {
        if (roll < 0.05) put('pebble', x, z, size, yaw);
        continue;
      }
      if (patch === 'village_yard') {
        if (roll < 0.12) put('grass_tuft', x, z, size * 0.8, yaw);
        continue;
      }
      if (patch === 'oldwood_floor' || patch === 'coppice_floor') {
        if (roll < 0.34) put('fern', x, z, size * 1.2, yaw);
        else if (roll < 0.4) put('mushroom', x, z, size, yaw);
        else if (roll < 0.52) put('grass_tuft', x, z, size * 0.9, yaw);
        continue;
      }
      const lush = valueNoise(x / 9, z / 9, 31);
      if (patch === 'meadow' || patch === 'hay_field') {
        if (roll < 0.5) put('grass_tuft', x, z, size * 1.2, yaw);
        else if (roll < 0.86) put((['flower_white', 'flower_yellow', 'flower_violet', 'flower_red'] as const)[Math.floor(rnd() * 4)]!, x, z, size, yaw);
        continue;
      }
      if (roll < 0.34 + lush * 0.4) put('grass_tuft', x, z, size, yaw);
      else if (roll > 0.955) put((['flower_white', 'flower_yellow', 'flower_white', 'flower_violet'] as const)[Math.floor(rnd() * 4)]!, x, z, size, yaw);
    }
  }
  // Windfalls under the bearing trees.
  for (const prop of map.props) {
    if (prop.kind !== 'tree_apple' && prop.kind !== 'tree_apple_old') continue;
    for (let k = 0; k < 2; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.8 + rnd() * 1.6;
      put('windfall', prop.x + Math.cos(a) * d, prop.z + Math.sin(a) * d, 1, a);
    }
  }
  let coverCount = 0;
  for (const [kind, list] of cover) {
    coverCount += list.length;
    const geo = assets.geometryFor(`cover:${kind}`, () => coverParts(kind));
    const flat = kind === 'grass_tuft' || kind === 'reed' || kind === 'fern' || kind.startsWith('flower');
    const mesh = instanced(geo, flat ? materials.card : materials.solid, list, `cover:${kind}`, false);
    group.add(mesh);
  }

  const lod2 = lodDistance * lodDistance;
  return {
    group,
    counts: { props: propCount, dressing: region.dressing.length, cover: coverCount },
    update: (camera) => {
      for (const pair of lods) {
        if (!pair.far) continue;
        const dx = camera.x - pair.cx;
        const dz = camera.z - pair.cz;
        const near = dx * dx + camera.y * camera.y + dz * dz < lod2;
        pair.near.visible = near;
        pair.far.visible = !near;
      }
    },
  };
}
