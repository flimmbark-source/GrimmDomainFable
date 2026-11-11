# Grimm Dominion instructions for Claude Code / Fable

Read `README.md`, `docs/decisions.md`, and `docs/production/roadmap.md` before working. The original GDD is valuable source material, but later explicit creator decisions override its contradictions.

## Confirmed game identity (2026-11-11)
- **4 Dark Heroes vs 4 Light Heroes**. This is not a 1v4 game.
- Dark Heroes are **physical playable characters who also command autonomous monster armies** through an RTS-oriented interface.
- Light Heroes use a **switchable/hybrid perspective**. Exact camera modes and switching controls are **unresolved**, so experiment but do not assert final design.
- Light Heroes grow stronger and assault the castle to defeat the Dark Lord. Dark Heroes hunt and prevent that outcome.
- Bots are **permanent features** for solo/co-op and to fill empty slots, not merely developer test dummies.
- **PC browser first**, original **classic Warcraft III-inspired 3D** art direction; no original Warcraft assets.
- Godot, 2D-first prototyping, and mobile-first launches were rejected.

## Current assignment and status
M0 code and automated test evidence exist in [implementation status](docs/implementation-status.md), integrated for review via [draft PR #5](https://github.com/flimmbark-source/GrimmDomainFable/pull/5). Do **not** restart M0 or overwrite newer design decisions. First verify the integrated build and close outstanding review findings from [issue #2](https://github.com/flimmbark-source/GrimmDomainFable/issues/2).

Next engineering focus, after the M0 gate, is authoritative navigation, line-of-sight, perception, stale sightings and server projection from [M1 playtest specification](docs/design/hunting-perception-v1-playtest-spec.md). Keep the M2 energy economy explicit: evil deeds produce one-time drops; landmark and constructible corruption sources raise passive rate (D-017 to D-021).

1. Revalidate the integrated local browser 3D build with the pinned toolchain and current dependencies.
2. Verify that the authoritative server retains slots for four Dark and four Light players.
3. Keep the existing fixed-timestep simulation, typed commands, and real 3D scene working.
4. Check asset imports, actor movement/collision, and the autonomous patrol in a real desktop browser.
5. Verify both experimental camera modes without deciding how final switches work.
6. Run integrated checks and record reproducible evidence, known defects, and remaining M0 acceptance gaps.

Check the installed dependencies and current Colyseus docs rather than copying older incompatible API examples.

## Design/engineering boundaries
- The creator makes material gameplay decisions. ChatGPT drafts gameplay specs and acceptance tests. Fable handles engineering implementation and test evidence.
- Treat behavior from a commit as **implemented behavior**, not proof of approved design intent.
- Maintain `docs/decisions.md` with confirmed, rejected, provisional, and unresolved choices. Never resurrect rejected directions.
- Do not spend long sessions planning without producing running code. Separate known technical risk from uncertain gameplay rules.
- Avoid silent scope creep or unverified claims of a successful build.

## Quality gates
- Simulation separate from rendering and transport.
- Per-player information projection, so clients do not receive opposing secrets; never treat client-reported visibility as authoritative.
- Bot and human commands compatible where feasible.
- Build, typecheck, unit tests, and manual/browser verification required for completion.
- Each milestone ends with source commit or PR, instructions to run, test results, screenshots/capture where useful, list of defects, updated documentation and next steps.
