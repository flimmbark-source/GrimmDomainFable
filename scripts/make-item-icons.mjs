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
  return `<${tag} ${geo} fill="${fill(c)}" filter="url(#bev)"/><${tag} ${geo} fill="${facets()}"/>` +
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
const grip = (y0, y1, c = LEATHER, w = 7) => rect(48 - w / 2, y0, w, y1 - y0, c, 3);
const haft = (y0, y1, c = WOOD, w = 6) => rect(48 - w / 2, y0, w, y1 - y0, c, 3);
const guard = (y, w, c = GOLD, h = 6) => rect(48 - w / 2, y - h / 2, w, h, c, 3);
const pommel = (y, c = GOLD, r = 5) => circle(48, y, r, c);
/** A straight blade from y = base up to y = tip; `w` at the base. */
const blade = (base, tip, w, c = STEEL) => path(`M${48 - w / 2} ${base} L${48 - w / 2} ${tip + 12} L48 ${tip} L${48 + w / 2} ${tip + 12} L${48 + w / 2} ${base}Z`, c) + shine(`M${48 - w / 5} ${base - 4} V${tip + 16}`);
const curved = (base, tip, w, bend, c = STEEL) => path(`M${48 - w / 2} ${base} C${48 - w / 2 + bend} ${(base + tip) / 2} ${48 + bend} ${tip + 10} ${48 + bend * 1.5} ${tip} C${48 + w / 2 + bend} ${tip + 18} ${48 + w / 2 + bend * 0.6} ${(base + tip) / 2} ${48 + w / 2} ${base}Z`, c);
const axeHead = (y, size, c = STEEL, side = 1) => path(`M48 ${y - size * 0.35} C${48 + side * size * 0.6} ${y - size * 0.7} ${48 + side * size} ${y - size * 0.6} ${48 + side * size} ${y - size * 0.6} C${48 + side * size * 1.25} ${y} ${48 + side * size} ${y + size * 0.6} ${48 + side * size} ${y + size * 0.6} C${48 + side * size * 0.6} ${y + size * 0.7} 48 ${y + size * 0.35} 48 ${y + size * 0.35}Z`, c);
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
const BOOT = {
  tall: 'M30 12 H54 V52 C70 54 82 62 82 74 V80 H26 C24 60 28 40 30 12Z',
  ankle: 'M32 30 H54 V54 C70 56 82 64 82 74 V80 H26 C24 66 30 50 32 30Z',
  shoe: 'M30 46 H50 C56 56 72 58 82 68 V78 H24 C22 66 26 56 30 46Z',
  wader: 'M28 6 H56 V50 C72 52 84 62 84 74 V82 H24 C22 58 26 34 28 6Z',
  greave: 'M32 10 L56 14 V52 C70 54 80 62 80 74 V80 H28 C26 60 28 36 32 10Z',
};
/** One boot: shaft, sole, turned-down cuff, laces or straps, a fold, and the item's mark. */
function oneBoot(shape, c, trim, mark, markColor) {
  const cuffY = { tall: 12, ankle: 30, shoe: 46, wader: 6, greave: 12 }[shape];
  const shaftEnd = shape === 'shoe' ? 58 : 52;
  const lace = shape === 'greave' ? dark(c, 0.45) : light(trim, 0.1);
  const laces = [];
  for (let y = cuffY + 12; y < shaftEnd - 2; y += 8) laces.push(`M36 ${y} L52 ${y + 3}`);
  return path(BOOT[shape], c) + rect(22, 78, 64, 8, dark(c, 0.55), 3) + rect(27, cuffY - 3, 30, 9, trim, 3) +
    (laces.length ? line(laces.join(' '), dark(c, 0.7), 3.6) + line(laces.join(' '), lace, 1.8) : '') +
    line(`M54 ${shaftEnd + 2} C62 ${shaftEnd + 4} 70 ${shaftEnd + 8} 76 ${shaftEnd + 14}`, dark(c, 0.5), 1.6) +
    shine(`M31 ${cuffY + 12} V${shaftEnd - 2}`) + glyph(mark, 62, 70, markColor, 0.75);
}
/** A pair, like the painted boots: the far boot set back, darker and a little smaller. */
function boot(shape, c, trim, mark, markColor, extra = '') {
  return at(-6, -4, 0.92, oneBoot(shape, dark(c, 0.22), dark(trim, 0.22), mark, dark(markColor, 0.3))) +
    at(8, 8, 0.92, oneBoot(shape, c, trim, mark, markColor) + extra);
}
const sandal = (c, strap) => rect(18, 70, 66, 10, c, 5) + line('M28 70 C34 46 48 46 52 70 M52 70 C60 54 72 56 76 70', INK, 9) + line('M28 70 C34 46 48 46 52 70 M52 70 C60 54 72 56 76 70', strap, 5) + glyph('heart', 40, 40, '#ff8fa0', 0.8);
const B = {
  springheel_boots: () => boot('tall', '#a5642f', GOLD, 'up', '#ffe48a', line('M30 90 q6 -6 12 0 t12 0 t12 0', STEEL, 3)),
  softsole_boots: () => boot('ankle', '#3f8f52', '#d7e7b8', 'leaf', '#d9f5b0'),
  catspaw_boots: () => boot('shoe', '#4a6fa8', '#cfd9ee', 'paw', '#eaf2ff'),
  courier_boots: () => boot('tall', '#b23a48', '#f1d9a0', 'wing', '#fff1c8'),
  tumbler_boots: () => boot('ankle', '#2f9a8a', '#f0e0a0', 'arrows', '#fff3b8'),
  mistwalker_boots: () => boot('tall', '#8f9bb0', '#e6ecf5', 'wave', '#ffffff'),
  bramble_boots: () => boot('ankle', '#5d7a2f', '#3a2a1c', 'thorn', '#f2e6c0', path('M22 70 L10 66 L22 62Z', STEEL)),
  pilgrim_sandals: () => sandal('#c9a36a', '#8a5a34'),
  shadowstep_boots: () => boot('tall', '#2b2438', '#5c4a80', 'moon', '#c9b8ff'),
  lastlegs_boots: () => boot('ankle', '#8a2f2a', '#e0b060', 'heart', '#ffd0c0'),
  ironshod_boots: () => boot('greave', '#7c858e', '#4a5258', 'shield', '#e8eef4', rect(22, 76, 64, 10, '#4a5258', 2)),
  marsh_waders: () => boot('wader', '#5a6b3a', '#2f3a22', 'drop', '#a8d8f0'),
  reaver_boots: () => boot('tall', '#3a2a2a', '#b3202c', 'skull', '#f2ead8'),
  statue_slippers: () => boot('shoe', '#b9b4a6', '#8f8b80', 'eye', '#f7f3e6'),
  ram_boots: () => boot('greave', '#6b4a2f', '#d8d2c0', 'crown', '#f2ead8', path('M82 68 L94 72 L82 78Z', STEEL)),
  bloodless_greaves: () => boot('greave', '#d8d2c8', '#a23a3a', 'cross', '#c2313c'),
  longstride_boots: () => boot('wader', '#a8774a', '#5c4130', 'up', '#ffe9b0'),
  featherlight_shoes: () => boot('shoe', '#e6dcc8', '#9ac0d8', 'feather', '#7fb0d0'),
  fencer_boots: () => boot('ankle', '#2b3a5c', GOLD, 'bolt', '#ffe48a'),
  poacher_boots: () => boot('shoe', '#5a4a2a', '#2f2618', 'paw', '#c9d98a'),
};

