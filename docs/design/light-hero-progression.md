# Light Hero progression: shared foundation and character identity

**Status:** Hybrid structure and shared equipment/resource foundation confirmed (D-042 through D-049); specific economy and individual mechanics are **not yet approved**.
**Authority:** [Decision register](../decisions.md), particularly D-005, D-010, D-013, D-023, D-042, D-043, D-044, D-045, D-046, D-047, D-048 and D-049.
**Timing:** M2 should introduce a small credible shared progression loop; M3 can develop differentiated character identity. Do not interrupt current gameplay engineering to implement unapproved mechanics.

## Confirmed
- Every Light Hero participates in a **shared foundational progression layer of equipment and resources** (D-043). This provides a common acquisition and improvement language without requiring an XP bar or identical equipment loadouts.
- Each Light Hero also has a **distinct character-specific progression system**. Characters can advance through different activities and resources, and can use shared materials/equipment in different ways. Specific class-specific uses remain proposals, not approved kits.
- Light Heroes grow strong enough to threaten the Dark Lord and castle, while the Dark side hunts them and accelerates awakening.
- Light-controlled sanctuaries provide recovery **and character progression opportunities** (D-023); exactly how they contribute is open.
- **Hybrid resource acquisition (D-044):** Light Heroes find useful equipment and resources while exploring the kingdom, and earn larger rewards for completing meaningful world objectives. Individual characters may seek different activities and locations. Actual loot tables, missions, resource quantities and resource respawn policy are unapproved.
- **Hybrid upgrading (D-045):** Light Heroes can change gear, craft simple items, and perform minor improvements in the field. Significant upgrades require an appropriate sanctuary, workshop, or other specialized site. What counts as major/minor, exact facilities and resource costs remain open. Do not automatically require a return trip for routine preparation.
- **Hybrid resource ownership (D-046):** personal equipment, special ingredients and character-specific materials belong to the collecting Light Hero. Common resources earned through major objectives contribute to a **shared team pool**. Trade permissions, which rewards are classified as common, and protections against one player draining the pool are not yet approved.
- **Hybrid shared spending (D-047):** routine/small shared-pool purchases do **not** require a team-wide vote each time; costly/major investments require team authorization. **Prevent repeated minor purchases from draining the pool.**
- **Confirmed (D-048): hybrid spending allowances.** Every Light Hero earns a **baseline allowance from team successes**, plus **bonus spending rights for meaningful individual contributions**. Allowances can fund the player's smaller purchases or be **pledged voluntarily** to a major team purchase. They are **permissions to draw down actual shared resources, not additional currency**. Spending consumes the shared resource pool **exactly once** and reduces the relevant allocation. A contribution system must recognize scouting, support, defense and cooperation, not just last hits. Exact ratios, events, caps, resets and approval conditions remain unresolved.
- **Confirmed (D-049): voluntary pledges approve major investments.** A major investment proceeds when the pledges add up to its required allowance commitment **and** sufficient actual shared resources remain. **No second team vote.** An allowance already pledged must not simultaneously be spent on a minor purchase, and a completed purchase deducts the actual pool only once. How to reserve/release pledges, deal with changing pool balance, prevent spam proposals, and handle simultaneous purchases remains open for design and server validation.
- Character differences must preserve shared stealth, cover and detection foundations (D-013).

## Existing character designs in the original GDD

**Source:** [Original Grimm Domain Design Document (PDF)](../Copy%20of%20Grimm%20Domain%20Design%20Document.docx.pdf), section **The Rebellious Heroes (4 Players)**. These are **existing GDD concepts**, not newly invented alternatives. The GDD predates the decisions register, so only explicit creator approvals count as confirmed rules.

