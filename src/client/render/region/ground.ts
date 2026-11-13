/**
 * The ground of a region.
 *
 * Inside the playable rectangle the mesh is built from the SHARED height
 * function (shared/sim/terrain.ts): the ground a player sees is the ground
 * the server's colliders were checked against. Beyond the rectangle the same
 * function is continued into backdrop hills that nobody can reach.
 *
 * The surface is not a tiled texture. It is painted once, at load, onto a
 * canvas: a noise underpainting, tens of thousands of brush dabs, then the
 * orchard plots, yards, cobbles, lanes and ruts drawn from the region data.
 */
import * as THREE from 'three';
import { boundsOf, type Bounds, type MapDef, type Point } from '../../../shared/sim/map.ts';
import type { RegionDef } from '../../../shared/sim/region.ts';
import { groundHeight, polylineNearest, smoothstep, valueNoise, type ChannelFeature } from '../../../shared/sim/terrain.ts';
import { VALE as C } from '../palette.ts';
import { groundMaterial, skirtMaterial, type SharedUniforms } from './materials.ts';

/** The painted area reaches this far past the playable rectangle. */
const APRON = 30;
const PX_PER_M = 7;

export interface GroundResult {
  group: THREE.Group;
  /** Height of the drawn ground anywhere, including the backdrop hills. */
  heightAt(x: number, z: number): number;
  dispose(): void;
}

function channelOf(map: MapDef): ChannelFeature | undefined {
  return map.terrain?.features.find((f): f is ChannelFeature => f.type === 'channel');
}

/** Drawn ground height: shared terrain inside, rolling hills added outside. */
export function makeHeight(map: MapDef): (x: number, z: number) => number {
  const b = boundsOf(map);
  const river = channelOf(map);
  return (x, z) => {
    const base = groundHeight(map.terrain, x, z);
    const ox = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
    const oz = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0;
    const out = Math.sqrt(ox * ox + oz * oz);
    if (out <= 2) return base;
    const w = smoothstep(2, 90, out);
    // Keep the river's own valley open so it can be seen running out of the region.
    const valley = river ? smoothstep(10, 55, polylineNearest(river.points, x, z).dist) : 1;
    const hills = valueNoise(x / 70, z / 70, 3) * 22 + valueNoise(x / 28, z / 28, 9) * 6;
    // The land climbs to the north, where the castle stands.
    const north = z < b.minZ ? Math.min((b.minZ - z) / 300, 1) * 26 : 0;
    return base + w * (hills * (0.2 + 0.8 * valley) + north * valley);
  };
}

function blendColour(out: [number, number, number], colour: number, weight: number): void {
  out[0] += (((colour >> 16) & 255) - out[0]) * weight;
  out[1] += (((colour >> 8) & 255) - out[1]) * weight;
  out[2] += ((colour & 255) - out[2]) * weight;
}

function distSeg(px: number, pz: number, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / len2));
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

/** 0..1 membership of a point in a patch (soft edge). */
function patchWeight(p: RegionDef['patches'][number], x: number, z: number): number {
  const x2 = p.x2 ?? p.x;
  const z2 = p.z2 ?? p.z;
  // The vast majority of underpainting samples are outside any one patch.
  if (x < Math.min(p.x, x2) - p.radius || x > Math.max(p.x, x2) + p.radius ||
      z < Math.min(p.z, z2) - p.radius || z > Math.max(p.z, z2) + p.radius) return 0;
  const d = p.x2 === undefined || p.z2 === undefined ? Math.hypot(x - p.x, z - p.z) : distSeg(x, z, p, { x: x2, z: z2 });
  return 1 - smoothstep(p.radius * 0.6, p.radius, d);
}

