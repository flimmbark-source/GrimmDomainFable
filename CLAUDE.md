# Working instructions for Claude Code / Fable

Read `README.md` and `docs/decisions.md` before planning or changing features. The original GDD is a vision reference, but later confirmed design decisions override contradictory GDD passages.

## Priorities
- Build the actual long-lived Grimm Dominion game. Avoid disposable artifacts, unrelated prototypes, or changing engines without approval.
- Classic Warcraft III-inspired **original 3D** style is foundational. Maintain visual readability while implementing mechanics.
- The incomplete-information hunt, autonomous monster command system, distinct hero power economies, and castle assault form the core identity.
- Resolve or explicitly mark architecture-affecting open decisions. Do not present a guess as approved.
- Prefer narrow, end-to-end, playable increments with verified behavior over broad unfinished system scaffolding.

## Implementation workflow
1. Restate the specific milestone and acceptance criteria.
2. Inspect existing code and docs before changing architecture.
3. Implement with clear subsystem ownership and reusable interfaces.
4. Add deterministic tests for rules and integrated/browser tests for user-facing behavior.
5. Actually run available build, tests, and game preview. If execution is unavailable, say so explicitly.
6. Report what changed, known limitations, test evidence, and commit SHA.
7. Update the decision register for newly approved or rejected choices and maintain status records.

## Architectural guardrails (subject to creator's pending technology decision)
- Keep simulation rules independent of input and rendering.
- Treat multiplayer hidden information and server authority as security constraints.
- Prefer bot and human players to use compatible command paths.
- Make units/abilities/resources data-driven where it improves iteration without premature generalization.
- Do not let UI mockups or procedural placeholders be mistaken for final 3D production art.

## Collaboration
- Creator is final authority on game direction.
- ChatGPT prepares gameplay specifications, production priorities, acceptance criteria, and external design review.
- Fable implements and tests code. Challenge requirements that create severe technical risks, with concrete options.
- Do not silently revise core gameplay or resurrect rejected approaches.
