# Production roadmap and milestone gates

**Last updated:** 2026-11-11. **Status:** M0 code imported from Fable's implementation for independent review in draft PR #5. Its reported tests are not yet independently confirmed here.

The target is a full 4v4 asymmetric action/strategy game. Milestones are cumulative production code, not independent demos. Time-limited Fable usage ends around November 16; that is **not** the full-game deadline.

| Milestone | Deliverable | Dependency / completion gate | Status |
| --- | --- | --- | --- |
| **M0** | Running 3D browser scene, actor/camera proof, seeded simulation, typed protocol, minimal server, art import path, 4v4 slots | Fable reported local tests and browser checks; independent CI and human GPU playtest remain | **IN REVIEW (PR #5)** |
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
Fable reported executing the M0 build and tests on its implementation branch (source commit `606b9e4`). The current integration branch imports its files and is under review. CI status and creator playtest must be recorded separately. Do not claim M0 production-ready on the basis of automated screenshots.

| Milestone | Running build | Tests passing | User playtested | Evidence |
| --- | --- | --- | --- | --- |
| M0 | **Fable reported yes** | **Fable reports 35 unit/integration and 16 browser checks passed** | **No** | [Implementation report](../implementation-status.md), [PR #5](https://github.com/flimmbark-source/GrimmDomainFable/pull/5), GitHub Actions on PR |
