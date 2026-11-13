import * as THREE from 'three';
import type { ActorView, Snapshot } from '../../../shared/protocol.ts';
import { sightBlocked } from '../../../shared/sim/geometry.ts';
import { boundsOf, type MapDef } from '../../../shared/sim/map.ts';
import { inSightArc } from '../../../shared/sim/perception.ts';
import { TUNING } from '../../../shared/sim/tuning.ts';

const CELL = 0.75;
const REFRESH_MS = 100;
const FOG_SHADER = /* glsl */ `
  uniform sampler2D uVision;
  uniform vec4 uVisionArea;
  varying vec2 vVisionWorld;
  float sightFog() {
    vec2 uv = (vVisionWorld - uVisionArea.xy) / uVisionArea.zw;
    vec2 visibility = texture2D(uVision, clamp(uv, 0.0, 1.0)).rg;
    float edge = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
    return mix(mix(0.84, 0.55, visibility.g * edge), 0.0, visibility.r * edge);
  }
`;

/** Shade the scenery. Actor visibility remains governed by server snapshots. */
export class VisionFog {
  private readonly bounds: ReturnType<typeof boundsOf>;
  private readonly width: number;
  private readonly height: number;
  private readonly data: Uint8Array;
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
    this.texture = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGFormat);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.area = new THREE.Vector4(this.bounds.minX, this.bounds.minZ, this.width * CELL, this.height * CELL);
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
          .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.14, 0.145, 0.155), sightFog());');
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
    for (const eye of eyes) this.reveal(eye);
    this.texture.needsUpdate = true;
  }

  private reveal(eye: ActorView): void {
    const profile = eye.monster ? TUNING.monsters[eye.monster] : undefined;
    const range = profile?.viewRange ?? TUNING.hero.viewRadius;
    const cx = (eye.x - this.bounds.minX) / CELL;
    const cz = (eye.z - this.bounds.minZ) / CELL;
    const reach = range / CELL;
    for (let j = Math.max(0, Math.floor(cz - reach)); j < Math.min(this.height, Math.ceil(cz + reach)); j++) {
      const z = this.bounds.minZ + (j + 0.5) * CELL;
      for (let i = Math.max(0, Math.floor(cx - reach)); i < Math.min(this.width, Math.ceil(cx + reach)); i++) {
        const x = this.bounds.minX + (i + 0.5) * CELL;
        if (!inSightArc(x - eye.x, z - eye.z, eye.dirX, eye.dirZ, range,
          profile?.proximityRadius ?? range, profile?.viewHalfArcCos ?? -1)) continue;
        const index = (j * this.width + i) * 2;
        if (this.data[index] || sightBlocked(this.map, eye.x, eye.z, x, z)) continue;
        this.data[index] = this.data[index + 1] = 255;
      }
    }
  }
}
