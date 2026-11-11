# Grimm Dominion

**Status:** pre-production. This repository is the canonical workspace for developing Grimm Dominion as a complete, original game, using Fable/Claude Code for implementation and ChatGPT plus the creator for gameplay direction, review, and production specifications.

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

## Next action
Resolve the foundational questions in [decisions](docs/decisions.md), then approve the initial technology/architecture spike. No game implementation has yet been committed.
