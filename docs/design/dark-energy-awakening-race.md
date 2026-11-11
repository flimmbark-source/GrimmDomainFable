# M2 Design: Dark Energy and the Awakening Race

**Status:** Foundation confirmed by creator, calculations and gameplay details still PROPOSED.
**Last updated:** 2026-11-11
**Related decisions:** D-015 through D-031 and D-039/D-040 in [decisions.md](../decisions.md)
**Implementation timing:** After M0/M1 foundations; do not interrupt Fable's current engineering work.

## Player-facing promise (confirmed)
The Dark Lord sleeps inside the central castle. Four Dark Heroes and their autonomous minions spread evil across the kingdom. **A Dark Energy meter advances naturally over time.** Their individual evil deeds each grant a **small one-time addition of Dark Energy**. Separately, **corruption sources increase the passive rate** at which the Dark Energy meter fills. Four Light Heroes pursue their independent paths to power, then attempt to breach the sanctum and slay him.

### Two climaxes, depending on player actions (confirmed)
**Early Light raid:** If the Light Heroes reach the sanctum before awakening, they can kill the sleeping Dark Lord and win. The castle must have meaningful defenses, but the detailed vulnerability/encounter is not yet specified.

**Awakened confrontation:** If the meter reaches awakening first, the Dark Lord awakens and joins the four Dark Heroes in the dangerous final battle against the Light Heroes. This is **not an immediate Dark victory**. The Light Heroes still have a chance to defeat him.

This creates a race between **Light growth + access to the sanctum** and **Dark expansion + accelerating awakening**.

## Confirmed mechanics
- There is one Dark Lord, initially dormant, situated in the castle's sanctum.
- His Dark Energy meter fills with a baseline time progression.
- Individual evil deeds by Dark Heroes or their **minions** grant **small, immediate one-time Dark Energy rewards**. They **do not change passive generation rate**.
- Corruption sources **increase the passive Dark Energy generation rate**. **Confirmed two types (D-021):** major sources established by corrupting existing map landmarks; smaller sources constructed by Dark Heroes at strategic positions. Exact actions, placement restrictions, stacking, maintenance and destruction rules are not yet specified.
- There is a **tiered** progress structure; how many tiers and what they do is not yet approved.
- Light players can end the game by slaying the Dark Lord before he awakens.
- If he awakens, the awakened Lord and Dark Heroes jointly oppose the Light Heroes in a climactic final confrontation.

## Proposed gameplay model for review (NOT CANON)
### Separated energy channels (confirmed concept; formula illustration only)
- **Baseline:** energy accumulates naturally over time, whether or not the Dark side acts.
- **Evil deed:** when a valid deed is completed by a Dark Hero or one of their minions, the meter gets a **small, immediate energy drop**. A deed **never directly increases the passive rate**.
- **Corruption source:** when a qualifying source is established or maintained, it **raises the rate** of natural energy accumulation. Sources are the main strategic targets for Light-side sabotage.
- **Sabotage:** reducing/disabling a source **slows future accumulation**. The meter does **not** run backward.

An illustrative accounting relationship, **not an approved production formula**, is:

```text
future energy = current energy
              + passive energy gained during elapsed time
              + sum(one-time evil deed rewards)

passive generation = base generation + active corruption-source contribution
```

The exact combination rule, thresholds, timing, caps, duplication limits, and source lifecycle need balancing and approval. No fixed numeric model is authorized yet.

Use an observable global awakening meter with **two distinct contributions**: one-time Dark Energy rewards for evil deeds, and continuous generation from the baseline plus corruption sources. The Dark team must decide between short-term actions that award small energy drops, establishing or protecting rate-producing corruption, and defending against an early castle raid.

Possible **one-time evil deed** categories to consider (none approved individually):
- Desecrating shrines and corrupting villages
- Raiding/harassing settlements
- Completing acts of desecration at a corrupted location
- Killing or imprisoning innocents or opposing Light Heroes (tone and portrayal TBD)
- Rituals performed by Dark Heroes

