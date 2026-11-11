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

## Engineering direction (validated by M0, 2026-11-11)
Implemented and tested; details and exact versions in [architecture.md](architecture.md). These are engineering choices, changeable without a gameplay decision.
- Three.js 0.187 + TypeScript 7 browser client on WebGL2, built with Vite 8. **Validated.**
- Authoritative Node/TypeScript server on Colyseus 0.18 for rooms, sessions and the fixed timestep. **Validated.** Colyseus schema state sync is deliberately not used; each client receives its own projected snapshot.
- Fixed 30 Hz deterministic simulation, validated commands, per-viewer information projection. **Validated** (public transforms only; real visibility is M1).
- Bots and humans submit the same command type through the same queue. **Validated** with a trivial wandering bot. Bot difficulty and takeover semantics are not decided.
- GLB/glTF asset pipeline with procedural placeholders behind one asset-id interface. **Validated** with one imported GLB. All art original.
- No UI framework yet; the HUD is plain DOM. React remains an option if menus justify it.
- Still provisional: delta compression or `StateView` for snapshots (measure at M4), pathfinding approach (M1), hosting and deployment.

## Unresolved rules (do NOT silently decide these as canon)
1. What exactly is the Dark Lord in the final castle: a vulnerable NPC/objective, a temporarily playable entity, or another game-controlled actor, given four Dark Hero players?
2. What camera(s) and controls does each Light Hero have? What triggers switching? How is aiming balanced against high-level RTS control?
3. How does the Dark Hero switch between physical action and macro-command? Does game time continue while commanding?
4. What constitutes Dark victory if Light Heroes die? Revival/elimination rules, disconnects, and timeout/corruption behavior.
5. Target completed match duration, spawn rules, team coordination mechanics, and asymmetric information sharing.
6. Exact bot replacement policy: immediately upon empty slot, after disconnection delay, or only at match start.
7. Launch format and deployment hosting details; accounts, identity, payments, and moderation later.
8. Which character and encounter are chosen for the first vertical increment. Goblin + one Dark Commander are a **proposal**, not confirmed. (M0 draws generic Light/Dark hero placeholders and one patrol beast; this implies no choice.)

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
