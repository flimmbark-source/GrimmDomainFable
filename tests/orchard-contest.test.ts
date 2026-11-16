/**
 * Orchard Vale contest: equipment-driven attacks, carried items, monsters that
 * fight, the Light body-and-ghost recovery loop, and the information rules
 * that must survive all of it (D-012 Scout privacy, D-033 ghost view).
 *
 * Numbers come from CONTEST / ITEMS / TUNING and are provisional; the tests
 * assert the rules, not the tuning.
 */
import { describe, expect, it } from 'vitest';
import { parseCommand, type Snapshot } from '../src/shared/protocol.ts';
import { Match } from '../src/server/match.ts';
import { CONTEST, ritualTicks } from '../src/shared/sim/contest.ts';
import { ITEMS } from '../src/shared/sim/items.ts';
import { registerMap, type MapDef } from '../src/shared/sim/map.ts';
import { EVADE_SPEED, EVADE_TICKS, TICK_DT } from '../src/shared/sim/movement.ts';
import { OPERATION } from '../src/shared/sim/operation.ts';
import { actorOfSlot, createSim, hashState, occupySlot, step, TICK_RATE, type ActorState, type SimState } from '../src/shared/sim/simulation.ts';
import { TUNING } from '../src/shared/sim/tuning.ts';
import { ORCHARD_VALE } from '../src/shared/world/orchardVale.ts';
import { cmd, DARK_MATE, DARK_OWNER, LIGHT, LIGHT_MATE, mentions, place, post, run, runUntil, view } from './helpers.ts';

/** Open ground with one tall wall, for exact hit-pattern and collision checks. */
const ARENA: MapDef = registerMap({
  id: 'test_contest_arena',
  halfSize: 40,
  props: [{ kind: 'ruin_wall', x: 0, z: 10, yaw: 0, scale: 1, collider: { shape: 'box', hx: 3, hz: 0.5 }, blocksSight: true }],
  paths: [],
  spawns: [{ x: -30, z: -30 }, { x: -27, z: -30 }, { x: -24, z: -30 }, { x: -21, z: -30 }, { x: 30, z: 30 }, { x: 27, z: 30 }, { x: 24, z: 30 }, { x: 21, z: 30 }],
  patrolRoutes: [],
  monsters: [{ type: 'scout', ownerSlot: 0, post: { x: -30, z: 30 } }],
  sites: [],
  landmarks: [],
});

interface Contest {
  sim: SimState;
  light: ActorState;
  mate: ActorState;
  dark: ActorState;
  darkMate: ActorState;
  scout: ActorState;
  /** The contest's relay guard, owned by the Dark commander's seat. */
  guard: ActorState;
}

/** Two humans per side seated; every monster parked far away, facing away. */
function contest(mapId = ORCHARD_VALE.id, seed = 5): Contest {
  const sim = createSim({ seed, mapId, operation: true });
  for (const slot of [DARK_OWNER, DARK_MATE, LIGHT, LIGHT_MATE]) occupySlot(sim, slot, 'human');
  const far = mapId === ARENA.id ? { x: -36, z: 36 } : { x: 80, z: -60 };
  const monsters = sim.actors.filter((a) => a.brain);
  monsters.forEach((m, i) => post(m, far.x - i * 3, far.z, 1, 0));
  const hero = (slot: number) => actorOfSlot(sim, slot)!;
  place(hero(DARK_OWNER), far.x, far.z + (mapId === ARENA.id ? -30 : 20));
  place(hero(DARK_MATE), far.x + 2, far.z + (mapId === ARENA.id ? -30 : 20));
  return {
    sim, light: hero(LIGHT), mate: hero(LIGHT_MATE), dark: hero(DARK_OWNER), darkMate: hero(DARK_MATE),
    scout: monsters.find((m) => m.brain!.type === 'scout')!,
    guard: monsters.find((m) => m.brain!.type === 'brute' && m.brain!.ownerSlot === DARK_OWNER)!,
  };
}

const kit = (sim: SimState, slot: number) => view(sim, slot).you!.kit!;
const attack = (slot: number) => cmd(slot, { type: 'heroAction', action: 'attack' });
const count = (sim: SimState, slot: number, item: string) => kit(sim, slot).inventory.find((i) => i.item === item)?.count ?? 0;

/** Kill a Light hero where it stands, through the real damage path. */
function slay(c: Contest, victim: ActorState): void {
  const { sim, dark } = c;
  const back = { x: dark.x, z: dark.z };
  place(dark, victim.x + 1.5, victim.z, -1, 0);
  for (let i = 0; i < 400 && !victim.dead; i++) step(sim, [attack(DARK_OWNER)]);
  expect(victim.dead).toBeDefined();
  place(dark, back.x, back.z);
}