| GDD character | Distinct progression loop already described | Signature locations and activities | Important reconciliation |
| --- | --- | --- | --- |
| **Goblin Outlaw (Stealthy Thief)** | Accumulates **Gold** from monsters, village theft and hidden stashes; purchases gadgets, weapon/boot upgrades and tricks | Finds a **randomized secret tavern** where valuable upgrades are bought, and must avoid leading Dark Scouts to it | The GDD's default-invisibility and >2-second sight detection are **historical suggested values**, not approved stealth rules. Goblin-specific stealth must conform to D-013's shared perception foundation with modifiers. Personal gold and tavern purchases must be reconciled with D-046 through D-049 resource ownership and the D-045 major-upgrade location rule. |
| **Alchemist (Explorer & Potion Master)** | Searches for biome-specific ingredients, **experiments with potion combinations**, records learned recipes in a journal; potions alter combat or support abilities | Swamps, forests, caverns and monsters provide reagents. Portable mixing kit for brewing, with some experiments causing noise, waste or danger | Basic field mixing is compatible with D-045. More advanced recipes or laboratory work can fit major location-based upgrades, but exact tiers are unapproved. GDD's randomized-per-match potion outputs must be **seeded/deterministic** under server authority if retained. |
| **Exiled Knight (Brave Melee Warrior)** | Gains **Valor** through combat and heroic deeds, advances with a character-specific leveling track, gains relics and armor/weapon improvements | Protect villages, rescue villagers, clear threats, recover sacred artifacts, and escort/support allies | **Knight-specific Valor leveling** is compatible with D-042's shared equipment/resources because it is his unique progression, **not a universal XP requirement**. Fighting can create noise and attract hunts under D-013/D-014. Exact abilities, item rewards and experience thresholds remain proposed. |
| **Forest Witch (Arcane Saboteur)** | Gains **Arcane Power** by finding ley-line shrines and performing rituals, unlocks spells and magically weakens Dark influence | World Tree, mushroom ring, standing stones and other shrines. Ritual control, magic-gathering and support/debuff abilities | GDD shrine purification anticipates D-019's slower passive Dark Energy and D-022's sanctuary conversion. But **which shrines are major landmarks, who can purify them, and whether the Witch has extra benefits** need reconciliation. Old numeric claims (e.g. 10-second channel and 10% income reduction) are not approved. |

### Distinguish historical GDD from current canon
The GDD contains outdated or exploratory mechanics, including **permanent Light Hero elimination** that has been superseded by the body/ghost revival design (D-032 onward), and a fixed Dark victory condition tied to timer rather than the confirmed awakening/final battle. Old mechanic values and named abilities should be treated as **design candidates**, not silently hardcoded.

The four character identities and core loops are **already documented**. Do not ask the creator to choose a newly invented archetype before reading those sections. The next useful step is a **system-by-system reconciliation**, preserving each distinctive loop while resolving conflicts with our confirmed shared resource, sanctuary and stealth mechanics.

## Open choices
1. **Pledge accounting and anti-abuse before coding:** decide withdrawal, reservation, purchase thresholds, expiry and handling competing major proposals. Voluntary pledges authorize major spending (D-049), with no separate vote. Exact contribution weights and allowance caps remain open.
2. **Character progression reconciliation:** the original GDD already describes the Goblin Outlaw, Alchemist, Exiled Knight and Forest Witch in depth. Preserve their core concepts as historical design inputs; reconcile proposed mechanics with D-012/D-013 stealth, D-019/D-020 corruption, D-022 sanctuary conversion, D-042/D-049 economy and D-032 onward ghost revival. Do not silently promote all GDD ability suggestions to approved canon.
3. **Reward structure:** power ceiling, ability progression, unlock pacing, upgrade choices, and whether upgrades can be lost on death.
4. **Sanctuary role:** purchases, rituals, ability training, or character-specific interactions with purified landmarks?
5. **Match pacing:** ensure one Hero cannot dominate by repeated farming while others are occupied. Progress must remain practical in a multiplayer 4v4 match.
6. **Observability:** show the player what their next meaningful progression objective is without reducing each role to the same meter.

## Design standards for later implementation
- Shared progression should lower learning friction, **not erase character differences**.
- Every character must have at least one interesting decision about how to advance, rather than merely receiving passive stat increases.
- Advancement actions must create readable risks or map interactions for the opposing side.
- Resurrection and ghost play (D-032 onward) must not accidentally allow unbounded upgrade farming.
- The server must determine and validate earned progression. No client-declared XP, resource gains or unlocked abilities.
- **Do not treat example class systems, materials, currency numbers, or XP curves as approved.**

## Next design gate
**Reconcile the four existing GDD hero loops with decisions D-012 through D-049** before selecting a first character vertical slice. The core loops already exist. Verify their intended interactions with personal materials, major/specialized upgrade locations, world objectives, sanctuaries and revival. Separately resolve pledge accounting and anti-farming before coding the team economy.
