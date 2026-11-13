/**
 * Authoritative perception: who sees whom, how attention builds and decays,
 * who hears what, and which evidence that produces.
 *
 * Sight needs range, view arc (monsters) and an unobstructed line against the
 * map's sight-blocking colliders. Nothing here is ever reported by a client.
 */
import type { MonsterType } from '../protocol.ts';
import { clamp, distance, exposure, sightBlocked } from './geometry.ts';
import type { MapDef } from './map.ts';
import { addEvidence, startChase, startInvestigate } from './monster.ts';
import { clampToMap } from './movement.ts';
import { rngNext } from './rng.ts';
import type { ActorState, MonsterBrain, Noise, SimState, TargetMemory } from './state.ts';
import { TUNING } from './tuning.ts';

/** Range and facing test shared by detection and the rendered vision field. */
export function inSightArc(dx: number, dz: number, dirX: number, dirZ: number, range: number, proximity: number, halfArcCos: number): boolean {
  const d = Math.sqrt(dx * dx + dz * dz);
  return d <= range && (d <= proximity || dirX * dx + dirZ * dz >= halfArcCos * d);
}

/** Fraction (0, 1/3, 2/3, 1) of `target` this monster can see right now. */
export function monsterExposure(map: MapDef, monster: ActorState, type: MonsterType, target: ActorState): number {
  const profile = TUNING.monsters[type];
  if (!inSightArc(target.x - monster.x, target.z - monster.z, monster.dirX, monster.dirZ,
    profile.viewRange, profile.proximityRadius, profile.viewHalfArcCos)) return 0;
  return exposure(map, monster.x, monster.z, target.x, target.z, target.radius);
}

/** Heroes see all around themselves, out to a radius, given line of sight. */
export function heroSees(map: MapDef, hero: ActorState, target: ActorState): boolean {
  if (distance(hero.x, hero.z, target.x, target.z) > TUNING.hero.viewRadius) return false;
  return exposure(map, hero.x, hero.z, target.x, target.z, target.radius) > 0;
}

export function heroSeesPoint(map: MapDef, hero: ActorState, x: number, z: number): boolean {
  if (distance(hero.x, hero.z, x, z) > TUNING.hero.viewRadius) return false;
  return !sightBlocked(map, hero.x, hero.z, x, z);
}

export function memoryOf(brain: MonsterBrain, actorId: number): TargetMemory | undefined {
  return brain.targets.find((t) => t.actorId === actorId);
}