describe('Orchard contest: equipment drives the hero actions', () => {
  it('gives every playable hero a basic weapon at spawn, humans and bots alike', () => {
    const sim = createSim({ seed: 1, mapId: ORCHARD_VALE.id, operation: true });
    for (let slot = 0; slot < 8; slot++) occupySlot(sim, slot, slot % 2 ? 'bot' : 'human');
    for (let slot = 0; slot < 8; slot++) {
      const k = kit(sim, slot);
      expect(k.equipment.weapon).not.toBeNull();
      expect(k.attack).not.toBeNull();
      expect(k.hp).toBe(CONTEST.heroHp);
    }
    // A map without the contest carries no kit and no health.
    const plain = createSim({ seed: 1, mapId: ORCHARD_VALE.id });
    occupySlot(plain, LIGHT, 'human');
    expect(view(plain, LIGHT).you!.kit).toBeUndefined();
  });

  it('a weapon swap changes the hit pattern, reach and damage of Attack', () => {
    const c = contest(ARENA.id);
    const { sim, light, scout, guard } = c;
    light.inventory.sling = 1;
    place(light, 0, 0, 1, 0);
    // Two monsters side by side in front, both inside the dagger's wedge.
    post(scout, 1.8, 0.6, 1, 0);
    post(guard, 1.8, -0.9, 1, 0);
    const before = { scout: scout.hp, guard: guard.hp };
    expect(kit(sim, LIGHT).attack).toEqual({ pattern: 'arc', range: ITEMS.dagger.weapon!.range, damage: ITEMS.dagger.weapon!.damage });
    step(sim, [attack(LIGHT)]);
    expect(scout.hp).toBe(before.scout - ITEMS.dagger.weapon!.damage);
    expect(guard.hp).toBe(before.guard - ITEMS.dagger.weapon!.damage);
    expect(view(sim, LIGHT).actors.find((a) => a.id === light.id)?.action).toMatchObject({ kind: 'attack', weapon: 'dagger' });

    // Out of the dagger's reach nothing is hit; the sling reaches, but only the first body on its line.
    post(scout, 6, 0, 1, 0);
    post(guard, 8.5, 0, 1, 0);
    place(light, 0, 0, 1, 0);
    run(sim, ITEMS.dagger.weapon!.cooldownTicks);
    const far = { scout: scout.hp, guard: guard.hp };
    step(sim, [attack(LIGHT)]);
    expect(scout.hp).toBe(far.scout);
    step(sim, [cmd(LIGHT, { type: 'equip', item: 'sling' })]);
    expect(kit(sim, LIGHT).attack).toEqual({ pattern: 'line', range: ITEMS.sling.weapon!.range, damage: ITEMS.sling.weapon!.damage });
    run(sim, ITEMS.dagger.weapon!.cooldownTicks);
    place(light, 0, 0, 1, 0);
    step(sim, [attack(LIGHT)]);
    expect(scout.hp).toBe(far.scout - ITEMS.sling.weapon!.damage);
    expect(guard.hp).toBe(far.guard);
    expect(view(sim, LIGHT).actors.find((a) => a.id === light.id)?.action?.weapon).toBe('sling');
  });

  it('cover stops a shot, the swing has a recovery time, and an empty weapon slot has no Attack', () => {
    const c = contest(ARENA.id);
    const { sim, light, scout } = c;
    light.inventory.sling = 1;
    step(sim, [cmd(LIGHT, { type: 'equip', item: 'sling' })]);
    place(light, 0, 7, 0, 1);
    post(scout, 0, 13, 0, 1); // straight behind the wall at z = 10
    const hp = scout.hp;
    step(sim, [attack(LIGHT)]);
    expect(scout.hp).toBe(hp);

    post(scout, 5, 7, 1, 0); // clear line
    run(sim, ITEMS.sling.weapon!.cooldownTicks);
    step(sim, [attack(LIGHT)]);
    expect(scout.hp).toBe(hp - ITEMS.sling.weapon!.damage);
    step(sim, [attack(LIGHT)]); // still recovering
    expect(scout.hp).toBe(hp - ITEMS.sling.weapon!.damage);
    expect(kit(sim, LIGHT).attackCooldown).toBeGreaterThan(0);

    step(sim, [cmd(LIGHT, { type: 'unequip', slot: 'weapon' })]);
    expect(kit(sim, LIGHT).attack).toBeNull();
    run(sim, ITEMS.sling.weapon!.cooldownTicks);
    step(sim, [attack(LIGHT)]);
    expect(scout.hp).toBe(hp - ITEMS.sling.weapon!.damage);
  });

  it('Evade and Sneak work with the boots slot empty; boots extend Evade and walls still stop it', () => {
    const c = contest(ARENA.id);
    const { sim, light } = c;
    light.inventory.springheel_boots = 1;
    const dash = () => {
      place(light, -10, -10, 1, 0);
      step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'evade' })]);
      run(sim, 40);
      return light.x + 10;
    };
    const bare = dash();
    expect(bare).toBeCloseTo(EVADE_TICKS * EVADE_SPEED * TICK_DT, 5);
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'sneak' })]);
    expect(light.sneaking).toBe(true);
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'sneak' })]);

    step(sim, [cmd(LIGHT, { type: 'equip', item: 'springheel_boots' })]);
    expect(kit(sim, LIGHT).evadeDistance).toBeGreaterThan(bare);
    const booted = dash();
    expect(booted).toBeCloseTo((EVADE_TICKS + ITEMS.springheel_boots.evadeBonusTicks!) * EVADE_SPEED * TICK_DT, 5);

    // Into the wall (south face at z = 9.5): the longer dash is cut short at the stone.
    place(light, 0, 7.5, 0, 1);
    run(sim, 40);
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'evade' })]);
    run(sim, 40);
    expect(light.z).toBeLessThanOrEqual(9.5 - light.radius + 1e-6);
    expect(light.z - 7.5).toBeLessThan(booted);

    step(sim, [cmd(LIGHT, { type: 'unequip', slot: 'boots' })]);
    run(sim, 60);
    expect(dash()).toBeCloseTo(bare, 5);
  });

  it('the charm changes salve healing the moment it is worn or removed, and a quick-slot use updates health and count', () => {
    const c = contest(ARENA.id);
    const { sim, light } = c;
    light.inventory.spiral_charm = 1;
    light.inventory.salve = 3;
    const base = ITEMS.salve.heal!;
    expect(kit(sim, LIGHT).quick[0]).toBe('salve');

    // Full health: nothing is used up.
    step(sim, [cmd(LIGHT, { type: 'useQuick', slot: 0 })]);
    expect(count(sim, LIGHT, 'salve')).toBe(3);

    light.hp = 10;
    step(sim, [cmd(LIGHT, { type: 'useQuick', slot: 0 })]);
    expect(kit(sim, LIGHT).hp).toBe(10 + base);
    expect(count(sim, LIGHT, 'salve')).toBe(2);

    step(sim, [cmd(LIGHT, { type: 'equip', item: 'spiral_charm' })]);
    const boosted = kit(sim, LIGHT).salveHeal;
    expect(boosted).toBeGreaterThan(base);
    run(sim, CONTEST.itemCooldownTicks);
    step(sim, [cmd(LIGHT, { type: 'useQuick', slot: 0 })]);
    expect(kit(sim, LIGHT).hp).toBe(10 + base + boosted);
    expect(count(sim, LIGHT, 'salve')).toBe(1);

    step(sim, [cmd(LIGHT, { type: 'unequip', slot: 'charm' })]);
    expect(kit(sim, LIGHT).salveHeal).toBe(base);
    light.hp = 10;
    run(sim, CONTEST.itemCooldownTicks);
    step(sim, [cmd(LIGHT, { type: 'useQuick', slot: 0 })]);
    expect(kit(sim, LIGHT).hp).toBe(10 + base);
    // The last one is gone from the bag and from its quick slot.
    expect(count(sim, LIGHT, 'salve')).toBe(0);
    expect(kit(sim, LIGHT).quick).toEqual([null, null, null]);
  });

  it('the server decides what can be equipped, assigned and dropped', () => {
    const c = contest(ARENA.id);
    const { sim, light } = c;
    light.inventory.herb = 2;
    step(sim, [cmd(LIGHT, { type: 'equip', item: 'sling' })]); // not owned
    expect(kit(sim, LIGHT).equipment.weapon).toBe('dagger');
    step(sim, [cmd(LIGHT, { type: 'equip', item: 'salve' })]); // not gear
    expect(kit(sim, LIGHT).equipment).toEqual({ weapon: 'dagger', boots: null, charm: null });
    step(sim, [cmd(LIGHT, { type: 'assignQuick', slot: 1, item: 'herb' })]); // a material is not usable
    step(sim, [cmd(LIGHT, { type: 'assignQuick', slot: 2, item: 'dagger' })]);
    expect(kit(sim, LIGHT).quick).toEqual(['salve', null, null]);
    step(sim, [cmd(LIGHT, { type: 'assignQuick', slot: 2, item: 'salve' })]); // moves, never duplicates
    expect(kit(sim, LIGHT).quick).toEqual([null, null, 'salve']);
    step(sim, [cmd(LIGHT, { type: 'dropItem', item: 'dagger' })]); // worn: refused
    expect(count(sim, LIGHT, 'dagger')).toBe(1);
    step(sim, [cmd(LIGHT, { type: 'dropItem', item: 'herb' })]);
    expect(count(sim, LIGHT, 'herb')).toBe(1);

    expect(parseCommand({ type: 'equip', item: 'excalibur' })).toBeNull();
    expect(parseCommand({ type: 'equip', item: '__proto__' })).toBeNull();
    expect(parseCommand({ type: 'unequip', slot: 'hat' })).toBeNull();
    expect(parseCommand({ type: 'useQuick', slot: 3 })).toBeNull();
    expect(parseCommand({ type: 'assignQuick', slot: 0.5, item: 'salve' })).toBeNull();
    expect(parseCommand({ type: 'assignQuick', slot: 1, item: null })).toEqual({ type: 'assignQuick', slot: 1, item: null });
    expect(parseCommand({ type: 'revive', hero: 3 })).toEqual({ type: 'revive' });
  });

  it('finds in Orchard Vale are collected by walking to them: a weapon, an active item and a material stack', () => {
    const c = contest();
    const { sim, light, mate } = c;
    const lightView = view(sim, LIGHT);
    expect(lightView.pickups!.map((p) => p.item)).toEqual(expect.arrayContaining(['sling', 'salve', 'herb', 'springheel_boots', 'spiral_charm']));
    expect(view(sim, DARK_OWNER).pickups).toEqual([]);
    expect(view(sim, null).pickups).toEqual([]);

    for (const item of ['sling', 'salve', 'herb'] as const) {
      const find = CONTEST.pickups.find((p) => p.item === item)!;
      step(sim, [cmd(LIGHT, { type: 'moveTo', x: find.x, z: find.z })]);
      expect(runUntil(sim, () => light.intent.type === 'idle', 900)).toBeGreaterThan(0);
    }
    expect(count(sim, LIGHT, 'sling')).toBe(1);
    expect(count(sim, LIGHT, 'salve')).toBe(3); // one from the starting kit
    expect(count(sim, LIGHT, 'herb')).toBe(3);
    expect(kit(sim, LIGHT).equipment.weapon).toBe('dagger'); // found gear is carried, not auto-equipped
    expect(view(sim, LIGHT).pickups!.some((p) => p.item === 'sling')).toBe(false);
    // Each Light Hero has their own share; a teammate's is still there.
    expect(view(sim, LIGHT_MATE).pickups!.some((p) => p.item === 'sling')).toBe(true);
    expect(count(sim, LIGHT_MATE, 'sling')).toBe(0);
    expect(mate.inventory.sling).toBeUndefined();
    // Kits are private to their seat.
    expect(view(sim, LIGHT_MATE).actors.find((a) => a.id === light.id)).not.toHaveProperty('kit');
    expect(JSON.stringify(view(sim, DARK_OWNER))).not.toContain('sling');
  });
});

