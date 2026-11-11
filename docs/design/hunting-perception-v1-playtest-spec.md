# M1 — Hunt/escape playtest specification

**Status:** Design proposal with three confirmed foundations: D-012 (shared alerts, private vision), D-013 (universal Light Hero stealth with class modifiers) and D-014 (world/audio cues plus subtle local attention indicator). Exact feedback presentation and tuning remain proposed. **Created:** 2026-11-11.
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

### Confirmed Dark-team information rule (D-012)
- When a Scout **confirms** a Light Hero sighting, all four Dark Heroes receive a shared sighting **alert**.
- The Scout's **live vision stays private to its owner**. Receiving the alert does not grant ongoing vision, current target coordinates after sight is broken, or control of that Scout.
- A shared sighting report contains only information legitimately observed when the alert occurred. A timestamp/location marker can become stale. Exact expiry and reporting cadence are tuning decisions.
- Server-side recipient projections must enforce this. **Test:** a non-owner Dark client receives the alert but cannot read the owning Scout's full live vision stream.

### Perception as evidence
Treat sensory outputs as events with:
- source unit ID, owner/team, event timestamp, observed region/position and confidence/type;
- **sound:** approximate source location; no identity unless independently identified;
- **glimpse:** unconfirmed visual trace that raises suspicion but does not reveal hero identity;
- **confirmed sighting:** identifies/locates a hero for as long as valid vision persists, followed by a last-known position when lost;
- **unit loss:** destroyed scout generates loss-of-contact evidence, not automatic knowledge of who killed it.
- **future Witch-specific magic report (D-055/D-056, not an M1 implementation requirement):** detecting a focused shrine-sensing disturbance produces **an approximate, time-stamped magical-activity clue delivered only to the detecting Scout's owning Dark Hero**. It does not identify the Witch, locate her current hidden coordinates, grant live vision or count as a shared confirmed-sighting alert. Approximate evidence is derived from the actual observed disturbance, not omniscient hero state.
- **future Witch shrine ritual evidence (D-058, not an M1 requirement):** channeling the Witch's progression rite emits **local magical/visual effects** nearby Dark Scouts can notice and investigate. Unlike a confirmed visual sighting, these do **not** identify the Witch or automatically notify all Dark Heroes. Exact event detection/reporting, including any owner-private disturbance report, remains a separate design decision. Do not silently apply the D-056 focused-sensing report rule to a different action.

No evidence is allowed to expose the current hidden coordinates of a hero. Last-known positions are frozen at the last legal observation. An interface may display confidence decay or positional uncertainty after the fact, but that is presentation of known evidence, not secret truth.

### Confirmed common Light Hero stealth framework (D-013)
- All Light Heroes use the **same underlying sight, cover, obstruction, sound, and detection rules**, so players can learn how the world works once.
- Character identity comes from **modifiers and explicit abilities**, not separate, incompatible stealth engines.
- Proposed illustrative differences: Goblin is harder to notice, Knight creates more sound, Alchemist actions generate audible disturbances, and Witch abilities may influence evidence. These examples are not yet approved balance rules.
- Detection speed, sound strength, reveal conditions, and special counterplay remain tunable and subject to playtesting.
- **Acceptance test:** identical base sight/cover logic applies to two different Light Hero types; modifiers change parameterized results without bypassing obstruction or server-side information restrictions.

### Confirmed detection feedback (D-014)
- A noticing monster communicates suspicion through **in-world behavior and sound** (e.g., turning, pausing, alert posture, vocalization). These signals remain important even if UI is disabled.
- A **subtle local attention indicator** helps the Light Hero understand that they are being noticed and roughly how close they are to a confirmed detection state.
- Do not use the indicator to expose exact coordinates, hidden monsters, or targeting information the player could not legitimately know.
- The indicator's shape, placement, animation, thresholds, and timing are UX proposals to test. A meter per observer is **not** automatically approved.
- **Acceptance test:** partial exposure produces readable world/audio cues and a local attention indicator; breaking line of sight causes feedback to relax in accordance with detection decay; confirmed detection gives distinguishable feedback; authorized client data remains privacy-safe.

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
1. **Sighting-sharing policy: CONFIRMED (D-012).** All Dark Heroes receive confirmed sighting alerts; only the Scout owner receives its live vision. Alert latency, report format, and other unconfirmed evidence sharing remain tunable/open.
2. **Light stealth foundation: CONFIRMED (D-013).** All Light Heroes share the same sight/cover/detection foundation, with character-specific modifiers and abilities. Exact values are not approved.
3. **Detection cues: CONFIRMED (D-014).** World/audio cues **plus a subtle local attention indicator**. Its exact UX, state transitions, visibility constraints, and tuning require gameplay validation.

All three foundation choices above are **confirmed**. Specific timings, tuning, visual placement, alert delivery, and advanced character interactions are **not approved** and remain subject to playtesting. Do not present them as canon.

## Follow-on system dependencies
- **Future Goblin stealing consequences (D-068/D-070, not an M1 build requirement):** witnessed/detected theft triggers local guard/witness pursuit, and repeated detected theft raises suspicion **within the affected locality**. Local suspicion **naturally diminishes over time without new incidents**, while the Goblin can **actively reduce it faster** through yet-to-be-designed actions. Reducing longer-term suspicion does **not** erase current LOS, ongoing pursuit, legitimate last-seen evidence or D-012 confirmed-sighting reports. Suspicion is remembered evidence, not hidden live Goblin coordinates, global Dark-team awareness or an omniscient wanted-level system. Exact decay, mitigation, NPC responses and area boundaries remain open.
- **D-056 scope guardrail:** eventual Witch magical sensing should use the existing Scout evidence and recipient-projection boundaries. A private suspicious activity report remains private to the Scout owner; D-012's **team-wide** confirmed sighting notifications only apply after actual confirmation. Do not expand the M1 acceptance scope to implement the Witch ability prematurely.
- Goblin cloak or decoys alter sensory evidence, not the underlying trust/authority model.
- Alchemist noise/explosions create evidence; Knight's armor/fights may attract investigation; Witch illusions can create false evidence.
- Commander spells/priests may change sensing rules, but must state explicit counterplay and duration.
- Final 4v4 team report sharing must follow a creator-approved communication design.

## Handoff to Fable
When M0 is runnable and creator resolves design gates, turn this into M1 subissues for: authoritative sight + occlusion, hearing/evidence events, scout state machine, alert propagation, UI cues, server projection/privacy, tests and debug tooling. Implement in that order and prove the three experiential test scenarios in a real build.
