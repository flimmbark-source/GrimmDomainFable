/**
 * Everything that is built to length rather than placed: hedges, drystone
 * walls, terrace retaining walls, fences, ruined walls, and the stone bridge.
 *
 * Each piece is generated from its collider (an oriented box) or, for the
 * bridge, from the shared deck feature, and follows the shared ground height
 * module by module. The drawn barrier therefore occupies the collider, no
 * more and no less: a hedge you can see is a hedge that hides you.
 */
import * as THREE from 'three';
import type { MapDef, PropDef } from '../../../shared/sim/map.ts';
import { surfaceHeight, type ChannelFeature, type DeckFeature } from '../../../shared/sim/terrain.ts';
import { bake } from '../bake.ts';
import { Model, Rand } from '../modelkit.ts';
import { VALE as C } from '../palette.ts';

type Height = (x: number, z: number) => number;

/** Walk an oriented box collider in modules of about `step` metres. */
function modules(prop: PropDef, step: number, fn: (x: number, z: number, len: number, i: number, n: number) => void): { ux: number; uz: number; yaw: number; hz: number } | null {
  const c = prop.collider;
  if (c.shape !== 'obox') return null;
  const n = Math.max(1, Math.round((c.hx * 2) / step));
  const len = (c.hx * 2) / n;
  for (let i = 0; i < n; i++) {
    const t = -c.hx + (i + 0.5) * len;
    fn(prop.x + c.ux * t, prop.z + c.uz * t, len, i, n);
  }
  return { ux: c.ux, uz: c.uz, yaw: Math.atan2(-c.uz, c.ux), hz: c.hz };
}

function hedge(m: Model, prop: PropDef, h: Height, r: Rand): void {
  const c = prop.collider;
  if (c.shape !== 'obox') return;
  const yaw = Math.atan2(-c.uz, c.ux);
  const w = c.hz;
  modules(prop, 1.3, (x, z, len, i) => {
    const y = h(x, z);
    const tall = 2.35 + r.range(-0.12, 0.3);
    const cols = [C.hedge, C.hedgeDark, C.hedgeLight, C.bramble];
    m.at([x, y, z], yaw + r.range(-0.08, 0.08), () => {
      // Dense body from the ground up: this is solid cover.
      m.lump(0.62, cols[i % 2]!, { p: [0, 0.55, 0], s: [len * 0.98, 1.05, w * 1.42], soft: true, shade: 0.5, sway: 0.015, tip: C.hedge }, 0, i * 7 + 1, 0.22);
      m.lump(0.6, cols[(i + 1) % 4]!, { p: [r.range(-0.1, 0.1), 1.45, r.range(-0.08, 0.08)], s: [len * 0.95, 1.05, w * 1.3], soft: true, shade: 0.35, sway: 0.03, tip: C.hedgeLight }, 1, i * 7 + 2, 0.2);
      m.lump(0.45, i % 3 ? C.hedgeLight : C.hedge, { p: [r.range(-0.2, 0.2), tall - 0.3, r.range(-0.1, 0.1)], s: [len * 1.1, 0.75, w * 1.15], soft: true, shade: 0.2, sway: 0.06, tip: C.appleLight }, 0, i * 7 + 3, 0.25);
      // Now and then a hazel rod, a dog rose, a blackberry.
      if (r.chance(0.2)) m.post(0.03, 0.045, tall + 0.7, C.bark, { p: [r.range(-0.3, 0.3), 0, 0], r: [r.range(-0.2, 0.2), 0, r.range(-0.2, 0.2)], sway: 0.04 }, 4);
      if (r.chance(0.35)) {
        for (let k = 0; k < 3; k++) {
          m.lump(0.07, r.chance(0.5) ? C.flowerWhite : C.flowerRed, { p: [r.range(-0.4, 0.4), r.range(0.7, 2.0), (r.chance(0.5) ? 1 : -1) * w * 0.86], soft: true, shade: 0 }, 0, k);
        }
      }
    });
  });
}

