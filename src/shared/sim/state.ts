/**
 * Shape of the authoritative simulation state. Types only; no logic.
 * Everything here is plain JSON so a state can be hashed and copied.
 * The full SimState is server-only: clients receive projection.ts output.
 */
import type { ActorKind, BrainMode, EvidenceKind, HeroAction, MonsterType, SlotId, SlotOccupant, SoundKind, Team } from '../protocol.ts';
import type { Equipment, ItemId } from './items.ts';
import type { Point } from './map.ts';
import type { StealthProfile } from './tuning.ts';

export type DirectionIntent = { type: 'dir'; dx: number; dz: number };

export type Intent =
  | { type: 'idle' }
  | DirectionIntent
  | { type: 'evade'; ticks: number; after: DirectionIntent | null }
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
  queuedAction?: { kind: HeroAction; destination: Point };
  actionMotion?: { kind: 'attack' | 'evade'; tick: number; weapon?: ItemId };
  carried: number;
  /** Health. Damage is only ever applied in the Orchard contest. */
  hp: number;
  maxHp: number;
  attackReadyTick: number;
  evadeReadyTick: number;
  itemReadyTick: number;
  /** Tick of the last damage taken (interrupts channels). */
  lastHitTick: number;
  /** PRIVATE to the owning seat: carried items by id, worn gear and quick slots. */
  inventory: Partial<Record<ItemId, number>>;
  equipment: Equipment;
  quick: (ItemId | null)[];
  /**
   * Set while a hero is dead. For a Light Hero the body lies at (x, z) and
   * this actor is the player's ghost (D-032): one actor, never two heroes.
   * A Dark Hero simply waits here until `returnTick` (placeholder rule).
   */
  dead?: { tick: number; x: number; z: number; returnTick?: number };
  /** Tick at which this ghost's sanctuary ritual was ended by full corruption. */
  ritualLostTick?: number;
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
  /** Combat, items and recovery. Present only in the Orchard contest. */
  contest?: ContestState;
}

export interface PickupState {
  id: number;
  item: ItemId;
  count: number;
  x: number;
  z: number;
  /** Slots that have already collected their share (see contest.ts). */
  takenBy: SlotId[];
}

export interface SanctuaryState {
  id: number;
  name: string;
  x: number;
  z: number;
  /** Corruption in tick units, 0 .. CONTEST.corruptTicks. */
  corruption: number;
  /** Fully corrupted: no longer eligible for resurrection (D-039). */
  corrupted: boolean;
  /** Dark forces were inside the precinct this tick. */
  threatened: boolean;
}

/** A living Light Hero reviving a fallen one at the body (D-034). */
export interface RescueState {
  rescuerId: number;
  heroId: number;
  progress: number;
  startTick: number;
}

/** A ghost's resurrection ritual at a sanctuary (D-038). */
export interface RitualState {
  heroId: number;
  sanctuaryId: number;
  progress: number;
  /** Locked when the ritual starts (D-040; when it locks is provisional). */
  duration: number;
}

export interface ContestState {
  pickups: PickupState[];
  sanctuaries: SanctuaryState[];
  rescues: RescueState[];
  rituals: RitualState[];
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
