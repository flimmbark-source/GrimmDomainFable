# Claude Code implementation brief: Orchard Vale playable environment

**Type:** Authorized implementation brief for the Grimm Dominion game code. **Target:** a richly built, genuinely traversable 3D Orchard Vale **in the running game**, not an illustration, a flat image backdrop, a debug map, or a documentation-only proposal.

**Created:** 2026-11-12. **Region status:** Orchard Vale and its boundary folklore are **candidate creative direction**, not automatically canon for every generated kingdom. Implement this as a playable **authored vertical slice** with reusable building blocks, retaining the approved kingdom principles D-084 through D-093. Do not silently turn proposed local stories into new character powers, spirit AI, corruption physics or quest mechanics.

## Instructions for Claude: do the work

Work autonomously through reconnaissance, implementation, real browser testing, visual evaluation and iteration. Do not stop at an architectural plan, a hollow greybox, or an artist-facing prompt. Start by auditing the current code and identifying the smallest path to a rich, integrated playable region. Make practical technical decisions yourself, document them, implement them and verify them. Do not request repeated "proceed" messages for routine engineering. Where a genuine new gameplay or lore decision is necessary, preserve the existing system and log it as unresolved instead of inventing mechanics.

**Repository:** `flimmbark-source/GrimmDomainFable`

**Read these sources in order:**
1. `docs/decisions.md`, especially D-008, D-012 through D-014, D-021 through D-023, D-050 through D-059, D-068 through D-083, and D-084 through D-093.
2. `docs/design/region-prototype-orchard-vale.md`, **folklore revision 3**. This supersedes the last-fruit custom and upward-running-water spectacle.
3. `docs/design/kingdom-theme-grammar.md`.
4. `docs/design/kingdom-world-architecture.md`.
5. `docs/design/kingdom-generator-v0.md` for future-facing constraints, not permission to defer real game environment implementation.

**Gameplay-code baseline:** inspect branch `integration/m0-preserve-design-20261111` first. It has the M1 forest-crossing playtest and camera-follow fixes. Main has newer design documents. Confirm current remote heads and actual merge state before starting; branch from the newest sound gameplay baseline and bring relevant main documents into the working branch without overwriting newer code. Never force-push or silently discard concurrent changes. If these branches have already been merged or superseded, follow the actual newest code and report which base you used.

**Concept image:** Use the supplied generated Orchard Vale concept image (user should attach it to Claude or add it locally as `docs/references/orchard-vale-concept.png`). It guides the target composition, painterly materials, strong shapes, orchard density, settlement atmosphere and visible paths. **It is not an executable level asset.** The image is a *loose camera composition reference*, not permission to implement every detail literally or treat depicted banners, far castle placement, chapel ruin, shrines or NPCs as settled lore. The illustration is richer than the current renderer's assets; the job includes making new game-ready assets and presentation.

## Core artistic and thematic goal

Make a **working fairytale orchard valley** that reads as a lived-in place *before* hostile units appear. Orchards are planted and maintained rather than randomly scattered. Produce moves to presses, storerooms and cart roads. A river explains the mill and crossing. A woodland edge with old witness trees and boundary stones conveys a remembered relationship between cultivated land and older, stranger forces. A deliberately bent path and a reclaimed, abandoned road make that history visible. The settlement's familiar, practical relationship to folklore coexists with beauty and potential threat. Current Dark activity is an **overlay** on this preexisting place, not a universal black/evil terrain shader.

Visual objective: an **original, readable 3D painterly gothic-fairytale game environment**, viewed in both the existing elevated strategy camera and close hero camera, with strong silhouettes and rich but controlled details. Draw from the *qualities* of classic Warcraft III readability, not its protected models or designs. The concept art has cinematic detail, so translate its artistic language into feasible real-time production assets instead of trying to fake its exact pixels.

### Required physical environment

