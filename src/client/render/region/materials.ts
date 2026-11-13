/**
 * Materials for the region renderer. One "painterly" material is shared by
 * every baked model: vertex colours (with baked shade and crown highlights)
 * and wind sway driven by a per-vertex weight. The ground and backdrop add
 * soft blotches and grain from one fetch of a shared tiling noise texture.
 * Purely cosmetic.
 */
import * as THREE from 'three';

export interface SharedUniforms {
  uTime: { value: number };
  uFastShadows: { value: boolean };
  uBakedShadows: { value: boolean };
  uGroundShadow: { value: THREE.Texture | null };
  uStaticDepth: { value: THREE.DepthTexture | null };
  uStaticMatrix: { value: THREE.Matrix4 };
  uStaticArea: { value: THREE.Vector4 };
  /** Tiling noise: R fine grain, G soft billows (see noiseTexture.ts). */
  uDetail: { value: THREE.Texture | null };
}

const REGION_SHADOW_GLSL = /* glsl */ `
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF )
  uniform bool uFastShadows;
  float getRegionShadow( sampler2DShadow map, vec2 size, float intensity, float bias, float radius, vec4 coord ) {
    if ( !uFastShadows && !uBakedShadows ) return getShadow( map, size, intensity, bias, radius, coord );

    coord.xyz /= coord.w;
    #ifdef USE_REVERSED_DEPTH_BUFFER
      coord.z -= bias;
    #else
      coord.z += bias;
    #endif
    if ( coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0 || coord.z > 1.0 ) return 1.0;

    // Three configures PCF depth textures with linear filtering. One lookup
    // blends four depth comparisons in hardware and keeps the map resolution.
    return mix( 1.0, texture( map, coord.xyz ), intensity );
  }
  #define getShadow getRegionShadow
#endif
`;

function patch(
  material: THREE.Material, shared: SharedUniforms,
  o: { sway: boolean; mottle: number; grain: number; tile: number; upNormals?: boolean; ground?: boolean },
): void {
  material.customProgramCacheKey = () => `region:${o.sway}:${o.mottle}:${o.grain}:${o.tile}:${o.upNormals}:${o.ground}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uFastShadows = shared.uFastShadows;
    shader.uniforms.uBakedShadows = shared.uBakedShadows;
    shader.uniforms.uGroundShadow = shared.uGroundShadow;
    shader.uniforms.uStaticDepth = shared.uStaticDepth;
    shader.uniforms.uStaticMatrix = shared.uStaticMatrix;
    shader.uniforms.uStaticArea = shared.uStaticArea;
    shader.uniforms.uDetail = shared.uDetail;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float sway;\nuniform float uTime;\nvarying vec3 vWorldP;`)
      // Flat cards (grass, reeds) are lit as if they were the ground they grow from.
      .replace('#include <beginnormal_vertex>', o.upNormals ? 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);' : '#include <beginnormal_vertex>')
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
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldP;\nuniform sampler2D uDetail;`)
      .replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>
        uniform bool uBakedShadows;
        ${REGION_SHADOW_GLSL}
        uniform sampler2D uGroundShadow;
        uniform highp sampler2DShadow uStaticDepth;
        uniform mat4 uStaticMatrix;
        uniform vec4 uStaticArea;
        float regionStaticVisibility() {
          if (!uBakedShadows || !receiveShadow) return 1.0;
          vec2 uv = (vWorldP.xz - uStaticArea.xy) / uStaticArea.zw;
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
          ${o.ground ? 'return texture2D(uGroundShadow, uv).r;' : `
          vec3 worldNormal = transformNormalByInverseViewMatrix(normalize(vNormal), viewMatrix);
          vec3 p = (uStaticMatrix * vec4(vWorldP + worldNormal * 0.3, 1.0)).xyz;
          p.z -= 0.0005;
          return texture(uStaticDepth, p);`}
        }`)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directDiffuse *= regionStaticVisibility();')
      .replace(
        '#include <color_fragment>',
        o.mottle === 0 && o.grain === 0 ? '#include <color_fragment>' : `#include <color_fragment>
        // One fetch: G is a soft blotch a few metres across, R a fine grain.
        // The tile is turned off the world axes so its repeat never lines up with a road.
        vec2 detail = texture2D(uDetail, mat2(0.8, -0.6, 0.6, 0.8) * vWorldP.xz * ${(1 / o.tile).toFixed(4)}).rg;
        float mA = detail.g;
        float mB = detail.r;
        diffuseColor.rgb *= ${(1 - o.mottle * 0.6).toFixed(3)} + ${o.mottle.toFixed(3)} * mA + ${o.grain.toFixed(3)} * (mB - 0.5);
        // Warm the lights and cool the darks a touch: a painter's mix, not a flat multiply.
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.0, 0.9), mA);`,
      );
  };
}

export function painterlyMaterial(shared: SharedUniforms): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Model colours already contain baked underside shade and crown highlights.
  // Keep the large planes clean and avoid two 3D noise evaluations per pixel.
  patch(material, shared, { sway: true, mottle: 0, grain: 0, tile: 1 });
  return material;
}

/** Double-sided variant for grass blades and other flat cards. */
export function cardMaterial(shared: SharedUniforms): THREE.MeshLambertMaterial {
  // Cards are modelled with both windings, so single-sided drawing shows both faces
  // without the renderer flipping the (upward) normal on the far one.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  patch(material, shared, { sway: true, mottle: 0, grain: 0, tile: 1, upNormals: true });
  return material;
}

/** Ground: the painted texture, plus fine grain so it never looks blurred up close. */
export function groundMaterial(shared: SharedUniforms, map: THREE.Texture): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ map });
  // A 24 m tile: grain of 0.2 to 0.8 m, blotches of 1 to 6 m.
  patch(material, shared, { sway: false, mottle: 0.08, grain: 0.12, tile: 24, ground: true });
  return material;
}

export function skirtMaterial(shared: SharedUniforms): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  patch(material, shared, { sway: false, mottle: 0.14, grain: 0.06, tile: 60 });
  return material;
}

