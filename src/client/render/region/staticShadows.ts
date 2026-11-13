import * as THREE from 'three';

export interface StaticShadows {
  ground: THREE.Texture;
  depth: THREE.DepthTexture;
  matrix: THREE.Matrix4;
  area: THREE.Vector4;
  dispose(): void;
}

/** Render fixed casters once, then project their sun visibility onto the terrain. */
export function bakeStaticShadows(
  renderer: THREE.WebGLRenderer, ground: THREE.Mesh, casters: readonly THREE.Mesh[], sun: THREE.DirectionalLight,
): StaticShadows {
  ground.geometry.computeBoundingBox();
  const bounds = ground.geometry.boundingBox!;
  const centre = bounds.getCenter(new THREE.Vector3());
  const area = new THREE.Vector4(bounds.min.x, bounds.min.z, bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 500);
  const direction = sun.position.clone().sub(sun.target.position).normalize();
  camera.position.copy(centre).addScaledVector(direction, 250);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  const lightBounds = new THREE.Box3().makeEmpty();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        lightBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      }
    }
  }
  camera.left = lightBounds.min.x - 1;
  camera.right = lightBounds.max.x + 1;
  camera.bottom = lightBounds.min.y - 1;
  camera.top = lightBounds.max.y + 1;
  camera.updateProjectionMatrix();
  const matrix = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1,
  ).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);

  const size = 2048;
  const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
  depth.compareFunction = THREE.LessEqualCompare;
  depth.minFilter = depth.magFilter = THREE.LinearFilter;
  const shadowTarget = new THREE.WebGLRenderTarget(size, size, { depthTexture: depth });
  const depthOnly = new THREE.MeshBasicMaterial({ side: THREE.BackSide, colorWrite: false });
  const shadowScene = new THREE.Scene();
  for (const caster of casters) {
    const copy = caster.clone(false);
    copy.material = depthOnly;
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(caster.matrixWorld);
    shadowScene.add(copy);
  }

  const groundTarget = new THREE.WebGLRenderTarget(size, Math.round(size * area.w / area.z), {
    format: THREE.RedFormat, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
  });
  const projection = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    uniforms: {
      area: { value: area }, staticDepth: { value: depth }, shadowMatrix: { value: matrix },
      bias: { value: sun.shadow.bias }, normalBias: { value: sun.shadow.normalBias },
    },
    vertexShader: /* glsl */ `
      uniform vec4 area;
      uniform mat4 shadowMatrix;
      uniform float normalBias;
      varying vec3 shadowCoord;
      void main() {
        shadowCoord = (shadowMatrix * vec4(position + normal * normalBias, 1.0)).xyz;
        gl_Position = vec4((position.xz - area.xy) / area.zw * 2.0 - 1.0, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform highp sampler2DShadow staticDepth;
      uniform float bias;
      varying vec3 shadowCoord;
      void main() {
        vec3 p = shadowCoord + vec3(0.0, 0.0, bias);
        vec2 texel = 1.0 / vec2(textureSize(staticDepth, 0));
        float visibility = (
          texture(staticDepth, p) +
          texture(staticDepth, p + vec3(texel.x, 0.0, 0.0)) +
          texture(staticDepth, p - vec3(texel.x, 0.0, 0.0)) +
          texture(staticDepth, p + vec3(0.0, texel.y, 0.0)) +
          texture(staticDepth, p - vec3(0.0, texel.y, 0.0))
        ) * 0.2;
        gl_FragColor = vec4(visibility, 0.0, 0.0, 1.0);
      }
    `,
  });
  const groundScene = new THREE.Scene();
  const receiver = new THREE.Mesh(ground.geometry, projection);
  receiver.frustumCulled = false;
  groundScene.add(receiver);
  const previousTarget = renderer.getRenderTarget();
  const previousColor = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(shadowTarget);
    renderer.render(shadowScene, camera);
    renderer.setClearColor(0xffffff, 1);
    renderer.setRenderTarget(groundTarget);
    renderer.render(groundScene, camera);
  } catch (error) {
    groundTarget.dispose();
    shadowTarget.dispose();
    throw error;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    depthOnly.dispose();
    projection.dispose();
    for (const object of shadowScene.children) {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
  }
  return {
    ground: groundTarget.texture, depth, matrix, area,
    dispose: () => { groundTarget.dispose(); shadowTarget.dispose(); },
  };
}
