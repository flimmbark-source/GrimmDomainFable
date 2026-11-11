/**
 * Transport-independent match host. Owns the authoritative simulation, the
 * seats, the per-tick command queue and bot controllers. The Colyseus room is
 * a thin adapter over this class, so everything here is testable without a
 * network.
 */
import {
  parseCommand,
  type Command,
  type SlotCommand,
  type SlotId,
  type Snapshot,
  type Team,
} from '../shared/protocol.ts';
import { botThink, createBotMemory, type BotMemory } from '../shared/sim/bot.ts';
import { getMap, type MapDef } from '../shared/sim/map.ts';
import { projectSnapshot, viewerForSlot } from '../shared/sim/projection.ts';
import { createSim, findFreeSlot, occupySlot, step, vacateSlot, type SimState } from '../shared/sim/simulation.ts';

export interface MatchOptions {
  seed: number;
  mapId: string;
  /** Slots to fill with bots when the match is created. */
  botSlots?: SlotId[];
}

/** Commands accepted from one connection per tick; extra ones are dropped. */
const MAX_COMMANDS_PER_TICK = 4;

export class Match {
  readonly map: MapDef;
  private readonly state: SimState;
  private readonly seats = new Map<string, SlotId>();
  private readonly bots = new Map<SlotId, BotMemory>();
  private queue: SlotCommand[] = [];
  private readonly queuedThisTick = new Map<string, number>();

  constructor(options: MatchOptions) {
    this.map = getMap(options.mapId);
    this.state = createSim({ seed: options.seed, mapId: options.mapId });
    for (const slot of options.botSlots ?? []) this.addBot(slot);
  }

  get tick(): number {
    return this.state.tick;
  }

  addBot(slot: SlotId): boolean {
    if (!occupySlot(this.state, slot, 'bot')) return false;
    this.bots.set(slot, createBotMemory(this.state.seed + slot * 7919));
    return true;
  }

  /** Seat a connection. Returns its slot, or null when it joins as spectator. */
  join(sessionId: string, preferredTeam?: Team): SlotId | null {
    if (this.seats.has(sessionId)) return this.seats.get(sessionId) ?? null;
    const slot = findFreeSlot(this.state, preferredTeam);
    if (slot === null || !occupySlot(this.state, slot, 'human')) return null;
    this.seats.set(sessionId, slot);
    return slot;
  }

  /**
   * Free a connection's seat. Reconnect grace periods and bot takeover are
   * unresolved design questions (decisions.md #6); M0 simply empties the slot.
   */
  leave(sessionId: string): void {
    const slot = this.seats.get(sessionId);
    if (slot === undefined) return;
    this.seats.delete(sessionId);
    this.queuedThisTick.delete(sessionId);
    this.queue = this.queue.filter((c) => c.slot !== slot);
    vacateSlot(this.state, slot);
  }

  slotOf(sessionId: string): SlotId | null {
    return this.seats.get(sessionId) ?? null;
  }

  /**
   * Accept an untrusted client payload. The acting slot always comes from the
   * connection's seat. Returns false when the payload is rejected.
   */
  submit(sessionId: string, payload: unknown): boolean {
    const slot = this.seats.get(sessionId);
    if (slot === undefined) return false; // spectators cannot act
    const command = parseCommand(payload);
    if (!command) return false;
    const count = this.queuedThisTick.get(sessionId) ?? 0;
    if (count >= MAX_COMMANDS_PER_TICK) return false;
    this.queuedThisTick.set(sessionId, count + 1);
    this.queue.push({ slot, command });
    return true;
  }

  /** Run bots, then advance the simulation by one fixed tick. */
  advance(): void {
    for (const [slot, memory] of this.bots) {
      const view = projectSnapshot(this.state, viewerForSlot(this.state, slot));
      const command: Command | null = botThink(memory, view, this.map);
      if (command) this.queue.push({ slot, command });
    }
    const commands = this.queue;
    this.queue = [];
    this.queuedThisTick.clear();
    step(this.state, commands);
  }

  /** The only way state leaves the match: projected for one connection. */
  snapshotFor(sessionId: string | null): Snapshot {
    const slot = sessionId === null ? null : this.slotOf(sessionId);
    return projectSnapshot(this.state, viewerForSlot(this.state, slot));
  }
}
