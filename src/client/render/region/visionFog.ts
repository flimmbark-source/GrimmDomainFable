import * as THREE from 'three';
import type { ActorView, Snapshot } from '../../../shared/protocol.ts';
import { sightBlocked } from '../../../shared/sim/geometry.ts';
import { boundsOf, type MapDef } from '../../../shared/sim/map.ts';
import { inSightArc } from '../../../shared/sim/perception.ts';
import { TUNING } from '../../../shared/sim/tuning.ts';
import { billowAt } from './noiseTexture.ts';

const CELL = 0.75;
const REFRESH_MS = 100;
/** Cells each blur pass reaches either side. Two passes feather the edge over about 3 m. */
const FEATHER = 2;
/** World scale of the smoke pattern (texture repeats every 1 / SMOKE_SCALE metres). */
const SMOKE_SCALE = 0.03;
/** Never-seen smoke, from its dark hollows to its lighter billows (display values), and how much it hides. */
const SMOKE_DARK = 0.102;
const SMOKE_LIGHT = 0.216;
const SMOKE_COVER = 0.94;
/** Remembered ground: how far it is greyed, then dimmed. */
const MEMORY_GREY = 0.55;
const MEMORY_DIM = 0.52;
/** Byte encodings of the transform's grey (b) and offset (c) terms. */
const B_RANGE = 0.3;
const C_RANGE = 0.25;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Every fog state is an affine recolouring of the lit colour:
 *   out = col * a + grey(col) * b + c
 * with a, b, c depending only on the cell. Computing them here, when the mask
 * changes, leaves the shader one fetch, one dot and two multiply-adds.
 * `seen` and `known` are the feathered mask (0..1); `billow` the smoke (0..1),
 * which also pushes each edge in and out so it is ragged as well as soft.
 */
export function fogTransform(seen: number, known: number, billow: number): [a: number, b: number, c: number] {
  const push = (billow - 0.5) * 0.6;
  const s = smoothstep(0.3, 0.8, seen + push);
  const k = smoothstep(0.3, 0.8, known + push);
  const smoke = SMOKE_DARK + (SMOKE_LIGHT - SMOKE_DARK) * smoothstep(0.45, 0.9, billow);
  // Never seen: mostly smoke. Remembered: greyed and dimmed, with a faint haze.
  const a = (1 - SMOKE_COVER) * (1 - k) + (1 - MEMORY_GREY) * MEMORY_DIM * k;
  const b = MEMORY_GREY * MEMORY_DIM * k;
  const c = SMOKE_COVER * smoke * (1 - k) + 0.04 * billow * k;
  return [s + (1 - s) * a, (1 - s) * b, (1 - s) * c];
}

const OUTSIDE = fogTransform(0, 0, 0.5);

/** Applied after tone mapping, so colours are display values. */
const FOG_SHADER = /* glsl */ `
  uniform sampler2D uVision;
  uniform vec4 uVisionArea;
  varying vec2 vVisionWorld;
  vec3 sightFog(vec3 col) {
    vec2 uv = (vVisionWorld - uVisionArea.xy) / uVisionArea.zw;
    vec3 t = texture2D(uVision, clamp(uv, 0.0, 1.0)).rgb;
    // Outside the mapped area: never seen.
    bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
    t = inside ? t : vec3(${OUTSIDE[0].toFixed(4)}, ${(OUTSIDE[1] / B_RANGE).toFixed(4)}, ${(OUTSIDE[2] / C_RANGE).toFixed(4)});
    if (t.r > 0.996) return col;
    float grey = dot(col, vec3(0.299, 0.587, 0.114));
    // A touch of blue in the greyed memory and in the smoke.
    return col * t.r + vec3(0.95, 0.98, 1.04) * (grey * t.g * ${B_RANGE.toFixed(2)}) + vec3(0.98, 1.0, 1.04) * (t.b * ${C_RANGE.toFixed(2)});
  }
`;

/** Shade the scenery. Actor visibility remains governed by server snapshots. */
export class VisionFog {
  private readonly bounds: ReturnType<typeof boundsOf>;
  private readonly width: number;
  private readonly height: number;
  /** What this seat sees now (R) and has seen before (G), one byte per cell. */
  private readonly data: Uint8Array;
  /** The mask with feathered edges (R, G per cell). */
  private readonly feathered: Uint8Array;
  /** Smoke pattern per cell, fixed to the ground (0..1). */
  private readonly billow: Float32Array;
  /** What is uploaded and drawn: each cell's fog transform (a, b, c) as RGBA bytes. */
  private readonly drawn: Uint8Array;
  private readonly scratch: Float32Array;
  private readonly line: Float32Array;
  /** Cells the eyes could reach at the last refresh: [i0, j0, i1, j1), or null for the whole map. */
  private lastReach: [number, number, number, number] | null = null;
  private readonly texture: THREE.DataTexture;
  private readonly area: THREE.Vector4;
  private lastRefresh = -Infinity;
  private lastView = '';
  private lastSlot = -1;

