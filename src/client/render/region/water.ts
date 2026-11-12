/**
 * The river. One flat sheet at the water level; the carved ground (from the
 * shared channel feature) hides it everywhere the land is above water, so the
 * visible shoreline is exactly where the terrain says it is.
 *
 * A small data texture stores, per point, how far it is from mid-stream, the
 * flow direction and whether it is a ford. The shader uses that to move
 * ripples downstream, pale the shallows and break foam on the banks.
 */
import * as THREE from 'three';
import type { MapDef } from '../../../shared/sim/map.ts';
import type { ChannelFeature } from '../../../shared/sim/terrain.ts';
import { VALE as C } from '../palette.ts';
import { NOISE_GLSL, type SharedUniforms } from './materials.ts';

export interface WaterResult {
  mesh: THREE.Mesh;
  dispose(): void;
}

export function buildWater(map: MapDef, shared: SharedUniforms): WaterResult | null {
  const channel = map.terrain?.features.find((f): f is ChannelFeature => f.type === 'channel');
  if (!channel) return null;
  const reach = channel.halfWidth + channel.bank * 2.8 + 2;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of channel.points) {
    minX = Math.min(minX, p.x - reach);
    maxX = Math.max(maxX, p.x + reach);
    minZ = Math.min(minZ, p.z - reach);
    maxZ = Math.max(maxZ, p.z + reach);
  }
  const res = 2; // texels per metre
  const w = Math.ceil((maxX - minX) * res);
  const h = Math.ceil((maxZ - minZ) * res);
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = minX + (i + 0.5) / res;
      const z = minZ + (j + 0.5) / res;
      let best = Infinity;
      let fx = 1;
      let fz = 0;
      let along = 0;
      let run = 0;
      for (let s = 0; s < channel.points.length - 1; s++) {
        const a = channel.points[s]!;
        const b = channel.points[s + 1]!;
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const len = Math.hypot(abx, abz);
        const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (len * len)));
        const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
        if (d < best) {
          best = d;
          fx = abx / len;
          fz = abz / len;
          along = run + len * t;
        }
        run += len;
      }
      let ford = 0;
      for (const f of channel.fords) ford = Math.max(ford, 1 - Math.min(1, Math.max(0, (Math.abs(along - f.along) - f.halfLength) / 5)));
      const k = (j * w + i) * 4;
      data[k] = Math.min(255, (best / reach) * 255);
      data[k + 1] = (fx * 0.5 + 0.5) * 255;
      data[k + 2] = (fz * 0.5 + 0.5) * 255;
      data[k + 3] = ford * 255;
    }
  }
  const field = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  field.minFilter = field.magFilter = THREE.LinearFilter;
  field.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, channel.waterY, (minZ + maxZ) / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uField: { value: null },
        uOrigin: { value: new THREE.Vector2(minX, minZ) },
        uSize: { value: new THREE.Vector2(maxX - minX, maxZ - minZ) },
        uEdge: { value: channel.halfWidth / reach },
        uDeep: { value: new THREE.Color(C.waterDeep) },
        uMid: { value: new THREE.Color(C.water) },
        uShallow: { value: new THREE.Color(C.waterShallow) },
        uFoam: { value: new THREE.Color(C.foam) },
        uSky: { value: new THREE.Color(C.skyMid) },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorldP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldP = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uField;
      uniform vec2 uOrigin;
      uniform vec2 uSize;
      uniform float uEdge;
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform vec3 uSky;
      varying vec3 vWorldP;
      ${NOISE_GLSL}
      void main() {
        vec2 uv = (vWorldP.xz - uOrigin) / uSize;
        vec4 f = texture2D(uField, uv);
        float edge = f.r / uEdge;              // 0 mid-stream, 1 at the nominal water's edge
        vec2 flow = normalize(f.gb * 2.0 - 1.0 + vec2(1e-4));
        float ford = f.a;
        vec2 p = vWorldP.xz;
        // Faster in the middle, slack at the banks.
        float speed = mix(1.5, 0.35, clamp(edge, 0.0, 1.0)) * (1.0 + ford * 0.8);
        float n1 = vnoise(vec3(p * 0.42 - flow * uTime * speed * 0.9, uTime * 0.11));
        float n2 = vnoise(vec3(p * 1.25 - flow * uTime * speed * 1.7 + 13.0, uTime * 0.23));
        float n3 = vnoise(vec3(p * 3.1 - flow * uTime * speed * 2.4, 4.0));
        float ripple = n1 * 0.5 + n2 * 0.35 + n3 * 0.15;
        vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.85, edge) * 0.8 + ripple * 0.3);
        col = mix(col, uShallow, clamp(smoothstep(0.7, 1.25, edge) + ford * 0.75, 0.0, 1.0) * 0.85);
        // Sky caught on the ripples: long streaks drawn out along the flow.
        float streak = smoothstep(0.6, 0.66, ripple) - smoothstep(0.7, 0.8, ripple);
        col += uSky * streak * 0.28;
        // Foam where the water meets the bank, and broken water over the ford.
        float foam = smoothstep(0.92, 1.12, edge + (n2 - 0.5) * 0.3) * (1.0 - smoothstep(1.3, 1.6, edge));
        foam = max(foam, ford * smoothstep(0.55, 0.75, n2 * 0.6 + n3 * 0.5));
        col = mix(col, uFoam, foam * 0.6);
        float alpha = mix(0.93, 0.6, clamp(smoothstep(0.75, 1.3, edge) + ford * 0.5, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  material.uniforms.uTime = shared.uTime;
  // Set after the merge: merging clones textures, and a clone is never uploaded.
  material.uniforms.uField!.value = field;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'river';
  mesh.renderOrder = 2;
  return {
    mesh,
    dispose: () => {
      geo.dispose();
      material.dispose();
      field.dispose();
    },
  };
}