describe('Orchard contest: hotkeys and arrival orders share the server rules', () => {
  it('an action-menu Attack walks to the point and strikes there; the hotkey strikes at once', () => {
    const c = contest(ARENA.id);
    const { sim, light, scout } = c;
    place(light, -10, 0, 1, 0);
    post(scout, -3.6, 0, 1, 0);
    const hp = scout.hp;
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'attack', target: { x: -5, z: 0 } })]);
    expect(scout.hp).toBe(hp); // nothing until arrival
    expect(runUntil(sim, () => scout.hp < hp, 120)).toBeGreaterThan(5);
    expect(light.x).toBeCloseTo(-5, 1);
    expect(scout.hp).toBe(hp - ITEMS.dagger.weapon!.damage);
    // Same cooldown either way.
    step(sim, [attack(LIGHT)]);
    expect(scout.hp).toBe(hp - ITEMS.dagger.weapon!.damage);
    run(sim, ITEMS.dagger.weapon!.cooldownTicks);
    post(scout, -3.6, 0, 1, 0);
    step(sim, [attack(LIGHT)]);
    expect(scout.hp).toBe(hp - 2 * ITEMS.dagger.weapon!.damage);
  });

  it('an order onto blocked ground resolves to the nearest standable point and still acts; X cancels a queued action', () => {
    const c = contest(ARENA.id);
    const { sim, light } = c;
    place(light, 0, 4, 0, 1);
    // The middle of the wall.
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'sneak', target: { x: 0, z: 10 } })]);
    const order = view(sim, LIGHT).actors.find((a) => a.id === light.id)!.order!;
    expect(Math.abs(order.z - 10)).toBeGreaterThanOrEqual(0.5 + light.radius - 1e-6);
    expect(runUntil(sim, () => light.sneaking, 200)).toBeGreaterThan(0);
    expect(light.x).toBeCloseTo(order.x, 1);
    expect(light.z).toBeCloseTo(order.z, 1);
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'sneak' })]);

    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'whistle', target: { x: 12, z: 4 } })]);
    run(sim, 5);
    step(sim, [cmd(LIGHT, { type: 'stop' })]);
    let whistled = false;
    run(sim, 200, () => { if (sim.events.some((e) => e.kind === 'whistle')) whistled = true; });
    expect(whistled).toBe(false);
    expect(light.intent.type).toBe('idle');

    // A plain move replaces a queued action as well.
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'sneak', target: { x: 12, z: 4 } })]);
    step(sim, [cmd(LIGHT, { type: 'moveTo', x: 10, z: 0 })]);
    run(sim, 200);
    expect(light.sneaking).toBe(false);
  });
});

