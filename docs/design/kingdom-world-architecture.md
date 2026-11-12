# Kingdom geography and large-world architecture

**Status:** D-084 confirms a huge, seamless, interconnected kingdom as the end-state target. **D-085 confirms guided procedural geography:** each match can generate a substantially different kingdom while preserving designed strategic relationships and playability. This brief separates confirmed principles from proposals. No particular geographic topology, map size or generation algorithm is approved yet.

## Confirmed design boundaries

- Four Light Heroes oppose four embodied Dark Heroes who also command autonomous monsters. Incomplete information and line-of-sight hunting are essential (D-005/D-010/D-012 through D-014).
- The central castle contains a dormant Dark Lord, and the Light team may mount an early assault or face an awakened final confrontation (D-015 through D-018).
- The Dark team may corrupt existing landmarks and construct smaller corruption sources. Light sabotage suppresses future Dark Energy generation, never removes banked energy (D-019 through D-021).
- Purified sanctuaries, Witch shrine rituals and Light revival create multi-purpose landmarks (D-050 onward).
- The Goblin needs hidden tavern access, treasure/heist targets, Dark supply facilities and transport operations (D-063 through D-075).
- The Alchemist needs distinct biomes with early useful ingredients and deeper rare opportunities under run-specific randomized properties (D-076 through D-083).
- M1 creator feedback is positive specifically about breaking Scout line of sight to escape. Preserve this behavior at large scale.
- D-084 establishes **one traversable, strategically interconnected kingdom**, not separated encounter maps.
- **D-085 approves guided procedural geography**: substantially varied match-specific roads, regions, settlement and landmark layouts within stable strategic/gameplay constraints. Generation must preserve accessibility, fair opposing opportunities, meaningful routes and seeded authoritative determinism. The exact geography graph remains unapproved.

## Proposed strategic geography (not canon)

- **Castle and approaches:** strategically identifiable, defensible, vulnerable to early assault under appropriate circumstances, approached along meaningful routes rather than a compulsory singular corridor.
- **Settlements and trade routes:** places for witnesses, commerce, patrol movement, logistical dependencies and the Goblin's personal activity.
- **Wilderness:** forests, marshes, ravines and remote biomes offer hiding, gathering and alternate movement. Actual terrain and cover must affect real line of sight, not just appearance.
- **Contested landmarks:** shrines, corruption nodes, sanctuaries, supply depots and routes can change which parts of the world matter across a match.
- **Natural barriers:** rivers, passes, cliffs and bridges introduce valuable chokepoints, but must not accidentally create uncounterable map denial or permanently block necessary progression.

## Guided procedural generation (D-085) and topology-first implementation proposal

**Confirmed intent:** strategic playability constraints shape generated geography, while the resulting kingdom may differ substantially between matches. The specific algorithm below is a **proposal, not approved implementation**.

First establish relationships among strategically important sites, settlements, routes and region types. Then fit believable landscape and local gameplay geometry around these relationships, subject to navigation and fairness constraints.

Think at three interconnected scales: strategic travel between important places; regional path choices and flanking; local stealth cover/occlusion. These are planning scales **inside one seamless world**, not loading-screen zones.

Prove each route is traversable, objectives remain reachable, the early Dark Lord assault is plausible but dangerous, stealth alternatives exist where intended, and long-distance consequences remain relevant. A huge landscape full of empty travel is not automatically better.

## Existing implementation and future engineering constraints

The M1 map has a flat 60 by 60 metre playable square, one MapDef with collider/prop arrays, pathfinding grid over that square, and distant non-collidable scenery including the castle. M1's authoritative server, seeded behavior, geometry-driven collision, Scout perception, and per-viewer information filtering must survive.

Future work requires a world-level data representation, region/chunk spatial indexing and streaming, long-distance navigation composed with local nav, world persistence, scalable rendering/asset instancing and legitimate level-of-detail, and a server simulation that retains consistent distant strategic outcomes without exposing secret locations.

Chunk boundaries must never create movement holes, invisible sight blockers, omniscient enemy knowledge or artificial load-screen breaks. Do **not** create a giant monolithic nav grid simply by increasing the current halfSize. Keep gameplay and rendering geometry coherent. Delay verticality until authoritative movement, occlusion and navigation correctly support it.

## Work sequencing

Design the world architecture and strategic geography constraints before adding systems built on small-arena assumptions. Preserve the current M1 playtest and M2 acceptance gates. A connected, diverse vertical slice is an **engineering proof of continuous traversal**, not the proposed final world size. Full seeded kingdom construction and content breadth can expand after the foundation is validated.

## Confirmed geography generation choice D-085

**Selected C: guided procedural geography.** The kingdom is broadly reshaped between matches within gameplay and world-coherence constraints. Reject the implication that all locations have fixed positions, or that arbitrary raw noise is sufficient to produce a working 4v4 world.

## Next design choice: strategic topology (UNRESOLVED)

**A. Castle-centered radial routes:** main roads lead inward toward the Dark Lord's castle with interconnected peripheral roads; risks funneling travel toward a predictable center.

**B. Distributed geography:** several regional hubs and branching routes, with the castle as one important destination among them spatially (although the central victory objective); offers organic movement but could reduce the castle's orienting role.

**C. Hybrid backbone and regional networks:** the castle anchors several strategic approaches, while multiple outer roads, wilderness corridors, and regional hubs form independent loops, flank opportunities, and competing objectives. Its exact position need not be the geometric center.

**Recommendation, not yet approved: C**, provided the generator can test route diversity and travel pacing. This fixes strategic relationships rather than a specific layout.

Unresolved: world size/travel times, terrain heights, changes between matches, settlement densities, landmark and secret site placement, caves/interiors, supply routes, darkness/visibility and long-distance player activity.
