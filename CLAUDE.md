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

## Current assignment
**Start work on [M0](docs/production/M0-architecture-spike.md)**, tracked by [issue #2](https://github.com/flimmbark-source/GrimmDomainFable/issues/2). This is a narrow running production increment, not the full game and not a disposable artifact.

1. Validate a real local browser 3D build with the currently supported rendering/toolchain APIs.
2. Validate a minimal authoritative server with slots for four Dark and four Light players.
3. Wire a fixed-timestep simulation and typed commands to one real 3D scene.
4. Establish reusable original-stylized asset inputs, actor movement and collision, one autonomous patrol.
5. Demonstrate RTS camera and hero camera technically without deciding how final switches work.
6. Verify on a real browser, run automated tests, commit code, report evidence and limitations.

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
