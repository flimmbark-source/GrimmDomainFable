// Draws one icon per catalogue item into public/art/items/<id>.svg.
//
//   node scripts/make-item-icons.mjs
//
//   (needs Playwright, which the browser checks already use, to measure each drawing)
//
// Original vector art built from a small kit of shapes, in the style of the
// painted HUD icons in public/art/player-hud: lit from the top left, chiselled
// facets, a thin warm outline, a bright rim on lit edges, a shaded far edge,
// a fine painted grain and a soft drop shadow, with the object filling the
// frame. Every shape gets that treatment through the helpers below, so the
// item drawings themselves stay plain geometry. An artist can replace any
// file without touching code (the file name is the item id).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/art/items');
mkdirSync(out, { recursive: true });

const INK = '#24160d';
const STEEL = '#b9c2cc';
const WOOD = '#8a5a34';
const GOLD = '#e2b450';
const LEATHER = '#7a4d2b';
const CORD = '#c9a36a';

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mixTo = (c, target, t) => `#${hex(c).map((v, i) => Math.round(v + (target[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
const light = (c, t = 0.35) => mixTo(c, [255, 255, 255], t);
const dark = (c, t = 0.35) => mixTo(c, [20, 12, 8], t);

let defs = '';
let gid = 0;
/** Light from the top left: a bright spot, the base colour, a deep far side. */
function fill(c) {
  if (c === 'none') return 'none';
  const id = `g${gid++}`;
  defs += `<radialGradient id="${id}" cx="0.3" cy="0.26" r="0.92"><stop offset="0" stop-color="${light(c, 0.42)}"/><stop offset="0.25" stop-color="${light(c, 0.12)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${dark(c, 0.66)}"/></radialGradient>`;
  return `url(#${id})`;
}
/** Chiselled planes laid over a shape, turned a little differently each time. */
function facets() {
  const id = `f${gid++}`;
  defs += `<pattern id="${id}" width="17" height="15" patternUnits="userSpaceOnUse" patternTransform="rotate(${(gid * 47) % 180})">` +
    '<path d="M0 0 L17 0 L6 8Z" fill="#fff" fill-opacity="0.1"/><path d="M6 8 L17 0 L17 15Z" fill="#000" fill-opacity="0.08"/>' +
    '<path d="M0 0 L6 8 L0 15Z" fill="#000" fill-opacity="0.05"/><path d="M0 15 L6 8 L17 15Z" fill="#fff" fill-opacity="0.05"/></pattern>';
  return `url(#${id})`;
}
const SHARED_DEFS =
  // Per-shape bevel: a warm rim on the lit edge, a soft shade on the far edge.
  '<filter id="bev" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
  '<feOffset in="SourceAlpha" dx="1.5" dy="1.7" result="o1"/><feComposite in="SourceAlpha" in2="o1" operator="out" result="e1"/>' +
  '<feGaussianBlur in="e1" stdDeviation="0.55" result="b1"/><feFlood flood-color="#fff3d6" flood-opacity="0.62"/><feComposite in2="b1" operator="in" result="hi"/>' +
  '<feOffset in="SourceAlpha" dx="-2.2" dy="-2.4" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="e2"/>' +
  '<feGaussianBlur in="e2" stdDeviation="1.3" result="b2"/><feFlood flood-color="#140b05" flood-opacity="0.42"/><feComposite in2="b2" operator="in" result="lo"/>' +
  '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="lo"/><feMergeNode in="hi"/></feMerge></filter>';
/**
 * Weapons and boots: a stronger, two-scale bevel so each part reads as a
 * rounded solid, like the painted dagger and boots. A crisp rim and a broad
 * soft highlight on the lit side; a dark edge and a wide form shadow on the
 * far side. Every band is clipped to the shape.
 */
const band = (dx, dy, blur, color, opacity, name) =>
  `<feOffset in="SourceAlpha" dx="${dx}" dy="${dy}" result="${name}o"/><feComposite in="SourceAlpha" in2="${name}o" operator="out" result="${name}e"/>` +
  `<feGaussianBlur in="${name}e" stdDeviation="${blur}" result="${name}b"/><feComposite in="${name}b" in2="SourceAlpha" operator="in" result="${name}c"/>` +
  `<feFlood flood-color="${color}" flood-opacity="${opacity}"/><feComposite in2="${name}c" operator="in" result="${name}"/>`;
const SCULPT_DEFS =
  '<filter id="sculpt" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
  band(4.2, 4.6, 2.4, '#fff4dc', 0.3, 'wide') + band(1.2, 1.4, 0.45, '#fff6e2', 0.8, 'rim') +
  band(-5.5, -6, 3.2, '#0e0703', 0.55, 'form') + band(-1.5, -1.7, 0.7, '#120a05', 0.55, 'edge') +
  '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="form"/><feMergeNode in="edge"/><feMergeNode in="wide"/><feMergeNode in="rim"/></feMerge></filter>' +
  // The same light alone, for shapes whose planes are painted separately underneath.
  '<filter id="sculptLight" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
  band(4.2, 4.6, 2.4, '#fff4dc', 0.3, 'wide') + band(1.2, 1.4, 0.45, '#fff6e2', 0.8, 'rim') +
  band(-5.5, -6, 3.2, '#0e0703', 0.55, 'form') + band(-1.5, -1.7, 0.7, '#120a05', 0.55, 'edge') +
  '<feMerge><feMergeNode in="form"/><feMergeNode in="edge"/><feMergeNode in="wide"/><feMergeNode in="rim"/></feMerge></filter>';
let sculpted = false;
/**
 * Two planes meeting along a ridge, as the painted pieces are cut: the lit
 * half a touch brighter, the far half darker. In each shape's own box, so a
 * long blade splits along its length and a broad head splits diagonally.
 */
const PLANES_DEF = '<linearGradient id="planes" x1="0" y1="0" x2="1" y2="1"><stop offset="0.5" stop-color="#fff6e6" stop-opacity="0.16"/><stop offset="0.5" stop-color="#0b0603" stop-opacity="0.2"/></linearGradient>';

/** Whole-icon finish: painted grain, then a soft shadow under the object. */
const paintFilter = (seed) =>
  `<filter id="paint" x="-20%" y="-20%" width="140%" height="145%" color-interpolation-filters="sRGB">` +
  `<feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="2" seed="${seed}" result="n"/>` +
  '<feColorMatrix in="n" type="matrix" values="0.14 0.14 0.14 0 0.29  0.14 0.14 0.14 0 0.29  0.14 0.14 0.14 0 0.29  0 0 0 0 1" result="ng"/>' +
  '<feBlend in="ng" in2="SourceGraphic" mode="soft-light" result="t"/><feComposite in="t" in2="SourceAlpha" operator="in" result="tex"/>' +
  '<feDropShadow in="tex" dx="1.2" dy="2.6" stdDeviation="1.7" flood-color="#000" flood-opacity="0.55"/></filter>';

const outline = (c) => (c === 'none' ? INK : dark(c, 0.68));
const JOIN = 'stroke-linejoin="round" stroke-linecap="round"';
/** One solid shape in the painted style: lit fill with bevel, facets, then a thin warm outline on top. */
function solid(tag, geo, c) {
  if (c === 'none') return `<${tag} ${geo} fill="none" stroke="${INK}" stroke-width="2.2" ${JOIN}/>`;
  // 'none-fill:<colour>': planes are already painted; add only the bevel light and the outline.
  if (c.startsWith('none-fill:')) {
    const base = c.slice(10);
    return `<${tag} ${geo} fill="#000" filter="url(#sculptLight)"/><${tag} ${geo} fill="${facets()}"/>` +
      `<${tag} ${geo} fill="none" stroke="${outline(base)}" stroke-width="2.1" ${JOIN}/>`;
  }
  return `<${tag} ${geo} fill="${fill(c)}" filter="url(#${sculpted ? 'sculpt' : 'bev'})"/><${tag} ${geo} fill="${facets()}"/>` +
    (sculpted ? `<${tag} ${geo} fill="url(#planes)"/>` : '') +
    `<${tag} ${geo} fill="none" stroke="${outline(c)}" stroke-width="2.1" ${JOIN}/>`;
}
const path = (d, c) => solid('path', `d="${d}"`, c);
const flat = (d, c) => `<path d="${d}" fill="${fill(c)}"/>`;
const line = (d, c, w = 3) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" ${JOIN}/>`;
const cord = (d, c = CORD, w = 4) => line(d, dark(c, 0.7), w + 2.4) + line(d, c, w) + line(d, light(c, 0.35), Math.max(1, w * 0.3));
const circle = (x, y, r, c) => solid('circle', `cx="${x}" cy="${y}" r="${r}"`, c);
const rect = (x, y, w, h, c, r = 2) => solid('rect', `x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"`, c);
const shine = (d) => line(d, 'rgba(255,246,224,0.6)', 1.7);
const turn = (angle, body, cx = 48, cy = 48) => `<g transform="rotate(${angle} ${cx} ${cy})">${body}</g>`;
const at = (x, y, scale, body) => `<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>`;