// ---- Charms: a cord, a pendant, a mark -----------------------------------------------------
// The cord is left out when the icon is fitted to the frame, so like the painted
// charm it runs off the top edge and the pendant is drawn large.
const CORD_LOOP = `<g class="nofit">${cord('M14 -8 C16 26 38 34 48 40 C58 34 80 26 82 -8', '#6b3f24', 4)}</g>`;
const PENDANT = {
  disc: (c) => circle(48, 60, 22, c),
  drop: (c) => path('M48 34 C62 50 70 58 70 66 A22 22 0 0 1 26 66 C26 58 34 50 48 34Z', c),
  leaf: (c) => path('M48 36 C72 44 72 76 48 86 C24 76 24 44 48 36Z', c),
  tooth: (c) => path('M34 38 H62 C62 60 54 78 48 88 C42 78 34 60 34 38Z', c),
  shield: (c) => path('M28 40 H68 V60 C68 74 56 82 48 86 C40 82 28 74 28 60Z', c),
  gem: (c) => path('M48 36 L70 52 L60 82 H36 L26 52Z', c),
  square: (c) => rect(28, 40, 40, 40, c, 6),
  star: (c) => path('M48 34 L55 52 L74 54 L60 66 L64 86 L48 76 L32 86 L36 66 L22 54 L41 52Z', c),
};
const charm = (shape, c, mark, markColor, scale = 1.1) => CORD_LOOP + PENDANT[shape](c) + glyph(mark, 48, shape === 'drop' || shape === 'tooth' ? 62 : 61, markColor, scale);
const C = {
  spiral_charm: () => charm('disc', '#c9ccd4', 'spiral', '#3a3f4a'),
  ironbark_charm: () => charm('shield', '#7a5230', 'leaf', '#bfe08a'),
  thorn_charm: () => charm('star', '#3f7a3a', 'thorn', '#f2e6c0', 0.8),
  dusk_charm: () => charm('disc', '#3a2f5c', 'moon', '#e6dcff'),
  whetstone_charm: () => charm('square', '#7f8891', 'bolt', '#ffe48a'),
  heartwood_charm: () => charm('leaf', '#a8532f', 'heart', '#ffd0c0', 0.9),
  leech_charm: () => charm('drop', '#8a1f2a', 'fang', '#f2ead8', 0.9),
  oakshield_charm: () => charm('shield', '#b08040', 'shield', '#4a3320', 0.9),
  quickhand_charm: () => charm('gem', '#e0b040', 'arrows', '#5a3a10'),
  songbird_charm: () => charm('disc', '#5ab0d8', 'note', '#12324a'),
  reaper_charm: () => charm('tooth', '#d8d2c0', 'skull', '#3a2f2a', 0.85),
  warden_charm: () => charm('gem', '#7fc8f0', 'shield', '#17456a', 0.9),
  pilgrim_token: () => charm('square', '#c9a36a', 'cross', '#5c3a1c'),
  samaritan_charm: () => charm('disc', '#f0ead8', 'cross', '#c2313c'),
  tinker_charm: () => charm('disc', '#b0763a', 'gear', '#f2e2c0'),
  beastbane_charm: () => charm('tooth', '#5a6b3a', 'paw', '#f2ead8', 0.85),
  kingsbane_charm: () => charm('gem', '#6b2f7a', 'crown', '#ffd76a'),
  glutton_charm: () => charm('drop', '#d88a3a', 'clover', '#fff1c8', 0.85),
  hourglass_charm: () => charm('square', '#2f5a7a', 'hourglass', '#ffe9b0'),
  phoenix_feather: () => charm('leaf', '#e0582a', 'flame', '#ffe48a', 0.95),
  magpie_charm: () => charm('gem', '#22262e', 'eye', '#8fe0ff'),
  forgetmenot_charm: () => charm('disc', '#6f8fe0', 'clover', '#ffffff'),
  echo_stone: () => charm('drop', '#8f8b80', 'wave', '#ffffff', 0.9),
  fogglass_charm: () => charm('disc', '#b9c8d8', 'wave', '#5a7088'),
  longarm_charm: () => charm('shield', '#4a6fa8', 'up', '#ffffff', 0.9),
  bully_charm: () => charm('square', '#8a2f2a', 'bolt', '#ffffff'),
  laststand_charm: () => charm('star', '#b3202c', 'skull', '#f2ead8', 0.7),
};

