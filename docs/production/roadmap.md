# Production roadmap and milestone gates

**Last updated:** 2026-11-11. **Status:** M0 implemented and machine-verified; awaiting creator review and a run on real hardware.

The target is a full 4v4 asymmetric action/strategy game. Milestones are cumulative production code, not independent demos. Time-limited Fable usage ends around November 16; that is **not** the full-game deadline.

| Milestone | Deliverable | Dependency / completion gate | Status |
| --- | --- | --- | --- |
| **M0** | Running 3D browser scene, actor/camera proof, seeded simulation, typed protocol, minimal server, art import path, 4v4 slots | Verified local build + deterministic tests + browser proof | **IMPLEMENTED, IN REVIEW** |
| **M1** | One meaningful hunt-and-escape encounter: patrol, sight, hearing, alert, last-known position, search, concealment | M0 game loop + perception tests + visible debug layers | PLANNED |
| **M2** | Two-sided match loop: commander spawns/orders monsters; light hero gains resources/upgrades; castle victory and defeat conditions for short test | M1, explicit design approval for core scoring/revival | PLANNED |
| **M3** | Character identity: Goblin, Alchemist, Knight, Witch power economies; Dark Hero classes; combat/abilities | M2, individual mechanic specifications | PLANNED |
| **M4** | Full 4v4 network matches + bots/reconnect/lobby/seat assignment/team information filtering | M0 authority and M1 perception, validated at eight clients | PLANNED |
| **M5** | Seeded kingdom construction, biome systems, placement, AI navigation, castle assault maps | M2 + M4, reachability and fairness tests | PLANNED |
| **M6** | Content production: original game-ready models/animations/VFX/audio, tutorials, gameplay UX, balancing | Actual playtest evidence and maintained asset pipeline | PLANNED |
| **M7** | Release readiness: accessibility, telemetry, load/performance/security, accounts and deployment | Repeated player tests, stability gates, legal asset review | PLANNED |

These are dependency stages, not strict mutually exclusive calendar phases. Start art pipeline on M0. Start authority and network design in M0; **do not** defer all networking until M4.

## Responsibility boundaries
- **Creator:** final game direction, tradeoff approval, playtesting judgments.
- **ChatGPT:** gameplay-system specs, priority/UX review, acceptance criteria, audit actual evidence.
- **Fable:** architecture validation, implementation, running builds, test/automation, commits.
- Passing automated tests does not establish that a mechanic is *fun*. A gameplay review can reject technically correct behavior.

## First week strategy (not completion promises)
- Nov 11: M0 environment, verified build, architecture, first interactive 3D scene.
- Nov 12: M1 perception, navigation and chasing on a small world.
- Nov 13: M2 resource progression and monster command, first completed match attempt.
- Nov 14: Two-client authoritative synchronization and basic bots, close integration gaps.
- Nov 15: Visually coherent Warcraft-like scene, control feedback, actual playtesting, regression fixes.
- Nov 16: Stabilize existing features; commit tests, build steps, known limitations, handoff to future development.

Move dates rather than pretend a broken foundation is finished.

## Progress evidence ledger
Actual command results and commit hashes only. Details per milestone are in [implementation-status.md](../implementation-status.md).

| Milestone | Running build | Tests passing | User playtested | Evidence |
| --- | --- | --- | --- | --- |
| M0 | Yes: `npm run dev`, and `npm run build` + `npm start`, both from a clean copy | Yes: typecheck clean, 35/35 unit and integration tests, 16/16 headless-browser checks (2026-11-11) | **No** | Code commit `0c15215`; screenshots in `docs/evidence/`. Only software-rendered headless Chromium was available, so real-GPU frame rate is unmeasured |
