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
import { SLOT_COUNT, teamOfSlot, type ActorKind, type Command, type HeroAction, type SlotCommand, type SlotId, type Team } from '../protocol.ts';
import { CONTEST, applyItemCommand, cancelRevive, createContest, evadeTicksOf, heroAttack, outfitHero, startRevive, updateContest } from './contest.ts';
import { distance } from './geometry.ts';
import { getMap, type MapDef, type Point } from './map.ts';
import { applyOrder, thinkMonster } from './monster.ts';
import { ARRIVE_EPS, moveActor, orderGoto, stopActor } from './movement.ts';
import { createOperation, updateOperation, workOperation } from './operation.ts';
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
  operation?: boolean;
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
    sites: options.operation ? [] : map.sites.map((s) => ({ id: s.id, available: true, respawnTick: 0, progress: 0, gathererId: null })),
    evidence: [],
    noises: [],
    events: [],
    ...(options.operation ? { operation: createOperation(), contest: createContest() } : {}),
  };
  for (let id = 0; id < SLOT_COUNT; id++) {
    state.slots.push({ id, team: teamOfSlot(id), occupant: 'empty', actorId: null });
  }
  // The contest gives the Dark commander's seat a second unit, so one player
  // has a small force to post while fighting in person (placement provisional).
  const spawns = options.operation ? [...map.monsters, { type: 'brute' as const, ownerSlot: 0, post: { x: 2, z: -31 } }] : map.monsters;
  for (const spawn of spawns) {
    const profile = TUNING.monsters[spawn.type];
    const route = spawn.route === undefined ? undefined : map.patrolRoutes[spawn.route];
    const at = spawn.post ?? route?.[0];
    if (!at) continue;
    const assignment: Assignment =
      spawn.post || spawn.route === undefined ? { type: 'guard', x: at.x, z: at.z } : { type: 'patrol', route: spawn.route, waypoint: 0 };
    const monster = spawnActor(state, 'monster', 'dark', null, at, profile.walkSpeed, profile.radius);
    monster.hp = monster.maxHp = profile.hp;
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
    hp: 1,
    maxHp: 1,
    attackReadyTick: 0,
    evadeReadyTick: 0,
    itemReadyTick: 0,
    lastHitTick: -1,
    inventory: {},
    equipment: { weapon: null, boots: null, charm: null },
    quick: [null, null, null],
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
  if (state.contest) outfitHero(hero);
  slot.occupant = occupant;
  slot.actorId = hero.id;
  return true;
}

/** Empty a slot and remove its hero. */
export function vacateSlot(state: SimState, slotId: SlotId): void {
  const slot = state.slots[slotId];
  if (!slot || slot.occupant === 'empty') return;
  state.actors = state.actors.filter((a) => a.id !== slot.actorId);
  if (state.contest) {
    const gone = (id: number) => id === slot.actorId;
    state.contest.rescues = state.contest.rescues.filter((r) => !gone(r.rescuerId) && !gone(r.heroId));
    state.contest.rituals = state.contest.rituals.filter((r) => !gone(r.heroId));
  }
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
  if (state.operation?.result) return state;
  const map = getMap(state.mapId);
  state.events = [];

  for (const { slot, command } of commands) applyCommand(state, slot, command, map);

  for (const actor of state.actors) {
    if (actor.dead && actor.brain) continue; // routed: out of play until it returns
    if (actor.brain) thinkMonster(state, actor, map);
    moveActor(actor, map);
    if (actor.kind === 'hero') {
      const queued = actor.queuedAction;
      if (queued && actor.intent.type === 'idle') {
        delete actor.queuedAction;
        if (distance(actor.x, actor.z, queued.destination.x, queued.destination.z) <= ARRIVE_EPS) {
          performHeroAction(state, map, actor, queued.kind);
        }
      }
      footsteps(state, actor);
    }
  }
  updateSites(state, map);
  updateContest(state, map);
  updatePerception(state, map);
  updateOperation(state, map);

  state.tick++;
  return state;
}

