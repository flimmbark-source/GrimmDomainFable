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

export type Command = MoveDirCommand | MoveToCommand | StopCommand;

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
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Snapshots (server -> one client). Built only by sim/projection.ts.
// ---------------------------------------------------------------------------

export type ActorKind = 'hero' | 'monster';

/** What any viewer who can see an actor learns about it. */
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
  /** Present only for viewers entitled to this actor's intent (see projection). */
  order?: { x: number; z: number };
}

export interface SlotView {
  id: SlotId;
  team: Team;
  occupant: SlotOccupant;
}

export interface Snapshot {
  tick: number;
  /** Seat of the receiving client, or null for a spectator / public view. */
  you: { slot: SlotId; team: Team; actorId: number | null } | null;
  slots: SlotView[];
  actors: ActorView[];
}

/** Message names used on the room connection. */
export const MSG = {
  command: 'cmd',
  snapshot: 'snap',
  welcome: 'welcome',
} as const;

export interface WelcomeMessage {
  tickRate: number;
  mapId: string;
  slot: SlotId | null;
}

export interface JoinOptions {
  /** Preferred team; the server may seat the player elsewhere or as spectator. */
  team?: Team;
}

export const ROOM_NAME = 'match';
export const DEFAULT_SERVER_PORT = 2567;
