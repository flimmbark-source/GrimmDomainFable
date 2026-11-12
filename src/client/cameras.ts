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

  constructor(private readonly panLimit: number) {}

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
    this.rtsFocus.x = THREE.MathUtils.clamp(this.rtsFocus.x + dx * speed, -this.panLimit, this.panLimit);
    this.rtsFocus.z = THREE.MathUtils.clamp(this.rtsFocus.z + dz * speed, -this.panLimit, this.panLimit);
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
    if (this.mode === 'hero' && heroPosition) {
      const { forwardX, forwardZ } = this.heroBasis();
      target.lookAt.set(heroPosition.x, HERO.lookHeight, heroPosition.z);
      target.position.set(
        heroPosition.x - forwardX * this.heroDistance * Math.cos(this.heroPitch),
        HERO.lookHeight + this.heroDistance * Math.sin(this.heroPitch),
        heroPosition.z - forwardZ * this.heroDistance * Math.cos(this.heroPitch),
      );
      target.fov = HERO.fov;
    } else {
      target.lookAt.copy(this.rtsFocus);
      target.position.set(
        this.rtsFocus.x,
        Math.sin(RTS.pitch) * this.rtsDistance,
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
