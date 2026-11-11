// Generates public/models/standing_stone.glb: an original low-poly placeholder
// mesh written as a real binary glTF 2.0 file. It exists to exercise the same
// GLB import path that authored models will use; it is not final art.
//
//   npm run assets:placeholder
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/models/standing_stone.glb');

// Rings of an irregular, leaning six-sided menhir: [height, radius, offsetX, offsetZ]
const rings = [
  [0.0, 0.72, 0.0, 0.0],
  [0.9, 0.66, 0.05, 0.02],
  [1.9, 0.5, 0.14, 0.05],
  [2.6, 0.24, 0.22, 0.08],
];
const SIDES = 6;
const wobble = [1.0, 0.82, 1.08, 0.9, 1.12, 0.86]; // fixed, so output is reproducible

const ringPoints = rings.map(([y, r, ox, oz], ri) =>
  Array.from({ length: SIDES }, (_, i) => {
    const a = (i / SIDES) * Math.PI * 2 + ri * 0.18;
    const rr = r * wobble[(i + ri) % SIDES];
    return [ox + Math.cos(a) * rr, y, oz + Math.sin(a) * rr];
  }),
);

const positions = [];
const normals = [];
function tri(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  n = n.map((x) => x / len);
  for (const p of [a, b, c]) {
    positions.push(...p);
    normals.push(...n);
  }
}
for (let r = 0; r < ringPoints.length - 1; r++) {
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES;
    const a = ringPoints[r][i], b = ringPoints[r][j], c = ringPoints[r + 1][j], d = ringPoints[r + 1][i];
    tri(a, c, b);
    tri(a, d, c);
  }
}
const top = ringPoints[ringPoints.length - 1];
const apex = [rings.at(-1)[2], rings.at(-1)[0] + 0.12, rings.at(-1)[3]];
for (let i = 0; i < SIDES; i++) tri(top[i], apex, top[(i + 1) % SIDES]);

const vertexCount = positions.length / 3;
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i++) {
  min[i % 3] = Math.min(min[i % 3], positions[i]);
  max[i % 3] = Math.max(max[i % 3], positions[i]);
}

const bin = Buffer.concat([Buffer.from(new Float32Array(positions).buffer), Buffer.from(new Float32Array(normals).buffer)]);
const half = bin.length / 2;

const gltf = {
  asset: { version: '2.0', generator: 'grimm-dominion make-placeholder-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'standing_stone' }],
  meshes: [{ name: 'standing_stone', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
  materials: [
    {
      name: 'stone_mossy',
      pbrMetallicRoughness: { baseColorFactor: [0.42, 0.45, 0.5, 1], metallicFactor: 0, roughnessFactor: 1 },
    },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: vertexCount, type: 'VEC3' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: half, target: 34962 },
    { buffer: 0, byteOffset: half, byteLength: half, target: 34962 },
  ],
  buffers: [{ byteLength: bin.length }],
};

let json = Buffer.from(JSON.stringify(gltf), 'utf8');
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // 'glTF'
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(json.length, 0);
jsonHead.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(bin.length, 0);
binHead.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, jsonHead, json, binHead, bin]));
console.log(`wrote ${out} (${vertexCount} vertices, ${12 + 16 + json.length + bin.length} bytes)`);