- **Land and navigation:** sculpt or author a broad, coherent valley with orchard terraces, river corridor, village terrain and oldwood edge. Avoid a perfect flat square surrounded by decorative inaccessible hills. Real traversable surfaces, blockers, and any height differences must agree with server-authoritative movement, pathfinding, collision and sight. If the current 2D sim cannot yet support meaningful elevation, implement a minimal tested shared terrain-height approach *or* constrain playable grades honestly while building a coherent low-relief terrain. Do not draw walkable slopes that physically cannot be walked.
- **Village and work areas:** several architecturally varied cream-plaster/timber buildings with red-brown roofs; a distinctive press/storehouse cluster, working-looking mill/waterwheel next to usable water, sheds, chimneys, fences, barrels, carts, crates, orchard ladders, signs of maintained paths and harvest labor. Buildings should read as actual modeled structures from both camera distances, not colored cubes with triangular roofs. Ambient life can be static or cosmetic initially if it does not leak hidden game state; don't fabricate NPC economies or quests.
- **Orchards:** planted rows that conform to the land, with believable tree age and silhouette variation, pruning/grafting details, fruit, ladders, baskets, low walls and hedge corridors. Make repeated assets efficient via instancing, atlas/material reuse and distance LOD, but avoid a mechanical copy-paste look.
- **Oldwood / folklore:** a visually contrasting but not inherently evil mature woodland edge; massive older witness trees, credible boundary stones and a walking route that follows them, plus one partly reclaimed old road and ruin. This should tell the community's boundary story *without text popups*. The oldwood is not automatically a shrine, Dark source, harvest curse or sentient AI.
- **Infrastructure:** an actual stone bridge with a sensible main cart road and legible secondary farm/wood paths. A river crossing must be physically traversable via the bridge, with water/steep banks impassable wherever depicted as impassable. A far castle silhouette can be background only if it fits the real kingdom setting, not a false local objective.
- **Depth and finish:** region-specific ground materials, coherent sunlight/ambient shadow, selective fog, water movement, chimney/wheel/crop animation where feasible, spatially appropriate ambience and distinct readable props. No UI clutter. A still screenshot alone must not be the final output.

**Do not** bring back the rejected last-fruit/unseen visitor, "nobody knows why" folklore, upward-flowing water, obligatory three-lane arena, or a guaranteed separate POI for each class.

## Gameplay and systemic requirements

The region must be playable **with the real existing hero, Scout, camera and server**, not a Three.js-only showroom or animation.

1. Add Orchard Vale as a clearly selectable development/test region or region streaming proof, **server-authoritatively selected**, without replacing the working M1 forest crossing as the default. No client-only map/collider mismatch.
2. Preserve the current **hero-centered RTS camera behavior**, manual pan, Space recenter, third-person view and input. Both camera modes must work across the entire playable area without clipping buildings or losing the hero.
3. Make routes and cover mechanically meaningful: walk/point-and-click between the village, bridge, orchard plots, boundary walk and an exit toward another region; follow sensible nav; pass through clear openings; use solid trunks/stone walls/opaque hedges for true line-of-sight breaks. Decorative foliage must not claim to hide a hero when the sim still sees them.
4. The **existing M1 Scout hunt works well because line of sight permits escapes**. Do not rebalance its speed/perception or break its last-known-position search. Demonstrate sighting, chase, loss of sight and searching in this region. Confirmed Scout sightings go as time-stamped alerts to all Dark Heroes; live Scout vision is private to the owner.
5. Give Dark force movement a plausible defendable public route. A bridge and trade logistics create a reason to patrol, but don't invent supply modifiers, stockpile mechanics or Dark Energy effects.
6. Preserve the planned world-architecture direction: one seamless world, guided procedural geography with hybrid region connections, meaningful travel, partial starting chart, layered exploration sharing and coherent biomes. For this build, use an **authored regional slice** that can later be embedded/varied by the world generator. Avoid hard-coding permanent Orchard Vale coordinates and assumptions into general-purpose simulation systems.
7. Do not add Witch ritual, Alchemist recipe, Goblin heist, civilian economy or supernatural bargain gameplay that the decision register has not specified. The region should support those later, with sensible location metadata/placeholders, but the immediate deliverable is rich **environment plus traversal/hunt integration**.

## Production architecture: examine and evolve what is there

The present implementation uses:
- `src/shared/sim/map.ts`: 60 m square `MapDef`, props with circle/axis-aligned box colliders and blocksSight, one map for sim and renderer.
- `src/shared/sim/nav.ts`: cached whole-map deterministic grid pathfinder whose memory/work scales with area.
- `src/shared/sim/geometry.ts`: 2D collisions, path tests and cover/LOS.
- `src/client/render/world.ts`: one procedural terrain mesh, flat in the playable area; hills/forest and distant castle are merely decorative.
- `src/client/render/assets.ts` and `bake.ts`: an asset manifest that imports GLBs when available and otherwise bakes simplified procedural primitive assets, often instanced.
- `src/client/cameras.ts` and `main.ts`: current camera/input and world setup.
- `src/shared/sim/projection.ts`: per-viewer allow-listed snapshots that must not leak hidden units.

