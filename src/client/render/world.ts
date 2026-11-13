/**
 * Static scenery built from the shared MapDef: terrain, paths, every prop the
 * simulation collides with, plus non-collidable backdrop (outer forest, hills,
 * distant castle, sky). Nothing here affects gameplay.
 */
import * as THREE from 'three';
import { boundsOf, type MapDef, type Point } from '../../shared/sim/map.ts';
import type { AssetId, AssetLibrary } from './assets.ts';
import { hash2, smoothNoise } from './bake.ts';
import { PALETTE as P } from './palette.ts';

function distToSegment(px: number, pz: number, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / len2));
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

/** Terrain height: flat where the game is played, rolling hills beyond. */
export function terrainHeight(map: MapDef, x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z)) - (map.halfSize + 2);
  if (edge <= 0) return 0;
  const rise = Math.min(edge / 40, 1);
  const hills = smoothNoise(x * 0.035 + 11, z * 0.035 + 5) * 9 + smoothNoise(x * 0.09, z * 0.09) * 2.5;
  // Raise the land towards the castle so it sits above the tree line.
  const castleHill = z < 0 ? Math.min(-z / 230, 1) * 14 * rise : 0;
  // Keep the road to the castle in a shallow valley so the view stays open.
  const valley = z < 0 ? Math.min(Math.abs(x - 5) / 30, 1) : 1;
  return rise * rise * hills * (0.25 + 0.75 * valley) + castleHill;
}

function buildGround(map: MapDef): THREE.Mesh {
  // One mesh, non-uniform grid: ~0.75 m cells where the game is played (crisp
  // paths), stretching to coarse cells out at the horizon.
  const segments = 160;
  const geo = new THREE.PlaneGeometry(2, 2, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const warp = (u: number) => Math.sign(u) * (Math.abs(u) * 60 + Math.abs(u) ** 4 * 400);
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, warp(pos.getX(i)), 0, warp(pos.getZ(i)));
  const colors = new Float32Array(pos.count * 3);
  const grassA = new THREE.Color(P.grassLight);
  const grassB = new THREE.Color(P.grassDark);
  const deep = new THREE.Color(P.grassDeep);
  const dirtA = new THREE.Color(P.dirt);
  const dirtB = new THREE.Color(P.dirtDark);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(map, x, z));

    // Broad painterly patches of light/dark grass.
    const patch = smoothNoise(x * 0.11 + 3, z * 0.11 + 7) * 0.7 + smoothNoise(x * 0.37, z * 0.37) * 0.3;
    c.copy(grassB).lerp(grassA, patch);

    // Darken towards and beyond the clearing edge (forest shade).
    const edge = (Math.max(Math.abs(x), Math.abs(z)) - (map.halfSize - 7)) / 10;
    if (edge > 0) c.lerp(deep, Math.min(edge, 1) * 0.85);

    // Dirt paths with a ragged border.
    let pathBlend = 0;
    for (const path of map.paths) {
      for (let s = 0; s < path.points.length - 1; s++) {
        const d = distToSegment(x, z, path.points[s]!, path.points[s + 1]!);
        const ragged = path.width / 2 + (smoothNoise(x * 0.6, z * 0.6) - 0.5) * 1.2;
        pathBlend = Math.max(pathBlend, 1 - Math.max(0, Math.min(1, (d - ragged + 0.7) / 0.7)));
      }
    }
    if (pathBlend > 0) {
      const dirt = dirtB.clone().lerp(dirtA, smoothNoise(x * 0.5 + 9, z * 0.5));
      c.lerp(dirt, pathBlend);
    }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  ground.name = 'ground';
  return ground;
}

