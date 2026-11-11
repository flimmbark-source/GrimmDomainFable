/** Shared scaffolding for simulation-level tests. */
import type { Command, SlotCommand, Snapshot } from '../src/shared/protocol.ts';
import { FOREST_CROSSING } from '../src/shared/sim/map.ts';
import { stopActor } from '../src/shared/sim/movement.ts';
import { projectSnapshot, viewerForSlot } from '../src/shared/sim/projection.ts';
import { actorOfSlot, createSim, occupySlot, step, type ActorState, type MonsterBrain, type SimState } from '../src/shared/sim/simulation.ts';

export const DARK_OWNER = 0; // owns the map's Scout
export const DARK_MATE = 1; // a Dark teammate who owns nothing
export const LIGHT = 4;
export const LIGHT_MATE = 5;

export interface World {
  sim: SimState;
  hero: ActorState;
  scout: ActorState;
  brain: MonsterBrain;
}

/** A match with the Scout's owner, a Dark teammate and one Light hero seated. */
export function world(seed = 1, mapId = FOREST_CROSSING.id, profile = 'default'): World {
  const sim = createSim({ seed, mapId });
  occupySlot(sim, DARK_OWNER, 'human');
  occupySlot(sim, DARK_MATE, 'human');
  occupySlot(sim, LIGHT, 'human', profile);
  const scout = sim.actors.find((a) => a.brain?.type === 'scout')!;
  return { sim, hero: actorOfSlot(sim, LIGHT)!, scout, brain: scout.brain! };
}

export function place(actor: ActorState, x: number, z: number, dirX = 0, dirZ = -1): void {
  stopActor(actor);
  actor.x = x;
  actor.z = z;
  const len = Math.hypot(dirX, dirZ);
  actor.dirX = dirX / len;
  actor.dirZ = dirZ / len;
}

/** Stand a monster on guard at a point, facing a direction (it will scan about 60 degrees either side). */
export function post(monster: ActorState, x: number, z: number, dirX: number, dirZ: number): void {
  place(monster, x, z, dirX, dirZ);
  const brain = monster.brain!;
  brain.assignment = { type: 'guard', x, z };
  brain.mode = 'patrol';
  brain.phase = 'pause';
  brain.waitTicks = 0;
}

export function cmd(slot: number, command: Command): SlotCommand {
  return { slot, command };
}

/** Step until `done` returns true; returns the number of ticks run, or -1 on timeout. */
export function runUntil(sim: SimState, done: () => boolean, maxTicks: number, each?: () => void): number {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return i;
    step(sim, []);
    each?.();
  }
  return done() ? maxTicks : -1;
}

export function run(sim: SimState, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i++) {
    step(sim, []);
    each?.();
  }
}

export function view(sim: SimState, slot: number | null): Snapshot {
  return projectSnapshot(sim, viewerForSlot(sim, slot));
}

/** Does a serialised payload contain this coordinate, as JSON would print it? */
export function mentions(payload: unknown, value: number): boolean {
  return JSON.stringify(payload).includes(JSON.stringify(value));
}
