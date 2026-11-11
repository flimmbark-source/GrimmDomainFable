# M0 — Browser 3D + authoritative simulation feasibility spike

**Status:** READY FOR FABLE · **Owner:** Fable/Claude Code · **Review:** creator + ChatGPT
**Goal:** Validate the production technology and deliver the *first running increment in the real repository*. This is not a mockup or throwaway prototype.

## Non-negotiable requirements
Read [decisions](../decisions.md) first. This game is 4v4, PC browser first, classic Warcraft III-inspired **original 3D**, with physical Dark Heroes who also command armies, switchable/hybrid Light Hero experience, and permanent bot support. Do not implement the older 1v4, mobile-first, 2D, or Godot variants.

## Tasks in order

### 0. Verify toolchain and architecture
1. Inspect the empty repo and confirm runnable local Node + browser toolchain.
2. Test a *small, real* Three.js/Vite/TypeScript scene. Verify WebGL/browser GPU requirements and performance.
3. Evaluate Colyseus (current official API) versus a minimal authoritative websocket server for the **long-term** 4v4 project. Favor a proven implementation if the spike succeeds.
4. Commit the chosen stack, exact dependency versions and lockfile, and `docs/architecture.md`. Explain why it supports eight sessions, bot players, partial information, and the eventual split between action and RTS controls.
5. Do not build entire account/matchmaking infrastructure yet.

### 1. Set up a durable running foundation
- Organize code into client, server, shared protocol, and simulation **where justified**. Don't create package folders empty just to match a diagram.
- Implement a deterministic fixed-timestep simulation module (no rendering or network calls inside its rules).
- Provide a validated player-command format, side/team IDs, and eight logical player slots (4 Dark / 4 Light). Slots can be unoccupied, human, or AI-controlled. This data model does not require eight live players yet.
- Provide a minimally wired game server and one client that renders state received through the chosen interface.
- Do **not** send the full authoritative world to an opposing client. Design a per-player *view projection* interface now, even if M0 initially transmits only public data.
- Set up automated tests, typecheck, build, and a reproducible dev startup command.

### 2. Establish actual visual direction
- Create a playable original 3D environment in a classic Warcraft III-inspired vocabulary: stylized forest clearing, paths, three distinguishable trees, a crooked house and distant castle silhouette.
- Use repeatable assets/materials, clear scale, strong silhouettes, readable terrain contrast, art-friendly model imports. Procedural placeholders are allowed; they're not considered final art.
- Implement a controllable physical actor and basic collision.
- Prototype both higher RTS overview and closer hero-oriented cameras to validate that hybrid play is technically supportable. Treat camera transitions as **experiments**, not final approved UX.
- One basic autonomous monster should patrol predictable points to exercise simulation->render integration. More sophisticated stealth AI belongs in the next milestone.

## Acceptance criteria — all must pass before calling M0 complete
- [ ] `npm install` (or exact documented equivalent), `dev`, `build`, `typecheck`, and `test` work from clean checkout.
- [ ] At least one desktop browser opens the running 3D client and the scene is interactive.
- [ ] Moving the actor changes simulation state and is reflected by 3D rendering.
- [ ] The actor cannot walk through a visible major obstacle.
- [ ] Autonomous monster movement runs via the same simulation tick, not a renderer-only animation.
- [ ] Simulation determinism test: same seed + command sequence = same state; different command sequence changes state.
- [ ] Slots model supports exactly four Dark and four Light team slots, with AI-capable slots possible.
- [ ] Stub privacy test ensures no private information is emitted by public-only projection (substantive fog-of-war testing comes later).
- [ ] RTS and closer actor camera views can be demonstrated, without claiming camera behavior is finalized.
- [ ] Desktop screenshot(s) and short capture or reproducible manual test instructions are included in the PR/report.
- [ ] `docs/architecture.md` and `docs/implementation-status.md` report accurate behavior, executed checks, test evidence, known defects, version choices.
- [ ] Code committed with a SHA or PR. No screenshot-only completion claim.

## Explicit non-goals
- All heroes, all commander classes, a full match, 40-minute pacing, final combat/stealth tuning, procedural kingdoms, cosmetics, accounts, payments, release art, 8-player load tests.
- Final camera UX and fate of the central Dark Lord (both remain open design issues).

## Output format for Fable's handoff
1. Working local preview command and tested environment.
2. Commit/PR URL.
3. Architecture diagram and exact dependency versions.
4. Screenshot/capture and test output summary.
5. Bugs and current limitations.
6. Proposed M1 implementation sequence, without silently deciding open design rules.

## Reference documentation
- Three.js installation: https://threejs.org/manual/pages/installation.html
- Colyseus current docs: https://docs.colyseus.io/getting-started
- Colyseus rooms and fixed steps: https://docs.colyseus.io/room

**Warning:** Colyseus API examples from earlier versions can be incompatible; consult the installed version and current docs. Do not guess.
