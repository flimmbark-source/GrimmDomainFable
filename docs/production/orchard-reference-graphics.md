# Orchard reference graphics

Target: the 13 November reference image, now kept at
[`docs/references/orchard-reference-2026-11-13.webp`](../references/orchard-reference-2026-11-13.webp).
Faceted low-poly crowns and hedges with clear lit and shaded planes, warm light
with cool green shade, clean bright grass, warm paths, calm deep-teal water, and
dark billowing smoke framing what the hero can see.

Constraint from the creator: keep the current frame rate, using known techniques.
This pass adds no render pass, render target, draw call or triangle. Every
shading change is either load-time work or replaces per-pixel work with
something cheaper. It is a closer match, not a finished one (see "Gaps").

Scope: the Orchard Vale region renderer only (`?region=orchard_vale`,
`?region=orchard_operation`). The M1 crossing, simulation, server projection,
HUD, camera and gameplay are unchanged.

## What changed and why

Measured first, then changed. Reference against the previous build (median
over the play area, at the same framing; hue of green pixels in degrees):

| | Reference | Before | After |
| --- | --- | --- | --- |
| Green hue, median (bridge / village / orchard) | 77 | 60 / 67 / 68 (olive) | 69 / 78 / 78 |
| Lit-green saturation, median | 0.64 | 0.74–0.75 | 0.65–0.66 |
| Share of greens that are dark | 37% | 18–43% | 17–41% (unchanged: set by how many trees and hedges are in frame) |

1. **Light colour, not tone mapping, made the greens olive.** The old sun,
   `0xffe2b0`, is (1.0, 0.76, 0.43) in linear light: a strongly orange key that
   pushes every lit green towards yellow. Swapping ACES for Khronos Neutral or
   AgX moved hue by 3° or less and lost highlight contrast, so ACES stays (its
   toe gives the deep darks the reference has). Now: a less orange sun
   (`0xffeccc`), a bluer sky fill (`0xa9c4e6`) so shade is cool green, grass
   albedos about 10° greener and 12% less saturated. Sun 2.65 → 3.1, fill
   1.25 → 1.0, so faceted crowns and hedges show distinct sunlit and shaded
   planes. Exposure and the M1 palette are untouched.
2. **Ground: one texture fetch instead of two 3D value noises per pixel.** The
   ground and backdrop grain and blotches now come from a 256² tiling noise
   texture generated at load (`noiseTexture.ts`). It is mipmapped, so the
   grain also stops shimmering at strategy distance.
3. **Canopy shade baked into the ground painting.** Each tree paints a broad,
   cool green shade the size of its crown into the ground canvas at load (sky
   occlusion), under the existing contact shade. No runtime cost.
4. **Grass tufts** use lighter blades with less base shade, so they read as
   yellow-green accents instead of dark scratches from above. Same instances.
5. **Water** is calm deep teal with small sparse light flecks instead of bright
   cyan with large white blotches. Its ripples are two fetches of the shared
   texture (scrolled downstream at two rates) instead of three 3D value noises.
6. **Sky clouds** are one fetch of the shared texture instead of three 3D value
   noises; mipmapping also removes their aliasing near the horizon.
7. **Fog of war (P-20)**, see below.

The faceted crowns and hedges and the goblin model are from the previous draft
commit (`a644a63`) and are unchanged here.

## Fog of war presentation

Before: a flat grey wash, 84% over never-seen ground and 55% over remembered
ground, with a hard edge from linear filtering of the 0.75 m mask.

Now:
- **Never seen:** dark charcoal smoke (reference `#252726`–`#393530`) with
  lighter billows a metre to several metres across, fixed to the ground.
- **Remembered:** muted (55% desaturated) and dimmed, so remembered terrain still
  reads as terrain.
- **In sight:** untouched.
- **Edge:** the mask is feathered (two separable box blurs, about 3 m), and the
  billows push the threshold in and out, so the edge is soft and ragged.

Cost: every fog state is an affine recolouring of the lit colour,
`out = col·a + grey(col)·b + c`, where a, b and c depend only on the cell. The
CPU computes them into the mask texture when the mask changes, so the shader
does one fetch, one dot product and two multiply-adds. Before, it did one
fetch and three mixes. Fragments well inside current sight return immediately.
The blur and transform run only when the view changes (at most 10 Hz), and
only over the cells the eyes could reach this refresh or the last one, plus
the blur's margin. `tests/vision-fog.test.ts` checks that this incremental
result matches a pass over the whole mask after walking, a long jump and both
map corners, and that a deliberately stale window fails it.

Two earlier versions computed the smoke per pixel: one sampled a separate
drifting smoke texture, the other baked the billows into the mask and animated
them with `sin()`. Both measured 3 to 10% slower than the base in every fogged
view (table below), so neither was kept. The smoke no longer moves; animating
it would mean re-encoding the whole mask a few times a second.

