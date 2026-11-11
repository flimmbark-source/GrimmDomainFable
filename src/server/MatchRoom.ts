/**
 * Colyseus adapter (API: colyseus 0.18). Colyseus provides rooms, seat
 * reservation, sessions and the fixed-timestep loop. Game state is NOT synced
 * through Colyseus schema state: each client is sent its own projected
 * snapshot message, so opposing-team secrets never enter a shared state tree.
 */
import { Room, type Client } from 'colyseus';
import { MSG, SLOT_COUNT, TEAMS, type JoinOptions, type Team, type WelcomeMessage } from '../shared/protocol.ts';
import { FOREST_CLEARING } from '../shared/sim/map.ts';
import { TICK_RATE } from '../shared/sim/simulation.ts';
import { Match } from './match.ts';

export interface MatchRoomOptions {
  seed?: number;
  /** Slots to fill with bots at creation. Defaults to one Light and one Dark bot. */
  botSlots?: number[];
}

export class MatchRoom extends Room {
  // Seats beyond the eight hero slots join as spectators (public-only view).
  override maxClients = SLOT_COUNT + 4;
  override maxMessagesPerSecond = 120;

  private match!: Match;

  override onCreate(options: MatchRoomOptions = {}): void {
    const seed = Number.isFinite(options.seed) ? Number(options.seed) : Date.now() >>> 0;
    this.match = new Match({
      seed,
      mapId: FOREST_CLEARING.id,
      botSlots: options.botSlots ?? [1, 5],
    });

    // No schema state is set, so Colyseus' patch broadcast is a no-op. Do NOT
    // disable it with `patchRate = null`: measured on colyseus 0.18.12, that
    // starves setFixedTimestep (about 8 steps/s instead of 30).

    this.onMessage(MSG.command, (client: Client, payload: unknown) => {
      this.match.submit(client.sessionId, payload);
    });

    this.setFixedTimestep(() => {
      this.match.advance();
      for (const client of this.clients) {
        client.send(MSG.snapshot, this.match.snapshotFor(client.sessionId));
      }
    }, TICK_RATE);

    console.log(`[match ${this.roomId}] created, seed=${seed}, map=${this.match.map.id}`);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const team: Team | undefined = TEAMS.find((t) => t === options?.team);
    const slot = this.match.join(client.sessionId, team);
    const welcome: WelcomeMessage = { tickRate: TICK_RATE, mapId: this.match.map.id, slot };
    client.send(MSG.welcome, welcome);
    console.log(`[match ${this.roomId}] ${client.sessionId} joined as ${slot === null ? 'spectator' : `slot ${slot}`}`);
  }

  override onLeave(client: Client): void {
    this.match.leave(client.sessionId);
    console.log(`[match ${this.roomId}] ${client.sessionId} left`);
  }
}
