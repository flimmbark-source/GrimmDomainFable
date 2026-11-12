# Orchard Vale: implementation report

**Date:** 2026-11-12. **Branch:** `claude/sleepy-brown-5xa89k` (based on `main` at `ed9ff43`, which already contains the M1 integration branch; there was nothing newer to reconcile).
**Brief:** [orchard-vale-claude-implementation-brief.md](orchard-vale-claude-implementation-brief.md). **Region status:** candidate direction from [region-prototype-orchard-vale.md](../design/region-prototype-orchard-vale.md) folklore revision 3. **Not canon.**

This report describes **implemented behaviour, not approved design**. Engineering choices that need creator review are P-13 to P-19 in [decisions.md](../decisions.md).

## Launch it

Requires Node.js 22+ and a WebGL2 desktop browser.

```bash
npm ci
```
```bash
npm run build
```
```bash
npm start
```

Open **http://localhost:2567/?region=orchard_vale**. With `npm run dev` instead, use http://localhost:5173/?region=orchard_vale.

- `&team=dark` takes a Dark seat (the first Dark seat owns the Scout, the second owns the Brute). `&cam=hero` starts in the hero camera.
- Plain http://localhost:2567/ is unchanged: the **M1 forest crossing** is still the default match.
- `?region=` only chooses which server room to join. The map is fixed by server code (`src/server/index.ts`) and reported in the welcome message; a client cannot name a map.
- Loading takes about 15 s in a software-rendered browser (the ground is painted at load); the status line shows the stage.

## What was built

### Simulation and shared geometry (server-authoritative)
- **Rectangular bounds** (`MapDef.bounds`, 184 x 132 m here) instead of only a centred square. Old maps are unchanged.
- **Turned box colliders** (`obox`), used by every building, hedge, wall, fence, cart and water segment. Pure `+ - * / sqrt`, like the rest of the sim.
- **Spatial index**: maps with more than 48 props bucket their colliders on an 8 m grid. Smaller maps (the M1 crossing) keep the exact old linear scan. A test checks 4,000 random queries against a brute-force scan.
- **Tiled navigation**: the walkable grid is built lazily in 32 x 32-cell tiles the first time a query reaches them, and A* reuses stamped scratch arrays instead of allocating per query. A short walk in Orchard Vale builds under a third of the tiles.
- **Shared terrain** (`src/shared/sim/terrain.ts`): one height function from plain feature data (valley slopes, swells, two orchard terraces with ramps, a carved river channel with a ford, a bridge deck). The client's ground mesh, actor heights, markers, camera and mouse picking all use it.
- **Honest scope of height:** movement, pathfinding and line of sight are still 2D. Height never slows, speeds or hides anyone. The contract is enforced by tests: every standable cell has a grade at or below 0.25, every steep face (terrace wall, river bank) lies under a collider, and nothing standable is under deeper water than the ford.

### The region (`src/shared/world/orchardVale.ts`, built with the reusable kit in `src/shared/world/kit.ts`)
- **River** west to east with a **stone bridge** (the only cart crossing) and a **ford** 67 m upstream. The water and steep banks are blockers everywhere else.
- **Village**: 14 buildings of 9 kinds (three cottage types with variants, a jettied cider house, a press house with a screw press in its arcade, a storehouse with hoist and outside stair, a watermill with a turning wheel in a stone-quayed pit, a barn, a cart shed), a cobbled square, well, troughs, carts, barrels, crates, log piles, gardens, washing lines and smoking chimneys.
- **Orchards**: 155 planted fruit trees on two terraces and a north plot, in rows with old survivors, young staked replants, gaps, ladders, baskets and windfalls. Terrace walls and ramps are derived from the same terrace features as the height.
- **Boundary**: six witness trees (1.7 m trunks, real cover), ten marker stones and a worn boundary walk track. The farm lane north of the bridge **bends round a witness tree** instead of taking the straight line (a test checks the straight line would pass through the trunk).
- **Old road and ruin**: an abandoned road with ruts under grass, saplings in its line, a roofless house with a free-standing chimney inside the oldwood, a feral orchard and one marker stone lying out of place. No quest, marker, glow or event.
- **Oldwood and coppice**: a scatter of big irregular trees north of the boundary; a worked coppice of multi-stem stools east of the castle road; hay meadow with stacks.
- **Connectors**: four region exits (west road, castle road, mill lane, orchard track) as plain metadata for a future kingdom generator. Nothing lies beyond them yet.