// ---- Emblems: small marks, drawn round (0, 0), about 20 units across -------------------
const GLYPH = {
  spiral: (c) => line('M0 0 C4 -4 8 2 3 6 C-4 10 -10 2 -6 -5 C-2 -11 9 -9 10 0', c),
  leaf: (c) => `<path d="M-8 6 C-8 -6 2 -9 9 -8 C9 1 4 9 -8 6Z" fill="${c}"/>` + line('M-7 6 L5 -5', INK, 1.5),
  thorn: (c) => `<path d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3Z" fill="${c}"/>`,
  moon: (c) => `<path d="M3 -9 A9 9 0 1 0 8 6 A7 7 0 1 1 3 -9Z" fill="${c}"/>`,
  drop: (c) => `<path d="M0 -10 C6 -2 8 2 8 5 A8 8 0 0 1 -8 5 C-8 2 -6 -2 0 -10Z" fill="${c}"/>`,
  heart: (c) => `<path d="M0 9 C-12 0 -9 -9 -4 -9 C-1 -9 0 -6 0 -5 C0 -6 1 -9 4 -9 C9 -9 12 0 0 9Z" fill="${c}"/>`,
  cross: (c) => `<path d="M-3 -9 H3 V-3 H9 V3 H3 V9 H-3 V3 H-9 V-3 H-3Z" fill="${c}"/>`,
  wing: (c) => `<path d="M-10 4 C-6 -8 4 -10 10 -8 C8 -4 6 -3 3 -2 C6 -1 7 0 8 2 C4 3 2 3 0 3 C2 5 2 6 2 8 C-3 8 -7 7 -10 4Z" fill="${c}"/>`,
  bolt: (c) => `<path d="M2 -10 L-7 2 H-1 L-3 10 L7 -3 H1Z" fill="${c}"/>`,
  eye: (c) => `<path d="M-10 0 C-4 -8 4 -8 10 0 C4 8 -4 8 -10 0Z" fill="${c}"/><circle r="3.4" fill="${INK}"/>`,
  skull: (c) => `<path d="M-8 -2 A8 8 0 0 1 8 -2 V4 H4 V8 H-4 V4 H-8Z" fill="${c}"/><circle cx="-3" cy="-1" r="2" fill="${INK}"/><circle cx="3" cy="-1" r="2" fill="${INK}"/>`,
  sun: (c) => `<circle r="5" fill="${c}"/>` + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M0 -7 L0 -10" stroke="${c}" stroke-width="2.4" stroke-linecap="round" transform="rotate(${a})"/>`).join(''),
  hourglass: (c) => `<path d="M-7 -9 H7 L1 0 L7 9 H-7 L-1 0Z" fill="${c}"/>`,
  feather: (c) => `<path d="M-7 9 C-9 -2 -2 -10 8 -10 C8 0 2 8 -7 9Z" fill="${c}"/>` + line('M-7 9 L6 -8', INK, 1.5),
  wave: (c) => line('M-10 -3 C-6 -8 -2 2 2 -3 S8 -3 10 -3 M-10 4 C-6 -1 -2 9 2 4 S8 4 10 4', c, 2.6),
  fang: (c) => `<path d="M-6 -9 H6 C6 0 3 6 0 10 C-3 6 -6 0 -6 -9Z" fill="${c}"/>`,
  shield: (c) => `<path d="M-8 -9 H8 V0 C8 5 4 8 0 10 C-4 8 -8 5 -8 0Z" fill="${c}"/>`,
  note: (c) => `<ellipse cx="-3" cy="6" rx="4.5" ry="3.4" fill="${c}"/>` + line('M1 6 V-9 L8 -6', c, 2.6),
  gear: (c) => `<circle r="6" fill="${c}"/><circle r="2.4" fill="${INK}"/>` + [0, 60, 120, 180, 240, 300].map((a) => `<rect x="-2" y="-10" width="4" height="5" fill="${c}" transform="rotate(${a})"/>`).join(''),
  flame: (c) => `<path d="M0 -10 C7 -3 8 2 8 4 A8 7 0 0 1 -8 4 C-8 0 -4 -1 -3 -5 C-1 -3 0 -6 0 -10Z" fill="${c}"/>`,
  up: (c) => `<path d="M0 -10 L9 1 H4 V10 H-4 V1 H-9Z" fill="${c}"/>`,
  clover: (c) => [0, 90, 180, 270].map((a) => `<circle cx="0" cy="-5" r="4.6" fill="${c}" transform="rotate(${a})"/>`).join(''),
  crown: (c) => `<path d="M-9 7 L-10 -6 L-4 0 L0 -9 L4 0 L10 -6 L9 7Z" fill="${c}"/>`,
  paw: (c) => `<ellipse cy="4" rx="6" ry="5" fill="${c}"/>` + [[-7, -3], [-2.5, -7], [2.5, -7], [7, -3]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${c}"/>`).join(''),
  ring: (c) => `<circle r="7" fill="none" stroke="${c}" stroke-width="3.4"/>`,
  arrows: (c) => `<path d="M-9 0 L-3 -6 V-2 H3 V-6 L9 0 L3 6 V2 H-3 V6Z" fill="${c}"/>`,
  scales: (c) => line('M0 -9 V8 M-8 -5 H8 M-8 -5 L-11 3 H-5Z M8 -5 L5 3 H11Z M-5 9 H5', c, 2.2),
};
const glyph = (name, x, y, c, scale = 1) => at(x, y, scale, `<g stroke="${dark(c, 0.7)}" stroke-width="0.9" stroke-opacity="0.7" paint-order="stroke">${GLYPH[name](c)}</g>`);

// ---- Weapon parts, drawn upright (point up) and turned afterwards -------------------------
/** A leather-wrapped grip: diagonal turns of the wrap, each with a lit edge. */
function grip(y0, y1, c = LEATHER, w = 7) {
  const x0 = 48 - w / 2;
  const turns = [];
  for (let y = y0 + 3.5; y < y1 - 1; y += 3.6) turns.push(`M${x0 + 0.6} ${y + 1.6} L${x0 + w - 0.6} ${y - 1.6}`);
  return rect(x0, y0, w, y1 - y0, c, 3) + line(turns.join(' '), dark(c, 0.62), 1.5) +
    line(turns.map((t) => t.replace(/(\d+(\.\d+)?) (\d+(\.\d+)?)(?= L)/, (_, x, _a, y) => `${x} ${Number(y) + 1.1}`)).join(' '), light(c, 0.3), 0.7);
}
/** A wooden haft with grain running along it and a lit stripe. */
function haft(y0, y1, c = WOOD, w = 6) {
  const x0 = 48 - w / 2;
  const len = y1 - y0;
  const grain = `M${x0 + w * 0.35} ${y0 + 3} C${x0 + w * 0.5} ${y0 + len * 0.35} ${x0 + w * 0.2} ${y0 + len * 0.6} ${x0 + w * 0.4} ${y1 - 3}` +
    ` M${x0 + w * 0.7} ${y0 + len * 0.15} C${x0 + w * 0.8} ${y0 + len * 0.45} ${x0 + w * 0.6} ${y0 + len * 0.7} ${x0 + w * 0.75} ${y1 - 5}`;
  return rect(x0, y0, w, len, c, 3) + line(grain, dark(c, 0.45), 0.9) + line(`M${x0 + 1.3} ${y0 + 3} V${y1 - 3}`, light(c, 0.4), 1.1);
}
/** A cross-guard with a raised bead in the middle and a lit top edge. */
const guard = (y, w, c = GOLD, h = 6) => rect(48 - w / 2, y - h / 2, w, h, c, 3) + circle(48, y, h * 0.42, light(c, 0.1)) +
  line(`M${48 - w / 2 + 2} ${y - h / 2 + 1.3} H${48 + w / 2 - 2}`, light(c, 0.55), 1);
/** A round pommel with a hard glint. */
const pommel = (y, c = GOLD, r = 5) => circle(48, y, r, c) + `<circle cx="${48 - r * 0.35}" cy="${y - r * 0.38}" r="${r * 0.28}" fill="#fff8e8" fill-opacity="0.85"/>`;
/**
 * A straight blade in two planes, like the painted dagger: the lit half and
 * the shaded half meet at a central ridge. A bright edge runs down the lit side.
 */
function blade(base, tip, w, c = STEEL) {
  const l = 48 - w / 2;
  const r = 48 + w / 2;
  const shoulder = tip + Math.min(12, (base - tip) * 0.3);
  const whole = `M${l} ${base} L${l} ${shoulder} L48 ${tip} L${r} ${shoulder} L${r} ${base}Z`;
  return flat(`M${l} ${base} L${l} ${shoulder} L48 ${tip} L48 ${base}Z`, light(c, 0.22)) + flat(`M48 ${base} L48 ${tip} L${r} ${shoulder} L${r} ${base}Z`, dark(c, 0.28)) +
    solid('path', `d="${whole}"`, 'none-fill:' + c) +
    line(`M48 ${base - 1} L48 ${tip + 2}`, light(c, 0.65), 1.1) + line(`M${48 + 0.8} ${base - 1} L${48 + 0.8} ${tip + 4}`, dark(c, 0.45), 0.7) +
    line(`M${l + 1} ${base - 2} L${l + 1} ${shoulder} L${48 - 0.6} ${tip + 2.5}`, '#fffaf0', 0.9);
}
const curved = (base, tip, w, bend, c = STEEL) => path(`M${48 - w / 2} ${base} C${48 - w / 2 + bend} ${(base + tip) / 2} ${48 + bend} ${tip + 10} ${48 + bend * 1.5} ${tip} C${48 + w / 2 + bend} ${tip + 18} ${48 + w / 2 + bend * 0.6} ${(base + tip) / 2} ${48 + w / 2} ${base}Z`, c);
const axeEdge = (y, size, c, side) => line(`M${48 + side * size * 0.9} ${y - size * 0.5} C${48 + side * size * 1.13} ${y - size * 0.15} ${48 + side * size * 1.13} ${y + size * 0.15} ${48 + side * size * 0.9} ${y + size * 0.5}`, light(c, 0.6), 2.2);
const axeHead = (y, size, c = STEEL, side = 1) => path(`M48 ${y - size * 0.35} C${48 + side * size * 0.6} ${y - size * 0.7} ${48 + side * size} ${y - size * 0.6} ${48 + side * size} ${y - size * 0.6} C${48 + side * size * 1.25} ${y} ${48 + side * size} ${y + size * 0.6} ${48 + side * size} ${y + size * 0.6} C${48 + side * size * 0.6} ${y + size * 0.7} 48 ${y + size * 0.35} 48 ${y + size * 0.35}Z`, c) + axeEdge(y, size, c, side);
const fletch = (y, c) => path(`M48 ${y} L40 ${y + 12} L48 ${y + 8} L56 ${y + 12}Z`, c);

const W = {
  dagger: () => turn(40, grip(60, 80) + pommel(83) + guard(60, 26) + blade(58, 14, 12)),
  twin_knives: () => turn(35, at(-10, 4, 1, grip(62, 80, '#3b5d7a') + guard(62, 18, STEEL) + blade(60, 20, 9))) + turn(-35, at(10, 4, 1, grip(62, 80, '#3b5d7a') + guard(62, 18, STEEL) + blade(60, 20, 9))),
  hatchet: () => turn(30, haft(22, 86) + axeHead(32, 22, STEEL) + rect(44, 24, 8, 16, '#7a2f2a')),
  cudgel: () => turn(35, path('M43 86 L44 50 C36 44 34 18 48 12 C62 18 60 44 52 50 L53 86Z', WOOD) + [[42, 24], [54, 30], [45, 38], [53, 18]].map(([x, y]) => circle(x, y, 3, STEEL)).join('')),
  billhook: () => turn(30, haft(30, 90) + path('M45 34 V10 C58 8 68 16 66 28 C62 22 56 20 52 22 V34Z', STEEL) + shine('M49 30 V14')),
  sling: () => cord('M20 16 C24 44 34 60 48 66') + cord('M76 16 C72 44 62 60 48 66') + path('M34 60 C40 76 56 76 62 60 C56 66 40 66 34 60Z', LEATHER) + circle(48, 60, 8, '#9aa0a6'),
  hand_crossbow: () => turn(-45, rect(44, 26, 8, 56, WOOD) + path('M14 40 C30 22 66 22 82 40 C66 32 30 32 14 40Z', WOOD) + line('M14 40 L48 52 L82 40', '#e9dcc0', 2) + blade(30, 10, 6)),
  cleaver: () => turn(35, grip(62, 86, '#3a2a22') + path('M40 62 V18 C40 14 44 12 48 12 H64 V62Z', STEEL) + circle(58, 20, 3, INK) + shine('M46 56 V20')),
  javelin: () => turn(45, haft(20, 92, '#a8774a', 4) + blade(24, 2, 10) + rect(45, 60, 6, 10, '#8a2f2f') + fletch(80, '#c44')),
  rapier: () => turn(40, grip(70, 86, '#2b2b3a', 6) + pommel(88, GOLD, 4) + path('M30 70 C30 58 66 58 66 70 C60 66 36 66 30 70Z', GOLD) + blade(66, 4, 5, '#d5dde6')),
  sickle: () => turn(-20, grip(56, 86) + path('M45 58 C30 40 34 12 62 10 C78 10 84 22 82 30 C74 20 58 20 54 34 C52 44 52 52 51 58Z', STEEL)),
  flail: () => turn(20, haft(46, 90, WOOD, 7) + cord('M48 46 C52 36 60 32 62 26', '#8f979f', 3) + circle(64, 20, 12, '#6f7780') + [0, 60, 120, 180, 240, 300].map((a) => `<g transform="rotate(${a} 64 20)">${path('M64 6 L61 12 H67Z', STEEL)}</g>`).join('')),
  warhammer: () => turn(30, haft(34, 92, '#5c4130', 7) + rect(26, 10, 44, 26, '#7c858e', 4) + rect(22, 14, 8, 18, '#5f6870') + rect(66, 14, 8, 18, '#5f6870') + shine('M32 16 H60')),
  scythe: () => turn(25, haft(14, 92, '#6b4a2f', 5) + path('M46 16 C20 14 6 28 4 44 C16 30 32 26 50 26Z', STEEL) + rect(44, 50, 12, 5, '#6b4a2f')),
  stiletto: () => turn(40, grip(64, 82, '#2a2233', 6) + guard(64, 20, '#6b5a8a', 5) + circle(48, 86, 4.5, '#b05cff') + path('M45 62 L48 6 L51 62Z', '#8e98a8')),
  butcher_hook: () => turn(10, rect(30, 78, 36, 9, WOOD, 4) + line('M48 78 V38 C48 14 78 16 74 40', INK, 10) + line('M48 78 V38 C48 14 78 16 74 40', STEEL, 5) + path('M68 38 L78 34 L76 48Z', STEEL)),
  pitchfork: () => turn(35, haft(40, 94, WOOD, 5) + line('M34 12 V34 C34 42 62 42 62 34 V12 M48 10 V40', INK, 8) + line('M34 12 V34 C34 42 62 42 62 34 V12 M48 10 V40', STEEL, 4)),
  woodaxe: () => turn(30, haft(18, 94, '#9a6a3c', 7) + axeHead(30, 30, '#aab3bc') + path('M48 20 L40 24 V36 L48 40Z', '#7f8891')),
  whip: () => rect(14, 70, 22, 9, '#5a3523', 4) + cord('M36 74 C70 78 84 56 66 44 C48 32 38 48 52 54 C64 58 70 40 58 26 C50 16 40 18 34 12', '#7a4d2b', 4),
  longbow: () => turn(-35, line('M30 8 C62 30 62 66 30 88', INK, 9) + line('M30 8 C62 30 62 66 30 88', '#9a6a3c', 5) + line('M30 8 V88', '#efe5cc', 1.6) + at(-14, 0, 1, turn(90, haft(22, 78, '#c9a36a', 3) + blade(26, 12, 8) + fletch(72, '#4a8a5a')))),
  blowpipe: () => turn(50, rect(42, 12, 12, 76, '#6f8a4a', 5) + rect(42, 28, 12, 5, '#3f5a2a', 1) + rect(42, 62, 12, 5, '#3f5a2a', 1)) + turn(50, at(22, -14, 0.8, path('M48 40 L45 10 H51Z', STEEL) + fletch(40, '#d04a8a'))),
  throwing_axes: () => turn(-25, at(-12, 6, 0.8, haft(26, 86) + axeHead(34, 22, STEEL))) + turn(35, at(14, 4, 0.8, haft(26, 86) + axeHead(34, 22, '#9fb0c4'))),
  arbalest: () => turn(-45, rect(43, 18, 10, 68, '#4b3626') + path('M8 44 C26 18 70 18 88 44 C70 30 26 30 8 44Z', '#8f979f') + line('M8 44 L48 58 L88 44', '#efe5cc', 2) + blade(26, 2, 8) + rect(40, 70, 16, 8, '#6f7780')),
  bolas: () => cord('M48 44 L22 18') + cord('M48 44 L76 22') + cord('M48 44 L46 80') + circle(20, 16, 10, '#7f8891') + circle(78, 20, 10, '#7f8891') + circle(46, 82, 10, '#7f8891') + circle(48, 44, 4, CORD),
  quarterstaff: () => turn(40, haft(6, 90, '#a8774a', 7) + rect(43, 14, 10, 7, '#5f6870', 2) + rect(43, 74, 10, 7, '#5f6870', 2) + rect(43, 42, 10, 12, LEATHER, 2)),
  leech_blade: () => turn(40, grip(62, 82, '#2a1218') + guard(62, 24, '#5a1a22') + pommel(85, '#b3202c', 4.5) + path('M43 60 C38 50 50 44 44 34 C40 26 50 20 48 8 C56 18 50 26 54 34 C58 44 48 50 53 60Z', '#c2313c')),
  duelist_sabre: () => turn(35, grip(66, 84, '#2b2b3a') + path('M40 84 C28 78 30 64 42 66', GOLD) + curved(64, 8, 9, 7, '#d5dde6') + guard(66, 18, GOLD, 5)),
};

// ---- Boots ----------------------------------------------------------------------------------
/** One sandal: a thick footbed seen at three-quarters, crossed straps with a buckle, a heel strap. */
function oneSandal(c, strap) {
  return path('M18 72 C18 64 30 62 46 63 C62 64 80 64 84 70 C87 76 82 80 74 80 H24 C19 80 18 76 18 72Z', light(c, 0.15)) +
    path('M17 74 C17 80 20 84 26 84 H76 C84 84 88 80 86 74 C82 79 76 80 74 80 H24 C20 80 18 78 17 74Z', dark(c, 0.45)) +
    path('M24 70 C24 56 30 50 36 50 C42 50 44 58 44 66 L40 66 C40 60 39 55 36 55 C32 55 29 60 29 70Z', strap) +
    path('M44 66 C48 54 58 50 64 54 C70 58 70 64 68 68 L63 67 C64 62 62 58 59 58 C54 58 51 62 49 67Z', strap) +
    path('M38 62 C46 60 56 60 64 62 L64 67 C56 65 46 65 38 67Z', dark(strap, 0.15)) + rect(48, 60.5, 6, 6, GOLD, 1.2) +
    `<path d="M24 72 C40 70 62 70 80 72" fill="none" stroke="${light(c, 0.5)}" stroke-width="0.9" stroke-dasharray="1.6 1.8"/>`;
}
const sandal = (c, strap) => at(-6, -10, 0.9, oneSandal(dark(c, 0.15), dark(strap, 0.15))) + at(8, 6, 0.9, oneSandal(c, strap)) + glyph('heart', 74, 26, '#ff8fa0', 0.9);
// ---- Boots: every pair is its own kind of footwear ------------------------------------------
/** Detail painted only inside a shape (stripes, wraps, patterns). */
const clipped = (d, inner) => {
  const id = `c${gid++}`;
  defs += `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
  return `<g clip-path="url(#${id})">${inner}</g>`;
};
/** Two of the same, the far one set back and darker; `draw(k)` darkens its colours by k. */
const pair = (draw) => at(-10, -6, 0.9, draw(0.2)) + at(12, 7, 0.9, draw(0));
const soleOf = (c, x0 = 24, x1 = 82) => path(`M${x0 - 2} 80 C${x0 + 4} 87 ${x1 - 6} 88 ${x1 + 2} 84 C${x1 + 4} 82 ${x1 + 4} 79 ${x1 + 3} 77 C${x1 - 4} 84 ${x0 + 6} 85 ${x0 - 2} 80Z`, dark(c, 0.55));
const heelOf = (c, x0 = 26) => path(`M${x0} 80 H${x0 + 13} L${x0 + 12} 90 H${x0 + 1}Z`, dark(c, 0.68));
const rivet = (x, y, c = STEEL) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${light(c, 0.3)}" stroke="${dark(c, 0.6)}" stroke-width="0.6"/>`;
const sew = (d, c) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="0.9" stroke-dasharray="1.6 1.8"/>`;
const leaf = (x, y, a, c, s = 1) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">${path('M0 0 C3 -6 10 -7 14 -4 C10 1 4 3 0 0Z', c)}</g>`;

const B = {
  springheel_boots: () => '', // painted
  softsole_boots: () => pair((k) => {
    const c = dark('#c99a62', k);
    return soleOf(c, 22, 84) +
      path('M20 66 C20 54 32 50 46 52 C62 54 78 60 85 70 C89 77 84 83 74 83 H28 C21 83 19 76 20 66Z', c) +
      path('M48 58 C60 56 72 61 78 68 C71 73 58 73 49 68 C45 65 44 60 48 58Z', light(c, 0.14)) +
      line('M50 60 L47 57 M55 58 L54 54 M61 59 L61 55 M67 61 L69 57 M72 64 L75 61', dark(c, 0.5), 1.2) +
      path('M22 56 C26 42 42 40 50 52 C42 56 30 58 22 58Z', dark(c, 0.14)) +
      line('M26 58 L25 66 M30 58 L29 67 M34 58 L34 66 M38 57 L38 65 M42 56 L43 63', dark(c, 0.4), 1.5) +
      [[56, 63], [61, 64.5], [66, 65.5], [71, 66.5]].map(([x, y], i) => circle(x, y, 1.9, dark(i % 2 ? '#c2313c' : '#3fb6b0', k))).join('');
  }),
  catspaw_boots: () => {
    const felt = '#4a6fa8';
    const shoe = soleOf(felt, 26, 82) + path('M26 46 C28 40 52 40 54 46 L56 60 C66 60 80 64 84 72 C86 80 80 83 72 83 H30 C24 83 22 78 24 70Z', felt) +
      sew('M56 62 C66 62 78 66 82 73', light(felt, 0.5)) +
      [24, 30, 36, 42, 48, 54].map((x, i) => circle(x + 2, 44 - (i % 2) * 1.6, 5.2, '#ece6da')).join('');
    const sole = path('M24 32 C24 18 40 12 52 16 C66 20 72 34 70 50 C68 68 58 80 46 80 C32 80 24 64 24 32Z', '#3a3a48') +
      path('M34 50 C34 40 52 38 56 48 C60 58 52 68 44 66 C36 64 34 58 34 50Z', '#f0a8b8') +
      [[36, 32], [44, 27], [52, 29], [58, 35]].map(([x, y]) => circle(x, y, 4.3, '#f0a8b8')).join('');
    return at(-16, -14, 0.78, turn(-24, sole)) + at(10, 4, 0.92, shoe);
  },
  courier_boots: () => {
    const c = '#b23a48';
    const rowel = [0, 45, 90, 135].map((a) => `<g transform="rotate(${a} 13 78)">${path('M13 70 L14.5 78 L13 86 L11.5 78Z', STEEL)}</g>`).join('');
    return line('M26 78 L15 78', dark(STEEL, 0.4), 3) + rowel + circle(13, 78, 2.4, GOLD) + heelOf(c, 28) + soleOf(c, 28, 82) +
      path('M30 8 C34 4 54 4 58 10 L56 54 C66 58 78 62 84 70 C88 78 82 83 74 83 H32 C28 83 26 78 27 70 L28 30Z', c) +
      path('M29 16 C38 12 50 12 58 16 L57 25 C50 21 38 21 28 25Z', '#f1d9a0') +
      `<ellipse cx="44" cy="8" rx="14" ry="3.2" fill="${dark(c, 0.75)}"/>` +
      path('M57 32 C66 22 80 18 90 20 C84 24 82 27 88 29 C80 31 78 33 84 35 C76 38 66 38 57 40Z', GOLD) +
      line('M60 31 L82 25 M60 35 L79 32', dark(GOLD, 0.45), 1) + shine('M33 28 V66');
  },
  tumbler_boots: () => pair((k) => {
    const c = dark('#2f9a8a', k);
    const body = 'M22 58 C22 46 40 44 48 50 L68 54 C76 56 78 66 72 70 L30 74 C24 74 21 68 22 58Z';
    return soleOf(c, 24, 74) + path(body, c) +
      clipped(body, line('M24 50 L44 74 M36 46 L60 74 M52 48 L76 74 M24 66 L44 46 M40 74 L62 48 M56 74 L74 54', light(dark('#e0c060', k), 0.1), 2.4)) +
      line('M66 56 C80 54 88 44 84 34 C80 26 70 28 72 36 C73 40 78 40 78 36', dark(c, 0.6), 8.5) +
      line('M66 56 C80 54 88 44 84 34 C80 26 70 28 72 36 C73 40 78 40 78 36', c, 5.5) +
      circle(78, 35, 3.6, dark(GOLD, k)) + path('M22 52 C30 44 44 44 50 50 C42 52 30 54 22 56Z', dark('#e0c060', k));
  }),
  mistwalker_boots: () => {
    const c = '#8f9bb0';
    const leg = 'M32 6 H56 L58 56 C68 58 80 62 84 70 C86 78 80 82 72 82 H32 C28 82 26 76 28 70Z';
    let wraps = '';
    for (let y = 4; y < 92; y += 7) wraps += line(`M20 ${y} L92 ${y + 9}`, dark(c, 0.45), 1.2) + line(`M20 ${y + 2} L92 ${y + 11}`, light(c, 0.4), 2.6);
    return soleOf(c, 28, 82) + path(leg, c) + clipped(leg, wraps) +
      path('M56 12 C66 8 76 14 84 10 C80 18 68 20 58 18Z', light(c, 0.2)) +
      `<g fill="#fff" fill-opacity="0.35"><ellipse cx="22" cy="70" rx="12" ry="4"/><ellipse cx="74" cy="88" rx="16" ry="3.5"/><ellipse cx="66" cy="30" rx="9" ry="3"/></g>` +
      line('M10 62 C20 58 26 64 36 60 M60 90 C70 86 80 92 90 88', 'rgba(255,255,255,0.6)', 1.6);
  },
  bramble_boots: () => {
    const c = '#6b5a3a';
    const vine = 'M28 30 C42 24 58 32 58 40 C44 44 34 46 28 54 C40 58 62 58 72 66 C62 72 44 72 32 78';
    const thorns = [[34, 28, -100], [50, 30, -40], [56, 42, 30], [38, 46, 160], [30, 55, 200], [52, 60, -20], [68, 64, 20], [58, 71, 120], [42, 74, 160]];
    return heelOf(c, 28) + soleOf(c, 28, 82) +
      path('M30 28 H56 L58 54 C68 58 80 62 84 70 C86 78 80 82 72 82 H32 C28 82 26 76 28 70Z', c) +
      `<ellipse cx="43" cy="28" rx="13" ry="3" fill="${dark(c, 0.75)}"/>` +
      line(vine, '#2f3f1a', 5.5) + line(vine, '#5d7a2f', 3.2) +
      thorns.map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})">${path('M0 -1.6 L6 0 L0 1.6Z', '#e6d8a8')}</g>`).join('') +
      leaf(60, 38, -30, '#6f9a3a') + leaf(30, 56, 150, '#6f9a3a') + leaf(70, 66, 10, '#6f9a3a', 0.8) +
      path('M30 80 L18 76 L22 82 L16 86 L30 84Z', STEEL);
  },
  shadowstep_boots: () => {
    const c = '#3a3050';
    const body = 'M30 10 C40 6 56 8 60 12 C57 20 62 26 58 32 C62 38 58 46 58 54 C68 58 80 62 84 70 C86 78 80 82 72 82 H32 C28 82 26 76 28 70 C30 60 26 48 30 40 C26 32 32 24 30 10Z';
    return soleOf(c, 28, 82) + path(body, c) +
      line('M32 26 C40 30 50 28 58 25 M31 40 C40 44 50 42 58 38', dark(c, 0.6), 1.6) + line('M32 28 C40 32 50 30 57 27', light(c, 0.3), 0.8) +
      [18, 31, 44].map((y) => path(`M44 ${y} H64 V${y + 4.5} H44Z`, dark(c, 0.3)) + rect(58, y - 1, 6, 6.5, '#c9a0ff', 1)).join('') +
      `<ellipse cx="45" cy="10" rx="14" ry="3" fill="${dark(c, 0.8)}"/>` + shine('M34 16 V60');
  },
  lastlegs_boots: () => {
    const c = '#8a6a4a';
    return heelOf(c, 28) + path('M30 80 C36 84 70 84 74 80 L80 86 C68 92 40 92 28 86Z', dark(c, 0.55)) +
      path('M32 30 H56 L58 54 C68 58 80 62 84 70 C86 78 80 80 72 80 H32 C28 80 26 76 28 70Z', c) +
      path('M36 38 L50 36 L51 47 L37 49Z', '#6b7a4a') + line('M37 37 L39 40 M43 36 L44 39 M49 36 L50 39 M38 48 L40 46 M45 47 L46 45', '#e8d8b0', 1) +
      path('M60 60 L70 62 L68 70 L59 68Z', '#5a4a6a') + line('M60 61 L62 63 M66 61 L67 63 M60 68 L62 66', '#e8d8b0', 1) +
      `<ellipse cx="78" cy="72" rx="5" ry="4" fill="#1a110a"/>` + circle(77, 72, 2.2, '#e2a888') + circle(80.5, 73, 1.8, '#e2a888') +
      `<ellipse cx="44" cy="30" rx="12" ry="3" fill="${dark(c, 0.75)}"/>` + line('M36 32 L33 22 M52 32 L55 24', '#c9a36a', 1.6) +
      line('M30 44 L34 46 M30 60 L34 61', dark(c, 0.6), 1.2);
  },
  ironshod_boots: () => pair((k) => {
    const c = dark('#8a939c', k);
    const foot = 'M24 50 C24 42 46 40 52 46 C64 50 78 56 84 66 C88 74 84 80 76 80 H28 C22 80 22 72 24 50Z';
    let lames = '';
    for (let i = 0; i < 4; i++) {
      const x = 50 + i * 8;
      lames += path(`M${x} ${46 + i * 3} C${x + 6} ${48 + i * 3} ${x + 10} ${56 + i * 3} ${x + 9} ${80} L${x + 3} 80 C${x + 4} ${60 + i * 2} ${x + 1} ${52 + i * 3} ${x - 4} ${50 + i * 3}Z`, light(c, 0.08 * i));
    }
    return soleOf(c, 24, 82) + path(foot, c) + lames +
      path('M22 34 C30 30 48 30 54 34 L54 50 C46 47 32 47 22 50Z', light(c, 0.12)) + path('M24 22 C32 18 46 18 52 22 L53 36 C45 33 33 33 23 36Z', c) +
      [[26, 42], [50, 42], [27, 28], [49, 28]].map(([x, y]) => rivet(x, y)).join('');
  }),
  marsh_waders: () => {
    const c = '#5a6b3a';
    const body = 'M26 2 C36 -2 56 -2 62 4 L60 54 C70 58 82 62 86 70 C88 78 82 82 74 82 H30 C26 82 24 76 25 70Z';
    return path('M22 80 H86 L84 88 H24Z', '#2f3a22') + line('M30 84 V88 M40 84 V88 M50 84 V88 M60 84 V88 M70 84 V88 M80 84 V88', '#1c2414', 2) +
      path(body, c) + clipped(body, `<rect x="0" y="58" width="96" height="40" fill="#8a7a50" fill-opacity="0.45"/>`) +
      line('M26 58 C40 60 56 56 62 58 C72 60 80 64 86 68', '#c9b890', 1.2) +
      path('M30 4 C36 -6 52 -6 58 4 L56 8 C50 0 38 0 32 8Z', '#2f3a22') +
      line('M30 10 C26 2 28 -4 34 -6', '#2f3a22', 3) +
      line('M34 14 C34 30 33 44 34 56', 'rgba(255,255,240,0.55)', 3) +
      [[70, 88, 1], [80, 92, 0.8], [20, 70, 0.9]].map(([x, y, s]) => at(x, y, s, path('M0 -6 C3 -2 4 0 4 2 A4 4 0 0 1 -4 2 C-4 0 -3 -2 0 -6Z', '#8fc8e8'))).join('');
  },
  reaver_boots: () => {
    const c = '#2e2626';
    const spikes = [16, 24, 32, 40, 48].map((y) => path(`M57 ${y} L68 ${y + 3} L57 ${y + 6}Z`, STEEL)).join('');
    let laces = '';
    for (let y = 14; y < 52; y += 6) laces += `M36 ${y} L52 ${y + 4} M52 ${y} L36 ${y + 4} `;
    return heelOf(c, 28) + soleOf(c, 28, 82) + spikes +
      path('M30 10 H58 L58 54 C68 58 80 62 84 70 C86 78 80 82 72 82 H32 C28 82 26 76 28 70Z', c) +
      line(laces, '#1a1010', 2.8) + line(laces, '#b3202c', 1.4) +
      path('M66 62 C74 62 82 66 84 72 C84 78 80 82 72 82 H62 C60 74 60 66 66 62Z', '#7c858e') +
      circle(42, 60, 6.5, '#e8e0cc') + `<circle cx="39.6" cy="59" r="1.6" fill="#1a1010"/><circle cx="44.4" cy="59" r="1.6" fill="#1a1010"/>` + line('M40 64 V66 M42 64 V66 M44 64 V66', '#1a1010', 0.9) +
      `<ellipse cx="44" cy="10" rx="14" ry="3" fill="#120c0c"/>`;
  },
  statue_slippers: () => pair((k) => {
    const c = dark('#a8a49a', k);
    const body = 'M20 64 C20 54 34 50 50 52 C66 54 80 60 86 68 C90 76 84 82 74 82 H28 C21 82 19 74 20 64Z';
    return path('M18 78 C22 86 78 88 88 82 L86 76 C80 84 28 84 18 78Z', dark(c, 0.4)) + path(body, c) +
      path('M30 56 C38 52 48 52 54 56 C48 60 38 62 30 60Z', dark(c, 0.35)) +
      line('M58 58 L62 64 L60 70 L64 76 M40 70 L46 74', dark(c, 0.55), 1.1) +
      path('M70 62 C74 60 80 62 82 66 C78 68 72 66 70 62Z', dark('#5f7d3c', k)) + path('M22 72 C24 68 30 70 30 74 C26 76 23 75 22 72Z', dark('#5f7d3c', k)) +
      path('M84 70 L88 72 L85 75Z', light(c, 0.2));
  }),
  ram_boots: () => {
    const c = '#6b4a2f';
    const horn = 'M62 60 C76 52 92 56 92 70 C92 82 78 86 72 78 C67 72 72 64 78 68 C82 70 80 76 76 74';
    let ridges = '';
    for (const t of [[66, 56], [72, 54], [78, 54], [84, 56], [89, 61], [91, 68], [90, 75], [85, 80]]) ridges += `M${t[0]} ${t[1] - 3} L${t[0] + 1} ${t[1] + 3} `;
    return heelOf(c, 26) + soleOf(c, 26, 70) +
      path('M28 30 H54 L56 56 C62 58 66 62 66 70 C66 78 62 82 56 82 H30 C26 82 24 76 26 70Z', c) +
      [28, 34, 40, 46, 52].map((x, i) => circle(x + 1, 30 - (i % 2) * 1.4, 5, '#d8cbb0')).join('') +
      line(horn, '#6b5a40', 10) + line(horn, '#d8cdb0', 7) + line(ridges, '#9a8a6a', 1.2);
  },
  bloodless_greaves: () => {
    const c = '#e6e0d2';
    const plate = 'M30 14 C40 8 56 8 64 14 C68 36 66 62 58 86 H38 C30 62 28 36 30 14Z';
    let wraps = '';
    for (let y = 18; y < 90; y += 13) wraps += line(`M20 ${y} L80 ${y + 10}`, '#d8ceb8', 6) + line(`M20 ${y} L80 ${y + 10}`, '#f6f1e6', 4);
    return path(plate, c) + line('M47 12 C48 40 48 64 48 86', light(c, 0.6), 1.4) + line('M49 12 C50 40 50 64 50 86', dark(c, 0.3), 1) +
      clipped(plate, wraps) + circle(47, 12, 9, light(c, 0.1)) +
      line('M30 40 C40 36 56 36 66 40 M30 66 C40 62 56 62 64 66', '#7a1f22', 3.4) + line('M30 40 C40 36 56 36 66 40 M30 66 C40 62 56 62 64 66', '#c23a3a', 1.8) +
      line('M66 40 L74 46 M66 40 L72 50 M64 66 L72 72 M64 66 L70 76', '#c23a3a', 1.8);
  },
  longstride_boots: () => {
    const c = '#a8774a';
    return path('M88 52 L92 50', dark(c, 0.6)) + line('M92 50 C80 40 64 30 56 24', '#9aa0a6', 1.4) +
      heelOf(c, 24) + path('M24 80 C40 86 76 82 92 54 L90 52 C76 76 42 82 24 78Z', dark(c, 0.55)) +
      path('M26 24 H52 L54 58 C64 60 80 58 92 50 C86 66 72 78 56 80 H28 C24 80 22 74 24 68Z', c) +
      sew('M54 60 C64 62 78 60 88 54', light(c, 0.5)) + `<ellipse cx="39" cy="24" rx="13" ry="3" fill="${dark(c, 0.75)}"/>` +
      path('M25 30 C34 26 46 26 53 30 L53 36 C46 33 34 33 25 36Z', dark(c, 0.3)) + rect(46, 29, 6, 7, GOLD, 1) + shine('M30 40 V68');
  },
  featherlight_shoes: () => pair((k) => {
    const c = dark('#e6dcc8', k);
    const feather = (x, y, a, s) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">` +
      path('M0 0 C-6 -10 -4 -26 4 -34 C10 -24 10 -10 0 0Z', dark('#cfe2f0', k)) + line('M0 0 C1 -12 2 -24 3 -32', dark('#7fa8c8', k), 1) +
      line('M1 -8 L-4 -12 M1 -14 L-4 -19 M2 -20 L-2 -25 M1 -8 L6 -13 M2 -15 L7 -20', dark('#9ac0d8', k), 0.8) + '</g>';
    return feather(28, 58, -40, 0.9) + feather(32, 58, -15, 0.8) + path('M20 78 C26 84 76 86 84 80 L82 76 C76 82 30 82 20 78Z', dark(c, 0.4)) +
      path('M22 66 C22 58 36 56 48 58 C62 60 76 64 82 70 C86 78 80 80 72 80 H28 C22 80 21 74 22 66Z', c) +
      path('M44 60 C54 58 66 62 72 68 C62 70 50 68 44 64Z', dark('#9ac0d8', k)) + sew('M26 64 C40 62 60 64 78 72', dark(c, 0.3));
  }),
  fencer_boots: () => {
    const c = '#22263a';
    return path('M30 74 L42 74 L40 88 H32Z', '#8a1f2a') +
      path('M22 70 C22 60 34 56 44 58 L48 52 C54 50 60 52 62 56 L62 60 C72 62 82 66 86 72 C88 78 82 82 74 82 H30 C24 82 21 78 22 70Z', c) +
      path('M46 54 C50 46 60 46 63 52 L62 58 C58 55 52 55 48 58Z', light(c, 0.2)) +
      rect(47, 58, 16, 11, '#d5dde6', 2) + rect(50.5, 61, 9, 5, c, 1) + line('M55 58 V69', '#8f979f', 1.4) +
      line('M24 66 C34 62 56 62 84 72', 'rgba(255,255,255,0.45)', 1.6) + path('M20 80 C30 86 74 86 86 80 L84 76 C76 82 30 82 20 78Z', dark(c, 0.3));
  },
  poacher_boots: () => {
    const c = '#5a4a2a';
    const fur = 'M28 26 C24 32 30 36 26 42 C30 46 24 52 28 58 C24 64 30 66 28 72 L58 72 C56 66 62 62 58 56 C62 50 56 46 60 40 C56 34 62 30 58 24 C48 20 38 20 28 26Z';
    let hair = '';
    for (let y = 28; y < 70; y += 5) for (let x = 32; x < 56; x += 6) hair += `M${x + (y % 10 ? 3 : 0)} ${y} l1.5 3.5 `;
    let thong = '';
    for (let y = 30; y < 70; y += 9) thong += `M27 ${y} L59 ${y + 6} M59 ${y} L27 ${y + 6} `;
    return heelOf(c, 28) + soleOf(c, 28, 82) +
      path('M30 60 C40 60 52 60 58 60 C68 62 80 64 84 72 C86 78 80 82 72 82 H32 C28 82 26 76 28 70Z', c) +
      path(fur, '#9a7a52') + line(hair, '#6a5032', 0.9) + line(thong, '#3a2a18', 2.4) + line(thong, '#8a6a42', 1) +
      leaf(56, 26, -60, '#4f7a2f') + leaf(54, 24, -100, '#6f9a3a', 0.8);
  },
  pilgrim_sandals: () => sandal('#c9a36a', '#8a5a34'),
};

