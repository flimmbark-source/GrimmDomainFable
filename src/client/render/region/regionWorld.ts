/**
 * Assembles a region scene from a MapDef that carries terrain and region
 * data. The M1 forest crossing keeps its original renderer (world.ts); this
 * one is used for any map with `region` set.
 */
import * as THREE from 'three';
import type { MapDef } from '../../../shared/sim/map.ts';
import { surfaceHeight } from '../../../shared/sim/terrain.ts';
import type { AssetLibrary } from '../assets.ts';
import { VALE as C } from '../palette.ts';
import type { World } from '../world.ts';
import { buildBackdrop, buildLights, buildSky, buildSmoke, buildWheels } from './atmosphere.ts';
import { buildBarriers } from './barriers.ts';
import { buildGround } from './ground.ts';
import { buildInstances } from './instances.ts';
import { cardMaterial, painterlyMaterial, type SharedUniforms } from './materials.ts';
import { bakeStaticShadows, type StaticShadows } from './staticShadows.ts';
import { buildWater } from './water.ts';

const CHUNK = 62;
const LOD_DISTANCE = 78;

/** Let the browser breathe between build stages (network keep-alives, the loading text). */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function buildRegionWorld(
  scene: THREE.Scene, map: MapDef, assets: AssetLibrary, renderer: THREE.WebGLRenderer, progress: (stage: string) => void = () => {},
): Promise<World> {
  const region = map.region!;
  const root = new THREE.Group();
  root.name = `region:${map.id}`;
  const shared: SharedUniforms = {
    uTime: { value: 0 }, uFastShadows: { value: false }, uBakedShadows: { value: false },
    uGroundShadow: { value: null }, uStaticDepth: { value: null },
    uStaticMatrix: { value: new THREE.Matrix4() }, uStaticArea: { value: new THREE.Vector4() },
  };

  scene.fog = new THREE.Fog(C.fog, 95, 620);
  scene.background = new THREE.Color(C.fog);
  root.add(buildSky(shared));
  const lights = buildLights();
  root.add(lights.hemisphere, lights.sun, lights.sun.target);

  const solid = painterlyMaterial(shared);
  const card = cardMaterial(shared);
  progress('painting the ground');
  await breathe();
  const ground = buildGround(map, region, shared, renderer.capabilities.getMaxAnisotropy());
  root.add(ground.group);
  const water = buildWater(map, shared);
  if (water) root.add(water.mesh);
  progress('laying hedges and walls');
  await breathe();
  const barriers = buildBarriers(map, ground.heightAt, solid, CHUNK);
  root.add(barriers.group);
  progress('planting orchards');
  await breathe();
  const instances = buildInstances(map, region, assets, ground.heightAt, { solid, card }, CHUNK, LOD_DISTANCE);
  root.add(instances.group);
  await breathe();
  const wheels = buildWheels(map, region, assets, solid);
  root.add(wheels.group);
  const smoke = buildSmoke(region, ground.heightAt, shared);
  if (smoke) root.add(smoke.points);
  root.add(buildBackdrop(map, assets, ground.heightAt, solid));
  await breathe();

  scene.add(root);
  const groundMesh = ground.group.children[0] as THREE.Mesh;
  const staticCasters: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.castShadow && !wheels.spinning.includes(node)) staticCasters.push(node);
  });
  const bakeCasters = staticCasters.filter((mesh) => mesh.visible);
  let baked: StaticShadows | undefined;
  const bakedShadows: NonNullable<World['bakedShadows']> = {
    get enabled() { return shared.uBakedShadows.value; },
    set(enabled) {
      if (enabled && !baked) {
        root.updateMatrixWorld(true);
        baked = bakeStaticShadows(renderer, groundMesh, bakeCasters, lights.sun);
        shared.uGroundShadow.value = baked.ground;
        shared.uStaticDepth.value = baked.depth;
        shared.uStaticMatrix.value.copy(baked.matrix);
        shared.uStaticArea.value.copy(baked.area);
      }
      if (enabled === shared.uBakedShadows.value) return;
      shared.uBakedShadows.value = enabled;
      for (const mesh of staticCasters) mesh.castShadow = !enabled;
      lights.sun.shadow.mapSize.setScalar(enabled ? 1024 : 2048);
      lights.sun.shadow.needsUpdate = true;
    },
  };
  const restoreBakedShadows = () => {
    const enabled = bakedShadows.enabled;
    bakedShadows.set(false);
    baked?.dispose();
    baked = undefined;
    shared.uGroundShadow.value = null;
    shared.uStaticDepth.value = null;
    if (enabled) bakedShadows.set(true);
  };
  renderer.domElement.addEventListener('webglcontextrestored', restoreBakedShadows);
  const focus = new THREE.Vector3();
  return {
    root,
    ground: groundMesh,
    sun: lights.sun,
    fastShadows: shared.uFastShadows,
    bakedShadows,
    heightAt: (x, z) => surfaceHeight(map, x, z),
    update: (dt, camera, lookAt, mode) => {
      shared.uTime.value += dt;
      wheels.update(dt);
      instances.update(camera.position);
      focus.copy(lookAt);
      // Shadows cover what the camera can see: wide from above, tight from the ground.
      lights.follow(focus, mode === 'hero' ? 46 : Math.max(46, Math.min(84, camera.position.y * 1.25)));
    },
    stats: () => {
      // Triangles submitted per layer if everything were on screen (before culling and LOD).
      const out: Record<string, number> = { ...instances.counts };
      root.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || !node.visible) return;
        const geo = node.geometry as THREE.BufferGeometry;
        const tris = (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
        const layer = `tris_${node.name.split(':')[0] || 'other'}`;
        out[layer] = (out[layer] ?? 0) + tris * (node instanceof THREE.InstancedMesh ? node.count : 1);
      });
      return out;
    },
    dispose: () => {
      renderer.domElement.removeEventListener('webglcontextrestored', restoreBakedShadows);
      scene.remove(root);
      ground.dispose();
      water?.dispose();
      barriers.dispose();
      smoke?.dispose();
      solid.dispose();
      card.dispose();
      baked?.dispose();
    },
  };
}
