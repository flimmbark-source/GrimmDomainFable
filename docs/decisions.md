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
| D-017 | Dark Energy awakening race | The Dark Lord has a **Dark Energy meter** that progresses over time. Evil deeds performed by Dark Heroes **and their minions** accumulate Dark Energy, **accelerating the rate of awakening**. The system is tiered, but thresholds, deed values, caps, and rate formula remain unresolved |
| D-018 | Light Heroes' early-win route | Light Heroes may **breach the Dark Lord's sanctum and slay him before awakening**, ending the conflict in Light victory. If he awakens first, the Light Heroes instead face the awakened Dark Lord **and** the Dark Heroes in a dangerous final battle. Exact vulnerability/defenses of dormant Dark Lord are unresolved |
| D-019 | Light-side awakening sabotage | **Light Heroes can sabotage Dark operations** (such as purifying corruption, disrupting rituals or destroying infrastructure) to **slow the rate of Dark Lord awakening**. Sabotage does **not directly subtract accumulated Dark Energy**. Exact targets, reversibility of rate bonuses and restoration rules are not yet confirmed |

## Provisional engineering direction (requires Fable technical validation)
- Browser-based Three.js + TypeScript renderer/client and Vite toolchain.
- An authoritative Node/TypeScript simulation and multiplayer server, potentially Colyseus (check current 0.18+ docs and actual installed version).
- Client-only React for out-of-game menus/HUD *if justified*; do not introduce it before proving a need.
- GLB/glTF 3D asset pipeline; original or licensed meshes and textures.
- Fixed-timestep simulation, validated commands, and strict per-team information projection.
- Bots and humans submit compatible commands. Bot difficulty and takeover semantics are not yet decided.
- A narrow initial playable test may use a subset of the eight slots, but the full product remains 4v4.

## Unresolved rules (do NOT silently decide these as canon)
1. **Core rule decided by D-015 to D-018:** Dark Lord starts dormant; Light can breach sanctum and kill him before awakening; Dark Energy accrues over time and accelerates through evil deeds of Dark Heroes and minions; awakening triggers Dark Lord + Dark Heroes vs Light Heroes final battle. **D-019 confirms** Light Heroes can slow awakening by sabotaging Dark operations, without directly reversing accumulated Dark Energy. **Unresolved:** meter formula/tiers, eligible deeds and sabotage targets, whether earned rate bonuses are permanent or depend on maintained operations, boss abilities, pre-awakening sanctum vulnerability, post-awakening terminal rules, and whether sleeping influence exists.
2. What camera(s) and controls does each Light Hero have? What triggers switching? How is aiming balanced against high-level RTS control?
3. How does the Dark Hero switch between physical action and macro-command? Does game time continue while commanding?
4. What constitutes Dark victory if Light Heroes die or the awakened boss wins? Revival/elimination rules, disconnects and timeout behavior. Awakening alone **does not** grant Dark victory.
5. Target completed match duration, spawn rules, and other team coordination mechanics. **Confirmed sightings** are shared as alerts; **live Scout vision** remains owner-private per D-012. Other communication and evidence-sharing rules are still open.
6. Exact bot replacement policy: immediately upon empty slot, after disconnection delay, or only at match start.
7. Launch format and deployment hosting details; accounts, identity, payments, and moderation later.
8. Which character and encounter are chosen for the first vertical increment. Goblin + one Dark Commander are a **proposal**, not confirmed.

## Rejected or superseded
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