// ---- Charms: each one a different keepsake ------------------------------------------------
// A cord or chain runs off the top edge like the painted charm; it is left out
// when the icon is fitted, so the keepsake itself is drawn large.
const thong = (x, y, c = '#6b3f24') => `<g class="nofit">${cord(`M${x - 30} -10 C${x - 26} ${y - 16} ${x - 8} ${y - 4} ${x} ${y} C${x + 8} ${y - 4} ${x + 26} ${y - 16} ${x + 30} -10`, c, 3.5)}</g>`;
const chain = (x, y, c = '#c9ccd4') => {
  const d = `M${x - 28} -10 C${x - 24} ${y - 16} ${x - 8} ${y - 4} ${x} ${y} C${x + 8} ${y - 4} ${x + 24} ${y - 16} ${x + 28} -10`;
  return `<g class="nofit">${line(d, dark(c, 0.6), 4)}<path d="${d}" fill="none" stroke="${c}" stroke-width="2.6" stroke-dasharray="3 1.4" stroke-linecap="round"/></g>`;
};
const loop = (x, y, c = GOLD) => `<circle cx="${x}" cy="${y}" r="3.4" fill="none" stroke="${dark(c, 0.6)}" stroke-width="3.6"/><circle cx="${x}" cy="${y}" r="3.4" fill="none" stroke="${c}" stroke-width="1.8"/>`;
const gem = (x, y, r, c) => path(`M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y}Z`, c) + `<path d="M${x - r * 0.4} ${y - r * 0.3} L${x} ${y - r * 0.75}" stroke="#fff" stroke-opacity="0.8" stroke-width="1"/>`;

