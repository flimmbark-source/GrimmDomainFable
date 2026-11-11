/**
 * Authoritative game simulation.
 *
 * Rules of this module and everything it calls:
 *  - No rendering, DOM, network, timers or wall-clock time. Time only advances
 *    through step(), by exactly one fixed tick.
 *  - All randomness comes from the seeded generator stored in the state.
 *  - Only +, -, *, / and Math.sqrt are used on floats (IEEE-754 exact), so the
 *    same seed and inputs give bit-identical state on any JS engine.
 *  - The full SimState is server-only. Clients receive projection.ts output.
 */
import { SLOT_COUNT, teamOfSlot, type ActorKind, type Command, type SlotCommand, type SlotId, type Team } from '../protocol.ts';
import { distance } from './geometry.ts';
import { getMap, type MapDef, type Point } from './map.ts';
import { applyOrder, thinkMonster } from './monster.ts';
import { moveActor, orderGoto, stopActor } from './movement.ts';
import { updatePerception } from './perception.ts';
import { seedToState } from './rng.ts';
import type { ActorState, Assignment, SimState } from './state.ts';
import { TUNING } from './tuning.ts';

export { isBlocked } from './geometry.ts';
export { TICK_DT, TICK_RATE } from './movement.ts';
export type { ActorState, Intent, MonsterBrain, SimState, SlotState } from './state.ts';

export const HERO_SPEED = TUNING.hero.speed;
export const HERO_RADIUS = TUNING.hero.radius;
export const MONSTER_SPEED = TUNING.monsters.scout.walkSpeed;
export const MONSTER_RADIUS = TUNING.monsters.scout.radius;

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
    nextEvidenceId: 1,
    slots: [],
    actors: [],
    sites: map.sites.map((s) => ({ id: s.id, available: true, respawnTick: 0, progress: 0, gathererId: null })),
    evidence: [],
    noises: [],
    events: [],
  };
  for (let id = 0; id < SLOT_COUNT; id++) {
    state.slots.push({ id, team: teamOfSlot(id), occupant: 'empty', actorId: null });
  }
  for (const spawn of map.monsters) {
    const profile = TUNING.monsters[spawn.type];
    const route = spawn.route === undefined ? undefined : map.patrolRoutes[spawn.route];
    const at = spawn.post ?? route?.[0];
    if (!at) continue;
    const assignment: Assignment =
      spawn.post || spawn.route === undefined ? { type: 'guard', x: at.x, z: at.z } : { type: 'patrol', route: spawn.route, waypoint: 0 };
    const monster = spawnActor(state, 'monster', 'dark', null, at, profile.walkSpeed, profile.radius);
    monster.brain = {
      type: spawn.type,
      ownerSlot: spawn.ownerSlot,
      mode: 'patrol',
      assignment,
      home: { ...assignment },
      phase: 'travel',
      waitTicks: 0,
      waitTotal: 0,
      targets: [],
      investigate: null,
      chaseId: null,
      lastSeen: null,
      lostTicks: 0,
      search: null,
      repathIn: 0,
    };
  }
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
  // Actors start facing the middle of the map.
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
    path: [],
    stuckTicks: 0,
    replanned: false,
    sneaking: false,
    stealth: { ...TUNING.stealthProfiles.default! },
    footstepTicks: 0,
    whistleReadyTick: 0,
    carried: 0,
    brain: null,
  };
  state.actors.push(actor);
  return actor;
}

// ---------------------------------------------------------------------------
// Seat management. These are simulation inputs too: for a replay to match,
// they must be applied at the same ticks.
// ---------------------------------------------------------------------------

/**
 * Seat a human or bot in a slot and spawn its hero. Returns false if taken.
 * `profile` names a stealth profile in TUNING (D-013: same rules, different
 * multipliers); which hero gets which profile is not decided, so everyone is
 * `default` unless a caller says otherwise.
 */
