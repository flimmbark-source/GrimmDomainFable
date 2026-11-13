import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineRoom, defineServer } from 'colyseus';
import { DEFAULT_SERVER_PORT, REGION_ROOMS, ROOM_NAME } from '../shared/protocol.ts';
import { ORCHARD_VALE } from '../shared/world/orchardVale.ts';
import { MatchConfig, MatchRoom } from './MatchRoom.ts';

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

// After `npm run build`, the same process also serves the built client.
const here = dirname(fileURLToPath(import.meta.url));
const clientDir = [resolve(here, '../../client'), resolve(here, '../../dist/client')].find((dir) =>
  existsSync(resolve(dir, 'index.html')),
);

// Development switches. GRIMM_DEBUG=1 streams monster senses and memory
// (including hidden hero positions) to every client: never use it for real play.
const debug = process.env.GRIMM_DEBUG === '1';
const mapId = process.env.GRIMM_MAP || undefined;
// Reproducible sessions for testing: GRIMM_SEED=123, GRIMM_BOTS=none or e.g. GRIMM_BOTS=1,5
const seed = process.env.GRIMM_SEED ? Number(process.env.GRIMM_SEED) : undefined;
const bots = process.env.GRIMM_BOTS;
const botSlots = bots === undefined ? undefined : bots === 'none' ? [] : bots.split(',').map(Number).filter(Number.isInteger);

const server = defineServer({
  rooms: {
    // Default match: the M1 forest crossing (or GRIMM_MAP).
    [ROOM_NAME]: defineRoom(MatchRoom, { config: new MatchConfig({ debug, mapId, seed: Number.isFinite(seed) ? seed : undefined, botSlots }) }),
    // Test region, joined with ?region=orchard_vale. The map is fixed here, on the server.
    [REGION_ROOMS.orchard_vale]: defineRoom(MatchRoom, {
      config: new MatchConfig({ debug, mapId: ORCHARD_VALE.id, seed: Number.isFinite(seed) ? seed : undefined, botSlots }),
    }),
    [REGION_ROOMS.orchard_operation]: defineRoom(MatchRoom, {
      config: new MatchConfig({ debug, mapId: ORCHARD_VALE.id, operation: true, seed: Number.isFinite(seed) ? seed : undefined, botSlots: botSlots ?? [1, 2, 3, 5, 6, 7] }),
    }),
  },
  greet: false,
  // Forwarded to the default WebSocket transport. Colyseus 0.18 drops a client
  // after 2 missed 3-second pings. Loading a large region (or a slow,
  // software-rendered browser drawing a heavy frame) can stall a tab for that
  // long, so allow about 20 s before giving up on a connection.
  ...({ pingInterval: 4000, pingMaxRetries: 5 } as object),
  express: async (app) => {
    if (!clientDir) return;
    const { default: express } = await import('express');
    app.use(express.static(clientDir));
  },
});

await server.listen(port);
console.log(`Grimm Dominion server listening on http://localhost:${port}`);
console.log(clientDir ? `Serving built client from ${clientDir}` : 'No built client found (use `npm run dev` or `npm run build`).');
if (debug) console.warn('GRIMM_DEBUG=1: perception debug data is being sent to all clients. Information hiding is OFF.');
