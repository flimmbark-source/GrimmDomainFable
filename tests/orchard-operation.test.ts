import { describe, expect, it } from 'vitest';
import { OPERATION } from '../src/shared/sim/operation.ts';
import { actorOfSlot, createSim, occupySlot, step, TICK_RATE } from '../src/shared/sim/simulation.ts';
import { ORCHARD_VALE } from '../src/shared/world/orchardVale.ts';
import { cmd, DARK_OWNER, LIGHT, LIGHT_MATE, place, post, run, view } from './helpers.ts';

function scenario() {
  const sim = createSim({ seed: 7, mapId: ORCHARD_VALE.id, operation: true });
  for (const slot of [DARK_OWNER, LIGHT, LIGHT_MATE]) occupySlot(sim, slot, 'human');
  const dark = actorOfSlot(sim, DARK_OWNER)!;
  const light = actorOfSlot(sim, LIGHT)!;
  const scout = sim.actors.find((actor) => actor.brain?.type === 'scout')!;
  post(scout, 40, -43, 0, -1);
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