export function occupySlot(state: SimState, slotId: SlotId, occupant: 'human' | 'bot', profile = 'default'): boolean {
  const slot = state.slots[slotId];
  if (!slot || slot.occupant !== 'empty') return false;
  const spawn = getMap(state.mapId).spawns[slotId];
  if (!spawn) return false;
  const hero = spawnActor(state, 'hero', slot.team, slotId, spawn, HERO_SPEED, HERO_RADIUS);
  hero.stealth = { ...(TUNING.stealthProfiles[profile] ?? TUNING.stealthProfiles.default!) };
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
 *
 * Order within a tick: commands, monster decisions (from what was perceived
 * up to the previous tick), movement, footsteps, caches, then perception of
 * the new positions and of this tick's noises.
 */
export function step(state: SimState, commands: readonly SlotCommand[]): SimState {
  const map = getMap(state.mapId);
  state.events = [];

  for (const { slot, command } of commands) applyCommand(state, slot, command, map);

  for (const actor of state.actors) {
    if (actor.brain) thinkMonster(state, actor, map);
    moveActor(actor, map);
    if (actor.kind === 'hero') footsteps(state, actor);
  }
  updateSites(state, map);
  updatePerception(state, map);

  state.tick++;
  return state;
}

function applyCommand(state: SimState, slot: SlotId, command: Command, map: MapDef): void {
  const actor = actorOfSlot(state, slot);
  if (!actor) return;
  switch (command.type) {
    case 'moveDir': {
      // Re-normalise: the simulation never trusts its caller for speed.
      const len = Math.sqrt(command.dx * command.dx + command.dz * command.dz);
      stopActor(actor);
      if (len >= 1e-6) actor.intent = { type: 'dir', dx: command.dx / len, dz: command.dz / len };
      break;
    }
    case 'moveTo':
      orderGoto(actor, map, command.x, command.z);
      break;
    case 'stop':
      stopActor(actor);
      break;
    case 'setGait':
      actor.sneaking = command.sneak;
      actor.speed = HERO_SPEED * (command.sneak ? TUNING.hero.sneakSpeedFactor : 1);
      break;
    case 'whistle': {
      if (state.tick < actor.whistleReadyTick) break;
      actor.whistleReadyTick = state.tick + TUNING.hero.whistleCooldownTicks;
      const radius = TUNING.hero.whistleNoiseRadius * actor.stealth.noise;
      state.noises.push({ x: actor.x, z: actor.z, radius, team: actor.team });
      state.events.push({ kind: 'whistle', x: actor.x, z: actor.z, radius, actorId: actor.id });
      break;
    }
    case 'monsterOrder': {
      // Authority: only the owning Dark seat may command a monster (D-012).
      const monster = state.actors.find((a) => a.id === command.actorId);
      if (!monster?.brain || monster.brain.ownerSlot !== slot) break;
      applyOrder(monster, monster.brain, map, command);
      break;
    }
  }
}

/** Running is audible; sneaking and standing still are silent. */
function footsteps(state: SimState, hero: ActorState): void {
  if (!hero.moving || hero.sneaking) {
    hero.footstepTicks = 0;
    return;
  }
  if (++hero.footstepTicks < TUNING.hero.footstepIntervalTicks) return;
  hero.footstepTicks = 0;
  state.noises.push({ x: hero.x, z: hero.z, radius: TUNING.hero.runNoiseRadius * hero.stealth.noise, team: hero.team });
}

/** A Light hero standing still at a cache opens it after a few seconds. */
function updateSites(state: SimState, map: MapDef): void {
  const S = TUNING.sites;
  for (const site of state.sites) {
    const def = map.sites.find((s) => s.id === site.id);
    if (!def) continue;
    if (!site.available) {
      if (state.tick >= site.respawnTick) site.available = true;
      else continue;
    }
    const hero = state.actors.find(
      (a) => a.kind === 'hero' && a.team === 'light' && !a.moving && distance(a.x, a.z, def.x, def.z) <= S.radius,
    );
    if (!hero) {
      site.progress = 0;
      site.gathererId = null;
      continue;
    }
    if (site.gathererId !== hero.id) {
      site.gathererId = hero.id;
      site.progress = 0;
    }
    if (++site.progress < S.gatherTicks) continue;
    hero.carried++;
    site.available = false;
    site.respawnTick = state.tick + S.respawnTicks;
    site.progress = 0;
    site.gathererId = null;
    const radius = S.openNoiseRadius * hero.stealth.noise;
    state.noises.push({ x: def.x, z: def.z, radius, team: hero.team });
    state.events.push({ kind: 'cache', x: def.x, z: def.z, radius, actorId: hero.id });
  }
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