function stoneWall(m: Model, prop: PropDef, h: Height, r: Rand): void {
  const c = prop.collider;
  if (c.shape !== 'obox') return;
  const yaw = Math.atan2(-c.uz, c.ux);
  const w = c.hz * 2;
  modules(prop, 0.95, (x, z, len, i) => {
    const y = h(x, z);
    const top = 0.92 + r.range(-0.06, 0.1);
    m.at([x, y, z], yaw, () => {
      m.taper(len + 0.03, w + 0.06, len + 0.03, w - 0.14, top + 0.3, i % 2 ? C.stone : C.stoneWarm, { p: [0, -0.3, 0], mottle: C.stoneDark, shade: 0.35 });
      // Cope stones set on edge.
      for (let k = 0; k < 2; k++) {
        m.box(len * 0.46, 0.26 + r.range(0, 0.08), w * 0.78, k ? C.stoneWarm : C.stone, { p: [(k - 0.5) * len * 0.5, top + 0.1, 0], r: [0, r.range(-0.12, 0.12), r.range(-0.2, 0.2)], mottle: C.moss, shade: 0.1 });
      }
      if (r.chance(0.12)) m.lump(0.24, C.moss, { p: [0, top * 0.5, w * 0.5], s: [1.4, 1, 0.4], soft: true }, 0, i);
    });
  });
}

/** Retaining wall: stands on the lower ground and reaches the upper level. */
function terraceWall(m: Model, prop: PropDef, h: Height, r: Rand): void {
  const c = prop.collider;
  if (c.shape !== 'obox') return;
  const yaw = Math.atan2(-c.uz, c.ux);
  const w = c.hz * 2;
  // Across-wall direction.
  const nx = -c.uz;
  const nz = c.ux;
  modules(prop, 1.0, (x, z, len, i) => {
    const a = h(x + nx * (c.hz + 0.25), z + nz * (c.hz + 0.25));
    const b = h(x - nx * (c.hz + 0.25), z - nz * (c.hz + 0.25));
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const height = hi - lo + 0.32 + r.range(0, 0.08);
    m.at([x, lo, z], yaw, () => {
      m.taper(len + 0.04, w + 0.1, len + 0.04, w - 0.08, height + 0.5, i % 3 ? C.stoneWarm : C.stone, { p: [0, -0.5, 0], mottle: C.stoneDark, shade: 0.4 });
      m.box(len * 0.98, 0.16, w + 0.06, C.stone, { p: [0, height + 0.04, 0], r: [0, 0, r.range(-0.04, 0.04)], mottle: C.moss, shade: 0.05 });
      if (r.chance(0.18)) m.lump(0.3, C.hedgeLight, { p: [r.range(-0.3, 0.3), height + 0.1, 0], s: [1.2, 0.5, 0.9], soft: true, sway: 0.1 }, 0, i);
      if (r.chance(0.1)) m.lump(0.2, C.moss, { p: [0, height * 0.5, w * 0.5], s: [1.5, 1.2, 0.3], soft: true }, 0, i + 3);
    });
  });
}

function fence(m: Model, prop: PropDef, h: Height, r: Rand): void {
  const c = prop.collider;
  if (c.shape !== 'obox') return;
  const yaw = Math.atan2(-c.uz, c.ux);
  let prevY: number | null = null;
  modules(prop, 2.0, (x, z, len, i, n) => {
    const y0 = h(x - c.ux * len * 0.5, z - c.uz * len * 0.5);
    const y1 = h(x + c.ux * len * 0.5, z + c.uz * len * 0.5);
    const y = (y0 + y1) / 2;
    const slope = Math.atan2(y1 - y0, len);
    m.at([x, y, z], yaw, () => {
      m.post(0.07, 0.085, 1.25 + r.range(-0.05, 0.1), C.timberPale, { p: [-len / 2, y0 - y - 0.1, 0], r: [r.range(-0.05, 0.05), 0, r.range(-0.05, 0.05)], shade: 0.2 }, 5);
      if (i === n - 1) m.post(0.07, 0.085, 1.25, C.timberPale, { p: [len / 2, y1 - y - 0.1, 0], shade: 0.2 }, 5);
      for (const ry of [0.45, 0.92]) m.box(len + 0.1, 0.09, 0.05, i % 2 ? C.boardGrey : C.timberPale, { p: [0, ry + r.range(-0.02, 0.02), 0.03], r: [0, 0, slope + r.range(-0.015, 0.015)], shade: 0.05 });
    });
    prevY = y;
  });
  void prevY;
}