These are illustrative. No deeds are accepted into the design until approved.

Potential tier effects (ALL speculative): subtle environmental corruption, increasing monster threat, periodic omens, castle transformations, final awakening. Avoid granting pure automatic combat superiority at each tier, which could create an unstoppable feedback loop.

### Biggest systemic risk: compounding snowball
If Dark Heroes establish many corruption sources, **passive production** can snowball and awaken the Dark Lord before the Light team has time to respond. Small individual deed payouts add additional pressure without themselves compounding the rate. We need pacing tests, source placement/stacking constraints, and meaningful sabotage to keep both strategies viable.

### Confirmed corruption source structure (D-021)
- **Major world landmarks:** existing sites in the kingdom can be corrupted into major passive Dark Energy sources. Examples (not canon): shrines, villages, graveyards. Their locations create naturally contested objectives.
- **Smaller constructed sources:** Dark Heroes can place smaller corruption-producing structures in strategically useful positions, subject to placement restrictions to be designed.
- Both types contribute to passive Dark Energy generation. **Neither changes the rule that individual evil deeds grant only a small one-time energy reward.**
- Smaller vs major source production rates, costs, placement validity, repair/rebuilding, visibility, number limits, source destruction and Light sabotage interactions remain unapproved.
- A Light sabotage of a corruption source reduces its active contribution to **future energy gain** and must not erase energy already earned.

