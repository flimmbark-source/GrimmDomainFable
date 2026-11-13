/** Orchard outlaw: broad ears, ochre scarf, field leathers and a packed satchel.
 * Baked into one mesh, using the same actor material and animation as before.
 */
import * as THREE from 'three';
import type { Part } from '../bake.ts';
import { Model } from '../modelkit.ts';

export function goblinParts(): Part[] {
  const m = new Model();
  const skin = 0x718c38;
  const leather = 0x59432a;
  const boot = 0x342d22;
  const scarf = 0xd29b32;
  for (const side of [-1, 1]) {
    m.box(0.38, 0.34, 0.62, boot, { p: [side * 0.23, 0.18, 0.12] });
    m.cyl(0.19, 0.21, 0.48, leather, { p: [side * 0.22, 0.48, 0] }, 6);
    m.cyl(0.17, 0.22, 0.56, leather, { p: [side * 0.53, 1.12, 0], r: [0, 0, side * 0.28] }, 6);
    m.lump(0.18, skin, { p: [side * 0.61, 0.86, 0.12], s: [0.8, 1.1, 0.9] }, 0, 1);
    // Tapered ears read from behind, above and at the chase camera.
    m.add(new THREE.ConeGeometry(0.26, 0.83, 4), skin, { p: [side * 0.66, 1.94, 0], r: [0, 0, -side * 1.12], s: [1, 1, 0.42] });
    m.lump(0.12, 0x303520, { p: [side * 0.2, 1.88, 0.35], s: [1, 0.45, 0.4], shade: 0 }, 0, 2);
  }
  m.cyl(0.35, 0.45, 0.82, leather, { p: [0, 1.02, 0], shade: 0.3 }, 7);
  m.cyl(0.45, 0.45, 0.13, boot, { p: [0, 0.83, 0] }, 7);
  m.box(0.18, 0.16, 0.06, 0xb89b58, { p: [0, 0.83, 0.44], shade: 0 });
  m.lump(0.43, skin, { p: [0, 1.85, 0], s: [1.1, 0.9, 0.87], shade: 0.2 }, 1, 3, 0.06);
  m.lump(0.17, skin, { p: [0, 1.78, 0.39], s: [0.7, 0.7, 1.1] }, 0, 4);
  m.cyl(0.38, 0.45, 0.23, scarf, { p: [0, 1.48, 0], shade: 0.2 }, 7);
  m.add(new THREE.ConeGeometry(0.26, 0.58, 3), scarf, { p: [0.13, 1.19, -0.4], r: [0.15, 0, Math.PI], s: [1, 1, 0.25] });
  m.box(0.52, 0.55, 0.28, 0x745135, { p: [-0.08, 1.05, -0.46], r: [0, 0, 0.12], shade: 0.3 });
  m.box(0.12, 0.62, 0.31, boot, { p: [-0.08, 1.06, -0.47], r: [0, 0, 0.12] });
  m.lump(0.23, 0x8c6a3b, { p: [0.48, 0.76, -0.08], s: [0.8, 1, 0.7] }, 0, 5);
  return m.parts;
}
