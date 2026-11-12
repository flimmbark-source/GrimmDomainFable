# Kingdom thematic grammar

**Status:** First thematic framework, 2026-11-12. The **core premise is confirmed as D-092 and regionally varied relationships with old magic are confirmed as D-093**. Detailed parameters, procedural rules and illustrative regions below remain **proposals for creator review, not additional approved lore or mechanics**.

## Confirmed identity and limits

**The kingdom:** an inhabited, recognizable fairytale realm, with villages, roads, livelihoods, traditions and warmth, existing within and alongside an older, stranger supernatural world. The Dark Lord's expanding influence threatens and unsettles this relationship. It should have a life and identity separate from the conflict, and should hold wonder as well as menace.

**Already confirmed:** Warcraft III-inspired but original readable 3D painterly gothic-fairytale silhouette language (D-008), hero identities, Dark armies, the dormant/awakening Dark Lord race, meaningful corruption sources and reclaimable sanctuaries, Witch pilgrimage/shrine intuition, Alchemist biome discovery, partly charted landscape, guided procedural generation, meaningful journeys and coherent regions (D-015 through D-023, D-050 onward, D-076 onward, D-084 through D-091).

**Not automatically confirmed:** the kingdom's founding story, whether the Dark Lord governs it politically, the origin and moral alignment of older magic, pantheons, exact folklore cultures, or dynamic corruption aesthetics. Do not invent these as facts or implement new transformations from illustrative prose.

## Three globally consistent layers

1. **Human/fairytale civilization:** recognizable settlement culture and everyday life. Each region needs reasons for roads, buildings, livelihoods, institutions, conflicts and customs. It should be plausible that people lived there before the match.
2. **Older supernatural world:** preexisting sacred places, strange boundaries, taboos, folk beliefs and encounters, not just random glowing objects. It should sometimes be beautiful or ambiguous, not a synonym for Dark corruption. Precise supernatural logic needs creator approval.
3. **Current Dark pressure:** contested and corruptible landmarks, Dark infrastructure, patrols and local consequences sit on top of the first two layers. Dark control must not erase all local distinction. Purification/defense can restore strategic Light opportunity without implying an unapproved world-color-change mechanic.

This layering distinguishes *old and strange* from *currently corrupted*. A haunted well could be ancient folklore even when it is not Dark-controlled. A crossroads fortification could be Dark-occupied without every nearby tree becoming black.

## Six proposed regional parameters

| Dimension | What it controls | Examples (not canon) |
| --- | --- | --- |
| **Physical ecology** | Terrain, weather cues, vegetation, material availability, travel visibility and natural hazards | Wet river valley, beech woodland, upland moor |
| **Civilian footprint** | Settlement pattern, work, trade, construction density, maintenance and abandonment | Orchard hamlets, timber camps, quarry roads |
| **Folkloric relationship** | **D-093:** communities differ in how familiar, accepting, fearful, distant, skeptical or forgetful they are about older forces; local customs and practices should express these differences | Welcoming household customs, respected taboo paths, forgotten ritual stones (examples only) |
| **Supernatural character** | The flavor and intensity of older magic, including benign, unsettling or uncertain elements | Dreamlike groves, peculiar springs, ancestral echoes |
| **Current conflict pressure** | Where Dark operations, corruption sources, Light defenses and contested routes are relevant | Guarded trade junction, corrupted shrine, vulnerable sanctuary |
| **Emotional register** | The balance of wonder, homeliness, melancholy, unease and dread | Warm village at dusk beside a forbidding wood |

### Regional relationship to old magic (confirmed variable D-093)

The setting does **not** impose one degree of magic familiarity everywhere. Regions and communities vary, and the **same biome** can support different attitudes depending on livelihoods, history, nearby landmarks and cultural exchange. Designers should be able to represent at least these *potential*, nonexclusive relationships without treating them as required categories or fixed percentages:

- **Familiar/coexistent:** unusual forces are acknowledged as part of daily life, and local practice is pragmatic rather than necessarily reverent.
- **Respectful/distant:** residents believe old powers exist, but interact mainly through customs, boundaries, warnings and rituals.
- **Fearful/avoidant:** legends and lived experience encourage protective behavior, detours or abandonment.
- **Forgetful/skeptical:** people dismiss, reinterpret or simply no longer remember older practices despite evidence in the surrounding landscape.
- **Internally contested:** generations, professions or neighbors differ, leaving visible contradictions in what people maintain and avoid.

These are suggested descriptors, **not a one-of-five enum or a guarantee that communities have scripted conversations**. More importantly, a region's attitude must not be assumed to equal its amount of actual magic, and neither variable equals the severity of current Dark corruption.

#### Proposed causality and world-building hooks

For a potential region, derive attitude from the interaction of **historical experience, living traditions, access to supernatural sites, neighboring communities and present conflict**. Express it via settlement form, path maintenance, shrine upkeep, symbolism, household details and clues rather than expository text alone.

Illustrative comparison for exactly the same older supernatural feature: a spring might be integrated into a village's daily gathering traditions, avoided behind a stone boundary by another settlement, and forgotten beneath a ruined road elsewhere. Each case would alter environmental storytelling and perhaps optional exploration incentives, **not automatically change confirmed gameplay mechanics or shrine rules**.

