import { describe, expect, it } from 'vitest';
import { SLOT_COUNT, type SlotCommand } from '../src/shared/protocol.ts';
import { FOREST_CLEARING } from '../src/shared/sim/map.ts';
import {
  HERO_RADIUS,
  HERO_SPEED,
  MONSTER_RADIUS,
  TICK_RATE,
  actorOfSlot,
  cloneState,
  createSim,
  hashState,
  isBlocked,
  occupySlot,
  step,
  type SimState,
} from '../src/shared/sim/simulation.ts';

const MAP = FOREST_CLEARING;
const LIGHT = 4;

function newSim(seed = 1234): SimState {
  const sim = createSim({ seed, mapId: MAP.id });
  occupySlot(sim, LIGHT, 'human');
  return sim;
}

/** tick -> commands issued at that tick */
type Script = Record<number, SlotCommand[]>;

function run(sim: SimState, ticks: number, script: Script = {}): SimState {
  for (let i = 0; i < ticks; i++) step(sim, script[sim.tick] ?? []);
  return sim;
}

const SCRIPT_A: Script = {
  0: [{ slot: LIGHT, command: { type: 'moveTo', x: -9, z: -5 } }],
  90: [{ slot: LIGHT, command: { type: 'moveDir', dx: 1, dz: -0.3 } }],
  200: [{ slot: LIGHT, command: { type: 'stop' } }],
  230: [{ slot: LIGHT, command: { type: 'moveTo', x: 12, z: 12 } }],
};

