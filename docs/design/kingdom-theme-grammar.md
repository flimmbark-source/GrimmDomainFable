# Kingdom thematic grammar

**Status:** First thematic framework, 2026-11-12. The **core premise is confirmed as D-092**. The parameters, procedural rules and illustrative regions below are **proposals for creator review, not additional approved lore or mechanics**.

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
| **Folkloric relationship** | The local customs and implied boundaries between ordinary people and older forces | Offerings at trees, taboo paths, ritual stones |
| **Supernatural character** | The flavor and intensity of older magic, including benign, unsettling or uncertain elements | Dreamlike groves, peculiar springs, ancestral echoes |
| **Current conflict pressure** | Where Dark operations, corruption sources, Light defenses and contested routes are relevant | Guarded trade junction, corrupted shrine, vulnerable sanctuary |
| **Emotional register** | The balance of wonder, homeliness, melancholy, unease and dread | Warm village at dusk beside a forbidding wood |

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

## Next design workshop, not yet decided

**Choose the older world's relationship to ordinary people.** Are supernatural forces broadly woven into daily life and accepted, distant and treated with rituals/taboos, or varied regionally with a few densely magical places? The answer governs the common world grammar more than a list of biomes does. This remains open for the creator.

Do not silently write new mechanics or numeric per-region probabilities from the examples above. If implementation proceeds before the workshop, use **data-driven placeholders** for culture/folklore/supernatural/conflict/emotional axes, not an invented canonical culture list.