const C = {
  spiral_charm: () => '', // painted
  ironbark_charm: () => {
    const rings = [16, 12, 8, 4].map((r) => `<ellipse cx="48" cy="62" rx="${r}" ry="${r * 0.95}" fill="none" stroke="#8a6238" stroke-width="1"/>`).join('');
    return thong(48, 38) + path('M26 60 C24 46 36 36 50 38 C64 40 72 50 70 64 C68 78 56 86 44 84 C32 82 26 72 26 60Z', '#5a3c22') +
      path('M31 61 C30 50 39 43 49 44 C60 45 66 53 65 63 C64 74 55 80 46 79 C36 78 31 71 31 61Z', '#d9b07a') + rings +
      path('M24 56 L72 52 L72 60 L24 64Z', '#6f7780') + rivet(30, 59.5) + rivet(66, 56.5) + loop(48, 38, STEEL);
  },
  thorn_charm: () => {
    let thorns = '';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 360;
      thorns += `<g transform="rotate(${a} 48 60)">${path(`M47 ${38 + (i % 2) * 2} L48 ${32 + (i % 2) * 2} L49.5 ${38 + (i % 2) * 2}Z`, '#d8c9a0')}</g>`;
    }
    return thong(48, 38) + thorns + line('M48 40 C62 40 70 50 68 62 C66 74 56 80 46 80 C34 80 26 70 28 58 C30 46 38 40 48 40', '#2f2414', 8) +
      line('M48 40 C62 40 70 50 68 62 C66 74 56 80 46 80 C34 80 26 70 28 58 C30 46 38 40 48 40', '#6b5030', 5) +
      line('M30 52 C36 46 42 44 50 44 M66 66 C62 74 54 78 46 78', '#4f6b2a', 2.4) + circle(66, 50, 3.4, '#b3202c') + circle(62, 47, 2.8, '#b3202c') + leaf(30, 70, 120, '#5d7a2f');
  },
  dusk_charm: () => chain(46, 36) + loop(46, 36, '#c9ccd4') +
    path('M58 40 C42 38 30 50 30 64 C30 78 44 88 58 84 C48 80 42 72 42 62 C42 52 48 44 58 40Z', '#55507a') +
    gem(44, 64, 5, '#b48cff') + line('M60 52 V62 M66 58 V70', '#c9ccd4', 1) + gem(60, 64, 2.6, '#e6dcff') + gem(66, 72, 2.2, '#e6dcff'),
  whetstone_charm: () => thong(48, 30) + turn(18, path('M38 32 L60 34 L58 86 L36 84Z', '#7a8088') +
    line('M40 40 L58 42 M39 50 L58 52', dark('#7a8088', 0.3), 0.8) + path('M36 56 L59 58 L59 66 L36 64Z', '#7a4d2b') +
    line('M38 57 L42 65 M44 57 L48 65 M50 58 L54 66', '#4a2e18', 1.2) + shine('M41 70 L40 82'), 48, 58),
  heartwood_charm: () => thong(48, 40) + path('M48 86 C30 74 22 62 26 50 C30 40 42 40 48 50 C54 40 66 40 70 50 C74 62 66 74 48 86Z', '#a0683a') +
    line('M34 50 C40 56 40 66 46 76 M60 50 C56 58 58 66 52 76 M44 58 C46 62 46 68 48 72', dark('#a0683a', 0.4), 1) +
    line('M48 48 C48 40 50 34 54 30', '#4f7a2f', 2.4) + leaf(53, 32, -40, '#6f9a3a', 1.1) + leaf(52, 36, 200, '#5d8a32', 0.9),
  leech_charm: () => chain(48, 26) + rect(42, 26, 12, 8, '#b98a56', 2) +
    path('M40 34 H56 V76 C56 84 40 84 40 76Z', '#d8e6ea') + flat('M42 46 H54 V76 C54 82 42 82 42 76Z', '#a3202c') +
    path('M45 54 C50 52 52 58 50 64 C48 70 46 72 46 66 C44 62 42 56 45 54Z', '#2a1418') + shine('M43 40 V74'),
  oakshield_charm: () => {
    const shield = 'M48 38 C64 38 72 50 72 62 C72 76 62 86 48 86 C34 86 24 76 24 62 C24 50 32 38 48 38Z';
    return thong(48, 36) + path(shield, '#9a6a3a') + clipped(shield, line('M36 30 V90 M48 30 V90 M60 30 V90', dark('#9a6a3a', 0.45), 1.4)) +
      `<path d="${shield}" fill="none" stroke="#6f7780" stroke-width="4"/>` + circle(48, 62, 8, '#a8b0b8') + rivet(30, 52) + rivet(66, 52) + rivet(30, 74) + rivet(66, 74);
  },
  quickhand_charm: () => `<ellipse cx="46" cy="60" rx="24" ry="17" fill="none" stroke="${dark(GOLD, 0.6)}" stroke-width="11"/>` +
    `<ellipse cx="46" cy="60" rx="24" ry="17" fill="none" stroke="${fill(GOLD)}" stroke-width="8"/>` +
    `<ellipse cx="46" cy="60" rx="24" ry="17" fill="none" stroke="#fff3c8" stroke-width="1.2" stroke-dasharray="14 60"/>` +
    rect(38, 34, 16, 10, dark(GOLD, 0.2), 2) + gem(46, 36, 7, '#3fae6a') + line('M70 34 L84 28 M72 42 L88 40 M68 26 L78 16', '#fff1c0', 1.8),
  songbird_charm: () => thong(44, 40) + path('M24 62 C24 50 34 42 46 44 C52 36 62 36 64 44 L72 46 L64 50 C68 60 64 72 52 76 L44 84 L42 76 C30 76 24 70 24 62Z', '#b07a46') +
    path('M34 58 C40 52 50 52 54 60 C48 64 40 66 34 62Z', '#8a5a34') + circle(58, 44, 2, '#1c130d') + circle(38, 70, 3, '#3a2a18') + loop(44, 42, '#8a5a34'),
  reaper_charm: () => thong(48, 42) +
    path('M32 66 C30 52 38 46 48 46 C58 46 66 52 64 66 C64 72 60 74 58 78 H38 C36 74 32 72 32 66Z', '#e6dcc4') +
    `<ellipse cx="41" cy="62" rx="4.5" ry="5" fill="#1c130d"/><ellipse cx="55" cy="62" rx="4.5" ry="5" fill="#1c130d"/>` +
    path('M46 68 L48 72 L50 68Z', '#1c130d') + line('M40 78 V84 M44 78 V85 M48 78 V85 M52 78 V85 M56 78 V84', '#6b5a40', 1) +
    path('M38 78 H58 L56 86 H40Z', '#d8cdb0'),
  warden_charm: () => loop(48, 34, '#6f7780') + turn(10, `<circle cx="48" cy="48" r="10" fill="none" stroke="${dark('#7c858e', 0.6)}" stroke-width="8"/><circle cx="48" cy="48" r="10" fill="none" stroke="${fill('#7c858e')}" stroke-width="5"/>` +
    rect(45, 56, 6, 30, '#7c858e', 1.5) + path('M51 72 H60 V76 H56 V80 H51Z M51 82 H58 V86 H51Z', '#7c858e') + gem(48, 48, 3, '#7fc8f0'), 48, 60) +
    `<g class="nofit">${line('M48 30 V-10', '#3a2a18', 3)}</g>`,
  pilgrim_token: () => {
    let ribs = '';
    for (let i = -3; i <= 3; i++) ribs += `M48 82 L${48 + i * 7} ${46 + Math.abs(i) * 2.5} `;
    return thong(48, 40) + path('M48 84 C40 84 24 72 22 58 C22 48 34 40 48 40 C62 40 74 48 74 58 C72 72 56 84 48 84Z', '#f0dcc0') +
      line(ribs, '#c09a70', 1.6) + path('M40 82 L48 90 L56 82Z', '#e2c8a4') + circle(48, 44, 2.6, '#3a2a18');
  },
  samaritan_charm: () => chain(48, 34) + loop(48, 34, '#c9ccd4') +
    path('M36 84 C30 78 30 66 32 58 L32 46 C32 42 37 42 37 46 L37 56 L38 40 C38 36 43 36 43 40 L43 56 L44 38 C44 34 49 34 49 38 L49 56 L50 40 C50 36 55 36 55 40 L55 60 L58 54 C60 50 65 52 63 57 L58 72 C56 80 50 86 44 86Z', '#d8dde4') +
    path('M44 74 C38 70 37 64 41 62 C43 61 44 62 45 64 C46 62 47 61 49 62 C53 64 52 70 44 74Z', '#c2313c'),
  tinker_charm: () => {
    let teeth = '';
    for (let i = 0; i < 10; i++) teeth += `<g transform="rotate(${i * 36} 48 60)">${rect(44.5, 36, 7, 7, '#b0763a', 1)}</g>`;
    return thong(48, 34) + teeth + circle(48, 60, 19, '#b0763a') + circle(48, 60, 7, '#2a1a10') +
      line('M30 82 C24 74 36 70 30 62 C24 54 36 50 30 42', '#8f979f', 3) + line('M30 82 C24 74 36 70 30 62 C24 54 36 50 30 42', '#d5dde6', 1.4) +
      [0, 72, 144, 216, 288].map((a) => `<g transform="rotate(${a} 48 60)">${rivet(48, 47, GOLD)}</g>`).join('');
  },
  beastbane_charm: () => thong(48, 34) + path('M38 38 H58 C60 52 56 70 48 88 C42 72 36 54 38 38Z', '#efe6d0') +
    path('M37 38 H59 L58 48 H38Z', '#5a3a22') + line('M38 41 L58 43 M38 45 L58 47', '#8a6238', 1.2) + line('M44 52 C46 64 46 74 48 84', '#c9bda2', 1.2),
  kingsbane_charm: () => chain(48, 36) +
    path('M24 76 L22 52 L32 62 L38 44 L46 58 L50 60 L54 48 L62 62 L72 50 L70 76Z', GOLD) +
    path('M24 70 H70 V80 H24Z', dark(GOLD, 0.25)) + line('M50 60 L47 70 L52 80', '#2a1a10', 1.6) +
    gem(32, 74, 3.4, '#b3202c') + gem(60, 74, 3.4, '#3f6fd8') + circle(38, 44, 2.6, '#fff3c8') + circle(72, 50, 2.6, '#fff3c8'),
  glutton_charm: () => loop(46, 30, '#c9ccd4') + turn(-25, `<ellipse cx="46" cy="44" rx="9" ry="13" fill="${fill('#d5dde6')}" stroke="${dark('#d5dde6', 0.6)}" stroke-width="2"/>` +
    rect(44, 56, 4.5, 30, '#d5dde6', 2) + `<ellipse cx="44" cy="42" rx="4" ry="7" fill="#fff" fill-opacity="0.4"/>`, 46, 60) +
    turn(25, rect(51, 50, 4, 34, '#c9ccd4', 2) + path('M45 34 V48 C45 52 61 52 61 48 V34 H58.5 V46 H56 V34 H53.5 V46 H51 V34 H48.5 V46 H47 V34Z', '#c9ccd4'), 50, 60),
  hourglass_charm: () => thong(48, 30) + rect(30, 30, 36, 6, '#8a5a34', 2) + rect(30, 84, 36, 6, '#8a5a34', 2) +
    path('M36 36 H60 C60 48 52 54 50 60 C52 66 60 72 60 84 H36 C36 72 44 66 46 60 C44 54 36 48 36 36Z', '#d8e6ea') +
    flat('M40 42 H56 C54 48 50 52 48 56 C46 52 42 48 40 42Z', '#e6b860') + flat('M38 82 C40 74 46 70 48 66 C50 70 56 74 58 82Z', '#e6b860') +
    line('M48 56 V70', '#e6b860', 1) + line('M31 36 V84 M65 36 V84', '#6b4a2f', 3),
  phoenix_feather: () => turn(-30, path('M48 90 C40 74 34 54 38 34 C42 18 50 10 56 6 C62 20 64 40 60 58 C58 70 54 80 48 90Z', '#e0582a') +
    flat('M50 82 C46 66 44 50 48 32 C50 22 54 16 56 12 C58 28 58 46 54 62 C53 70 52 76 50 82Z', '#f2a83a') +
    line('M48 90 C50 70 52 44 56 8', '#fff1b0', 1.3) + line('M50 70 L40 62 M51 58 L41 48 M53 44 L44 34 M51 70 L58 62 M53 56 L60 48', '#b03a1a', 1) +
    path('M56 6 C54 0 58 -4 60 -6 C60 0 64 2 60 8Z', '#ffd24a'), 48, 50),
  magpie_charm: () => loop(48, 34, '#c9ccd4') + `<circle cx="48" cy="46" r="10" fill="none" stroke="#c9ccd4" stroke-width="2.6"/>` +
    line('M42 54 L32 66 M48 56 V70 M54 54 L66 64', '#c9ccd4', 1.4) +
    circle(30, 72, 7, GOLD) + circle(30, 72, 3, dark(GOLD, 0.3)) + circle(48, 78, 8, '#5a8ac8') + `<circle cx="45" cy="76" r="1.4" fill="#1c130d"/><circle cx="51" cy="76" r="1.4" fill="#1c130d"/><circle cx="45" cy="81" r="1.4" fill="#1c130d"/><circle cx="51" cy="81" r="1.4" fill="#1c130d"/>` +
    turn(30, rect(64, 62, 4, 16, '#b9c2cc', 1) + circle(66, 60, 4.5, '#b9c2cc') + rect(66, 72, 5, 3, '#b9c2cc', 0.5), 66, 66) + gem(40, 62, 3.6, '#b3202c'),
  forgetmenot_charm: () => chain(48, 34) + loop(48, 36, GOLD) + `<ellipse cx="48" cy="62" rx="20" ry="24" fill="${fill(GOLD)}" stroke="${dark(GOLD, 0.6)}" stroke-width="2"/>` +
    `<ellipse cx="48" cy="62" rx="15" ry="19" fill="#e8f0f2"/>` +
    [[42, 56], [54, 60], [46, 70]].map(([x, y]) => [0, 72, 144, 216, 288].map((a) => `<g transform="rotate(${a} ${x} ${y})"><circle cx="${x}" cy="${y - 3.2}" r="2.6" fill="#6f8fe0"/></g>`).join('') + `<circle cx="${x}" cy="${y}" r="1.6" fill="#f2d050"/>`).join('') +
    line('M46 70 C44 76 46 80 48 82', '#4f7a2f', 1.2) + `<ellipse cx="42" cy="52" rx="5" ry="8" fill="#fff" fill-opacity="0.35"/>`,
  echo_stone: () => thong(46, 40) + path('M24 62 C22 50 32 40 46 40 C60 40 72 48 72 62 C72 78 58 86 46 86 C32 86 26 76 24 62Z', '#8f8b80') +
    `<ellipse cx="50" cy="60" rx="8" ry="7" fill="#1e140c"/>` + line('M44 40 V54', '#3a2a18', 2.4) + line('M30 74 C34 78 40 80 46 80', light('#8f8b80', 0.4), 1.2) +
    line('M76 50 C80 56 80 66 76 72 M82 46 C88 54 88 68 82 76', '#e6ecf2', 1.6),
  fogglass_charm: () => chain(48, 30) + circle(48, 62, 22, '#c8d6e0') +
    flat('M30 66 C36 58 44 70 52 62 C58 56 64 62 68 58 C66 72 58 82 48 82 C38 82 32 76 30 66Z', '#e6ecf2') +
    line('M34 56 C40 50 48 58 56 52', '#ffffff', 1.4) +
    `<g fill="none" stroke="${dark('#5f6870', 0.4)}" stroke-width="3.6"><path d="M48 40 V84 M27 62 H69"/><ellipse cx="48" cy="62" rx="22" ry="22"/></g>` +
    `<g fill="none" stroke="#8f979f" stroke-width="2"><path d="M48 40 V84 M27 62 H69"/><ellipse cx="48" cy="62" rx="22" ry="22"/></g>` + rect(42, 34, 12, 6, '#6f7780', 1.5),
