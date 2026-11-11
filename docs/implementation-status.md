# Implementation status

**Last updated:** 2026-11-11, end of M0 implementation.
**Branch:** `claude/grimmdomain-milestone-m0-4y6lxu`. Commit SHAs are in the evidence ledger in [production/roadmap.md](production/roadmap.md).

This file reports what the code does and what was actually run. Behaviour described here is **implemented behaviour, not approved design**. Nothing below settles an unresolved rule in [decisions.md](decisions.md).

## Run it

Requires Node.js 22 or newer and a desktop browser with WebGL2.

```bash
npm ci
```

```bash
npm run dev
```

Open http://localhost:5173. The game server runs on port 2567 and the Vite dev server on 5173. A second tab joins the same match; add `?team=dark` to take a Dark slot, `?cam=hero` to start in the hero view, `?debug=1` to start with colliders shown.

Production-style run (one process serves the built client and the game):

```bash
npm run build
```

```bash
npm start
```

Then open http://localhost:2567.

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` over client, server, shared, tests |
| `npm test` | Vitest: simulation, slots, projection, validation, match host, real-network integration |
| `npm run build` | Vite client build to `dist/client`, `tsc` server build to `dist/server` |
| `npm run verify:browser [url]` | Drives a real Chromium against a running game and rewrites `docs/evidence/*.png`. Needs a `playwright` package installed locally or globally. |
| `npm run assets:placeholder` | Regenerates `public/models/standing_stone.glb` |

### Controls (experimental, not final UX)
- **Strategy view:** click the ground to order your hero there. WASD or arrows pan, wheel zooms, Space centres on the hero, X stops.
- **Hero view:** WASD or arrows move relative to the camera. Q/E or mouse drag turn the camera, wheel zooms.
- **Tab** or the top-right button switches view. **G** shows the simulation's colliders and the patrol route.

## What exists
- Authoritative 30 Hz simulation: heroes, static collision (circles and axis-aligned boxes), map bounds, one monster patrolling six waypoints with seeded pauses.
- Eight slots (4 Dark, 4 Light), each empty, human or bot. The dev room starts with one wandering bot per team (slots 1 and 5).
- Typed, validated commands: `moveDir`, `moveTo`, `stop`.
- Colyseus 0.18 room: seats a connection in a slot (preferred team if free), sends that connection its own projected snapshot every tick, frees the slot on leave. Connections beyond eight heroes join as spectators with the public view.
- Three.js client: forest clearing with paths, three tree species (pine, oak, dead), rocks, standing stones (imported GLB), a crooked house, and a distant castle with a road leading to it; light and dark hero placeholders and a patrol beast.
- Strategy camera and hero camera over the same scene, with a blended switch.
- HUD: connection state, the eight slots, controls, tick/fps/position readout.

## Executed checks (2026-11-11, Linux container, Node 22.23.4)

All four were run on a clean copy of the tracked files after `npm ci`.

| Check | Result |
| --- | --- |
| `npm ci` | succeeded |
| `npm run typecheck` | 0 errors |
| `npm test` | **35 passed, 0 failed** (3 files, 2.8 s) |
| `npm run build` | succeeded; client bundle 830 kB (222 kB gzip), server emitted to `dist/server` |
| `npm start` + `npm run verify:browser http://localhost:2567` | **16 of 16 passed** |
| `npm run dev` + `npm run verify:browser` | **16 of 16 passed** |

Browser used: Playwright's headless Chromium, WebGL 2.0 through SwiftShader (software rendering, no GPU), 1280x720.

### Acceptance criteria

| M0 criterion | Status | Evidence |
| --- | --- | --- |
| install, dev, build, typecheck, test from clean checkout | met | table above |
| A desktop browser opens the running 3D client and it is interactive | met in headless Chromium only | browser check: WebGL2 context, 52 draw calls, real mouse and key events change state |
| Moving the actor changes simulation state and is rendered | met | click moved the hero from (-3.00, 24.00) to (-3.00, 11.61); rendered position matched within 0.05; hero drawn 13 px from the clicked pixel |
| Actor cannot walk through a visible major obstacle | met | W held 4.2 s into the crooked house: hero stopped at z = -1.900, exactly wall plus hero radius. Unit test sweeps every prop from 16 directions |
| Monster movement runs on the simulation tick | met | unit test: monster visits waypoints 1,2,3,4,5,0,1 with only `step()` called and no players; frozen when `step()` is not called. Browser: monster moved from (7.80, 1.41) to (7.85, 8.21) |
| Determinism: same seed + commands = same state; different commands differ | met | `tests/simulation.test.ts`, 600-tick runs compared by hash and deep equality; also different seed differs, and a mid-run copy continues identically |
| Exactly four Dark and four Light slots, AI-capable | met | `tests/slots-and-projection.test.ts`; bots drive heroes through the command queue |
| Privacy stub: public projection emits nothing private | met | allow-list key scan over four viewers; seed, PRNG state, patrol brain and other players' orders absent; checked again on the wire in the integration test |
| Strategy and hero camera both demonstrable | met | browser check: strategy camera y = 41.5, fov 36; hero camera y = 3.5, fov 58; screenshots below |
| Screenshots and reproducible manual test | met | `docs/evidence/`, steps below |
| architecture.md and implementation-status.md | met | this file and [architecture.md](architecture.md) |
| Code committed | met | see ledger |

### Screenshots
Written by `npm run verify:browser`:
- `docs/evidence/m0-strategy-view.png`
- `docs/evidence/m0-hero-view.png`
- `docs/evidence/m0-hero-view-blocked-by-house.png`
- `docs/evidence/m0-strategy-view-collision-debug.png`

### Manual test (about two minutes)
1. `npm run dev`, open http://localhost:5173. The top-left panel should say "Connected · you control slot 4" and show YOU in the Light row.
2. Click the ground north of your hero. A yellow ring marks the order and the hero walks to it.
3. Watch the dark beast: it walks a loop around the clearing, pausing at each corner.
4. Press Tab. The camera drops behind the hero and the castle is visible up the road. Hold W to walk.
5. Walk into the house, a tree and the map edge. The hero slides along them and never passes through.
6. Press Tab, then G. Magenta outlines are the simulation's real colliders; the yellow loop is the patrol route.
7. Open a second tab with `?team=dark`. Each tab shows the other's hero moving, and the slot panel shows two humans.

## Known defects and limitations

**Not verified**
- **Frame rate on real hardware is unknown.** The only browser available was software-rendered and ran at 3 to 8 fps with about 148,000 triangles and 50 to 80 draw calls. That number says nothing reliable about a desktop GPU. It needs one run on the creator's machine.
- No human has played this build. Only headless Chromium was used; Firefox, Safari and Edge are untested.
- Cross-engine determinism is designed for but was only executed on V8.
- Eight simultaneous clients were not load-tested (out of M0 scope). Two were.

**Gameplay-visible**
- No pathfinding. `moveTo` walks a straight line, slides along obstacles and gives up after 20 ticks without progress. Bots use `moveTo`, so they sometimes stall against a tree until their next decision.
- Actors do not collide with each other; heroes and the monster pass through one another.
- No client-side prediction. Your own hero responds after network latency plus the 100 ms interpolation delay. Unnoticeable on localhost, will be felt over the internet.
- The hero camera does not avoid obstacles. Trees and the house can block the view or clip into it.
- No fog of war: every actor's position is sent to everyone. This is the M1 hook, not an oversight.
- In strategy view the hero is not followed automatically; press Space to recentre.

**Engineering**
- Leaving frees the slot at once and removes the hero. No reconnect grace period and no bot takeover (unresolved rule 6).
- One room type, joined with `joinOrCreate`; a ninth to twelfth connection spectates, a thirteenth is refused by the room cap. No lobby or team picker UI.
- Full snapshot per client per tick, no delta compression (see architecture.md).
- Colliders are circles and axis-aligned boxes. The crooked house's leaning upper storey overhangs its box slightly.
- Only one model is a real imported GLB; everything else is a procedural placeholder. No skeletal animation, textures or audio.
- The client bundle is a single 830 kB chunk (mostly Three.js).
- `npm audit` reports 16 low/moderate advisories, all in transitive dependencies of the `colyseus` meta-package (for example `uuid` via `@colyseus/auth`). The offered fix downgrades Colyseus to 0.15, so they are left as is. The meta-package also installs Redis, auth and monitor modules the game does not use; switching to `@colyseus/core` plus `@colyseus/ws-transport` would shrink that surface.
- The server seed is the wall clock unless a seed option is passed; matches are not yet recorded for replay.

## Proposed M1 sequence
Engineering order only. Every rule and number comes from the hunting spec ([design/hunting-perception-v0.md](design/hunting-perception-v0.md)) once the creator approves it; none is decided here.

1. **Navigation.** Grid or navmesh pathfinding over the existing colliders, used by `moveTo`, bots and monsters. Pursuit and search cannot work on straight lines.
2. **Line of sight.** Deterministic segment-versus-collider occlusion in the simulation, with a debug overlay (extends the `G` view). Covers story ST-01.
3. **Monster state machine.** Patrol, investigate, alert, pursue, search as explicit simulation states with last-known position and timestamps (ST-02 to ST-04, ST-07).
4. **Noise events** as simulation events with position and loudness (ST-05).
5. **Real projection.** `canSee` driven by step 2, per-team reports for the Dark side, and wire-level tests that hidden positions never reach the wrong client (ST-06).
6. **Feedback.** Detection build-up and alert indicators in both camera views.
7. Each story becomes a scripted, seeded simulation test before its visuals are built.

Design input needed before or during M1: which hero is the first hunted character (the client currently draws a generic Light placeholder), and what a Dark player is told when a monster detects something.