Unchanged: the sight mask itself (same cells, ranges, arcs and blockers),
explored-terrain memory, and actor visibility, which still comes only from
server snapshots. The blur and billows can shift where the drawn edge falls
by about a metre; terrain is not secret and no actor is affected.

## Measured cost

Method: `window.__grimm.benchmarkFrames()` (new, `?profile=1`). It renders the
current view back to back and waits on a one-pixel read-back after each, so it
is not vsync-capped. Same machine, viewport (1280 × 720, DPR 1), seed, URL
(`?region=orchard_operation&bakedShadows=1`), hero position and camera poses.
Base and new builds were served side by side and run interleaved to cancel drift.

**Device: this cloud container, headless Chromium with SwiftShader (software
WebGL on 4 vCPUs).** Absolute times (hundreds of ms per frame) say nothing about
a real GPU. Relative cost is the evidence. Software rendering is dominated by
per-pixel work, which is what this pass changes; the shadow refresh is cheap
here with baked shadows. Run-to-run noise is about ±5%, more in hero view,
where the monsters' positions change what is on screen.

Fog of war on (Light seat), base vs this build, two interleaved runs each,
median ms per frame:

| View | Base | This build | Change |
| --- | --- | --- | --- |
| Strategy, north of the bridge (reference framing) | 390, 397 | 386, 396 | −0.5% |
| Strategy, zoomed out | 519, 576 | 538, 548 | −1% |
| Hero view at the relay | 760, 747 | 685, 710 | −7% |

No fog (spectator): this isolates the ground, water, sky and light changes.

| View | Base | This build | Change |
| --- | --- | --- | --- |
| Bridge | 380, 357 | 334, 355 | −6% |
| Village | 552, 502 | 449, 486 | −11% |
| Orchard edge | 311, 327 | 300, 297 | −6% |

Rejected per-pixel smoke versions in the same kind of run (mean of two, against
the base measured alongside them): drifting texture +6.6% / +2.7% / +8.8%, and
baked billows animated with `sin()` +5.3% / +3.3% / +9.8% (bridge / zoomed out /
hero).

A last run of the final build (after thinning the water's flecks, which only
changes two thresholds) gave 398 / 515 / 685 ms with fog and 329 / 476 / 311 ms
without, in line with the table.

Draw calls and triangles are the same for both builds at each pose (the
benchmark reads them from the renderer). The exception is one base run at the
bridge, which drew 10 more calls because of where the monsters stood.

## Verification

- `npm run typecheck`, `npm run build`: pass.
- `npm test`: 119 passed (117 existing, plus 2 new in `tests/vision-fog.test.ts`).
  The incremental-feathering test was checked against a deliberately
  reintroduced stale-window bug and failed as it should (off by 84 levels).
- `npm run verify:orchard`: 21/21, headless Chromium against the real server
  (`GRIMM_BOTS=none GRIMM_SEED=7`), no console errors. Run before the final
  water-fleck threshold change. That check rewrites the committed
  `orchard-vale-*` evidence screenshots, and those were restored, so the earlier
  report's captures still match its text.
- `npm run verify:browser -- http://localhost:2567` (M0, default map, which
  shares `main.ts`): 17/17 on a fresh server. On a server that had already been
  running the other checks for over an hour, one run gave 16/17. The Scout moved
  0.9 m (needs more than 1 m) during the click-to-move window. The default map's
  renderer and simulation are untouched; this matches the wall-clock timing
  flakiness recorded in the Orchard Vale implementation report.
- Captures: `docs/evidence/orchard-reference-*-before-after.png` (same seed,
  hero position and camera poses on both sides).

Not verified: a hardware-GPU browser. No frame-rate claim is made for the
creator's machine; the claim is "no more per-pixel work than before, and
measurably less in software rendering".

## Gaps against the reference (not done here)

- Composition: the reference's cart and horses, hooded spear guards, stepped
  white stone bridge, plank-roofed houses and orchard bush rows are content,
  not shading. The Dark side's units here are the existing beasts.
- HUD: the reference shows an objective banner, a framed minimap and three
  ability buttons. The current Goblin HUD (`5f008cb`) is unchanged. A minimap
  also has information-projection consequences (D-088 to D-090).
- Camera framing: the reference sees more ground around the hero than the
  current 20 m sight radius (P-6) clears. The camera and sight radius are
  gameplay settings and were not changed.
- Shadows in the reference are softer at their edges.
- Hero view is not in the reference; it inherits the same palette and fog.

## Remaining acceptance gate

On the creator's hardware, compare this branch against `a644a63` with the
existing `profileRendering()` / `profileVillagePan()` and the new
`benchmarkFrames()` at the village, orchard and bridge, in both views and with
the fog on (a Light seat, not a spectator). Target 16.7 ms per frame and no
meaningful regression. Then judge the look against the reference: smoke
darkness, remembered-ground dimming, grass hue and facet contrast are all
single constants in `visionFog.ts`, `palette.ts` and `atmosphere.ts`.