longarm_charm: () => thong(48, 22) + turn(-30, rect(42, 22, 12, 30, '#c9a36a', 3) + rect(40, 48, 16, 6, '#8a5a34', 2) +
    path('M38 54 H58 L60 66 C60 72 56 76 50 76 L50 92 C50 96 44 96 44 92 L44 76 C38 74 36 70 36 64 L36 58Z', '#e6d4b0') +
    path('M58 58 C64 56 66 62 62 66 L58 66Z', '#e6d4b0') + line('M41 62 H55 M41 68 H53', '#b89a70', 1) + line('M46 80 V90', '#b89a70', 0.8), 48, 56),
bully_charm: () => {
    let rings = '';
    for (let i = 0; i < 4; i++) {
      const x = 27 + i * 14;
      rings += `<circle cx="${x}" cy="48" r="8" fill="none" stroke="${dark('#c9963a', 0.6)}" stroke-width="7.5"/><circle cx="${x}" cy="48" r="8" fill="none" stroke="${fill('#d8a848')}" stroke-width="5"/>` +
        `<path d="M${x - 5} 43 A7 7 0 0 1 ${x + 3} 41.5" fill="none" stroke="#fff1c0" stroke-width="1.2"/>`;
    }
    return rings + path('M20 58 C30 62 66 62 76 58 C78 64 72 76 60 78 H36 C24 76 18 64 20 58Z', '#c9963a') + line('M24 62 C36 66 60 66 72 62', '#fff1c0', 1);
  },
  laststand_charm: () => thong(48, 34) +
    path('M30 50 L36 36 L40 50 M66 50 L60 36 L56 50 M30 74 L36 88 L42 74 M66 74 L60 88 L54 74', '#4a5258') +
    path('M48 38 L68 58 L48 86 L28 58Z', '#a3121e') + flat('M48 38 L68 58 L48 62 L28 58Z', '#d8303c') +
    line('M48 44 L44 56 L50 64 L45 78', '#2a0a0e', 1.4) + line('M47 44 L43 56', '#ffb0b0', 0.8) +
    path('M26 56 C28 50 36 48 40 52 L40 64 C36 68 28 66 26 60Z M70 56 C68 50 60 48 56 52 L56 64 C60 68 68 66 70 60Z', '#5f6870'),
};