**Generation gate:** two regions with equally dense woods and the same actual supernatural presence may still look and feel culturally different. Conversely, a highly supernatural landscape may surround a skeptical settlement. The generator should combine correlated world parameters, not equate `biome=forest` with `attitude=superstitious` or `magic=Dark`.

The six must correlate plausibly, not each be chosen independently. A waterlogged valley should influence building materials and transport. A trade town needs usable connections. A strong supernatural signature needs environmental storytelling that explains why people treat the site unusually.

**Region identity recipe:** a place = geography + human use/history + local folklore + current conflict + memorable visual motifs + gameplay affordance. The exact generator data schema is engineering design, not yet fixed.

## Proposed generation hierarchy

**Kingdom invariants:** one fairy-tale realm, plausible civilization, older supernatural layer, rising Dark pressure, coherent readable original art direction. These should remain recognizable across different seeded matches.

**Regional identity:** select ecologically coherent regions and assign geographically compatible patterns of livelihood, folk beliefs and supernatural character. Vary regional arrangements and particular customs from seed to seed while keeping common cultural/visual threads.

**Landmark identity:** generate or choose a *reason* for each place to exist before choosing props. A bridge for trade, a hill shrine for pilgrimage, a mill for a local economy. Then layer history, folklore, clues and possible Dark strategic use. Corruptible sites must be compatible with approved control systems, not newly invented bonuses.

**Local encounter design:** roads, cover and landmarks must retain functional LOS, concealment, approach choice, discoverability and navigation. Gothic decoration never justifies visually opaque but game-transparent geometry. Dark Scout information boundaries remain as approved.

**Environmental storytelling:** visual details should communicate the place's prior function and present changes, with navigational landmarks and repeated regional motifs. Avoid using text lore or quest exposition as the only source of identity.

## Three deliberately provisional places

**1. Orchard valley:** a settlement cluster with old orchards, mills, cartways and domestic warmth. Beneath the everyday life is a tradition of tying ribbons to an ancient boundary tree; perhaps a Dark patrol now guards the bridge. Affects trade-route choices and stealth opportunities. Not a fixed biome or mandatory ribbon mechanic.

**2. Deepwood:** scattered charcoal-burner huts, abandoned paths and deeply rooted legends; a sacred clearing feels older than any settlement. Witch investigation and cover-based pursuit might overlap here. The distinction between ancient spiritual unease and current Dark control should be clear.

**3. Stony uplands:** quarry road, weathered watchtower and half-forgotten standing stones. High visibility on exposed road versus shelter in ravines creates strategic choice. Terrain elevation effects remain unimplemented and should not be assumed to function until nav and LOS support them.

Across seeds these sites' arrangement, resources, details and even exact identities can change; no named locations are permanent canon yet.

## Aesthetic discipline

- **Readable fairytale silhouettes first:** distinctive rooflines, trees, roads, landmarks and monster profiles that read from the actual elevated strategy camera. Avoid photorealistic noise and muddy low-contrast environments.
- **Shared material logic:** regional wood, stone, plaster, metal and cloth can vary but should still feel like connected people and trade routes belong to one kingdom.
- **Warmth and dread in contrast:** reserve some places for color, activity and refuge, some for uncertainty, some for high threat. Permanent darkness everywhere weakens each individual frightening place.
- **Place-specific motifs:** a few repeating environmental cues per region should support recognition and navigation more than dozens of random spooky assets.
- **Folklore is not decoration alone:** customs, shrines and superstitions should eventually connect to discovery, choice or systems, but specific effects require separate creator approval.
- **Original visual identity:** the Warcraft III reference describes 3D readability/painterly exaggeration, not permission to reuse its symbols, architecture, races or assets.

## Parameter evaluation gate before production world content

For every generated region, ask:
1. Could someone explain what lives/used to live here and why?
2. What is older than the settlement, and how is that legible?
3. How has the current struggle changed what players can do there without making the region generic?
4. Does the area have at least one visually memorable identity from the actual game camera?
5. Does its geography support its roads, trade, cover, navigation and approved character opportunities?
6. Is it distinguishable from neighboring regions and still clearly part of the same kingdom?

A generator passing graph connectivity and biome labels alone **does not pass this thematic gate**.

## Confirmed parameter and next thematic work

**D-093 selects the regionally varied relationship.** The team should now test the thematic grammar by developing a few **distinct regional identity sheets** using ecology, livelihood/history, local relationship to old magic, actual supernatural phenomena, current Dark pressure, mood and tactical affordances. These should be candidate examples for creator review, not immediately canonical regions or generated content.

**Important next unresolved question:** how does **Dark influence manifest within the already inhabited, magically varied world**? Confirmed corruption sources control strategic Dark Energy, but specific physical/cultural consequences and how local people respond have **not** been approved. Define that before requiring corruption visual variants in the production generator.

Do not silently write new mechanics or numeric per-region probabilities from the examples above. If implementation proceeds, use **data-driven placeholders** for culture/folklore/supernatural/conflict/emotional axes, not invented canonical culture lists.
