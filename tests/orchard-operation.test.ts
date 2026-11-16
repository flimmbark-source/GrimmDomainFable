import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/shared/protocol.ts';
import { OPERATION } from '../src/shared/sim/operation.ts';
import { actorOfSlot, createSim, occupySlot, step, TICK_RATE } from '../src/shared/sim/simulation.ts';
import { ORCHARD_VALE } from '../src/shared/world/orchardVale.ts';
import { cmd, DARK_OWNER, LIGHT, LIGHT_MATE, place, post, run, runUntil, view } from './helpers.ts';

function scenario() {
  const sim = createSim({ seed: 7, mapId: ORCHARD_VALE.id, operation: true });
  for (const slot of [DARK_OWNER, LIGHT, LIGHT_MATE]) occupySlot(sim, slot, 'human');
  const dark = actorOfSlot(sim, DARK_OWNER)!;
  const light = actorOfSlot(sim, LIGHT)!;
  const scout = sim.actors.find((actor) => actor.brain?.type === 'scout')!;
  post(scout, 40, -43, 0, -1);
  // Stand the contest's relay guard down so these tests exercise the relay alone.
  for (const actor of sim.actors) if (actor.brain?.type === 'brute') post(actor, 60, -50, 0, -1);
  return { sim, light, dark, scout, operation: sim.operation! };
}

describe('Orchard Vale relay', () => {
  it('uses proximity and side, keeps work private, and slows future energy without refunding it', () => {
    const { sim, light, dark, operation } = scenario();
    step(sim, [cmd(LIGHT, { type: 'workOperation' })]);
    expect(operation.worker).toBeNull();
    place(dark, OPERATION.x, OPERATION.z);
    step(sim, [cmd(DARK_OWNER, { type: 'workOperation' })]);
    expect(operation.worker).toBeNull();
    place(dark, 30, -56);
    place(light, OPERATION.x, OPERATION.z);
    step(sim, [cmd(LIGHT, { type: 'workOperation' })]);
    expect(view(sim, LIGHT).operation?.progress).toBeGreaterThan(0);
    expect(view(sim, DARK_OWNER).operation?.progress).toBe(0);
    expect(view(sim, LIGHT_MATE).operation?.progress).toBe(0);
    expect(view(sim, LIGHT).sites).toEqual([]);
    const banked = operation.energy;
    run(sim, OPERATION.sabotageSeconds * TICK_RATE - 1);
    expect(operation.active).toBe(false);
    expect(operation.energy).toBeGreaterThan(banked);
    expect(view(sim, LIGHT).operation?.energyPerSecond).toBe(OPERATION.baseRate);
    const output = operation.production;
    run(sim, OPERATION.offlineGoal * TICK_RATE);
    expect(operation.production).toBe(output);
    expect(operation.result).toBe('light');
  });

  it('allows a Dark repair, then resolves the local Dark result only at the production goal', () => {
    const { sim, light, dark, operation } = scenario();
    place(light, OPERATION.x, OPERATION.z);
    step(sim, [cmd(LIGHT, { type: 'workOperation' })]);
    run(sim, OPERATION.sabotageSeconds * TICK_RATE - 1);
    place(light, -70, 12);
    place(dark, OPERATION.x, OPERATION.z);
    step(sim, [cmd(DARK_OWNER, { type: 'workOperation' })]);
    run(sim, OPERATION.repairSeconds * TICK_RATE - 1);
    expect(operation.active).toBe(true);
    expect(operation.offlineTicks).toBe(0);
    expect(operation.result).toBeNull();
    operation.production = OPERATION.productionGoal * TICK_RATE - OPERATION.sourceRate;
    step(sim, []);
    expect(operation.result).toBe('dark');
    const tick = sim.tick;
    step(sim, [cmd(DARK_OWNER, { type: 'workOperation' })]);
    expect(sim.tick).toBe(tick);
  });

  it('resets a channel when the Scout confirms a nearby hero', () => {
    const { sim, light, scout, operation } = scenario();
    place(light, OPERATION.x, OPERATION.z);
    step(sim, [cmd(LIGHT, { type: 'workOperation' })]);
    post(scout, OPERATION.x - 2, OPERATION.z, 1, 0);
    scout.brain!.targets.push({ actorId: light.id, attention: 1, visible: true, confirmed: true, lastAlertTick: 0 });
    step(sim, []);
    expect(operation.worker).toBeNull();
    expect(operation.progress).toBe(0);
    expect(view(sim, LIGHT).operation?.interrupted).toBe(true);
    expect(view(sim, DARK_OWNER).operation?.interrupted).toBe(false);
  });
});