describe('Orchard contest: a Dark Hero fights while the army holds its orders', () => {
  it('the commander fights in person while both of their monsters keep their assignments', () => {
    const c = contest();
    const { sim, light, dark, scout, guard } = c;
    // Standing orders from the owning seat, through the real command.
    step(sim, [
      cmd(DARK_OWNER, { type: 'monsterOrder', actorId: scout.id, order: 'guard', x: 0.6, z: -25.5 }),
      cmd(DARK_OWNER, { type: 'monsterOrder', actorId: guard.id, order: 'guard', x: 2, z: -31 }),
    ]);
    expect(runUntil(sim, () => scout.brain!.mode === 'patrol' && guard.brain!.mode === 'patrol', 3000)).toBeGreaterThan(0);
    const posts = [{ type: 'guard', x: 0.6, z: -25.5 }, { type: 'guard', x: 2, z: -31 }];

    // The fight happens on the west road, far out of the monsters' sight.
    place(light, -72, 12, 1, 0);
    place(dark, -70, 12, -1, 0);
    let exchanged = 0;
    for (let i = 0; i < 300 && !light.dead; i++) {
      step(sim, i < 40 ? [attack(DARK_OWNER), attack(LIGHT)] : [attack(DARK_OWNER)]);
      if (dark.hp < dark.maxHp && light.hp < light.maxHp) exchanged++;
    }
    expect(exchanged).toBeGreaterThan(0);
    expect(light.dead).toBeDefined();
    expect(dark.hp).toBeLessThan(dark.maxHp);
    [scout, guard].forEach((m, i) => {
      expect(m.brain!.mode).toBe('patrol');
      expect(m.brain!.assignment).toMatchObject({ type: 'guard' });
      expect(Math.hypot((m.brain!.assignment as { x: number }).x - posts[i]!.x, (m.brain!.assignment as { z: number }).z - posts[i]!.z)).toBeLessThan(0.6);
      expect(Math.hypot(m.x - posts[i]!.x, m.z - posts[i]!.z)).toBeLessThan(0.6);
    });
    // The owner still gets their monsters' state; a teammate does not.
    expect(view(sim, DARK_OWNER).actors.filter((a) => a.mode !== undefined).map((a) => a.id).sort()).toEqual([scout.id, guard.id].sort());
    expect(view(sim, DARK_MATE).actors.find((a) => a.id === scout.id)?.mode).toBeUndefined();
  });

  it('a monster that catches its confirmed target bites it; a routed monster returns to its assignment', () => {
    const c = contest(ARENA.id);
    const { sim, light, scout } = c;
    place(light, 0, -10, 1, 0);
    post(scout, -1.5, -10, 1, 0);
    expect(runUntil(sim, () => light.hp < light.maxHp, 200)).toBeGreaterThan(0);
    expect(scout.brain!.mode).toBe('chase');
    expect((light.maxHp - light.hp) % TUNING.monsters.scout.attackDamage).toBe(0);

    const home = { ...scout.brain!.assignment };
    for (let i = 0; i < 600 && !scout.dead; i++) step(sim, [attack(LIGHT)]);
    expect(scout.dead).toBeDefined();
    // Routed: nobody is sent it, it does nothing, and the hero is no longer hunted.
    expect(view(sim, DARK_OWNER).actors.some((a) => a.id === scout.id)).toBe(false);
    expect(view(sim, LIGHT).you!.spotted).toBe(false);
    const hp = light.hp;
    run(sim, CONTEST.monsterReturnTicks + 5);
    expect(scout.dead).toBeUndefined();
    expect(scout.hp).toBe(scout.maxHp);
    expect(scout.brain!.assignment).toEqual(home);
    expect(light.hp).toBe(hp);
  });

  it('damage interrupts a sabotage, and sabotage still changes the future Dark Energy rate only', () => {
    const c = contest();
    const { sim, light, dark } = c;
    place(light, OPERATION.x, OPERATION.z + 1.5, 0, -1);
    step(sim, [cmd(LIGHT, { type: 'workOperation' })]);
    run(sim, 20);
    expect(view(sim, LIGHT).operation!.progress).toBeGreaterThan(0);
    // A sling stone from outside the relay's own threat ring.
    dark.inventory.sling = 1;
    dark.equipment.weapon = 'sling';
    place(dark, OPERATION.x, OPERATION.z + 8, 0, -1);
    step(sim, [attack(DARK_OWNER)]);
    expect(light.hp).toBe(light.maxHp - ITEMS.sling.weapon!.damage);
    expect(sim.operation!.worker).toBeNull();
    expect(view(sim, LIGHT).operation!.interrupted).toBe(true);

    place(dark, 80, -40);
    expect(view(sim, LIGHT).operation!.energyPerSecond).toBe(OPERATION.baseRate + OPERATION.sourceRate);
    step(sim, [cmd(LIGHT, { type: 'workOperation' })]);
    run(sim, OPERATION.sabotageSeconds * TICK_RATE);
    const banked = sim.operation!.energy;
    expect(sim.operation!.active).toBe(false);
    expect(view(sim, DARK_OWNER).operation!.energyPerSecond).toBe(OPERATION.baseRate);
    run(sim, 30);
    expect(sim.operation!.energy).toBe(banked + 30 * OPERATION.baseRate);
  });
});

