/**
 * End-to-end over real sockets: the actual Colyseus server and the actual
 * client SDK, exchanging the real protocol. Guards what unit tests cannot
 * see: room wiring, tick rate, and what is REALLY on the wire per connection.
 *
 * Every WebSocket frame each client receives is recorded as raw bytes before
 * the SDK decodes it, so the privacy checks below do not depend on what the
 * client library chooses to expose.
 */
import type { Room } from '@colyseus/sdk';
import { defineRoom, defineServer, type Server } from 'colyseus';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MSG, ROOM_NAME, type Command, type Snapshot, type WelcomeMessage } from '../src/shared/protocol.ts';
import { HERO_SPEED, TICK_RATE } from '../src/shared/sim/simulation.ts';
import { MatchConfig, MatchRoom } from '../src/server/MatchRoom.ts';

const PORT = 26000 + Math.floor(Math.random() * 2000);
let server: Server;
let SdkClient: typeof import('@colyseus/sdk').Client;

/** Raw frames per socket, in the order sockets were opened. */
const sockets: Uint8Array[][] = [];

interface TestClient {
  room: Room;
  welcome: WelcomeMessage;
  snapshots: Snapshot[];
  /** Every byte this connection received, concatenated. */
  wire(): Buffer;
  debugMessages: number;
  send(command: Command | Record<string, unknown>): void;
  latest(): Snapshot;
  me(): Snapshot['actors'][number];
}

