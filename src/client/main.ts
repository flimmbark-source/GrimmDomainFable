import * as THREE from 'three';
import type { RenderItem } from 'three/src/renderers/webgl/WebGLRenderLists.js';
import type { Command, Snapshot, Team } from '../shared/protocol.ts';
import { roomForRegion } from '../shared/protocol.ts';
import { propsNearBox, sightBlocked } from '../shared/sim/geometry.ts';
import { boundsOf, getMap, type MapDef } from '../shared/sim/map.ts';
import { surfaceHeight } from '../shared/sim/terrain.ts';
import { AudioCues } from './audio.ts';
import { CameraRig, type CameraMode } from './cameras.ts';
import { Hud } from './hud.ts';
import { InputController } from './input.ts';
import { connect, serverUrl } from './net.ts';
import { PlayerHud } from './player-hud.ts';
import { ActorLayer } from './render/actors.ts';
import { AssetLibrary } from './render/assets.ts';
import { MarkerLayer } from './render/markers.ts';
import { buildRegionWorld } from './render/region/regionWorld.ts';
import { VisionFog } from './render/region/visionFog.ts';
import { buildCollisionDebug, buildWorld, type World } from './render/world.ts';

/**
 * How far the hero camera's sight line stays clear of tall solid things.
 * Uses the map's own sight-blocking colliders, minus ordinary tree trunks
 * (a camera that jumped at every orchard tree would be unusable).
 */
/** Crown of each tree kind at scale 1: centre height, horizontal and vertical radius (render-side figures). */
const CROWNS: Partial<Record<string, [number, number, number]>> = {
  tree_apple: [3.4, 2.3, 1.5], tree_apple_old: [3.9, 2.6, 1.6], tree_apple_feral: [3.9, 2.0, 1.8], tree_apple_young: [2.3, 0.7, 0.6],
  tree_witness: [10.5, 6.2, 4.0], tree_oldwood: [9.6, 3.9, 3.2], tree_oak: [5.9, 3.6, 2.4], tree_willow: [4.0, 3.2, 2.2],
  tree_birch: [6.2, 1.7, 2.0], coppice_stool: [2.6, 1.2, 2.0], tree_pine: [4.0, 1.9, 2.6], tree_dead: [3.8, 1.2, 1.2],
};

/** Is a point inside some tree's crown (an ellipsoid round its centre)? */
function foliageTest(map: MapDef, heightAt: (x: number, z: number) => number): (x: number, y: number, z: number) => boolean {
  return (x, y, z) => {
    const near = propsNearBox(map, x - 9, x + 9, z - 9, z + 9);
    const list = near ?? map.props.map((_, i) => i);
    for (const i of list) {
      const p = map.props[i]!;
      const crown = CROWNS[p.kind];
      if (!crown) continue;
      const [cy, rh, rv] = crown;
      // Lumps and fruit poke out past the nominal crown, and the lens has a
      // near plane: test a generously padded ellipsoid.
      const h = rh * p.scale * 1.3 + 0.6;
      const v = rv * p.scale * 1.3 + 0.4;
      const dx = (x - p.x) / h;
      const dz = (z - p.z) / h;
      const dy = (y - heightAt(p.x, p.z) - cy * p.scale) / v;
      if (dx * dx + dy * dy + dz * dz < 1) return true;
    }
    return false;
  };
}

function cameraClearance(map: MapDef): (ax: number, az: number, bx: number, bz: number) => number {
  const solid: MapDef = {
    ...map,
    id: `${map.id}#camera`,
    props: map.props.filter((p) => p.blocksSight && (p.collider.shape !== 'circle' || p.collider.radius >= 1.2)),
  };
  return (ax, az, bx, bz) => {
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (sightBlocked(solid, ax, az, ax + (bx - ax) * t, az + (bz - az) * t)) return Math.max(0, (i - 1.3) / steps);
    }
    return 1;
  };
}

interface RenderProfile {
  test: string;
  buffer: string;
  fps: number;
  medianMs: number;
  p95Ms: number;
}

function frontToBack(a: RenderItem, b: RenderItem): number {
  return a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder ||
    a.z - b.z || a.material.id - b.material.id || a.id - b.id;
}

