/**
 * End-to-end over a real socket: the actual Colyseus server and the actual
 * client SDK, exchanging the real protocol. Guards the things unit tests
 * cannot see (room wiring, tick rate, per-connection projection on the wire).
 */
import { Client, type Room } from '@colyseus/sdk';
import { defineRoom, defineServer, type Server } from 'colyseus';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MSG, ROOM_NAME, type Command, type Snapshot, type WelcomeMessage } from '../src/shared/protocol.ts';
import { HERO_SPEED, TICK_RATE } from '../src/shared/sim/simulation.ts';
import { MatchRoom } from '../src/server/MatchRoom.ts';

const PORT = 26000 + Math.floor(Math.random() * 2000);
let server: Server;

interface TestClient {
  room: Room;
  welcome: WelcomeMessage;
  snapshots: Snapshot[];
  send(command: Command | Record<string, unknown>): void;
  latest(): Snapshot;
  me(): Snapshot['actors'][number];
}

async function join(team: 'dark' | 'light'): Promise<TestClient> {
  const room = await new Client(`http://localhost:${PORT}`).joinOrCreate(ROOM_NAME, { team });
  const snapshots: Snapshot[] = [];
  room.onMessage(MSG.snapshot, (s: Snapshot) => snapshots.push(s));
  const welcome = await new Promise<WelcomeMessage>((resolve) => room.onMessage(MSG.welcome, resolve));
  const latest = () => snapshots.at(-1)!;
  return {
    room,
    welcome,
    snapshots,
    send: (command) => room.send(MSG.command, command),
    latest,
    me: () => latest().actors.find((a) => a.id === latest().you!.actorId)!,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  server = defineServer({ rooms: { [ROOM_NAME]: defineRoom(MatchRoom, { seed: 77, botSlots: [] }) }, greet: false });
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('authoritative server over the network', () => {
  it('seats clients, ticks at the fixed rate, moves heroes and keeps orders private', async () => {
    const light = await join('light');
    const dark = await join('dark');
    expect(light.welcome).toMatchObject({ tickRate: TICK_RATE, slot: 4 });
    expect(dark.welcome.slot).toBe(0);

    await sleep(300);
    const start = light.latest();
    const startedAt = Date.now();
    const startPos = { x: light.me().x, z: light.me().z };
    expect(start.slots.map((s) => s.occupant)).toEqual(['human', 'empty', 'empty', 'empty', 'human', 'empty', 'empty', 'empty']);

    // Light walks north with direct control; Dark issues a private move order.
    light.send({ type: 'moveDir', dx: 0, dz: -1 });
    dark.send({ type: 'moveTo', x: 17.25, z: -21.5 });
    // A forged slot field and a nonsense command must both be harmless.
    light.send({ type: 'moveTo', x: -20, z: -20, slot: 0 });
    light.send({ type: 'moveDir', dx: 0, dz: -1 });
    dark.send({ type: 'explode' });
    await sleep(1500);

    const end = light.latest();
    const elapsed = (Date.now() - startedAt) / 1000;
    const tickRate = (end.tick - start.tick) / elapsed;
    expect(tickRate).toBeGreaterThan(TICK_RATE * 0.85);
    expect(tickRate).toBeLessThan(TICK_RATE * 1.15);

    // Authoritative movement at simulation speed (allowing for command latency).
    const travelled = startPos.z - light.me().z;
    expect(light.me().x).toBeCloseTo(startPos.x, 6);
    expect(travelled).toBeGreaterThan(HERO_SPEED * 1.0);
    expect(travelled).toBeLessThanOrEqual(HERO_SPEED * 1.7);

    // The Dark hero moved because of its OWN order, not Light's forged one.
    const darkHero = dark.me();
    expect(darkHero.order).toEqual({ x: 17.25, z: -21.5 });
    expect(darkHero.x).toBeGreaterThan(0);

    // Light never received the Dark order or the monster's destination...
    const lightWire = JSON.stringify(light.snapshots);
    expect(lightWire).not.toContain('17.25');
    expect(light.snapshots.every((s) => s.actors.every((a) => a.slot === 4 || a.order === undefined))).toBe(true);
    // ...while Dark does see where its side's monster is heading.
    expect(dark.snapshots.some((s) => s.actors.some((a) => a.kind === 'monster' && a.order))).toBe(true);

    // The patrol monster moves on its own in the same snapshots.
    const monsterAt = (s: Snapshot) => s.actors.find((a) => a.kind === 'monster')!;
    expect(Math.hypot(monsterAt(end).x - monsterAt(start).x, monsterAt(end).z - monsterAt(start).z)).toBeGreaterThan(0.5);

    // Leaving frees the seat for everyone else.
    await light.room.leave();
    await sleep(300);
    expect(dark.latest().slots[4]!.occupant).toBe('empty');
    expect(dark.latest().actors.some((a) => a.slot === 4)).toBe(false);
    await dark.room.leave();
  }, 20000);
});
