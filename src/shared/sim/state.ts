/**
 * Shape of the authoritative simulation state. Types only; no logic.
 * Everything here is plain JSON so a state can be hashed and copied.
 * The full SimState is server-only: clients receive projection.ts output.
 */
import type { ActorKind, BrainMode, EvidenceKind, MonsterType, SlotId, SlotOccupant, SoundKind, Team } from '../protocol.ts';
import type { Point } from './map.ts';
import type { StealthProfile } from './tuning.ts';

export type Intent =
  | { type: 'idle' }
  | { type: 'dir'; dx: number; dz: number }
  | { type: 'goto'; x: number; z: number };

export type Assignment =
  | { type: 'patrol'; route: number; waypoint: number }
  | { type: 'guard'; x: number; z: number };

/** What one monster knows about one enemy hero. */
export interface TargetMemory {
  actorId: number;
  /** 0..1. Builds only while the hero is actually seen; 1 = confirmed. */
  attention: number;
  /** Seen this tick (range, arc and line of sight all satisfied). */
  visible: boolean;
  /** Confirmed and being chased. Cleared when the chase is given up. */
  confirmed: boolean;
  lastAlertTick: number;
}

export interface Investigation {
  kind: 'glimpse' | 'noise' | 'alert';
  x: number;
  z: number;
  phase: 'notice' | 'travel' | 'look';
  ticks: number;
  evidenceId: number;
  /** The lead moved while walking to it: re-plan soon. */
  dirty: boolean;
}

export interface MonsterBrain {
  type: MonsterType;
  ownerSlot: SlotId;
  mode: BrainMode;
  assignment: Assignment;
  /** Original assignment, restored by a `patrol` order. */
  home: Assignment;
  /** Within patrol: walking to the waypoint or pausing at it. */
  phase: 'travel' | 'pause';
  waitTicks: number;
  waitTotal: number;
  targets: TargetMemory[];
  investigate: Investigation | null;
  chaseId: number | null;
  /** Last LEGALLY OBSERVED position and heading of the chased hero. */
  lastSeen: { x: number; z: number; dirX: number; dirZ: number; tick: number } | null;
  lostTicks: number;
  search: { points: Point[]; index: number; ticks: number; looking: boolean } | null;
  repathIn: number;
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
  /** PRIVATE: remaining waypoints of the current goto (last = destination). */
  path: Point[];
  /** PRIVATE (bookkeeping): consecutive ticks a goto made no progress. */
  stuckTicks: number;
  replanned: boolean;
  /** Heroes. */
  sneaking: boolean;
  stealth: StealthProfile;
  footstepTicks: number;
  whistleReadyTick: number;
  carried: number;
  /** PRIVATE to the owning Dark seat: autonomous monster brain. */
  brain: MonsterBrain | null;
}

export interface SlotState {
  id: SlotId;
  team: Team;
  occupant: SlotOccupant;
  actorId: number | null;
}

/** PRIVATE. A record of something a monster perceived. */
export interface Evidence {
  id: number;
  kind: EvidenceKind;
  x: number;
  z: number;
  tick: number;
  /** Monster that perceived it. */
  source: number;
  ownerSlot: SlotId;
  /** true: every Dark seat receives it. false: the owner only. */
  shared: boolean;
  subject: number | null;
}

/** A sound made this tick, heard by monsters at the end of the tick. */
export interface Noise {
  x: number;
  z: number;
  radius: number;
  team: Team;
}

/** An audible cue made this tick, projected to heroes within earshot. */
export interface SimEvent {
  kind: SoundKind;
  x: number;
  z: number;
  radius: number;
  actorId: number;
}

export interface SiteState {
  id: number;
  available: boolean;
  respawnTick: number;
  progress: number;
  gathererId: number | null;
}

export interface SimState {
  tick: number;
  mapId: string;
  seed: number;
  /** PRIVATE: PRNG state. Leaking it would let a client predict the server. */
  rng: number;
  nextActorId: number;
  nextEvidenceId: number;
  slots: SlotState[];
  actors: ActorState[];
  sites: SiteState[];
  evidence: Evidence[];
  noises: Noise[];
  events: SimEvent[];
  operation?: OperationState;
}

export interface OperationState {
  active: boolean;
  energy: number;
  production: number;
  offlineTicks: number;
  worker: number | null;
  progress: number;
  interrupted: number | null;
  result: Team | null;
}
