# Implementation status

**Last updated:** 2026-11-11, M1 implementation on `integration/m0-preserve-design-20261111`.

This file reports what the code does and what was actually run. Behaviour described here is **implemented behaviour, not approved design**. Choices engineering had to make are listed as P-1 to P-12 in [decisions.md](decisions.md) for creator review. **M1 is not complete until the creator and ChatGPT have played it** ([playtest checklist](playtests/m1-playtest-checklist.md)).

## Run it

Requires Node.js 22 or newer and a desktop browser with WebGL2.

```bash
npm ci
```
```bash
npm run dev
```

Open http://localhost:5173 (Light hero). `?team=dark` takes a Dark seat: the first Dark seat owns the Scout. `?spectate=1` watches with the public view. `?cam=hero` starts in the hero camera.

Production-style run (one process, http://localhost:2567):
```bash
npm run build
```
```bash
npm start
```

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` over client, server, shared, tests |
| `npm test` | Vitest: 86 tests in 7 files |
| `npm run build` | client to `dist/client`, server to `dist/server` |
| `npm run verify:browser [url]` | M0 regression in real Chromium (16 checks) |
| `npm run verify:m1 [url]` | M1 hunt scenario in three real Chromium tabs (36 checks). Start the server with `GRIMM_BOTS=none GRIMM_SEED=7` |

Server switches (environment variables, never client options): `GRIMM_BOTS=none` or `1,5`; `GRIMM_SEED=7`; `GRIMM_MAP=forest_crossing_v1_brute` (adds a Brute); `GRIMM_DEBUG=1` streams every monster's senses to all clients for the `G` overlay and **switches information hiding off**.

### Controls (experimental)
- Strategy view: click to move, WASD pan, wheel zoom, Space centre, X stop. Hero view: WASD move, Q/E or drag turn. Tab switches.
- **Shift** sneak (slow, silent). **F** whistle. Stand still on a cache for 3 s to open it.
- Dark owner: **right-click** posts the Scout at that spot, **P** sends it back to its patrol.
- **G** colliders: magenta blocks sight, grey does not.

## What M1 added
1. **Navigation.** Grid A* over the map colliders with path straightening, for `moveTo`, bots and monsters.
2. **Occlusion.** Sight needs range, view arc (monsters) and a clear line against sight-blocking colliders. Half-hidden targets count as partly exposed.
3. **Perception and evidence.** Attention builds while seen and decays when not. Running, whistling and opening a cache make noise. Evidence records are time-stamped and frozen.
4. **Scout AI.** Patrol, investigate, chase, search, return. It acts only on what it has perceived.
5. **Team information (D-012).** Confirmed sightings go to all Dark seats as an alert. The Scout's live vision, destination and state go to its owner only. Hidden actors are not sent at all.
6. **Feedback (D-014).** Monster "?", "!", "…" signs and posture; growl and howl; a small eye indicator and heartbeat for the hero's own exposure; Dark report panel and ground markers.
7. **Scene.** Forest crossing: two caches, an exposed direct route, a covered south route with one gap, a north route past the Dark spawn.
8. Also fixed: a client could choose the room's seed through join options (M0 weakness); the M0 patrol never actually paused at waypoints.

## Executed checks (2026-11-11, Linux container, Node 22.23.4)

| Check | Result |
| --- | --- |
| M0 baseline before any change: typecheck, 35 tests, build, `verify:browser` | all passed, 16 of 16 |
| `npm run typecheck` | 0 errors |
| `npm test` | **86 passed, 0 failed** |
| `npm run build` | succeeded |
| `npm run verify:browser` (M0 regression, new build) | **16 of 16** |
| `npm run verify:m1` | **34 of 36** on the last full run; see below |

Browser: headless Chromium, software WebGL (SwiftShader), 2 to 4 fps.

**The two `verify:m1` failures, and what was done about them:**
- "teammate tab never received the hero during the chase": the teammate's own hero was parked about 20 m (its view radius) from the escape route, so it most likely saw the hero with its own eyes. Not proven. The script now parks it farther away. **Not rerun.**
- "the hidden hero heard the growl": the test's in-page recorder samples snapshots and sounds last one tick. The check now reads the audio counter instead. **Not rerun.**

The claim behind the first one (a teammate never gets the hero through someone else's Scout) is covered independently by `tests/m1-privacy.test.ts` and by the raw-frame test in `tests/server.integration.test.ts`. One small change was made after the last browser run (one last-seen marker per monster instead of several); unit tests were rerun, the browser checks were not.

### Issue #6 acceptance criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Light Hero can avoid a Scout using cover | met | M1-01 tests; browser: 14 s behind the thicket, attention 0 |
| Brief sighting raises attention, relaxes in cover | met | M1-02 tests |
| Sustained visibility: confirmed sighting and team alert, no non-owner live vision | met | M1-03, privacy tests, wire test, browser (owner sent hero, teammate not) |
| After breaking sight, Scout searches last-seen, never hidden truth | met | M1-04: identical Scout behaviour for three different hidden hero paths |
| Noise triggers investigation without identifying the emitter | met | M1-05; browser whistle step |
| Dark commander can redirect a Scout to a resource | met | M1-06; browser right-click step |
| Payloads and spectator view do not leak hidden positions | met | per-viewer tests, eight-bot property test, raw WebSocket frames of four real clients |
| Understandable detection feedback without wallhacks | **built, not judged** | browser checks show it appears; whether it reads well needs a human |
| Determinism, build, typecheck, existing tests, browser checks | met, with the two caveats above | table above |
| Playtest list, screenshots, known defects committed | met | [checklist](playtests/m1-playtest-checklist.md), `docs/evidence/m1-*.png`, below |

Spec stories M1-01 to M1-10 are in `tests/m1-stories.test.ts`; M1-09 (two or more real clients) is in `tests/server.integration.test.ts`.

### Screenshots (written by `verify:m1`)
`m1-light-hiding-behind-thicket`, `m1-light-being-noticed`, `m1-light-spotted`, `m1-dark-owner-live-vision`, `m1-dark-teammate-alert-only`, `m1-dark-owner-scout-searching`, `m1-dark-owner-noise-report`, `m1-dark-owner-scout-guarding-cache`, `m1-hero-view-being-noticed` (all `.png` in `docs/evidence/`). Only the searching screenshot was looked at by the engineer.

## Known defects and limitations

**Gameplay, most important first**
- **Escape is fragile.** Scout chase speed is 4.6 against the hero's 6.0. Fleeing at once along a covered route loses it in about 10 s; open ground takes about 13 s, so cover helps only a little. If the hero hesitates a few seconds and the Scout closes to point-blank, the same route did not shake it in two browser runs.
- **Being caught does nothing.** The Scout stops beside the hero. No combat or capture exists.
- **A single tree is fiddly cover.** The occluder is the trunk; a hero must be almost exactly behind it.
- A guard order has no facing: the Scout faces the way it arrived and sweeps about 60 degrees either side.
- A Dark teammate can infer a hero's rough position by watching an allied Scout run (P-1).
- Light heroes have no hearing: Dark footsteps are silent to them.
- Sneak, whistle and caches are engineering proposals (P-7, P-9).
- Actors still do not collide with each other. No client-side prediction. The hero camera does not avoid obstacles.

**Not verified**
- **No human has played M1.** Whether the cues are readable and the encounter is fun is unknown.
- **Audio has never been heard.** The checks count cues triggered; headless Chromium plays nothing audible.
- Frame rate on a real GPU is unknown (software rendering only).
- The Brute (M1-07) is tested in simulation only; it was never run in a browser.
- The debug overlay (`GRIMM_DEBUG=1`) was not exercised in a browser.
- Eight simultaneous real clients were not load-tested. Four were.
- Cross-engine determinism is designed for but only executed on V8.

**Engineering**
- Full snapshot per client per tick, no delta compression; projection cost not measured at eight clients.
- Leaving frees the slot at once; no reconnect or bot takeover (unresolved rule 6).
- Placeholder art throughout; one imported GLB. Audio is synthesised tones.
- `npm audit` advisories in transitive Colyseus dependencies, unchanged from M0.

## Suggested next steps
1. Creator and ChatGPT run the three scenarios in the playtest checklist and rule on P-1 to P-12, P-8 (chase speed) first.
2. Rerun `npm run verify:m1` once after the two script fixes.
3. Decide what being caught means before M2; the hunt has no stakes without it.
