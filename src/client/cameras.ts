/**
 * Two camera rigs over the same scene and the same simulation:
 *   - 'rts'  : elevated strategy view, free panning, point-and-click orders.
 *   - 'hero' : close third-person follow view, direct movement.
 *
 * EXPERIMENT ONLY. This proves both perspectives are technically supportable
 * side by side. Which side gets which view, how switching is triggered and
 * what it costs are open design questions (docs/decisions.md, unresolved 2-3).
 */
import * as THREE from 'three';

export type CameraMode = 'rts' | 'hero';

const RTS = { fov: 36, pitch: (56 * Math.PI) / 180, minDist: 16, maxDist: 70, panSpeed: 26 };
const HERO = { fov: 58, minDist: 4, maxDist: 12, minPitch: 0.05, maxPitch: 1.1, lookHeight: 2.0, turnSpeed: 2.2 };
const BLEND_SECONDS = 0.55;

/** What the rig needs to know about the place it is filming. All optional:
 *  without it the world is flat, square and empty, as in M0. */
export interface CameraWorld {
  /** Height of the walking surface. */
  heightAt(x: number, z: number): number;
  /** How far along the line from a to b (0..1) the view stays clear of tall solid things. */
  clearAlong(ax: number, az: number, bx: number, bz: number): number;
  /** Is this point inside a tree's crown? (Foliage is not cover, but a lens inside it sees nothing.) */
  inFoliage?(x: number, y: number, z: number): boolean;
}

