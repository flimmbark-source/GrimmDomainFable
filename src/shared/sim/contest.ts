/**
 * Orchard Vale contest rules beyond the relay: equipment-driven hero attacks,
 * damage, carried items, and the Light body-and-ghost recovery loop.
 *
 * EVERY NUMBER AND SAMPLE PLACEMENT HERE IS A PLAYTEST PROPOSAL. The confirmed
 * structure is D-032 to D-041 (body + ghost, rescue at the body by a living
 * Light Hero, a ghost's ritual at an uncorrupted sanctuary that is longer for
 * the recently dead and is ended only by full corruption) and D-043 to D-045
 * (Light equipment). Damage tuning, what a Dark Hero's death means, loot
 * ownership and the real two-stage sanctuary siege (D-026) are open: see
 * docs/decisions.md P-20 onwards.
 *
 * Deterministic: + - * / sqrt only, no randomness of its own.
 */
import type { Command } from '../protocol.ts';
import { distance, segmentWalkable, sightBlocked } from './geometry.ts';
import { ITEMS, QUICK_SLOTS, evadeBonusTicks, gearStats, salveHeal, type ItemId } from './items.ts';
import type { MapDef } from './map.ts';
import { addEvidence, startInvestigate, startReturn } from './monster.ts';
import { EVADE_TICKS, clampToMap, stopActor } from './movement.ts';
import { nearestWalkable } from './nav.ts';
import { memoryOf } from './perception.ts';
import type { ActorState, ContestState, SanctuaryState, SimState } from './state.ts';
import { TUNING } from './tuning.ts';