describe('Orchard contest: Scout information stays private in a fight', () => {
  it('the owner alone gets live Scout vision; the team gets a time-stamped report; the Scout searches from where it lost sight', () => {
    const c = contest();
    const { sim, light, scout } = c;
    // West road: the Scout looks east along it, the hero stands in its view.
    post(scout, -80, 12, 1, 0);
    place(light, -72, 12, -1, 0);
    expect(runUntil(sim, () => scout.brain!.mode === 'chase', 200)).toBeGreaterThan(0);
    const confirmedAt = sim.tick;
    const owner = view(sim, DARK_OWNER);
    const teammate = view(sim, DARK_MATE);
    expect(owner.actors.some((a) => a.id === light.id)).toBe(true);
    expect(owner.actors.find((a) => a.id === light.id)?.health).toBeDefined();
    // The teammate: no hero, no health, no Scout intent. Just the report.
    expect(teammate.actors.some((a) => a.id === light.id)).toBe(false);
    const report = teammate.evidence.find((e) => e.kind === 'sighting')!;
    expect(report.subject).toBe(light.id);
    expect(confirmedAt - report.tick).toBeLessThanOrEqual(1);
    expect(teammate.actors.find((a) => a.id === scout.id)).not.toHaveProperty('order');
    expect(teammate.actors.find((a) => a.id === scout.id)).not.toHaveProperty('mode');

    // The hero moves on; the report must stay frozen for the teammate.
    step(sim, [cmd(LIGHT, { type: 'moveTo', x: -62, z: 12.3 })]);
    run(sim, 40);
    const later = view(sim, DARK_MATE);
    expect(later.evidence.find((e) => e.id === report.id)).toMatchObject({ x: report.x, z: report.z, tick: report.tick });
    expect(mentions(later, light.x)).toBe(false);
    expect(mentions(later, light.z)).toBe(false);

    // Sight is broken (the hero is simply elsewhere). The Scout walks to the
    // last place it saw the hero and searches round it, never the true position.
    const before = { x: light.x, z: light.z };
    place(light, 41.375, 37.875);
    // (The test moves the hero by hand, so mark this tick's sight as already broken.)
    for (const memory of scout.brain!.targets) memory.visible = false;
    expect(runUntil(sim, () => scout.brain!.mode === 'search', 900)).toBeGreaterThan(0);
    const last = scout.brain!.lastSeen!;
    expect(Math.hypot(last.x - before.x, last.z - before.z)).toBeLessThan(0.5); // where it really last saw the hero
    for (const p of scout.brain!.search!.points) expect(Math.hypot(p.x - last.x, p.z - last.z)).toBeLessThan(TUNING.behaviour.searchRadius * 2);
    const lost = view(sim, DARK_OWNER).evidence.find((e) => e.kind === 'lastSeen')!;
    expect(lost).toMatchObject({ x: last.x, z: last.z });
    expect(view(sim, DARK_MATE).evidence.some((e) => e.kind === 'lastSeen')).toBe(false);
    for (const slot of [DARK_OWNER, DARK_MATE]) {
      expect(mentions(view(sim, slot), 41.375)).toBe(false);
      expect(mentions(view(sim, slot), 37.875)).toBe(false);
    }
  });

  it("no Dark or public snapshot ever carries a ghost, and the ghost's own view carries no enemy", () => {
    const c = contest();
    const { sim, light, dark, darkMate, scout } = c;
    place(light, -72.25, 12.75, 1, 0);
    slay(c, light);
    // Dark heroes and a Scout stand right next to the ghost, looking at it.
    place(dark, light.x + 2.125, light.z + 0.375, -1, 0);
    place(darkMate, light.x - 2.375, light.z - 0.125, 1, 0);
    post(scout, light.x + 0.625, light.z + 3.125, 0, -1);
    step(sim, [cmd(LIGHT, { type: 'moveTo', x: -68.625, z: 11.375 })]);
    run(sim, 90);
    expect(light.x).toBeCloseTo(-68.625, 1); // the ghost is under its player's control

    const ghost = view(sim, LIGHT);
    expect(ghost.you!.kit!.dead).toBe(true);
    expect(ghost.actors.find((a) => a.id === light.id)?.ghost).toBe(true);
    expect(ghost.actors.filter((a) => a.team === 'dark')).toEqual([]);
    expect(ghost.evidence).toEqual([]);
    expect(ghost.you!.attention).toBe(0);
    for (const enemy of [dark, darkMate, scout]) {
      expect(mentions(ghost, enemy.x)).toBe(false);
    }
    // Nothing hunts it and nobody on the other side is told where it is.
    expect(scout.brain!.targets).toEqual([]);
    expect(scout.brain!.mode).not.toBe('chase');
    for (const viewer of [DARK_OWNER, DARK_MATE, null]) {
      const snapshot: Snapshot = view(sim, viewer);
      expect(snapshot.actors.some((a) => a.id === light.id)).toBe(false);
      expect(mentions(snapshot, light.x)).toBe(false);
      expect(mentions(snapshot, light.z)).toBe(false);
    }
    // The body is a thing in the world: a Dark Hero who can see the spot sees it; the public feed does not carry it.
    expect(view(sim, DARK_OWNER).bodies).toEqual([{ heroId: light.id, slot: LIGHT, x: -72.25, z: 12.75 }]);
    expect(view(sim, null).bodies).toEqual([]);
    // A living teammate still sees enemies with their own eyes.
    place(c.mate, light.x, light.z - 3);
    step(sim, []);
    expect(view(sim, LIGHT_MATE).actors.some((a) => a.id === dark.id)).toBe(true);
  });
});

