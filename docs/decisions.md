# Decision register

**Last reviewed:** 2026-11-11
**Status:** Initial extraction. The creator has not yet answered the production kickoff questions.

## Confirmed from conversation
1. This is the **full Grimm Dominion game project**, developed cumulatively rather than a series of throwaway demos.
2. The desired visual reference is **classic Warcraft III-style 3D**: exaggerated readable silhouettes, painterly stylization, gothic fairytale world. Do not use Blizzard-owned assets or copy character designs.
3. Dark-side play revolves around directing **autonomous monsters** through high-level decisions, while light-side characters pursue distinct resource and power loops.
4. Development will use Fable for difficult coding and engineering. The creator and ChatGPT develop/review design and acceptance criteria.
5. A Godot-based workflow was rejected. A browser-first Three.js/TypeScript project was **proposed**, not formally confirmed.
6. Near-term engineering work should preserve long-term maintainability and produce demonstrably running increments.

## Open, architecture-affecting decisions
| ID | Decision | Existing GDD conflict | Status |
| --- | --- | --- | --- |
| D-001 | Final human team composition | 4 dark vs 4 light in some sections; one Dark Lord vs four heroes elsewhere | OPEN |
| D-002 | Camera and player controls for both sides | RTS commander overhead vs third-person light hero, plus mixed PC/mobile controls | OPEN |
| D-003 | First release platform | PC in overview, mobile-first in technical sections, browser proposed later | OPEN |
| D-004 | Multiplayer architecture and playable offline/bot mode | Competitive online focus, AI mode only tentatively mentioned | OPEN |
| D-005 | Match outcome and intended length | Eliminate heroes, kill central Dark Lord, 40-minute corruption timer | OPEN |
| D-006 | Concrete first playable character/perspective | Goblin-first and single commander suggested, not approved | OPEN |
| D-007 | Delivery workflow | Claude Code in repository vs Claude Artifacts preview | OPEN |

## Proposed only, not approved
- A reusable authoritative TypeScript simulation with 3D rendering client, bot-command symmetry, and server-controlled hidden information.
- Three.js + TypeScript client, React HUD, Colyseus rooms, GLB asset pipeline.
- First playable increment: one Goblin versus one commander, scouting/detection, looting, and a castle objective.
- PC browser-first iteration and a shorter test match rather than committing immediately to a 40-minute target.

## Rejected or superseded
- Building the main game in Godot.
- Treating the game as a 2D prototype and postponing the Warcraft-style 3D look until after mechanics.
- Treating a mock screen or untested code as a completed milestone.

## How to use this document
- Ask the creator about open architecture-affecting decisions before locking them in.
- When a choice is resolved, record the exact approved outcome and date. Preserve rejected choices.
- The original GDD is historical source material, not authority over later explicit decisions.
