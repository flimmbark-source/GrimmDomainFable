/**
 * Shared wire protocol: teams, the eight player slots, player commands and the
 * per-player snapshot a client is allowed to receive.
 *
 * Nothing in this file may import rendering, DOM, Node or transport code.
 */

import { isGearSlot, isItemId, type GearSlot, type ItemId } from './sim/items.ts';

export const TEAMS = ['dark', 'light'] as const;
export type Team = (typeof TEAMS)[number];

/** Confirmed decision D-001: exactly four Dark and four Light hero slots. */
export const SLOTS_PER_TEAM = 4;
export const SLOT_COUNT = SLOTS_PER_TEAM * 2;

/** Slot ids 0-3 are Dark, 4-7 are Light. */
export type SlotId = number;

export type SlotOccupant = 'empty' | 'human' | 'bot';

export function teamOfSlot(slot: SlotId): Team {
  return slot < SLOTS_PER_TEAM ? 'dark' : 'light';
}

export function isSlotId(value: unknown): value is SlotId {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < SLOT_COUNT;
}

// ---------------------------------------------------------------------------
// Commands (client -> server, and bot -> simulation). Humans and bots produce
// exactly the same Command values; the simulation cannot tell them apart.
// ---------------------------------------------------------------------------

/** Hold a movement direction (hero-style direct control). Zero vector = stop. */
export interface MoveDirCommand {
  type: 'moveDir';
  dx: number;
  dz: number;
}

/** Walk to a ground point (RTS-style order). */
export interface MoveToCommand {
  type: 'moveTo';
  x: number;
  z: number;
}

export interface StopCommand {
  type: 'stop';
}

/** Sneak (slow, silent) or run (fast, audible footsteps). */
export interface SetGaitCommand {
  type: 'setGait';
  sneak: boolean;
}

/** Make a loud noise where you stand. */
export interface WhistleCommand {
  type: 'whistle';
}

export type HeroAction = 'attack' | 'sneak' | 'evade' | 'whistle';

export interface HeroActionCommand {
  type: 'heroAction';
  action: HeroAction;
  /** Omit the destination to use the hero's current position. */
  target?: { x: number; z: number };
}

/**
 * Dark side: re-task a monster you own. `guard` sends it to stand watch at a
 * point; `patrol` sends it back to its original assignment. The server
 * rejects orders for monsters the sender does not own.
 */
export type MonsterOrderCommand =
  | { type: 'monsterOrder'; actorId: number; order: 'guard'; x: number; z: number }
  | { type: 'monsterOrder'; actorId: number; order: 'patrol' };

/**
 * Inventory and equipment (Orchard contest). The client only ASKS: the server
 * owns what a hero carries, wears and has in its quick slots.
 */
export type ItemCommand =
  | { type: 'equip'; item: ItemId }
  | { type: 'unequip'; slot: GearSlot }
  | { type: 'assignQuick'; slot: number; item: ItemId | null }
  | { type: 'useQuick'; slot: number }
  | { type: 'dropItem'; item: ItemId };

export type Command = MoveDirCommand | MoveToCommand | StopCommand | SetGaitCommand | WhistleCommand | HeroActionCommand | MonsterOrderCommand |
  ItemCommand | { type: 'workOperation' } |
  /** Living Light Hero beside a body: revive it. Ghost in a sanctuary: begin the ritual. */
  { type: 'revive' };

/** A command bound to the slot that issued it. The slot is assigned by the
 *  server from the connection; it is never read from the client payload. */
export interface SlotCommand {
  slot: SlotId;
  command: Command;
}

/** Largest |coordinate| a command may reference; the map is far smaller. */
export const MAX_COMMAND_COORD = 1000;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate an untrusted payload. Returns a freshly built, normalised Command
 * (unknown extra fields are dropped) or null when the payload is not valid.
 */