function updateSight(state: SimState, map: MapDef, monster: ActorState, brain: MonsterBrain): void {
  const P = TUNING.perception;
  const profile = TUNING.monsters[brain.type];
  const enemies = state.actors.filter((a) => a.kind === 'hero' && a.team !== monster.team);

  // Forget heroes that left the match.
  brain.targets = brain.targets.filter((t) => enemies.some((e) => e.id === t.actorId));

  for (const hero of enemies) {
    const seen = monsterExposure(map, monster, brain.type, hero);
    let memory = memoryOf(brain, hero.id);
    if (seen > 0) {
      if (!memory) {
        memory = { actorId: hero.id, attention: 0, visible: false, confirmed: false, lastAlertTick: -1e9 };
        brain.targets.push(memory);
      }
      const d = distance(monster.x, monster.z, hero.x, hero.z);
      const byDistance = 1 - (1 - P.farRateFactor) * clamp(d / profile.viewRange, 0, 1);
      const rate = (seen * hero.stealth.visibility * byDistance) / P.detectTicksClose;
      memory.attention = memory.confirmed ? 1 : Math.min(1, memory.attention + rate);
      memory.visible = true;
    } else if (memory) {
      memory.attention = Math.max(0, memory.attention - 1 / P.decayTicks);
      memory.visible = false;
    }
  }
  brain.targets = brain.targets.filter((t) => t.attention > 0 || t.confirmed);

  if (brain.mode === 'chase') return; // committed: nothing new until this chase resolves

  // Confirmation: attention filled while the hero is in view.
  const confirmed = brain.targets.find((t) => t.visible && t.attention >= 1 && !t.confirmed);
  if (confirmed) {
    const hero = enemies.find((e) => e.id === confirmed.actorId)!;
    confirmed.confirmed = true;
    startChase(state, monster, brain, hero);
    state.events.push({ kind: 'howl', x: monster.x, z: monster.z, radius: P.vocalRadius, actorId: monster.id });
    // D-012: the confirmation is shared as a time-stamped alert. A cooldown
    // stops line-of-sight flicker from turning alerts into live tracking.
    const share = profile.raisesAlerts && state.tick - confirmed.lastAlertTick >= P.alertCooldownTicks;
    if (share || !profile.raisesAlerts) {
      addEvidence(state, { kind: 'sighting', x: hero.x, z: hero.z, source: monster.id, ownerSlot: brain.ownerSlot, shared: share, subject: hero.id });
    }
    if (share) {
      confirmed.lastAlertTick = state.tick;
      for (const other of state.actors) {
        const ob = other.brain;
        if (!ob || other.id === monster.id || other.team !== monster.team) continue;
        if (!TUNING.monsters[ob.type].respondsToAlerts) continue;
        if (ob.mode === 'patrol' || ob.mode === 'return') startInvestigate(other, ob, 'alert', hero.x, hero.z, -1);
      }
    }
    return;
  }

  // Glimpse: enough attention to go and look, not enough to be sure.
  const glimpsed = brain.targets.find((t) => t.visible && t.attention >= P.suspiciousAt && !t.confirmed);
  if (!glimpsed) return;
  const hero = enemies.find((e) => e.id === glimpsed.actorId)!;
  const lead = brain.investigate;
  if (brain.mode === 'investigate' && lead) {
    if (lead.kind !== 'glimpse') return;
    // Still in view: the lead follows what is actually being seen.
    lead.x = hero.x;
    lead.z = hero.z;
    lead.dirty = true;
    if (lead.phase === 'look') lead.phase = 'travel';
    const record = state.evidence.find((e) => e.id === lead.evidenceId);
    if (record) {
      record.x = hero.x;
      record.z = hero.z;
      record.tick = state.tick;
    }
    return;
  }
  const record = addEvidence(state, { kind: 'glimpse', x: hero.x, z: hero.z, source: monster.id, ownerSlot: brain.ownerSlot, shared: false, subject: null });
  startInvestigate(monster, brain, 'glimpse', hero.x, hero.z, record.id);
  state.events.push({ kind: 'growl', x: monster.x, z: monster.z, radius: P.vocalRadius, actorId: monster.id });
}

function hear(state: SimState, map: MapDef, monster: ActorState, brain: MonsterBrain, noise: Noise): void {
  const P = TUNING.perception;
  if (noise.team === monster.team) return;
  const d = distance(monster.x, monster.z, noise.x, noise.z);
  if (d > noise.radius * TUNING.monsters[brain.type].hearing) return;
  if (brain.mode === 'chase') return;
  const lead = brain.investigate;
  if (brain.mode === 'investigate' && lead && lead.kind !== 'noise') return; // a visual lead wins

  // Hearing gives a rough place, never an identity: the farther away, the
  // less exact. The generator is advanced even when the result is merged.
  const error = P.noiseErrorBase + d * P.noiseErrorPerMetre;
  const rx = rngNext(state.rng);
  const rz = rngNext(rx.state);
  state.rng = rz.state;
  const heard = clampToMap(map, noise.x + (rx.value * 2 - 1) * error, noise.z + (rz.value * 2 - 1) * error, monster.radius);
  const x = heard.x;
  const z = heard.z;

  if (brain.mode === 'investigate' && lead) {
    const record = state.evidence.find((e) => e.id === lead.evidenceId);
    if (record && state.tick - record.tick <= P.noiseMergeTicks) {
      record.x = x;
      record.z = z;
      record.tick = state.tick;
      lead.x = x;
      lead.z = z;
      lead.dirty = true;
      if (lead.phase === 'look') lead.phase = 'travel';
      return;
    }
  }
  const record = addEvidence(state, { kind: 'noise', x, z, source: monster.id, ownerSlot: brain.ownerSlot, shared: false, subject: null });
  startInvestigate(monster, brain, 'noise', x, z, record.id);
  state.events.push({ kind: 'growl', x: monster.x, z: monster.z, radius: P.vocalRadius, actorId: monster.id });
}

/** Run once per tick, after movement. */
export function updatePerception(state: SimState, map: MapDef): void {
  for (const actor of state.actors) {
    if (actor.brain) updateSight(state, map, actor, actor.brain);
  }
  for (const noise of state.noises) {
    for (const actor of state.actors) {
      if (actor.brain) hear(state, map, actor, actor.brain, noise);
    }
  }
  state.noises = [];
  const oldest = state.tick - TUNING.perception.evidenceLifetimeTicks;
  if (state.evidence.some((e) => e.tick < oldest)) state.evidence = state.evidence.filter((e) => e.tick >= oldest);
}
