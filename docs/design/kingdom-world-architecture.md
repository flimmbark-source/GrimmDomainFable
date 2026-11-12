# Kingdom geography and large-world architecture

**Status:** D-084 confirms a huge, seamless, interconnected kingdom as the end-state target. D-085 confirms guided procedural geography. **D-086 confirms hybrid strategic topology: castle approaches plus independent regional connections and loops. D-087 confirms deliberate, eventful journeys between major regions. D-088 confirms partially known starting geography with exploration-based discovery of secondary routes and secrets. D-089 confirms common baseline geographic knowledge with character-specific starting hints. D-090 confirms layered team sharing of discoveries. D-091 confirms coherent biomes with smaller unusual geographic pockets.** This brief separates confirmed relationships from proposals. No specific geographic layout, map size, road count or generation algorithm is approved.

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
- **D-086 approves hybrid topology**: the castle anchors several major approaches, while regional hubs, outer roads and wilderness corridors provide independent loops, routes and flanking opportunities. The castle need not occupy the geometric center. The precise arrangement changes with the seed under D-085 and no fixed route count is approved.
- **D-087 approves meaningful journeys:** travel between major regions should give players discovery, risk, optional opportunities and real routing decisions; do not treat distance as filler or require a pre-approved transportation system. Actual scale and duration remain unchosen.
- **D-088 approves a partially charted starting map:** broad geography and major destinations are known; secondary routes, hidden sites and other lesser-known opportunities are discovered by travel or clues. Static map knowledge is distinct from current enemy position, patrol behavior, faction intelligence and sight-based information.
- **D-089 approves a shared starting chart plus specialty clues:** all eight players start from the same broad geographic map while individual characters may receive extra role-relevant hints. Hints do not grant live enemy positions, automatically expose enemy secrets, or imply full accuracy. Exact content, communication and reveal rules remain undecided.
- **D-090 approves layered sharing:** ordinary public geography discovered by a player updates the allied faction's map automatically, while personal class clues, unverified hypotheses and sensitive intelligence stay private until deliberately communicated. D-012 confirmed Dark Scout sighting alerts are shared regardless, with live Scout vision owner-private.

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

## Confirmed strategic topology (D-086)

**Selected C: hybrid castle approaches plus regional networks.** Major roads create strategic approaches to the castle, while other regional connections, outer road loops and wilderness alternatives allow meaningful cross-kingdom travel without forcing everyone through a central intersection. The castle's position is free to vary with the seed: it is **strategically central as the ultimate objective**, not necessarily geometrically central.

The generator should test that major destinations are connected, that a single road cannot inevitably monopolize all movement, that geography gives Dark logistics defendable places with alternatives available to Light where intended, and that the M1 cover/chase encounter remains legitimate along routes. Exact minimum route counts, travel speeds and thresholds remain to be approved.

## Confirmed travel experience (D-087)

**Selected B: meaningful journeys.** Moving between important regions should feel like a deliberate expedition, with worthwhile discoveries, dangerous stretches, and optional objectives that can affect what players do next. Distinct roads, wilderness approaches and settlements should offer varying risk and opportunity. This is an experiential target, **not** a minimum journey duration, fixed encounter interval, random ambush system, stamina mechanic or categorical rejection of future transportation.

The world generator should validate that major paths have meaningful activity opportunities and counterplay, but not force events on a timer or compromise the hidden-information system. Any travel content should connect to approved class-specific resource gathering, stealth/scouting, logistics and corruption gameplay.

## Confirmed partial starting knowledge (D-088)

**Selected B: partially charted kingdom.** At match start, players have an orienting map of the broad terrain and significant destinations. The secondary road network, minor landmarks, hidden opportunities and secret sites require exploration, investigation or clues. This is not a requirement that every undiscovered road be visibly fogged in the physical world, or that specific characters have omniscient knowledge of secrets. Distinguish geographical knowledge from live visibility and information about enemies: map discovery may reveal a road without identifying a Scout, the location of a Dark army, or who currently occupies a site.

**Unresolved implementation questions:** starting map resolution and symbols, local geometry reveal, what counts as discovered, whether discoveries persist across deaths or a match, team and role-specific cartography, sharing of map knowledge, and update rules for stale information.

## Confirmed starting knowledge differences (D-089)

**Selected C: common baseline chart, character-specific clues.** Both Light and Dark players see the same broad geographic layout and major destinations initially. Characters can also begin with specialty-related hints about possible discoveries, landmarks, or opportunities. A hint can guide exploration without guaranteeing a precise position or revealing enemy movement, current control, or hidden opposing locations. It does **not** replace the confirmed live sight, clues, and private Scout-owner perception boundary of D-012.

**Examples for exploration, not yet approved:** the Alchemist might recognize where certain ingredient habitats could be found, the Witch might suspect that a district has a sacred history, or a Dark commander might know that an established road serves an important logistics corridor. Do not codify these as guaranteed starting facts without another design choice.

## Confirmed team discovery sharing (D-090)

**Selected C: layered sharing.** Ordinary public road and landmark discoveries automatically populate the same-faction exploration chart. Personal character clues, hypotheses and sensitive reconnaissance are not automatically broadcast. Their owners can share them deliberately, through an interaction to be designed.

**Security and intelligence boundary:** D-012 overrides any generic sharing scheme for Dark Scout confirmed sightings: every Dark player receives the time-stamped confirmed alert; only the Scout owner has live Scout vision. Updating the map must not reveal hidden enemies or formerly secret opposing locations simply because the map geometry becomes known. A road is not proof of who's currently using it.

**Implementation still open:** exact geography/sensitive-info classification, choice of sharing gestures, inaccuracies and staleness, cooperation UX, reveal radius/detail, and persistence/reconnection.

## Confirmed biome structure (D-091)

**Selected C: coherent geographical regions with smaller unusual pockets and transition zones.** Biomes should make sense as broad landscapes shaped by terrain, water, climate and human activity. A match may contain a woodland mass with streams and outlying marshland, a settled valley bounded by higher ground, or smaller atypical environments nested within a larger region. These are **examples**, not a fixed biome roster or mandated geography.

Keep regional geography compatible with D-087 meaningful journeys and D-081 ingredient discovery: starting areas must permit useful Alchemist experimentation; advanced opportunities may require reaching unusual/distant/dangerous environments. Important Light routes, shrine opportunities, Dark logistics and castle approaches must remain traversable and strategically consequential.

A coherent biome is **not** a single homogeneous scenery texture. Its boundary may include gradual ecological transitions, natural obstacles and small exceptions. Pockets are optional surprises, not guaranteed fixed ingredient troves, automatic quest markers or a predetermined rarity tier.

**Unknowns:** biome list/placement quantities, climate and hydrology algorithms, height integration, pocket spawn probabilities, terrain traversal effects, and exactly which resource/character mechanics occur in which environments.

## Next deliverable: generator architecture and proof (SPECIFICATION, NOT IMPLEMENTATION)

See [kingdom generator v0 technical brief](kingdom-generator-v0.md). The first task is a deterministic generator for a continuous, traversable topology with region and biome metadata plus structural validity tests. It must not be sold as a finished world, bypass M1 tests, or quietly replace the current playable arena.


Unresolved: exact world size/travel time and potential transportation, starting map detail, hint accuracy/content and sharing UI, road hierarchy and route-count guarantees, terrain elevations, settlement density, landmark and secret site placement, caves/interiors, supply routes, visibility/discovery, and long-distance activity.
