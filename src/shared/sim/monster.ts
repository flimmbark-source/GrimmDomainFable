/**
 * Autonomous monster behaviour:
 *
 *   PATROL -> INVESTIGATE (glimpse / noise / alert) -> CHASE (confirmed)
 *          -> SEARCH (sight lost) -> RETURN -> PATROL
 *
 * The rule this file exists to enforce: a monster only ever acts on what it
 * has legally perceived. Outside a tick in which it actually sees its target
 * it never reads the target's position; it works from `lastSeen`, which is
 * frozen at the last tick of real sight. Perception (perception.ts) decides
 * what is seen and heard and calls the start* transitions below.
 */
import type { MonsterMood } from '../protocol.ts';
import { clamp, distance } from './geometry.ts';
import type { MapDef, Point } from './map.ts';
import { clampToMap, orderGoto, rotateBy, rotateToward, stopActor } from './movement.ts';
import { nearestWalkable } from './nav.ts';
import { rngNext } from './rng.ts';
import type { ActorState, Assignment, Evidence, MonsterBrain, SimState } from './state.ts';
import { TUNING } from './tuning.ts';

export function moodOf(brain: MonsterBrain): MonsterMood {
  switch (brain.mode) {
    case 'investigate': return 'suspicious';
    case 'chase': return 'alarmed';
    case 'search': return 'searching';
    default: return 'calm';
  }
}

function roll(state: SimState): number {
  const r = rngNext(state.rng);
  state.rng = r.state;
  return r.value;
}

export function addEvidence(state: SimState, e: Omit<Evidence, 'id' | 'tick'>): Evidence {
  const evidence: Evidence = { ...e, id: state.nextEvidenceId++, tick: state.tick };
  state.evidence.push(evidence);
  return evidence;
}

function beginWait(brain: MonsterBrain, ticks: number): void {
  brain.waitTicks = ticks;
  brain.waitTotal = ticks;
}

/** Sweep the gaze one way, back across, and home again over the wait. */
function lookAround(actor: ActorState, brain: MonsterBrain): void {
  const done = brain.waitTotal - brain.waitTicks;
  const quarter = brain.waitTotal / 4;
  const sign = done < quarter || done >= quarter * 3 ? 1 : -1;
  rotateBy(actor, TUNING.behaviour.scan, sign);
}

function anchorOf(map: MapDef, assignment: Assignment): Point {
  if (assignment.type === 'guard') return { x: assignment.x, z: assignment.z };
  return map.patrolRoutes[assignment.route]?.[assignment.waypoint] ?? { x: 0, z: 0 };
}

function clearLeads(actor: ActorState, brain: MonsterBrain): void {
  brain.investigate = null;
  brain.search = null;
  brain.chaseId = null;
  brain.lostTicks = 0;
  actor.speed = TUNING.monsters[brain.type].walkSpeed;
}

/** Give up whatever it was doing and walk back to its assignment. */
export function startReturn(actor: ActorState, brain: MonsterBrain, map: MapDef): void {
  clearLeads(actor, brain);
  brain.mode = 'return';
  const anchor = anchorOf(map, brain.assignment);
  orderGoto(actor, map, anchor.x, anchor.z);
}

export function startInvestigate(
  actor: ActorState, brain: MonsterBrain, kind: 'glimpse' | 'noise' | 'alert', x: number, z: number, evidenceId: number,
): void {
  clearLeads(actor, brain);
  brain.mode = 'investigate';
  brain.investigate = { kind, x, z, phase: 'notice', ticks: 0, evidenceId, dirty: false };
  stopActor(actor);
}

/** `target` must be visible to this monster on this tick. */
export function startChase(state: SimState, actor: ActorState, brain: MonsterBrain, target: ActorState): void {
  clearLeads(actor, brain);
  brain.mode = 'chase';
  brain.chaseId = target.id;
  brain.lastSeen = { x: target.x, z: target.z, dirX: target.dirX, dirZ: target.dirZ, tick: state.tick };
  brain.repathIn = 0;
  actor.speed = TUNING.monsters[brain.type].chaseSpeed;
}

/** Choose where to look after losing the target. Uses ONLY the last legally
 *  seen position and heading, the map and the seeded generator. */
function startSearch(state: SimState, actor: ActorState, brain: MonsterBrain, map: MapDef): void {
  const B = TUNING.behaviour;
  const seen = brain.lastSeen ?? { x: actor.x, z: actor.z, dirX: actor.dirX, dirZ: actor.dirZ, tick: state.tick };
  const lost = brain.targets.find((t) => t.actorId === brain.chaseId);
  if (lost) lost.confirmed = false;
  clearLeads(actor, brain);
  brain.mode = 'search';
  const points: Point[] = [];
  for (let k = 0; k < B.searchPoints; k++) {
    // First guess: onward the way the target was last seen heading.
    const ahead = k === 0 ? B.searchRadius * 0.6 : 0;
    const x = seen.x + seen.dirX * ahead + (roll(state) * 2 - 1) * B.searchRadius * 0.6;
    const z = seen.z + seen.dirZ * ahead + (roll(state) * 2 - 1) * B.searchRadius * 0.6;
    const inside = clampToMap(map, x, z, actor.radius);
    const p = nearestWalkable(map, actor.radius, inside.x, inside.z);
    if (p) points.push(p);
  }
  brain.search = { points, index: 0, ticks: 0, looking: false };
  const first = points[0];
  if (first) orderGoto(actor, map, first.x, first.z);
}