/** Underlying colour of the land before any detail: shared by the canvas and the backdrop. */
function baseColour(region: RegionDef, river: ChannelFeature | undefined, x: number, z: number, h: number, out: [number, number, number]): void {
  const n1 = valueNoise(x / 17, z / 17, 21);
  const n2 = valueNoise(x / 5.5, z / 5.5, 22);
  const n3 = valueNoise(x / 2.1, z / 2.1, 23);
  const t = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
  const k = Math.min(1, Math.max(0, (t - 0.25) / 0.5));
  const base = k < 0.5 ? C.grassDark : C.grass;
  out[0] = (base >> 16) & 255;
  out[1] = (base >> 8) & 255;
  out[2] = base & 255;
  blendColour(out, k < 0.5 ? C.grass : C.grassLight, k < 0.5 ? k * 2 : (k - 0.5) * 2);
  // Dry patches on the sunny terraces.
  blendColour(out, C.grassDry, Math.max(0, n2 - 0.62) * 1.1);
  for (const p of region.patches) {
    const w = patchWeight(p, x, z);
    if (w <= 0) continue;
    if (p.kind === 'oldwood_floor') {
      blendColour(out, C.oldwoodFloor, w * 0.85);
      blendColour(out, C.leafLitter, w * Math.max(0, n3 - 0.45) * 1.2);
    } else if (p.kind === 'coppice_floor') {
      blendColour(out, C.oldwoodFloor, w * 0.5);
      blendColour(out, C.leafLitter, w * Math.max(0, n2 - 0.4) * 0.9);
    } else if (p.kind === 'meadow') blendColour(out, C.meadow, w * 0.7);
    else if (p.kind === 'hay_field') blendColour(out, C.hay, w * (0.55 + n3 * 0.25));
    else if (p.kind === 'village_yard') blendColour(out, C.lane, w * 0.75);
  }
  // River bed and banks, straight from the height.
  if (river && h < river.waterY + 0.9) {
    blendColour(out, C.mud, smoothstep(river.waterY + 0.9, river.waterY + 0.25, h) * 0.8);
    blendColour(out, C.gravel, smoothstep(river.waterY + 0.3, river.waterY - 0.15, h) * (0.5 + n3 * 0.5));
    blendColour(out, C.riverBed, smoothstep(river.waterY - 0.2, river.bedY + 0.2, h));
  }
}

