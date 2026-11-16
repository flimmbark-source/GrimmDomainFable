/**
 * Actor presentation. Positions come exclusively from server snapshots; this
 * module interpolates between the two most recent ones and adds purely
 * cosmetic motion (walk bob). It never moves an actor on its own authority.
 */
import * as THREE from 'three';
import type { ActorView, MonsterMood, Snapshot } from '../../shared/protocol.ts';
import { ITEMS } from '../../shared/sim/items.ts';
import { TICK_RATE } from '../../shared/sim/movement.ts';
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
  /** Monsters: the mood sign floating over the head ("?", "!", "..."). */
  sign?: THREE.Sprite;
  mood?: MonsterMood;
  signAge: number;
  /** 0..1 fade-in after coming into view. */
  appear: number;
  xray?: THREE.Mesh;
  /** Health bar, shown once the actor is hurt. */
  bar?: { back: THREE.Sprite; fill: THREE.Sprite };
  base: THREE.Mesh;
  ghost: boolean;
  /** Tick of the last attack already drawn. */
  attackTick: number;
}

/** A short-lived ground mark showing where an attack reached. */
interface AttackMark {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

const GHOST_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.42, depthWrite: false });
const MARK_SECONDS = 0.4;

/** Posture signs: the in-world cue for what a monster is doing (D-014). */
const SIGNS: Record<MonsterMood, { text: string; color: string } | null> = {
  calm: null,
  suspicious: { text: '?', color: '#ffd84a' },
  alarmed: { text: '!', color: '#ff4b2e' },
  searching: { text: '…', color: '#ff9d3c' },
};
const signTextures = new Map<MonsterMood, THREE.Texture>();

