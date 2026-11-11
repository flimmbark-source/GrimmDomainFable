/**
 * Minimal bot controller. A bot is just another source of Command values for
 * a slot: it reads the same projected Snapshot a human client would receive
 * for that slot and returns the same command type a human client sends.
 *
 * This M0 bot only wanders between map points; real bot behaviour (and bot
 * difficulty / takeover rules) is future, undecided work.
 */
import type { Command, Snapshot } from '../protocol.ts';
import type { MapDef } from './map.ts';
import { isBlocked } from './simulation.ts';

export interface BotMemory {
  /** Private per-bot PRNG state, independent from the world generator. */
  rng: number;
  /** Tick at which the bot may issue its next order. */
  nextDecisionTick: number;
}

export function createBotMemory(seed: number): BotMemory {
  return { rng: (seed ^ 0x51ed270b) >>> 0, nextDecisionTick: 30 };
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
  if (!me || me.order) return null; // still walking to the last point

  memory.nextDecisionTick = view.tick + 45 + Math.floor(nextRandom(memory) * 90);
  const range = map.halfSize - 4;
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = (nextRandom(memory) * 2 - 1) * range;
    const z = (nextRandom(memory) * 2 - 1) * range;
    if (!isBlocked(map, x, z, me.radius + 0.5)) return { type: 'moveTo', x, z };
  }
  return null;
}