### Routes (measured in `tests/orchard-vale.test.ts`)
- **The road** (ruin to mill): crosses the bridge, about 40+ m of it inside the Scout's beat.
- **The quiet route** (same trip): over the ford and along the terraces, at least 20% longer, with under a fifth of the road's watched distance, and it never touches the bridge.
- **The ford lane** (west gate to north orchard) is hedged on both sides and **never** in view of the Scout's beat.
- The Scout patrols the square, bridge and junction. A Brute (Dark slot 1) guards the castle road. Both use the existing M1 unit rules unchanged.

### Renderer (`src/client/render/region/`, `src/client/render/models/`)
- **Original procedural art**, no imported or third-party assets: 9 building builders, 11 tree builders with near and far models, about 40 prop and dressing builders, 10 ground-cover cards. All are baked to vertex-coloured geometry through the existing asset library, so any one can be replaced by an authored GLB later.
- **Ground** painted once at load onto a canvas (about 1,800 x 1,400 px): underpainting, tens of thousands of brush dabs, mown orchard strips, yards, cobbles, gardens, roads with ruts and verges, the grass-covered old road, contact shading under every prop, meadow flowers and windfalls. Backdrop hills continue the same height function outside the playable rectangle.
- **River shader**: flow-aligned ripples, shallows, bank foam and broken water over the ford, from a precomputed distance and flow field.
- **Hedges, walls, terrace walls, fences, ruin walls and the bridge** are generated from their colliders module by module, following the ground, so the visible barrier is the collider.
- **Instancing** by kind, variant and 62 m map chunk (frustum culled per chunk), with near and far tree models swapped at 78 m. Shared painterly material: world-space colour blotching and wind sway in the vertex shader.
- **Sky** shader with sun glow and drifting cloud; hemisphere and sun light; shadows that follow the camera's focus; chimney smoke (one point cloud); a turning mill wheel; distant woods, hill orchards and the castle silhouette on the northern skyline as backdrop only.
- **Cameras**: both existing rigs work across the region. The strategy camera follows ground height; the hero camera stays above the ground, **pulls in and rises rather than entering a wall**, and the player's own hero is drawn as a flat silhouette where scenery hides it (only for actors the client was already sent).