// ---- Potions and pouches that used a shared template ----------------------------------------
const A2 = {
  tonic: () => rect(42, 2, 12, 10, '#b98a56', 2) + path('M41 12 H55 V30 C62 34 64 40 64 48 V82 C64 88 32 88 32 82 V48 C32 40 34 34 41 30Z', '#d8e6ea') +
    flat('M34 50 H62 V81 C62 85 34 85 34 81Z', '#f2b33a') + `<g fill="#fff3c0" fill-opacity="0.8"><circle cx="44" cy="70" r="2"/><circle cx="52" cy="62" r="1.4"/><circle cx="48" cy="56" r="1.1"/></g>` +
    path('M34 54 H62 V66 H34Z', '#efe2c0') + line('M38 60 C42 56 46 64 50 58 C54 54 56 62 58 60', '#8a5a34', 1.6) +
    path('M40 10 C42 14 54 14 56 10 L55 16 C52 18 44 18 41 16Z', '#a3202c') + shine('M36 70 V82'),
  iron_draught: () => path('M28 34 C28 26 68 26 68 34 V80 C68 88 28 88 28 80Z', '#7c858e') +
    path('M40 18 H56 V30 H40Z', '#5f6870') + rect(38, 12, 20, 8, '#4a5258', 2) +
    path('M28 46 H68 V52 H28Z M28 68 H68 V74 H28Z', '#4a5258') + rivet(32, 49) + rivet(64, 49) + rivet(32, 71) + rivet(64, 71) +
    path('M36 56 H60 V64 H36Z', '#c9b890') + line('M40 60 H56', '#5a4a2a', 1.4) + shine('M33 36 V44 M33 54 V66'),
  fury_draught: () => path('M48 4 L54 16 L50 18 L56 30 C68 38 72 50 70 64 C68 80 58 88 48 88 C38 88 28 80 26 64 C24 50 28 38 40 30 L46 18 L42 16Z', '#d8e6ea') +
    flat('M30 56 C34 52 40 58 46 54 C52 50 58 56 66 52 C68 70 60 84 48 84 C36 84 28 72 30 56Z', '#c2313c') +
    flat('M42 70 C44 62 50 64 48 56 C54 60 58 68 54 76 C52 80 44 80 42 70Z', '#ff8a2a') + flat('M46 72 C47 68 50 68 50 64 C53 68 53 74 50 77 C48 78 46 76 46 72Z', '#ffd24a') +
    rect(43, 0, 10, 6, '#2a1a10', 1.5) + shine('M34 46 C32 54 32 62 34 70'),
  antidote: () => line('M66 26 C76 30 80 40 74 46', '#c9a36a', 1.6) + path('M64 44 L80 44 L84 54 L72 60 Z', '#e8d8b0') + leaf(72, 50, -20, '#3fae6a', 0.8) +
    rect(40, 6, 16, 10, '#b98a56', 2) + path('M38 16 H58 V28 C66 32 70 40 70 50 V78 C70 86 26 86 26 78 V50 C26 40 30 32 38 28Z', '#d8e6ea') +
    flat('M28 52 H68 V77 C68 83 28 83 28 77Z', '#3fae6a') +
    path('M26 58 C36 54 44 62 54 58 C60 56 66 60 70 58 V70 C64 72 58 68 50 72 C42 76 34 70 26 72Z', '#b98a56') +
    line('M28 62 C38 58 46 66 56 62 M28 68 C38 64 46 72 56 68', '#8a6238', 1) + shine('M32 34 V48'),
  blessed_water: () => `<g class="nofit">${cord('M18 -10 C18 20 26 30 32 34 M78 -10 C78 20 70 30 64 34', '#8a6238', 3)}</g>` +
    loop(32, 36, '#c9ccd4') + loop(64, 36, '#c9ccd4') + rect(42, 22, 12, 10, '#a8b0b8', 2) +
    circle(48, 60, 26, '#c9ccd4') + circle(48, 60, 17, '#7fc8f0') + flat('M34 64 A16 16 0 0 0 62 64 C56 66 40 66 34 64Z', '#5aa8d8') +
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<g transform="rotate(${a} 48 60)">${path('M48 40 L50 43.5 L46 43.5Z', GOLD)}</g>`).join('') +
    `<ellipse cx="40" cy="52" rx="5" ry="8" fill="#fff" fill-opacity="0.4"/>`,
  flash_powder: () => path('M28 46 C24 60 26 80 34 86 C42 90 58 90 64 86 C72 78 72 60 68 46 C62 42 34 42 28 46Z', '#efe6d4') +
    path('M32 46 C36 34 44 30 48 26 C52 30 60 34 64 46 C56 50 40 50 32 46Z', '#e2d6bc') + line('M34 44 C42 48 54 48 62 44', '#b3202c', 3) +
    line('M44 28 L40 20 M48 26 V16 M52 28 L58 20', '#ffe48a', 2) + `<g fill="#fff8d0"><circle cx="36" cy="18" r="1.8"/><circle cx="62" cy="16" r="1.4"/><circle cx="54" cy="10" r="1.2"/></g>` +
    line('M38 60 C44 66 54 66 60 60', '#c9b890', 1.2) + path('M44 70 L48 64 L52 70 L48 76Z', '#f2b33a'),
  firepot: () => line('M48 22 C48 14 42 12 40 6', '#5c3a1c', 2.4) + path('M38 4 C36 0 40 -4 42 -6 C42 -2 46 0 42 6Z', '#ffb02a') +
    path('M30 40 C24 46 22 62 28 74 C34 86 62 86 68 74 C74 62 72 46 66 40Z', '#a3452a') + path('M32 30 H64 V40 C56 44 40 44 32 40Z', '#7a2f1a') +
    `<ellipse cx="48" cy="30" rx="16" ry="4" fill="#3a1a0e"/>` + line('M26 56 C40 60 56 60 70 56', '#e8b060', 3) + line('M26 56 C40 60 56 60 70 56', '#7a2f1a', 1) +
    line('M44 30 L52 22 M50 30 L46 24', '#8a6238', 2),
};

// ---- Actives --------------------------------------------------------------------------------
const cork = (x, y, w = 14) => rect(x - w / 2, y, w, 10, '#b98a56', 2);
const pot = (c, lid, mark, markColor) => path('M22 40 C22 30 74 30 74 40 L70 80 C68 88 28 88 26 80Z', c) + path('M20 38 C24 26 72 26 76 38 C70 44 26 44 20 38Z', lid) + glyph(mark, 48, 64, markColor, 0.95);
const A = {
  salve: () => pot('#b3202c', '#e8d8b0', 'cross', '#fff3e0') + line('M24 44 H72', '#8a6a3a', 3),
  apple: () => path('M48 30 C62 20 80 30 78 52 C76 74 62 88 48 82 C34 88 20 74 18 52 C16 30 34 20 48 30Z', '#9bc22a') + line('M48 30 C48 20 52 14 56 10', '#5c3a1c', 4) + path('M56 14 C64 6 74 8 78 14 C70 20 62 20 56 14Z', '#4f9a3a') + shine('M28 44 C30 36 36 32 40 32'),
  cheese: () => path('M12 62 L70 30 C82 34 86 44 86 54 V76 H12Z', '#f0c040') + path('M12 62 L70 30 C82 34 86 44 86 54Z', '#f7dc7a') + circle(34, 68, 5, '#d9a520') + circle(60, 64, 4, '#d9a520') + circle(74, 70, 3, '#d9a520'),
  honeycake: () => path('M14 58 C14 40 82 40 82 58 V74 C82 86 14 86 14 74Z', '#c98a3a') + path('M14 56 C14 38 82 38 82 56 C70 68 60 56 48 66 C36 56 26 68 14 56Z', '#f7c948') + glyph('drop', 48, 30, '#f7c948', 0.9),
  bloodroot: () => path('M40 34 C28 46 30 66 44 86 C50 90 54 88 54 84 C46 66 50 50 58 38Z', '#a3252f') + line('M44 60 C36 62 30 70 26 78 M48 72 C56 74 60 80 64 86', '#a3252f', 4) + path('M46 34 C40 20 44 10 54 6 C60 16 58 28 52 36Z', '#4f9a3a') + path('M52 36 C60 26 72 24 80 30 C74 40 62 42 54 40Z', '#3f8a3a'),
  bandage: () => circle(44, 54, 26, '#efe6d2') + circle(44, 54, 9, '#c9bda2') + path('M62 72 L86 78 L84 90 L56 80Z', '#efe6d2') + glyph('cross', 44, 54, '#c2313c', 0.55),
  smoke: () => pot('#5a5f66', '#3a3f46', 'wave', '#e6ecf2') + circle(40, 18, 8, '#b9c0c8') + circle(54, 12, 10, '#d0d6dc') + circle(64, 22, 7, '#b9c0c8'),
  dusk_veil: () => path('M14 20 C30 10 66 10 82 20 C78 46 86 66 78 88 C68 78 60 90 48 82 C36 90 28 78 18 88 C10 66 18 46 14 20Z', '#3a2f5c') + glyph('moon', 48, 46, '#e6dcff', 1.3) + glyph('thorn', 30, 30, '#e6dcff', 0.35) + glyph('thorn', 66, 62, '#e6dcff', 0.3),
  stone: () => path('M18 60 L30 34 L56 26 L78 42 L80 66 L60 82 L32 80Z', '#9aa0a6') + line('M30 34 L46 50 L78 42 M46 50 L60 82', dark('#9aa0a6', 0.3), 2.5) + shine('M34 40 L52 32'),
  firecracker: () => turn(30, rect(36, 30, 24, 54, '#c2313c', 4) + rect(36, 40, 24, 6, '#f2d27a', 0) + rect(36, 66, 24, 6, '#f2d27a', 0) + line('M48 30 C48 20 56 18 58 10', '#5c3a1c', 3)) + glyph('thorn', 70, 14, '#ffd24a', 0.9),
  caltrops: () => [[30, 62, 0], [62, 66, 40], [46, 34, 80]].map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})">${path('M0 -16 L4 -3 L16 6 L3 5 L0 16 L-3 5 L-16 6 L-4 -3Z', '#8f979f')}</g>`).join(''),
  throwing_knife: () => turn(45, path('M48 4 L58 44 H38Z', STEEL) + rect(44, 44, 8, 30, '#2b2b3a', 2) + circle(48, 82, 7, 'none') + `<circle cx="48" cy="82" r="6" fill="none" stroke="${INK}" stroke-width="6"/><circle cx="48" cy="82" r="6" fill="none" stroke="${STEEL}" stroke-width="2.5"/>` + shine('M46 38 L48 12')),
  war_horn: () => path('M12 30 C20 24 30 26 34 34 C46 58 62 70 84 70 V86 C54 88 30 72 18 46 C14 40 10 36 12 30Z', '#e6dcc8') + rect(78, 66, 10, 24, GOLD, 3) + rect(30, 40, 8, 12, GOLD, 2) + cord('M34 46 C40 20 70 22 84 66', '#8a2f2a', 2.5),
};

