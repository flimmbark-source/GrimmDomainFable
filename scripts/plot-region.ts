// Top-down plan of a region, drawn from the same MapDef the simulation uses:
// colliders (red = hides a hero, grey = blocks feet only, blue = water),
// paths, patrol routes, spawns, sites, and the ground a hero can actually
// reach from the first Light spawn (pale green). Unreachable free ground is
// shown in orange: it should only ever be inside something.
//
//   npx tsx scripts/plot-region.ts [mapId] [out.svg]
import { writeFileSync } from 'node:fs';
import { isBlocked } from '../src/shared/sim/geometry.ts';
import { boundsOf, getMap } from '../src/shared/sim/map.ts';
import { TUNING } from '../src/shared/sim/tuning.ts';

const map = getMap(process.argv[2] ?? 'orchard_vale_v1');
const out = process.argv[3] ?? 'region-plan.svg';
const b = boundsOf(map);
const S = 8; // pixels per metre
const W = (b.maxX - b.minX) * S;
const H = (b.maxZ - b.minZ) * S;
const X = (x: number) => ((x - b.minX) * S).toFixed(1);
const Z = (z: number) => ((z - b.minZ) * S).toFixed(1);

// Reachability flood fill on a 0.5 m grid.
const cell = 0.5;
const nx = Math.round((b.maxX - b.minX) / cell);
const nz = Math.round((b.maxZ - b.minZ) / cell);
const free = new Uint8Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) free[j * nx + i] = isBlocked(map, b.minX + (i + 0.5) * cell, b.minZ + (j + 0.5) * cell, TUNING.hero.radius) ? 0 : 1;
const reach = new Uint8Array(nx * nz);
const start = map.spawns[4]!;
const stack = [Math.floor((start.z - b.minZ) / cell) * nx + Math.floor((start.x - b.minX) / cell)];
while (stack.length) {
  const c = stack.pop()!;
  if (reach[c] || !free[c]) continue;
  reach[c] = 1;
  const i = c % nx, j = Math.floor(c / nx);
  if (i > 0) stack.push(c - 1);
  if (i < nx - 1) stack.push(c + 1);
  if (j > 0) stack.push(c - nx);
  if (j < nz - 1) stack.push(c + nx);
}
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#cfd9b5"/>`;
let orphan = 0;
for (let j = 0; j < nz; j++) {
  let run = -1;
  for (let i = 0; i <= nx; i++) {
    const bad = i < nx && free[j * nx + i] === 1 && reach[j * nx + i] === 0;
    if (bad) orphan++;
    if (bad && run < 0) run = i;
    if (!bad && run >= 0) {
      svg += `<rect x="${run * cell * S}" y="${j * cell * S}" width="${(i - run) * cell * S}" height="${cell * S}" fill="#ff8a00"/>`;
      run = -1;
    }
  }
}
for (const p of map.region?.paths ?? []) {
  const color = p.kind === 'road' ? '#b89a6a' : p.kind === 'lane' ? '#c9b083' : p.kind === 'track' ? '#a9a070' : '#8f9a6a';
  svg += `<polyline fill="none" stroke="${color}" stroke-width="${p.width * S}" stroke-linecap="round" stroke-linejoin="round" points="${p.points.map((q) => `${X(q.x)},${Z(q.z)}`).join(' ')}"/>`;
}
for (const prop of map.props) {
  const c = prop.collider;
  const fill = prop.kind === 'water' ? '#5b9bd0' : prop.blocksSight ? '#b0323c' : '#6d6d6d';
  const op = prop.kind === 'water' ? 0.75 : 0.9;
  if (c.shape === 'circle') svg += `<circle cx="${X(prop.x)}" cy="${Z(prop.z)}" r="${c.radius * S}" fill="${fill}" opacity="${op}"/>`;
  else if (c.shape === 'box') svg += `<rect x="${X(prop.x - c.hx)}" y="${Z(prop.z - c.hz)}" width="${c.hx * 2 * S}" height="${c.hz * 2 * S}" fill="${fill}" opacity="${op}"/>`;
  else {
    const deg = (Math.atan2(c.uz, c.ux) * 180) / Math.PI;
    svg += `<rect x="${-c.hx * S}" y="${-c.hz * S}" width="${c.hx * 2 * S}" height="${c.hz * 2 * S}" fill="${fill}" opacity="${op}" transform="translate(${X(prop.x)} ${Z(prop.z)}) rotate(${deg})"/>`;
  }
}
for (const route of map.patrolRoutes) svg += `<polygon fill="none" stroke="#ffe14a" stroke-width="3" points="${route.map((q) => `${X(q.x)},${Z(q.z)}`).join(' ')}"/>`;
map.spawns.forEach((s, i) => (svg += `<circle cx="${X(s.x)}" cy="${Z(s.z)}" r="6" fill="${i < 4 ? '#8e2f4f' : '#3f8fe0'}" stroke="#fff"/>`));
for (const s of map.sites) svg += `<circle cx="${X(s.x)}" cy="${Z(s.z)}" r="${1.8 * S}" fill="none" stroke="#f3d27a" stroke-width="4"/>`;
for (const m of map.monsters) if (m.post) svg += `<rect x="${+X(m.post.x) - 7}" y="${+Z(m.post.z) - 7}" width="14" height="14" fill="#d66bff"/>`;
for (const l of map.region?.locations ?? []) svg += `<text x="${X(l.x)}" y="${Z(l.z)}" font-size="15" font-family="sans-serif" text-anchor="middle" fill="#111" stroke="#fff" stroke-width="0.6">${l.label}</text>`;
for (const c of map.region?.connectors ?? []) svg += `<circle cx="${X(c.x)}" cy="${Z(c.z)}" r="10" fill="#fff" stroke="#000" stroke-width="3"/>`;
svg += '</svg>';
writeFileSync(out, svg);
console.log(`${map.id}: ${map.props.length} props, ${orphan} unreachable free cells -> ${out}`);
