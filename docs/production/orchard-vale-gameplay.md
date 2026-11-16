# Orchard Vale gameplay milestone

The creator accepted the performance playtest and chose to build the game in Orchard Vale first, then extend it to the other biomes and the castle. The first build turns the existing hunt into a contest over a Dark Energy source.

## Play the relay contest

Open `/?region=orchard_operation&bakedShadows=1` on the running game server. Light starts on the west road. Open the same URL with `&team=dark` for the Dark commander at the north road. The default setup reserves one human seat on each team and fills six seats with bots. When a human plays Light, Light bots take up positions along the approaches and leave sabotage to the player. Use `GRIMM_BOTS=none` at startup to test with humans only. `GRIMM_RELAY_GOAL=3600` gives a session long enough to try everything below; the default 480 ends in about four minutes if the relay is never sabotaged.

- Light can take the bridge or the upstream ford to reach the relay just north of the bridge. Stop next to it and press **R** to sabotage. Keep it offline for 25 consecutive seconds to secure the Vale. Gear lies along the west road on the way.
- Dark can post the Scout along the approach and move the Dark Hero to protect the relay. If it goes offline, stop next to it and press **R** to repair it. The Dark side holds the Vale if the relay delivers 480 output first. Reload after the result to join a fresh contest.
- Moving, pressing **X**, taking damage, or a nearby enemy with legitimate sight interrupts the attempt. A Scout must have confirmed the player before it interrupts. Repair restores production and resets the offline timer.
- Dark Energy continues accumulating while the relay is offline. Sabotage removes the relay's contribution to future production and leaves banked energy intact.

The relay, interaction timings, interruption range, local scoring, and every gear, damage and revival number below are playtest proposals (P-20 to P-33 in the [decision register](../decisions.md)). They instantiate D-017 and D-019 through D-021. A local result ends this regional playtest. The kingdom match still ends under the separate castle and Dark Lord rules. The old M1 cache hunt is available through `/?region=orchard_vale`.

## Controls in the contest

Both seats use the same hero controls and HUD. Light starts in hero view, Dark in command view. **Tab** switches.

| Input | What it does |
| --- | --- |
| Left-click terrain | Move the hero there. Works in both views |
| Left-drag | Turn the hero camera (hero view) |
| Right-click terrain | Open the action menu at the cursor. Left-click an option and the hero walks to that point and performs the action on arrival |
| **A** / **S** / **E** / **W** | Attack / Sneak / Evade / Whistle at once, where the hero stands |
| **X** | Stop. Cancels a queued action, a relay attempt, a rescue or a ritual |
| **1** to **3** | Use the item in that quick slot |
| **I** | Inventory: equip, unequip, assign to a quick slot, drop. **Esc** closes it |
| **R** | Sabotage or repair the relay, revive an ally at their body, or begin a ghost's ritual |
| Arrow keys | Move in hero view, pan in the other view |
| Dark, command view | Left-click one of your monsters to select it. **Right-click posts the selected monster.** **P** returns it to its assignment |

Hotkeys and action-menu orders run the same server rule, one now and one on arrival. A click on blocked ground sends the hero to the nearest point it can stand on. The server owns health, the bag, worn gear and quick slots; the HUD only shows what it was sent.

## Equipment and items

Every hero starts with a weapon. Light also starts with one salve in quick slot 1.

- **Weapon** supplies Attack. The dagger is a close sweep. The **sling**, found near the west gate, is a slow straight shot with four times the reach that hits only the first enemy on its line and is stopped by cover. Swapping changes the attack mark drawn on the ground and the line under the portrait.
- **Boots** change Evade. Evade and Sneak work with the slot empty. The **springheel boots** on the west road carry an Evade 4 m in place of 2.4 m. A wall or the river still stops it.
- **Charm** is a passive. The **spiral charm** on the west road makes a salve restore 48 in place of 30. The figure under the portrait changes the moment the charm goes on or comes off.
- **Salve** is the active item: two more lie on the west road. **Lavender** is a material stack: three on the ford lane, two near the relay. Nothing uses materials yet.

Finds show as floating icons. Walk over one to collect it. Each Light Hero has their own share.

## Fighting, death and recovery

Scouts and Brutes now attack a hero they have caught, and can be fought. A beaten monster is out for 20 seconds and then walks back to its post. A fallen Dark Hero returns at the castle road after 12 seconds.

A Light Hero who dies leaves a **body** where they fell and plays on as a **ghost**. The ghost can travel and nothing else. It is sent no enemy positions and the Dark side is never sent the ghost.

- **At the body.** Another living Light Hero stands beside it, presses **R** and holds still for 4 seconds. Moving or taking a hit breaks it. The ghost cannot do this for itself.
- **At a wayshrine.** Two stand in for sanctuaries: one south of the west road, one in the north orchard west of the relay. The ghost steps into the stone circle and presses **R**. The ritual takes 20 seconds for the newly dead and less the longer the hero has been dead, down to 6. Fighting nearby does not interrupt it.
- **Corruption.** Dark monsters or a Dark Hero inside a wayshrine's precinct corrupt it; a Dark Hero in person is faster. Light sees an alert with the corruption level and no attacker. A ritual under way continues during the siege. If the wayshrine becomes fully corrupted first, the ritual ends and the ghost must reach the other one.

## Fog of war

Unseen terrain is dark grey. Terrain visited or seen before is dimmed when it leaves current sight. Current sight is clear. The mask updates from the local hero and the viewer's own monsters, using the same sight blockers, ranges, and monster arcs as the simulation. A teammate sees confirmed reports and retains the existing visibility of allied actors. Their Scout's sight cone stays private. Enemy actors still come exclusively from server projections.

Explored terrain is currently remembered in the client session for each seat. The faction chart, shared geography discoveries, and persistent map knowledge belong to D-088 through D-090 and are future work.

## Verification

Typecheck, build and 117 automated tests passed. A Chromium playtest used the real server and keyboard sabotage input, reached the Light result, and confirmed that both clients received it. A separate three-client Chromium check compared the uploaded fog masks and confirmed that the Scout cleared terrain for its owner alone. Dark repair and both local outcomes are covered by simulation tests. Frame pacing with fog on the creator's hardware remains to be measured.

## From regional contest to kingdom match

1. Playtest the relay with both seats. Check whether Light can reach and hold the objective through route choice, cover and distraction, and whether Dark has a meaningful choice about where to post the Scout.
2. Add the first combat and recovery rules to the same scenario, then one complete Light progression loop with a reward the player can use. Keep the existing rules for bodies, ghosts, and sanctuary revival when testing death. The first class, damage rules, and caught-hero consequence still need design decisions.
3. Add one adjacent biome through an existing connector. Both routes and the authoritative match state must continue across the boundary. Run the same hunt, objective, and information-privacy checks on both sides.
4. Apply the working region pattern to the rest of the kingdom. Build the castle as the shared endgame, including a route to kill the dormant Lord and the separate awakened confrontation.