// ---- Materials ------------------------------------------------------------------------------
const M = {
  herb: () => line('M48 90 C46 60 40 40 30 18 M48 70 C56 50 62 36 70 22 M47 78 C40 64 30 56 20 52', '#4f7a3a', 4) +
    [[30, 18], [34, 30], [39, 42], [70, 22], [64, 34], [58, 46], [20, 52], [30, 58]].map(([x, y]) => circle(x, y, 6, '#8f6fd8')).join(''),
  salt: () => path('M10 82 C22 50 36 34 48 34 C60 34 74 50 86 82Z', '#f4f1ea') + line('M30 66 l6 -6 M48 54 l6 -6 M58 72 l6 -6 M40 76 l5 -5', '#b9c8d8', 3) + glyph('thorn', 70, 26, '#ffffff', 0.6),
  scroll: () => rect(22, 22, 52, 56, '#efe2c0', 3) + rect(14, 14, 68, 12, '#d9c79a', 6) + rect(14, 74, 68, 12, '#d9c79a', 6) + glyph('shield', 48, 50, '#5a8ac8', 1.1) + line('M30 66 H66', '#8a7a5a', 2),
  candle: () => rect(34, 36, 28, 50, '#f2e2a8', 4) + flat('M34 44 C40 52 44 40 50 48 C56 54 58 42 62 46 V38 H34Z', '#fff3c8') + line('M48 36 V28', INK, 3) + path('M48 6 C58 16 56 26 48 28 C40 26 38 16 48 6Z', '#ffb02a') + flat('M48 16 C52 20 51 25 48 26 C45 25 44 20 48 16Z', '#fff3a0'),
  lockpicks: () => turn(25, at(-10, 0, 1, line('M48 88 V30 C48 20 56 18 58 12', INK, 8) + line('M48 88 V30 C48 20 56 18 58 12', STEEL, 4))) + turn(-20, at(10, 0, 1, line('M48 88 V26 L42 18 L48 12', INK, 8) + line('M48 88 V26 L42 18 L48 12', '#9fb0c4', 4))) + `<circle cx="48" cy="84" r="8" fill="none" stroke="${INK}" stroke-width="7"/><circle cx="48" cy="84" r="8" fill="none" stroke="${GOLD}" stroke-width="3"/>`,
  coin: () => circle(48, 50, 34, GOLD) + `<circle cx="48" cy="50" r="26" fill="none" stroke="${dark(GOLD, 0.3)}" stroke-width="3"/>` + glyph('clover', 48, 50, '#fff3c0', 1.6) + shine('M26 40 A24 24 0 0 1 44 24'),
};