function paint(map: MapDef, region: RegionDef, area: Bounds, heightAt: (x: number, z: number) => number): HTMLCanvasElement {
  const W = Math.round((area.maxX - area.minX) * PX_PER_M);
  const H = Math.round((area.maxZ - area.minZ) * PX_PER_M);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const X = (x: number) => (x - area.minX) * PX_PER_M;
  const Z = (z: number) => (z - area.minZ) * PX_PER_M;
  const S = PX_PER_M;
  const river = channelOf(map);
  const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
  let seed = 1234567;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  // 1. Underpainting, one sample per 2 x 2 pixels.
  const image = g.createImageData(W, H);
  const col: [number, number, number] = [0, 0, 0];
  for (let py = 0; py < H; py += 2) {
    for (let px = 0; px < W; px += 2) {
      const x = area.minX + (px + 1) / S;
      const z = area.minZ + (py + 1) / S;
      baseColour(region, river, x, z, heightAt(x, z), col);
      for (let dy = 0; dy < 2 && py + dy < H; dy++) {
        for (let dx = 0; dx < 2 && px + dx < W; dx++) {
          const i = ((py + dy) * W + px + dx) * 4;
          image.data[i] = col[0];
          image.data[i + 1] = col[1];
          image.data[i + 2] = col[2];
          image.data[i + 3] = 255;
        }
      }
    }
  }
  g.putImageData(image, 0, 0);

  const wet = (x: number, z: number) => river !== undefined && polylineNearest(river.points, x, z).dist < river.halfWidth + 0.6;

  // 2. Brush dabs: short strokes of neighbouring greens, leaning with the wind.
  const dabs = Math.round(((area.maxX - area.minX) * (area.maxZ - area.minZ)) * 2.2);
  const greens = [C.grass, C.grassLight, C.grassDark, C.grassMown, C.meadow, C.appleDark, C.grassDry];
  for (let i = 0; i < dabs; i++) {
    const x = area.minX + rnd() * (area.maxX - area.minX);
    const z = area.minZ + rnd() * (area.maxZ - area.minZ);
    if (wet(x, z)) continue;
    const inWood = region.patches.some((p) => (p.kind === 'oldwood_floor' || p.kind === 'coppice_floor') && patchWeight(p, x, z) > 0.4);
    const c = inWood ? [C.oldwoodFloor, C.leafLitter, C.oldwoodDark, C.moss, 0x8a6a34][Math.floor(rnd() * 5)]! : greens[Math.floor(rnd() * greens.length)]!;
    g.fillStyle = css(c, 0.12 + rnd() * 0.18);
    g.beginPath();
    g.ellipse(X(x), Z(z), (0.12 + rnd() * 0.3) * S, (0.3 + rnd() * 0.6) * S, 0.5 + (rnd() - 0.5) * 0.9, 0, Math.PI * 2);
    g.fill();
  }

  // 3. Orchard plots: mown strips under the rows, and the worn line the pickers walk.
  for (const plot of region.plots) {
    g.fillStyle = css(C.grassMown, 0.32);
    g.beginPath();
    plot.outline.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))));
    g.closePath();
    g.fill();
    const a = plot.outline[0]!;
    const b = plot.outline[1]!;
    const c = plot.outline[3]!;
    for (const t of [0.14, 0.86]) {
      g.strokeStyle = css(C.grassDry, 0.3);
      g.lineWidth = 0.5 * S;
      g.setLineDash([S * (2 + rnd() * 3), S * (1 + rnd() * 2)]);
      g.beginPath();
      g.moveTo(X(a.x + (c.x - a.x) * t), Z(a.z + (c.z - a.z) * t));
      g.lineTo(X(b.x + (c.x - a.x) * t), Z(b.z + (c.z - a.z) * t));
      g.stroke();
    }
    g.setLineDash([]);
  }

  // 4. Yards, gardens and cobbles.
  for (const p of region.patches) {
    if (p.kind === 'cobbles') {
      const n = Math.round(p.radius * p.radius * 14);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * p.radius;
        const x = p.x + Math.cos(a) * d;
        const z = p.z + Math.sin(a) * d;
        if (d > p.radius * 0.75 && rnd() < (d / p.radius - 0.75) * 4) continue;
        g.fillStyle = css([C.cobble, C.cobbleDark, C.gravel, C.stoneWarm][Math.floor(rnd() * 4)]!, 0.85);
        g.beginPath();
        g.ellipse(X(x), Z(z), (0.13 + rnd() * 0.1) * S, (0.1 + rnd() * 0.08) * S, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    } else if (p.kind === 'garden') {
      g.save();
      g.translate(X(p.x), Z(p.z));
      g.rotate(rnd() * 0.6 - 0.3);
      for (let r = -3; r <= 3; r++) {
        const y = (r * p.radius * S) / 3.6;
        g.fillStyle = css(C.mud, 0.8);
        g.fillRect(-p.radius * S * 0.9, y - 0.16 * S, p.radius * S * 1.8, 0.34 * S);
        for (let k = 0; k < p.radius * 3; k++) {
          g.fillStyle = css([C.appleLight, C.hedgeLight, C.apple, C.flowerYellow][Math.floor(rnd() * 3.2)]!, 0.9);
          g.beginPath();
          g.arc((rnd() - 0.5) * p.radius * S * 1.7, y, (0.1 + rnd() * 0.1) * S, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }
  }

  // 5. Roads, lanes, tracks and the abandoned road.
  const stroke = (points: Point[], width: number, style: string, dash?: number[]) => {
    g.strokeStyle = style;
    g.lineWidth = width * S;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setLineDash(dash ?? []);
    g.beginPath();
    points.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))));
    g.stroke();
    g.setLineDash([]);
  };
  /** A polyline moved sideways by `off` metres. */
  const offset = (points: Point[], off: number): Point[] =>
    points.map((p, i) => {
      const a = points[Math.max(0, i - 1)]!;
      const b = points[Math.min(points.length - 1, i + 1)]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: p.x - ((b.z - a.z) / len) * off, z: p.z + ((b.x - a.x) / len) * off };
    });
  const order = { old_road: 0, track: 1, lane: 2, road: 3 } as const;
  for (const path of [...region.paths].sort((a, b) => order[a.kind] - order[b.kind])) {
    const w = path.width;
    if (path.kind === 'old_road') {
      // Grass has closed over it: only the two ruts and a paler centre survive.
      stroke(path.points, w * 0.9, css(C.grassDry, 0.22));
      for (const s of [-1, 1]) stroke(offset(path.points, s * w * 0.27), 0.34, css(C.mud, 0.5), [S * 3.5, S * 1.6]);
      stroke(path.points, 0.5, css(C.grassDark, 0.3));
      continue;
    }
    if (path.kind === 'track') {
      stroke(path.points, w * 1.4, css(C.grassDry, 0.35));
      stroke(path.points, w * 0.7, css(C.lane, 0.75));
      stroke(path.points, w * 0.3, css(C.roadPale, 0.4), [S * 2, S * 1.2]);
      continue;
    }
    const body = path.kind === 'road' ? C.road : C.lane;
    stroke(path.points, w + 1.3, css(C.grassDry, 0.4));
    stroke(path.points, w + 0.5, css(C.roadDark, 0.55));
    stroke(path.points, w, css(body, 0.96));
    stroke(path.points, w * 0.45, css(C.roadPale, 0.35));
    // Wheel ruts, and a grass crown down the middle of the lanes.
    for (const s of [-1, 1]) stroke(offset(path.points, s * w * 0.24), 0.26, css(C.roadDark, 0.5), [S * 5, S * 0.9]);
    if (path.kind === 'lane') stroke(path.points, 0.4, css(C.grass, 0.4), [S * 1.6, S * 2.4]);
    // Stones and scuffs.
    for (let i = 0; i < path.points.length - 1; i++) {
      const a = path.points[i]!;
      const b = path.points[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let k = 0; k < len * 3; k++) {
        const t = rnd();
        const off = (rnd() - 0.5) * w;
        const x = a.x + (b.x - a.x) * t - ((b.z - a.z) / len) * off;
        const z = a.z + (b.z - a.z) * t + ((b.x - a.x) / len) * off;
        g.fillStyle = css(rnd() < 0.5 ? C.roadPale : C.roadDark, 0.35 + rnd() * 0.3);
        g.beginPath();
        g.ellipse(X(x), Z(z), (0.06 + rnd() * 0.16) * S, (0.05 + rnd() * 0.1) * S, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // The roads run on out of the region through their connectors, fading into the distance.
  for (const c of region.connectors) {
    const w = c.kind === 'road' ? 4.4 : c.kind === 'lane' ? 3.2 : 2.6;
    for (let k = 0; k < 6; k++) {
      const a = { x: c.x + c.outX * (k * 5 - 0.5), z: c.z + c.outZ * (k * 5 - 0.5) };
      const e = { x: c.x + c.outX * (k * 5 + 5), z: c.z + c.outZ * (k * 5 + 5) };
      const fade = 1 - k / 7;
      stroke([a, e], w + 0.5, css(C.roadDark, 0.5 * fade));
      stroke([a, e], w, css(c.kind === 'road' ? C.road : C.lane, 0.95 * fade));
      stroke([a, e], w * 0.45, css(C.roadPale, 0.3 * fade));
    }
  }

  // 6. Soft dark under everything that stands on the ground (grounding, not a shadow map).
  for (const prop of map.props) {
    if (prop.kind === 'water') continue;
    const c = prop.collider;
    const cx = X(prop.x);
    const cz = Z(prop.z);
    if (c.shape === 'circle') {
      const r = (c.radius + (prop.kind.startsWith('tree') ? 1.4 : 0.5)) * S;
      const grad = g.createRadialGradient(cx, cz, c.radius * S * 0.3, cx, cz, r);
      grad.addColorStop(0, 'rgba(30,40,20,0.42)');
      grad.addColorStop(1, 'rgba(30,40,20,0)');
      g.fillStyle = grad;
      g.fillRect(cx - r, cz - r, r * 2, r * 2);
    } else {
      const ux = c.shape === 'obox' ? c.ux : 1;
      const uz = c.shape === 'obox' ? c.uz : 0;
      g.save();
      g.translate(cx, cz);
      g.rotate(Math.atan2(uz, ux));
      g.shadowColor = 'rgba(28,36,20,0.5)';
      g.shadowBlur = 1.1 * S;
      g.fillStyle = 'rgba(40,44,28,0.38)';
      g.fillRect(-(c.hx + 0.1) * S, -(c.hz + 0.1) * S, (c.hx * 2 + 0.2) * S, (c.hz * 2 + 0.2) * S);
      g.restore();
    }
  }

  // 7. Small bright things: meadow flowers, windfalls under the fruit trees, leaf litter.
  for (const p of region.patches) {
    if (p.kind !== 'meadow' && p.kind !== 'hay_field') continue;
    const n = Math.round(p.radius * p.radius * (p.kind === 'meadow' ? 5 : 1.5) * (p.x2 === undefined ? 1 : 3));
    for (let i = 0; i < n; i++) {
      const t = rnd();
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * p.radius;
      const x = p.x + ((p.x2 ?? p.x) - p.x) * t + Math.cos(a) * d;
      const z = p.z + ((p.z2 ?? p.z) - p.z) * t + Math.sin(a) * d;
      g.fillStyle = css([C.flowerWhite, C.flowerYellow, C.flowerViolet, C.flowerRed][Math.floor(rnd() * 4)]!, 0.9);
      g.fillRect(X(x), Z(z), 0.09 * S, 0.09 * S);
    }
  }
  for (const prop of map.props) {
    if (prop.kind !== 'tree_apple' && prop.kind !== 'tree_apple_old') continue;
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.6 + rnd() * 2.0;
      g.fillStyle = css(rnd() < 0.7 ? C.appleFruit : C.appleFruitGold, 0.9);
      g.beginPath();
      g.arc(X(prop.x + Math.cos(a) * d), Z(prop.z + Math.sin(a) * d), 0.07 * S, 0, Math.PI * 2);
      g.fill();
    }
  }
  return canvas;
}

export function buildGround(map: MapDef, region: RegionDef, shared: SharedUniforms, maxAnisotropy: number): GroundResult {
  const b = boundsOf(map);
  const river = channelOf(map);
  const area: Bounds = { minX: b.minX - APRON, maxX: b.maxX + APRON, minZ: b.minZ - APRON, maxZ: b.maxZ + APRON };
  const heightAt = makeHeight(map);
  const group = new THREE.Group();
  group.name = 'ground';

  // Inner, painted ground at 1.3 m resolution.
  const nx = Math.round((area.maxX - area.minX) / 1.3);
  const nz = Math.round((area.maxZ - area.minZ) / 1.3);
  const inner = new THREE.PlaneGeometry(area.maxX - area.minX, area.maxZ - area.minZ, nx, nz);
  inner.rotateX(-Math.PI / 2);
  inner.translate((area.minX + area.maxX) / 2, 0, (area.minZ + area.maxZ) / 2);
  const ip = inner.getAttribute('position');
  for (let i = 0; i < ip.count; i++) ip.setY(i, heightAt(ip.getX(i), ip.getZ(i)));
  inner.computeVertexNormals();
  const texture = new THREE.CanvasTexture(paint(map, region, area, heightAt));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  const material = groundMaterial(shared, texture);
  const innerMesh = new THREE.Mesh(inner, material);
  innerMesh.receiveShadow = true;
  innerMesh.name = 'ground-painted';
  group.add(innerMesh);

  // Backdrop skirt: coarse, vertex coloured, tucked under the painted ground's edge.
  const coords = (lo: number, hi: number): number[] => {
    const out: number[] = [];
    for (let d = 560; d > 0.5; d *= 0.72) out.push(lo - d);
    for (let v = lo; v < hi - 1; v += 8) out.push(v);
    out.push(hi);
    for (let d = 5; d < 600; d /= 0.72) out.push(hi + d);
    return out;
  };
  const xs = coords(area.minX, area.maxX);
  const zs = coords(area.minZ, area.maxZ);
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  const col: [number, number, number] = [0, 0, 0];
  const linear = new THREE.Color();
  for (const z of zs) {
    for (const x of xs) {
      const insideX = x > area.minX + 2 && x < area.maxX - 2;
      const insideZ = z > area.minZ + 2 && z < area.maxZ - 2;
      const h = heightAt(x, z);
      positions.push(x, insideX && insideZ ? h - 3 : h - 0.3, z);
      baseColour(region, river, x, z, h, col);
      // Far hills: darker woods to the north, hazier with distance.
      const far = Math.max(Math.abs(x) - b.maxX, Math.abs(z) - b.maxZ, 0);
      const wood = z < b.minZ ? Math.min(1, (b.minZ - z) / 60) * 0.5 : 0;
      linear.setRGB(col[0] / 255, col[1] / 255, col[2] / 255, THREE.SRGBColorSpace);
      linear.lerp(new THREE.Color(C.oldwoodFloor), wood).lerp(new THREE.Color(C.grassDark), Math.min(0.35, far / 500));
      colours.push(linear.r, linear.g, linear.b);
    }
  }
  const row = xs.length;
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cz = (zs[j]! + zs[j + 1]!) / 2;
      if (cx > area.minX + 8 && cx < area.maxX - 8 && cz > area.minZ + 8 && cz < area.maxZ - 8) continue;
      const a = j * row + i;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  skirt.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  skirt.setIndex(index);
  skirt.computeVertexNormals();
  const skirtMat = skirtMaterial(shared);
  const skirtMesh = new THREE.Mesh(skirt, skirtMat);
  skirtMesh.name = 'ground-backdrop';
  group.add(skirtMesh);

  return {
    group,
    heightAt,
    dispose: () => {
      inner.dispose();
      skirt.dispose();
      texture.dispose();
      material.dispose();
      skirtMat.dispose();
    },
  };
}
