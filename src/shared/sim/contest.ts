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
import { FINDS } from './finds.ts';
import { ITEMS, QUICK_SLOTS, gearStats, salveHeal, type ItemId, type WeaponDef } from './items.ts';
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
  /** Where every find lies (see finds.ts). */
  pickups: FINDS,
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

/** Running or sneaking speed for the hero's boots, health and any draught in effect. */
export function heroSpeed(hero: ActorState, tick: number): number {
  const gear = gearStats(hero.equipment);
  const gait = hero.sneaking ? gear.sneakFactor || TUNING.hero.sneakSpeedFactor : 1;
  const hurt = hero.hp < hero.maxHp * 0.4 ? gear.lowHpSpeed : 1;
  return TUNING.hero.speed * gear.speed * gait * hurt * (tick < hero.hasteUntilTick ? CONTEST.hasteFactor : 1);
}

export function noiseFactorOf(hero: ActorState): number {
  return gearStats(hero.equipment).noise;
}

/** Re-derive what depends on worn gear. Called whenever gear or a timed effect changes. */
function refresh(state: SimState, hero: ActorState): void {
  if (hero.kind !== 'hero' || hero.dead) return;
  hero.maxHp = CONTEST.heroHp + gearStats(hero.equipment).maxHp;
  if (hero.hp > hero.maxHp) hero.hp = hero.maxHp;
  hero.speed = heroSpeed(hero, state.tick);
}

// ---------------------------------------------------------------------------
// Afflictions
// ---------------------------------------------------------------------------

type Affliction = Pick<WeaponDef, 'bleed' | 'slowTicks' | 'stunTicks'>;

/** Apply bleed, slow or stun, unless the target's gear or an antidote forbids it. */
function afflict(state: SimState, target: ActorState, effect: Affliction, source: ActorState): void {
  if (!alive(target) || state.tick < target.immuneUntilTick) return;
  const gear = gearStats(target.equipment);
  if (effect.bleed && !gear.bleedImmune) {
    target.bleedTicks = effect.bleed.ticks;
    target.bleedPerTick = effect.bleed.dps / 30;
    target.bleedSource = source.id;
  }
  if (effect.slowTicks && !gear.slowImmune && state.tick + effect.slowTicks > target.slowUntilTick) target.slowUntilTick = state.tick + effect.slowTicks;
  if (effect.stunTicks && !gear.stunImmune && state.tick + effect.stunTicks > target.stunUntilTick) {
    target.stunUntilTick = state.tick + effect.stunTicks;
    if (target.kind === 'hero') stopActor(target);
  }
}

/** Shove a target along a direction, as far as the ground allows. Negative metres pull. */
function shove(map: MapDef, target: ActorState, dirX: number, dirZ: number, metres: number): void {
  if (!alive(target) || metres === 0 || gearStats(target.equipment).knockbackImmune) return;
  const to = clampToMap(map, target.x + dirX * metres, target.z + dirZ * metres, target.radius);
  if (!segmentWalkable(map, target.x, target.z, to.x, to.z, target.radius)) return;
  target.x = to.x;
  target.z = to.z;
  if (target.kind === 'hero') stopActor(target);
}

function heal(state: SimState, hero: ActorState, amount: number): void {
  if (amount <= 0 || !alive(hero) || hero.hp >= hero.maxHp) return;
  hero.hp = Math.min(hero.maxHp, hero.hp + amount);
  state.events.push({ kind: 'heal', x: hero.x, z: hero.z, radius: 4, actorId: hero.id });
}