async function join(options: Record<string, unknown>): Promise<TestClient> {
  const socketIndex = sockets.length;
  const room = await new SdkClient(`http://localhost:${PORT}`).joinOrCreate(ROOM_NAME, options);
  const snapshots: Snapshot[] = [];
  room.onMessage(MSG.snapshot, (s: Snapshot) => snapshots.push(s));
  const client: TestClient = {
    room,
    welcome: undefined as never,
    snapshots,
    wire: () => Buffer.concat(sockets[socketIndex] ?? []),
    debugMessages: 0,
    send: (command) => room.send(MSG.command, command),
    latest: () => snapshots.at(-1)!,
    me: () => client.latest().actors.find((a) => a.id === client.latest().you!.actorId)!,
  };
  room.onMessage(MSG.debug, () => client.debugMessages++);
  client.welcome = await new Promise<WelcomeMessage>((resolve) => room.onMessage(MSG.welcome, resolve));
  return client;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(what: string, done: () => boolean, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (!done()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await sleep(30);
  }
}

/** The 8 bytes a float64 occupies on the wire (MessagePack is big-endian). */
function float64(value: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeDoubleBE(value);
  return b;
}

/** Only numbers that can travel no other way than as a float64. */
const distinctive = (v: number) => !Number.isInteger(v) && Math.fround(v) !== v;

beforeAll(async () => {
  // Tap the WebSocket constructor BEFORE the SDK captures it.
  const Native = globalThis.WebSocket;
  class TappedSocket extends Native {
    constructor(...args: ConstructorParameters<typeof WebSocket>) {
      super(...args);
      const frames: Uint8Array[] = [];
      sockets.push(frames);
      this.addEventListener('message', (event: MessageEvent) => {
        const data: unknown = event.data;
        if (data instanceof ArrayBuffer) frames.push(new Uint8Array(data.slice(0)));
        else if (ArrayBuffer.isView(data)) frames.push(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
        else if (typeof data === 'string') frames.push(new TextEncoder().encode(data));
        else throw new Error('unexpected frame type in test tap');
      });
    }
  }
  globalThis.WebSocket = TappedSocket as typeof WebSocket;
  ({ Client: SdkClient } = await import('@colyseus/sdk'));

  server = defineServer({
    rooms: {
      [ROOM_NAME]: defineRoom(MatchRoom, { config: new MatchConfig({ seed: 77, botSlots: [] }) }),
    },
    greet: false,
  });
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('authoritative server over the network', () => {
  it('seats clients, ticks at the fixed rate, moves heroes around obstacles and keeps orders private', async () => {
    const light = await join({ team: 'light' });
    const dark = await join({ team: 'dark' });
    expect(light.welcome).toMatchObject({ tickRate: TICK_RATE, slot: 4 });
    expect(dark.welcome.slot).toBe(0);

    await sleep(300);
    const start = light.latest();
    const darkStart = dark.latest();
    const startedAt = Date.now();
    const startPos = { x: light.me().x, z: light.me().z };
    expect(start.slots.map((s) => s.occupant)).toEqual(['human', 'empty', 'empty', 'empty', 'human', 'empty', 'empty', 'empty']);

    // Light walks west with direct control; Dark issues a private move order.
    light.send({ type: 'moveDir', dx: -1, dz: 0 });
    dark.send({ type: 'moveTo', x: 17.25, z: -21.5 });
    // A forged slot field and a nonsense command must both be harmless.
    light.send({ type: 'moveTo', x: -20, z: 20, slot: 0 });
    light.send({ type: 'moveDir', dx: -1, dz: 0 });
    dark.send({ type: 'explode' });
    await sleep(1500);

    const end = light.latest();
    const elapsed = (Date.now() - startedAt) / 1000;
    const tickRate = (end.tick - start.tick) / elapsed;
    expect(tickRate).toBeGreaterThan(TICK_RATE * 0.85);
    expect(tickRate).toBeLessThan(TICK_RATE * 1.15);

    // Authoritative movement at simulation speed (allowing for command latency).
    const travelled = startPos.x - light.me().x;
    expect(light.me().z).toBeCloseTo(startPos.z, 6);
    expect(travelled).toBeGreaterThan(HERO_SPEED * 1.0);
    expect(travelled).toBeLessThanOrEqual(HERO_SPEED * 1.7);

    // The Dark hero moved because of its OWN order, not Light's forged one.
    const darkHero = dark.me();
    expect(darkHero.order).toEqual({ x: 17.25, z: -21.5 });
    expect(darkHero.x).toBeGreaterThan(0);

    // Light never received the Dark order, the Dark hero or any evidence...
    expect(light.wire().includes(float64(17.25))).toBe(false);
    expect(JSON.stringify(light.snapshots)).not.toContain('17.25');
    expect(light.snapshots.every((s) => s.evidence.length === 0 && s.actors.every((a) => a.slot === 4 || a.order === undefined))).toBe(true);
    expect(light.snapshots.every((s) => s.actors.every((a) => a.kind === 'monster' || a.team === 'light'))).toBe(true);
    // ...while the Scout's owner sees where its monster is heading.
    expect(dark.snapshots.some((s) => s.actors.some((a) => a.kind === 'monster' && a.order && a.mode === 'patrol'))).toBe(true);

    // The patrol monster moves on its own in the same snapshots.
    const monsterAt = (s: Snapshot) => s.actors.find((a) => a.kind === 'monster')!;
    const patrolled = Math.hypot(monsterAt(dark.latest()).x - monsterAt(darkStart).x, monsterAt(dark.latest()).z - monsterAt(darkStart).z);
    expect(patrolled).toBeGreaterThan(0.5);

    // Leaving frees the seat for everyone else.
    await light.room.leave();
    await sleep(300);
    expect(dark.latest().slots[4]!.occupant).toBe('empty');
    await dark.room.leave();
    await sleep(300);
  }, 20000);
});

describe('M1-09: what is really on the wire for each seat', () => {
  it('owner gets live vision, teammate gets only the alert, spectator and enemy get no hidden positions, and no client can switch on debug data', async () => {
    const owner = await join({ team: 'dark' }); // slot 0: owns the Scout
    const mate = await join({ team: 'dark' }); // slot 1: Dark teammate
    const light = await join({ team: 'light' }); // slot 4
    // A client that tries to configure the room and enable the debug stream.
    const spectator = await join({ spectate: true, debug: true, seed: 1, mapId: 'x', config: { debug: true, seed: 1 } });
    expect([owner.welcome.slot, mate.welcome.slot, light.welcome.slot, spectator.welcome.slot]).toEqual([0, 1, 4, null]);
    await waitFor('first snapshots', () => [owner, mate, light, spectator].every((c) => c.snapshots.length > 5));

    const lightId = light.latest().you!.actorId!;
    const scoutIn = (c: TestClient) => c.latest().actors.find((a) => a.kind === 'monster');
    const scoutId = scoutIn(owner)!.id;
    expect(scoutIn(mate)!.id).toBe(scoutId); // allies see the Scout
    expect(spectator.latest().you).toBeNull();
    expect(spectator.latest().actors.every((a) => a.kind === 'monster')).toBe(true); // no hero is visible to the other team yet

    // --- Phase 1: the Light hero moves about in the south, unseen. --------
    light.send({ type: 'moveTo', x: -20.37, z: 22.61 });
    owner.send({ type: 'moveTo', x: 14.83, z: -25.19 }); // Dark hero moves too, far away
    await sleep(1500);
    const hiddenUntil = light.latest().tick;

    // The Light player tries to command the Scout; it must be ignored.
    light.send({ type: 'monsterOrder', actorId: scoutId, order: 'guard', x: 25.61, z: 25.37 });
    // The owner posts the Scout in the south-west, near where the hero is.
    owner.send({ type: 'monsterOrder', actorId: scoutId, order: 'guard', x: -15.3, z: 19.4 });
    await waitFor('owner sees its Scout re-tasked', () => scoutIn(owner)!.mode === 'return');
    expect(scoutIn(owner)!.order).toEqual({ x: -15.3, z: 19.4 });
    expect(scoutIn(mate)!.order).toBeUndefined();
    expect(scoutIn(mate)!.mode).toBeUndefined();

    // --- Phase 2: the Scout comes over and confirms the hero. --------------
    // The hero stands its ground and steps up to the Scout (inside its
    // close-range sense, so this works whichever way it happens to face).
    const sighted = () => mate.latest().evidence.some((e) => e.kind === 'sighting');
    const started = Date.now();
    while (!sighted()) {
      if (Date.now() - started > 30000) throw new Error('timed out waiting for a confirmed sighting');
      const scout = scoutIn(owner)!;
      if (Math.hypot(scout.x - light.me().x, scout.z - light.me().z) < 9) light.send({ type: 'moveTo', x: scout.x - 1.3, z: scout.z + 0.9 });
      await sleep(250);
    }
    await waitFor('light is told it is spotted', () => light.latest().you!.spotted);
    expect(light.latest().you!.attention).toBe(1);
    expect(scoutIn(light)).toBeDefined(); // a monster that sees you is visible to you
    const confirmTick = mate.latest().evidence.find((e) => e.kind === 'sighting')!.tick;

    // --- Phase 3: the hero runs east in the open, the Scout chasing. ------
    light.send({ type: 'moveTo', x: 9.71, z: 24.83 });
    await sleep(2500);
    for (const c of [owner, mate, light, spectator]) await c.room.leave();
    await sleep(300);

    // ===== What each connection actually received =====
    const truth = new Map(light.snapshots.map((s) => [s.tick, s.actors.find((a) => a.id === lightId)!]));
    const heroCoords = [...new Set([...truth.values()].flatMap((a) => [a.x, a.z]))].filter(distinctive);
    expect(heroCoords.length).toBeGreaterThan(100);
    const onWire = (c: TestClient, values: number[]) => {
      const wire = c.wire();
      return values.filter((v) => wire.includes(float64(v)));
    };
    // Positive control: the encoding assumption holds, the hero's own client has them all.
    expect(onWire(light, heroCoords).length).toBe(heroCoords.length);

    // TEAMMATE (non-owner Dark): never the hero, only the frozen alert.
    expect(mate.snapshots.every((s) => s.actors.every((a) => a.team === 'dark'))).toBe(true);
    const alerts = mate.snapshots.flatMap((s) => s.evidence);
    expect(alerts.every((e) => e.kind === 'sighting')).toBe(true);
    const alertCoords = new Set(alerts.flatMap((e) => [e.x, e.z]));
    expect(new Set(alerts.map((e) => e.id)).size).toBeLessThanOrEqual(2); // an alert, not a stream
    const leakedToMate = onWire(mate, heroCoords).filter((v) => !alertCoords.has(v));
    expect(leakedToMate).toEqual([]);
    // The alert position is one the hero really occupied at the alert's tick.
    const alert = alerts[0]!;
    expect(truth.get(alert.tick)).toMatchObject({ x: alert.x, z: alert.z });
    expect(mate.wire().includes(float64(alert.x)) || !distinctive(alert.x)).toBe(true);

    // OWNER: nothing before confirmation, live positions after it.
    const ownerSaw = owner.snapshots.filter((s) => s.actors.some((a) => a.id === lightId));
    expect(ownerSaw.length).toBeGreaterThan(30);
    expect(ownerSaw.every((s) => s.tick >= confirmTick)).toBe(true);
    for (const s of ownerSaw) {
      const copy = s.actors.find((a) => a.id === lightId)!;
      expect(truth.get(s.tick)).toMatchObject({ x: copy.x, z: copy.z }); // live, not stale
    }
    const beforeConfirm = [...truth].filter(([tick]) => tick <= hiddenUntil).flatMap(([, a]) => [a.x, a.z]).filter(distinctive);
    expect(beforeConfirm.length).toBeGreaterThan(20);
    expect(onWire(owner, beforeConfirm)).toEqual([]);
    expect(onWire(owner, heroCoords).length).toBeGreaterThan(40);

    // SPECTATOR: a hero appears only while the opposing team really sees it.
    const publicSaw = spectator.snapshots.filter((s) => s.actors.some((a) => a.id === lightId));
    expect(publicSaw.every((s) => s.tick >= confirmTick)).toBe(true);
    expect(onWire(spectator, beforeConfirm)).toEqual([]);
    expect(spectator.snapshots.every((s) => s.evidence.length === 0 && s.you === null)).toBe(true);

    // LIGHT: no evidence, and never the far-away Dark hero's coordinates.
    expect(light.snapshots.every((s) => s.evidence.length === 0)).toBe(true);
    const darkHeroCoords = [...new Set(owner.snapshots.flatMap((s) => s.actors.filter((a) => a.slot === 0).flatMap((a) => [a.x, a.z])))].filter(distinctive);
    expect(darkHeroCoords.length).toBeGreaterThan(20);
    expect(onWire(light, darkHeroCoords)).toEqual([]);
    expect(light.snapshots.every((s) => s.actors.every((a) => a.slot !== 0 && a.slot !== 1))).toBe(true);
    // The forged order never took effect.
    expect(owner.snapshots.every((s) => s.actors.every((a) => a.order?.x !== 25.61))).toBe(true);
    expect(owner.wire().includes(float64(25.61))).toBe(false);

    // DEBUG STREAM: off, and a client cannot turn it on.
    for (const c of [owner, mate, light, spectator]) {
      expect(c.debugMessages).toBe(0);
      const text = c.wire().toString('latin1');
      for (const secret of ['lastSeen', 'searchPoints', 'targets', 'viewHalfArcCos', 'rng', 'seed', 'brain']) expect(text.includes(secret), secret).toBe(false);
    }
  }, 60000);
});