export interface PanLimits {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Pose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov: number;
}

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(RTS.fov, 1, 0.5, 1500);
  mode: CameraMode = 'rts';

  /** RTS rig: ground point the camera looks at, and its distance. */
  readonly rtsFocus = new THREE.Vector3(0, 0, 8);
  rtsDistance = 50;
  /** The strategy camera follows the local hero until the player pans or chooses a manual focus. */
  private followRtsHero = true;
  /** Hero rig: orbit yaw around the hero (0 = camera south of hero, looking north). */
  heroYaw = 0;
  /** Hero rig: how far the camera looks down, in radians. */
  heroPitch = 0.2;
  heroDistance = 7.5;

  private blend = 1;
  private readonly from: Pose = { position: new THREE.Vector3(), lookAt: new THREE.Vector3(), fov: RTS.fov };
  private readonly current: Pose = { position: new THREE.Vector3(0, 30, 30), lookAt: new THREE.Vector3(), fov: RTS.fov };

  private readonly limits: PanLimits;
  /** 0..1: how much of the hero camera's distance is currently usable. */
  private heroClear = 1;
  /** Largest hero-camera distance that keeps the lens out of foliage (smoothed). */
  private foliageReach = Infinity;
  /** 0..1: how far the hero camera has dropped under a canopy. */
  private canopyDrop = 0;

  constructor(panLimit: number | PanLimits, private readonly world: CameraWorld | null = null) {
    this.limits = typeof panLimit === 'number' ? { minX: -panLimit, maxX: panLimit, minZ: -panLimit, maxZ: panLimit } : panLimit;
  }

  setMode(mode: CameraMode, heroPosition: THREE.Vector3 | null): void {
    if (mode === this.mode) return;
    this.from.position.copy(this.current.position);
    this.from.lookAt.copy(this.current.lookAt);
    this.from.fov = this.current.fov;
    this.blend = 0;
    this.mode = mode;
    if (mode === 'rts' && heroPosition) this.followHero(heroPosition);
  }

  panRts(dx: number, dz: number, dt: number): void {
    if (dx === 0 && dz === 0) return;
    this.followRtsHero = false;
    const speed = RTS.panSpeed * (this.rtsDistance / 40) * dt;
    this.rtsFocus.x = THREE.MathUtils.clamp(this.rtsFocus.x + dx * speed, this.limits.minX, this.limits.maxX);
    this.rtsFocus.z = THREE.MathUtils.clamp(this.rtsFocus.z + dz * speed, this.limits.minZ, this.limits.maxZ);
  }

  /** What the camera is currently looking at (for shadows and level of detail). */
  get lookTarget(): THREE.Vector3 {
    return this.current.lookAt;
  }

  /** Focus a chosen point without snapping back to the moving hero. */
  focusOn(point: THREE.Vector3): void {
    this.followRtsHero = false;
    this.rtsFocus.set(point.x, 0, point.z);
  }

  /** Recenter and resume following, including after the player has panned. */
  followHero(point: THREE.Vector3): void {
    this.followRtsHero = true;
    this.rtsFocus.set(point.x, 0, point.z);
  }

  /** Restore the strategy camera after a temporary scripted camera move. */
  preserveStrategyView(): () => void {
    const focus = this.rtsFocus.clone();
    const distance = this.rtsDistance;
    const follow = this.followRtsHero;
    return () => {
      this.rtsFocus.copy(focus);
      this.rtsDistance = distance;
      this.followRtsHero = follow;
    };
  }

  turnHero(direction: number, dt: number): void {
    this.heroYaw += direction * HERO.turnSpeed * dt;
  }

  /** Mouse-look for the hero rig (radians). */
  orbitHero(yawDelta: number, pitchDelta: number): void {
    this.heroYaw += yawDelta;
    this.heroPitch = THREE.MathUtils.clamp(this.heroPitch + pitchDelta, HERO.minPitch, HERO.maxPitch);
  }

  zoom(amount: number): void {
    if (this.mode === 'rts') this.rtsDistance = THREE.MathUtils.clamp(this.rtsDistance * (1 + amount), RTS.minDist, RTS.maxDist);
    else this.heroDistance = THREE.MathUtils.clamp(this.heroDistance * (1 + amount), HERO.minDist, HERO.maxDist);
  }

  /** Ground-plane basis of the hero camera: what "forward" and "right" mean for WASD. */
  heroBasis(): { forwardX: number; forwardZ: number; rightX: number; rightZ: number } {
    const forwardX = -Math.sin(this.heroYaw);
    const forwardZ = -Math.cos(this.heroYaw);
    return { forwardX, forwardZ, rightX: -forwardZ, rightZ: forwardX };
  }

  update(dt: number, aspect: number, heroPosition: THREE.Vector3 | null): void {
    if (this.mode === 'rts' && this.followRtsHero && heroPosition) {
      this.rtsFocus.set(heroPosition.x, 0, heroPosition.z);
    }
    const target: Pose = { position: new THREE.Vector3(), lookAt: new THREE.Vector3(), fov: RTS.fov };
    const world = this.world;
    if (this.mode === 'hero' && heroPosition) {
      const { forwardX, forwardZ } = this.heroBasis();
      const baseY = heroPosition.y;
      let reach = this.heroDistance;
      if (world) {
        // Do not let a wall, hedge or great trunk come between camera and hero:
        // pull the camera in (quickly) and let it ease back out (slowly).
        const flat = this.heroDistance * Math.cos(this.heroPitch);
        const clear = world.clearAlong(heroPosition.x, heroPosition.z, heroPosition.x - forwardX * flat, heroPosition.z - forwardZ * flat);
        const want = Math.max(clear, 0.6 / this.heroDistance);
        // Pull in at once (a camera must never sit inside a wall, even for one
        // frame); ease back out.
        this.heroClear = want < this.heroClear ? want : this.heroClear + (want - this.heroClear) * Math.min(1, dt * 2.5);
        reach = this.heroDistance * Math.min(1, this.heroClear);
      }
      // Squeezed close against something tall: rise and look down over the
      // hero's shoulder instead of pressing the lens into its back.
      const liftFor = (r: number) => Math.max(0, 3 - r) * 1.1;
      let lift = liftFor(reach);
      let drop = 0;
      if (world?.inFoliage) {
        // Keep the lens out of every crown. First try going under the canopy
        // (as a walker in an orchard sees it), then come closer, and never rise into leaves.
        const low = 1.55;
        const at = (r: number, l: number, under: boolean): [number, number, number] => [
          heroPosition.x - forwardX * r * Math.cos(this.heroPitch),
          under ? baseY + low : baseY + HERO.lookHeight + r * Math.sin(this.heroPitch) + l,
          heroPosition.z - forwardZ * r * Math.cos(this.heroPitch),
        ];
        let free = reach;
        let under = false;
        for (; free > 1.4; free -= 0.35) {
          if (!world.inFoliage(...at(free, liftFor(free), false))) break;
          if (!world.inFoliage(...at(free, 0, true))) {
            under = true;
            break;
          }
        }
        this.foliageReach = free < this.foliageReach ? free : this.foliageReach + (free - this.foliageReach) * Math.min(1, dt * 2.5);
        this.canopyDrop += ((under ? 1 : 0) - this.canopyDrop) * Math.min(1, dt * (under ? 10 : 2.5));
        reach = Math.min(reach, this.foliageReach);
        lift = liftFor(reach);
        if (under || world.inFoliage(...at(reach, lift, false))) lift = 0;
        const normalY = HERO.lookHeight + reach * Math.sin(this.heroPitch) + lift;
        drop = (normalY - low) * this.canopyDrop;
      }
      target.lookAt.set(heroPosition.x, baseY + HERO.lookHeight - lift * 0.35 - drop * 0.45, heroPosition.z);
      target.position.set(
        heroPosition.x - forwardX * reach * Math.cos(this.heroPitch),
        baseY + HERO.lookHeight + reach * Math.sin(this.heroPitch) + lift - drop,
        heroPosition.z - forwardZ * reach * Math.cos(this.heroPitch),
      );
      // Never under the ground (terrace above, river bank below).
      if (world) target.position.y = Math.max(target.position.y, world.heightAt(target.position.x, target.position.z) + 0.8);
      target.fov = HERO.fov;
    } else {
      this.rtsFocus.y = world ? world.heightAt(this.rtsFocus.x, this.rtsFocus.z) : 0;
      target.lookAt.copy(this.rtsFocus);
      target.position.set(
        this.rtsFocus.x,
        this.rtsFocus.y + Math.sin(RTS.pitch) * this.rtsDistance,
        this.rtsFocus.z + Math.cos(RTS.pitch) * this.rtsDistance,
      );
      target.fov = RTS.fov;
    }

    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / BLEND_SECONDS);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      this.current.position.lerpVectors(this.from.position, target.position, k);
      this.current.lookAt.lerpVectors(this.from.lookAt, target.lookAt, k);
      this.current.fov = this.from.fov + (target.fov - this.from.fov) * k;
    } else {
      this.current.position.copy(target.position);
      this.current.lookAt.copy(target.lookAt);
      this.current.fov = target.fov;
    }

    this.camera.position.copy(this.current.position);
    this.camera.lookAt(this.current.lookAt);
    if (this.camera.fov !== this.current.fov || this.camera.aspect !== aspect) {
      this.camera.fov = this.current.fov;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }
}
