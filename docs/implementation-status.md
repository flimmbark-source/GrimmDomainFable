# Implementation status

**Last updated:** 2026-11-12, M1 camera-follow correction and creator chase feedback on `integration/m0-preserve-design-20261111`.

This file reports what the code does and what was actually run. Behaviour described here is **implemented behaviour, not approved design**. Choices engineering had to make are listed as P-1 to P-12 in [decisions.md](decisions.md) for creator review. **M1 still requires full creator acceptance** ([playtest checklist](playtests/m1-playtest-checklist.md)). The creator has tested the chase but not yet approved the complete set of M1 interactions.

## Creator observation and follow-up fixes (2026-11-12)

- **Observed:** the creator reports that the **Scout chase feels great because breaking line of sight enables escape**. This supersedes the earlier engineer's qualitative assessment that pursuit pacing feels too fragile; the measured scripted edge cases remain useful test cases, but are **not an approved design defect** or grounds to change chase speeds.
- **Camera defect:** in strategy view the camera initially focused near the hero but stayed stationary as the hero moved. The client now **follows the hero by default**, with WASD/arrows for manual pan and **Space to recenter and resume following**. Explicit camera focus (used by automated screenshots) remains independent of follow; switching from hero to strategy view resumes following.
- **Verification environment:** creator's Codespace reported `MODULE_NOT_FOUND` for Playwright; this was a missing optional local/global browser-test package, **not a failed hunt/escape behavior test**. Browser-check scripts now give actionable installation instructions and the M0 browser test expects camera-follow instead of the old fixed-screen click destination. From repo root run `npm install --no-save playwright` and `npx playwright install chromium` before `npm run verify:m1`. **Codespaces Linux system dependencies:** if Chromium itself fails with `error while loading shared libraries: libatk-1.0.so.0` (or another missing `.so`), run `npx playwright install-deps chromium` (Playwright can request sudo for apt packages), then rerun the check. This is an OS dependency failure, not failed gameplay verification. If `sudo npx` cannot find the NVM-managed Node binary, run the command *without* a `sudo` prefix. See https://playwright.dev/docs/browsers.
- **Pending:** rerun typecheck, build, and both browser suites on the modified integration branch. No new passing test result is claimed by this code review, and the chase observation is not approval of every provisional M1 choice (P-1 through P-12).

## Orchard Vale test region (2026-11-12, branch `claude/sleepy-brown-5xa89k`)

A richly built, playable authored region joined with **`?region=orchard_vale`** (the default match is still the M1 crossing). River with a stone bridge and a ford, terraced orchards, a 14-building village with press house and turning watermill, witness trees and marker stones along a boundary walk, an overgrown old road to a ruin, oldwood and coppice. Real collisions, navigation, cover and the unchanged M1 Scout hunt; shared terrain height (visual only, contract-tested). Original procedural art only. Full details, measurements, screenshots and gaps: [Orchard Vale implementation report](production/orchard-vale-implementation-report.md). Provisional choices P-13 to P-19 in [decisions.md](decisions.md). Region lore remains **candidate**, not canon.

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
| `npm test` | Vitest: 114 tests in 8 files (28 for Orchard Vale) |
| `npm run build` | client to `dist/client`, server to `dist/server` |
| `npm run verify:browser [url]` | M0 regression in real Chromium (16 checks) |
| `npm run verify:m1 [url]` | M1 hunt scenario in three real Chromium tabs (36 checks). Start the server with `GRIMM_BOTS=none GRIMM_SEED=7` |
| `npm run verify:orchard [url]` | Orchard Vale in three real Chromium tabs (21 checks) and evidence screenshots. Default url http://localhost:2567 |
| `npm run plot:region [mapId] [out.svg]` | Top-down plan of a map's colliders, paths and reachable ground |

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
- **Earlier scripted escape concern, now superseded by creator gameplay feedback.** Browser-run measurements: with a Scout speed of 4.6 and hero speed of 6.0, an immediate covered escape took about 10 s versus 13 s in open ground, and point-blank pursuit sometimes proved hard to shake. **The creator subsequently reported the chase feels good because line-of-sight escape works.** Do not change speeds on the basis of the earlier concern alone; keep the edge cases for later testing.
- **Being caught does nothing.** The Scout stops beside the hero. No combat or capture exists.
- **A single tree is fiddly cover.** The occluder is the trunk; a hero must be almost exactly behind it.
- A guard order has no facing: the Scout faces the way it arrived and sweeps about 60 degrees either side.
- A Dark teammate can infer a hero's rough position by watching an allied Scout run (P-1).
- Light heroes have no hearing: Dark footsteps are silent to them.
- Sneak, whistle and caches are engineering proposals (P-7, P-9).
- Actors still do not collide with each other. No client-side prediction. The hero camera does not avoid obstacles.

**Not verified**
- **Creator has tested the chase and reports positive line-of-sight gameplay.** Full blind-crossing, Dark-commander, feedback/audio and other checklist evaluations are not yet established.
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
1. On the integration branch, pull the camera and browser-check fixes, install Playwright for Codespace checks and rerun typecheck/build/M0/M1 browser suites.
2. Confirm the new strategy-camera follow in real play, including manual pan and Space recenter. Complete the blind-crossing and Dark-commander checklist; preserve the creator's positive chase verdict unless new observations justify changing it.
3. Review remaining provisional decisions P-1 through P-12 and determine the consequence of a genuinely caught hero before M2; currently capture/combat is absent.
