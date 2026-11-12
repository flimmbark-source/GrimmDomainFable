import * as THREE from 'three';
import type { Command, Snapshot, Team } from '../shared/protocol.ts';
import { getMap } from '../shared/sim/map.ts';
import { AudioCues } from './audio.ts';
import { CameraRig, type CameraMode } from './cameras.ts';
import { Hud } from './hud.ts';
import { InputController } from './input.ts';
import { connect, serverUrl } from './net.ts';
import { ActorLayer } from './render/actors.ts';
import { AssetLibrary } from './render/assets.ts';
import { MarkerLayer } from './render/markers.ts';
import { buildCollisionDebug, buildWorld } from './render/world.ts';

/** Read-only hooks for automated browser verification and manual debugging. */
interface DebugApi {
  ready: boolean;
  snapshot(): Snapshot | null;
  mode(): CameraMode;
  setMode(mode: CameraMode): void;
  send(command: Command): void;
  renderedPosition(actorId: number): { x: number; z: number } | null;
  screenPosition(actorId: number): { x: number; y: number } | null;
  camera(): { position: number[]; fov: number };
  /** Screen pixel of a ground point, for driving real mouse clicks in tests. */
  worldToScreen(x: number, z: number): { x: number; y: number };
  /** Centre the strategy camera on a ground point. */
  focus(x: number, z: number): void;
  stats(): { fps: number; drawCalls: number; triangles: number; snapshots: number; renderer: string; assets: Record<string, string> };
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
  const hud = new Hud(() => input.setMode(rig.mode === 'rts' ? 'hero' : 'rts'));
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
  const connection = await connect(params.get('spectate') === '1' ? { spectate: true } : { team });
  const map = getMap(connection.welcome.mapId);

  const scene = new THREE.Scene();
  buildWorld(scene, map, assets);
  const debugOverlay = buildCollisionDebug(map);
  scene.add(debugOverlay);
  const actors = new ActorLayer(assets);
  scene.add(actors.group);
  const markers = new MarkerLayer(assets);
  scene.add(markers.group);
  const audio = new AudioCues();

  const rig = new CameraRig(map.halfSize + 6);
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
  connection.onClosed((reason) => hud.setStatus(`Disconnected: ${reason}. Reload to rejoin.`, 'error'));

  const input = new InputController({
    canvas,
    rig,
    send: (command) => connection.send(command),
    heroPosition,
    toggleDebug: () => {
      debugOverlay.visible = !debugOverlay.visible;
      markers.debug.visible = debugOverlay.visible;
    },
    onModeChanged: (mode) => hud.setMode(mode),
    ownedMonster: () => actors.latest?.actors.find((a) => a.kind === 'monster' && a.mode !== undefined)?.id ?? null,
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
      if (params.get('cam') === 'hero') input.setMode('hero');
      if (params.get('debug') === '1') {
        debugOverlay.visible = true;
        markers.debug.visible = true;
      }
    }
    rig.update(dt, window.innerWidth / window.innerHeight, hero);
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
      return p ? { x: p.x, z: p.z } : null;
    },
    screenPosition: (id) => {
      const p = actors.renderedPosition(id);
      if (!p) return null;
      const v = p.clone().setY(1).project(rig.camera);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
    },
    camera: () => ({ position: rig.camera.position.toArray(), fov: rig.camera.fov }),
    worldToScreen: (x, z) => {
      const v = new THREE.Vector3(x, 0, z).project(rig.camera);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
    },
    focus: (x, z) => rig.focusOn(new THREE.Vector3(x, 0, z)),
    stats: () => ({
      fps,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      snapshots: snapshotCount,
      renderer: renderer.getContext().getParameter(renderer.getContext().VERSION) as string,
      assets: { ...assets.sources } as Record<string, string>,
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