function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(P.skyTop);
  const mid = new THREE.Color(P.skyMid);
  const horizon = new THREE.Color(P.skyHorizon);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) / 900);
    if (h < 0.18) c.copy(horizon).lerp(mid, h / 0.18);
    else c.copy(mid).lerp(top, Math.min((h - 0.18) / 0.5, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'sky';
  return sky;
}

/** Dense non-collidable forest ring around the playable clearing (instanced). */
function buildBackdropForest(map: MapDef, assets: AssetLibrary): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'backdrop-forest';
  const kinds: AssetId[] = ['tree_pine', 'tree_oak', 'tree_dead'];
  const placements: THREE.Matrix4[][] = [[], [], []];
  const inner = map.halfSize + 1.5;
  const outer = map.halfSize + 50;
  const step = 4.1;
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let gx = -outer; gx <= outer; gx += step) {
    for (let gz = -outer; gz <= outer; gz += step) {
      const jx = gx + (hash2(gx, gz) - 0.5) * 3;
      const jz = gz + (hash2(gz + 40, gx - 17) - 0.5) * 3;
      const ring = Math.max(Math.abs(jx), Math.abs(jz));
      if (ring < inner || ring > outer) continue;
      // The strategy camera looks north from the south side: keep the southern
      // tree line back and low so it never hides the playable area.
      const south = jz > map.halfSize;
      if (south && jz < map.halfSize + 8) continue;
      // Keep the path gates open and leave a vista along the road to the castle.
      const corridor = jz < 0 ? 9 : 3;
      const onPath = map.paths.some((p) =>
        p.points.some((a, i) => {
          const b = p.points[i + 1];
          return b !== undefined && distToSegment(jx, jz, a, b) < corridor;
        }),
      );
      if (onPath) continue;
      const pick = hash2(jx * 1.7, jz * 1.3);
      if (ring > inner + 18 && pick > 0.5) continue;
      const kind = pick < 0.7 ? 0 : pick < 0.9 ? 1 : 2;
      const s = south ? 1.0 + hash2(jz, jx) * 0.3 : 1.1 + hash2(jz, jx) * 0.9;
      q.setFromAxisAngle(up, hash2(jx + 5, jz + 9) * Math.PI * 2);
      placements[kind]!.push(
        new THREE.Matrix4().compose(new THREE.Vector3(jx, terrainHeight(map, jx, jz) - 0.1, jz), q, new THREE.Vector3(s, s * (0.9 + pick * 0.4), s)),
      );
    }
  }
  kinds.forEach((kind, k) => {
    const list = placements[k]!;
    const mesh = new THREE.InstancedMesh(assets.geometry(kind), assets.stylized, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false; // far outside the shadow frustum
    mesh.receiveShadow = false;
    mesh.name = `backdrop-${kind}`;
    group.add(mesh);
  });
  return group;
}

function buildCastle(map: MapDef, assets: AssetLibrary): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'landmarks';
  for (const landmark of map.landmarks) {
    const castle = assets.instantiate('castle');
    castle.castShadow = false;
    const y = terrainHeight(map, landmark.x, landmark.z);
    castle.position.set(landmark.x, y - 2, landmark.z);
    castle.scale.setScalar(1.5);
    group.add(castle);

    // A few lit windows so the silhouette reads as inhabited and hostile.
    const glow = new THREE.MeshBasicMaterial({ color: P.castleGlow, fog: false });
    const windows: [number, number, number][] = [[3, 44, 3], [-13, 62, -4], [20, 78, -8], [-34, 38, 12], [35, 28, 12], [0, 12, 18]];
    for (const [wx, wy, wz] of windows) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4), glow);
      pane.position.set(landmark.x + wx, y + wy, landmark.z + wz + 6);
      group.add(pane);
    }
    const moon = new THREE.Mesh(new THREE.CircleGeometry(26, 32), new THREE.MeshBasicMaterial({ color: P.moon, fog: false }));
    moon.position.set(landmark.x - 95, y + 150, landmark.z - 420);
    group.add(moon);
  }
  return group;
}