describe('Orchard contest: death leaves a body and a ghost', () => {
  it('one actor becomes the ghost; it can travel but cannot fight, use items, whistle, sneak or sabotage', () => {
    const c = contest();
    const { sim, light, dark } = c;
    place(light, OPERATION.x, OPERATION.z + 1.5, 0, -1);
    const heroes = sim.actors.filter((a) => a.kind === 'hero').length;
    slay(c, light);
    expect(sim.actors.filter((a) => a.kind === 'hero').length).toBe(heroes);
    expect(sim.slots[LIGHT]!.actorId).toBe(light.id);
    expect(light.dead).toMatchObject({ x: OPERATION.x, z: OPERATION.z + 1.5 });
    expect(view(sim, LIGHT_MATE).bodies).toEqual([{ heroId: light.id, slot: LIGHT, x: OPERATION.x, z: OPERATION.z + 1.5 }]);

    place(dark, light.x + 1, light.z, -1, 0);
    const hp = dark.hp;
    light.inventory.salve = 2;
    step(sim, [attack(LIGHT), cmd(LIGHT, { type: 'useQuick', slot: 0 }), cmd(LIGHT, { type: 'heroAction', action: 'whistle' }),
      cmd(LIGHT, { type: 'heroAction', action: 'sneak' }), cmd(LIGHT, { type: 'workOperation' }), cmd(LIGHT, { type: 'equip', item: 'dagger' })]);
    expect(dark.hp).toBe(hp);
    expect(light.hp).toBe(0);
    expect(light.inventory.salve).toBe(2);
    expect(light.sneaking).toBe(false);
    expect(sim.events.some((e) => e.kind === 'whistle')).toBe(false);
    expect(sim.operation!.worker).toBeNull();
    expect(view(sim, LIGHT).operation!.interaction).toBeNull();
    // The ghost cannot be hurt again.
    for (let i = 0; i < 60; i++) step(sim, [attack(DARK_OWNER)]);
    expect(light.dead!.tick).toBeLessThan(sim.tick - 50);
  });
});

