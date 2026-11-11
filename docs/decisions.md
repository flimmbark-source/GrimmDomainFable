# Grimm Dominion: Decision register

**Last reviewed:** 2026-11-11
**Authority:** latest explicit creator decisions > approved production specifications > existing implementation > exploratory GDD.

## Confirmed decisions (creator approval, 2026-11-11)

| ID | Decision | Confirmed outcome |
| --- | --- | --- |
| D-001 | Human team composition | **4 Dark Heroes vs. 4 Light Heroes** (eight player slots) |
| D-002 | Dark Hero experience | **Hybrid:** each is a physical playable character **and** commands autonomous monsters from an RTS-level perspective |
| D-003 | Light Hero experience | **Switchable or hybrid perspective/control.** Exact camera modes, transition behavior, and controls are not yet specified |
| D-004 | First delivery platform | **PC browser first.** Other platforms remain future possibilities, not requirements for the first build |
| D-005 | Core match objective | Light Heroes gather power and assault the central castle to kill the Dark Lord. Dark Heroes hunt/stop them before they succeed. Exact elimination and timer rules are unresolved |
| D-006 | Bots | **Permanent solo/co-op support**, plus filling vacant player slots; bots are part of the product, not development-only |
| D-007 | Development workflow | **Claude Code with direct GitHub repository access.** The repository is the single source of truth |
| D-008 | Visual identity | **Classic Warcraft III-inspired original 3D**, exaggerated silhouettes, clear camera readability, painterly gothic fairytale environments. Do not copy protected assets |
| D-009 | Product ambition | Develop the **full game cumulatively**, using narrow verified playable milestones rather than disposable prototypes |
| D-010 | Core gameplay identity | Autonomous dark-side monster armies, incomplete-information hunting/stealth, differentiated Light Hero progression, castle assault |
| D-011 | Engine constraint | **Do not use Godot** for the principal implementation |
| D-012 | Dark-team scouting information | **Shared confirmed alerts, private live vision:** when one Dark Hero's Scout confirms a Light Hero sighting, all four Dark Heroes receive the sighting alert. Only the Scout's owner receives its live vision. An alert is a time-stamped observation, not continuous tracking or team-wide shared vision |
| D-013 | Light Hero stealth foundation | **Universal sight, cover and detection rules for all Light Heroes**, with character-specific modifiers and abilities. Exact per-character differences and tuning values are not yet approved |
| D-014 | Detection feedback | **Environmental and audio cues plus a subtle local attention indicator** for the Light Hero when a monster is noticing them. Exact presentation, timing and tuning remain to be playtested. Do not use this UI to reveal unseen enemy positions |
| D-015 | Dark Lord's core role | **Dormant ruler and ultimate castle objective/final boss.** The four playable Dark Heroes defend him and the castle. The creator finds an active AI-controlled Dark Lord concept appealing, but **has not approved it as a mechanic** |
| D-016 | Awakening outcome | **Awakening begins a dangerous final confrontation, not automatic Dark victory.** The awakened Dark Lord fights alongside the four Dark Heroes against surviving Light Heroes. Exact boss combat mechanics and terminal victory conditions are unresolved |
| D-017 | Dark Energy awakening race | The Dark Lord has a **tiered Dark Energy meter** that fills naturally over time. Individual evil deeds by Dark Heroes **or their minions** each grant a **small, immediate, one-time addition of Dark Energy**. **Evil deeds do not increase the natural accumulation rate.** Exact thresholds, rewards and tuning remain open |
| D-018 | Light Heroes' early-win route | Light Heroes may **breach the Dark Lord's sanctum and slay him before awakening**, ending the conflict in Light victory. If he awakens first, the Light Heroes instead face the awakened Dark Lord **and** the Dark Heroes in a dangerous final battle. Exact vulnerability/defenses of dormant Dark Lord are unresolved |
| D-019 | Light-side awakening sabotage | **Light Heroes can sabotage corruption sources/Dark operations** to slow the **passive Dark Energy generation rate**, without directly subtracting already accumulated energy. Details of eligible targets, restoration and costs remain open |
| D-020 | Corruption source acceleration and correction | **Corruption sources, not individual evil deeds, increase the natural accumulation rate of Dark Energy.** Their active contribution is the strategic target for Light sabotage. This explicitly supersedes the earlier reading of D-017 that every deed permanently increased energy-per-time; source creation, stacking, maintenance, and exact rates remain unapproved |
| D-021 | Two kinds of corruption source | **Hybrid sources:** Dark Heroes can corrupt existing world landmarks for major passive Dark Energy production **and** construct smaller corruption sources at strategically chosen positions. Both raise passive generation while contributing. Landmark lists, construction mechanics, placement limits, rates, maintenance and sabotage interactions remain open |

## Provisional engineering direction (requires Fable technical validation)
- Browser-based Three.js + TypeScript renderer/client and Vite toolchain.
- An authoritative Node/TypeScript simulation and multiplayer server, potentially Colyseus (check current 0.18+ docs and actual installed version).
- Client-only React for out-of-game menus/HUD *if justified*; do not introduce it before proving a need.
- GLB/glTF 3D asset pipeline; original or licensed meshes and textures.
- Fixed-timestep simulation, validated commands, and strict per-team information projection.
- Bots and humans submit compatible commands. Bot difficulty and takeover semantics are not yet decided.
- A narrow initial playable test may use a subset of the eight slots, but the full product remains 4v4.

