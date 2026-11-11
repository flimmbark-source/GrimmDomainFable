# Light Hero death, ghost travel and revival

**Status:** Core player fantasy and limited spirit interactions CONFIRMED (D-032/D-033). Exact gameplay and numbers UNRESOLVED.
**Design authority:** [Decision register](../decisions.md), particularly D-018, D-022 to D-031, D-032 and D-033.
**Implementation scope:** Future two-sided gameplay milestone after M1 perception work is reviewed. This document does not authorize unapproved ghost abilities or modify current M1 engineering requirements.

## Confirmed player experience
- When a Light Hero dies, they leave a **physical body at the place of death** and control a **ghost**. Death does **not** automatically force them to stop playing or wait on an indefinite respawn timer.
- **Body route (D-034):** **another living Light Hero** must travel to the fallen body and revive its owner there. The ghost **cannot independently self-revive at its own body**. Exact channel, cost, equipment requirement, interruption and bot rescue behavior remain unresolved.
- **Spirit journey route:** the player can **move their ghost to an uncorrupted sanctuary** and revive there. Whether revival happens immediately on arrival or requires a ritual/cost remains open.
- **Candidate extension, not canon:** an uncorrupted church in a village might also serve as a ghost revival destination. Church presence, availability, faction control and behaviors are not approved.
- Player had selected **C: rescue and limited revival** before proposing the body/ghost system. Preserve meaningful death consequences, team cooperation and possible defeat without assuming specific revival caps or currencies.
- **Ghost play (D-033):** while dead, the player can navigate as a ghost, perceive **spiritual landmarks**, and undertake **limited meaningful supernatural interactions**. The ghost is not automatically an unrestricted scout or combatant; it cannot freely expose unseen enemy positions. The exact abilities, rules and sensory presentation have not been selected.

## Why the two routes matter (design intent, not further approved rules)
The body route encourages teammates to rescue someone in danger, creating a chance for recoverable mistakes and local conflict. The ghost journey lets a defeated player stay active without requiring a teammate to abandon everything. These must create distinct choices rather than a universally superior, risk-free respawn.

## Design and security risks to resolve before coding
1. **Ghost perception and scouting:** D-033 confirms spiritual landmark perception and limited spiritual interactions, **not unrestricted enemy scouting**. A free-moving invulnerable ghost that can observe enemy positions could bypass all established stealth and fog-of-war rules (D-012/D-013). Do not implement unrestricted world vision or broadcast enemy coordinates from a ghost. The specific spirit senses and interactions still require explicit design approval.
2. **Body revival interaction:** D-034 requires another **living Light Hero** to reach the body and revive the fallen player; ghost self-revival there is not allowed. Resolve whether allies must guard/channel at the body, whether enemies can occupy/move/corrupt the body, what interrupt conditions apply, whether a death site remains accessible, and how bot allies handle rescue.
3. **Ghost travel and sanctuary eligibility:** Define where ghosts can travel, whether physical obstacles/terrain or special wards affect them, what counts as 'uncorrupted', whether the destination needs Light ownership, and how a newly corrupted sanctuary affects a ghost in transit.
4. **Revival stakes and match end:** Decide time, resources, disadvantages, limited uses or rising costs, and the exact condition for total Light defeat. The game cannot assume permanent elimination or infinite free revival.
5. **Simulation model:** Keep life/body/ghost/revival state authoritative in the server and deterministic. Clients should not fabricate revival outcomes; tests must ensure hidden enemy locations do not leak through ghost perspective or a shared team feed.
6. **Pacing:** Compare the travel distance to nearby sanctuary against ally rescue risk. Repeated death should remain meaningful but should not turn into a prolonged inactivity loop.

## Proposed state model for later review (NOT canon)
```text
Living Light Hero
  -> death event -> Body at death site + Player-controlled Ghost
       -> Body revival conditions satisfied -> Living Light Hero at body
       -> Ghost reaches eligible uncorrupted sanctuary + revival conditions satisfied
          -> Living Light Hero at destination
```
Body and ghost coexist while dead. Whether the body disappears on sanctuary revival, persists as an interactable object, or has consequences is not yet decided.

## Next design gate
**What dangers or obstacles can a traveling ghost face before reaching an uncorrupted sanctuary?** Preserve the independent ghost route even in solo play. Then define the revival resource cost, who can interrupt a body rescue, and what spiritual abilities are available.

## Future acceptance examples (not immediate implementation ticket)
- A death creates one body and one ghost under server authority and does not accidentally duplicate playable heroes.
- A permitted body revival restores the hero in the correct place and reconciles the ghost.
- A ghost can traverse to a legally uncorrupted sanctuary and revive only if its requirements are met.
- A destination that becomes corrupted follows the ultimately approved eligibility rule.
- Ghost viewpoint and network projections do not expose enemy positions beyond their approved senses.
- Full-team defeat and repeated revivals have the chosen, tested limits.
