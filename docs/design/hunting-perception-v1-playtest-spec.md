# M1 — Hunt/escape playtest specification

**Status:** Design proposal (not creator-approved). **Created:** 2026-11-11.
**Predecessor:** [Hunting and perception v0](hunting-perception-v0.md).
**Engineering dependency:** M0's fixed-step simulation, world collision, server-authoritative commands, and 3D camera/render path.

## Design question we're actually testing

**Can a Light Hero outwit a hunter through observable behavior rather than an arbitrary invisibility button, while a Dark Hero makes meaningful tactical choices from incomplete evidence?**

This is the core tension. A technically correct chase routine that simply beelines at the Light Hero will fail the design even if it passes navigation tests.

## The two player loops

### Light Hero: risk -> evidence -> evasion -> reward
1. Discover something valuable in the world (chest, village, resource location).
2. Observe a scout's patrol/attention before deciding whether to cross exposed terrain.
3. Take a risk to get the resource. The risk itself may create traces: sight, noise or time spent interacting.
4. If attention rises, choose to hide, retreat, lure the scout away, or complete the risky action before escaping.
5. Escape by breaking **actual knowledge**, not by running farther while the enemy maintains perfect tracking.
6. Return stronger, but with the Dark side potentially holding an imperfect clue to where the hero was.

**Design failure:** Hiding is always best and never costs time or opportunity; attacking is always best; or discovery feels random and unexplainable.

### Dark Hero: deploy -> infer -> commit -> adapt
1. Choose patrol/search locations using a limited number of autonomous scouts.
2. Receive *evidence* such as noises, suspicious activity, confirmed sightings, or unit losses.
3. Infer where the Light Hero may be gathering resources and redirect a scout or stronger threat.
4. Decide whether to spend resources on a wider search or protect valuable sites/castle routes.
5. Adapt when reports go stale, scouts fail, or the hero uses deception.

**Design failure:** The commander sees all heroes continuously, or the game issues so many exact pings that strategic inference becomes unnecessary.

## Proposed mechanics, not locked tuning

### Perception as evidence
Treat sensory outputs as events with:
- source unit ID, owner/team, event timestamp, observed region/position and confidence/type;
- **sound:** approximate source location; no identity unless independently identified;
- **glimpse:** unconfirmed visual trace that raises suspicion but does not reveal hero identity;
- **confirmed sighting:** identifies/locates a hero for as long as valid vision persists, followed by a last-known position when lost;
- **unit loss:** destroyed scout generates loss-of-contact evidence, not automatic knowledge of who killed it.

No evidence is allowed to expose the current hidden coordinates of a hero. Last-known positions are frozen at the last legal observation. An interface may display confidence decay or positional uncertainty after the fact, but that is presentation of known evidence, not secret truth.

### Scout behavior states
**PATROL** -> **SUSPICIOUS/INVESTIGATE** -> **CONFIRMED/CHASE** -> **LOST/SEARCH** -> **RETURN TO ORDER**.
- Patrol state uses actual assigned routes and world navigation.
- Investigate moves to a sound/trace region and looks around. It cannot magically identify the emitter.
- Chase follows the target only while the Scout has legitimate sight or a newly valid visible observation.
- Search visits an internally chosen set of plausible points near the last-seen area, then gives up. The search cannot sample the true hidden target location.
- A repeated alert must not endlessly restart the chase/search without fresh evidence.
- A player order can interrupt and re-prioritize investigation, subject to unit behavior rules.

### Design affordances
- Trees, boulders, walls and buildings visibly indicate whether they block line of sight.
- Scout facing, attention animation/sound, and search behavior make detection causally legible.
- A Light player should know their own exposure state (e.g. subtle attention/alert cue), without receiving remote enemy omniscience.
- A Dark commander can distinguish a *suspected activity* marker from a *confirmed sighting* and see report age.
- Fog of war is not merely a black rendering overlay. Server sends only authorized view information.

### Initial tunable parameter set
Engineer all as inspectable/editable data, not fixed gameplay truth:
- visual range, view arc, detection time, buildup decay, hearing radius, noise strength, investigation timeout, search duration/extent, last-known report lifetime, alert relay behavior;
- class modifiers (Goblin vs Knight, future reveal/illusion effects);
- path and observation sampling cadence;
- debug-only overlay for sensor rays, blocking geometry, state and memory. Never ship secret debug data to competitive clients.