export const CONTEST = {
  heroHp: 150,
  /** Walk this close to a find to collect it. */
  pickupRadius: 1.4,
  evadeCooldownTicks: 30,
  itemCooldownTicks: 20,
  /** A swing or shot is audible this far. */
  attackNoiseRadius: 6,
  /** Smoke pot: monsters this close lose the hero, who then cannot be seen for a while. */
  smokeRadius: 12,
  smokeTicks: 90,
  /** Throwing stone: lands this far ahead and is heard this far from there. */
  lureDistance: 9,
  lureNoiseRadius: 12,
  /** Quickening draught. */
  hasteFactor: 1.35,
  hasteTicks: 180,

  /** Body rescue (D-034): stand this close, hold still this long. */
  rescueRange: 2.2,
  rescueTicks: 120,
  rescueHpFraction: 0.5,

  ghostSpeed: 5,
  /** A ghost performs its ritual inside this circle. */
  sanctuaryRadius: 3.5,
  /** Dark forces inside this circle corrupt the sanctuary. */
  siegeRadius: 7,
  /** D-026 stage one: ward strength, in rate-ticks of Dark presence. */
  wardTicks: 750,
  /** D-026 stage two: corruption needed for a full takeover once the wards are breached. */
  corruptTicks: 900,
  /** Mending: one lavender, held still this long, restores this share of the wards (D-028). */
  mendTicks: 90,
  mendFraction: 0.35,
  /** Purifying a corrupted wayshrine (D-022): held still this long with no Dark force present. */
  purifyTicks: 240,
  purifiedWardFraction: 0.5,
  /** true: a find is taken by the first human Light Hero to reach it. false: every Light Hero has a share. */
  sharedFinds: false,
  monsterCorruptRate: 1,
  /** D-024: a Dark Hero in person makes the takeover more effective. */
  heroCorruptRate: 1.5,
  /** D-027: progress decays while no Dark force is present. */
  decayRate: 0.5,
  /** D-040: 20 s for the newly dead, one second shorter per five seconds dead, never under 6 s. */
  ritualMaxTicks: 600,
  ritualMinTicks: 180,
  ritualShrinkPerDeadTick: 0.2,

  /** Placeholder only: a fallen Dark Hero returns at the castle road after this long. */
  darkReturnTicks: 360,
  /** Placeholder only: a slain monster is routed and walks back in from the castle road. */
  monsterReturnTicks: 600,

  sanctuaries: [
    { id: 0, name: 'West road wayshrine', x: -60, z: 22 },
    { id: 1, name: 'North orchard wayshrine', x: -24, z: -32 },
  ],
  /** Finds on the Light approach. Each Light Hero collects their own share once. */
  pickups: [
    // The west road: the Light approach.
    { id: 0, item: 'sling', count: 1, x: -78, z: 12 },
    { id: 1, item: 'salve', count: 2, x: -66, z: 12.5 },
    { id: 2, item: 'herb', count: 3, x: -64, z: -2 },
    { id: 3, item: 'springheel_boots', count: 1, x: -48, z: 12 },
    { id: 4, item: 'spiral_charm', count: 1, x: -30, z: 12 },
    { id: 5, item: 'herb', count: 2, x: -12, z: -30 },
    { id: 6, item: 'apple', count: 2, x: -82, z: 13 },
    { id: 7, item: 'stone', count: 3, x: -72, z: 11.5 },
    { id: 8, item: 'softsole_boots', count: 1, x: -58, z: 12.5 },
    // The ford lane and the north bank.
    { id: 9, item: 'twin_knives', count: 1, x: -70, z: -6 },
    { id: 10, item: 'smoke', count: 2, x: -66, z: -22 },
    { id: 11, item: 'dusk_charm', count: 1, x: -52, z: -30 },
    // The village and the terraces.
    { id: 12, item: 'billhook', count: 1, x: 2, z: 4 },
    { id: 13, item: 'cheese', count: 2, x: 6, z: 12 },
    { id: 14, item: 'coin', count: 5, x: 30, z: 14 },
    { id: 15, item: 'ironbark_charm', count: 1, x: 3, z: 37.5 },
    { id: 16, item: 'hatchet', count: 1, x: -40, z: 30 },
    { id: 17, item: 'tonic', count: 2, x: 40, z: 36 },
    // The mill and the east road.
    { id: 18, item: 'catspaw_boots', count: 1, x: 50, z: 12 },
    { id: 19, item: 'hand_crossbow', count: 1, x: 69, z: 13.2 },
    // The old road, the ruin and the castle road.
    { id: 20, item: 'thorn_charm', count: 1, x: -43.6, z: -54.6 },
    { id: 21, item: 'scroll', count: 1, x: -30, z: -50 },
    { id: 22, item: 'cudgel', count: 1, x: -10, z: -45 },
    { id: 23, item: 'lockpicks', count: 1, x: 10, z: -34 },
    { id: 24, item: 'whetstone_charm', count: 1, x: 20, z: -20 },
    { id: 25, item: 'courier_boots', count: 1, x: 30, z: -30 },
    { id: 26, item: 'tumbler_boots', count: 1, x: 60, z: -40 },
  ] as { id: number; item: ItemId; count: number; x: number; z: number }[],
};

export function createContest(): ContestState {
  return {
    pickups: CONTEST.pickups.map((p) => ({ ...p, takenBy: [] })),
    sanctuaries: CONTEST.sanctuaries.map((s) => ({ ...s, ward: CONTEST.wardTicks, corruption: 0, corrupted: false, threatened: false })),
    rescues: [],
    rituals: [],
    works: [],
  };
}

/** Every playable hero starts with a basic weapon equipped. */
export function outfitHero(hero: ActorState): void {
  hero.hp = hero.maxHp = CONTEST.heroHp;
  if (hero.team === 'light') {
    hero.inventory = { dagger: 1, salve: 1 };
    hero.equipment = { weapon: 'dagger', boots: null, charm: null };
    hero.quick = ['salve', null, null];
  } else {
    hero.inventory = { cleaver: 1, javelin: 1 };
    hero.equipment = { weapon: 'cleaver', boots: null, charm: null };
  }
}

const alive = (actor: ActorState): boolean => !actor.dead && actor.hp > 0;

/** Running or sneaking speed for the hero's boots and any draught in effect. */
export function heroSpeed(hero: ActorState, tick: number): number {
  const gear = gearStats(hero.equipment);
  const gait = hero.sneaking ? gear.sneakFactor ?? TUNING.hero.sneakSpeedFactor : 1;
  return TUNING.hero.speed * gear.speedFactor * gait * (tick < hero.hasteUntilTick ? CONTEST.hasteFactor : 1);
}