describe('Orchard contest: revival eligibility', () => {
  /** The Light hero lies dead on the west road; everyone else is far away. */
  function fallen(): Contest {
    const c = contest();
    place(c.light, -72.25, 12.75, 1, 0);
    place(c.mate, -84, 12);
    slay(c, c.light);
    return c;
  }
  const revive = (slot: number) => cmd(slot, { type: 'revive' });

  it('a ghost cannot revive itself at its own body', () => {
    const { sim, light } = fallen();
    expect(kit(sim, LIGHT).interaction).toBeNull();
    step(sim, [revive(LIGHT)]);
    run(sim, CONTEST.rescueTicks + CONTEST.ritualMaxTicks);
    expect(sim.contest!.rescues).toEqual([]);
    expect(sim.contest!.rituals).toEqual([]);
    expect(light.dead).toBeDefined();
  });

  it('only a living Light Hero beside the body can revive it: not a Dark Hero, not another ghost, not from range', () => {
    const c = fallen();
    const { sim, light, mate, dark } = c;
    // A Dark Hero on the body.
    place(dark, light.dead!.x + 1, light.dead!.z);
    expect(kit(sim, DARK_OWNER).interaction).toBeNull();
    step(sim, [revive(DARK_OWNER)]);
    expect(sim.contest!.rescues).toEqual([]);
    place(dark, 80, -40);
    // A living ally too far away.
    place(mate, light.dead!.x + CONTEST.rescueRange + 1, light.dead!.z);
    expect(kit(sim, LIGHT_MATE).interaction).toBeNull();
    step(sim, [revive(LIGHT_MATE)]);
    expect(sim.contest!.rescues).toEqual([]);
    // A dead ally on the body.
    place(mate, light.dead!.x + 1, light.dead!.z + 1);
    slay(c, mate);
    step(sim, [revive(LIGHT_MATE)]);
    run(sim, CONTEST.rescueTicks + 5);
    expect(sim.contest!.rescues).toEqual([]);
    expect(light.dead).toBeDefined();
    expect(mate.dead).toBeDefined();
  });

  it('a living ally who holds still beside the body revives the hero there; moving or being hit breaks it', () => {
    const c = fallen();
    const { sim, light, mate, dark } = c;
    const body = { ...light.dead! };
    // The ghost has wandered off; revival is still at the body.
    step(sim, [cmd(LIGHT, { type: 'moveTo', x: -80, z: 12 })]);
    run(sim, 60);
    place(mate, body.x + 1.2, body.z, -1, 0);
    step(sim, []);
    expect(kit(sim, LIGHT_MATE).interaction).toBe('rescue');

    // Walking away abandons it.
    step(sim, [revive(LIGHT_MATE)]);
    run(sim, 30);
    expect(kit(sim, LIGHT_MATE).channel).toMatchObject({ kind: 'rescue' });
    expect(kit(sim, LIGHT).channel).toMatchObject({ kind: 'rescued' });
    step(sim, [cmd(LIGHT_MATE, { type: 'moveTo', x: body.x + 1.8, z: body.z })]);
    run(sim, CONTEST.rescueTicks);
    expect(light.dead).toBeDefined();
    expect(sim.contest!.rescues).toEqual([]);

    // A hit breaks it too.
    step(sim, [revive(LIGHT_MATE)]);
    run(sim, 30);
    place(dark, mate.x + 1.5, mate.z, -1, 0);
    step(sim, [attack(DARK_OWNER)]);
    step(sim, []);
    expect(sim.contest!.rescues).toEqual([]);
    place(dark, 80, -40);

    // Left alone, it completes: the hero stands up at the body, the ghost is gone.
    step(sim, [revive(LIGHT_MATE)]);
    run(sim, CONTEST.rescueTicks - 2);
    expect(light.dead).toBeDefined();
    run(sim, 2);
    expect(light.dead).toBeUndefined();
    expect(light.x).toBe(body.x);
    expect(light.z).toBe(body.z);
    expect(light.hp).toBe(light.maxHp * CONTEST.rescueHpFraction);
    expect(view(sim, LIGHT_MATE).bodies).toEqual([]);
    expect(kit(sim, LIGHT).dead).toBe(false);
    // Alive again: actions work.
    step(sim, [cmd(LIGHT, { type: 'heroAction', action: 'sneak' })]);
    expect(light.sneaking).toBe(true);
  });

  it('a ghost must reach an uncorrupted sanctuary and perform the ritual; arrival alone does nothing', () => {
    const { sim, light } = fallen();
    const shrine = sim.contest!.sanctuaries[0]!;
    step(sim, [revive(LIGHT)]); // nowhere near
    expect(sim.contest!.rituals).toEqual([]);
    step(sim, [cmd(LIGHT, { type: 'moveTo', x: shrine.x, z: shrine.z })]);
    expect(runUntil(sim, () => kit(sim, LIGHT).interaction === 'ritual', 900)).toBeGreaterThan(0);
    run(sim, CONTEST.ritualMaxTicks + 30);
    expect(light.dead).toBeDefined(); // D-038: no automatic resurrection
    step(sim, [revive(LIGHT)]);
    const ritual = sim.contest!.rituals[0]!;
    expect(ritual.sanctuaryId).toBe(shrine.id);
    run(sim, ritual.duration - 2);
    expect(light.dead).toBeDefined();
    run(sim, 3);
    expect(light.dead).toBeUndefined();
    expect(light.hp).toBe(light.maxHp);
    expect(Math.hypot(light.x - shrine.x, light.z - shrine.z)).toBeLessThanOrEqual(CONTEST.sanctuaryRadius);
  });

  it('the ritual is longer for the recently dead and shorter for the long dead, never instant', () => {
    expect(ritualTicks(0)).toBe(CONTEST.ritualMaxTicks);
    expect(ritualTicks(30 * 30)).toBeLessThan(ritualTicks(5 * 30));
    expect(ritualTicks(1e9)).toBe(CONTEST.ritualMinTicks);
    expect(CONTEST.ritualMinTicks).toBeGreaterThan(0);

    const durationAfter = (wait: number) => {
      const { sim, light } = fallen();
      const shrine = sim.contest!.sanctuaries[0]!;
      place(light, shrine.x + 1, shrine.z);
      run(sim, wait);
      step(sim, [revive(LIGHT)]);
      return { duration: sim.contest!.rituals[0]!.duration, shown: kit(sim, LIGHT).channel!.seconds };
    };
    const fresh = durationAfter(0);
    const old = durationAfter(60 * TICK_RATE);
    expect(fresh.duration).toBeGreaterThan(old.duration);
    expect(fresh.shown).toBeGreaterThan(old.shown);
  });

  it('a ritual under way continues through a siege and nearby combat, and ends only at full corruption', () => {
    const c = fallen();
    const { sim, light, mate, dark, scout } = c;
    const shrine = sim.contest!.sanctuaries[0]!;
    place(light, shrine.x + 1, shrine.z);
    step(sim, [revive(LIGHT)]);
    const ritual = sim.contest!.rituals[0]!;

    // The siege starts: a Scout in the precinct, a living ally being attacked beside the ghost.
    post(scout, shrine.x - 4, shrine.z, -1, 0);
    place(mate, shrine.x + 2, shrine.z + 1);
    place(dark, shrine.x + 3.2, shrine.z + 1, -1, 0);
    run(sim, 30, () => undefined);
    for (let i = 0; i < 40; i++) step(sim, [attack(DARK_OWNER)]);
    expect(mate.hp).toBeLessThan(mate.maxHp);
    const besieged = view(sim, LIGHT).sanctuaries!.find((s) => s.id === shrine.id)!;
    expect(besieged.threatened).toBe(true);
    expect(besieged.corruption).toBeGreaterThan(0);
    expect(besieged.corrupted).toBe(false);
    expect(sim.contest!.rituals[0]).toBe(ritual);
    expect(ritual.progress).toBeGreaterThanOrEqual(70); // never paused or reset
    // D-030: the alert names no attacker. The ghost's snapshot still has no enemy in it.
    expect(view(sim, LIGHT).actors.filter((a) => a.team === 'dark')).toEqual([]);
    // Dark is told the sanctuary's condition, never whether a ritual is under way there.
    expect(view(sim, DARK_OWNER).sanctuaries!.find((s) => s.id === shrine.id)).not.toHaveProperty('threatened');
    expect(Object.keys(view(sim, DARK_OWNER).sanctuaries![0]!).sort()).toEqual(['corrupted', 'corruption', 'id', 'name', 'x', 'z']);
    expect(JSON.stringify(view(sim, DARK_OWNER))).not.toContain('"ritual"');
    expect(view(sim, DARK_OWNER).you!.kit!.channel).toBeNull();

    // The takeover completes first: the ritual ends and the ghost stays dead.
    shrine.corruption = CONTEST.corruptTicks - 5;
    run(sim, 6);
    expect(shrine.corrupted).toBe(true);
    expect(sim.contest!.rituals).toEqual([]);
    expect(light.dead).toBeDefined();
    expect(kit(sim, LIGHT).ritualLost).toBe(true);
    expect(kit(sim, LIGHT).interaction).toBeNull();
    step(sim, [revive(LIGHT)]);
    expect(sim.contest!.rituals).toEqual([]);
    // Ghosts can sense that it fell before going there (D-039).
    expect(view(sim, LIGHT).sanctuaries!.find((s) => s.id === shrine.id)!.corrupted).toBe(true);

    // The other sanctuary is still eligible.
    const other = sim.contest!.sanctuaries[1]!;
    place(light, other.x, other.z + 1);
    step(sim, [revive(LIGHT)]);
    const second = sim.contest!.rituals[0]!;
    expect(second.sanctuaryId).toBe(other.id);
    run(sim, second.duration + 1);
    expect(light.dead).toBeUndefined();
  });

  it('a Dark Hero in person corrupts faster than monsters alone, and an abandoned takeover decays', () => {
    const fill = (withHero: boolean) => {
      const c = contest();
      const shrine = c.sim.contest!.sanctuaries[1]!;
      post(c.scout, shrine.x + 3, shrine.z, 1, 0);
      if (withHero) place(c.dark, shrine.x - 3, shrine.z);
      return { c, shrine, ticks: runUntil(c.sim, () => shrine.corrupted, CONTEST.corruptTicks + 10) };
    };
    const alone = fill(false);
    const joined = fill(true);
    expect(alone.ticks).toBeGreaterThan(0);
    expect(joined.ticks).toBeGreaterThan(0);
    expect(joined.ticks).toBeLessThan(alone.ticks);

    const { sim, scout } = contest();
    const shrine = sim.contest!.sanctuaries[1]!;
    post(scout, shrine.x + 3, shrine.z, 1, 0);
    run(sim, 300);
    const reached = shrine.corruption;
    post(scout, 80, -60, 1, 0);
    run(sim, 100);
    expect(shrine.corruption).toBeLessThan(reached);
    expect(shrine.corrupted).toBe(false);
    expect(view(sim, LIGHT).sanctuaries![1]!.threatened).toBe(false);
  });
});

