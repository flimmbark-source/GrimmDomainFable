/**
 * Authoritative game simulation.
 *
 * Rules of this module:
 *  - No rendering, DOM, network, timers or wall-clock time. Time only advances
 *    through step(), by exactly one fixed tick.
 *  - All randomness comes from the seeded generator stored in the state.
 *  - Only +, -, *, / and Math.sqrt are used on floats (IEEE-754 exact), so the
 *    same seed and inputs give bit-identical state on any JS engine.
 *  - The full SimState is server-only. Clients receive projection.ts output.
 */
import {
  SLOT_COUNT,
  teamOfSlot,
  type ActorKind,
  type Command,
  type SlotCommand,
  type SlotId,
  type SlotOccupant,
  type Team,
} from '../protocol.ts';
import { getMap, type MapDef, type Point } from './map.ts';
import { rngNext, seedToState } from './rng.ts';

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

export const HERO_SPEED = 6;
export const HERO_RADIUS = 0.5;
export const MONSTER_SPEED = 3.2;
export const MONSTER_RADIUS = 0.7;

/** A moveTo order is dropped after this many ticks without real progress. */
const STUCK_TICKS = 20;
const ARRIVE_EPS = 0.05;

export type Intent =
  | { type: 'idle' }
  | { type: 'dir'; dx: number; dz: number }
  | { type: 'goto'; x: number; z: number };

export interface PatrolState {
  route: number;
  waypoint: number;
  /** Ticks left to stand at the current waypoint before walking on. */
  waitTicks: number;
}

export interface ActorState {
  id: number;
  kind: ActorKind;
  team: Team;
  slot: SlotId | null;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  moving: boolean;
  speed: number;
  radius: number;
  /** PRIVATE: what the controller asked for. Not public information. */
  intent: Intent;
  /** PRIVATE (bookkeeping): consecutive ticks a goto made no progress. */
  stuckTicks: number;
  /** PRIVATE to the Dark side: autonomous patrol brain. */
  patrol: PatrolState | null;
}

export interface SlotState {
  id: SlotId;
  team: Team;
  occupant: SlotOccupant;
  actorId: number | null;
}

export interface SimState {
  tick: number;
  mapId: string;
  seed: number;
  /** PRIVATE: PRNG state. Leaking it would let a client predict the server. */
  rng: number;
  nextActorId: number;
  slots: SlotState[];
  actors: ActorState[];
}

export interface CreateOptions {
  seed: number;
  mapId: string;
}

export function createSim(options: CreateOptions): SimState {
  const map = getMap(options.mapId);
  const state: SimState = {
    tick: 0,
    mapId: map.id,
    seed: options.seed,
    rng: seedToState(options.seed),
    nextActorId: 1,
    slots: [],
    actors: [],
  };
  for (let id = 0; id < SLOT_COUNT; id++) {
    state.slots.push({ id, team: teamOfSlot(id), occupant: 'empty', actorId: null });
  }
  map.patrolRoutes.forEach((route, index) => {
    const start = route[0];
    if (!start) return;
    const monster = spawnActor(state, 'monster', 'dark', null, start, MONSTER_SPEED, MONSTER_RADIUS);
    monster.patrol = { route: index, waypoint: 0, waitTicks: 0 };
  });
  return state;
}

function spawnActor(
  state: SimState,
  kind: ActorKind,
  team: Team,
  slot: SlotId | null,
  at: Point,
  speed: number,
  radius: number,
): ActorState {
  // Heroes start facing the middle of the map.
  const facing = at.z > 0 ? -1 : 1;
  const actor: ActorState = {
    id: state.nextActorId++,
    kind,
    team,
    slot,
    x: at.x,
    z: at.z,
    dirX: 0,
    dirZ: facing,
    moving: false,
    speed,
    radius,
    intent: { type: 'idle' },
    stuckTicks: 0,
    patrol: null,
  };
  state.actors.push(actor);
  return actor;
}

// ---------------------------------------------------------------------------
// Seat management. These are simulation inputs too: for a replay to match,
// they must be applied at the same ticks.
// ---------------------------------------------------------------------------

/** Seat a human or bot in a slot and spawn its hero. Returns false if taken. */
export function occupySlot(state: SimState, slotId: SlotId, occupant: 'human' | 'bot'): boolean {
  const slot = state.slots[slotId];
  if (!slot || slot.occupant !== 'empty') return false;
  const spawn = getMap(state.mapId).spawns[slotId];
  if (!spawn) return false;
  const hero = spawnActor(state, 'hero', slot.team, slotId, spawn, HERO_SPEED, HERO_RADIUS);
  slot.occupant = occupant;
  slot.actorId = hero.id;
  return true;
}

/** Empty a slot and remove its hero. */
export function vacateSlot(state: SimState, slotId: SlotId): void {
  const slot = state.slots[slotId];
  if (!slot || slot.occupant === 'empty') return;
  state.actors = state.actors.filter((a) => a.id !== slot.actorId);
  slot.occupant = 'empty';
  slot.actorId = null;
}

