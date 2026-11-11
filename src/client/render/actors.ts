/**
 * Actor presentation. Positions come exclusively from server snapshots; this
 * module interpolates between the two most recent ones and adds purely
 * cosmetic motion (walk bob). It never moves an actor on its own authority.
 */
import * as THREE from 'three';
import type { ActorView, Snapshot } from '../../shared/protocol.ts';
import type { AssetId, AssetLibrary } from './assets.ts';
import { PALETTE as P } from './palette.ts';

/** Render this far in the past so there are always two snapshots to blend. */
const INTERP_DELAY_MS = 100;

interface TimedSnapshot {
  time: number;
  snapshot: Snapshot;
}

interface ActorVisual {
  root: THREE.Group;
  model: THREE.Object3D;
  yaw: number;
  walkPhase: number;
}

function assetFor(actor: ActorView): AssetId {
  if (actor.kind === 'monster') return 'monster_beast';
  return actor.team === 'dark' ? 'hero_dark' : 'hero_light';
}

export class ActorLayer {
  readonly group = new THREE.Group();
  private readonly visuals = new Map<number, ActorVisual>();
  private readonly buffer: TimedSnapshot[] = [];
  private readonly selection: THREE.Mesh;
  private readonly orderMarker: THREE.Mesh;

  constructor(private readonly assets: AssetLibrary) {
    this.group.name = 'actors';
    const ring = new THREE.RingGeometry(0.75, 0.92, 28);
    ring.rotateX(-Math.PI / 2);
    this.selection = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0x7dff7a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.selection.visible = false;
    const marker = new THREE.RingGeometry(0.28, 0.45, 20);
    marker.rotateX(-Math.PI / 2);
    this.orderMarker = new THREE.Mesh(marker, new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.orderMarker.visible = false;
    this.group.add(this.selection, this.orderMarker);
  }

  push(snapshot: Snapshot, now: number): void {
    this.buffer.push({ time: now, snapshot });
    while (this.buffer.length > 12) this.buffer.shift();
  }

  get latest(): Snapshot | null {
    return this.buffer.at(-1)?.snapshot ?? null;
  }

  /** Interpolated ground position currently drawn for an actor. */
  renderedPosition(actorId: number): THREE.Vector3 | null {
    return this.visuals.get(actorId)?.root.position ?? null;
  }

  update(now: number, dt: number): void {
    const latest = this.buffer.at(-1);
    if (!latest) return;
    const renderTime = now - INTERP_DELAY_MS;

    let older = this.buffer[0]!;
    let newer = latest;
    for (let i = this.buffer.length - 1; i > 0; i--) {
      if (this.buffer[i - 1]!.time <= renderTime) {
        older = this.buffer[i - 1]!;
        newer = this.buffer[i]!;
        break;
      }
    }
    const span = newer.time - older.time;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - older.time) / span)) : 1;
    const previous = new Map(older.snapshot.actors.map((a) => [a.id, a]));

    const alive = new Set<number>();
    for (const actor of newer.snapshot.actors) {
      alive.add(actor.id);
      let visual = this.visuals.get(actor.id);
      if (!visual) {
        visual = this.createVisual(actor);
        visual.root.position.set(actor.x, 0, actor.z);
      }
      const from = previous.get(actor.id) ?? actor;
      visual.root.position.set(from.x + (actor.x - from.x) * t, 0, from.z + (actor.z - from.z) * t);

      // Turn smoothly towards the simulated facing.
      const targetYaw = Math.atan2(actor.dirX, actor.dirZ);
      let delta = targetYaw - visual.yaw;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      visual.yaw += delta * Math.min(1, dt * 12);
      visual.root.rotation.y = visual.yaw;

      // Cosmetic walk cycle, driven by the simulated `moving` flag.
      if (actor.moving) visual.walkPhase += dt * (actor.kind === 'monster' ? 9 : 12);
      else visual.walkPhase = 0;
      const stride = Math.sin(visual.walkPhase);
      visual.model.position.y = actor.moving ? Math.abs(stride) * 0.14 : 0;
      visual.model.rotation.z = actor.moving ? stride * 0.07 : 0;
      visual.model.rotation.x = actor.moving ? 0.08 : 0;
    }
    for (const [id, visual] of this.visuals) {
      if (alive.has(id)) continue;
      this.group.remove(visual.root);
      this.visuals.delete(id);
    }

    // Selection ring and order marker for the local player's own hero only.
    const you = latest.snapshot.you;
    const mine = you ? this.visuals.get(you.actorId ?? -1) : undefined;
    this.selection.visible = Boolean(mine);
    if (mine) this.selection.position.set(mine.root.position.x, 0.06, mine.root.position.z);
    const order = you ? latest.snapshot.actors.find((a) => a.id === you.actorId)?.order : undefined;
    this.orderMarker.visible = Boolean(order);
    if (order) {
      this.orderMarker.position.set(order.x, 0.07, order.z);
      this.orderMarker.scale.setScalar(1 + Math.sin(now / 120) * 0.15);
    }
  }

  private createVisual(actor: ActorView): ActorVisual {
    const root = new THREE.Group();
    root.name = `actor:${actor.id}:${actor.kind}`;
    const model = this.assets.instantiate(assetFor(actor));
    root.add(model);

    // Team-coloured base disc: readable ownership from the RTS camera.
    const disc = new THREE.CircleGeometry(actor.radius + 0.15, 20);
    disc.rotateX(-Math.PI / 2);
    const base = new THREE.Mesh(
      disc,
      new THREE.MeshBasicMaterial({ color: actor.team === 'dark' ? P.darkTeam : P.lightTeam, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    base.position.y = 0.04;
    root.add(base);

    if (actor.kind === 'monster') {
      const eyes = new THREE.MeshBasicMaterial({ color: P.eyeGlow });
      for (const x of [-0.16, 0.16]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), eyes);
        eye.position.set(x, 1.38, 1.5);
        model.add(eye);
      }
    }
    const visual: ActorVisual = { root, model, yaw: Math.atan2(actor.dirX, actor.dirZ), walkPhase: 0 };
    this.visuals.set(actor.id, visual);
    this.group.add(root);
    return visual;
  }
}
