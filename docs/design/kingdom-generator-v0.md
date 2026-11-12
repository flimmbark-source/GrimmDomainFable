# Kingdom generator v0: architecture and first proof

**Status:** Proposed engineering/design specification for a **non-destructive world-generation proof**, not a confirmed implementation algorithm or authorization to replace the current M1 world. Last written 2026-11-12.

**Design authority:** D-084 large seamless kingdom; D-085 seeded guided procedural geography; D-086 castle approaches plus independent regional loops; D-087 journeys with discoveries/risks/opportunities; D-088 partial starting map; D-089 shared baseline chart with personal role clues; D-090 layered information sharing; D-091 coherent biomes with smaller unusual pockets. Existing stealth, Dark Scout information and class progression decisions remain in force.

## Goal

Produce many different **coherent strategic kingdom layouts** from authoritative seeds, each with a traversable castle objective, major travel network, settlements/points of interest, regions and biome labels, meaningful alternate paths, and no obvious progression dead ends. Prove correctness before terrain rendering, content scale, and gameplay-system migration.

This is a **vertical architecture proof**, not a small final kingdom: v0 can render a debug map and inspect graph/region data. The production world remains one continuous traversable environment. Region IDs and graph nodes are organizational aids, **never loading-screen levels**.

## Proposed first deliverables

1. **Pure world-plan types and generator**, separate from Three.js, DOM, Colyseus, time and network. Proposed modules (names flexible): `src/shared/world/types.ts`, `generate.ts`, `validate.ts`, `tests/world-generator.test.ts`. The creator has approved the design goals, **not the exact modules**.
2. **Seeded strategic topology:** one castle location (as match victory anchor, not necessarily map center), several region hubs, primary roads connecting castle approaches, outer connections/loops, wilderness alternatives and strategic locations. Region count and road-count targets are **tuning parameters for experiments, not canonical values**.
3. **Region map with coherent biome distribution:** contiguous region-scale environments, adjacency constraints/transitions, and optional small exceptional pockets. Biome labels and seed data support later ecological generation without immediately implementing slope simulation, interiors or climate physics. Do not freeze an arbitrary final biome roster.
4. **Location/opportunity metadata:** typed placeholder categories for settlement, major corruption-capable landmark, shrine, logistics site, castle approach, class-relevant exploration opportunity, and neutral/hidden locations. They are **placement constraints**, not implementations of rituals, recipes, tavern, or corruption mechanics.
5. **Debug visualization/evidence:** inspector of generated graph/regions, roads, and chosen seed, with geography-vs-personal-discovery classification. This is developer-only and must **not** expose private data in production clients.
6. **Automatic validator and report:** one command generates a range of seeds, checks hard constraints, reports diversity/connectivity failures with reproducible seeds and a compact layout summary.

## Generation pipeline: proposed order, not yet a mandated algorithm

A. **Seed + world configuration**. Use only server-authorized seed and typed tunable configuration. Important: do not publish the PRNG state or a seed to clients in a way that lets them reconstruct undiscovered secrets. Keep actual world construction canonical on server.

B. **Strategic graph**. Choose major hubs, castle anchors and main roads. Add independent outer links and wilderness corridors according to D-086. Do not require castle at the coordinate center or every route to cross a single hub.

C. **Large-scale geography**. Shape regions, rivers/valleys/uplands, and biomes so geography explains roads and connections. If elevation is deferred, use explicit geography attributes rather than painting hills as if they already affect movement.

D. **Points of interest and progression accessibility**. Place intended strategic and class opportunity categories without hard-coding specific recipes or abilities. Validate safe opening opportunities for every Light Hero and meaningful Dark defenses/corruption targets. The exact per-hero placement requirements require separate gameplay-spec approval.

E. **Local route/encounter geometry**. Once the strategic proof passes, construct local traversable geometry and actual sight/cover arrangements along routes, including optional variants of the proven forest crossing. Encounter design must be tested in the real simulation, not inferred from abstract graph edges.

F. **Validate/reject/retry deterministically** with bounded attempts and explicit failure. Never silently return an unfair or unwalkable seed. Same seed + configuration + generator version must yield the same layout and rejection history.

## Required invariant checks

