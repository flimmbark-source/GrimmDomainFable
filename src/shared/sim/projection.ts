/**
 * Per-player information projection: the ONLY path from authoritative SimState
 * to anything that is sent to a client.
 *
 * Snapshots are built field by field from an explicit allow-list. Nothing is
 * spread or copied wholesale from SimState, so a new private field added to
 * the simulation stays private unless someone deliberately adds it here.
 *
 * Who receives what (the confirmed rules are D-012 and D-014; choices marked
 * PROVISIONAL are the most restrictive reading of an unresolved rule and are
 * listed in docs/decisions.md for the creator):
 *
 *   An actor is in your snapshot only when
 *     - it is on your team (PROVISIONAL: allies always see each other), or
 *     - YOUR OWN hero sees it (range + line of sight), or
 *     - Dark only: a monster YOU OWN has confirmed it and sees it right now
 *       (D-012: a monster's live vision goes to its owner and nobody else), or
 *     - it is a monster that sees you right now (sight lines are mutual).
 *   An enemy nobody of yours sees is not sent at all: no stale copy, no
 *   placeholder, no id.
 *
 *   Evidence (Dark only): confirmed sightings are shared with all four Dark
 *   seats as a frozen, time-stamped position. Glimpses, noises and last-seen
 *   points go to the reporting monster's owner only (PROVISIONAL).
 *
 *   Spectators / public view: only actors the OPPOSING team can currently
 *   see, so a public stream never carries a position hidden from a player.
 *
 * Visibility is computed here, on the server, from simulation state. Clients
 * never report what they can see.
 */
import type { ActorView, EvidenceView, SiteView, SlotId, Snapshot, SoundView, Team } from '../protocol.ts';
import { distance } from './geometry.ts';
import { getMap, type MapDef } from './map.ts';
import { moodOf } from './monster.ts';
import { heroSees, heroSeesPoint, memoryOf } from './perception.ts';
import type { ActorState, SimState } from './state.ts';

/** Who a snapshot is for. `null` = spectator / public-only view. */
export type Viewer = { slot: SlotId; team: Team } | null;

export function viewerForSlot(state: SimState, slotId: SlotId | null): Viewer {
  if (slotId === null) return null;
  const slot = state.slots[slotId];
  return slot ? { slot: slot.id, team: slot.team } : null;
}

function heroOf(state: SimState, slot: SlotId): ActorState | undefined {
  const id = state.slots[slot]?.actorId;
  return id == null ? undefined : state.actors.find((a) => a.id === id);
}

/** Is `target` (a Light hero) confirmed and in view of a monster owned by `slot`? */
function ownedMonsterSees(state: SimState, slot: SlotId, target: ActorState): boolean {
  return state.actors.some((m) => {
    if (!m.brain || m.brain.ownerSlot !== slot) return false;
    const memory = memoryOf(m.brain, target.id);
    return Boolean(memory?.visible && memory.confirmed);
  });
}

/** Does `monster` have real sight of `hero` this tick (confirmed or not)? */
function monsterWatches(monster: ActorState, hero: ActorState): boolean {
  return Boolean(monster.brain && memoryOf(monster.brain, hero.id)?.visible);
}

/** Can the seat `slot` (team `team`) currently see `actor`? */
function seatSees(state: SimState, map: MapDef, slot: SlotId, team: Team, actor: ActorState): boolean {
  if (actor.team === team) return true;
  const hero = heroOf(state, slot);
  if (hero && heroSees(map, hero, actor)) return true;
  if (hero && monsterWatches(actor, hero)) return true;
  return team === 'dark' && ownedMonsterSees(state, slot, actor);
}

/** Can ANY seat of the team opposing `actor` currently see it? */
function opposingTeamSees(state: SimState, map: MapDef, actor: ActorState): boolean {
  return state.slots.some((s) => s.team !== actor.team && s.occupant !== 'empty' && seatSees(state, map, s.id, s.team, actor));
}