/** First empty slot, preferring the requested team. null when all eight are taken. */
export function findFreeSlot(state: SimState, preferred?: Team): SlotId | null {
  const order = [...state.slots].sort((a, b) => {
    const pa = a.team === preferred ? 0 : 1;
    const pb = b.team === preferred ? 0 : 1;
    return pa - pb || a.id - b.id;
  });
  return order.find((s) => s.occupant === 'empty')?.id ?? null;
}

export function actorOfSlot(state: SimState, slotId: SlotId): ActorState | null {
  const actorId = state.slots[slotId]?.actorId ?? null;
  if (actorId === null) return null;
  return state.actors.find((a) => a.id === actorId) ?? null;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/**
 * Advance the world by exactly one fixed tick. Mutates and returns `state`.
 * Commands are applied in the order given; callers must pass a deterministic
 * order (the server queues them in arrival order per tick).
 */
export function step(state: SimState, commands: readonly SlotCommand[]): SimState {
  const map = getMap(state.mapId);

  for (const { slot, command } of commands) {
    const actor = actorOfSlot(state, slot);
    if (actor) applyCommand(actor, command, map);
  }

  for (const actor of state.actors) {
    if (actor.patrol) thinkPatrol(state, actor, map);
    moveActor(actor, map);
  }

  state.tick++;
  return state;
}

function applyCommand(actor: ActorState, command: Command, map: MapDef): void {
  actor.stuckTicks = 0;
  switch (command.type) {
    case 'moveDir': {
      // Re-normalise: the simulation never trusts its caller for speed.
      const len = Math.sqrt(command.dx * command.dx + command.dz * command.dz);
      actor.intent = len < 1e-6 ? { type: 'idle' } : { type: 'dir', dx: command.dx / len, dz: command.dz / len };
      break;
    }
    case 'moveTo': {
      const limit = map.halfSize - actor.radius;
      actor.intent = { type: 'goto', x: clamp(command.x, -limit, limit), z: clamp(command.z, -limit, limit) };
      break;
    }
    case 'stop':
      actor.intent = { type: 'idle' };
      break;
  }
}

/** Autonomous patrol: walk the route's waypoints in order, pausing at each. */
function thinkPatrol(state: SimState, actor: ActorState, map: MapDef): void {
  const patrol = actor.patrol;
  if (!patrol) return;
  const route = map.patrolRoutes[patrol.route];
  if (!route || route.length === 0) return;

  if (patrol.waitTicks > 0) {
    patrol.waitTicks--;
    return;
  }
  if (actor.intent.type === 'goto') return; // still walking

  // Arrived (or just spawned): choose a pause, then head for the next point.
  const roll = rngNext(state.rng);
  state.rng = roll.state;
  patrol.waitTicks = 15 + Math.floor(roll.value * 45); // 0.5s - 2.0s
  patrol.waypoint = (patrol.waypoint + 1) % route.length;
  const target = route[patrol.waypoint];
  if (target) actor.intent = { type: 'goto', x: target.x, z: target.z };
}

function moveActor(actor: ActorState, map: MapDef): void {
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
    const tx = intent.x - actor.x;
    const tz = intent.z - actor.z;
    const dist = Math.sqrt(tx * tx + tz * tz);
    if (dist <= ARRIVE_EPS) {
      actor.intent = { type: 'idle' };
      actor.moving = false;
      return;
    }
    dx = tx / dist;
    dz = tz / dist;
    if (dist < stepLen) stepLen = dist;
  }

  const fromX = actor.x;
  const fromZ = actor.z;
  actor.dirX = dx;
  actor.dirZ = dz;
  actor.x += dx * stepLen;
  actor.z += dz * stepLen;
  resolveCollisions(actor, map);

  const mx = actor.x - fromX;
  const mz = actor.z - fromZ;
  const moved = Math.sqrt(mx * mx + mz * mz);
  actor.moving = moved > maxStep * 0.05;

  if (intent.type === 'goto') {
    // No pathfinding yet: an order that keeps pushing into a wall is dropped.
    if (moved < stepLen * 0.2) {
      actor.stuckTicks++;
      if (actor.stuckTicks >= STUCK_TICKS) {
        actor.intent = { type: 'idle' };
        actor.stuckTicks = 0;
        actor.moving = false;
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** True when a circle at (x, z) overlaps any static collider or leaves the map. */
export function isBlocked(map: MapDef, x: number, z: number, radius: number): boolean {
  if (Math.abs(x) > map.halfSize - radius || Math.abs(z) > map.halfSize - radius) return true;
  const eps = 1e-6;
  for (const prop of map.props) {
    const c = prop.collider;
    if (c.shape === 'circle') {
      const ox = x - prop.x;
      const oz = z - prop.z;
      const min = radius + c.radius - eps;
      if (ox * ox + oz * oz < min * min) return true;
    } else {
      const ox = x - clamp(x, prop.x - c.hx, prop.x + c.hx);
      const oz = z - clamp(z, prop.z - c.hz, prop.z + c.hz);
      const min = radius - eps;
      if (ox * ox + oz * oz < min * min) return true;
    }
  }
  return false;
}

/** Stable 32-bit FNV-1a hash of the complete state, for determinism checks. */
export function hashState(state: SimState): string {
  const text = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function cloneState(state: SimState): SimState {
  return JSON.parse(JSON.stringify(state)) as SimState;
}