export interface World {
  root: THREE.Group;
  ground: THREE.Mesh;
  sun: THREE.DirectionalLight;
  fastShadows?: { value: boolean };
  /** Height of the walking surface (ground or bridge deck) at a ground point. */
  heightAt(x: number, z: number): number;
  /** Per-frame cosmetic animation (wind, water, shadows following the view). */
  update?(dt: number, camera: THREE.Camera, lookAt: THREE.Vector3, mode: 'rts' | 'hero'): void;
  stats?(): Record<string, number>;
  dispose?(): void;
}

export function buildWorld(scene: THREE.Scene, map: MapDef, assets: AssetLibrary): World {
  const root = new THREE.Group();
  root.name = `map:${map.id}`;

  scene.fog = new THREE.Fog(P.fog, 60, 430);
  scene.background = new THREE.Color(P.fog);
  root.add(buildSky());

  root.add(new THREE.HemisphereLight(P.ambientSky, P.ambientGround, 1.5));
  const sun = new THREE.DirectionalLight(P.sun, 2.6);
  sun.position.set(-26, 44, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = map.halfSize + 6;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 140 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  root.add(sun, sun.target);

  const ground = buildGround(map);
  root.add(ground);

  const props = new THREE.Group();
  props.name = 'props';
  for (const prop of map.props) {
    const object = assets.instantiate(prop.kind);
    object.position.set(prop.x, 0, prop.z);
    object.rotation.y = prop.yaw;
    // Hedges and walls are modelled on a 2 x 2 footprint and stretched to the
    // collider, so the visible shape is exactly what blocks movement and sight.
    if (prop.collider.shape === 'box' && (prop.kind === 'thicket' || prop.kind === 'ruin_wall')) {
      object.scale.set(prop.collider.hx, 1, prop.collider.hz);
    } else {
      object.scale.setScalar(prop.scale);
    }
    object.name = prop.kind;
    props.add(object);
  }
  root.add(props, buildBackdropForest(map, assets), buildCastle(map, assets));

  scene.add(root);
  return { root, ground, sun, heightAt: () => 0 };
}

/** Debug overlay: the simulation's actual colliders and patrol routes.
 *  Magenta = blocks movement AND sight (cover); grey = blocks movement only. */
export function buildCollisionDebug(map: MapDef, heightAt: (x: number, z: number) => number = () => 0): THREE.Group {
  const group = new THREE.Group();
  group.name = 'debug-colliders';
  const cover = new THREE.LineBasicMaterial({ color: 0xff3df0, depthTest: false });
  const low = new THREE.LineBasicMaterial({ color: 0xb8b8b8, depthTest: false });
  let line = cover;
  const loop = (points: THREE.Vector3[], material = line) => {
    const mesh = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
    mesh.renderOrder = 10;
    group.add(mesh);
  };
  const water = new THREE.LineBasicMaterial({ color: 0x4ab8ff, depthTest: false });
  const at = (x: number, z: number, lift = 0.08) => new THREE.Vector3(x, heightAt(x, z) + lift, z);
  for (const prop of map.props) {
    const c = prop.collider;
    line = prop.kind === 'water' ? water : prop.blocksSight ? cover : low;
    if (c.shape === 'circle') {
      loop(Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return at(prop.x + Math.cos(a) * c.radius, prop.z + Math.sin(a) * c.radius);
      }));
    } else {
      // Axis-aligned boxes have the unit x axis; turned boxes carry their own.
      const ux = c.shape === 'obox' ? c.ux : 1;
      const uz = c.shape === 'obox' ? c.uz : 0;
      loop([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => at(prop.x + sx! * c.hx * ux - sz! * c.hz * uz, prop.z + sx! * c.hx * uz + sz! * c.hz * ux)));
    }
  }
  line = cover;
  const b = boundsOf(map);
  loop([at(b.minX, b.minZ), at(b.maxX, b.minZ), at(b.maxX, b.maxZ), at(b.minX, b.maxZ)]);
  const routeMat = new THREE.LineBasicMaterial({ color: 0xffe14a, depthTest: false });
  for (const route of map.patrolRoutes) loop(route.map((p) => at(p.x, p.z, 0.1)), routeMat);
  group.visible = false;
  return group;
}
