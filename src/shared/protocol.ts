/**
 * Shared wire protocol: teams, the eight player slots, player commands and the
 * per-player snapshot a client is allowed to receive.
 *
 * Nothing in this file may import rendering, DOM, Node or transport code.
 */

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

/**
 * Dark side: re-task a monster you own. `guard` sends it to stand watch at a
 * point; `patrol` sends it back to its original assignment. The server
 * rejects orders for monsters the sender does not own.
 */
export type MonsterOrderCommand =
  | { type: 'monsterOrder'; actorId: number; order: 'guard'; x: number; z: number }
  | { type: 'monsterOrder'; actorId: number; order: 'patrol' };

export type Command = MoveDirCommand | MoveToCommand | StopCommand | SetGaitCommand | WhistleCommand | MonsterOrderCommand;

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

export type SoundKind = 'growl' | 'howl' | 'whistle' | 'cache';

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
}

export const ROOM_NAME = 'match';
export const DEFAULT_SERVER_PORT = 2567;
