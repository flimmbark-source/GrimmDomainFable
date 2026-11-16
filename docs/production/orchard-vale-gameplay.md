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

Every hero starts with a weapon. Light also starts with one salve in quick slot 1. Dark starts with a cleaver equipped and a javelin in the bag. The catalogue has 29 items. Each Light Hero collects their own share of every find by walking over it. Finds glow gold for gear, green for usable items and grey for materials.

| Slot | Item | What it does | Where |
| --- | --- | --- | --- |
| Weapon | Dagger | Close sweep, 16 damage, quick | Starting |
| | Twin knives | Very fast light cuts, short reach | Ford lane |
| | Hatchet | Wide sweep that also hits beside you | South-west terrace |
| | Cudgel | Heavy blow that knocks the enemy back 1.8 m | Old road, north |
| | Billhook | Narrow thrust with 3.4 m reach, slow | Village, south of the bridge |
| | Sling | Straight 9 m shot; hits the first enemy, cover stops it | West gate |
| | Hand crossbow | 13 m bolt, 30 damage, long reload | Mill yard |
| | Cleaver, Javelin | Dark Hero's sweep and thrown spear | Dark starting kit |
| Boots | Springheel | Evade travels 4 m in place of 2.4 m | West road |
| | Softsole | Sneak at 70% of running speed | West road |
| | Catspaw | Running and fighting are heard half as far | East road |
| | Courier | Run 10% faster | Castle road |
| | Tumbler | Evade recovers in a third of the time | North-east |
| Charm | Spiral | Salves heal 48 in place of 30 | West road |
| | Ironbark | Maximum health +30 | Upper terrace |
| | Thorn | A close attacker takes 5 damage back | The ruin |
| | Dusk | Monsters take about 40% longer to notice you | North bank |
| | Whetstone | Weapon damage +25% | North of the bridge |
| Active | Salve, Apple, Cheese | Restore 30, 10 and 18 health | West road, west gate, village |
| | Smoke pot | Monsters within 12 m lose you and cannot see you for 3 s | Ford, north bank |
| | Throwing stone | Clatters 9 m ahead and draws monsters there | West road |
| | Quickening draught | Run 35% faster for 6 s | South-east terrace |
| Material | Lavender, Coin, Sealed scroll, Lockpicks | Carried stacks. Nothing uses them yet | Ford lane, east road, old road, junction |

Evade and Sneak work with the boots slot empty, and a wall or the river still stops any Evade. Gear effects are read from what is worn when the action happens, so the line under the portrait and the inventory text change the moment you equip, swap or unequip. Icons are shared between related items and told apart by colour until they have art of their own.

## Fighting, death and recovery

Scouts and Brutes now attack a hero they have caught, and can be fought. A beaten monster is out for 20 seconds and then walks back to its post. A fallen Dark Hero returns at the castle road after 12 seconds.

A Light Hero who dies leaves a **body** where they fell and plays on as a **ghost**. The ghost can travel and nothing else. It is sent no enemy positions and the Dark side is never sent the ghost.

- **At the body.** Another living Light Hero stands beside it, presses **R** and holds still for 4 seconds. Moving or taking a hit breaks it. The ghost cannot do this for itself.
- **At a wayshrine.** Two stand in for sanctuaries: one south of the west road, one in the north orchard west of the relay. The ghost steps into the stone circle and presses **R**. The ritual takes 20 seconds for the newly dead and less the longer the hero has been dead, down to 6. Fighting nearby does not interrupt it.
- **Corruption.** Dark monsters or a Dark Hero inside a wayshrine's precinct corrupt it; a Dark Hero in person is faster. Light sees an alert with the corruption level and no attacker. A ritual under way continues during the siege. If the wayshrine becomes fully corrupted first, the ritual ends and the ghost must reach the other one.

## Fog of war

Unseen terrain is dark grey. Terrain visited or seen before is dimmed when it leaves current sight. Current sight is clear. The mask updates from the local hero and the viewer's own monsters, using the same sight blockers, ranges, and monster arcs as the simulation. A teammate sees confirmed reports and retains the existing visibility of allied actors. Their Scout's sight cone stays private. Enemy actors still come exclusively from server projections.

Explored terrain is currently remembered in the client session for each seat. The faction chart, shared geography discoveries, and persistent map knowledge belong to D-088 through D-090 and are future work.

## Playtest steps

```bash
npm ci
npm run build
GRIMM_RELAY_GOAL=3600 npm start
```