function applyCommand(state: SimState, slot: SlotId, command: Command, map: MapDef): void {
  const actor = actorOfSlot(state, slot);
  if (!actor) return;
  if (actor.dead) {
    // A ghost may only travel and perform its ritual (D-033: no combat, no
    // items, no physical interaction). A fallen Dark Hero waits to return.
    const allowed = command.type === 'moveDir' || command.type === 'moveTo' || command.type === 'stop' || command.type === 'revive';
    if (actor.team !== 'light' || !allowed) return;
  }
  switch (command.type) {
    case 'moveDir': {
      delete actor.queuedAction;
      // Re-normalise: the simulation never trusts its caller for speed.
      const len = Math.sqrt(command.dx * command.dx + command.dz * command.dz);
      const direction = len >= 1e-6 ? { type: 'dir' as const, dx: command.dx / len, dz: command.dz / len } : null;
      if (actor.intent.type === 'evade') {
        actor.intent.after = direction;
        break;
      }
      stopActor(actor);
      if (direction) actor.intent = direction;
      break;
    }
    case 'moveTo':
      delete actor.queuedAction;
      orderGoto(actor, map, command.x, command.z);
      break;
    case 'stop':
      delete actor.queuedAction;
      stopActor(actor);
      cancelRevive(state, actor);
      if (state.operation?.worker === actor.id) {
        state.operation.worker = null;
        state.operation.progress = 0;
      }
      break;
    case 'revive':
      startRevive(state, map, actor);
      break;
    case 'equip':
    case 'unequip':
    case 'assignQuick':
    case 'useQuick':
    case 'dropItem':
      applyItemCommand(state, actor, command);
      break;
    case 'workOperation':
      workOperation(state, map, actor);
      break;
    case 'setGait':
      setGait(actor, command.sneak);
      break;
    case 'whistle':
      whistle(state, actor);
      break;
    case 'heroAction': {
      // Hotkeys (no target) and action-menu orders (target) share every rule:
      // both end in performHeroAction, one now and one on arrival.
      if (!state.contest) break;
      const { action, target } = command;
      if (action === 'whistle' && state.tick < actor.whistleReadyTick) break;
      if (actor.queuedAction && !target) stopActor(actor);
      delete actor.queuedAction;
      if (!target) performHeroAction(state, map, actor, action);
      else if (orderGoto(actor, map, target.x, target.z) && actor.intent.type === 'goto') {
        actor.queuedAction = { kind: action, destination: { x: actor.intent.x, z: actor.intent.z } };
      }
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

function setGait(actor: ActorState, sneak: boolean): void {
  if (actor.dead) return;
  actor.sneaking = sneak;
  actor.speed = HERO_SPEED * (sneak ? TUNING.hero.sneakSpeedFactor : 1);
}

function whistle(state: SimState, actor: ActorState): void {
  if (actor.dead || state.tick < actor.whistleReadyTick) return;
  actor.whistleReadyTick = state.tick + TUNING.hero.whistleCooldownTicks;
  const radius = TUNING.hero.whistleNoiseRadius * actor.stealth.noise;
  state.noises.push({ x: actor.x, z: actor.z, radius, team: actor.team });
  state.events.push({ kind: 'whistle', x: actor.x, z: actor.z, radius, actorId: actor.id });
}

function performHeroAction(state: SimState, map: MapDef, actor: ActorState, action: HeroAction): void {
  if (actor.dead) return;
  switch (action) {
    case 'sneak': setGait(actor, !actor.sneaking); break;
    case 'whistle': whistle(state, actor); break;
    case 'attack':
      // The equipped weapon decides the pattern, reach and damage.
      heroAttack(state, map, actor);
      break;
    case 'evade': {
      if (actor.intent.type === 'evade' || state.tick < actor.evadeReadyTick) break;
      const after = actor.intent.type === 'dir' ? actor.intent : null;
      stopActor(actor);
      // Boots lengthen the dash; movement.ts still stops it at any collider.
      const ticks = evadeTicksOf(actor);
      actor.intent = { type: 'evade', ticks, after };
      actor.evadeReadyTick = state.tick + ticks + CONTEST.evadeCooldownTicks;
      actor.actionMotion = { kind: 'evade', tick: state.tick };
      break;
    }
  }
}

/** Running is audible; sneaking and standing still are silent. */
function footsteps(state: SimState, hero: ActorState): void {
  if (!hero.moving || hero.sneaking || hero.dead) {
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