function signTexture(mood: MonsterMood): THREE.Texture | null {
  const spec = SIGNS[mood];
  if (!spec) return null;
  let texture = signTextures.get(mood);
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.font = 'bold 104px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 12;
    g.strokeStyle = '#1b1420';
    g.strokeText(spec.text, 64, mood === 'searching' ? 40 : 70);
    g.fillStyle = spec.color;
    g.fillText(spec.text, 64, mood === 'searching' ? 40 : 70);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    signTextures.set(mood, texture);
  }
  return texture;
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
  private readonly monsterMarker: THREE.Mesh;
  private readonly ownedRing: THREE.Mesh;
  private readonly marks: AttackMark[] = [];
  /** Command view: the owned monster the player has selected for orders. */
  selectedMonster: number | null = null;

  /**
   * @param heightAt  height of the walking surface (flat maps: always 0)
   * @param silhouette  draw the player's own units through whatever hides
   *   them from the camera. It shows only actors this client was already
   *   sent, so it reveals nothing the server did not.
   */
  constructor(
    private readonly assets: AssetLibrary,
    private readonly heightAt: (x: number, z: number) => number = () => 0,
    private readonly silhouette = false,
  ) {
    this.group.name = 'actors';
    const ring = new THREE.RingGeometry(0.75, 0.92, 28);
    ring.rotateX(-Math.PI / 2);
    this.selection = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0x7dff7a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.selection.visible = false;
    const marker = new THREE.RingGeometry(0.28, 0.45, 20);
    marker.rotateX(-Math.PI / 2);
    this.orderMarker = new THREE.Mesh(marker, new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.orderMarker.visible = false;
    const post = new THREE.RingGeometry(0.5, 0.72, 4);
    post.rotateX(-Math.PI / 2);
    this.monsterMarker = new THREE.Mesh(post, new THREE.MeshBasicMaterial({ color: 0xd66bff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.monsterMarker.visible = false;
    const owned = new THREE.RingGeometry(1.0, 1.14, 28);
    owned.rotateX(-Math.PI / 2);
    this.ownedRing = new THREE.Mesh(owned, new THREE.MeshBasicMaterial({ color: 0xd66bff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.ownedRing.visible = false;
    this.group.add(this.selection, this.orderMarker, this.monsterMarker, this.ownedRing);
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
        visual.root.position.set(actor.x, this.heightAt(actor.x, actor.z), actor.z);
      }
      const from = previous.get(actor.id) ?? actor;
      const px = from.x + (actor.x - from.x) * t;
      const pz = from.z + (actor.z - from.z) * t;
      visual.root.position.set(px, this.heightAt(px, pz), pz);

      // Turn smoothly towards the simulated facing.
      const targetYaw = Math.atan2(actor.dirX, actor.dirZ);
      let delta = targetYaw - visual.yaw;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      visual.yaw += delta * Math.min(1, dt * 12);
      const actionAge = actor.action
        ? (older.snapshot.tick + (newer.snapshot.tick - older.snapshot.tick) * t - actor.action.tick) / TICK_RATE : -1;
      const attack = actor.action?.kind === 'attack' && actionAge >= 0 && actionAge < 0.36
        ? Math.sin(Math.PI * actionAge / 0.36) : 0;
      visual.root.rotation.y = visual.yaw + attack * 0.9;

      // Cosmetic walk cycle, driven by the simulated `moving` flag.
      const alarmed = actor.mood === 'alarmed';
      if (actor.moving) visual.walkPhase += dt * (actor.kind === 'monster' ? (alarmed ? 15 : 9) : actor.sneaking ? 6 : 12);
      else visual.walkPhase = 0;
      const stride = Math.sin(visual.walkPhase);
      visual.model.position.y = actor.moving ? Math.abs(stride) * (actor.sneaking ? 0.04 : 0.14) : 0;
      visual.model.rotation.z = actor.moving ? stride * 0.07 : 0;
      // Posture: sneaking heroes crouch; a suspicious monster rears its head up,
      // an alarmed one drops low and forward.
      const evading = actor.action?.kind === 'evade' && actionAge >= 0 && actionAge < 0.3;
      const lean = evading ? 0.64 : attack > 0 ? attack * 0.52 : actor.sneaking ? 0.32 : actor.mood === 'suspicious' ? -0.16 : alarmed ? 0.2 : actor.moving ? 0.08 : 0;
      visual.model.rotation.x += (lean - visual.model.rotation.x) * Math.min(1, dt * 10);
      const base = actor.monster === 'brute' ? 1.45 : 1;
      const squash = actor.sneaking ? 0.8 : 1;
      visual.appear = Math.min(1, visual.appear + dt * 5);
      visual.model.scale.set(base, base * squash * (0.6 + 0.4 * visual.appear), base);
      this.updateSign(visual, actor, dt);
      this.updateCondition(visual, actor);
      if (actor.action?.kind === 'attack' && actor.action.tick > visual.attackTick) {
        visual.attackTick = actor.action.tick;
        this.addAttackMark(actor);
      }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mark = this.marks[i]!;
      mark.age += dt;
      mark.mesh.material.opacity = 0.7 * Math.max(0, 1 - mark.age / MARK_SECONDS);
      if (mark.age < MARK_SECONDS) continue;
      this.group.remove(mark.mesh);
      mark.mesh.geometry.dispose();
      mark.mesh.material.dispose();
      this.marks.splice(i, 1);
    }
    for (const [id, visual] of this.visuals) {
      if (alive.has(id)) continue;
      this.group.remove(visual.root);
      this.visuals.delete(id);
    }

    // A monster this player owns shows where it has been sent.
    const mineMonsters = latest.snapshot.actors.filter((a) => a.kind === 'monster' && a.mode !== undefined);
    const owned = mineMonsters.find((a) => a.id === this.selectedMonster) ?? mineMonsters[0];
    this.monsterMarker.visible = Boolean(owned?.order);
    if (owned?.order) this.monsterMarker.position.set(owned.order.x, this.heightAt(owned.order.x, owned.order.z) + 0.07, owned.order.z);
    const ownedVisual = owned ? this.visuals.get(owned.id) : undefined;
    this.ownedRing.visible = Boolean(ownedVisual);
    if (ownedVisual) this.ownedRing.position.set(ownedVisual.root.position.x, ownedVisual.root.position.y + 0.05, ownedVisual.root.position.z);
    if (ownedVisual) this.addSilhouette(ownedVisual, 0xd66bff);

    // Selection ring and order marker for the local player's own hero only.
    const you = latest.snapshot.you;
    const mine = you ? this.visuals.get(you.actorId ?? -1) : undefined;
    this.selection.visible = Boolean(mine);
    if (mine) this.selection.position.set(mine.root.position.x, mine.root.position.y + 0.06, mine.root.position.z);
    if (mine) this.addSilhouette(mine, 0x9fd8ff);
    const order = you ? latest.snapshot.actors.find((a) => a.id === you.actorId)?.order : undefined;
    this.orderMarker.visible = Boolean(order);
    if (order) {
      this.orderMarker.position.set(order.x, this.heightAt(order.x, order.z) + 0.07, order.z);
      this.orderMarker.scale.setScalar(1 + Math.sin(now / 120) * 0.15);
    }
  }

  /** Health bar and ghost look, straight from what the server sent. */
  private updateCondition(visual: ActorVisual, actor: ActorView): void {
    const ghost = actor.ghost === true;
    if (ghost !== visual.ghost) {
      visual.ghost = ghost;
      visual.base.visible = !ghost;
      visual.model.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || node === visual.xray) return;
        if (ghost) {
          node.userData.solid = node.material;
          node.material = GHOST_MATERIAL;
        } else if (node.userData.solid) node.material = node.userData.solid as THREE.Material;
        node.castShadow = !ghost;
      });
    }
    const health = actor.health ?? 1;
    const show = health < 1 && !ghost;
    if (!show) {
      if (visual.bar) visual.bar.back.visible = visual.bar.fill.visible = false;
      return;
    }
    if (!visual.bar) {
      const sprite = (color: number, order: number) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false, transparent: true }));
        s.renderOrder = order;
        visual.root.add(s);
        return s;
      };
      visual.bar = { back: sprite(0x1b1420, 30), fill: sprite(0xffffff, 31) };
    }
    const { back, fill } = visual.bar;
    const y = actor.monster === 'brute' ? 4.0 : 2.75;
    const width = 1.5;
    back.visible = true;
    back.position.y = fill.position.y = y;
    back.scale.set(width + 0.1, 0.24, 1);
    fill.visible = health > 0;
    if (health > 0) {
      // Keep the left edge fixed while the bar shortens.
      fill.scale.set(width * health, 0.14, 1);
      fill.center.set(0.5 / health, 0.5);
      fill.material.color.setHex(health > 0.5 ? 0x8fd16a : health > 0.25 ? 0xf2c14a : 0xff5a3c);
    }
  }

  /** Draw the reach of an attack on the ground: a wedge for a sweep, a streak for a shot. */
  private addAttackMark(actor: ActorView): void {
    const weapon = actor.action?.weapon ? ITEMS[actor.action.weapon].weapon : undefined;
    const reach = (weapon?.range ?? 1.6) + 0.3;
    let geometry: THREE.BufferGeometry;
    if (weapon?.pattern === 'line') {
      geometry = new THREE.PlaneGeometry(weapon.halfWidth * 2 + 0.1, reach);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 0, reach / 2);
    } else {
      const half = Math.acos(weapon?.halfArcCos ?? 0.5);
      geometry = new THREE.RingGeometry(actor.radius * 0.8, reach, 24, 1, Math.PI / 2 - half, half * 2);
      geometry.rotateX(Math.PI / 2);
    }
    const color = actor.team === 'dark' ? 0xff6a8a : 0xfff0a8;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(actor.x, this.heightAt(actor.x, actor.z) + 0.12, actor.z);
    mesh.rotation.y = Math.atan2(actor.dirX, actor.dirZ);
    mesh.renderOrder = 25;
    this.group.add(mesh);
    this.marks.push({ mesh, age: 0 });
  }

  /** A flat tint of the model drawn only where something is in front of it. */
  private addSilhouette(visual: ActorVisual, color: number): void {
    if (!this.silhouette || visual.xray || !(visual.model instanceof THREE.Mesh)) return;
    // Drawn after the scenery but before the unit itself, passing only where
    // something already drawn is nearer: so it appears on what hides the unit
    // and never on the unit's own body.
    const material = new THREE.MeshBasicMaterial({ color, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false });
    visual.xray = new THREE.Mesh(visual.model.geometry, material);
    visual.xray.renderOrder = 900;
    visual.model.renderOrder = 901;
    visual.model.add(visual.xray);
  }

  private updateSign(visual: ActorVisual, actor: ActorView, dt: number): void {
    if (actor.kind !== 'monster') return;
    const mood = actor.mood ?? 'calm';
    if (mood !== visual.mood) {
      visual.mood = mood;
      visual.signAge = 0;
      const texture = signTexture(mood);
      if (!texture) {
        if (visual.sign) visual.sign.visible = false;
      } else {
        if (!visual.sign) {
          visual.sign = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
          visual.sign.renderOrder = 20;
          visual.root.add(visual.sign);
        }
        visual.sign.material.map = texture;
        visual.sign.material.needsUpdate = true;
        visual.sign.visible = true;
      }
    }
    if (!visual.sign?.visible) return;
    visual.signAge += dt;
    // Pop in large, settle, then bob gently.
    const pop = 1 + Math.max(0, 0.9 - visual.signAge * 3);
    const size = (actor.monster === 'brute' ? 2.2 : 1.7) * pop;
    visual.sign.scale.set(size, size, 1);
    visual.sign.position.y = (actor.monster === 'brute' ? 4.6 : 3.3) + Math.sin(visual.signAge * 4) * 0.08;
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
    const visual: ActorVisual = {
      root, model, yaw: Math.atan2(actor.dirX, actor.dirZ), walkPhase: 0, signAge: 0, appear: 0,
      base, ghost: false, attackTick: actor.action?.tick ?? -1,
    };
    this.visuals.set(actor.id, visual);
    this.group.add(root);
    return visual;
  }
}
