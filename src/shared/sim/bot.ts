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
  if (!view.you || view.tick < memory.nextDecisionTick) return null;
  const me = view.actors.find((a) => a.id === view.you?.actorId);
  if (!me) return null;

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
