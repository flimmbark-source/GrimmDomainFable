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
import type { ActorView, BodyView, EvidenceView, KitView, PickupView, SanctuaryView, SiteView, SlotId, Snapshot, SoundView, Team } from '../protocol.ts';
import { CONTEST, evadeTicksOf, heroSpeed, rescuableBody, sanctuaryFor } from './contest.ts';
import { distance } from './geometry.ts';
import { ITEM_IDS, salveHeal, weaponOf } from './items.ts';
import { getMap, type MapDef } from './map.ts';
import { moodOf } from './monster.ts';
import { EVADE_SPEED, TICK_RATE } from './movement.ts';
import { projectOperation } from './operation.ts';
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
  if (actor.dead && actor.brain) return false; // a routed monster is nowhere
  if (actor.team === team) return true;
  // The dead are shown to their own side only: a ghost's whereabouts and a
  // fallen Dark Hero are never sent to the enemy.
  if (actor.dead) return false;
  const hero = heroOf(state, slot);
  // D-033: a ghost gets no enemy positions at all, the most restrictive
  // reading until its spirit senses are designed. A fallen Dark Hero keeps
  // only what the monsters it owns report.
  const eyes = hero && !hero.dead ? hero : undefined;
  if (hero?.dead && team === 'light') return false;
  if (eyes && heroSees(map, eyes, actor)) return true;
  if (eyes && monsterWatches(actor, eyes)) return true;
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

function projectActor(viewer: Viewer, actor: ActorState, tick: number, contest: boolean): ActorView {
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
  if (contest) view.health = Math.max(0, Math.round((actor.hp / actor.maxHp) * 100) / 100);
  if (actor.dead) view.ghost = true;
  if (tick < actor.hiddenUntilTick) view.smoked = true;
  if (actor.actionMotion && tick - actor.actionMotion.tick <= 12) view.action = { ...actor.actionMotion };
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
    // A ghost hears only what its own side does: no monster or enemy cues.
    else if (hero.dead) continue;
    out.push(sound);
  }
  return out;
}

/** The viewer's own kit and condition. Never built for anyone else's hero. */
function projectKit(state: SimState, map: MapDef, hero: ActorState): KitView {
  const contest = state.contest!;
  const weapon = weaponOf(hero.equipment);
  const dead = hero.dead;
  const ritual = contest.rituals.find((r) => r.heroId === hero.id);
  const rescuing = contest.rescues.find((r) => r.rescuerId === hero.id);
  const rescued = contest.rescues.find((r) => r.heroId === hero.id);
  const seconds = (ticks: number) => Math.ceil(ticks / TICK_RATE);
  let channel: KitView['channel'] = null;
  if (ritual) channel = { kind: 'ritual', progress: ritual.progress / ritual.duration, seconds: seconds(ritual.duration - ritual.progress) };
  else if (rescuing) channel = { kind: 'rescue', progress: rescuing.progress / CONTEST.rescueTicks, seconds: seconds(CONTEST.rescueTicks - rescuing.progress) };
  else if (rescued) channel = { kind: 'rescued', progress: rescued.progress / CONTEST.rescueTicks, seconds: seconds(CONTEST.rescueTicks - rescued.progress) };
  let interaction: KitView['interaction'] = null;
  if (!channel && hero.team === 'light') {
    if (dead) interaction = sanctuaryFor(contest, hero) ? 'ritual' : null;
    else if (hero.intent.type === 'idle' && rescuableBody(state, map, hero)) interaction = 'rescue';
  }
  const kit: KitView = {
    hp: Math.ceil(hero.hp),
    maxHp: hero.maxHp,
    dead: Boolean(dead),
    deadSeconds: dead ? Math.floor((state.tick - dead.tick) / TICK_RATE) : 0,
    equipment: { weapon: hero.equipment.weapon, boots: hero.equipment.boots, charm: hero.equipment.charm },
    inventory: ITEM_IDS.flatMap((item) => (hero.inventory[item] ? [{ item, count: hero.inventory[item]! }] : [])),
    quick: [...hero.quick],
    attack: weapon ? { pattern: weapon.pattern, range: weapon.range, damage: weapon.damage } : null,
    attackCooldown: Math.max(0, hero.attackReadyTick - state.tick),
    evadeDistance: Math.round(evadeTicksOf(hero) * EVADE_SPEED / TICK_RATE * 10) / 10,
    evadeCooldown: Math.max(0, hero.evadeReadyTick - state.tick),
    salveHeal: salveHeal(hero.equipment),
    speed: Math.round(heroSpeed({ ...hero, sneaking: false }, state.tick) * 10) / 10,
    hasteSeconds: Math.max(0, Math.ceil((hero.hasteUntilTick - state.tick) / TICK_RATE)),
    interaction,
    channel,
    ritualLost: hero.ritualLostTick !== undefined && state.tick - hero.ritualLostTick < 8 * TICK_RATE,
  };
  if (dead?.returnTick !== undefined) kit.returnSeconds = seconds(dead.returnTick - state.tick);
  return kit;
}

function projectPickups(state: SimState, viewer: Viewer): PickupView[] {
  if (!viewer || viewer.team !== 'light') return [];
  return state.contest!.pickups.filter((p) => !p.takenBy.includes(viewer.slot)).map((p) => ({ id: p.id, item: p.item, count: p.count, x: p.x, z: p.z }));
}

/** Bodies: Light always knows where its fallen lie; a Dark Hero must see the spot. */
function projectBodies(state: SimState, map: MapDef, viewer: Viewer, hero: ActorState | undefined): BodyView[] {
  if (!viewer) return [];
  const out: BodyView[] = [];
  for (const actor of state.actors) {
    const body = actor.dead;
    if (!body || actor.team !== 'light') continue;
    if (viewer.team !== 'light' && !(hero && !hero.dead && heroSeesPoint(map, hero, body.x, body.z))) continue;
    out.push({ heroId: actor.id, slot: actor.slot, x: body.x, z: body.z });
  }
  return out;
}

/** Sanctuary condition is landmark state, not enemy intelligence (D-030, D-039). */
function projectSanctuaries(state: SimState, viewer: Viewer): SanctuaryView[] {
  return state.contest!.sanctuaries.map((s) => {
    const view: SanctuaryView = { id: s.id, name: s.name, x: s.x, z: s.z, corruption: Math.floor((s.corruption / CONTEST.corruptTicks) * 20) / 20, corrupted: s.corrupted };
    if (viewer?.team === 'light') view.threatened = s.threatened;
    return view;
  });
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
      ...(state.contest && hero ? { kit: projectKit(state, map, hero) } : {}),
    };
  }

  return {
    tick: state.tick,
    you,
    slots: state.slots.map((s) => ({ id: s.id, team: s.team, occupant: s.occupant })),
    actors: actors.map((a) => projectActor(viewer, a, state.tick, Boolean(state.contest))),
    sites: state.operation ? [] : projectSites(state, map, viewer, hero),
    evidence: projectEvidence(state, viewer),
    sounds: projectSounds(state, visible, hero),
    ...(state.operation ? { operation: projectOperation(state.operation, map, hero) } : {}),
    ...(state.contest ? {
      pickups: projectPickups(state, viewer),
      bodies: projectBodies(state, map, viewer, hero),
      sanctuaries: projectSanctuaries(state, viewer),
    } : {}),
  };
}
