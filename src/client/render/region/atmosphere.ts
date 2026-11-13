/**
 * Light and air for the valley: a late-afternoon sun, a painted sky with
 * slow cloud, soft haze, chimney smoke, the mill wheel and the far backdrop
 * (distant woods, hill orchards and the castle on the northern skyline).
 * All cosmetic; none of it is read by the simulation.
 */
import * as THREE from 'three';
import { boundsOf, type MapDef } from '../../../shared/sim/map.ts';
import type { RegionDef } from '../../../shared/sim/region.ts';
import type { ChannelFeature } from '../../../shared/sim/terrain.ts';
import { polylineNearest, valueNoise } from '../../../shared/sim/terrain.ts';
import type { AssetLibrary } from '../assets.ts';
import { Model } from '../modelkit.ts';
import { wheelParts } from '../models/props.ts';
import { VALE as C } from '../palette.ts';
import { instanced } from './instances.ts';
import type { SharedUniforms } from './materials.ts';

type Height = (x: number, z: number) => number;

export function buildSky(shared: SharedUniforms): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: shared.uTime,
      uDetail: shared.uDetail,
      uTop: { value: new THREE.Color(C.skyTop) },
      uMid: { value: new THREE.Color(C.skyMid) },
      uHorizon: { value: new THREE.Color(C.skyHorizon) },
      uSun: { value: new THREE.Vector3(-0.62, 0.42, 0.66).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      uniform sampler2D uDetail;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uTop, smoothstep(0.18, 0.8, h));
        // Warm glow round the sun.
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.78, 0.5) * (pow(s, 6.0) * 0.28 + pow(s, 90.0) * 0.6);
        // Broad painted cloud banks, drifting slowly.
        vec2 p = d.xz / (d.y + 0.22) * 1.6 + vec2(uTime * 0.004, 0.0);
        // The shared texture's billow channel is already several octaves: one
        // fetch, un-stretched back to the spread the thresholds were set for.
        float c = 0.5 + (texture2D(uDetail, p * 0.25).g - 0.5) / 2.2;
        float cloud = smoothstep(0.5, 0.72, c) * smoothstep(0.02, 0.2, d.y);
        vec3 lit = mix(vec3(0.82, 0.8, 0.86), vec3(1.0, 0.95, 0.84), smoothstep(0.55, 0.8, c) * 0.6 + s * 0.4);
        col = mix(col, lit, cloud * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), material);
  sky.name = 'sky';
  // Draw after the regular opaque scenery so depth rejection limits the sky
  // shader to visible pixels. Debug overlays and transparent effects follow.
  sky.renderOrder = 1;
  return sky;
}

export interface Lights {
  sun: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
  /** Keep the shadow map centred on what the camera is looking at. */
  follow(focus: THREE.Vector3, extent: number): void;
}

// Shadow casters still move. Refresh their depth map independently of the
// visible scene, so a stationary view and a moving chase both reuse it.
const SHADOW_INTERVAL_MS = 1000 / 15;

export function buildLights(): Lights {
  // A strong key over a modest fill: faceted crowns and hedges show clear
  // sunlit and shaded planes, and shade stays a deep, cool green.
  const hemisphere = new THREE.HemisphereLight(C.ambientSky, C.ambientGround, 1.0);
  const sun = new THREE.DirectionalLight(C.sun, 3.1);
  const direction = new THREE.Vector3(-0.62, 0.62, 0.48).normalize();
  sun.position.copy(direction).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.autoUpdate = false;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  // Generous: crowns and hedges are coarse meshes with smooth normals, and a
  // small bias draws their facets as shadow along the terminator.
  sun.shadow.normalBias = 0.3;
  let current = 0;
  let lastRefresh = -Infinity;
  return {
    sun,
    hemisphere,
    follow: (focus, extent) => {
      const now = performance.now();
      if (now - lastRefresh < SHADOW_INTERVAL_MS) return;
      lastRefresh = now;
      // Snap to whole shadow texels so shadows do not crawl as the camera moves.
      const texel = (extent * 2) / sun.shadow.mapSize.x;
      const fx = Math.round(focus.x / texel) * texel;
      const fz = Math.round(focus.z / texel) * texel;
      sun.target.position.set(fx, 0, fz);
      sun.position.set(fx + direction.x * 120, direction.y * 120, fz + direction.z * 120);
      sun.target.updateMatrixWorld();
      if (extent !== current) {
        current = extent;
        Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 10, far: 260 });
        sun.shadow.camera.updateProjectionMatrix();
      }
      sun.shadow.needsUpdate = true;
    },
  };
}

