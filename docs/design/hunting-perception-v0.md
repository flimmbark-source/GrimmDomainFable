# Design proposal: Hunting and incomplete information (M1)

**Status:** PROPOSED FOR CREATOR REVIEW, not approved gameplay law.
**Owner:** ChatGPT design specification. **Implementer:** Fable after M0 interfaces.
**Purpose:** Make hunting feel intelligent and fair for both the Light Hero being hunted and Dark Heroes commanding monsters.

## Desired player experiences
- **Light Hero:** "I understand why I was spotted; I can read the monster's behavior, deliberately mislead it and escape." Hidden information creates tension, not randomness.
- **Dark Hero:** "My army gives me imperfect evidence. I can infer routes, direct searches, and make strategic commitments without magical omniscience."
- **The world:** Trees, obstacles, sound and paths are *gameplay information*, not decoration.

## Minimum creature behavior model
A Scout with five identifiable states:
1. **Patrol** assigned waypoints, with routine pauses/looks.
2. **Investigate** a nearby suspicious sound, disturbance or incomplete sighting.
3. **Alert** if detection threshold is reached, publishing an observable alert event with a location and age.
4. **Pursue** a visible target under active line of sight, using actual navigation/collision.
5. **Search** a last-known position after visibility is lost, for limited time, then return to assigned behavior.

The Scout must not update its target's last-known location while it cannot perceive the target. Threats react to evidence. Other unit classes will build on the same model but have different priorities.

## Proposed sensory rules (all values tunable)
- Optical detection requires range, unobstructed line of sight and a view direction/FOV, with a *buildup* period instead of instant discovery.
- Obstacles such as trees/buildings may block sight according to explicit collision/occluder geometry.
- Loud actions create noise events. Hearing alone gives a location worth investigating, **not** direct identification of the hero.
- After sight is broken, memory retains the last observed location with timestamp and uncertainty; the Scout does not magically know where the hero went.
- Dark Hero notification communicates **who/what reported, where, and how recently** where appropriate. Never send exact hidden positions merely because a Scout is investigating.
- Unit behavior should be predictable enough to learn, with enough context sensitivity to prevent trivial repeated exploitation.

## Concrete test stories
**ST-01 Vision blocked:** Goblin behind a substantial tree within scout distance is not visually identified if the tree occludes line of sight.

**ST-02 Brief exposure:** Goblin crosses Scout's view briefly; detection begins but stops/resets when line of sight is broken before confirmation.

**ST-03 Full detection:** Goblin stays visible long enough; Scout changes to alert/pursue, with feedback to the player and limited report to Dark side.

**ST-04 Honest loss of target:** Goblin turns a corner, breaks vision and doubles back. Scout proceeds to its last actually observed position and searches, not to the actual hidden position.

**ST-05 Distraction:** A sound from behind cover causes investigation toward the sound source, without revealing who caused it.

**ST-06 Commander information:** A player on Dark side sees actionable but imperfect reports. A player on Light side sees their own detection feedback. Neither client receives inappropriate hidden enemy positions in its network payload.

**ST-07 AI not frozen:** After unsuccessful investigation/search, Scout resumes appropriate orders and avoids indefinite stuck states.

**ST-08 Multi-monster response:** A nearby brute can react to a confirmed alert, but should not gain unwarranted perfect tracking. Exact alert propagation is unresolved.

## Observable UX cues to design/test
- Light Hero receives readable anticipation feedback before confirmed discovery: monster facing, attention animation, and/or restrained detection meter or audio cue.
- Scout communicates its state through pose, silhouette, locomotion, look direction and optional UI only when appropriate.
- Dark Hero gets sightings in space and time, not a persistent omniscient wallhack. Reports should convey certainty level visually.

## Acceptance for moving from design to implementation
- Confirm whether all heroes share the same base visibility rules, with class modifiers.
- Confirm whether AI monsters can transmit sightings instantly or through a delayed/specific communication mechanism.
- Confirm whether Dark players share all scouting reports by default or only some.
- Establish initial (changeable) detection delays, FOVs, hearing ranges, search duration via playable tuning, not arbitrary permanent GDD numbers.
- Validate actual player experience with at least three replayable scripted scenarios before treating the mechanic as complete.

## Later interactions (not part of M1)
- Goblin cloak, Priest reveal, Witch illusions, sound-decoys, siege-related alerts and final castle defenses should plug into the same sensory framework.
- Multiplayer anti-cheat and server-side information projection must be maintained.

## Design uncertainty
The original GDD contains several illustrative numbers and rules (e.g., roughly two-second detection); **none are canon until explicitly approved or playtested**. Treat values as editable parameters and separate tuning from system architecture.