  constructor(private readonly map: MapDef) {
    this.bounds = boundsOf(map);
    this.width = Math.ceil((this.bounds.maxX - this.bounds.minX) / CELL);
    this.height = Math.ceil((this.bounds.maxZ - this.bounds.minZ) / CELL);
    this.data = new Uint8Array(this.width * this.height * 2);
    this.feathered = new Uint8Array(this.data.length);
    this.billow = new Float32Array(this.width * this.height);
    this.drawn = new Uint8Array(this.width * this.height * 4);
    this.scratch = new Float32Array(this.data.length);
    this.line = new Float32Array(Math.max(this.width, this.height));
    this.texture = new THREE.DataTexture(this.drawn, this.width, this.height, THREE.RGBAFormat);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.area = new THREE.Vector4(this.bounds.minX, this.bounds.minZ, this.width * CELL, this.height * CELL);
    // Smoke billows: the tiling pattern the region's other materials use,
    // turned off the world axes, and evened out towards the map's edge so the
    // smoke meets the flat smoke beyond it without a seam.
    for (let j = 0; j < this.height; j++) {
      const z = this.bounds.minZ + (j + 0.5) * CELL;
      for (let i = 0; i < this.width; i++) {
        const x = this.bounds.minX + (i + 0.5) * CELL;
        const rim = Math.min(1, Math.min(i, j, this.width - 1 - i, this.height - 1 - j) / 8);
        const b = billowAt((0.8 * x + 0.6 * z) * SMOKE_SCALE, (-0.6 * x + 0.8 * z) * SMOKE_SCALE) / 255;
        this.billow[j * this.width + i] = 0.5 + (b - 0.5) * rim;
      }
    }
    this.encode(0, 0, this.width, this.height);
  }