export interface Smoke {
  points: THREE.Points;
  dispose(): void;
}

/** Soft rising puffs from each chimney: one draw call for the whole village. */
export function buildSmoke(region: RegionDef, heightAt: Height, shared: SharedUniforms): Smoke | null {
  if (region.smoke.length === 0) return null;
  const per = 12;
  const n = region.smoke.length * per;
  const position = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  region.smoke.forEach((s, i) => {
    for (let k = 0; k < per; k++) {
      const j = i * per + k;
      position.set([s.x, heightAt(s.x, s.z) + s.y + 0.4, s.z], j * 3);
      phase[j] = k / per + i * 0.137;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 400);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: shared.uTime, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float phase;
      uniform float uTime;
      uniform float uScale;
      varying float vLife;
      void main() {
        float life = fract(phase + uTime * 0.07);
        vLife = life;
        vec3 p = position;
        p.y += life * 7.5;
        // The breeze carries it east, curling as it thins.
        p.x += life * life * 4.5 + sin(life * 9.0 + phase * 40.0) * 0.3 * life;
        p.z += sin(life * 6.0 + phase * 23.0) * 0.5 * life;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.7 + life * 2.6) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.25, d) * smoothstep(0.0, 0.12, vLife) * (1.0 - vLife) * 0.42;
        gl_FragColor = vec4(mix(vec3(0.78, 0.76, 0.72), vec3(0.95, 0.93, 0.88), vLife), a);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'smoke';
  points.renderOrder = 5;
  return { points, dispose: () => { geo.dispose(); material.dispose(); } };
}

export interface Wheels {
  group: THREE.Group;
  spinning: readonly THREE.Mesh[];
  update(dt: number): void;
}

export function buildWheels(map: MapDef, region: RegionDef, assets: AssetLibrary, material: THREE.Material): Wheels {
  const group = new THREE.Group();
  group.name = 'wheels';
  const channel = map.terrain?.features.find((f): f is ChannelFeature => f.type === 'channel');
  const spinning: THREE.Mesh[] = [];
  for (const w of region.wheels) {
    const geo = assets.geometryFor(`wheel:${w.radius}:${w.width}`, () => wheelParts(w.radius, w.width));
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const holder = new THREE.Group();
    holder.position.set(w.x, (channel?.waterY ?? 0) + w.y, w.z);
    // The model's axle is its local z; turn it to the authored axle direction.
    holder.rotation.y = Math.atan2(w.axleX, w.axleZ);
    holder.add(mesh);
    group.add(holder);
    spinning.push(mesh);
    // Stone piers carrying the axle on both sides of the wheel.
    const piers = new Model();
    for (const side of [-1, 1]) {
      const off = side * (w.width / 2 + 0.75);
      piers.taper(1.5, 1.1, 1.2, 0.9, w.y + 2.4, C.stoneWet, { p: [0, -w.y - 2.2, off], mottle: C.stone, shade: 0.3 });
      piers.block(1.3, 0.2, 1.0, C.stoneWarm, { p: [0, 0.2, off], shade: 0 });
    }
    const pierMesh = new THREE.Mesh(assets.geometryFor(`wheel-piers:${w.y}:${w.width}`, () => piers.parts), material);
    pierMesh.castShadow = true;
    pierMesh.receiveShadow = true;
    holder.add(pierMesh);
  }
  return { group, spinning, update: (dt) => spinning.forEach((m) => (m.rotation.z -= dt * 0.55)) };
}

/** A far tree: a trunk and one or two soft masses. Never closer than the region's edge. */
function farTreeParts(kind: 'wood' | 'orchard' | 'field'): Model {
  const m = new Model();
  if (kind === 'wood') {
    m.post(0.4, 0.7, 6, C.barkDark, { shade: 0.3 }, 5);
    m.lump(3.8, C.oldwood, { p: [0, 8.4, 0], s: [1.1, 1.15, 1.1], soft: false, shade: 0.5, tip: C.oldwoodLight }, 0, 1, 0.3);
  } else if (kind === 'orchard') {
    m.post(0.2, 0.3, 2, C.bark, { shade: 0.3 }, 4);
    m.lump(2.0, C.apple, { p: [0, 3.1, 0], s: [1.15, 0.7, 1.15], soft: false, shade: 0.45, tip: C.appleLight }, 0, 3);
  } else {
    m.post(0.35, 0.6, 3.4, C.bark, { shade: 0.3 }, 5);
    m.lump(3.2, C.witnessLight, { p: [0, 5.6, 0], s: [1.2, 0.75, 1.2], soft: false, shade: 0.45, tip: C.appleLight }, 0, 4);
  }
  return m;
}

/** Woods, hill orchards and field trees beyond the playable rectangle (instanced, unlit by shadows). */
export function buildBackdrop(map: MapDef, assets: AssetLibrary, heightAt: Height, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = 'backdrop';
  const b = boundsOf(map);
  const channel = map.terrain?.features.find((f): f is ChannelFeature => f.type === 'channel');
  type BackdropKind = 'wood' | 'orchard' | 'field';
  const chunks = new Map<string, { kind: BackdropKind; matrices: THREE.Matrix4[] }>();
  const chunkSize = 96;
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let seed = 9001;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const reach = 210;
  const step = 8.5;
  for (let gz = b.minZ - reach; gz <= b.maxZ + 110; gz += step) {
    for (let gx = b.minX - reach; gx <= b.maxX + reach; gx += step) {
      let x = gx + (rnd() - 0.5) * step * 0.9;
      let z = gz + (rnd() - 0.5) * step * 0.9;
      const roll = rnd();
      const size = 0.85 + rnd() * 0.6;
      const outX = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
      const outZ = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0;
      const out = Math.max(outX, outZ);
      if (out < 2.5) continue;
      if (channel && polylineNearest(channel.points, x, z).dist < channel.halfWidth + 6) continue;
      // The roads leave through gaps.
      if (map.region?.connectors.some((c) => Math.hypot(x - (c.x + c.outX * out), z - (c.z + c.outZ * out)) < 7)) continue;
      let kind: BackdropKind;
      if (z < b.minZ) {
        // North: the oldwood thickens into forest, thinning far off.
        if (roll > 0.8 - Math.min(0.3, out / 500)) continue;
        kind = 'wood';
      } else if (z > b.maxZ) {
        // South: more terraces and orchards up the hill, in rows. Kept back so
        // they never stand between the strategy camera and the play.
        if (out < 10 || out > 90) continue;
        z = Math.round(z / 6.5) * 6.5 + valueNoise(x / 30, 0, 2) * 3;
        x = Math.round(x / 5.2) * 5.2 + (rnd() - 0.5) * 0.8;
        if (roll > 0.82) continue;
        kind = 'orchard';
      } else {
        // East and west: hedgerow trees and copses down the valley.
        const copse = valueNoise(x / 40, z / 40, 12);
        if (roll > copse * 0.75) continue;
        kind = roll < 0.12 ? 'wood' : copse > 0.62 ? 'orchard' : 'field';
      }
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      const key = `${kind}:${Math.floor(x / chunkSize)}:${Math.floor(z / chunkSize)}`;
      let bucket = chunks.get(key);
      if (!bucket) chunks.set(key, (bucket = { kind, matrices: [] }));
      bucket.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) - 0.2, z), q, new THREE.Vector3(size, size * (0.9 + rnd() * 0.35), size)));
    }
  }
  for (const [key, { kind, matrices }] of chunks) {
    const geo = assets.geometryFor(`far:${kind}`, () => farTreeParts(kind).parts);
    const mesh = instanced(geo, material, matrices, `backdrop:${key}`, false);
    mesh.receiveShadow = false;
    mesh.boundingSphere!.radius += 0.25;
    group.add(mesh);
  }
  // The castle on the northern skyline: a distant shape in the haze, not a local objective.
  for (const landmark of map.landmarks) {
    const castle = assets.instantiate('castle');
    castle.castShadow = false;
    castle.position.set(landmark.x, heightAt(landmark.x, landmark.z) + 6, landmark.z);
    castle.scale.setScalar(1.5);
    group.add(castle);
    // A crag for it to stand on.
    const crag = new Model();
    crag.lump(60, 0x4a4f5e, { p: [0, -16, 0], s: [1.2, 0.6, 0.9], shade: 0.5, mottle: 0x3a4a3c }, 1, 5, 0.25);
    const mesh = new THREE.Mesh(assets.geometryFor('far:crag', () => crag.parts), material);
    mesh.position.set(landmark.x, heightAt(landmark.x, landmark.z), landmark.z);
    group.add(mesh);
  }
  return group;
}
