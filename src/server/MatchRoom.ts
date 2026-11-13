/**
 * Colyseus adapter (API: colyseus 0.18). Colyseus provides rooms, seat
 * reservation, sessions and the fixed-timestep loop. Game state is NOT synced
 * through Colyseus schema state: each client is sent its own projected
 * snapshot message, so opposing-team secrets never enter a shared state tree.
 */
import { Room, type Client } from 'colyseus';
import { MSG, SLOT_COUNT, TEAMS, type JoinOptions, type Team, type WelcomeMessage } from '../shared/protocol.ts';
import { FOREST_CROSSING } from '../shared/sim/map.ts';
import { TICK_RATE } from '../shared/sim/simulation.ts';
import { Match } from './match.ts';

/**
 * Server-side room configuration. It is a class on purpose: Colyseus merges
 * the creating client's join options into onCreate's argument, and a client
 * can send any JSON it likes but can never send an instance of this class.
 * The room therefore ignores every plain value and trusts only a MatchConfig
 * built by server code. (A client must not choose the seed, the map, or
 * switch on the debug stream.)
 */
export class MatchConfig {
  readonly seed: number | undefined;
  /** Slots to fill with bots at creation. */
  readonly botSlots: number[];
  readonly mapId: string;
  readonly operation: boolean;
  /** Send development-only perception data to every client. NEVER enable for real play. */
  readonly debug: boolean;

  constructor(init: { seed?: number; botSlots?: number[]; mapId?: string; debug?: boolean; operation?: boolean } = {}) {
    this.seed = init.seed;
    this.botSlots = init.botSlots ?? [1, 5];
    this.mapId = init.mapId ?? FOREST_CROSSING.id;
    this.debug = init.debug === true;
    this.operation = init.operation === true;
  }
}

export interface MatchRoomOptions {
  config?: MatchConfig;
}

export class MatchRoom extends Room {
  // Seats beyond the eight hero slots join as spectators (public-only view).
  override maxClients = SLOT_COUNT + 4;
  override maxMessagesPerSecond = 120;

  private match!: Match;

  override onCreate(options: MatchRoomOptions = {}): void {
    const config = options.config instanceof MatchConfig ? options.config : new MatchConfig();
    const seed = config.seed ?? Date.now() >>> 0;
    this.match = new Match({ seed, mapId: config.mapId, botSlots: config.botSlots, operation: config.operation });

    // No schema state is set, so Colyseus' patch broadcast is a no-op. Do NOT
    // disable it with `patchRate = null`: measured on colyseus 0.18.12, that
    // starves setFixedTimestep (about 8 steps/s instead of 30).

    this.onMessage(MSG.command, (client: Client, payload: unknown) => {
      this.match.submit(client.sessionId, payload);
    });

    this.setFixedTimestep(() => {
      this.match.advance();
      if (this.match.finished && !this.locked) void this.lock().catch((error: unknown) => console.error(error));
      for (const client of this.clients) {
        client.send(MSG.snapshot, this.match.snapshotFor(client.sessionId));
      }
      if (config.debug) this.broadcast(MSG.debug, this.match.debugMessage());
    }, TICK_RATE);

    console.log(`[match ${this.roomId}] created, seed=${seed}, map=${this.match.map.id}`);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const team: Team | undefined = TEAMS.find((t) => t === options?.team);
    const slot = options?.spectate === true ? null : this.match.join(client.sessionId, team);
    const welcome: WelcomeMessage = { tickRate: TICK_RATE, mapId: this.match.map.id, slot };
    client.send(MSG.welcome, welcome);
    console.log(`[match ${this.roomId}] ${client.sessionId} joined as ${slot === null ? 'spectator' : `slot ${slot}`}`);
  }

  override onLeave(client: Client): void {
    this.match.leave(client.sessionId);
    console.log(`[match ${this.roomId}] ${client.sessionId} left`);
  }
}