- **Connected traversal**: every major required site has a legal route from relevant starting areas. No isolated components; cannot spawn trapped inside a collider.
- **Not a radial-only funnel**: at least some independent regional routes and viable castle approaches, with no *unavoidable* single road as the only route for all meaningful progression. Exact thresholds are adjustable, not yet creator-approved.
- **Meaningful journey potential**: paths have space for route decisions, risks, discovery opportunities and alternate exposure levels. Do not fake engagement by timed random encounters or quantity-of-props targets.
- **Coherent biomes (D-091)**: majority of ordinary terrain belongs to spatially legible regions; transitions are justified, with optional unusual pockets. Test spatial coherence, not merely count of biome labels.
- **Viable class opportunities**: ensure some early resource-access paths and later advanced opportunities relevant to confirmed class loops. Alchemist early useful ingredients must remain possible, with stable principles but run-variable affinities (D-079 through D-081). Do not invent guaranteed named ingredient pairings.
- **Fair strategic response**: Dark can patrol/guard strategic routes; Light can meaningfully avoid, infiltrate or choose other objectives. Do not assume symmetric travel times or identical class start states without design authority.
- **Information security**: broad known geography is distinct from discoverable secondary geography and private clues. A world-plan API must not broadcast all hidden sites or live enemy positions. Preserve D-012 private Scout vision and shared confirmed alerts across region boundaries.
- **Cross-boundary behavior**: actors can move, pathfind, spot, lose sight and search across region boundaries without teleporting, sight leaks or path gaps. No camera or simulation assumption depends on `halfSize: 30`.
- **Determinism and reproducibility**: regenerate identical worlds for the same seed/config/version; differing seeds generate meaningfully different layouts, with no change to authoritative sim rules.

## Engineering guardrails

**Current M1:** `src/shared/sim/map.ts` defines a 60 m flat forest crossing with one `MapDef`; `nav.ts` creates a single whole-map grid; `src/client/render/world.ts` places non-interactive surrounding forest and distant castle. Per-viewer projection and simulation are already authoritative, but no giant-map streaming or terrain-aware AI exists.

Do **not** increase `halfSize` to simulate the large kingdom. Avoid monolithic navigation grids, giant physics arrays, global per-frame scanning, all-at-once Three.js meshes and copying all world-plan content into every client snapshot.

The later production architecture should support global coordinates, spatial indexing, local and long-range nav, independent rendering chunks/LOD and persistent authoritative state. Maintain one continuous simulation and make regional simulation optimizations only when they preserve deterministic and observable behavior. Build API boundaries with future streaming in mind; **do not claim streaming or terrain elevation is finished in v0**.

**Map knowledge**: define separate representations for (1) authoritative hidden geography/world state, (2) public initial chart, (3) same-faction discovered public geography, and (4) player-private specialty hints/strategic intelligence. D-090 sharing is not permission to show all records. Preserve signed/validated server-side authority over what can be revealed.

**Existing code safety**: first add new generator and validation as an isolated module or feature-gated visual inspector. Keep M1 playable and its pursuit/line-of-sight, camera, unit tests and browser verification regression-safe. Avoid mass renames or an immediate complete renderer rewrite.

## Creator-facing acceptance demonstration

- Demonstrate at least several visibly different seeds in a debug geography view. Record seeds and use a reproducible replay/input.
- Pick one seed and show a route from a Light starting area, through woodland and a settlement/landmark, to a defensible approach to the Dark castle, with at least one alternate travel route that doesn't require the same intermediate hub.
- Show which information would be present on the shared starting chart versus what would be discovered later versus private hero hints, without exposing enemy state through the actual client protocol.
- Provide validator output including connected components, route alternatives, critical site reachability, biome spatial coherence and any rejected/failed seed.
- Execute typecheck, build, relevant tests, and the existing M1 pursuit tests. Report exact passed/failed counts, no fabricated verification.
- Prove **one real cross-region gameplay transition** with M1 stealth/Scout logic before migrating the full game onto generated geography. A diagram alone is **not** that proof.

## What is deliberately not decided by this brief

Exact dimensions, region count, road network algorithms, ratios of wilderness to settlements, biome set, altitude model, travel times, transportation and movement boosts, map reveal radius, intro/tutorial, battle balance, gameplay metrics, or whether rare resources are bound to particular named biomes.

These are measurable tuning and design questions for later playtesting, not values for the generator author to silently turn into canon.

## Immediate handoff request for Fable / Claude

Implement **Phase 0 only**: pure types, reproducible seed-based strategic graph, coherent biome-region metadata, ordinary/secret site categorization, a validator with deterministic failure reporting, and a small developer inspector. Start by summarizing architectural risks in the existing M1 map/nav/perception implementation. Keep all existing gameplay behind the current map and preserve its tests. If changing runtime wiring is required, propose the exact smallest change before making it. **Do not** switch default matches to the new generator or interpret this document as acceptance of a specific fixed geography.
