/**
 * Actor movement: path-following goto orders, held directions, static
 * collision and turning. Deterministic (+ - * / sqrt only).
 */
import { clamp } from './geometry.ts';
import type { MapDef } from './map.ts';
import { findPath } from './nav.ts';
import type { ActorState } from './state.ts';
import { TUNING, type Rotation } from './tuning.ts';

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

/** A goto that makes no progress for this long is re-planned once, then dropped. */
const STUCK_TICKS = 20;
const ARRIVE_EPS = 0.05;

export function stopActor(actor: ActorState): void {
  actor.intent = { type: 'idle' };
  actor.path = [];
  actor.stuckTicks = 0;
  actor.replanned = false;
}

/**
 * Order an actor to walk to a point, around obstacles. A blocked destination
 * becomes the nearest standable point. Returns false (and stops the actor)
 * when no route exists.
 */
export function orderGoto(actor: ActorState, map: MapDef, x: number, z: number): boolean {
  const limit = map.halfSize - actor.radius;
  const path = findPath(map, actor.radius, { x: actor.x, z: actor.z }, { x: clamp(x, -limit, limit), z: clamp(z, -limit, limit) });
  if (!path || path.length === 0) {
    stopActor(actor);
    return false;
  }
  const goal = path[path.length - 1]!;
  actor.intent = { type: 'goto', x: goal.x, z: goal.z };
  actor.path = path;
  actor.stuckTicks = 0;
  actor.replanned = false;
  return true;
}

/** Turn a unit facing towards (tx, tz) by at most one rotation step. */
export function rotateToward(actor: ActorState, tx: number, tz: number, step: Rotation): void {
  const len = Math.sqrt(tx * tx + tz * tz);
  if (len < 1e-9) return;
  const ux = tx / len;
  const uz = tz / len;
  const dot = actor.dirX * ux + actor.dirZ * uz;
  if (dot >= step.cos) {
    actor.dirX = ux;
    actor.dirZ = uz;
    return;
  }
  const cross = actor.dirX * uz - actor.dirZ * ux;
  rotateBy(actor, step, cross >= 0 ? 1 : -1);
}

/** Rotate a unit facing by one step, clockwise or anticlockwise. */
export function rotateBy(actor: ActorState, step: Rotation, sign: 1 | -1): void {
  const s = step.sin * sign;
  const nx = actor.dirX * step.cos - actor.dirZ * s;
  const nz = actor.dirZ * step.cos + actor.dirX * s;
  const len = Math.sqrt(nx * nx + nz * nz);
  actor.dirX = nx / len;
  actor.dirZ = nz / len;
}

export function moveActor(actor: ActorState, map: MapDef): void {
  const intent = actor.intent;
  if (intent.type === 'idle') {
    actor.moving = false;
    return;
  }

  const maxStep = actor.speed * TICK_DT;
  let dx: number;
  let dz: number;
  let stepLen = maxStep;

  if (intent.type === 'dir') {
    dx = intent.dx;
    dz = intent.dz;
  } else {
    let dist = 0;
    let tx = 0;
    let tz = 0;
    // Drop waypoints already reached; the last waypoint is the destination.
    for (;;) {
      const next = actor.path[0];
      if (!next) {
        stopActor(actor);
        actor.moving = false;
        return;
      }
      tx = next.x - actor.x;
      tz = next.z - actor.z;
      dist = Math.sqrt(tx * tx + tz * tz);
      if (dist > ARRIVE_EPS) break;
      actor.path.shift();
    }
    dx = tx / dist;
    dz = tz / dist;
    if (dist < stepLen) stepLen = dist;
  }

  const fromX = actor.x;
  const fromZ = actor.z;
  if (actor.kind === 'monster') {
    // Monsters turn at a finite rate, so a watcher can read where they look.
    rotateToward(actor, dx, dz, TUNING.behaviour.turn);
  } else {
    actor.dirX = dx;
    actor.dirZ = dz;
  }
  actor.x += dx * stepLen;
  actor.z += dz * stepLen;
  resolveCollisions(actor, map);

  const mx = actor.x - fromX;
  const mz = actor.z - fromZ;
  const moved = Math.sqrt(mx * mx + mz * mz);
  actor.moving = moved > maxStep * 0.05;

  if (intent.type === 'goto') {
    if (moved < stepLen * 0.2) {
      actor.stuckTicks++;
      if (actor.stuckTicks >= STUCK_TICKS) {
        // Safety net only: paths avoid obstacles, so this should not happen.
        if (actor.replanned || !orderGoto(actor, map, intent.x, intent.z)) {
          stopActor(actor);
          actor.moving = false;
        } else {
          actor.replanned = true;
        }
      }
    } else {
      actor.stuckTicks = 0;
    }
  }
}

/** Push the actor out of every static collider, then keep it inside the map. */
function resolveCollisions(actor: ActorState, map: MapDef): void {
  // Two passes so a push out of one collider into another is corrected.
  for (let pass = 0; pass < 2; pass++) {
    for (const prop of map.props) {
      const c = prop.collider;
      if (c.shape === 'circle') {
        const ox = actor.x - prop.x;
        const oz = actor.z - prop.z;
        const min = actor.radius + c.radius;
        const d2 = ox * ox + oz * oz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-9) {
          actor.x = prop.x + min; // dead centre: pick a fixed direction
        } else {
          actor.x = prop.x + (ox / d) * min;
          actor.z = prop.z + (oz / d) * min;
        }
      } else {
        // Closest point on the box to the actor centre.
        const cx = clamp(actor.x, prop.x - c.hx, prop.x + c.hx);
        const cz = clamp(actor.z, prop.z - c.hz, prop.z + c.hz);
        const ox = actor.x - cx;
        const oz = actor.z - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= actor.radius * actor.radius) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          actor.x = cx + (ox / d) * actor.radius;
          actor.z = cz + (oz / d) * actor.radius;
        } else {
          // Centre is inside the box: leave through the nearest face.
          const left = actor.x - (prop.x - c.hx);
          const right = prop.x + c.hx - actor.x;
          const top = actor.z - (prop.z - c.hz);
          const bottom = prop.z + c.hz - actor.z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) actor.x = prop.x - c.hx - actor.radius;
          else if (m === right) actor.x = prop.x + c.hx + actor.radius;
          else if (m === top) actor.z = prop.z - c.hz - actor.radius;
          else actor.z = prop.z + c.hz + actor.radius;
        }
      }
    }
  }
  const limit = map.halfSize - actor.radius;
  actor.x = clamp(actor.x, -limit, limit);
  actor.z = clamp(actor.z, -limit, limit);
}