These observations describe the known M1 integration branch, **not a promise that this is the latest code**. Validate exact code before editing.

Make reusable, testable environment modules and art assets rather than adding hundreds of hard-coded prop objects to one giant file. Model in Blender/export original GLBs if available, or make appropriately detailed original procedural geometry if Blender is unavailable. Follow conventions: **metres, +Y up, model origin at ground footprint center, and current renderer/asset-library contracts**. Use instancing, LOD/culling and object pooling where they help, with proper disposal of GPU resources.

Avoid a naïvely enlarged global `halfSize` and huge whole-map grid. If the new playable region requires additional scale, implement the smallest viable partitioned nav/spatial solution with real tests and future region connectors, not an entire hypothetical MMO engine.

**Terrain consistency is a hard gate:** don't let client mesh heights differ from authoritative actor/collider/world heights. If you cannot implement real terrain-aware movement safely in one pass, document the limitation, keep slopes conservative and ensure paths are credible; don't falsely claim full 3D terrain simulation.

## Work plan and verification sequence

**Phase A: baseline reconnaissance and asset plan.** Inspect code and compare current M1 in both cameras to the concept image. Identify missing asset classes, nav/terrain limitations and a realistic performance strategy. Then move to implementation rather than stopping to ask for permission.

**Phase B: real playable blockout.** Build the new test-region selection, connected land/river/bridge/village/orchard/oldwood routes, true collision/LOS and hero/Scout paths. This blockout is a milestone, **not an acceptable final visual result**.

**Phase C: art-production pass.** Make the region rich: original building variations and architectural details, trees/orchard rows, watermill and bridge, witness-tree silhouettes, marker-stone language, economy props and material palette. Implement water, shadows and ambient layers with controlled visual hierarchy. Avoid using one large still image, skybox cutout or flat photo plane to counterfeit the environment.

**Phase D: in-engine critique and iteration.** Capture multiple screenshots from the actual running build: elevated approach overview, hero eye-level in village, orchard/hedge route, bridge/mill crossing, and oldwood boundary. Compare them against the concept **for material richness, legibility, silhouette, emotional contrast and believable place logic**, not exact pixels. Fix obvious flatness, excessive repetition, clipping, missing details or gameplay-route confusion before presenting results.

**Phase E: regression and performance validation.** Run `npm run typecheck`, `npm test`, `npm run build`, `npm run verify:browser`, `npm run verify:m1` and add region-specific tests for valid routes, river crossing, collisions/LOS, camera travel, spawned actors and map authority. Install Playwright and Chromium/Linux dependencies if needed; report environment failures separately from actual gameplay failures. Test at least the user-accessible WebGL build, preferably both camera modes and multiple simultaneous connections. Report draw calls, triangle count, FPS and memory on an identified browser/device (not invented figures).

## Definition of done: these must be true

1. Running the game opens an actual **Orchard Vale test route / playable environment** without modifying the original M1 test by default.
2. The area has visually distinct **orchards, an inhabited village, river crossing, mill/press economy, winding minor paths and oldwood boundary** with material detail and variation on both strategic and hero cameras.
3. Players and Scouts genuinely navigate it; bridges are walkable, water/obstacles are respected, cover and line of sight work, and no hidden-unit information leaks.
4. At least one alternate route provides a meaningful traversal choice at this scale, not a contrived three-lane level.
5. The folklore is evident through historical boundaries, maintained paths and old trees. No forced quest markers or invented spirit abilities.
6. A visual review includes real browser screenshots and at least one before/after iteration showing where quality improved.
7. Baseline M1 chase and camera behavior remain intact. Automated tests pass or their exact blockers/failures are documented.
8. Deliver a feature branch/PR or clear commits, assets, commands to launch the new region, actual screenshots/video if available, test results, performance findings, and a candid remaining-gaps list.

**Priority if resources/time are constrained:** complete a smaller, coherent, polished and deeply interactive stretch of the valley rather than spreading generic props over a vast empty map. Deliver substantial working code, not a new stack of unimplemented design docs. Be forthright about what you completed.

## Handoff summary Claude should return

- Branch, commits and/or PR.
- Exact in-game URL/commands to visit Orchard Vale.
- Screenshots from actual running engine, clearly labeled camera perspectives.
- Implemented asset roster and how content is reusable for the large-world generator.
- Tests run and whether they passed, skipped or failed, with exact errors where relevant.
- Performance characteristics and visual quality weaknesses.
- Which regional lore is still candidate rather than approved canon, and which systems remain placeholders.