1. Open `http://localhost:2567/?region=orchard_operation&bakedShadows=1` for Light. In a second window add `&team=dark` for Dark. The other six seats are bots.
2. **Light, controls.** Left-click the road to walk. Drag to turn the camera. Right-click the ground and choose Whistle: the hero walks there, then whistles. Press **S**, **E**, **A**, **W**. Queue a Sneak with the menu and press **X** before arriving. Right-click a hedge and choose any action: the hero stops at the nearest clear ground and acts.
3. **Light, gear.** Walk east along the west road and collect the finds. Press **I**. Equip the sling and press **A**: the mark on the ground changes from a wedge to a streak. Equip the springheel boots and press **E**. Equip and unequip the spiral charm and watch `Salve +48 / +30` under the portrait. Select a salve, press Assign, then **2**.
4. **Dark, command.** In command view right-click the road west of the square to post the Scout. Left-click the Brute, then right-click to post it. Walk the Dark Hero to the Light hero and press **A**. The Scout stays on its post.
5. **Light, quick slot.** After taking a hit, press the salve's number. Health rises and the count drops.
6. **Pursuit.** Walk the Light hero toward the posted Scout until the eye shows Spotted, then leave the road north behind the hedge and cross the ford. The Dark window shows a timed `Hero SIGHTED` report, then `Lost sight here`.
7. **Death at a wayshrine.** Have the Dark Hero kill the Light hero near the west wayshrine (south of the west road), then stand inside the stone ring. As the ghost, walk into the ring and press **R** once corruption is past about 60%. The ritual runs during the siege and ends when the wayshrine falls. Walk the ghost to the north wayshrine (north orchard, west of the relay) and press **R** there.
8. **Rescue at the body.** Die within about 30 m of the Light bots near the relay and wait. A bot walks to the body and revives you. With two Light humans, stand by the body and press **R**.
9. **Sabotage.** Stand by the relay north of the bridge and press **R**. `Dark Energy … (+3/s)` at the top of both windows drops to `(+1/s)` and the total keeps its value. A Dark repair puts it back.

## Verification

Run on 2026-11-16 in a Linux container, Node 22, software-rendered Chromium.

- `npm run typecheck` and `npm run build`: clean.
- `npm test`: **150 tests pass** in 10 files. 29 are new in `tests/orchard-contest.test.ts`: weapon patterns, each gear effect, items, hotkey and arrival orders sharing one rule, blocked ground, cancel, the Dark Hero fighting while monsters hold orders, Scout report privacy, the ghost's view, revival eligibility, ritual length by time dead, a ritual through a siege and its end at full corruption, and a seeded bot contest that reproduces exactly.
- `npm run verify:contest`: the live run with one browser per side, real mouse and keyboard, and six bots. The last run passed **46 of 48 checks**; the one before passed 44. No single run passed all 48, and the misses moved between runs: every check has passed in at least one run. The cause each time was the bots' own fight changing the scene, for example Light bots killing the Dark human's hero before a scripted duel. In the last run the two misses were the rescue at the body (the Dark Hero never reached the Light hero to kill it); that route passed in three earlier runs. A retry was added to the script for that case and has not been rerun. Screenshots are in `docs/evidence/contest-*.png`; start the server with `GRIMM_SEED=7 GRIMM_RELAY_GOAL=3600` to repeat it.

Not verified: frame rate and feel on real graphics hardware (the run draws about two frames a second in software), audio by ear, two Light humans rescuing each other in a browser (covered in simulation), and the older `verify:orchard` and `verify:m1` browser suites, which were not rerun after the input changes.

## Known gaps

- **Balance is untuned.** Three Light bots usually beat the relay's two monsters, and a hero who stands still next to a Scout and a Dark Hero dies in seconds. Damage, health and timers are first guesses.
- **The default contest is short.** With the relay never sabotaged Dark wins in about four minutes, which is not enough to try the gear. Use `GRIMM_RELAY_GOAL`.
- **Sanctuaries are stand-ins.** No wards, no two-stage siege, no repair, no purification. A corrupted wayshrine stays corrupted. With both corrupted, only a rescue at the body can bring a hero back.
- **Ghosts have no spirit layer** beyond a colour wash: no ghost paths, obstacles or senses (D-035 to D-037).
- **Dark death, monster death and bot behaviour are placeholders.** Final Dark victory rules and bot takeover timing are still open in the decision register.
- **An action-menu Attack walks onto the clicked point.** Click beside an enemy, not on it. Whether Attack should stop at weapon reach is a design question.
- **A, S, E and W are actions**, so movement is the mouse or the arrow keys. Players used to WASD will trip on it.
- **Art.** Heroes, monsters and wayshrines are original low-poly stand-ins built in code. Several items share an icon. No animation beyond bob, lean and swing.
- Materials have no use. Dropped items vanish. Heroes still pass through each other.

## From regional contest to kingdom match

1. Creator playtest of this slice with both seats, then decisions on P-20 to P-33.
2. One complete Light progression loop with a reward the player keeps, and the real sanctuary siege.
3. Add one adjacent biome through an existing connector. Both routes and the authoritative match state must continue across the boundary. Run the same hunt, objective, and information-privacy checks on both sides.
4. Apply the working region pattern to the rest of the kingdom. Build the castle as the shared endgame, including a route to kill the dormant Lord and the separate awakened confrontation.