### Purification becomes territorial control (CONFIRMED: D-022)
- **Purifying a corrupted major landmark converts it into a Light-controlled sanctuary**, rather than leaving it neutral.
- Sanctuaries turn landmark warfare into a reversible territorial contest between both teams. The Dark source no longer contributes its corruption-based passive Dark Energy while purified, consistent with D-019.
- **Confirmed (D-023):** sanctuaries provide both **recovery/regrouping** and **Light Hero progression opportunities**. They are **contestable**, not completely safe, and the Dark side can threaten and recapture them.
- **Not yet approved:** exactly what healing or progression services are provided, which classes benefit, detailed defensive bonuses, ritual timing, or the conditions for reversing a siege. The **two-stage** structure is confirmed in D-026.
- **Confirmed (D-024): Hybrid Dark recapture.** Autonomous Dark minions can assault a Light sanctuary and begin re-corrupting it. A Dark Hero may physically participate in the corruption ritual, increasing its effectiveness. Light Heroes can interrupt/intervene to defend.
- Recapture must not require a Dark Hero's presence at every contested sanctuary, but that presence should create a consequential, legible benefit.
- **Unapproved:** whether effectiveness changes speed, resource cost, resilience or ritual abilities; contest progress, whether it pauses/resets under attack, the site's own defenses, and final conversion animation.
- **Confirmed (D-025):** every purified sanctuary provides baseline protective wards/defenses, and Light Heroes can strengthen it by investing in upgrades, performing rituals or using relevant character abilities. The baseline protection should **delay or complicate** a significant Dark assault, not automatically repel a serious army. This does not make a sanctuary perfectly safe.
- **Still open:** whether basic wards deter monsters, reduce corruption ritual progress, grant defensive cover/healing or summon guardians, plus upgrade types, costs, stacking, disruption, and what occurs when a sanctuary is under siege.
- **Confirmed (D-026): two-stage siege.** First the Dark army must **weaken or breach the sanctuary's wards**. Only after that can the Dark side **perform the corruption ritual** to convert the site. Light Heroes may hold the wards, interrupt the ritual, or counterattack to retake the site.
- Stage one must be visibly distinct from stage two so players can recognize whether they should protect the ward defenses or stop an active ritual. A Dark Hero's physical presence can improve the ritual as established by D-024, but a hero is not required.
- **Open:** ward integrity model, siege progress UI, stage transition criteria, ritual participants, contested/interrupted progress, whether wards regenerate, how a Light counterattack reverses momentum, and what happens on attacker retreat. None of those details is automatically approved.
- **Confirmed (D-027): Hybrid siege recovery.** The sanctuaries' **ward integrity remains damaged** after a siege until the Light side repairs it. **Corruption ritual progress decays gradually** once the Dark side loses control of the site. Repeated raids can soften wards, but an abandoned ritual cannot be stored at near-completion forever.
- Ward integrity and ritual progress must be distinct authoritative state variables. **Unresolved:** control/contest criteria, repair activities and costs, ability to repair during attacks, decay speed and whether ritual progress pauses while contested.
- **Confirmed (D-028): Resource-backed hybrid ward restoration.** Light Heroes must invest resources in sanctuary ward repair. A **restoration ritual**, once established, continues restoring wards while the Heroes are away. A Light Hero can personally participate to restore wards faster. Their presence is **not mandatory** for an already-established ritual to keep working.
- **Confirmed (D-029): Hybrid disruption.** Dark military pressure at a sanctuary **slows** an active restoration ritual. A **physical ritual anchor** exists, and its **destruction stops restoration entirely**. Light Heroes can respond by defending the anchor or removing the Dark pressure.
- **Unresolved:** what counts as enough Dark pressure, precise slowdown, anchor durability and detection/visibility rules, whether destroying the anchor also affects already restored wards (do not assume it does), rebuilding/restarting procedure, and fate of invested resources.
- **Confirmed (D-030): Layered sanctuary alerts.** When a Light sanctuary is threatened, **all four Light Heroes** receive a shared warning and can inspect the affected sanctuary's **ward condition**. Heroes physically near the site receive richer world/audio feedback on what is happening.
- **Fog-of-war boundary:** the distant alert communicates an owned sanctuary's danger and condition, **not who is attacking, how many enemies are present, or their exact world positions**. Do not attach previously unseen enemy entities or hidden path information to the alert. Local detail must be grounded in valid proximity/perception.
- **Confirmed (D-031): alert escalation.** A sanctuary **first coming under attack** generates a subtle warning shared with all Light Heroes. A **ward breach or active Dark corruption ritual** escalates it to a prominent urgent warning. These are distinct information/urgency levels, not separate grants of enemy visibility.
- **Confirmed (D-039/D-040):** attacked Light sanctuaries remain usable for ghost resurrection while not yet fully corrupted. Ghosts know when a destination becomes ineligible, without receiving information about hidden attackers. Resurrection at sanctuaries requires a ritual, **longer for recently dead heroes and shorter for those dead longer**. Ritual interruption, exact timing, and minimum duration are unapproved.
- **Open:** precisely what qualifies as an attack, how to suppress repeated minor-warning spam, severity display, alert decay and acknowledgment, and nearby criteria. This is future sanctuary work, **not an instruction to change Fable's current M1 gameplay**.
- **Not yet confirmed:** what resources are used or how they are earned, whether payment starts or sustains the ritual, establishment and repair rate, or whether destroyed rituals can be restored during active sieges.
- Keep **ward integrity**, **Dark corruption progress** and **Light restoration process** separate in the authoritative simulation. Don't interpret a restoration ritual as undoing Dark Energy already accumulated by the Dark Lord.
- Minor constructed corruption sources have their own unapproved destruction/purification rules. Do not assume they transform into sanctuaries.

### A meaningful Light-side response (CONFIRMED PRINCIPLE: D-019)
Light Heroes **can sabotage corruption sources/Dark operations to reduce passive Dark Energy production**. Possible activities include purifying corrupted locations, interrupting rituals, or destroying rate-producing infrastructure. **Do not subtract already accumulated Dark Energy** when sabotage succeeds. Exact targets, costs, source restoration, and whether sabotage prevents future deeds are **not confirmed**.

The strategic purpose is to give Light Heroes a choice between gathering personal power, slowing Dark growth and making an early castle assault. This should bring the two teams into contested areas without turning the match into endlessly reversing the meter.

**Important design distinction:** an evil deed's one-time energy drop remains in the meter after sabotage. A corruption source increases passive generation while it contributes, so disrupting a source affects **future gain**, not existing energy. Rules for whether rate contributions last only while active, are rebuildable, or can be fortified must be approved before hardcoding.

