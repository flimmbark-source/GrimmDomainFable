/**
 * Client fog of war: the drawn texture holds, per cell, the fog transform of a
 * feathered copy of the sight mask, rewritten only around the eyes at each
 * refresh. It must always match what a fresh pass over the whole mask gives,
 * or stale sight would linger on screen.
 * (Cosmetic only: actor visibility comes from server projections.)
 */
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/shared/protocol.ts';
import { ORCHARD_VALE as MAP } from '../src/shared/world/orchardVale.ts';
import { boundsOf } from '../src/shared/sim/map.ts';
import { VisionFog, fogTransform } from '../src/client/render/region/visionFog.ts';

interface FogInternals { data: Uint8Array; feathered: Uint8Array; billow: Float32Array; drawn: Uint8Array; width: number; height: number }

/** Two passes of a (2r + 1) box blur, rows then columns, ends clamped: written the slow, obvious way. */
function fullBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let c = 0; c < 2; c++) {
    let a = Float64Array.from({ length: w * h }, (_, i) => src[i * 2 + c]!);
    for (let pass = 0; pass < 2; pass++) {
      for (const rows of [true, false]) {
        const b = new Float64Array(w * h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let k = -r; k <= r; k++) {
              const xx = rows ? Math.min(w - 1, Math.max(0, x + k)) : x;
              const yy = rows ? y : Math.min(h - 1, Math.max(0, y + k));
              sum += a[yy * w + xx]!;
            }
            b[y * w + x] = sum / (2 * r + 1);
          }
        }
        a = b;
      }
    }
    for (let i = 0; i < w * h; i++) out[i * 2 + c] = Math.round(a[i]!);
  }
  return out;
}

function snapshotAt(x: number, z: number, dirX = 0, dirZ = -1): Snapshot {
  return {
    you: { slot: 4, actorId: 1 },
    actors: [{ id: 1, kind: 'hero', team: 'light', x, z, dirX, dirZ, radius: 0.45, moving: false }],
  } as unknown as Snapshot;
}

describe('vision fog', () => {
  it('fog transform: clear in sight, smoke where never seen, greyed and dimmed where remembered', () => {
    expect(fogTransform(1, 1, 0.5)).toEqual([1, 0, 0]);
    const [ua, ub, uc] = fogTransform(0, 0, 0.5);
    expect(ua).toBeLessThan(0.1);
    expect(ub).toBe(0);
    expect(uc).toBeGreaterThan(0.08);
    const [ma, mb] = fogTransform(0, 1, 0.5);
    expect(ma).toBeGreaterThan(ua);
    expect(ma + mb).toBeLessThan(0.6);
    expect(mb).toBeGreaterThan(0);
  });

  it('the drawn texture always matches a full pass over the sight mask, while walking, after a long jump and at the map edge', () => {
    const fog = new VisionFog(MAP);
    const inside = fog as unknown as FogInternals;
    const b = boundsOf(MAP);
    const path: Array<[number, number]> = [
      [0.5, -24], [0.5, -22], [1.5, -19], [3, -15], [3, -9],   // north of the bridge, then over it
      [-60, 10],                                               // far away: old and new windows do not overlap
      [b.minX + 1, b.minZ + 1], [b.maxX - 1, b.maxZ - 1],     // corners: the blur clamps at the map's edge
    ];
    const billow = inside.billow.slice();
    let now = 0;
    for (const [x, z] of path) {
      now += 250;
      fog.update(snapshotAt(x, z), now);
      const expected = fullBlur(inside.data, inside.width, inside.height, 2);
      let worst = 0;
      for (let i = 0; i < expected.length; i++) worst = Math.max(worst, Math.abs(expected[i]! - inside.feathered[i]!));
      // The incremental pass sums in single precision: allow one step of rounding.
      expect(worst, `feathering at ${x}, ${z}`).toBeLessThanOrEqual(1);
      // Every drawn cell is the transform of its feathered cell.
      let stale = 0;
      for (let cell = 0; cell < inside.width * inside.height; cell++) {
        const [ta] = fogTransform(inside.feathered[cell * 2]! / 255, inside.feathered[cell * 2 + 1]! / 255, inside.billow[cell]!);
        if (Math.abs(Math.round(ta * 255) - inside.drawn[cell * 4]!) > 0) stale++;
      }
      expect(stale, `stale drawn cells at ${x}, ${z}`).toBe(0);
    }
    // The sight mask stays hard-edged (reveal() depends on it); the smoke pattern never changes.
    expect(new Set(inside.data)).toEqual(new Set([0, 255]));
    expect(inside.billow).toEqual(billow);
    expect(new Set(Array.from(billow, (v) => Math.round(v * 50))).size).toBeGreaterThan(10);
  });
});