/** Compare the same stationary view with different sources of rendering cost. */
async function profileRendering(
  renderer: THREE.WebGLRenderer, { sun, fastShadows }: World,
): Promise<RenderProfile[]> {
  const pixelRatio = renderer.getPixelRatio();
  const { shadowMap } = renderer;
  const autoUpdate = shadowMap.autoUpdate;
  const lightAutoUpdate = sun.shadow.autoUpdate;
  const castsShadow = sun.castShadow;
  const originalFastShadows = fastShadows?.value ?? false;
  const results: RenderProfile[] = [];
  const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

  try {
    for (const { test, scale, updateShadows, updateLight, depthSort, skipShadows, fastFilter } of [
      { test: 'Full resolution, current settings', scale: 1, updateShadows: true, updateLight: lightAutoUpdate },
      ...(fastShadows ? [{
        test: 'Full resolution, single-lookup shadows', scale: 1, updateShadows: true, updateLight: lightAutoUpdate, fastFilter: true,
      }, {
        test: 'Full resolution, near surfaces first', scale: 1, updateShadows: true, updateLight: lightAutoUpdate, depthSort: true,
      }] : []),
      { test: 'Full resolution, shadows every frame', scale: 1, updateShadows: true, updateLight: true },
      { test: 'Half pixel count, shadows every frame', scale: Math.SQRT1_2, updateShadows: true, updateLight: true },
      { test: 'Full resolution, reuse shadows', scale: 1, updateShadows: false, updateLight: true },
      { test: 'Full resolution, shadows off', scale: 1, updateShadows: false, updateLight: true, skipShadows: true },
    ]) {
      // Near opaque surfaces can reject fragments behind them. Explicit
      // ordering still controls the sky and hero silhouette.
      renderer.setOpaqueSort(depthSort ? frontToBack : null);
      if (fastShadows) fastShadows.value = fastFilter ?? originalFastShadows;
      renderer.setPixelRatio(pixelRatio * scale);
      sun.castShadow = castsShadow && !skipShadows;
      shadowMap.autoUpdate = updateShadows;
      sun.shadow.autoUpdate = updateLight;
      shadowMap.needsUpdate = true;
      sun.shadow.needsUpdate = true;
      const settleUntil = performance.now() + 1000;
      while (await nextFrame() < settleUntil) { /* wait for the resize or shadow update */ }

      const frameTimes: number[] = [];
      const start = await nextFrame();
      let previous = start;
      while (previous - start < 2500) {
        const now = await nextFrame();
        if (document.hidden) throw new Error('Keep the game tab visible while profiling.');
        frameTimes.push(now - previous);
        previous = now;
      }
      frameTimes.sort((a, b) => a - b);
      const percentile = (fraction: number) => Number(frameTimes[Math.ceil(frameTimes.length * fraction) - 1]!.toFixed(1));
      results.push({
        test,
        buffer: `${renderer.domElement.width}×${renderer.domElement.height}`,
        fps: Math.round(frameTimes.length * 1000 / (previous - start)),
        medianMs: percentile(0.5),
        p95Ms: percentile(0.95),
      });
    }
  } finally {
    renderer.setOpaqueSort(null);
    if (fastShadows) fastShadows.value = originalFastShadows;
    renderer.setPixelRatio(pixelRatio);
    sun.castShadow = castsShadow;
    shadowMap.autoUpdate = autoUpdate;
    sun.shadow.autoUpdate = lightAutoUpdate;
    shadowMap.needsUpdate = true;
    sun.shadow.needsUpdate = true;
  }
  return results;
}