## Provisional choices made while implementing M1 (need creator review)
Engineering had to pick something to make M1 run. Each is the most restrictive reading of an open rule, is isolated in code, and is **not** approved design. All numbers live in `src/shared/sim/tuning.ts`.

| ID | Choice in the build | Why it needs a decision |
| --- | --- | --- |
| P-1 | Allies always see each other, including allied monsters | A Dark teammate can watch another player's Scout run and infer roughly where a hero is. That is in-world inference, not server-provided tracking, but it softens D-012 |
| P-2 | Vision is per seat: a player sees enemies only through their own hero (and, for Dark, their own monsters). Light heroes do not share vision with each other | Team vision sharing for Light is unresolved rule 5 |
| P-3 | Only **confirmed sightings** are shared with the Dark team. Glimpses, noises and last-seen points go to the Scout's owner only | D-012 leaves other evidence sharing open |
| P-4 | The owner is shown a hero through the Scout only after **confirmation**. Before that the owner gets a "glimpse" marker with no identity | Follows the spec's evidence types; D-012 says "live vision" without saying when it starts |
| P-5 | The Scout on each map is owned by Dark slot 0. No way yet to choose or transfer ownership | Army assignment is undecided |
| P-6 | Heroes see 20 m all round with line of sight. Monsters see a 120 degree arc to 14 m, plus 2 m all round | All tuning |
| P-7 | Sneak (Shift): 45% speed, silent. Running is audible within 7 m. Whistle (F): audible within 16 m, 4 s cooldown | Sneak and whistle are new player verbs added so hearing has counterplay. They are proposals, not approved abilities |
| P-8 | Scout chase speed 4.6 against hero 6.0 | At 5.4 a spotted hero could never escape. At 4.6 cover helps only a little more than open ground. Main experiential risk of M1 |
| P-9 | Caches: stand still 3 s to open, refill after 30 s, opening is audible within 9 m | Placeholder objective so the crossing has a purpose. Not the M2 economy |
| P-10 | A caught hero suffers nothing: the Scout stops beside it | No combat or capture rule exists yet |
| P-11 | Spectators receive only actors the opposing team can currently see | Spectator policy was never specified; this cannot leak |
| P-12 | A commander order overrides whatever the Scout is doing, but does not blind it: it will chase again if it still sees a confirmed hero | "Subject to unit behavior rules" in the spec |

## Unresolved rules (do NOT silently decide these as canon)
1. **Core rule decided by D-015 to D-018:** Dark Lord starts dormant; Light can breach sanctum and kill him before awakening; Dark Energy accrues naturally over time, receives small one-time gains from evil deeds by Dark Heroes and minions, and accrues faster through corruption sources; awakening triggers Dark Lord + Dark Heroes vs Light Heroes final battle. **D-019/D-020 confirm** Light Heroes can slow awakening by sabotaging corruption sources, without directly reversing accumulated Dark Energy. **Unresolved:** meter formula/tiers, qualifying evil deeds, corruption/constructible source types, placement rules, source stacking and maintenance, boss abilities, pre-awakening sanctum vulnerability, post-awakening terminal rules, and whether sleeping influence exists.
2. What camera(s) and controls does each Light Hero have? What triggers switching? How is aiming balanced against high-level RTS control?
3. How does the Dark Hero switch between physical action and macro-command? Does game time continue while commanding?
4. What constitutes Dark victory if Light Heroes die or the awakened boss wins? Revival/elimination rules, disconnects and timeout behavior. Awakening alone **does not** grant Dark victory.
5. Target completed match duration, spawn rules, and other team coordination mechanics. **Confirmed sightings** are shared as alerts; **live Scout vision** remains owner-private per D-012. Other communication and evidence-sharing rules are still open.
6. Exact bot replacement policy: immediately upon empty slot, after disconnection delay, or only at match start.
7. Launch format and deployment hosting details; accounts, identity, payments, and moderation later.
8. Which character and encounter are chosen for the first vertical increment. Goblin + one Dark Commander are a **proposal**, not confirmed.

## Rejected or superseded
- Earlier D-017 wording that **every evil deed increases the passive awakening rate** is expressly replaced by D-017 (instant small reward) and D-020 (rate increase from corruption sources). Do not recreate that obsolete mechanic.
- Godot as the main game platform.
- A 2D-first prototype that postpones the Warcraft-inspired 3D foundation.
- A one-versus-four final game structure, superseded by explicit 4v4.
- Treating mobile as the immediate first platform, superseded by PC browser first.
- Bots as development-only tools, superseded by permanent bot support.
- Mock scenes, screenshots, or untested code reported as a playable milestone.

## Change control
- Record creator-approved rules with their exact language and the date.
- An engineer may choose low-impact implementation details, but gameplay or platform changes that contradict this register require creator approval.
- The original [GDD](https://docs.google.com/document/d/1Z7alNg7ctLDKWcgnc99XwshO_XdkkZ8l/edit) is a historical concept source, not the final authority on conflicts.
- Fable must update technical status separately from design decisions; code behavior does not prove design intent.
