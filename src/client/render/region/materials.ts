/**
 * Materials for the region renderer. One "painterly" material is shared by
 * every baked model: vertex colours, soft hand-mixed blotches in world space
 * (so no two walls or crowns are the same flat tone), and wind sway driven by
 * a per-vertex weight. Purely cosmetic.
 */
import * as THREE from 'three';

export interface SharedUniforms {
  uTime: { value: number };
}

const NOISE_GLSL = /* glsl */ `
float vhash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vhash(i), vhash(i + vec3(1, 0, 0)), f.x), mix(vhash(i + vec3(0, 1, 0)), vhash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vhash(i + vec3(0, 0, 1)), vhash(i + vec3(1, 0, 1)), f.x), mix(vhash(i + vec3(0, 1, 1)), vhash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

function patch(material: THREE.Material, shared: SharedUniforms, o: { sway: boolean; mottle: number; grain: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float sway;\nuniform float uTime;\nvarying vec3 vWorldP;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wposP = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 wposP = modelMatrix * vec4(transformed, 1.0);
        #endif
        ${o.sway ? `
        float phP = wposP.x * 0.31 + wposP.z * 0.23 + uTime * 1.6;
        float gustP = sin(phP) * 0.6 + sin(phP * 2.3 + 1.7) * 0.4;
        transformed.x += sway * gustP * 0.2;
        transformed.z += sway * cos(phP * 0.8) * 0.13;` : ''}
        vWorldP = wposP.xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldP;\n${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float mA = vnoise(vWorldP * 0.8);
        float mB = vnoise(vWorldP * 3.3 + 9.0);
        diffuseColor.rgb *= ${(1 - o.mottle * 0.6).toFixed(3)} + ${o.mottle.toFixed(3)} * mA + ${o.grain.toFixed(3)} * (mB - 0.5);
        // Warm the lights and cool the darks a touch: a painter's mix, not a flat multiply.
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.0, 0.9), mA);`,
      );
  };
}

export function painterlyMaterial(shared: SharedUniforms): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  patch(material, shared, { sway: true, mottle: 0.2, grain: 0.1 });
  return material;
}

/** Double-sided variant for grass blades and other flat cards. */
export function cardMaterial(shared: SharedUniforms): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  patch(material, shared, { sway: true, mottle: 0.14, grain: 0.0 });
  return material;
}

/** Ground: the painted texture, plus fine grain so it never looks blurred up close. */
export function groundMaterial(shared: SharedUniforms, map: THREE.Texture): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ map });
  patch(material, shared, { sway: false, mottle: 0.1, grain: 0.14 });
  return material;
}

export function skirtMaterial(shared: SharedUniforms): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  patch(material, shared, { sway: false, mottle: 0.14, grain: 0.06 });
  return material;
}

export { NOISE_GLSL };
