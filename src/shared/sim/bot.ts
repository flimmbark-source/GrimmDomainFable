/**
 * Minimal bot controller. A bot is just another source of Command values for
 * a slot: it reads the same projected Snapshot a human client would receive
 * for that slot and returns the same command type a human client sends.
 *
 * This bot is deliberately simple. A Light bot wanders and visits caches it
 * believes are full; a Dark bot wanders and walks to the newest shared
 * sighting alert. Both act only on their own projected snapshot, so a bot
 * knows exactly what a human in that seat would know and nothing more. Real
 * bot behaviour (difficulty, takeover rules) is future, undecided work.
 */
import type { Command, Snapshot } from '../protocol.ts';
import { boundsOf, type MapDef } from './map.ts';
import { OPERATION } from './operation.ts';
import { isBlocked } from './simulation.ts';

export interface BotMemory {
  /** Private per-bot PRNG state, independent from the world generator. */
  rng: number;
  /** Tick at which the bot may issue its next order. */
  nextDecisionTick: number;
  /** Newest sighting alert this bot has already reacted to. */
  lastAlertId: number;
}

export function createBotMemory(seed: number): BotMemory {
  return { rng: (seed ^ 0x51ed270b) >>> 0, nextDecisionTick: 30, lastAlertId: 0 };
}

function nextRandom(memory: BotMemory): number {
  // xorshift32
  let x = memory.rng || 1;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  memory.rng = x;
  return x / 4294967296;
}

