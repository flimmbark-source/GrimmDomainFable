/**
 * Turns keyboard/mouse into (a) camera movement, which is local, and
 * (b) Commands, which are sent to the server. Input never moves an actor
 * directly; the hero only moves when a snapshot says so.
 */
import * as THREE from 'three';
import type { Command } from '../shared/protocol.ts';
import type { CameraMode, CameraRig } from './cameras.ts';

export interface InputHost {
  canvas: HTMLCanvasElement;
  rig: CameraRig;
  send(command: Command): void;
  heroPosition(): THREE.Vector3 | null;
  toggleDebug(): void;
  onModeChanged(mode: CameraMode): void;
  /** Id of a monster this player owns (Dark side), or null. */
  ownedMonster(): number | null;
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class InputController {
  private readonly keys = new Set<string>();
  private lastDir = { dx: 0, dz: 0 };
  private sneaking = false;
  private dragging = false;
  private readonly raycaster = new THREE.Raycaster();

  constructor(private readonly host: InputHost) {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });
    const canvas = host.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointerup', () => (this.dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (this.dragging && host.rig.mode === 'hero') host.rig.orbitHero(-e.movementX * 0.006, e.movementY * 0.004);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      host.rig.zoom(Math.sign(e.deltaY) * 0.1);
    }, { passive: false });
  }

  setMode(mode: CameraMode): void {
    const rig = this.host.rig;
    if (rig.mode === mode) return;
    // Leaving direct control: release the held direction so the hero stops.
    if (this.lastDir.dx !== 0 || this.lastDir.dz !== 0) {
      this.lastDir = { dx: 0, dz: 0 };
      this.host.send({ type: 'stop' });
    }
    rig.setMode(mode, this.host.heroPosition());
    this.host.onModeChanged(mode);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!e.repeat) this.setMode(this.host.rig.mode === 'rts' ? 'hero' : 'rts');
      return;
    }
    if (e.code === 'KeyG' && !e.repeat) this.host.toggleDebug();
    if (e.code === 'Space') {
      e.preventDefault();
      const hero = this.host.heroPosition();
      if (hero) this.host.rig.followHero(hero);
    }
    if (e.code === 'KeyX' && !e.repeat) this.host.send({ type: 'stop' });
    if (e.code === 'KeyF' && !e.repeat) this.host.send({ type: 'whistle' });
    if (e.code === 'KeyP' && !e.repeat) {
      const monster = this.host.ownedMonster();
      if (monster !== null) this.host.send({ type: 'monsterOrder', actorId: monster, order: 'patrol' });
    }
    this.keys.add(e.code);
  }

  private onPointerDown(e: PointerEvent): void {
    const rig = this.host.rig;
    if (rig.mode === 'hero') {
      this.dragging = true;
      return;
    }
    // RTS view: a click orders the hero to that ground point. For a Dark
    // player who owns a monster, the RIGHT button posts that monster there.
    const rect = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, rig.camera);
    const hit = this.raycaster.ray.intersectPlane(GROUND, new THREE.Vector3());
    if (!hit) return;
    const monster = e.button === 2 ? this.host.ownedMonster() : null;
    if (monster !== null) this.host.send({ type: 'monsterOrder', actorId: monster, order: 'guard', x: hit.x, z: hit.z });
    else this.host.send({ type: 'moveTo', x: hit.x, z: hit.z });
  }

  private axis(positive: string[], negative: string[]): number {
    const has = (codes: string[]) => codes.some((c) => this.keys.has(c));
    return (has(positive) ? 1 : 0) - (has(negative) ? 1 : 0);
  }

  /** Call once per rendered frame. */
  update(dt: number): void {
    const rig = this.host.rig;
    // Hold Shift to sneak, in either view.
    const sneak = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (sneak !== this.sneaking) {
      this.sneaking = sneak;
      this.host.send({ type: 'setGait', sneak });
    }
    const right = this.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    const forward = this.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);

    if (rig.mode === 'rts') {
      if (right || forward) rig.panRts(right, -forward, dt);
      return;
    }

    rig.turnHero(this.axis(['KeyQ'], ['KeyE']), dt);
    const basis = rig.heroBasis();
    let dx = basis.forwardX * forward + basis.rightX * right;
    let dz = basis.forwardZ * forward + basis.rightZ * right;
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) {
      dx /= len;
      dz /= len;
    } else {
      dx = 0;
      dz = 0;
    }
    // Send only when the held direction actually changes (not every frame).
    const changed = Math.abs(dx - this.lastDir.dx) > 0.02 || Math.abs(dz - this.lastDir.dz) > 0.02;
    if (changed) {
      this.lastDir = { dx, dz };
      this.host.send({ type: 'moveDir', dx, dz });
    }
  }
}