## Technical structure suggested for Fable (proposal)
- Authoritative state: `darkEnergy`, `baselineEnergyRate`, `effectiveEnergyRate`, `corruptionSources` (with active/rate-contribution data), `awakeningTier`, `darkLordState = dormant | awake | defeated`, `matchPhase`, and a ledger of recognized deed events.
- Fixed-timestep update combining baseline natural accumulation, contributions from corruption sources, and discrete one-off deed rewards. Exact additive/multiplicative rules and numeric tuning remain unapproved.
- Validated `EvilDeedResolved` events add a small one-off amount **without changing the passive rate**; corruption-source activation/deactivation changes the **passive rate**, all server-authoritative rather than client claims.
- Replayable seeded event sequences for balancing/simulation tests.
- Explicit transition into the awakened encounter; do not infer Dark victory on transition.
- Server-owned match win resolution, with correct handling of a pre-awakening Dark Lord death.
- Visual/audio hooks for energy milestones without assuming the tier presentation.

No numeric values, tier count, specific dark deed triggers or formulas are yet approved. Avoid implementing the speculative equations in production code until the mechanics have an acceptance specification.

## Acceptance test stories (proposed, subject to detail design)
1. A match with no evil deeds progresses toward awakening at its baseline rate.
2. A confirmed evil deed generated by a Dark Hero **immediately adds a small energy amount**, and the **passive rate remains unchanged**.
3. A confirmed evil deed generated by an autonomous minion likewise provides a **one-time energy reward**, without changing the passive rate.
4. An invalid/repeated deed event does not mint arbitrary additional energy.
5. Light Heroes kill the dormant Dark Lord before the threshold: Light victory; awakened battle never starts.
6. Reaching the awakening threshold with the Dark Lord alive triggers the awakened final encounter, **not** Dark victory.
7. The awakened battle includes the Dark Lord alongside four Dark Hero *player roles*, without making him a fifth Dark player slot.
8. The same simulated timeline and deeds produce identical energy and phase changes.
9. The UI makes the mounting danger legible, but does not leak hidden movements or who performed unseen deeds unless that reveal is explicitly allowed.
10. An approved Light sabotage event disables/reduces a corruption source's applicable **passive rate contribution**, **without lowering accumulated Dark Energy**. The exact impact and duration await design approval.
11. Attempting the same completed sabotage repeatedly does not repeatedly decrease the awakening rate without new valid game events.

## Remaining design questions
1. **Resolved in principle (D-019):** Light Heroes can **slow the awakening rate through sabotage**, but cannot directly reverse accumulated energy. **Open:** which activities qualify, their risk and counterplay.
2. Which activities count as **one-time evil deeds**, how small their immediate energy drops are, and whether deed rewards have cooldowns or anti-farming limits?
3. **D-021/D-022 confirm** major landmarks and smaller constructible sources, and purified major landmarks becoming Light-controlled sanctuaries. **Open:** which landmarks qualify, how and where structures can be placed, what exact recovery/progression services and upgrade/ward mechanics sanctuaries provide, two-stage siege timing, Light restoration ritual initiation/interruption and costs, Dark control/decay conditions, and Dark Hero ritual advantage, how contributions combine, and what ends them?
4. What does *tiered* mean mechanically: distinct stages, unlockable effects or visual escalation? What happens at each threshold?
5. How is the dormant Lord defended or exposed during a sanctum raid?
6. What exactly counts as a win after awakening, and how is the battle prevented from lasting forever?

## Review instructions
Preserve the creator's established rule: natural time fills Dark Energy; individual evil deeds grant small **instant** energy drops without affecting passive rate; corruption sources increase passive generation; Light sabotage slows passive generation but does not subtract accumulated energy; early Light sanctum breach can kill the dormant Lord; awakening forces a final battle with the awakened Lord and Dark Heroes. Never reinterpret this as either a fixed countdown only or an automatic Dark win.
