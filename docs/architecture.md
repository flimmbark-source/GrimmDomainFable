# Grimm Dominion: architecture

**Status:** validated by the M0 spike (2026-11-11). This describes what is in the repository and why. It is engineering structure, not gameplay design; open game rules stay in [decisions.md](decisions.md).

## Stack and exact versions

| Concern | Choice | Version (locked in `package-lock.json`) |
| --- | --- | --- |
| Language | TypeScript, strict, ES modules everywhere | typescript 7.0.2 |
| Runtime | Node.js | tested on 22.23.4 (`engines: >=22`) |
| Browser rendering | Three.js, `WebGLRenderer` (WebGL2) | three 0.187.0 |
| Client build / dev server | Vite | vite 8.3.8 |
| Authoritative server | Colyseus (rooms, sessions, fixed timestep) | colyseus 0.18.12 (`@colyseus/core` 0.18.28) |
| Client networking | Colyseus SDK | @colyseus/sdk 0.18.10 |
| Static file serving (production) | Express, via Colyseus' `express` hook | express 5.3.0 |
| Tests | Vitest | vitest 5.1.0 |
| Dev runners | tsx (server watch), concurrently | tsx 4.23.15, concurrently 10.0.7 |
| Browser automation | Playwright, used by `scripts/browser-check.mjs`; not a project dependency | whatever is installed |

No UI framework. The HUD is about 60 lines of DOM code, so React is not justified yet.

## Layout

One npm package. Folders exist only where there is code.

```
src/shared/            imported by BOTH server and client; no DOM, Node or network code
  protocol.ts          teams, 8 slots, Command types + validation, Snapshot types
  sim/map.ts           static map: colliders, spawns, patrol routes, prop placement
  sim/simulation.ts    authoritative state + step(); deterministic, fixed timestep
  sim/projection.ts    SimState -> per-viewer Snapshot (the information boundary)
  sim/bot.ts           bot controller: Snapshot in, Command out
  sim/rng.ts           seeded PRNG
src/server/
  match.ts             transport-free match host: seats, command queue, bots, tick
  MatchRoom.ts         thin Colyseus Room adapter around Match
  index.ts             process entry; also serves the built client
src/client/
  main.ts              bootstrap + render loop + debug hooks
  net.ts               Colyseus SDK connection (commands out, snapshots in)
  input.ts             keyboard/mouse -> camera movement and Commands
  cameras.ts           strategy rig and hero rig (experimental)
  hud.ts, index.html   DOM overlay
  render/assets.ts     asset library: GLB imports or procedural placeholders, by id
  render/bake.ts       procedural modelling helper (one vertex-coloured mesh per model)
  render/world.ts      terrain, props, backdrop forest, castle, sky, collision debug
  render/actors.ts     snapshot interpolation and actor visuals
tests/                 unit + real-network integration tests
scripts/               GLB placeholder generator, real-browser acceptance check
public/models/         imported art (GLB)
```

## Data flow

```
 Browser (one per player)                         Node server (one process)
 ┌──────────────────────────────┐                 ┌─────────────────────────────────────────┐
 │ input.ts                     │   Command       │ MatchRoom (Colyseus Room)               │
 │  keys/mouse ──► Command ─────┼────────────────►│   onMessage ─► Match.submit(session, …) │
 │                              │  "cmd" message  │        slot comes from the SESSION,     │
 │                              │                 │        payload validated by parseCommand│
 │                              │                 │                                         │
 │                              │                 │   setFixedTimestep, 30 Hz:              │
 │                              │                 │     bots: Snapshot ─► botThink ─► Command│
 │                              │                 │     step(SimState, commands)   ◄── the only place the world changes
 │                              │   Snapshot      │     for each client:                    │
 │ actors.ts  ◄─────────────────┼─────────────────┤       projectSnapshot(state, viewer)    │
 │  interpolate ─► Three.js     │  "snap" message │       ◄── the only way state leaves     │
 │  cameras.ts (rts | hero)     │  (per client)   │                                         │
 └──────────────────────────────┘                 └─────────────────────────────────────────┘
```

The client never simulates. It renders what snapshots say, 100 ms in the past, interpolating between two snapshots. The only motion the client invents is cosmetic (walk bob, turn smoothing).

## Decisions and reasons

### Colyseus, but not Colyseus state sync
The M0 brief asked for Colyseus versus a minimal websocket server. Both were exercised: the simulation and `Match` host run with no network at all (unit tests), and the same code runs inside a real Colyseus 0.18 room (integration test and browser check).

Colyseus is kept for what it is proven at and what would otherwise be hand-written before M4: room lifecycle, matchmaking (`joinOrCreate`), seat reservation, session ids, reconnection hooks (`onDrop` / `allowReconnection`), message rate limiting, and a fixed-timestep loop with an accumulator.