describe('Orchard Goblin action orders', () => {
  it('performs a targeted whistle once, at the path destination after arriving', () => {
    const { sim, light } = scenario();
    const target = { x: light.x + 2, z: light.z };
    const heardAt: Array<{ x: number; z: number }> = [];
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'whistle', target })]);
    expect(sim.events).toEqual([]);
    expect(view(sim, LIGHT).actors.find((a) => a.id === light.id)?.order).toEqual(target);
    run(sim, 90, () => {
      for (const event of sim.events) if (event.kind === 'whistle') heardAt.push({ x: event.x, z: event.z });
    });
    expect(heardAt).toHaveLength(1);
    expect(heardAt[0]!.x).toBeCloseTo(target.x, 1);
    expect(heardAt[0]!.z).toBeCloseTo(target.z, 1);
  });

  it('cancels a walk-and-act order on Stop or a replacement shortcut', () => {
    const { sim, light } = scenario();
    const target = { x: light.x + 2, z: light.z };
    const queue = cmd(LIGHT, { type: 'heroAction', action: 'sneak', target });
    step(sim, [queue]);
    step(sim, [cmd(LIGHT, { type: 'stop' })]);
    run(sim, 50);
    expect(light.sneaking).toBe(false);
    step(sim, [queue]);
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'attack' })]);
    expect(light.intent.type).toBe('idle');
    expect(view(sim, LIGHT).actors.find((a) => a.id === light.id)?.action?.kind).toBe('attack');
    run(sim, 50);
    expect(light.sneaking).toBe(false);
  });

  it('evades from the destination and resumes held movement after an immediate evade', () => {
    const { sim, light } = scenario();
    const target = { x: light.x + 1.5, z: light.z };
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'evade', target })]);
    expect(runUntil(sim, () => light.intent.type === 'evade', 90)).toBeGreaterThan(0);
    expect(light.x).toBeCloseTo(target.x, 1);
    run(sim, 9);
    expect(light.x).toBeGreaterThan(target.x + 2);

    step(sim, [cmd(LIGHT, { type: 'moveDir', dx: -1, dz: 0 })]);
    run(sim, 40); // Evade has a short recovery before it can be used again.
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'evade' })]);
    run(sim, 9);
    expect(light.intent.type).toBe('dir');
  });

  it('validates destinations and keeps context actions out of maps without the contest', () => {
    expect(parseCommand({ type: 'heroAction', action: 'attack', target: { x: Infinity, z: 5 } })).toBeNull();
    expect(parseCommand({ type: 'heroAction', action: 'evade', target: null })).toBeNull();
    expect(parseCommand({ type: 'heroAction', action: 'whistle', target: { x: 5, z: 8 } })).toEqual({
      type: 'heroAction', action: 'whistle', target: { x: 5, z: 8 },
    });
    const plain = createSim({ seed: 7, mapId: ORCHARD_VALE.id });
    occupySlot(plain, LIGHT, 'human');
    const hero = actorOfSlot(plain, LIGHT)!;
    step(plain, [cmd(LIGHT, { type: 'heroAction', action: 'evade' })]);
    step(plain, [cmd(LIGHT, { type: 'heroAction', action: 'attack' })]);
    expect(hero.intent.type).toBe('idle');
    expect(hero.actionMotion).toBeUndefined();
  });
});