/** Ruined wall. `tall` pieces are well over head height (they are cover); low ones are rubble. */
function ruin(m: Model, prop: PropDef, h: Height, r: Rand, tall: boolean): void {
  const c = prop.collider;
  if (c.shape !== 'obox') return;
  const yaw = Math.atan2(-c.uz, c.ux);
  const w = c.hz * 2;
  modules(prop, 0.85, (x, z, len, i, n) => {
    const y = h(x, z);
    const edge = Math.min(i, n - 1 - i);
    const height = tall ? 2.5 + r.range(0, 1.3) + Math.min(edge, 2) * 0.25 : 0.45 + r.range(0, 0.75);
    m.at([x, y, z], yaw, () => {
      m.taper(len + 0.03, w, len + 0.03, w - 0.1, height + 0.4, i % 2 ? C.stone : C.stoneDark, { p: [0, -0.4, 0], mottle: C.plasterStain, shade: 0.4 });
      // Patches of the old limewash still clinging on.
      if (tall && r.chance(0.5)) m.box(len * 0.9, height * 0.4, 0.05, C.plasterGrey, { p: [0, height * r.range(0.35, 0.6), w * 0.5], mottle: C.stone, shade: 0.2 });
      m.box(len * 0.6, 0.22, w * 0.8, C.stoneWarm, { p: [r.range(-0.1, 0.1), height + 0.08, 0], r: [0, r.range(-0.3, 0.3), r.range(-0.15, 0.15)], mottle: C.moss, shade: 0.1 });
      if (r.chance(0.3)) m.lump(0.34, C.ivy, { p: [0, height * r.range(0.4, 0.95), w * 0.45 * (r.chance(0.5) ? 1 : -1)], s: [1.2, 1.5, 0.5], soft: true, shade: 0.4, sway: 0.03 }, 0, i);
      if (r.chance(0.25)) m.lump(0.3, C.stoneDark, { p: [r.range(-0.3, 0.3), 0.08, w * 0.9 * (r.chance(0.5) ? 1 : -1)], s: [1, 0.5, 1], shade: 0.2 }, 0, i + 5, 0.2);
    });
  });
}

/**
 * The stone bridge, from the shared deck feature: two arches on a central
 * pier with cutwaters, a cobbled crown, parapets with cope stones. The
 * walking surface is surfaceHeight(), so feet and stones agree.
 */
function bridge(m: Model, map: MapDef, deck: DeckFeature, channel: ChannelFeature | undefined, parapetHalf: number): void {
  const yaw = Math.atan2(-deck.uz, deck.ux);
  const water = channel?.waterY ?? -1;
  const bed = channel?.bedY ?? -2;
  const slices = 60;
  const dl = (deck.hx * 2) / slices;
  const width = deck.hz * 2 + 0.6;
  const deckY = (lx: number) => surfaceHeight(map, deck.x + deck.ux * lx, deck.z + deck.uz * lx);
  // Underside: two segmental arches springing just above the water.
  const span = 2.5;
  const centres = [-3.15, 3.15];
  const soffit = (lx: number): number => {
    for (const c of centres) {
      const d = Math.abs(lx - c);
      if (d < span) return water + 0.15 + Math.sqrt(1 - (d / span) * (d / span)) * 1.15;
    }
    return bed - 0.6;
  };
  m.at([deck.x, 0, deck.z], yaw, () => {
    for (let i = 0; i < slices; i++) {
      const lx = -deck.hx + (i + 0.5) * dl;
      const top = deckY(lx);
      const slope = Math.atan2(deckY(lx + dl / 2) - deckY(lx - dl / 2), dl);
      const bottom = Math.min(soffit(lx), top - 0.45);
      m.box(dl + 0.02, top - bottom, width, i % 3 ? C.stone : C.stoneWarm, { p: [lx, (top + bottom) / 2 - 0.04, 0], mottle: C.stoneWet, shade: 0.35 });
      // Cobbled roadway, tilted to the curve of the deck.
      m.box(dl + 0.04, 0.1, deck.hz * 2, C.cobble, { p: [lx, top - 0.03, 0], r: [0, 0, slope], mottle: C.cobbleDark, shade: 0 });
      if (Math.abs(lx) <= parapetHalf) {
        for (const s of [-1, 1]) {
          const pz = s * (deck.hz + 0.15);
          m.box(dl + 0.03, 0.95, 0.3, i % 2 ? C.stoneWarm : C.stone, { p: [lx, top + 0.45, pz], r: [0, 0, slope], mottle: C.stoneDark, shade: 0.25 });
          if (i % 2 === 0) m.box(dl * 1.7, 0.16, 0.42, C.stone, { p: [lx + dl / 2, top + 0.98, pz], r: [0, 0, slope], mottle: C.moss, shade: 0 });
        }
      }
    }
    for (const s of [-1, 1]) {
      const face = s * (width / 2 + 0.03);
      // Arch rings (voussoirs) standing a little proud of the face.
      for (const c of centres) {
        for (let k = 0; k <= 10; k++) {
          const a = Math.PI * (k / 10);
          const vx = c - Math.cos(a) * (span + 0.14);
          const vy = water + 0.15 + Math.sin(a) * (1.15 + 0.14);
          m.box(0.42, 0.34, 0.12, k === 5 ? C.plasterGrey : C.stoneWarm, { p: [vx, vy, face], r: [0, 0, -(a - Math.PI / 2) * 0.82], shade: 0.1 });
        }
      }
      // Cutwaters on the pier, pointed up- and downstream.
      m.prism(1.4, 1.5, 3.2, C.stoneWet, { p: [0, bed - 0.4, s * (width / 2 + 0.7)], r: [s * Math.PI / 2, 0, 0], mottle: C.stoneDark, shade: 0.3 });
      // End posts.
      for (const e of [-1, 1]) {
        const lx = e * parapetHalf;
        m.block(0.55, 1.5, 0.55, C.stoneWarm, { p: [lx, deckY(lx) - 0.2, s * (deck.hz + 0.15)], mottle: C.stone, shade: 0.25 });
        m.block(0.7, 0.14, 0.7, C.stone, { p: [lx, deckY(lx) + 1.3, s * (deck.hz + 0.15)], shade: 0 });
      }
      // Ivy and stains below the parapet.
      m.lump(0.5, C.ivy, { p: [-6.2, deckY(-6.2) - 0.5, face], s: [1.6, 1.4, 0.3], soft: true, shade: 0.4 }, 0, 3);
      m.lump(0.4, C.moss, { p: [5.6, deckY(5.6) - 0.6, face], s: [1.8, 0.9, 0.3], soft: true, shade: 0.3 }, 0, 4);
    }
  });
}

