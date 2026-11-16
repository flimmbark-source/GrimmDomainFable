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
  /** Height of the walking surface; omitted on flat maps. */
  heightAt?(x: number, z: number): number;
  /** The command R sends right now (relay work, a revival), or null. */
  interaction?(): Command | null;
  /** Command view: a click on one of the player's own monsters selects it. */
  selectMonsterNear?(x: number, z: number): boolean;
  handleUiKey?(event: KeyboardEvent): boolean;
  inventoryOpen?(): boolean;
  /** This press only closed the action menu; do nothing else with it. */
  dismissedMenu?(): boolean;
  /** Contest controls: the player chose the layout in which WASD moves the hero. */
  wasdMoves?(): boolean;
  usesActionMenu?(): boolean;
  openActionMenu?(x: number, y: number, target: { x: number; z: number }): void;
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
/** Pointer travel that turns a left press into a camera drag instead of a click. */
const DRAG_PIXELS = 6;

export class InputController {
  private readonly keys = new Set<string>();
  private lastDir = { dx: 0, dz: 0 };
  private sneaking = false;
  private dragging = false;
  /** Contest controls: a left press that has not yet become a drag. */
  private press: { x: number; y: number; dragged: boolean } | null = null;
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
    window.addEventListener('pointerup', (e) => {
      this.dragging = false;
      const press = this.press;
      this.press = null;
      // A press released without dragging is a plain click on the ground.
      if (press && !press.dragged && e.button === 0 && e.target === canvas) this.clickGround(e);
    });
    window.addEventListener('pointermove', (e) => {
      const press = this.press;
      if (press && !press.dragged && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PIXELS) {
        press.dragged = true;
        this.dragging = true;
      }
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
    if (this.host.handleUiKey?.(e)) {
      e.preventDefault();
      return;
    }
    if (this.host.inventoryOpen?.() || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.code === 'Tab' || e.code === 'Space') && e.target instanceof HTMLButtonElement && e.target.closest('#player-hud')) return;
    if (e.code === 'Tab' && e.shiftKey) return;
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
    if (e.code === 'KeyF' && !e.repeat && !this.host.usesActionMenu?.()) this.host.send({ type: 'whistle' });
    if (e.code === 'KeyR' && !e.repeat) {
      const command = this.host.interaction?.();
      if (command) this.host.send(command);
    }
    if (e.code === 'KeyP' && !e.repeat) {
      const monster = this.host.ownedMonster();
      if (monster !== null) this.host.send({ type: 'monsterOrder', actorId: monster, order: 'patrol' });
    }
    if (e.code.startsWith('Arrow')) e.preventDefault();
    this.keys.add(e.code);
  }

  /** The terrain point under the pointer, or null (sky, off the map). */
  private groundPoint(e: { clientX: number; clientY: number }): THREE.Vector3 | null {
    const rect = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.host.rig.camera);
    const hit = this.raycaster.ray.intersectPlane(GROUND, new THREE.Vector3());
    if (!hit) return null;
    const heightAt = this.host.heightAt;
    if (heightAt) {
      // The ground has relief: slide the hit along the ray until it lies on the surface.
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      for (let i = 0; i < 6; i++) {
        plane.constant = -heightAt(hit.x, hit.z);
        if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
      }
    }
    return hit;
  }

  /**
   * Contest controls, plain left click: move the hero there, in either view.
   * In command view a click on one of your own monsters selects it instead.
   */
  private clickGround(e: PointerEvent): void {
    const hit = this.groundPoint(e);
    if (!hit) return;
    if (this.host.rig.mode === 'rts' && this.host.selectMonsterNear?.(hit.x, hit.z)) return;
    this.host.send({ type: 'moveTo', x: hit.x, z: hit.z });
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.host.inventoryOpen?.()) return;
    const rig = this.host.rig;
    if (this.host.usesActionMenu?.()) {
      if (this.host.dismissedMenu?.()) return;
      // Left: click = move, drag (hero view) = turn the camera; resolved on release.
      if (e.button === 0) {
        this.press = { x: e.clientX, y: e.clientY, dragged: false };
        return;
      }
      if (e.button !== 2) return;
      const hit = this.groundPoint(e);
      if (!hit) return;
      // Right: in command view a Dark commander posts the selected monster
      // there; everywhere else it opens the action menu at the cursor.
      const monster = rig.mode === 'rts' ? this.host.ownedMonster() : null;
      if (monster !== null) this.host.send({ type: 'monsterOrder', actorId: monster, order: 'guard', x: hit.x, z: hit.z });
      else this.host.openActionMenu?.(e.clientX, e.clientY, { x: hit.x, z: hit.z });
      return;
    }
    if (rig.mode === 'hero') {
      if (e.button !== 0) return;
      this.dragging = true;
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    // RTS view: a click orders the hero to that ground point. For a Dark
    // player who owns a monster, the RIGHT button posts that monster there.
    const hit = this.groundPoint(e);
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
    if (this.host.inventoryOpen?.()) {
      this.keys.clear();
      this.dragging = false;
      this.press = null;
    }
    const usesMenu = this.host.usesActionMenu?.();
    // The Orchard action controls manage their gait through the server command.
    const sneak = !usesMenu && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    if (sneak !== this.sneaking) {
      this.sneaking = sneak;
      this.host.send({ type: 'setGait', sneak });
    }
    const arrowsOnly = usesMenu && !this.host.wasdMoves?.();
    const right = arrowsOnly ? this.axis(['ArrowRight'], ['ArrowLeft']) : this.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    const forward = arrowsOnly ? this.axis(['ArrowUp'], ['ArrowDown']) : this.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);

    if (rig.mode === 'rts') {
      if (right || forward) rig.panRts(right, -forward, dt);
      return;
    }

    rig.turnHero(usesMenu ? 0 : this.axis(['KeyQ'], ['KeyE']), dt);
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