// ---- Actives --------------------------------------------------------------------------------
const cork = (x, y, w = 14) => rect(x - w / 2, y, w, 10, '#b98a56', 2);
const flask = (c, mark, markColor) => cork(48, 8) + path('M40 18 H56 V36 L74 74 C76 82 70 88 62 88 H34 C26 88 20 82 22 74 L40 36Z', '#d8e6ea') + flat('M34 50 H62 L72 74 C74 80 70 84 64 84 H32 C26 84 22 80 24 74Z', c) + glyph(mark, 48, 68, markColor, 0.9) + shine('M30 76 L40 50');
const round = (c, mark, markColor) => cork(48, 10) + rect(41, 20, 14, 12, '#d8e6ea', 2) + circle(48, 58, 28, '#d8e6ea') + `<path d="M22 56 A26 26 0 0 0 74 56Z" fill="${fill(c)}"/>` + glyph(mark, 48, 66, markColor, 0.9) + shine('M30 48 A20 20 0 0 1 44 34');
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
  tonic: () => flask('#f2b33a', 'bolt', '#fff7d0'),
  iron_draught: () => round('#7c858e', 'shield', '#f2f6fa'),
  fury_draught: () => flask('#c2313c', 'flame', '#ffd24a'),
  antidote: () => round('#3fae6a', 'cross', '#eafff0'),
  firepot: () => pot('#a3452a', '#5c2a1a', 'flame', '#ffd24a') + line('M48 30 C48 20 40 18 40 10', '#5c3a1c', 3) + glyph('flame', 40, 8, '#ff8a2a', 0.5),
  flash_powder: () => path('M30 36 H66 L74 82 C70 90 26 90 22 82Z', '#e6dcc8') + line('M32 36 C40 28 56 28 64 36', '#8a5a34', 4) + glyph('sun', 48, 62, '#f2b33a', 1.3),
  caltrops: () => [[30, 62, 0], [62, 66, 40], [46, 34, 80]].map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})">${path('M0 -16 L4 -3 L16 6 L3 5 L0 16 L-3 5 L-16 6 L-4 -3Z', '#8f979f')}</g>`).join(''),
  throwing_knife: () => turn(45, path('M48 4 L58 44 H38Z', STEEL) + rect(44, 44, 8, 30, '#2b2b3a', 2) + circle(48, 82, 7, 'none') + `<circle cx="48" cy="82" r="6" fill="none" stroke="${INK}" stroke-width="6"/><circle cx="48" cy="82" r="6" fill="none" stroke="${STEEL}" stroke-width="2.5"/>` + shine('M46 38 L48 12')),
  war_horn: () => path('M12 30 C20 24 30 26 34 34 C46 58 62 70 84 70 V86 C54 88 30 72 18 46 C14 40 10 36 12 30Z', '#e6dcc8') + rect(78, 66, 10, 24, GOLD, 3) + rect(30, 40, 8, 12, GOLD, 2) + cord('M34 46 C40 20 70 22 84 66', '#8a2f2a', 2.5),
  blessed_water: () => round('#7fc8f0', 'drop', '#ffffff') + glyph('sun', 48, 26, GOLD, 0.45),
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

const ALL = { ...W, ...B, ...C, ...A, ...M };

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
  const body = draw();
  // FIT is replaced below once the drawing's real bounds are measured.
  const framed = `<g filter="url(#paint)"><g id="art" transform="FIT">${body}</g></g>`;
  writeFileSync(resolve(out, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 96 96"><title>${id}</title><defs>${SHARED_DEFS}${paintFilter(count + 3)}${defs}</defs>${framed}</svg>\n`);
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
