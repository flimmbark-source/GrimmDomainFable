# M1 playtest checklist: hunt and escape at the forest crossing

For the creator and ChatGPT. Automated tests show the rules hold; they cannot show the encounter is fun. Record what you observed, what you misunderstood, and any exploit.

## Set up
```bash
npm ci
```
```bash
npm run dev
```
Open http://localhost:5173 (Light hero). For the Dark side open a second tab with `?team=dark`: the **first** Dark tab owns the Scout, a second Dark tab is a teammate who owns nothing. `?spectate=1` watches without a seat.

To play without the two default bots (quieter, easier to judge):
```bash
GRIMM_BOTS=none npm run dev:server
```
```bash
npm run dev:client
```

Controls: click to move (strategy view) or WASD (hero view, Tab switches). **Shift** sneak (slow, silent). **F** whistle. Dark owner: **right-click** posts the Scout, **P** sends it back to its patrol. **G** shows colliders: magenta blocks sight, grey does not.

## The scene
Two caches, far west and far east. The Scout walks up and down the road between them. Three ways across: straight through the middle (short, exposed, two standing stones), the south belt of wall/thicket/boulder (long, covered, one open gap where the road cuts through), or north behind the house (covered from the road, but past the Dark spawn). Stand still on a cache for 3 seconds to open it.

## Scenario 1: blind crossing (Light, no instruction)
Collect both caches.
- [ ] Without being told, did you work out that the Scout watches the road and that walls, thickets, boulders and trees hide you?
- [ ] Could you tell which way the Scout was looking?
- [ ] Did you notice the eye indicator and the heartbeat, and understand them? Too loud, too quiet, too late?
- [ ] Did you ever feel spotted for no visible reason? Where?
- [ ] Was the covered route worth its extra length, or was running straight across just better?

## Scenario 2: deliberate escape (Light)
Stand in the road gap until the Scout howls, then get away.
- [ ] Did you escape by breaking its sight, or only by outrunning it?
- [ ] After you hid, did it go to where it LAST SAW you rather than to you?
- [ ] Was the escape too easy, too hard, or about right? (Measured: about 10 s through cover, about 13 s in the open. That gap is small.)
- [ ] Try the whistle: whistle behind a wall, sneak away. Did the Scout go to the sound?
- [ ] Being caught currently does nothing (no combat yet). Note how that changes your behaviour.

## Scenario 3: commander inference (Dark, two tabs)
Owner tab and teammate tab, someone else or a bot playing Light.
- [ ] Owner: do the report markers (!, ×, ?, ♪) and their ages give you at least two plausible choices (guard a cache, go yourself, keep patrolling)?
- [ ] Owner: right-click to post the Scout at a cache. Did that feel like a real decision?
- [ ] Teammate: you get the sighting alert but never see the hero through the Scout. Is one frozen marker enough to act on? Too little?
- [ ] Can a teammate track the hero anyway by watching where the allied Scout runs? Is that acceptable? (See provisional choice P-1 in decisions.md.)

## Things to try to break
- Hug a tree trunk: is cover from a single tree too fiddly?
- Stand right behind the Scout: it senses you within 2 m regardless of facing.
- Run close past it behind a wall: it should hear footsteps within 7 m.
- Spam the whistle (4 s cooldown).