describe('determinism', () => {
  it('same seed + same command sequence = identical state', () => {
    const a = run(newSim(42), 600, SCRIPT_A);
    const b = run(newSim(42), 600, SCRIPT_A);
    expect(hashState(a)).toBe(hashState(b));
    expect(a).toEqual(b);
  });

  it('a different command sequence changes the state', () => {
    const a = run(newSim(42), 600, SCRIPT_A);
    const b = run(newSim(42), 600, { ...SCRIPT_A, 230: [{ slot: LIGHT, command: { type: 'moveTo', x: -12, z: 12 } }] });
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('a different seed changes the state (patrol pauses are seeded)', () => {
    const a = run(newSim(42), 600);
    const b = run(newSim(43), 600);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('a mid-run copy continues identically to the original', () => {
    const a = run(newSim(7), 250, SCRIPT_A);
    const b = cloneState(a);
    run(a, 350, SCRIPT_A);
    run(b, 350, SCRIPT_A);
    expect(hashState(a)).toBe(hashState(b));
  });
});

describe('player movement', () => {
  it('a command moves the controlled hero at hero speed', () => {
    const sim = newSim();
    const hero = actorOfSlot(sim, LIGHT)!;
    const start = { x: hero.x, z: hero.z };
    step(sim, [{ slot: LIGHT, command: { type: 'moveDir', dx: 0, dz: -1 } }]);
    run(sim, TICK_RATE - 1);
    expect(hero.x).toBeCloseTo(start.x, 6);
    expect(start.z - hero.z).toBeCloseTo(HERO_SPEED, 6);
    expect(hero.moving).toBe(true);
  });

  it('the hero does not move without a command', () => {
    const sim = newSim();
    const hero = actorOfSlot(sim, LIGHT)!;
    const start = { x: hero.x, z: hero.z };
    run(sim, 60);
    expect({ x: hero.x, z: hero.z }).toEqual(start);
  });

  it('moveTo arrives at the target and stops', () => {
    const sim = newSim();
    const hero = actorOfSlot(sim, LIGHT)!;
    step(sim, [{ slot: LIGHT, command: { type: 'moveTo', x: 8, z: 22 } }]);
    run(sim, 120);
    expect(hero.x).toBeCloseTo(8, 3);
    expect(hero.z).toBeCloseTo(22, 3);
    expect(hero.moving).toBe(false);
    expect(hero.intent.type).toBe('idle');
  });

  it('commands for an empty slot are ignored', () => {
    const sim = newSim();
    const before = hashState(run(cloneState(sim), 30));
    const after = hashState(run(sim, 30, { 0: [{ slot: 0, command: { type: 'moveDir', dx: 1, dz: 0 } }] }));
    expect(after).toBe(before);
  });

  it('a command cannot raise speed by sending a long direction vector', () => {
    const sim = newSim();
    const hero = actorOfSlot(sim, LIGHT)!;
    const startZ = hero.z;
    step(sim, [{ slot: LIGHT, command: { type: 'moveDir', dx: 0, dz: -500 } }]);
    run(sim, TICK_RATE - 1);
    expect(startZ - hero.z).toBeCloseTo(HERO_SPEED, 6);
  });
});

describe('collision', () => {
  const house = MAP.props.find((p) => p.kind === 'crooked_house')!;

  it('the hero cannot walk through the crooked house', () => {
    const sim = newSim();
    const hero = actorOfSlot(sim, LIGHT)!;
    // Stand south of the house and walk straight north into it for 10 seconds.
    hero.x = house.x;
    hero.z = house.z + 8;
    step(sim, [{ slot: LIGHT, command: { type: 'moveDir', dx: 0, dz: -1 } }]);
    for (let i = 0; i < 300; i++) {
      step(sim, []);
      expect(isBlocked(MAP, hero.x, hero.z, HERO_RADIUS)).toBe(false);
    }
    if (house.collider.shape !== 'box') throw new Error('house should be a box');
    expect(hero.z).toBeCloseTo(house.z + house.collider.hz + HERO_RADIUS, 6);
  });

  it('the hero never ends a tick inside any obstacle, from any approach angle', () => {
    for (const prop of MAP.props) {
      for (let k = 0; k < 16; k++) {
        const sim = newSim();
        const hero = actorOfSlot(sim, LIGHT)!;
        // Approach directions on a 16-gon, using exact table values (no trig in sim).
        const angle = (k / 16) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        hero.x = prop.x - dx * 6;
        hero.z = prop.z - dz * 6;
        if (isBlocked(MAP, hero.x, hero.z, HERO_RADIUS)) continue; // start point not free
        step(sim, [{ slot: LIGHT, command: { type: 'moveTo', x: prop.x, z: prop.z } }]);
        for (let i = 0; i < 90; i++) {
          step(sim, []);
          expect(isBlocked(MAP, hero.x, hero.z, HERO_RADIUS), `${prop.kind} @${prop.x},${prop.z} k=${k}`).toBe(false);
        }
      }
    }
  });

  it('a moveTo into an obstacle gives up instead of pushing forever', () => {
    const sim = newSim();
    const hero = actorOfSlot(sim, LIGHT)!;
    hero.x = house.x;
    hero.z = house.z + 8;
    step(sim, [{ slot: LIGHT, command: { type: 'moveTo', x: house.x, z: house.z } }]);
    run(sim, 150);
    expect(hero.intent.type).toBe('idle');
    expect(hero.moving).toBe(false);
  });

  it('the hero cannot leave the map', () => {
    const sim = newSim();
    const hero = actorOfSlot(sim, LIGHT)!;
    step(sim, [{ slot: LIGHT, command: { type: 'moveDir', dx: 1, dz: 1 } }]);
    run(sim, 600);
    expect(hero.x).toBeLessThanOrEqual(MAP.halfSize - HERO_RADIUS);
    expect(hero.z).toBeLessThanOrEqual(MAP.halfSize - HERO_RADIUS);
  });
});

describe('autonomous patrol', () => {
  it('patrol waypoints and spawn points are not inside obstacles', () => {
    for (const route of MAP.patrolRoutes) {
      for (const p of route) expect(isBlocked(MAP, p.x, p.z, MONSTER_RADIUS), `waypoint ${p.x},${p.z}`).toBe(false);
    }
    expect(MAP.spawns).toHaveLength(SLOT_COUNT);
    for (const p of MAP.spawns) expect(isBlocked(MAP, p.x, p.z, HERO_RADIUS), `spawn ${p.x},${p.z}`).toBe(false);
  });

  it('the monster visits every waypoint, in order, driven only by step()', () => {
    const sim = createSim({ seed: 5, mapId: MAP.id }); // no players at all
    const monster = sim.actors.find((a) => a.kind === 'monster')!;
    const route = MAP.patrolRoutes[0]!;
    const visited: number[] = [];
    for (let i = 0; i < TICK_RATE * 120 && visited.length < route.length + 1; i++) {
      step(sim, []);
      const next = (visited.length + 1) % route.length;
      const target = route[next]!;
      if (Math.hypot(monster.x - target.x, monster.z - target.z) < 0.1) visited.push(next);
    }
    expect(visited).toEqual([1, 2, 3, 4, 5, 0, 1].slice(0, route.length + 1));
  });

  it('the patrol is never blocked: the monster never has to abandon a leg', () => {
    const sim = createSim({ seed: 9, mapId: MAP.id });
    const monster = sim.actors.find((a) => a.kind === 'monster')!;
    for (let i = 0; i < TICK_RATE * 120; i++) {
      step(sim, []);
      expect(monster.stuckTicks).toBe(0);
    }
  });

  it('the monster does not move unless the simulation is stepped', () => {
    const sim = createSim({ seed: 5, mapId: MAP.id });
    const before = hashState(sim);
    expect(hashState(sim)).toBe(before);
    run(sim, 90);
    expect(hashState(sim)).not.toBe(before);
  });
});