/** A Dark player's order (already validated as coming from the owner). */
export function applyOrder(actor: ActorState, brain: MonsterBrain, map: MapDef, order: { order: 'patrol' } | { order: 'guard'; x: number; z: number }): void {
  if (order.order === 'guard') {
    const inside = clampToMap(map, order.x, order.z, actor.radius);
    const post = nearestWalkable(map, actor.radius, inside.x, inside.z);
    if (!post) return;
    brain.assignment = { type: 'guard', x: post.x, z: post.z };
  } else {
    const home = brain.home;
    if (home.type === 'patrol') {
      // Rejoin the route at its nearest waypoint.
      const route = map.patrolRoutes[home.route] ?? [];
      let best = 0;
      let bestD = Infinity;
      route.forEach((p, i) => {
        const d = distance(actor.x, actor.z, p.x, p.z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      brain.assignment = { type: 'patrol', route: home.route, waypoint: best };
    } else {
      brain.assignment = { ...home };
    }
  }
  for (const t of brain.targets) t.confirmed = false;
  startReturn(actor, brain, map);
}

export function thinkMonster(state: SimState, actor: ActorState, map: MapDef): void {
  const brain = actor.brain;
  if (!brain) return;
  const B = TUNING.behaviour;
  const arrived = actor.intent.type !== 'goto';

  switch (brain.mode) {
    case 'patrol': {
      if (brain.assignment.type === 'guard') {
        if (brain.waitTicks <= 0) beginWait(brain, B.guardScanTicks);
        lookAround(actor, brain);
        brain.waitTicks--;
        return;
      }
      if (brain.phase === 'travel') {
        if (!arrived) return;
        brain.phase = 'pause';
        beginWait(brain, B.patrolPauseMinTicks + Math.floor(roll(state) * B.patrolPauseRangeTicks));
        return;
      }
      lookAround(actor, brain);
      if (--brain.waitTicks > 0) return;
      const route = map.patrolRoutes[brain.assignment.route];
      if (!route || route.length === 0) return;
      brain.assignment.waypoint = (brain.assignment.waypoint + 1) % route.length;
      const next = route[brain.assignment.waypoint]!;
      orderGoto(actor, map, next.x, next.z);
      brain.phase = 'travel';
      return;
    }

    case 'return': {
      if (!arrived) return;
      brain.mode = 'patrol';
      brain.phase = 'pause';
      beginWait(brain, brain.assignment.type === 'guard' ? B.guardScanTicks : B.patrolPauseMinTicks);
      return;
    }

    case 'investigate': {
      const lead = brain.investigate;
      if (!lead || ++lead.ticks > B.investigateTimeoutTicks) return startReturn(actor, brain, map);
      if (lead.phase === 'notice') {
        rotateToward(actor, lead.x - actor.x, lead.z - actor.z, B.turn);
        if (lead.ticks >= B.noticeTicks) {
          orderGoto(actor, map, lead.x, lead.z);
          lead.phase = 'travel';
          lead.dirty = false;
          brain.repathIn = B.repathTicks;
        }
      } else if (lead.phase === 'travel') {
        if (lead.dirty && --brain.repathIn <= 0) {
          orderGoto(actor, map, lead.x, lead.z);
          lead.dirty = false;
          brain.repathIn = B.repathTicks;
        } else if (arrived) {
          lead.phase = 'look';
          beginWait(brain, B.investigateLookTicks);
        }
      } else {
        lookAround(actor, brain);
        if (--brain.waitTicks <= 0) startReturn(actor, brain, map);
      }
      return;
    }

    case 'chase': {
      const memory = brain.targets.find((t) => t.actorId === brain.chaseId);
      // The target's true position is read ONLY inside this branch, i.e. on a
      // tick in which perception has just established real sight of it.
      const target = memory?.visible ? state.actors.find((a) => a.id === brain.chaseId) : undefined;
      if (target) {
        brain.lastSeen = { x: target.x, z: target.z, dirX: target.dirX, dirZ: target.dirZ, tick: state.tick };
        brain.lostTicks = 0;
        if (distance(actor.x, actor.z, target.x, target.z) <= B.catchDistance) {
          stopActor(actor);
          rotateToward(actor, target.x - actor.x, target.z - actor.z, B.turn);
        } else if (--brain.repathIn <= 0 || arrived) {
          orderGoto(actor, map, target.x, target.z);
          brain.repathIn = B.repathTicks;
        }
        return;
      }
      const seen = brain.lastSeen;
      if (brain.lostTicks === 0 && seen) {
        if (brain.chaseId !== null) {
          // One last-seen point per monster: sight flickering round a corner
          // must not leave the owner a trail of breadcrumbs.
          state.evidence = state.evidence.filter((e) => !(e.kind === 'lastSeen' && e.source === actor.id));
          addEvidence(state, { kind: 'lastSeen', x: seen.x, z: seen.z, source: actor.id, ownerSlot: brain.ownerSlot, shared: false, subject: brain.chaseId });
        }
        orderGoto(actor, map, seen.x, seen.z);
        brain.lostTicks = 1;
        return;
      }
      brain.lostTicks++;
      if (arrived || brain.lostTicks > B.lostTimeoutTicks) startSearch(state, actor, brain, map);
      return;
    }

    case 'search': {
      const search = brain.search;
      if (!search || ++search.ticks > B.searchMaxTicks) return startReturn(actor, brain, map);
      if (!search.looking) {
        if (!arrived) return;
        search.looking = true;
        beginWait(brain, B.searchLookTicks);
        return;
      }
      lookAround(actor, brain);
      if (--brain.waitTicks > 0) return;
      search.index++;
      search.looking = false;
      const next = search.points[search.index];
      if (!next) return startReturn(actor, brain, map);
      orderGoto(actor, map, next.x, next.z);
      return;
    }
  }
}