## Verification (run in this container, 2026-11-12)

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm test` | **113 passed** in 8 files (86 existing + 27 new in `tests/orchard-vale.test.ts`) |
| `npm run build` | client and server built |
| `npm run verify:orchard` (new, 3 real Chromium tabs) | **20/20** |
| `npm run verify:browser` (M0, default map) | **17/17** |
| `npm run verify:m1` (M1 hunt, default map) | **36/36** on a fresh server; see the flakiness note below |

`verify:orchard` covers, with real mouse and keyboard input against the real server: default map unchanged; region chosen by server room; eight slots; hero drawn on shared ground height; mouse click on sloping terrain; strategy follow, pan and Space recentre; crossing the ford; walking the bridge crown; holding W in hero view until the river bank stops the hero short of the water; the hero camera pulling in against a cottage wall; climbing the terrace ramp; a Scout sighting reaching both Dark seats while live vision stays with the owner; the Light client receiving no Dark evidence or monster state; escaping over the ford until the Scout searches; no console errors.

**M1 browser check flakiness.** Run as CI runs it (M0 then M1 on one server), M1 once failed 4 to 5 steps that wait 4 to 5 seconds of wall-clock time for the Scout to react, in a browser drawing about one frame per second; the next identical sequence passed 36/36. The forest-crossing simulation is unchanged (it takes the old code paths; all M1 determinism and story tests pass). A side-by-side series against untouched `main` was run to separate environment timing from regression; its result is recorded in implementation-status.md.

## Performance (measured, not estimated)

Device: this cloud container, headless Chromium with **SwiftShader** (software WebGL2 on CPU, `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`), 1280 x 720, 4 shared vCPUs. Frame rates here say nothing useful about a real GPU; they are listed because they were measured.

| View | Draw calls | Triangles drawn (incl. shadow pass) | FPS (software) |
| --- | --- | --- | --- |
| Strategy, village overview, zoomed out | 338 | 686k | 0.7 to 1.4 |
| Strategy, west gate | 173 | 471k | 1.3 to 1.7 |
| Hero, orchard lane (worst case seen) | 335 | 712k | 0.5 to 1.0 |
| Hero, mill yard | 171 | 523k | 1.2 to 1.4 |

GPU objects after a full tour: about 350 geometries, 6 textures, 16 shader programs. JS heap 40 to 48 MB. Load (connect plus build) about 15 s in this browser. Triangles per layer before culling: barriers 87k, ground cover 85k, apple trees 69k, backdrop 62k, ground 56k, oldwood 36k.
**Not measured:** a hardware-GPU browser. On ordinary desktop GPUs this load is expected to be comfortable, but that is an expectation, not a result. The obvious next optimisations, if needed, are merged hedge LOD, ground-cover distance fade and fewer shadow casters.

## Visual review against the brief

**The concept image `docs/references/orchard-vale-concept.png` was not in the repository, on any branch, or attached to the session**, so it could not be viewed. The comparison below is against the brief's written description of it (composition, painterly materials, orchard density, settlement atmosphere, visible paths) and the region doc's visual identity section. It should be repeated against the actual image.

**Iteration 1** (first in-engine capture, `orchard-vale-iteration1-*.png`): buildings read well, but grass cards were lit from below and showed as black scratches everywhere; foliage crowns showed hard dark facets and self-shadow streaks; roads looked bright orange-beige; the ground was cut off sharply at the region edge; the region took long enough to load that clients were dropped by the server heartbeat.
**Fixes applied:** cards lit with ground normals; crowns and hedges stopped receiving their own shadow map and use flatter colour ranges; road and roof palette desaturated; painted apron with roads running out of the region; brighter sky light and softer sun; thatch ridges rebuilt; fruit made smaller; region build split into stages with a longer server heartbeat grace.
**Final captures** (`orchard-vale-strategy-*.png`, `orchard-vale-hero-*.png`, all from the running game):
- Strengths: the strategy view now reads as a working valley before any monster appears: river, bridge, roofs, rows and lanes are legible at a glance; the hero view has depth (village and bridge framed by the oldwood, castle on the skyline); the terraces, ramp and witness-tree bend are physically present, not painted.
- Weaknesses still visible: tree crowns are lumpy low-poly blobs rather than painted foliage masses; the ground texture is soft up close in hero view; there are no characters or animals besides the heroes and monsters, so "lived-in" relies on props and smoke; building roofs are clean (little moss or repair variety); far backdrop trees are simple; lighting is a single fixed afternoon.

## Remaining limitations and placeholders
- Height is visual and contract-checked, not simulated (see above). No slopes affect speed or sight.
- One authored slice. Connectors are metadata only; no streaming, no neighbouring region, no generator.
- No ambient villagers, animals or audio beds (the brief allowed static scenery; region audio was not built).
- The two caches (ruin, mill yard) are the existing M1 placeholder objective, placed here only so the hunt has somewhere to go.
- The witness trees, marker stones, ruin, fallen stone, ribbons on stones and bent lane are **scenery**. No mechanic reads them.
- Performance has only been measured in software rendering.

## Lore status
Still **candidate**, not canon: the older claim on the land, the founding agreement, the boundary walk, waking the orchard, the steward's moved stone and ruined house, and the merchant/boundary tension. The build expresses them only as geography (bent lane, marker stones, witness trees, overgrown road, ruin). **Open:** whether the oldwood has real agency and how a player would feel it (region doc gate 3); whether this archetype is approved at all. Nothing withdrawn in revision 3 (last fruit, upward water, three-lane arena, per-class POIs) was built.
