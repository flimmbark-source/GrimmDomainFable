/**
 * Per-player information projection: the ONLY path from authoritative SimState
 * to anything that is sent to a client.
 *
 * Snapshots are built field by field from an explicit allow-list. Nothing is
 * spread or copied wholesale from SimState, so a new private field added to
 * the simulation stays private unless someone deliberately adds it here.
 *
 * M0 scope: every actor's public transform is visible to everyone (no fog of
 * war yet). What is already withheld:
 *   - the PRNG state and seed                     -> nobody
 *   - a hero's pending order (intent)             -> only its own slot
 *   - a monster's current order / patrol brain    -> order to Dark only, brain to nobody
 * M1 adds visibility: `canSee` below is the hook where line-of-sight,
 * concealment and hearing decide whether an actor appears at all. It is
 * computed here on the server; clients never report what they can see.
 */
import type { ActorView, SlotId, Snapshot, Team } from '../protocol.ts';
import type { ActorState, SimState } from './simulation.ts';

/** Who a snapshot is for. `null` = spectator / public-only view. */
export type Viewer = { slot: SlotId; team: Team } | null;

export function viewerForSlot(state: SimState, slotId: SlotId | null): Viewer {
  if (slotId === null) return null;
  const slot = state.slots[slotId];
  return slot ? { slot: slot.id, team: slot.team } : null;
}

/** Visibility hook. M0: everything on the map is visible to everyone. */
function canSee(_state: SimState, _viewer: Viewer, _actor: ActorState): boolean {
  return true;
}

/** May this viewer learn where the actor has been ordered to go? */
function mayKnowOrder(viewer: Viewer, actor: ActorState): boolean {
  if (!viewer) return false;
  if (actor.kind === 'hero') return actor.slot === viewer.slot;
  // Autonomous monsters belong to the Dark side as a whole.
  return actor.team === 'dark' && viewer.team === 'dark';
}

function projectActor(viewer: Viewer, actor: ActorState): ActorView {
  const view: ActorView = {
    id: actor.id,
    kind: actor.kind,
    team: actor.team,
    slot: actor.slot,
    x: actor.x,
    z: actor.z,
    dirX: actor.dirX,
    dirZ: actor.dirZ,
    moving: actor.moving,
    radius: actor.radius,
  };
  if (actor.intent.type === 'goto' && mayKnowOrder(viewer, actor)) {
    view.order = { x: actor.intent.x, z: actor.intent.z };
  }
  return view;
}

export function projectSnapshot(state: SimState, viewer: Viewer): Snapshot {
  const seat = viewer ? state.slots[viewer.slot] : undefined;
  return {
    tick: state.tick,
    you: viewer && seat ? { slot: seat.id, team: seat.team, actorId: seat.actorId } : null,
    slots: state.slots.map((s) => ({ id: s.id, team: s.team, occupant: s.occupant })),
    actors: state.actors.filter((a) => canSee(state, viewer, a)).map((a) => projectActor(viewer, a)),
  };
}