Colyseus' schema state synchronisation is deliberately **not** used. All clients of a room would share one state tree, and hiding parts of it per client means annotating that tree. For a game whose core is incomplete information, the boundary should instead be one explicit function that can be tested without a network: `projectSnapshot(state, viewer)`. Each client is sent its own snapshot as a message.

Cost of that choice: no delta compression. Every client gets a full snapshot of what it may see, 30 times a second. With eight heroes and tens of monsters that is small. It must be re-measured at M4 with eight clients and real army sizes; the options then are a hand-written delta or feeding projected data into Colyseus `StateView`. `StateView` was not evaluated in M0.

Because `Match` does not import Colyseus, replacing the transport later means rewriting `MatchRoom.ts` (about 60 lines) and `net.ts` (about 60 lines).

**Colyseus 0.18 finding:** setting `patchRate = null` on a room starves `setFixedTimestep` (measured: about 8 steps/s instead of 30 on colyseus 0.18.12). The room leaves `patchRate` at its default; with no schema state the patch broadcast does nothing. The integration test asserts the real tick rate so this cannot regress silently.

### Deterministic fixed-timestep simulation
`step(state, commands)` advances exactly one tick of 1/30 s. It reads no clock, does no I/O, and takes randomness only from a PRNG whose state lives inside `SimState`. Float maths is restricted to `+ - * /` and `Math.sqrt`, which IEEE-754 defines exactly, so the same seed and inputs give the same state on any JavaScript engine (verified on one engine only, see implementation-status.md). Facing is stored as a unit vector so the simulation needs no trigonometry.

This is what makes replays, server-side bot training, reproduction of bug reports and later client prediction possible.

### Information projection
`SimState` never leaves the server. `projection.ts` builds each snapshot field by field from an allow-list; nothing is spread or copied wholesale, so a private field added to the simulation later stays private by default. Visibility is decided on the server (`canSee`), never reported by clients.

What M0 already withholds: the PRNG state and seed (nobody), a hero's pending order (owner only), a monster's destination (Dark only) and its patrol brain (nobody). What M0 does not do yet: hide actors. `canSee` returns true for everything; fog of war, line of sight and hearing are M1.

Sharing a teammate's order with teammates is a design question (team information sharing is unresolved rule 5), so M0 shares nothing beyond the owner.

### Eight slots, humans and bots through one path
`SimState.slots` always has eight entries: ids 0-3 Dark, 4-7 Light. A slot is `empty`, `human` or `bot`. Occupying a slot spawns its hero; vacating removes it.

A bot is a function from the slot's own projected `Snapshot` to a `Command`. It sees exactly what a human in that seat would be sent and produces exactly the type a human client sends, and the simulation cannot tell which is which. Bots therefore cannot cheat on information by construction, and a human can later take over a bot's slot (or the reverse) without touching the simulation. When and how that happens is unresolved rule 6 and is not implemented.

### Two control styles, one command set
The protocol has `moveDir` (hold a direction: action-style control) and `moveTo` (go to a ground point: RTS-style order). Both drive the same actor through the same tick. The hero camera sends the first and the strategy camera the second. This is the technical proof that a hybrid perspective is supportable; which side gets which view, what triggers a switch and whether time continues are unresolved rules 2 and 3 and are not encoded anywhere in the simulation. Commanding monster armies will add further command types to the same union.

### Art pipeline
Every model is requested by id from `AssetLibrary`. An id listed in `GLB_MODELS` is loaded with Three's `GLTFLoader` from `public/models`; any other id is built by a procedural placeholder function. Replacing a placeholder with authored art is one manifest line. One real GLB (`standing_stone.glb`) goes through the import path today.

Model conventions: origin on the ground at the footprint centre, +Y up, 1 unit = 1 metre, characters face +Z.

Procedural placeholders are baked into a single vertex-coloured, flat-shaded geometry each and share one material, so a prop is one draw call and the backdrop forest is three instanced draw calls. All art is original; no Warcraft assets or copied designs are used.

The map definition is shared: the collider the simulation uses for a prop and the position the renderer draws it at come from the same `PropDef`. Press `G` in the client to see the simulation's colliders drawn over the scene.

## How this supports the full game
- **Eight sessions:** room capacity is the eight slots plus spectators; seat assignment, per-seat authority and per-seat projection are already per connection.
- **Bots:** permanent, slot-based, on the human command path.
- **Partial information:** one server-side projection function per viewer, with tests that fail if an unlisted field or a private value reaches a snapshot.
- **Action plus RTS control:** both camera rigs and both command styles run against the same authoritative tick.