function canSee(state: SimState, map: MapDef, viewer: Viewer, actor: ActorState): boolean {
  if (!viewer) return opposingTeamSees(state, map, actor);
  return seatSees(state, map, viewer.slot, viewer.team, actor);
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
  const brain = actor.brain;
  if (!brain) {
    if (actor.sneaking) view.sneaking = true;
    // A hero's pending order is its own business (team sharing is undecided).
    if (actor.intent.type === 'goto' && viewer && actor.slot === viewer.slot) {
      view.order = { x: actor.intent.x, z: actor.intent.z };
    }
    return view;
  }
  view.monster = brain.type;
  view.mood = moodOf(brain);
  if (viewer?.team === actor.team) {
    view.owner = brain.ownerSlot;
    // Where a monster is heading can be an enemy's live position, so its
    // destination and behaviour state go to its owner only (D-012).
    if (viewer.slot === brain.ownerSlot) {
      view.mode = brain.mode;
      if (actor.intent.type === 'goto') view.order = { x: actor.intent.x, z: actor.intent.z };
    }
  }
  return view;
}

function projectEvidence(state: SimState, viewer: Viewer): EvidenceView[] {
  if (!viewer || viewer.team !== 'dark') return [];
  const out: EvidenceView[] = [];
  for (const e of state.evidence) {
    if (!e.shared && e.ownerSlot !== viewer.slot) continue;
    const view: EvidenceView = { id: e.id, kind: e.kind, x: e.x, z: e.z, tick: e.tick, source: e.source };
    if (e.subject !== null) view.subject = e.subject;
    out.push(view);
  }
  return out;
}

function projectSites(state: SimState, map: MapDef, viewer: Viewer, hero: ActorState | undefined): SiteView[] {
  return map.sites.map((def) => {
    const site = state.sites.find((s) => s.id === def.id);
    const view: SiteView = { id: def.id, x: def.x, z: def.z, available: null };
    if (!site || !viewer) return view;
    // Light knows its own caches; Dark must look (an opened cache is a clue).
    if (viewer.team === 'light' || (hero && heroSeesPoint(map, hero, def.x, def.z))) view.available = site.available;
    if (hero && site.gathererId === hero.id) view.progress = site.progress;
    return view;
  });
}

/** What the viewer's hero hears this tick. Never carries a position. */
function projectSounds(state: SimState, visible: Set<number>, hero: ActorState | undefined): SoundView[] {
  if (!hero) return [];
  const out: SoundView[] = [];
  for (const e of state.events) {
    const d = distance(hero.x, hero.z, e.x, e.z);
    if (d > e.radius) continue;
    // Five coarse loudness steps: enough for "near" or "far", useless for ranging.
    const volume = Math.ceil((1 - d / e.radius) * 5) / 5;
    const sound: SoundView = { kind: e.kind, volume: volume > 0 ? volume : 0.2 };
    if (visible.has(e.actorId)) sound.actorId = e.actorId;
    out.push(sound);
  }
  return out;
}

export function projectSnapshot(state: SimState, viewer: Viewer): Snapshot {
  const map = getMap(state.mapId);
  const seat = viewer ? state.slots[viewer.slot] : undefined;
  const hero = viewer ? heroOf(state, viewer.slot) : undefined;
  const actors = state.actors.filter((a) => canSee(state, map, viewer, a));
  const visible = new Set(actors.map((a) => a.id));

  let you: Snapshot['you'] = null;
  if (viewer && seat) {
    // D-014 local attention indicator: one number about the viewer's own
    // exposure. It never names or locates a monster.
    let attention = 0;
    let spotted = false;
    if (hero) {
      for (const m of state.actors) {
        const memory = m.brain && m.team !== hero.team ? memoryOf(m.brain, hero.id) : undefined;
        if (!memory) continue;
        if (memory.attention > attention) attention = memory.attention;
        if (memory.confirmed && memory.visible) spotted = true;
      }
    }
    you = {
      slot: seat.id,
      team: seat.team,
      actorId: seat.actorId,
      attention: Math.round(attention * 100) / 100,
      spotted,
      carried: hero?.carried ?? 0,
      whistleCooldown: hero ? Math.max(0, hero.whistleReadyTick - state.tick) : 0,
    };
  }

  return {
    tick: state.tick,
    you,
    slots: state.slots.map((s) => ({ id: s.id, team: s.team, occupant: s.occupant })),
    actors: actors.map((a) => projectActor(viewer, a)),
    sites: projectSites(state, map, viewer, hero),
    evidence: projectEvidence(state, viewer),
    sounds: projectSounds(state, visible, hero),
  };
}