export function noiseFactorOf(hero: ActorState): number {
  return gearStats(hero.equipment).noiseFactor;
}

/** Re-derive what depends on worn gear. Called whenever gear or a timed effect changes. */
function refresh(state: SimState, hero: ActorState): void {
  if (hero.kind !== 'hero' || hero.dead) return;
  hero.maxHp = CONTEST.heroHp + gearStats(hero.equipment).maxHpBonus;
  if (hero.hp > hero.maxHp) hero.hp = hero.maxHp;
  hero.speed = heroSpeed(hero, state.tick);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function give(hero: ActorState, item: ItemId, count: number): void {
  hero.inventory[item] = (hero.inventory[item] ?? 0) + count;
  // A new usable item goes to the first free quick slot.
  if (ITEMS[item].kind === 'active' && !hero.quick.includes(item)) {
    const free = hero.quick.indexOf(null);
    if (free !== -1) hero.quick[free] = item;
  }
}

function take(hero: ActorState, item: ItemId): void {
  const left = (hero.inventory[item] ?? 0) - 1;
  if (left > 0) {
    hero.inventory[item] = left;
    return;
  }
  delete hero.inventory[item];
  hero.quick = hero.quick.map((q) => (q === item ? null : q));
  const slot = ITEMS[item].slot;
  if (slot && hero.equipment[slot] === item) hero.equipment[slot] = null;
}

type ItemCommand = Extract<Command, { type: 'equip' | 'unequip' | 'assignQuick' | 'useQuick' | 'dropItem' }>;

/** Inventory and equipment changes. The hero must be alive; every rule is checked here. */
export function applyItemCommand(state: SimState, map: MapDef, hero: ActorState, command: ItemCommand): void {
  if (!state.contest || hero.kind !== 'hero' || !alive(hero)) return;
  switch (command.type) {
    case 'equip': {
      const def = ITEMS[command.item];
      if (def.kind !== 'gear' || !def.slot || !hero.inventory[command.item]) return;
      hero.equipment[def.slot] = command.item;
      refresh(state, hero);
      return;
    }
    case 'unequip':
      hero.equipment[command.slot] = null;
      refresh(state, hero);
      return;
    case 'assignQuick': {
      if (command.slot >= QUICK_SLOTS) return;
      const item = command.item;
      if (item === null) {
        hero.quick[command.slot] = null;
        return;
      }
      if (ITEMS[item].kind !== 'active' || !hero.inventory[item]) return;
      hero.quick = hero.quick.map((q) => (q === item ? null : q));
      hero.quick[command.slot] = item;
      return;
    }
    case 'useQuick': {
      const item = hero.quick[command.slot];
      if (!item || !hero.inventory[item] || state.tick < hero.itemReadyTick) return;
      const def = ITEMS[item];
      // Only a use that does something consumes the item.
      if (def.heal) {
        if (hero.hp >= hero.maxHp) return;
        const amount = item === 'salve' ? salveHeal(hero.equipment) : def.heal;
        hero.hp = Math.min(hero.maxHp, hero.hp + amount);
        state.events.push({ kind: 'heal', x: hero.x, z: hero.z, radius: 4, actorId: hero.id });
      } else if (def.use === 'smoke') {
        hero.hiddenUntilTick = state.tick + CONTEST.smokeTicks;
        // Monsters nearby lose the hero. A chaser is left with only where it last saw them.
        for (const monster of state.actors) {
          if (!monster.brain || distance(monster.x, monster.z, hero.x, hero.z) > CONTEST.smokeRadius) continue;
          monster.brain.targets = monster.brain.targets.filter((t) => t.actorId !== hero.id);
        }
        state.events.push({ kind: 'smoke', x: hero.x, z: hero.z, radius: 14, actorId: hero.id });
      } else if (def.use === 'lure') {
        const at = clampToMap(map, hero.x + hero.dirX * CONTEST.lureDistance, hero.z + hero.dirZ * CONTEST.lureDistance, 0.3);
        state.noises.push({ x: at.x, z: at.z, radius: CONTEST.lureNoiseRadius, team: hero.team });
        state.events.push({ kind: 'cache', x: at.x, z: at.z, radius: CONTEST.lureNoiseRadius, actorId: hero.id });
      } else if (def.use === 'haste') {
        hero.hasteUntilTick = state.tick + CONTEST.hasteTicks;
        refresh(state, hero);
      } else return;
      hero.itemReadyTick = state.tick + CONTEST.itemCooldownTicks;
      take(hero, item);
      return;
    }
    case 'dropItem': {
      const def = ITEMS[command.item];
      if (!hero.inventory[command.item]) return;
      // Worn gear must be taken off before the last one can be dropped.
      if (def.slot && hero.equipment[def.slot] === command.item && hero.inventory[command.item] === 1) return;
      take(hero, command.item);
      refresh(state, hero);
      return;
    }
  }
}

function collectPickups(state: SimState, contest: ContestState): void {
  for (const hero of state.actors) {
    if (hero.kind !== 'hero' || hero.team !== 'light' || hero.slot === null || !alive(hero)) continue;
    for (const pickup of contest.pickups) {
      if (pickup.takenBy.includes(hero.slot) || (CONTEST.sharedFinds && (pickup.takenBy.length > 0 || state.slots[hero.slot]?.occupant !== 'human'))) continue;
      if (distance(hero.x, hero.z, pickup.x, pickup.z) > CONTEST.pickupRadius) continue;
      pickup.takenBy.push(hero.slot);
      give(hero, pickup.item, pickup.count);
      state.events.push({ kind: 'pickup', x: hero.x, z: hero.z, radius: 3, actorId: hero.id });
    }
  }
}

// ---------------------------------------------------------------------------
// Attacks and damage
// ---------------------------------------------------------------------------

/** Ticks of Evade travel for this hero's current boots. */
export function evadeTicksOf(hero: ActorState): number {
  return EVADE_TICKS + evadeBonusTicks(hero.equipment);
}

/**
 * Attack with the equipped weapon from where the hero stands. Returns false
 * when nothing happened (no weapon, dead, or still recovering from a swing).
 */
export function heroAttack(state: SimState, map: MapDef, hero: ActorState, aim?: { x: number; z: number }): boolean {
  const gear = gearStats(hero.equipment);
  const weapon = gear.weapon;
  if (!state.contest || !weapon || !alive(hero) || state.tick < hero.attackReadyTick) return false;
  const inReach = (target: ActorState, d: number) => d <= weapon.range + target.radius && !sightBlocked(map, hero.x, hero.z, target.x, target.z);
  const enemies = state.actors.filter((a) => a.team !== hero.team && alive(a));

  // Turn to an enemy the hero can reach and see: the one nearest the point
  // the player clicked, else the one nearest the hero. With nobody in reach
  // an aimed attack still faces the clicked point.
  const from = aim ?? hero;
  let nearest: ActorState | undefined;
  let nearestScore = Infinity;
  for (const target of enemies) {
    const d = distance(hero.x, hero.z, target.x, target.z);
    const score = distance(from.x, from.z, target.x, target.z);
    if (score < nearestScore && d > 1e-6 && inReach(target, d)) {
      nearest = target;
      nearestScore = score;
    }
  }
  const face = nearest ?? aim;
  const faceD = face ? distance(hero.x, hero.z, face.x, face.z) : 0;
  if (face && faceD > 1e-6) {
    hero.dirX = (face.x - hero.x) / faceD;
    hero.dirZ = (face.z - hero.z) / faceD;
  }

  const hits: ActorState[] = [];
  let firstAlong = Infinity;
  for (const target of enemies) {
    const dx = target.x - hero.x;
    const dz = target.z - hero.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (!inReach(target, d)) continue;
    const along = hero.dirX * dx + hero.dirZ * dz;
    if (weapon.pattern === 'arc') {
      if (d > 1e-6 && along < weapon.halfArcCos * d) continue;
      hits.push(target);
    } else {
      const across = hero.dirX * dz - hero.dirZ * dx;
      if (along < 0 || (across < 0 ? -across : across) > weapon.halfWidth + target.radius || along >= firstAlong) continue;
      firstAlong = along;
      hits[0] = target;
    }
  }

  hero.attackReadyTick = state.tick + weapon.cooldownTicks;
  hero.actionMotion = { kind: 'attack', tick: state.tick, weapon: hero.equipment.weapon! };
  const radius = CONTEST.attackNoiseRadius * hero.stealth.noise * gear.noiseFactor;
  state.noises.push({ x: hero.x, z: hero.z, radius, team: hero.team });
  for (const target of hits) {
    damage(state, target, Math.round(weapon.damage * gear.damageFactor), hero);
    // A heavy blow shoves a survivor back, as far as the ground allows.
    if (weapon.knockback && alive(target)) {
      const to = clampToMap(map, target.x + hero.dirX * weapon.knockback, target.z + hero.dirZ * weapon.knockback, target.radius);
      if (segmentWalkable(map, target.x, target.z, to.x, to.z, target.radius)) {
        target.x = to.x;
        target.z = to.z;
        if (target.kind === 'hero') stopActor(target);
      }
    }
  }
  return true;
}

export function damage(state: SimState, target: ActorState, amount: number, source: ActorState, reflected = false): void {
  if (!state.contest || !alive(target)) return;
  // Thorns: a close attacker is hurt in return (never a reflection of a reflection).
  const thorns = reflected || target.kind !== 'hero' ? 0 : gearStats(target.equipment).thorns;
  if (thorns && distance(source.x, source.z, target.x, target.z) <= 3.2) damage(state, source, thorns, target, true);
  target.hp -= amount;
  target.lastHitTick = state.tick;
  state.events.push({ kind: 'hit', x: target.x, z: target.z, radius: 12, actorId: target.id });
  const operation = state.operation;
  if (operation && operation.worker === target.id) {
    operation.worker = null;
    operation.progress = 0;
    operation.interrupted = target.id;
  }
  if (target.hp > 0) {
    // A monster struck by something it was not chasing turns to look for it.
    const brain = target.brain;
    if (brain && brain.mode !== 'chase' && !(brain.mode === 'investigate' && brain.investigate?.kind !== 'noise')) {
      const record = addEvidence(state, { kind: 'noise', x: source.x, z: source.z, source: target.id, ownerSlot: brain.ownerSlot, shared: false, subject: null });
      startInvestigate(target, brain, 'noise', source.x, source.z, record.id);
    }
    return;
  }
  target.hp = 0;
  // Something falls. Light Hero: the body stays here and the player becomes
  // a ghost. Dark Hero or monster: out of the fight until it returns.
  stopActor(target);
  if (target.brain) {
    target.brain.targets = [];
    target.brain.investigate = null;
    target.brain.search = null;
    target.brain.chaseId = null;
    target.dead = { tick: state.tick, x: target.x, z: target.z, returnTick: state.tick + CONTEST.monsterReturnTicks };
    return;
  }
  delete target.queuedAction;
  target.moving = false;
  target.sneaking = false;
  target.dead = { tick: state.tick, x: target.x, z: target.z };
  if (target.team === 'light') target.speed = CONTEST.ghostSpeed;
  else target.dead.returnTick = state.tick + CONTEST.darkReturnTicks;
  state.contest.rescues = state.contest.rescues.filter((r) => r.rescuerId !== target.id);
}

/** A monster that has run its confirmed target down bites it. */
function monsterAttacks(state: SimState): void {
  for (const monster of [...state.actors]) {
    const brain = monster.brain;
    if (!brain || brain.mode !== 'chase' || monster.hp <= 0 || state.tick < monster.attackReadyTick) continue;
    const memory = brain.chaseId === null ? undefined : memoryOf(brain, brain.chaseId);
    if (!memory?.visible) continue;
    const target = state.actors.find((a) => a.id === brain.chaseId);
    if (!target || !alive(target)) continue;
    if (distance(monster.x, monster.z, target.x, target.z) > TUNING.behaviour.catchDistance + 0.2) continue;
    const profile = TUNING.monsters[brain.type];
    monster.attackReadyTick = state.tick + profile.attackCooldownTicks;
    monster.actionMotion = { kind: 'attack', tick: state.tick };
    damage(state, target, profile.attackDamage, monster);
  }
}

// ---------------------------------------------------------------------------
// Death and recovery
// ---------------------------------------------------------------------------

function restore(state: SimState, hero: ActorState, x: number, z: number, hp: number): void {
  const contest = state.contest!;
  hero.x = x;
  hero.z = z;
  hero.hp = hp;
  delete hero.dead;
  delete hero.ritualLostTick;
  stopActor(hero);
  hero.sneaking = false;
  hero.hasteUntilTick = 0;
  hero.hiddenUntilTick = 0;
  if (hero.kind === 'hero') hero.speed = heroSpeed(hero, state.tick);
  contest.rescues = contest.rescues.filter((r) => r.heroId !== hero.id);
  contest.rituals = contest.rituals.filter((r) => r.heroId !== hero.id);
  state.events.push({ kind: 'revive', x, z, radius: 12, actorId: hero.id });
}

/** D-040: longer for the recently dead, shorter the longer the hero has been dead. */
export function ritualTicks(deadTicks: number): number {
  const ticks = CONTEST.ritualMaxTicks - deadTicks * CONTEST.ritualShrinkPerDeadTick;
  return ticks < CONTEST.ritualMinTicks ? CONTEST.ritualMinTicks : ticks;
}

/** The uncorrupted sanctuary whose circle this ghost stands in, if any (D-039). */
export function sanctuaryFor(contest: ContestState, ghost: ActorState): SanctuaryState | undefined {
  return contest.sanctuaries.find((s) => !s.corrupted && distance(ghost.x, ghost.z, s.x, s.z) <= CONTEST.sanctuaryRadius);
}

/** The fallen Light Hero whose body this living Light Hero could revive right now (D-034). */
export function rescuableBody(state: SimState, map: MapDef, rescuer: ActorState): ActorState | undefined {
  const contest = state.contest;
  if (!contest || rescuer.kind !== 'hero' || rescuer.team !== 'light' || !alive(rescuer)) return undefined;
  let best: ActorState | undefined;
  let bestD = CONTEST.rescueRange;
  for (const fallen of state.actors) {
    const body = fallen.dead;
    if (!body || fallen.team !== 'light' || fallen.id === rescuer.id) continue;
    if (contest.rescues.some((r) => r.heroId === fallen.id && r.rescuerId !== rescuer.id)) continue;
    const d = distance(rescuer.x, rescuer.z, body.x, body.z);
    if (d > bestD || sightBlocked(map, rescuer.x, rescuer.z, body.x, body.z)) continue;
    best = fallen;
    bestD = d;
  }
  return best;
}

/**
 * The `revive` command. A living Light Hero beside a body starts a rescue; a
 * ghost inside an eligible sanctuary starts its ritual. A ghost can never
 * start anything at its own body.
 */
export function startRevive(state: SimState, map: MapDef, actor: ActorState): void {
  const contest = state.contest;
  if (!contest || actor.kind !== 'hero' || actor.team !== 'light') return;
  if (actor.dead) {
    const sanctuary = sanctuaryFor(contest, actor);
    if (!sanctuary || contest.rituals.some((r) => r.heroId === actor.id)) return;
    stopActor(actor);
    delete actor.ritualLostTick;
    contest.rituals.push({ heroId: actor.id, sanctuaryId: sanctuary.id, progress: 0, duration: ritualTicks(state.tick - actor.dead.tick) });
    return;
  }
  if (actor.intent.type !== 'idle' || contest.rescues.some((r) => r.rescuerId === actor.id)) return;
  if (contest.works.some((w) => w.heroId === actor.id)) return;
  const fallen = rescuableBody(state, map, actor);
  if (fallen) {
    contest.rescues.push({ rescuerId: actor.id, heroId: fallen.id, progress: 0, startTick: state.tick });
    return;
  }
  // No body to tend: mend or purify the wayshrine the hero stands in.
  const work = shrineWorkFor(state, actor);
  if (work) contest.works.push({ heroId: actor.id, sanctuaryId: work.sanctuary.id, kind: work.kind, progress: 0, startTick: state.tick });
}

/** Stop / X: abandon a rescue or a ritual in progress. */
export function cancelRevive(state: SimState, actor: ActorState): void {
  const contest = state.contest;
  if (!contest) return;
  contest.rescues = contest.rescues.filter((r) => r.rescuerId !== actor.id);
  contest.rituals = contest.rituals.filter((r) => r.heroId !== actor.id);
  contest.works = contest.works.filter((w) => w.heroId !== actor.id);
}

/**
 * D-026 two-stage siege. Dark forces in the precinct first wear down the
 * wards; only once they are breached does the corruption ritual advance.
 * D-024: a Dark Hero in person is more effective at both. D-027: ward damage
 * stays until Light mends it, while ritual progress decays when Dark leaves.
 */
function updateSanctuaries(state: SimState, contest: ContestState): void {
  for (const sanctuary of contest.sanctuaries) {
    let rate = 0;
    let heroes = false;
    let monsters = false;
    for (const actor of state.actors) {
      if (actor.team !== 'dark' || !alive(actor) || distance(actor.x, actor.z, sanctuary.x, sanctuary.z) > CONTEST.siegeRadius) continue;
      if (actor.kind === 'hero') heroes = true;
      else monsters = true;
    }
    if (heroes) rate += CONTEST.heroCorruptRate;
    if (monsters) rate += CONTEST.monsterCorruptRate;
    sanctuary.threatened = rate > 0 && !sanctuary.corrupted;
    if (sanctuary.corrupted) continue;
    if (rate > 0 && sanctuary.ward > 0) sanctuary.ward = Math.max(0, sanctuary.ward - rate);
    else if (rate > 0) sanctuary.corruption += rate;
    else sanctuary.corruption = Math.max(0, sanctuary.corruption - CONTEST.decayRate);
    if (sanctuary.corruption < CONTEST.corruptTicks) continue;
    // D-041: full corruption, and only full corruption, ends a ritual here.
    sanctuary.corruption = CONTEST.corruptTicks;
    sanctuary.corrupted = true;
    for (const ritual of contest.rituals) {
      if (ritual.sanctuaryId !== sanctuary.id) continue;
      const ghost = state.actors.find((a) => a.id === ritual.heroId);
      if (ghost) ghost.ritualLostTick = state.tick;
    }
    contest.rituals = contest.rituals.filter((r) => r.sanctuaryId !== sanctuary.id);
    contest.works = contest.works.filter((w) => w.sanctuaryId !== sanctuary.id);
  }
}

/** What a living Light Hero standing in a wayshrine's circle could do for it right now. */
export function shrineWorkFor(state: SimState, hero: ActorState): { sanctuary: SanctuaryState; kind: 'mend' | 'purify' } | undefined {
  const contest = state.contest;
  if (!contest || hero.kind !== 'hero' || hero.team !== 'light' || !alive(hero)) return undefined;
  const sanctuary = contest.sanctuaries.find((s) => distance(hero.x, hero.z, s.x, s.z) <= CONTEST.sanctuaryRadius);
  if (!sanctuary || contest.works.some((w) => w.sanctuaryId === sanctuary.id && w.heroId !== hero.id)) return undefined;
  if (sanctuary.corrupted) return { sanctuary, kind: 'purify' };
  if (sanctuary.ward < CONTEST.wardTicks && hero.inventory.herb) return { sanctuary, kind: 'mend' };
  return undefined;
}

function updateShrineWork(state: SimState, contest: ContestState): void {
  for (const work of [...contest.works]) {
    const hero = state.actors.find((a) => a.id === work.heroId);
    const sanctuary = contest.sanctuaries.find((s) => s.id === work.sanctuaryId);
    const possible = hero && shrineWorkFor(state, hero);
    // Moving off, being hit, or the work no longer applying ends the attempt.
    if (!hero || !sanctuary || possible?.kind !== work.kind || hero.intent.type !== 'idle' || hero.lastHitTick >= work.startTick) {
      contest.works = contest.works.filter((w) => w !== work);
      continue;
    }
    // A wayshrine cannot be cleansed while Dark forces still hold it.
    if (work.kind === 'purify' && state.actors.some((a) => a.team === 'dark' && alive(a) && distance(a.x, a.z, sanctuary.x, sanctuary.z) <= CONTEST.siegeRadius)) continue;
    if (++work.progress < (work.kind === 'purify' ? CONTEST.purifyTicks : CONTEST.mendTicks)) continue;
    if (work.kind === 'purify') {
      sanctuary.corrupted = false;
      sanctuary.corruption = 0;
      sanctuary.ward = CONTEST.wardTicks * CONTEST.purifiedWardFraction;
    } else {
      take(hero, 'herb');
      sanctuary.ward = Math.min(CONTEST.wardTicks, sanctuary.ward + CONTEST.wardTicks * CONTEST.mendFraction);
    }
    state.events.push({ kind: 'revive', x: sanctuary.x, z: sanctuary.z, radius: 12, actorId: hero.id });
    contest.works = contest.works.filter((w) => w !== work);
  }
}

function updateRecovery(state: SimState, map: MapDef, contest: ContestState): void {
  for (const rescue of [...contest.rescues]) {
    const rescuer = state.actors.find((a) => a.id === rescue.rescuerId);
    const fallen = state.actors.find((a) => a.id === rescue.heroId);
    const body = fallen?.dead;
    const holds = rescuer && body && alive(rescuer) && rescuer.intent.type === 'idle' && rescuer.lastHitTick < rescue.startTick &&
      distance(rescuer.x, rescuer.z, body.x, body.z) <= CONTEST.rescueRange;
    if (!holds) {
      contest.rescues = contest.rescues.filter((r) => r !== rescue);
      continue;
    }
    if (++rescue.progress >= CONTEST.rescueTicks) restore(state, fallen, body.x, body.z, fallen.maxHp * CONTEST.rescueHpFraction);
  }
  for (const ritual of [...contest.rituals]) {
    const ghost = state.actors.find((a) => a.id === ritual.heroId);
    const sanctuary = contest.sanctuaries.find((s) => s.id === ritual.sanctuaryId);
    // Combat nearby never interrupts (D-041). Leaving the circle abandons it.
    if (!ghost?.dead || !sanctuary || sanctuary.corrupted || distance(ghost.x, ghost.z, sanctuary.x, sanctuary.z) > CONTEST.sanctuaryRadius) {
      contest.rituals = contest.rituals.filter((r) => r !== ritual);
      continue;
    }
    if (++ritual.progress >= ritual.duration) restore(state, ghost, ghost.x, ghost.z, ghost.maxHp);
  }
  // Placeholder: a fallen Dark Hero or routed monster comes back at the
  // castle road; a monster then walks back to its standing assignment.
  for (const actor of state.actors) {
    const returnTick = actor.dead?.returnTick;
    if (returnTick === undefined || state.tick < returnTick) continue;
    const spawn = map.spawns[actor.slot ?? actor.brain?.ownerSlot ?? 0]!;
    const at = nearestWalkable(map, actor.radius, spawn.x, spawn.z) ?? spawn;
    restore(state, actor, at.x, at.z, actor.maxHp);
    if (actor.brain) startReturn(actor, actor.brain, map);
  }
}

/** Run once per tick, after movement. */
export function updateContest(state: SimState, map: MapDef): void {
  const contest = state.contest;
  if (!contest) return;
  collectPickups(state, contest);
  monsterAttacks(state);
  updateSanctuaries(state, contest);
  updateShrineWork(state, contest);
  updateRecovery(state, map, contest);
  // A draught wearing off changes speed without any command.
  for (const hero of state.actors) if (hero.hasteUntilTick === state.tick) refresh(state, hero);
}