export interface StaticBatch {
  group: THREE.Group;
  dispose(): void;
}

/** Build every linear barrier and the bridge into a few merged meshes, one per map chunk. */
export function buildBarriers(map: MapDef, heightAt: Height, material: THREE.Material, chunk: number): StaticBatch {
  const group = new THREE.Group();
  group.name = 'barriers';
  const models = new Map<string, Model>();
  // Hedges are batched apart from masonry: like tree crowns they are coarse
  // meshes with smooth normals, and receiving the shadow map would print their
  // own facets back onto them. They still cast shadows.
  const modelFor = (x: number, z: number, layer = 'stone'): Model => {
    const key = `${layer}:${Math.floor(x / chunk)}:${Math.floor(z / chunk)}`;
    let m = models.get(key);
    if (!m) models.set(key, (m = new Model()));
    return m;
  };
  map.props.forEach((prop, index) => {
    const r = new Rand(index * 31 + 7);
    const m = modelFor(prop.x, prop.z, prop.kind === 'hedge' ? 'hedge' : 'stone');
    if (prop.kind === 'hedge') hedge(m, prop, heightAt, r);
    else if (prop.kind === 'stone_wall') stoneWall(m, prop, heightAt, r);
    else if (prop.kind === 'terrace_wall') terraceWall(m, prop, heightAt, r);
    else if (prop.kind === 'fence') fence(m, prop, heightAt, r);
    else if (prop.kind === 'ruin_wall' && prop.collider.shape === 'obox') ruin(m, prop, heightAt, r, true);
    else if (prop.kind === 'ruin_fragment') ruin(m, prop, heightAt, r, false);
  });
  const channel = map.terrain?.features.find((f): f is ChannelFeature => f.type === 'channel');
  for (const f of map.terrain?.features ?? []) {
    if (f.type !== 'deck') continue;
    const parapet = map.props.find((p) => p.kind === 'bridge_parapet');
    const half = parapet && parapet.collider.shape === 'obox' ? parapet.collider.hx : f.hx - 1;
    bridge(modelFor(f.x, f.z), map, f, channel, half);
  }
  const geometries: THREE.BufferGeometry[] = [];
  for (const [key, m] of models) {
    if (m.parts.length === 0) continue;
    const geo = bake(m.parts);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = !key.startsWith('hedge');
    mesh.name = `barriers:${key}`;
    group.add(mesh);
  }
  return { group, dispose: () => geometries.forEach((g) => g.dispose()) };
}