describe('Orchard contest: bots and determinism', () => {
  it('a bot-filled contest with combat is reproducible from its seed, and bots use both revival routes', () => {
    const play = () => {
      const match = new Match({ seed: 11, mapId: ORCHARD_VALE.id, operation: true, botSlots: [1, 2, 3, 5, 6, 7] });
      match.join('dark-human', 'dark');
      match.join('light-human', 'light');
      let deaths = 0;
      let rituals = 0;
      let rescues = 0;
      const dead = new Set<number>();
      for (let t = 0; t < 30 * 200 && !match.finished; t++) {
        match.advance();
        const sim = match.inspect();
        for (const a of sim.actors) {
          if (a.team !== 'light' || a.kind !== 'hero') continue;
          if (a.dead && !dead.has(a.id)) { dead.add(a.id); deaths++; }
          if (!a.dead && dead.has(a.id)) dead.delete(a.id);
        }
        rituals = Math.max(rituals, sim.contest!.rituals.length);
        rescues = Math.max(rescues, sim.contest!.rescues.length);
      }
      return { hash: hashState(match.inspect() as SimState), deaths, rituals, rescues };
    };
    const a = play();
    const b = play();
    expect(a.hash).toBe(b.hash);
    expect(a.deaths).toBeGreaterThan(0);
    expect(a.rituals + a.rescues).toBeGreaterThan(0);
  });
});
