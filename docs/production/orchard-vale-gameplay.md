# Orchard Vale gameplay milestone

The creator accepted the performance playtest and chose to build the game in Orchard Vale first, then extend it to the other biomes and the castle. The first build turns the existing hunt into a contest over a Dark Energy source.

## Play the relay contest

Open `/?region=orchard_operation&bakedShadows=1` on the running game server. Light starts on the west road. Open the same URL with `&team=dark` for the Dark commander at the north road. The default setup reserves one human seat on each team and fills six seats with bots. When a human plays Light, Light bots take up positions along the approaches and leave sabotage to the player. Use `GRIMM_BOTS=none` at startup to test with humans only.

- Light can take the bridge or the upstream ford to reach the relay just north of the bridge. Stop next to it and press **R** to sabotage. Keep it offline for 25 consecutive seconds to secure the Vale.
- Dark can post the Scout along the approach and move the Dark Hero to protect the relay. If it goes offline, stop next to it and press **R** to repair it. The Dark side holds the Vale if the relay delivers 480 output first. Reload after the result to join a fresh contest.
- Moving, pressing **X**, or a nearby enemy with legitimate sight interrupts the attempt. A Scout must have confirmed the player before it interrupts. Repair restores production and resets the offline timer.
- Dark Energy continues accumulating while the relay is offline. Sabotage removes the relay's contribution to future production and leaves banked energy intact.

The relay, interaction timings, interruption range, and local scoring are playtest proposals. They instantiate D-017 and D-019 through D-021. A local result ends this regional playtest. The kingdom match still ends under the separate castle and Dark Lord rules. The old M1 cache hunt is available through `/?region=orchard_vale`.

## Goblin player interface

The Light relay seat starts in hero view with the new player dock. **Tab** switches views, **I** opens inventory, and **Esc** closes it. The dock reads live detection and whistle cooldown from the player snapshot. Use **Shift** or the Sneak button for stealth, and **F** or the Whistle button to distract a Scout. The relay action appears when the simulation permits it.

Append `&hud=preview` to the Orchard operation URL to try the sample kit. Select a carried item to inspect it, equip or unequip a gear piece, drop one item from a stack, or assign a quick item to **1–3**. Outside assignment, those keys inspect the item. The kit resets on reload. Preview health and cargo are sample values. Strike, evade, item effects, and acquiring real gear or heist cargo are pending gameplay rules.

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
