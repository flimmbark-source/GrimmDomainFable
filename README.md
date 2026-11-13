# Grimm Dominion

**Status:** M1 (hunt, cover, Scout perception, private information) is implemented on the integration branch and awaits creator playtest; see [implementation status](docs/implementation-status.md). M0 game source integrated for review in draft PR #5. Claude reports a running 3D browser build and passing automated tests, but independent CI and human playtesting are separate acceptance gates. This repository is the canonical workspace for developing Grimm Dominion as a complete, original game, using Fable/Claude Code for implementation and ChatGPT plus the creator for gameplay direction, review, and production specifications.

## Vision currently established
- Asymmetric dark-fairytale strategy/action game built around hunting, hiding, growing stronger, and a castle assault.
- Classic *Warcraft III* is the visual reference for the **3D** world, elevated strategy camera, exaggerated silhouettes, readable units, and painterly stylization. Produce original art and code, not Warcraft assets or copied designs.
- Light-side characters have distinct power-gathering loops: Goblin Outlaw, Alchemist, Exiled Knight, and Forest Witch.
- Dark-side players direct autonomous minions with high-level orders. Vision and incomplete information are integral to play.
- Build a durable production codebase, not a disposable mockup.
- The user's immediate objective is to exploit time-limited Fable access ending around November 16, 2026, to advance the real game as far as practical, without pretending the entire game can be finished in that time.

## Source design document
[Grimm Dominion original GDD](https://docs.google.com/document/d/1Z7alNg7ctLDKWcgnc99XwshO_XdkkZ8l/edit).

The original document contains conflicting and exploratory choices. It is a source of feature ideas, **not** an unambiguous implementation contract. See [decisions](docs/decisions.md) before making architecture choices.

## Working agreement
- **Creator:** decides game identity and approves consequential design tradeoffs.
- **ChatGPT:** reconciles requirements, creates testable gameplay specs, evaluates player experience, checks implementation evidence.
- **Fable/Claude Code:** engineers the game, integrates real assets, tests, commits, and documents actual behavior.
- Record decisions and rejected approaches explicitly. Never convert an unconfirmed assumption into a design fact.
- Every implementation milestone must yield runnable code, verification evidence, known limitations, and a commit.
- Do not claim a playable build before it has actually been launched and tested.

## Confirmed production parameters (2026-11-11)
- **4 Dark Heroes vs 4 Light Heroes**.
- Dark Heroes physically act in the world **and** command autonomous monsters via RTS-style controls.
- Light Heroes use a **switchable/hybrid camera/control approach**. Exact switching behavior is still open.
- **PC browser first**, with permanent solo/co-op bots and bots filling vacant slots.
- Light Heroes gather power to defeat the Dark Lord in the central castle. Dark Heroes hunt and prevent the assault.
- Implementation runs through **Claude Code with repository access**.

## Play the current M0 engineering build (after merging PR #5)
Requires Node.js 22+ and a WebGL2 desktop browser.

```bash
npm ci
npm run dev
```

Open http://localhost:5173. The Colyseus server is on port 2567. Browser connection and test commands are in [implementation status](docs/implementation-status.md).

## Orchard Vale test region
After `npm run build && npm start`, open http://localhost:2567/?region=orchard_vale. See the [Orchard Vale implementation report](docs/production/orchard-vale-implementation-report.md). The region's folklore is candidate direction, not canon.

Open http://localhost:2567/?region=orchard_operation&bakedShadows=1 for the Orchard Vale operation playtest. Add `&team=dark` for the Dark seat. Reach the relay north of the bridge, stop and press **R** to sabotage or repair it. Move or press **X** to cancel. See the [Orchard Vale gameplay milestone](docs/production/orchard-vale-gameplay.md) for the objectives and playtest settings.

## Review and next work
1. Read [confirmed and open decisions](docs/decisions.md) before changing game mechanics.
2. Review [PR #5](https://github.com/flimmbark-source/GrimmDomainFable/pull/5) for M0 integration and run the verification checks from [issue #2](https://github.com/flimmbark-source/GrimmDomainFable/issues/2).
3. Review the [M1 hunting/detection design](docs/design/hunting-perception-v1-playtest-spec.md) before adding perception logic.
4. Keep [the full production roadmap](docs/production/roadmap.md) current.

**M0 deliberately does not include fog of war, pathfinding, or final-quality character art.** Do not mistake temporary visual models or camera experiments for approved final gameplay.
