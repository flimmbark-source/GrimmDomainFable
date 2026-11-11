import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineRoom, defineServer } from 'colyseus';
import { DEFAULT_SERVER_PORT, ROOM_NAME } from '../shared/protocol.ts';
import { MatchRoom } from './MatchRoom.ts';

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

// After `npm run build`, the same process also serves the built client.
const here = dirname(fileURLToPath(import.meta.url));
const clientDir = [resolve(here, '../../client'), resolve(here, '../../dist/client')].find((dir) =>
  existsSync(resolve(dir, 'index.html')),
);

const server = defineServer({
  rooms: { [ROOM_NAME]: defineRoom(MatchRoom) },
  greet: false,
  express: async (app) => {
    if (!clientDir) return;
    const { default: express } = await import('express');
    app.use(express.static(clientDir));
  },
});

await server.listen(port);
console.log(`Grimm Dominion server listening on http://localhost:${port}`);
console.log(clientDir ? `Serving built client from ${clientDir}` : 'No built client found (use `npm run dev` or `npm run build`).');
