# Orchard reference graphics draft

Based on `orchard/player-hud` at `5f008cb58c16696196478b7e25133a9fa89b47a3`.

The supplied 13 November reference is the target: faceted crowns, olive greens,
warm dirt, dark foliage undersides, ochre clothing and readable directional light.
This is an unverified graphics draft, not a completed visual match.

## Implemented

- Faceted normals on regional tree crowns, hedge foliage and distant trees.
  Same meshes, placement, LOD and instance batches as the base branch.
- Warmer olive foliage and pale ochre paths, less contrasting ground dabs.
- Reduced hemisphere fill and stronger sunlight for clearer model planes.
- Solid scenery and grass cards use their baked vertex colours instead of two
  fragment noise evaluations. Terrain retains its painterly shader.
- Orchard operation light-side heroes use a goblin model with broad ears,
  scarf, boots, belt and satchel. The existing actor animation and one-mesh
  material path are retained. Other rooms keep their existing hero models.
  Goblin: 462 triangles, versus 318 for the wizard placeholder.

Gameplay, world layout, HUD, visibility rules, shadow refresh cadence and
resolution settings are unchanged. Baked shadows remain opt-in, as on the base.

## Verification

Typecheck, client/server build, and all 117 existing tests passed.
Generated and checked 88 flora/LOD variants for finite positions, normals and
colours. Checked both character meshes and bounding boxes.

Live visual comparison and before/after frame-time measurements are BLOCKED.
Local Chromium fails at startup with `socket() failed: Operation not permitted`.
The cloud browser preview returns an upstream connection termination.
No FPS or visual-fidelity acceptance claim is made.

## Remaining acceptance gate

On the same machine, viewport and shadow flags that passed the prior 60 FPS
check, compare this branch against the base. Use the village, orchard and a
moving village pan. Record GPU, buffer resolution, median and p95 frame times,
draw calls and triangles. Target 16.7 ms per frame, with no meaningful regression
from the base. The existing `?profile=1` debug API provides `profileRendering()`
and `profileVillagePan()`. Keep the tab visible during profiling.

Capture the same scenes before and after. Check foliage facets, shadow depth,
ground colour, goblin silhouette and fog boundaries. Tune only after seeing the
rendered result. The reference's cart, guards and exact composition are not
implemented by this pass. Do not merge on build/test results alone.