Do not hardcode original GDD's illustrative ~2-second detection as immutable canon. Use an initial playtest value and record it.

## Minimal test environment (M1)
A forest crossing between **two meaningful resources**, with one exposed central path, one covered detour, and a single autonomous Scout. The player has a reason to cross and at least two distinct ways to avoid being detected. A second test adds a Brute responding to a confirmed sighting.

*Why:* A blank arena with a patrol cannot demonstrate risk/reward or meaningful stealth, even if the AI state machine works.

## Acceptance stories

| ID | Setup and action | Required system result | What players should learn |
| --- | --- | --- | --- |
| M1-01 | Hero pauses behind a solid tree as Scout looks toward it | No confirmed visual detection across blocked line of sight | The environment is legitimate cover |
| M1-02 | Hero crosses visible road briefly, then returns behind cover | Attention begins, then stops/decays; no confirmed sighting | Timing matters |
| M1-03 | Hero remains exposed while Scout watches | Confirmation, audio/visual reaction, timestamped evidence to authorized Dark recipients | Discovery has a legible cause |
| M1-04 | Hero breaks vision at an intersection and doubles back | Scout searches last-seen location, not present hidden location | Evading *knowledge* works |
| M1-05 | Hero produces noise behind wall | Scout investigates rough noise location without knowing identity | Sound can be used for misdirection |
| M1-06 | Dark commander orders patrol moved to resource site | Scout visibly changes priority and travels there | Commander has consequential agency |
| M1-07 | Scout confirms sighting, Brute receives authorized alert | Brute moves toward relevant evidence, cannot track hidden target after LOS loss | Monster teamwork has limits |
| M1-08 | Scout loses target and fails to rediscover | Search ends, Scout resumes assignment, no stuck/looping behavior | Pursuit is finite |
| M1-09 | Two browser clients observe same match, on opposite teams | Dark client sees only allowed evidence, Light client sees own character and expected threats; raw payload does not leak hidden exact coords | Information asymmetry is enforced |
| M1-10 | Run same seed and scripted commands twice | Same AI states, reports, and legal observations in same simulation ticks | Bugs can be reproduced |

### Experiential acceptance (creator + ChatGPT)
Run three short scenarios:
1. **Blind crossing:** Without UI instruction, can player infer that a Scout is watching the road and that cover matters?
2. **Deliberate escape:** After discovery, can player deliberately break the Scout's knowledge rather than simply outrun it?
3. **Commander inference:** With imperfect reports, does the Dark player have at least two plausible decisions worth considering?

Record observed behavior, misunderstandings, and exploit strategies. Do not mark M1 "fun" on the basis of code tests alone.

## Decision gates for creator
1. **Sighting-sharing policy:** Are confirmed sightings visible to all Dark Heroes immediately, only to the owner of the spotting Scout, or relayable through a tactical communication mechanism? Recommended **for initial tests:** shared *confirmed alerts*, with player-specific unit vision and ownership. Sharing all vision permanently would erase team coordination choices.
2. **Light stealth foundation:** Do all Light Heroes share the sight/cover system with character-specific stealth modifiers? Recommended **yes**, so players learn one consistent world rule before class-specific counters.
3. **Detection cues:** World/audio cues plus a restrained local attention meter, or exclusively world cues? Recommended **both**, with the meter only showing attention generated toward the player by threats it could plausibly perceive.

These are **recommendations**, not approvals. Build configurable interfaces while pending, and do not turn these defaults into undocumented canon.

## Follow-on system dependencies
- Goblin cloak or decoys alter sensory evidence, not the underlying trust/authority model.
- Alchemist noise/explosions create evidence; Knight's armor/fights may attract investigation; Witch illusions can create false evidence.
- Commander spells/priests may change sensing rules, but must state explicit counterplay and duration.
- Final 4v4 team report sharing must follow a creator-approved communication design.

## Handoff to Fable
When M0 is runnable and creator resolves design gates, turn this into M1 subissues for: authoritative sight + occlusion, hearing/evidence events, scout state machine, alert propagation, UI cues, server projection/privacy, tests and debug tooling. Implement in that order and prove the three experiential test scenarios in a real build.