const ALL = { ...W, ...B, ...C, ...A, ...A2, ...M };

/**
 * Items that already have a painted icon in the HUD set use it as is, wrapped
 * in SVG so every item's art lives at public/art/items/<id>.svg. Everything
 * else is drawn above in the same style.
 */
const PAINTED = {
  dagger: 'dagger', springheel_boots: 'boots', spiral_charm: 'charm', salve: 'salve', apple: 'apple', stone: 'stone',
  herb: 'herb', cheese: 'cheese', lockpicks: 'picks', scroll: 'scroll', smoke: 'smoke',
};
const paintedDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/art/player-hud');
let count = 0;
for (const [id, draw] of Object.entries(ALL)) {
  if (PAINTED[id]) {
    const data = readFileSync(resolve(paintedDir, `${PAINTED[id]}.webp`)).toString('base64');
    writeFileSync(resolve(out, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 96 96"><title>${id}</title><image href="data:image/webp;base64,${data}" width="96" height="96"/></svg>\n`);
    count++;
    continue;
  }
  defs = '';
  gid = 0;
  sculpted = true;
  const body = draw();
  // FIT is replaced below once the drawing's real bounds are measured.
  const framed = `<g filter="url(#paint)"><g id="art" transform="FIT">${body}</g></g>`;
  writeFileSync(resolve(out, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 96 96"><title>${id}</title><defs>${SHARED_DEFS}${SCULPT_DEFS}${PLANES_DEF}${paintFilter(count + 3)}${defs}</defs>${framed}</svg>\n`);
  count++;
}
// Fit each drawing to the frame like the painted set, which fills it edge to
// edge. The bounds come from a real browser (Playwright, as for the checks).
const { createRequire } = await import('node:module');
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html></html>');
const BOX = 82; // the painted icons fill about 85% of the frame; leave room for the outline and shadow
for (const id of Object.keys(ALL)) {
  if (PAINTED[id]) continue;
  const file = resolve(out, `${id}.svg`);
  const svg = readFileSync(file, 'utf8');
  // Measured from rendered pixels: a box round rotated parts would be too loose.
  const bare = svg.replace('transform="FIT"', '').replace('filter="url(#paint)"', '').replace('class="nofit"', 'visibility="hidden"');
  const b = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(src)))}`;
    await img.decode();
    const size = 384;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0, size, size);
    const { data } = g.getImageData(0, 0, size, size);
    let x0 = size, y0 = size, x1 = -1, y1 = -1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] < 24) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const k = 96 / size;
    return { x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k };
  }, bare);
  // A charm's pendant sits low with room above for its cord, as in the painted charm.
  const pendant = svg.includes('class="nofit"');
  const box = pendant ? 64 : BOX;
  const scale = Math.min(box / b.w, box / b.h, 1.7);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const fit = `translate(48 ${pendant ? 56 : 47}) scale(${scale.toFixed(3)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`;
  writeFileSync(file, svg.replace('transform="FIT"', `transform="${fit}"`));
}
await browser.close();
console.log(`wrote ${count} icons to ${out}`);