  attach(root: THREE.Object3D): void {
    const materials = new Set<THREE.Material>();
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || node.name === 'sky') return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    });
    for (const material of materials) {
      const compile = material.onBeforeCompile;
      const key = material.customProgramCacheKey();
      material.customProgramCacheKey = () => `${key}:vision-fog`;
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        shader.uniforms.uVision = { value: this.texture };
        shader.uniforms.uVisionArea = { value: this.area };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vVisionWorld;');
        shader.vertexShader = shader.vertexShader.includes('#include <project_vertex>') ? shader.vertexShader
          .replace('#include <project_vertex>', `
            vec4 visionPosition = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              visionPosition = instanceMatrix * visionPosition;
            #endif
            vVisionWorld = (modelMatrix * visionPosition).xz;
            #include <project_vertex>`) : shader.vertexShader.replace('#include <fog_vertex>', 'vVisionWorld = vWorldP.xz;\n#include <fog_vertex>');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${FOG_SHADER}`)
          .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = sightFog(gl_FragColor.rgb);');
      };
      material.needsUpdate = true;
    }
  }

  update(snapshot: Snapshot, now: number): void {
    const you = snapshot.you;
    if (!you || now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    const changedSeat = you.slot !== this.lastSlot;
    if (changedSeat) {
      this.data.fill(0);
      this.lastSlot = you.slot;
      this.lastView = '';
    }
    const eyes = snapshot.actors.filter((a) => a.id === you.actorId || (a.kind === 'monster' && a.owner === you.slot));
    const key = eyes.map((a) => [a.id, Math.round(a.x / (CELL / 3)), Math.round(a.z / (CELL / 3)),
      a.monster ? Math.round(a.dirX * 40) : 0, a.monster ? Math.round(a.dirZ * 40) : 0].join(',')).join('|');
    if (!changedSeat && key === this.lastView) return;
    this.lastView = key;
    for (let i = 0; i < this.data.length; i += 2) this.data[i] = 0;
    // Only cells some eye could reach, now or at the last refresh, can change.
    let reach: [number, number, number, number] = [this.width, this.height, 0, 0];
    for (const eye of eyes) {
      const r = this.reveal(eye);
      reach = [Math.min(reach[0], r[0]), Math.min(reach[1], r[1]), Math.max(reach[2], r[2]), Math.max(reach[3], r[3])];
    }
    const last = changedSeat ? null : this.lastReach;
    this.feather(last ? [Math.min(reach[0], last[0]), Math.min(reach[1], last[1]), Math.max(reach[2], last[2]), Math.max(reach[3], last[3])]
      : [0, 0, this.width, this.height]);
    this.lastReach = reach;
    this.texture.needsUpdate = true;
  }

  /**
   * Copy the mask into the drawn texture through two separable box blurs, so
   * its edges are soft. `changed` [i0, j0, i1, j1) bounds the mask cells that
   * may have changed; the blur spreads each change 2 x FEATHER cells, so that
   * much more is rewritten, and the blur reads as much again around it.
   */
  private feather(changed: [number, number, number, number]): void {
    const margin = FEATHER * 2;
    const { width: w, height: h, scratch: tmp, line, feathered, data: src } = this;
    const i0 = Math.max(0, changed[0] - margin);
    const j0 = Math.max(0, changed[1] - margin);
    const i1 = Math.min(w, changed[2] + margin);
    const j1 = Math.min(h, changed[3] + margin);
    if (i1 <= i0 || j1 <= j0) return;
    const x0 = Math.max(0, i0 - margin);
    const y0 = Math.max(0, j0 - margin);
    const x1 = Math.min(w, i1 + margin);
    const y1 = Math.min(h, j1 + margin);
    const span = FEATHER * 2 + 1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 2;
      tmp[i] = src[i]!;
      tmp[i + 1] = src[i + 1]!;
    }
    for (let channel = 0; channel < 2; channel++) {
      for (let pass = 0; pass < 2; pass++) {
        // Rows, then columns, as running sums with ends clamped to the margin
        // (or to the map edge, where that is also what a full-map blur does).
        for (const rows of [true, false]) {
          const [a0, a1, b0, b1] = rows ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
          const length = b1 - b0;
          for (let a = a0; a < a1; a++) {
            const at = (b: number) => ((rows ? a * w + b : b * w + a) * 2 + channel);
            for (let k = 0; k < length; k++) line[k] = tmp[at(b0 + k)]!;
            let sum = line[0]! * (FEATHER + 1);
            for (let k = 1; k <= FEATHER; k++) sum += line[Math.min(length - 1, k)]!;
            for (let k = 0; k < length; k++) {
              tmp[at(b0 + k)] = sum / span;
              sum += line[Math.min(length - 1, k + FEATHER + 1)]! - line[Math.max(0, k - FEATHER)]!;
            }
          }
        }
      }
    }
    // Two passes of radius FEATHER read 2 x FEATHER cells: the inner window is exact.
    for (let y = j0; y < j1; y++) for (let x = i0; x < i1; x++) {
      const i = (y * w + x) * 2;
      feathered[i] = Math.round(tmp[i]!);
      feathered[i + 1] = Math.round(tmp[i + 1]!);
    }
    this.encode(i0, j0, i1, j1);
  }

  /** Recompute the drawn fog transform of cells [i0, j0, i1, j1) from the feathered mask. */
  private encode(i0: number, j0: number, i1: number, j1: number): void {
    const { width: w, feathered, billow, drawn } = this;
    for (let y = j0; y < j1; y++) for (let x = i0; x < i1; x++) {
      const cell = y * w + x;
      const [a, b, c] = fogTransform(feathered[cell * 2]! / 255, feathered[cell * 2 + 1]! / 255, billow[cell]!);
      drawn[cell * 4] = Math.round(a * 255);
      drawn[cell * 4 + 1] = Math.round((b / B_RANGE) * 255);
      drawn[cell * 4 + 2] = Math.round((c / C_RANGE) * 255);
      drawn[cell * 4 + 3] = 255;
    }
  }

  /** Mark what one eye sees now; returns the cell window it could reach. */
  private reveal(eye: ActorView): [number, number, number, number] {
    const profile = eye.monster ? TUNING.monsters[eye.monster] : undefined;
    const range = profile?.viewRange ?? TUNING.hero.viewRadius;
    const cx = (eye.x - this.bounds.minX) / CELL;
    const cz = (eye.z - this.bounds.minZ) / CELL;
    const reach = range / CELL;
    const i0 = Math.max(0, Math.floor(cx - reach));
    const i1 = Math.min(this.width, Math.ceil(cx + reach));
    const j0 = Math.max(0, Math.floor(cz - reach));
    const j1 = Math.min(this.height, Math.ceil(cz + reach));
    for (let j = j0; j < j1; j++) {
      const z = this.bounds.minZ + (j + 0.5) * CELL;
      for (let i = i0; i < i1; i++) {
        const x = this.bounds.minX + (i + 0.5) * CELL;
        if (!inSightArc(x - eye.x, z - eye.z, eye.dirX, eye.dirZ, range,
          profile?.proximityRadius ?? range, profile?.viewHalfArcCos ?? -1)) continue;
        const index = (j * this.width + i) * 2;
        if (this.data[index] || sightBlocked(this.map, eye.x, eye.z, x, z)) continue;
        this.data[index] = this.data[index + 1] = 255;
      }
    }
    return [i0, j0, i1, j1];
  }
}
