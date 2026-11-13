import type { OperationView, Team } from '../protocol.ts';
import { distance, sightBlocked } from './geometry.ts';
import type { MapDef } from './map.ts';
import { TICK_RATE } from './movement.ts';
import { memoryOf } from './perception.ts';
import type { ActorState, OperationState, SimState } from './state.ts';

/** Orchard playtest setup. Energy is kept in fixed-point tick units. */
export const OPERATION = {
  x: -3, z: -28, range: 2.5, threatRange: 3.5,
  baseRate: 1, sourceRate: 2, productionGoal: 480,
  offlineGoal: 25, sabotageSeconds: 3, repairSeconds: 4,
};

export function createOperation(): OperationState {
  return { active: true, energy: 0, production: 0, offlineTicks: 0, worker: null, progress: 0, interrupted: null, result: null };
}

function inRange(hero: ActorState, map: MapDef): boolean {
  return distance(hero.x, hero.z, OPERATION.x, OPERATION.z) <= OPERATION.range &&
    !sightBlocked(map, hero.x, hero.z, OPERATION.x, OPERATION.z);
}

function interrupted(sim: SimState, map: MapDef, hero: ActorState): boolean {
  return sim.actors.some((actor) => {
    if (actor.team === hero.team || distance(actor.x, actor.z, hero.x, hero.z) > OPERATION.threatRange) return false;
    if (actor.brain) {
      const memory = memoryOf(actor.brain, hero.id);
      return Boolean(memory?.confirmed && memory.visible);
    }
    return !sightBlocked(map, actor.x, actor.z, hero.x, hero.z);
  });
}

function canWork(operation: OperationState, hero: ActorState, map: MapDef): boolean {
  const team: Team = operation.active ? 'light' : 'dark';
  return !operation.result && hero.team === team && hero.intent.type === 'idle' && inRange(hero, map);
}

export function workOperation(sim: SimState, map: MapDef, hero: ActorState): void {
  const operation = sim.operation;
  if (!operation || operation.worker !== null || !canWork(operation, hero, map)) return;
  operation.interrupted = null;
  operation.worker = hero.id;
}

export function updateOperation(sim: SimState, map: MapDef): void {
  const operation = sim.operation;
  if (!operation || operation.result) return;
  const worker = operation.worker === null ? undefined : sim.actors.find((actor) => actor.id === operation.worker);
  if (operation.worker !== null) {
    const threatened = worker && interrupted(sim, map, worker);
    if (!worker || !canWork(operation, worker, map) || threatened) {
      operation.interrupted = threatened ? worker.id : null;
      operation.worker = null;
      operation.progress = 0;
    } else {
      const seconds = operation.active ? OPERATION.sabotageSeconds : OPERATION.repairSeconds;
      if (++operation.progress >= seconds * TICK_RATE) {
        operation.active = !operation.active;
        operation.offlineTicks = 0;
        operation.worker = null;
        operation.progress = 0;
      }
    }
  }

  if (!sim.slots.some((slot) => slot.occupant === 'human')) return;
  const rate = operation.active ? OPERATION.sourceRate : 0;
  operation.energy += OPERATION.baseRate + rate;
  operation.production += rate;
  if (!operation.active) operation.offlineTicks++;
  if (operation.offlineTicks >= OPERATION.offlineGoal * TICK_RATE) operation.result = 'light';
  else if (operation.production >= OPERATION.productionGoal * TICK_RATE) operation.result = 'dark';
}

export function projectOperation(operation: OperationState, map: MapDef, hero: ActorState | undefined): OperationView {
  const action = operation.active ? 'sabotage' : 'repair';
  const seconds = operation.active ? OPERATION.sabotageSeconds : OPERATION.repairSeconds;
  return {
    x: OPERATION.x, z: OPERATION.z, active: operation.active,
    energy: Math.floor(operation.energy / TICK_RATE),
    energyPerSecond: operation.result ? 0 : OPERATION.baseRate + (operation.active ? OPERATION.sourceRate : 0),
    production: Math.floor(operation.production / TICK_RATE), productionGoal: OPERATION.productionGoal,
    offlineSeconds: Math.floor(operation.offlineTicks / TICK_RATE), offlineGoal: OPERATION.offlineGoal,
    result: operation.result,
    interaction: hero && (operation.worker === null || operation.worker === hero.id) && canWork(operation, hero, map) ? action : null,
    progress: hero && operation.worker === hero.id ? operation.progress / (seconds * TICK_RATE) : 0,
    interrupted: Boolean(hero && operation.interrupted === hero.id && inRange(hero, map)),
  };
}