export function parseCommand(raw: unknown): Command | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case 'moveDir': {
      if (!finite(r.dx) || !finite(r.dz)) return null;
      const len = Math.sqrt(r.dx * r.dx + r.dz * r.dz);
      if (len < 1e-6) return { type: 'moveDir', dx: 0, dz: 0 };
      // Direction only: a client cannot request a faster-than-allowed speed.
      return { type: 'moveDir', dx: r.dx / len, dz: r.dz / len };
    }
    case 'moveTo': {
      if (!finite(r.x) || !finite(r.z)) return null;
      if (Math.abs(r.x) > MAX_COMMAND_COORD || Math.abs(r.z) > MAX_COMMAND_COORD) return null;
      return { type: 'moveTo', x: r.x, z: r.z };
    }
    case 'stop':
      return { type: 'stop' };
    case 'setGait':
      return typeof r.sneak === 'boolean' ? { type: 'setGait', sneak: r.sneak } : null;
    case 'whistle':
      return { type: 'whistle' };
    case 'heroAction': {
      const action = r.action;
      if (action !== 'attack' && action !== 'sneak' && action !== 'evade' && action !== 'whistle') return null;
      if (r.target === undefined) return { type: 'heroAction', action };
      if (!r.target || typeof r.target !== 'object') return null;
      const { x, z } = r.target as Record<string, unknown>;
      if (!finite(x) || !finite(z) || Math.abs(x) > MAX_COMMAND_COORD || Math.abs(z) > MAX_COMMAND_COORD) return null;
      return { type: 'heroAction', action, target: { x, z } };
    }
    case 'workOperation':
      return { type: 'workOperation' };
    case 'revive':
      return { type: 'revive' };
    case 'equip':
      return isItemId(r.item) ? { type: 'equip', item: r.item } : null;
    case 'dropItem':
      return isItemId(r.item) ? { type: 'dropItem', item: r.item } : null;
    case 'unequip':
      return isGearSlot(r.slot) ? { type: 'unequip', slot: r.slot } : null;
    case 'useQuick':
    case 'assignQuick': {
      if (typeof r.slot !== 'number' || !Number.isInteger(r.slot) || r.slot < 0 || r.slot > 2) return null;
      if (r.type === 'useQuick') return { type: 'useQuick', slot: r.slot };
      if (r.item !== null && !isItemId(r.item)) return null;
      return { type: 'assignQuick', slot: r.slot, item: r.item };
    }
    case 'monsterOrder': {
      if (typeof r.actorId !== 'number' || !Number.isInteger(r.actorId) || r.actorId < 0) return null;
      if (r.order === 'patrol') return { type: 'monsterOrder', actorId: r.actorId, order: 'patrol' };
      if (r.order !== 'guard' || !finite(r.x) || !finite(r.z)) return null;
      if (Math.abs(r.x) > MAX_COMMAND_COORD || Math.abs(r.z) > MAX_COMMAND_COORD) return null;
      return { type: 'monsterOrder', actorId: r.actorId, order: 'guard', x: r.x, z: r.z };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Snapshots (server -> one client). Built only by sim/projection.ts.
// ---------------------------------------------------------------------------

export type ActorKind = 'hero' | 'monster';
export type MonsterType = 'scout' | 'brute';

/** A monster's visible posture: what anyone who can see it can read off it. */
export type MonsterMood = 'calm' | 'suspicious' | 'alarmed' | 'searching';

/** A monster's behaviour state. Sent only to the monster's owner. */
export type BrainMode = 'patrol' | 'investigate' | 'chase' | 'search' | 'return';

/** What a viewer who can currently see an actor learns about it. An actor the
 *  viewer cannot see is simply absent from the snapshot. */
export interface ActorView {
  id: number;
  kind: ActorKind;
  team: Team;
  /** Slot that controls this actor, or null for autonomous monsters. */
  slot: SlotId | null;
  x: number;
  z: number;
  /** Unit facing vector on the ground plane. */
  dirX: number;
  dirZ: number;
  moving: boolean;
  radius: number;
  /** Heroes: visibly sneaking. */
  sneaking?: boolean;
  /** A transient playtest motion on an already visible hero. */
  action?: { kind: 'attack' | 'evade'; tick: number; weapon?: ItemId };
  /** Health as a fraction 0..1 (Orchard contest only). */
  health?: number;
  /** Wrapped in smoke-pot smoke (drawn as a puff). */
  smoked?: boolean;
  /** A Light Hero's ghost. Only ever sent to that hero's own team. */
  ghost?: boolean;
  /** Monsters only. */
  monster?: MonsterType;
  mood?: MonsterMood;
  /** Monsters, Dark viewers only: the slot that owns it. */
  owner?: SlotId;
  /** Monsters, owner only: behaviour state. */
  mode?: BrainMode;
  /** Present only for viewers entitled to this actor's intent (see projection). */
  order?: { x: number; z: number };
}

export interface SlotView {
  id: SlotId;
  team: Team;
  occupant: SlotOccupant;
}

/**
 * Something the Dark side knows happened at a place and time. Positions are
 * frozen when the observation was made; they never follow the hero.
 *   sighting : a monster confirmed a hero here (shared with the whole Dark team)
 *   lastSeen : where the owner's monster lost sight of a hero it was chasing
 *   glimpse  : the owner's monster half-saw something here (no identity)
 *   noise    : the owner's monster heard something roughly here (no identity)
 */
export type EvidenceKind = 'sighting' | 'lastSeen' | 'glimpse' | 'noise';

export interface EvidenceView {
  id: number;
  kind: EvidenceKind;
  x: number;
  z: number;
  /** Simulation tick of the observation; age = snapshot.tick - tick. */
  tick: number;
  /** Actor id of the monster that reported it. */
  source: number;
  /** Actor id of the hero, for sighting / lastSeen only. */
  subject?: number;
}

export interface SiteView {
  id: number;
  x: number;
  z: number;
  /** null = this viewer cannot currently see the site. */
  available: boolean | null;
  /** 0..1, only for the hero who is gathering. */
  progress?: number;
}

export type SoundKind = 'growl' | 'howl' | 'whistle' | 'cache' | 'hit' | 'heal' | 'pickup' | 'revive' | 'smoke';

/** Something the viewer's hero hears this tick. */
export interface SoundView {
  kind: SoundKind;
  /** Loudness 0..1 in coarse steps. No position is ever sent for a sound. */
  volume: number;
  /** Emitting actor, only when the viewer can also see it. */
  actorId?: number;
}

export interface YouView {
  slot: SlotId;
  team: Team;
  actorId: number | null;
  /** Local attention indicator (D-014): how close the most attentive monster
   *  is to confirming you, 0..1. Carries no position and no monster identity. */
  attention: number;
  /** A monster has confirmed you and is looking at you right now. */
  spotted: boolean;
  /** Caches collected (placeholder objective). */
  carried: number;
  /** Ticks until you may whistle again. */
  whistleCooldown: number;
  /** Your hero's kit and condition (Orchard contest only). Private to your seat. */
  kit?: KitView;
}

/** What the current weapon makes Attack do; null with the weapon slot empty. */
export interface AttackView {
  pattern: 'arc' | 'line';
  range: number;
  damage: number;
}

export interface KitView {
  hp: number;
  maxHp: number;
  /** You are a ghost (Light) or waiting to return (Dark). */
  dead: boolean;
  deadSeconds: number;
  equipment: Record<GearSlot, ItemId | null>;
  inventory: { item: ItemId; count: number }[];
  quick: (ItemId | null)[];
  /** Derived from what is worn right now. */
  attack: AttackView | null;
  attackCooldown: number;
  /** Metres one Evade covers on open ground. */
  evadeDistance: number;
  evadeCooldown: number;
  /** Health one salve restores. */
  salveHeal: number;
  /** Current running speed, metres per second. */
  speed: number;
  /** Seconds of quickening draught left. */
  hasteSeconds: number;
  /** A revival you could start now with R. */
  interaction: 'rescue' | 'ritual' | 'mend' | 'purify' | null;
  /** A revival in progress that involves you. */
  channel: { kind: 'rescue' | 'ritual' | 'rescued' | 'mend' | 'purify'; progress: number; seconds: number } | null;
  /** Your ritual was ended because the sanctuary fell (shown briefly). */
  ritualLost: boolean;
  /** Dark placeholder: seconds until you return. */
  returnSeconds?: number;
}

/** A find lying in the world that this viewer has not collected. */
export interface PickupView {
  id: number;
  item: ItemId;
  count: number;
  x: number;
  z: number;
}

/** A fallen Light Hero's body (D-032). */
export interface BodyView {
  heroId: number;
  slot: SlotId | null;
  x: number;
  z: number;
}

/** A Light sanctuary and its condition (D-030: condition, never attackers). */
export interface SanctuaryView {
  id: number;
  name: string;
  x: number;
  z: number;
  /** Ward strength 1..0 in coarse steps (D-030: every Light Hero can see it). */
  ward: number;
  /** Corruption 0..1 in coarse steps; rises only after the wards are breached. */
  corruption: number;
  corrupted: boolean;
  /** Light viewers only: Dark forces are in the precinct. */
  threatened?: boolean;
}

export interface Snapshot {
  tick: number;
  /** Seat of the receiving client, or null for a spectator / public view. */
  you: YouView | null;
  slots: SlotView[];
  actors: ActorView[];
  sites: SiteView[];
  /** Dark viewers only; always empty for Light and public viewers. */
  evidence: EvidenceView[];
  sounds: SoundView[];
  /** Public playtest score and local interaction, never attacker locations. */
  operation?: OperationView;
  /** Orchard contest only. */
  pickups?: PickupView[];
  bodies?: BodyView[];
  sanctuaries?: SanctuaryView[];
}

export interface OperationView {
  x: number;
  z: number;
  active: boolean;
  energy: number;
  energyPerSecond: number;
  production: number;
  productionGoal: number;
  offlineSeconds: number;
  offlineGoal: number;
  result: Team | null;
  interaction: 'sabotage' | 'repair' | null;
  progress: number;
  interrupted: boolean;
}

/** Message names used on the room connection. */
export const MSG = {
  command: 'cmd',
  snapshot: 'snap',
  welcome: 'welcome',
  /** Development only: full perception state. Never sent unless the server
   *  was started with GRIMM_DEBUG=1. */
  debug: 'dbg',
} as const;

export interface WelcomeMessage {
  tickRate: number;
  mapId: string;
  slot: SlotId | null;
}

/** Development-only view of a monster's senses and memory (see MSG.debug). */
export interface DebugMonster {
  id: number;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  mode: BrainMode;
  viewRange: number;
  viewHalfArcCos: number;
  targets: { actorId: number; attention: number; visible: boolean; confirmed: boolean }[];
  lastSeen: { x: number; z: number } | null;
  searchPoints: { x: number; z: number }[];
  path: { x: number; z: number }[];
}

export interface DebugMessage {
  tick: number;
  monsters: DebugMonster[];
}

export interface JoinOptions {
  /** Preferred team; the server may seat the player elsewhere or as spectator. */
  team?: Team;
  /** Watch without a seat: the client receives the public view only. */
  spectate?: boolean;
}

export const ROOM_NAME = 'match';

/**
 * Development / playtest regions other than the default match. A client may
 * ASK for one by name (`?region=orchard_vale`); that only chooses which
 * server-defined room it joins. Which map a room runs is decided by server
 * code alone and reported in the welcome message; a client can never supply a
 * map id.
 */
export const REGION_ROOMS = {
  orchard_vale: 'match_orchard_vale',
  orchard_operation: 'match_orchard_operation',
} as const;
export type RegionName = keyof typeof REGION_ROOMS;

export function roomForRegion(region: string | null | undefined): string {
  return region && Object.hasOwn(REGION_ROOMS, region) ? REGION_ROOMS[region as RegionName] : ROOM_NAME;
}
export const DEFAULT_SERVER_PORT = 2567;