function updateAfflictions(state: SimState): void {
  for (const actor of state.actors) {
    if (!alive(actor)) continue;
    if (actor.bleedTicks > 0) {
      actor.bleedTicks--;
      actor.hp -= actor.bleedPerTick;
      if (actor.hp <= 0) fall(state, actor, state.actors.find((a) => a.id === actor.bleedSource));
      continue;
    }
    if (actor.kind !== 'hero') continue;
    const regen = gearStats(actor.equipment).regen / 30 + (actor.regenTicks > 0 ? actor.regenPerTick : 0);
    if (actor.regenTicks > 0) actor.regenTicks--;
    if (regen > 0 && actor.hp < actor.maxHp) actor.hp = Math.min(actor.maxHp, actor.hp + regen);
    // Speed follows health and timed effects without waiting for a command.
    actor.speed = heroSpeed(actor, state.tick);
  }
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

/** Use an active item. Returns false when the use would do nothing, so the item is kept. */
function useItem(state: SimState, map: MapDef, hero: ActorState, item: ItemId): boolean {
  const use = ITEMS[item].use;
  if (!use) return false;
  const gear = gearStats(hero.equipment);
  const foes = state.actors.filter((a) => a.team !== hero.team && alive(a));
  const near = (x: number, z: number, radius: number) => foes.filter((a) => distance(a.x, a.z, x, z) <= radius + a.radius);
  const ahead = (metres: number) => clampToMap(map, hero.x + hero.dirX * metres, hero.z + hero.dirZ * metres, 0.3);
  switch (use.kind) {
    case 'heal':
      if (hero.hp >= hero.maxHp) return false;
      heal(state, hero, use.salve ? salveHeal(hero.equipment) : Math.round(use.amount * gear.food));
      if (use.selfSlowTicks) hero.slowUntilTick = state.tick + use.selfSlowTicks;
      return true;
    case 'regen':
      if (hero.hp >= hero.maxHp) return false;
      hero.regenTicks = use.ticks;
      hero.regenPerTick = use.perSecond / 30;
      return true;
    case 'smoke':
      hero.hiddenUntilTick = state.tick + Math.round(use.ticks * gear.smokeDuration);
      // Monsters nearby lose the hero. A chaser is left with only where it last saw them.
      for (const monster of state.actors) {
        if (!monster.brain || distance(monster.x, monster.z, hero.x, hero.z) > use.radius) continue;
        monster.brain.targets = monster.brain.targets.filter((t) => t.actorId !== hero.id);
      }
      state.events.push({ kind: 'smoke', x: hero.x, z: hero.z, radius: 14, actorId: hero.id });
      return true;
    case 'veil':
      hero.hiddenUntilTick = state.tick + Math.round(use.ticks * gear.smokeDuration);
      return true;
    case 'lure': {
      const at = ahead(use.distance);
      const radius = use.radius * gear.lureNoise;
      state.noises.push({ x: at.x, z: at.z, radius, team: hero.team });
      state.events.push({ kind: 'cache', x: at.x, z: at.z, radius, actorId: hero.id });
      return true;
    }
    case 'haste':
      hero.hasteUntilTick = state.tick + Math.round(use.ticks * gear.hasteDuration);
      return true;
    case 'guard':
      hero.guardUntilTick = state.tick + Math.round(use.ticks * gear.hasteDuration);
      return true;
    case 'fury':
      hero.furyUntilTick = state.tick + Math.round(use.ticks * gear.hasteDuration);
      return true;
    case 'cleanse':
      hero.bleedTicks = 0;
      hero.slowUntilTick = 0;
      hero.stunUntilTick = 0;
      hero.immuneUntilTick = state.tick + use.immuneTicks;
      return true;
    case 'bomb': {
      const at = ahead(use.distance);
      state.noises.push({ x: at.x, z: at.z, radius: 14, team: hero.team });
      for (const target of near(at.x, at.z, use.radius)) if (!sightBlocked(map, at.x, at.z, target.x, target.z)) damage(state, target, use.damage, hero);
      return true;
    }
    case 'flash':
      for (const target of near(hero.x, hero.z, use.radius)) afflict(state, target, { stunTicks: use.stunTicks }, hero);
      state.events.push({ kind: 'smoke', x: hero.x, z: hero.z, radius: 14, actorId: hero.id });
      return true;
    case 'caltrops':
      for (const target of near(hero.x, hero.z, use.radius)) afflict(state, target, { slowTicks: use.slowTicks }, hero);
      return true;
    case 'knife': {
      const target = lineTargets(map, hero, foes, use.range, 0.3)[0];
      hero.actionMotion = { kind: 'attack', tick: state.tick };
      if (target) damage(state, target, use.damage, hero);
      return true;
    }
    case 'horn':
      for (const ally of state.actors) {
        if (ally.kind !== 'hero' || ally.team !== hero.team || !alive(ally) || distance(ally.x, ally.z, hero.x, hero.z) > use.radius) continue;
        ally.hasteUntilTick = state.tick + Math.round(use.ticks * gear.hasteDuration);
      }
      state.events.push({ kind: 'howl', x: hero.x, z: hero.z, radius: 20, actorId: hero.id });
      return true;
    case 'purge': {
      const shrine = state.contest!.sanctuaries.find((s) => !s.corrupted && s.corruption > 0 && distance(hero.x, hero.z, s.x, s.z) <= CONTEST.sanctuaryRadius);
      if (!shrine) return false;
      shrine.corruption = Math.max(0, shrine.corruption - use.fraction * CONTEST.corruptTicks);
      return true;
    }
  }
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
      if (!item || !hero.inventory[item] || state.tick < hero.itemReadyTick || state.tick < hero.stunUntilTick) return;
      // Only a use that does something consumes the item.
      if (!useItem(state, map, hero, item)) return;
      hero.itemReadyTick = state.tick + Math.round(CONTEST.itemCooldownTicks * gearStats(hero.equipment).itemCooldown);
      take(hero, item);
      refresh(state, hero);
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
    const radius = CONTEST.pickupRadius * gearStats(hero.equipment).pickupRadius;
    for (const pickup of contest.pickups) {
      if (pickup.takenBy.includes(hero.slot) || (CONTEST.sharedFinds && (pickup.takenBy.length > 0 || state.slots[hero.slot]?.occupant !== 'human'))) continue;
      if (distance(hero.x, hero.z, pickup.x, pickup.z) > radius) continue;
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
  return EVADE_TICKS + gearStats(hero.equipment).evadeTicks;
}

/** What boots add at the start of an Evade. */
export function onEvade(state: SimState, map: MapDef, hero: ActorState): void {
  if (!state.contest) return;
  const gear = gearStats(hero.equipment);
  if (gear.evadeSmokeTicks) hero.hiddenUntilTick = state.tick + Math.round(gear.evadeSmokeTicks * gear.smokeDuration);
  heal(state, hero, gear.evadeHeal);
  if (!gear.evadeDamage && !gear.evadeKnockback) return;
  for (const target of state.actors) {
    if (target.team === hero.team || !alive(target)) continue;
    const d = distance(hero.x, hero.z, target.x, target.z);
    if (d > 2.4 + target.radius || d < 1e-6) continue;
    if (gear.evadeDamage) damage(state, target, gear.evadeDamage, hero);
    shove(map, target, (target.x - hero.x) / d, (target.z - hero.z) / d, gear.evadeKnockback);
  }
}

/** Enemies on a straight line ahead of the hero, nearest first; cover stops the line. */
function lineTargets(map: MapDef, hero: ActorState, enemies: ActorState[], range: number, halfWidth: number): ActorState[] {
  const found: { target: ActorState; along: number }[] = [];
  for (const target of enemies) {
    const dx = target.x - hero.x;
    const dz = target.z - hero.z;
    const along = hero.dirX * dx + hero.dirZ * dz;
    const across = hero.dirX * dz - hero.dirZ * dx;
    if (along < 0 || along > range + target.radius || (across < 0 ? -across : across) > halfWidth + target.radius) continue;
    if (sightBlocked(map, hero.x, hero.z, target.x, target.z)) continue;
    found.push({ target, along });
  }
  return found.sort((a, b) => a.along - b.along || a.target.id - b.target.id).map((f) => f.target);
}

/**
 * Attack with the equipped weapon from where the hero stands. Returns false
 * when nothing happened (no weapon, dead, stunned, or still recovering).
 */
export function heroAttack(state: SimState, map: MapDef, hero: ActorState, aim?: { x: number; z: number }): boolean {
  const gear = gearStats(hero.equipment);
  const weapon = gear.weapon;
  if (!state.contest || !weapon || !alive(hero) || state.tick < hero.attackReadyTick || state.tick < hero.stunUntilTick) return false;
  const range = weapon.range + gear.range;
  const inReach = (target: ActorState, d: number) => d <= range + target.radius && !sightBlocked(map, hero.x, hero.z, target.x, target.z);
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

  let hits: ActorState[];
  if (weapon.pattern === 'arc') {
    hits = enemies.filter((target) => {
      const dx = target.x - hero.x;
      const dz = target.z - hero.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      return inReach(target, d) && !(d > 1e-6 && hero.dirX * dx + hero.dirZ * dz < weapon.halfArcCos * d);
    });
  } else {
    hits = lineTargets(map, hero, enemies, range, weapon.halfWidth);
    if (!weapon.pierce) hits = hits.slice(0, 1);
  }

  hero.attackReadyTick = state.tick + Math.round(weapon.cooldownTicks * gear.attackSpeed);
  hero.actionMotion = { kind: 'attack', tick: state.tick, weapon: hero.equipment.weapon! };
  hero.hiddenUntilTick = 0; // striking gives you away
  if (!weapon.silent) {
    const radius = CONTEST.attackNoiseRadius * hero.stealth.noise * gear.noise;
    state.noises.push({ x: hero.x, z: hero.z, radius, team: hero.team });
  }
  const always = gear.damage * (state.tick < hero.furyUntilTick ? 1.5 : 1) * (hero.hp < hero.maxHp * 0.3 ? gear.lastStand : 1);
  let dealt = 0;
  for (const target of hits) {
    let factor = always * (target.kind === 'monster' ? (weapon.vsMonsters ?? 1) * gear.vsMonsters : (weapon.vsHeroes ?? 1) * gear.vsHeroes);
    if (weapon.opener && target.hp >= target.maxHp) factor *= weapon.opener;
    if (weapon.execute && target.hp < target.maxHp * 0.35) factor *= weapon.execute;
    // From behind: the target is facing roughly the way the blow travels.
    if (weapon.backstab && target.dirX * hero.dirX + target.dirZ * hero.dirZ > 0.5) factor *= weapon.backstab;
    const before = target.hp;
    damage(state, target, Math.round(weapon.damage * factor), hero);
    dealt += before - (target.hp > 0 ? target.hp : 0);
    afflict(state, target, weapon, hero);
    let push = (weapon.knockback ?? 0) + gear.knockback;
    if (push < 0) {
      // A pull never drags the target through its puller.
      const gap = distance(hero.x, hero.z, target.x, target.z) - hero.radius - target.radius;
      push = gap > 0 ? -Math.min(-push, gap) : 0;
    }
    shove(map, target, hero.dirX, hero.dirZ, push);
  }
  heal(state, hero, dealt * ((weapon.lifesteal ?? 0) + gear.lifesteal));
  return true;
}

export function damage(state: SimState, target: ActorState, amount: number, source: ActorState, reflected = false): void {
  if (!state.contest || !alive(target)) return;
  const gear = gearStats(target.equipment);
  // Thorns: a close attacker is hurt in return (never a reflection of a reflection).
  const thorns = reflected || target.kind !== 'hero' ? 0 : gear.thorns;
  if (thorns && distance(source.x, source.z, target.x, target.z) <= 3.2) damage(state, source, thorns, target, true);
  const taken = gear.armor * (state.tick < target.guardUntilTick ? 0.5 : 1);
  target.hp -= taken === 1 ? amount : Math.round(amount * taken);
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
  fall(state, target, source);
}

/** Health has run out. A lucky coin turns it aside; otherwise the actor falls. */
function fall(state: SimState, target: ActorState, source: ActorState | undefined): void {
  if (target.kind === 'hero' && target.inventory.coin) {
    take(target, 'coin');
    target.hp = 1;
    target.bleedTicks = 0;
    return;
  }
  target.hp = 0;
  target.bleedTicks = 0;
  target.slowUntilTick = target.stunUntilTick = 0;
  if (source && source.kind === 'hero' && source.id !== target.id && alive(source)) {
    const gear = gearStats(source.equipment);
    heal(state, source, gear.killHeal);
    if (gear.killHasteTicks) source.hasteUntilTick = state.tick + gear.killHasteTicks;
  }
  // Light Hero: the body stays here and the player becomes a ghost.
  // Dark Hero or monster: out of the fight until it returns.
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
  state.contest!.rescues = state.contest!.rescues.filter((r) => r.rescuerId !== target.id);
}

/** A monster that has run its confirmed target down bites it. */
function monsterAttacks(state: SimState): void {
  for (const monster of [...state.actors]) {
    const brain = monster.brain;
    if (!brain || brain.mode !== 'chase' || !alive(monster) || state.tick < monster.attackReadyTick || state.tick < monster.stunUntilTick) continue;
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
  hero.hp = hp > hero.maxHp ? hero.maxHp : hp;
  delete hero.dead;
  delete hero.ritualLostTick;
  stopActor(hero);
  hero.sneaking = false;
  hero.hasteUntilTick = 0;
  hero.hiddenUntilTick = 0;
  hero.bleedTicks = hero.regenTicks = 0;
  hero.slowUntilTick = hero.stunUntilTick = hero.guardUntilTick = hero.furyUntilTick = 0;
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
    contest.rituals.push({ heroId: actor.id, sanctuaryId: sanctuary.id, progress: 0, duration: ritualTicks(state.tick - actor.dead.tick) * gearStats(actor.equipment).ritual });
    return;
  }
  if (actor.intent.type !== 'idle' || contest.rescues.some((r) => r.rescuerId === actor.id)) return;
  if (contest.works.some((w) => w.heroId === actor.id)) return;
  const fallen = rescuableBody(state, map, actor);
  if (fallen) {
    contest.rescues.push({ rescuerId: actor.id, heroId: fallen.id, progress: 0, startTick: state.tick, duration: CONTEST.rescueTicks * gearStats(actor.equipment).rescue });
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

/** The material this hero would spend to mend wards, weakest first, and the share of the wards it restores. */
const MEND_SHARE: [ItemId, number][] = [['herb', CONTEST.mendFraction], ['salt', 0.7], ['scroll', 1]];
function mendMaterial(hero: ActorState): [ItemId, number] | undefined {
  return MEND_SHARE.find(([item]) => hero.inventory[item]);
}

/** Ticks a mend or a purification takes this hero. A candle halves a purification. */
export function shrineWorkTicks(hero: ActorState, kind: 'mend' | 'purify'): number {
  return kind === 'mend' ? CONTEST.mendTicks : CONTEST.purifyTicks * (hero.inventory.candle ? 0.5 : 1);
}

/** What a living Light Hero standing in a wayshrine's circle could do for it right now. */
export function shrineWorkFor(state: SimState, hero: ActorState): { sanctuary: SanctuaryState; kind: 'mend' | 'purify' } | undefined {
  const contest = state.contest;
  if (!contest || hero.kind !== 'hero' || hero.team !== 'light' || !alive(hero)) return undefined;
  const sanctuary = contest.sanctuaries.find((s) => distance(hero.x, hero.z, s.x, s.z) <= CONTEST.sanctuaryRadius);
  if (!sanctuary || contest.works.some((w) => w.sanctuaryId === sanctuary.id && w.heroId !== hero.id)) return undefined;
  if (sanctuary.corrupted) return { sanctuary, kind: 'purify' };
  if (sanctuary.ward < CONTEST.wardTicks && mendMaterial(hero)) return { sanctuary, kind: 'mend' };
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
    if (++work.progress < shrineWorkTicks(hero, work.kind)) continue;
    if (work.kind === 'purify') {
      sanctuary.corrupted = false;
      sanctuary.corruption = 0;
      sanctuary.ward = CONTEST.wardTicks * CONTEST.purifiedWardFraction;
      if (hero.inventory.candle) take(hero, 'candle');
    } else {
      const [material, share] = mendMaterial(hero)!;
      take(hero, material);
      sanctuary.ward = Math.min(CONTEST.wardTicks, sanctuary.ward + CONTEST.wardTicks * share * gearStats(hero.equipment).mend);
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
    if (++rescue.progress >= rescue.duration) restore(state, fallen, body.x, body.z, fallen.maxHp * CONTEST.rescueHpFraction + gearStats(fallen.equipment).reviveHp);
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
  updateAfflictions(state);
  updateSanctuaries(state, contest);
  updateShrineWork(state, contest);
  updateRecovery(state, map, contest);
}