/** Hooks for automated browser verification and manual debugging. */
interface DebugApi {
  ready: boolean;
  snapshot(): Snapshot | null;
  mode(): CameraMode;
  setMode(mode: CameraMode): void;
  send(command: Command): void;
  renderedPosition(actorId: number): { x: number; y: number; z: number } | null;
  screenPosition(actorId: number): { x: number; y: number } | null;
  camera(): { position: number[]; fov: number };
  /** Screen pixel of a ground point, for driving real mouse clicks in tests. */
  worldToScreen(x: number, z: number): { x: number; y: number };
  /** Centre the strategy camera on a ground point. */
  focus(x: number, z: number): void;
  profileRendering?: () => Promise<RenderProfile[]>;
  profileVillagePan?: () => Promise<RenderProfile[]>;
  stats(): {
    fps: number; drawCalls: number; triangles: number; snapshots: number; renderer: string; assets: Record<string, string>;
    /** GPU objects alive, and how much scenery the region placed. */
    geometries: number; textures: number; programs: number; scene: Record<string, number>; gpu: string; jsHeapMb: number | null;
  };
  /** Pose the cameras directly (evidence capture and tests): hero orbit yaw / pitch / distance, strategy distance. */
  rig(pose: { yaw?: number; pitch?: number; distance?: number; rtsDistance?: number }): void;
  /** Is the camera lens currently inside a tree crown? (false on maps without region data) */
  cameraInFoliage(): boolean;
  /** Id of the map the server put this client on. */
  mapId(): string;
  /** Height of the walking surface at a ground point (0 on flat maps). */
  height(x: number, z: number): number;
  /** Cues played so far, by kind, and whether the audio context is running. */
  audio(): { played: Record<string, number>; };
  /** Text of the on-screen attention indicator and report list, as shown. */
  hud(): { attention: string; attentionState: string; reports: string; objective: string };
  /** True once the server has streamed development-only perception data. */
  debugStream(): boolean;
}
declare global {
  interface Window {
    __grimm?: DebugApi;
  }
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const toggleCamera = () => input.setMode(rig.mode === 'rts' ? 'hero' : 'rts');
  const hud = new Hud(toggleCamera);
  const playerHud = params.get('region') === 'orchard_operation' && params.get('spectate') !== '1' && params.get('team') !== 'dark'
    ? new PlayerHud(params.get('hud') === 'preview', (action) => {
      if (action === 'camera') toggleCamera();
      if (action === 'sneak') input.toggleSneak();
      if (action === 'whistle') connection.send({ type: 'whistle' });
      if (action === 'relay' && actors.latest?.operation?.interaction) connection.send({ type: 'workOperation' });
      if (action === 'stop') connection.send({ type: 'stop' });
    })
    : null;
  const canvas = document.getElementById('view') as HTMLCanvasElement;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    hud.setStatus('This browser could not create a WebGL2 context. A desktop browser with WebGL2 is required.', 'error');
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  hud.setStatus('Loading assets…');
  const assets = new AssetLibrary();
  await assets.load();

  hud.setStatus(`Connecting to ${serverUrl()}…`);
  const requestedTeam = params.get('team');
  const team: Team | undefined = requestedTeam === 'dark' || requestedTeam === 'light' ? requestedTeam : 'light';
  // `?region=` only picks which server room to join; the server decides the map.
  const connection = await connect(params.get('spectate') === '1' ? { spectate: true } : { team }, roomForRegion(params.get('region')));
  const map = getMap(connection.welcome.mapId);

  const scene = new THREE.Scene();
  // A map with region data gets the region renderer; the M1 crossing keeps its own.
  // `?render=0`: an observer tab for automated checks. It joins, receives its
  // own snapshots and runs the HUD, but builds no scenery and draws nothing.
  const observerOnly = params.get('render') === '0';
  const world: World = observerOnly
    ? { root: new THREE.Group(), ground: new THREE.Mesh(), sun: new THREE.DirectionalLight(), heightAt: (x: number, z: number) => surfaceHeight(map, x, z) }
    : map.region
    ? await buildRegionWorld(scene, map, assets, renderer, (stage) => hud.setStatus(`Building the region: ${stage}…`))
    : buildWorld(scene, map, assets);
  if (world.fastShadows) world.fastShadows.value = params.get('fastShadows') === '1';
  if (params.get('bakedShadows') === '1' && world.bakedShadows) {
    hud.setStatus('Baking terrain shadows…');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    world.bakedShadows.set(true);
  }
  const visionFog = !observerOnly && map.region && connection.welcome.slot !== null ? new VisionFog(map) : null;
  visionFog?.attach(world.root);
  const debugOverlay = buildCollisionDebug(map, world.heightAt);
  scene.add(debugOverlay);
  const actors = new ActorLayer(assets, world.heightAt, Boolean(map.region), Boolean(map.region) && params.get('region') === 'orchard_operation');
  scene.add(actors.group);
  const markers = new MarkerLayer(assets, world.heightAt);
  scene.add(markers.group);
  const audio = new AudioCues();

  const bounds = boundsOf(map);
  const rig = map.region
    ? new CameraRig(
        { minX: bounds.minX - 6, maxX: bounds.maxX + 6, minZ: bounds.minZ - 6, maxZ: bounds.maxZ + 6 },
        { heightAt: world.heightAt, clearAlong: cameraClearance(map), inFoliage: foliageTest(map, world.heightAt) },
      )
    : new CameraRig(map.halfSize + 6);
  const heroPosition = (): THREE.Vector3 | null => {
    const id = actors.latest?.you?.actorId;
    return id == null ? null : actors.renderedPosition(id);
  };

  let snapshotCount = 0;
  let wasSpotted = false;
  let newestAlert = 0;
  let debugStream = false;
  connection.onSnapshot((snapshot) => {
    snapshotCount++;
    const now = performance.now();
    actors.push(snapshot, now);
    hud.setSnapshot(snapshot);
    playerHud?.setEnabled(Boolean(snapshot.operation && snapshot.you?.team === 'light'));
    playerHud?.setSnapshot(snapshot);
    // Audio: world sounds this hero can hear, plus the local attention cue.
    for (const sound of snapshot.sounds) audio.play(sound);
    const you = snapshot.you;
    if (you?.team === 'light') {
      audio.attention(you.attention, you.spotted, now);
      if (you.spotted && !wasSpotted) audio.spotted();
      wasSpotted = you.spotted;
    }
    for (const e of snapshot.evidence) {
      if (e.kind !== 'sighting' || e.id <= newestAlert) continue;
      newestAlert = e.id;
      audio.alert();
    }
  });
  connection.onDebug((message) => {
    debugStream = true;
    markers.setDebug(message);
  });
  connection.onClosed((reason) => {
    playerHud?.setEnabled(false);
    hud.setStatus(`Disconnected: ${reason}. Reload to rejoin.`, 'error');
  });

  const input = new InputController({
    canvas,
    rig,
    send: (command) => connection.send(command),
    heroPosition,
    toggleDebug: () => {
      debugOverlay.visible = !debugOverlay.visible;
      markers.debug.visible = debugOverlay.visible;
      document.body.classList.toggle('show-playtest-debug', debugOverlay.visible);
    },
    onModeChanged: (mode) => {
      hud.setMode(mode);
      playerHud?.setMode(mode === 'hero');
    },
    ownedMonster: () => actors.latest?.actors.find((a) => a.kind === 'monster' && a.mode !== undefined)?.id ?? null,
    workOperation: () => Boolean(actors.latest?.operation?.interaction),
    handleUiKey: (event) => playerHud?.handleKey(event) ?? false,
    inventoryOpen: () => playerHud?.isOpen ?? false,
    ...(map.region ? { heightAt: world.heightAt } : {}),
  });
  hud.setMode(rig.mode);
  const slot = connection.welcome.slot;
  hud.setStatus(slot === null ? 'Connected as spectator' : `Connected · you control slot ${slot}`, slot === null ? 'warn' : 'ok');

  const resize = () => renderer.setSize(window.innerWidth, window.innerHeight, false);
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  let fps = 0;
  let frames = 0;
  let fpsWindowStart = last;
  let initialFocusDone = false;
  let profiling = false;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    input.update(dt);
    actors.update(now, dt);
    if (actors.latest) markers.update(actors.latest, now);
    const hero = heroPosition();
    if (hero && !initialFocusDone) {
      initialFocusDone = true;
      // Start centered on the hero and follow their movement in strategy view.
      rig.followHero(hero);
      if (params.get('cam') === 'hero' || (playerHud && params.get('cam') !== 'rts')) input.setMode('hero');
      if (params.get('debug') === '1') {
        debugOverlay.visible = true;
        markers.debug.visible = true;
        document.body.classList.add('show-playtest-debug');
      }
    }
    rig.update(dt, window.innerWidth / window.innerHeight, hero);
    if (observerOnly) return;
    if (actors.latest) visionFog?.update(actors.latest, now);
    world.update?.(dt, rig.camera, rig.lookTarget, rig.mode);
    renderer.render(scene, rig.camera);

    frames++;
    if (now - fpsWindowStart >= 500) {
      fps = (frames * 1000) / (now - fpsWindowStart);
      frames = 0;
      fpsWindowStart = now;
      const s = actors.latest;
      const me = s?.actors.find((a) => a.id === s.you?.actorId);
      hud.setDebug(
        `tick ${s?.tick ?? '-'}  ${fps.toFixed(0)} fps  ${renderer.info.render.calls} draws  ${renderer.info.render.triangles} tris\n` +
          `hero ${me ? `${me.x.toFixed(2)}, ${me.z.toFixed(2)}${me.moving ? ' moving' : ''}` : '-'}  view ${rig.mode}`,
      );
    }
  });

  window.__grimm = {
    ready: true,
    snapshot: () => actors.latest,
    mode: () => rig.mode,
    setMode: (mode) => input.setMode(mode),
    send: (command) => connection.send(command),
    renderedPosition: (id) => {
      const p = actors.renderedPosition(id);
      return p ? { x: p.x, y: p.y, z: p.z } : null;
    },
    screenPosition: (id) => {
      const p = actors.renderedPosition(id);
      if (!p) return null;
      const v = p.clone().setY(p.y + 1).project(rig.camera);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
    },
    camera: () => ({ position: rig.camera.position.toArray(), fov: rig.camera.fov }),
    worldToScreen: (x, z) => {
      const v = new THREE.Vector3(x, world.heightAt(x, z), z).project(rig.camera);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
    },
    focus: (x, z) => rig.focusOn(new THREE.Vector3(x, 0, z)),
    ...(params.get('profile') === '1' && !observerOnly ? {
      profileRendering: async () => {
        if (profiling) throw new Error('A rendering profile is already running.');
        profiling = true;
        try {
          return await profileRendering(renderer, world);
        } finally {
          profiling = false;
        }
      },
      ...(world.bakedShadows ? {
        profileVillagePan: async () => {
          if (profiling) throw new Error('A rendering profile is already running.');
          profiling = true;
          const baked = world.bakedShadows!;
          const previous = baked.enabled;
          const mode = rig.mode;
          const restoreStrategyView = rig.preserveStrategyView();
          const fastFilter = world.fastShadows?.value ?? false;
          const results: RenderProfile[] = [];
          const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
          try {
            input.setMode('rts');
            rig.rtsDistance = 52;
            if (world.fastShadows) world.fastShadows.value = false;
            // Use identical passes in reverse order to reduce warm-up bias.
            for (const enabled of [false, true, true, false]) {
              baked.set(enabled);
              rig.focusOn(new THREE.Vector3(-20, 0, 11));
              const settle = performance.now() + 1100;
              while (await nextFrame() < settle) { /* allow shaders and camera to settle */ }
              const frameTimes: number[] = [];
              const start = await nextFrame();
              let lastFrame = start;
              const target = new THREE.Vector3(0, 0, 11);
              do {
                const frame = await nextFrame();
                if (document.hidden) throw new Error('Keep the game tab visible while profiling.');
                frameTimes.push(frame - lastFrame);
                lastFrame = frame;
                target.x = -20 + Math.min(1, (frame - start) / 3500) * 40;
                rig.focusOn(target);
              } while (lastFrame - start < 3500);
              frameTimes.sort((a, b) => a - b);
              results.push({
                test: enabled ? 'Baked terrain + live actors' : 'Original live shadows',
                buffer: `${canvas.width}×${canvas.height}`,
                fps: Math.round(frameTimes.length * 1000 / (lastFrame - start)),
                medianMs: Number(frameTimes[Math.ceil(frameTimes.length * 0.5) - 1]!.toFixed(1)),
                p95Ms: Number(frameTimes[Math.ceil(frameTimes.length * 0.95) - 1]!.toFixed(1)),
              });
            }
          } finally {
            baked.set(previous);
            if (world.fastShadows) world.fastShadows.value = fastFilter;
            input.setMode(mode);
            restoreStrategyView();
            profiling = false;
          }
          return results;
        },
      } : {}),
    } : {}),
    rig: (pose) => {
      if (pose.yaw !== undefined) rig.heroYaw = pose.yaw;
      if (pose.pitch !== undefined) rig.heroPitch = pose.pitch;
      if (pose.distance !== undefined) rig.heroDistance = pose.distance;
      if (pose.rtsDistance !== undefined) rig.rtsDistance = pose.rtsDistance;
    },
    cameraInFoliage: () => {
      if (!map.region) return false;
      const p = rig.camera.position;
      return foliageTest(map, world.heightAt)(p.x, p.y, p.z);
    },
    mapId: () => map.id,
    height: (x, z) => world.heightAt(x, z),
    stats: () => ({
      fps,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      snapshots: snapshotCount,
      renderer: renderer.getContext().getParameter(renderer.getContext().VERSION) as string,
      assets: { ...assets.sources } as Record<string, string>,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      scene: world.stats?.() ?? {},
      gpu: (() => {
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      })(),
      jsHeapMb: (() => {
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        return memory ? Math.round(memory.usedJSHeapSize / 1048576) : null;
      })(),
    }),
    audio: () => ({ played: { ...audio.played } }),
    hud: () => ({
      attention: document.getElementById('attention-label')?.textContent ?? '',
      attentionState: document.getElementById('attention')?.dataset.state ?? '',
      reports: document.getElementById('reports')?.textContent ?? '',
      objective: document.getElementById('objective')?.textContent ?? '',
    }),
    debugStream: () => debugStream,
  };
}

start().catch((error: unknown) => {
  console.error(error);
  const status = document.getElementById('status');
  if (status && status.dataset.kind !== 'error') {
    status.textContent = `Could not start: ${error instanceof Error ? error.message : String(error)}. Is the game server running (npm run dev)?`;
    status.dataset.kind = 'error';
  }
});