export function botThink(memory: BotMemory, view: Snapshot, map: MapDef): Command | null {
  if (!view.you || (!view.operation && view.tick < memory.nextDecisionTick)) return null;
  const me = view.actors.find((a) => a.id === view.you?.actorId);
  if (!me) return null;

  const operation = view.operation;
  if (operation) {
    if (operation.result) return null;
    // Fighting and recovery come from the same projected view and the same
    // commands a human has. Bot skill and takeover timing are undecided.
    const kit = view.you.kit;
    if (kit) {
      if (kit.channel) return null;
      if (kit.interaction) return { type: 'revive' };
      if (kit.dead) {
        if (view.you.team !== 'light' || view.tick < memory.nextDecisionTick) return null;
        memory.nextDecisionTick = view.tick + 30;
        // The ghost's own route: the nearest sanctuary that is still eligible.
        const open = (view.sanctuaries ?? []).filter((s) => !s.corrupted)
          .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
        return open && !me.order ? { type: 'moveTo', x: open.x, z: open.z } : null;
      }
      const salve = kit.quick.indexOf('salve');
      if (salve !== -1 && kit.hp <= kit.maxHp - kit.salveHeal) return { type: 'useQuick', slot: salve };
      const foes = view.actors.filter((a) => a.team !== me.team && !a.ghost);
      const near = (range: number) => foes.find((a) => Math.hypot(a.x - me.x, a.z - me.z) <= range + a.radius - 0.2);
      if (kit.attack && kit.attackCooldown === 0 && near(kit.attack.range)) return { type: 'heroAction', action: 'attack' };
      if (operation.progress > 0 || view.tick < memory.nextDecisionTick) return null;
      // Close with an enemy that has come near; otherwise carry on below.
      const threat = kit.attack && foes.find((a) => Math.hypot(a.x - me.x, a.z - me.z) <= 8 && (a.kind === 'hero' || view.you!.spotted));
      if (threat && !near(kit.attack!.range)) {
        memory.nextDecisionTick = view.tick + 10;
        return { type: 'moveTo', x: threat.x, z: threat.z };
      }
      // A fallen ally within reach is worth the walk (D-034).
      const body = view.you.team === 'light' ? (view.bodies ?? []).find((b) => Math.hypot(b.x - me.x, b.z - me.z) <= 40) : undefined;
      if (body && !threat) {
        memory.nextDecisionTick = view.tick + 20;
        return me.order ? null : { type: 'moveTo', x: body.x, z: body.z };
      }
    }
    if (operation.progress > 0 || view.tick < memory.nextDecisionTick) return null;
    memory.nextDecisionTick = view.tick + 20 + Math.floor(nextRandom(memory) * 25);
    // One Dark bot answers the shared sighting alert (D-012) in person; the
    // others hold the castle road. Which bots respond is a placeholder.
    const alert = view.you.team === 'dark' && view.you.slot === 1 && operation.active
      ? view.evidence.filter((e) => e.kind === 'sighting' && e.id > memory.lastAlertId).at(-1) : undefined;
    if (alert) {
      memory.lastAlertId = alert.id;
      return { type: 'moveTo', x: alert.x, z: alert.z };
    }
    // When a Light player is present, reserve the opening sabotage for them.
    // Light bots take the approaches and stay available to screen the site.
    if (view.you.team === 'light' && view.slots.some((slot) => slot.team === 'light' && slot.occupant === 'human')) {
      // They wait out of the relay guards' sight on the south bank by the bridge,
      // and close in on the relay only once the player commits to it.
      const human = view.actors.find((a) => a.team === 'light' && a.slot !== null && !a.ghost && view.slots[a.slot]?.occupant === 'human');
      const pushing = human !== undefined && Math.hypot(human.x - operation.x, human.z - operation.z) <= 16;
      const forward = [{ x: -9, z: -28 }, { x: -7, z: -28 }, { x: -5, z: -24 }, { x: 3, z: -24 }];
      const back = [{ x: -6, z: 2 }, { x: -6, z: 2 }, { x: 5, z: 3 }, { x: -2, z: 6 }];
      const approach = (pushing ? forward : back)[view.you.slot % 4]!;
      if (!me.order && Math.hypot(me.x - approach.x, me.z - approach.z) > 2) return { type: 'moveTo', ...approach };
      return null;
    }
    if (operation.interaction) return { type: 'workOperation' };
    const needsWork = view.you.team === (operation.active ? 'light' : 'dark');
    if (needsWork && !me.order && Math.hypot(me.x - operation.x, me.z - operation.z) > OPERATION.range) {
      // Approach on the open lane from separate points so friendly bodies
      // cannot all try to occupy the same spot.
      const offset = [-1.2, -0.4, 0.4, 1.2][view.you.slot % 4]!;
      return { type: 'moveTo', x: operation.x + offset, z: operation.z + (view.you.team === 'light' ? 1 : -1) };
    }
    if (view.you.team === 'dark' && operation.active) {
      const guard = view.actors.find((actor) => actor.monster === 'brute' && actor.mode === 'patrol' && !actor.order);
      if (guard && Math.hypot(guard.x - operation.x, guard.z - operation.z) > OPERATION.threatRange) {
        return { type: 'monsterOrder', actorId: guard.id, order: 'guard', x: operation.x + 4, z: operation.z };
      }
    }
    return null;
  }

  // Dark: a fresh confirmed sighting (D-012 alert) is worth walking to.
  const alert = view.evidence.filter((e) => e.kind === 'sighting' && e.id > memory.lastAlertId).at(-1);
  if (alert) {
    memory.lastAlertId = alert.id;
    memory.nextDecisionTick = view.tick + 90;
    return { type: 'moveTo', x: alert.x, z: alert.z };
  }
  if (me.order) return null; // still walking to the last point

  memory.nextDecisionTick = view.tick + 45 + Math.floor(nextRandom(memory) * 90);
  if (view.you.team === 'light' && nextRandom(memory) < 0.4) {
    const full = view.sites.filter((site) => site.available);
    const site = full[Math.floor(nextRandom(memory) * full.length)];
    if (site) return { type: 'moveTo', x: site.x, z: site.z };
  }
  // Wander inside the playable rectangle, 4 m in from its edge. (For a square
  // map centred on the origin this is the same arithmetic as before.)
  const b = boundsOf(map);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const rangeX = (b.maxX - b.minX) / 2 - 4;
  const rangeZ = (b.maxZ - b.minZ) / 2 - 4;
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = cx + (nextRandom(memory) * 2 - 1) * rangeX;
    const z = cz + (nextRandom(memory) * 2 - 1) * rangeZ;
    if (!isBlocked(map, x, z, me.radius + 0.5)) return { type: 'moveTo', x, z };
  }
  return null;
}
