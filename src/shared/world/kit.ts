/**
 * Region authoring kit: small, reusable builders that turn level-design
 * intent ("a hedge from here to there", "three rows of apple trees", "a
 * river with a bridge and a ford") into the plain MapDef data the simulation
 * and the renderer share.
 *
 * Nothing in this file knows about Orchard Vale. A future kingdom generator
 * can drive the same builders with generated coordinates.
 *
 * Determinism: collider geometry uses + - * / and sqrt only. Trigonometry is
 * used solely for `yaw`, which is a render-only field.
 */
import type { Bounds, Collider, PropDef, PropKind, Point } from '../sim/map.ts';
import type { DressingDef, DressingKind, OrchardPlot, RegionPath } from '../sim/region.ts';
import {
  polylineNearest,
  terraceRun,
  terraceStrength,
  type ChannelFeature,
  type DeckFeature,
  type TerraceFeature,
} from '../sim/terrain.ts';

/** Half extents of each building kind: x = along the front, z = front to back. */
export const FOOTPRINTS = {
  cottage_a: { hx: 3.6, hz: 2.9 },
  cottage_b: { hx: 3.1, hz: 2.6 },
  cottage_c: { hx: 4.2, hz: 2.7 },
  longhouse: { hx: 6.0, hz: 3.2 },
  press_house: { hx: 5.6, hz: 3.6 },
  storehouse: { hx: 4.4, hz: 3.4 },
  cart_shed: { hx: 3.6, hz: 2.2 },
  mill: { hx: 4.4, hz: 3.6 },
  barn: { hx: 5.2, hz: 3.6 },
} as const satisfies Partial<Record<PropKind, { hx: number; hz: number }>>;

export type BuildingKind = keyof typeof FOOTPRINTS;

/** Trunk radius at scale 1, and whether the trunk is thick enough to hide behind. */
export const TREES = {
  tree_apple: { radius: 0.38, cover: true },
  tree_apple_old: { radius: 0.52, cover: true },
  tree_apple_young: { radius: 0.18, cover: false },
  tree_apple_feral: { radius: 0.45, cover: true },
  tree_witness: { radius: 1.7, cover: true },
  tree_oldwood: { radius: 0.85, cover: true },
  tree_birch: { radius: 0.28, cover: false },
  tree_willow: { radius: 0.7, cover: true },
  tree_oak: { radius: 0.75, cover: true },
  tree_pine: { radius: 0.55, cover: true },
  tree_dead: { radius: 0.45, cover: true },
  coppice_stool: { radius: 0.95, cover: true },
  sapling: { radius: 0.15, cover: false },
} as const satisfies Partial<Record<PropKind, { radius: number; cover: boolean }>>;

export type TreeKind = keyof typeof TREES;

/** Free-standing round objects: footprint radius, and whether they are tall enough to hide behind. */
export const ROUND_PROPS = {
  well: { radius: 1.15, cover: false },
  barrel_stack: { radius: 1.0, cover: false },
  crate_stack: { radius: 0.9, cover: false },
  haystack: { radius: 1.7, cover: true },
  cider_press: { radius: 1.25, cover: false },
  signpost: { radius: 0.22, cover: false },
  boundary_stone: { radius: 0.45, cover: false },
  boundary_stone_fallen: { radius: 0.7, cover: false },
  ruin_chimney: { radius: 1.0, cover: true },
  rock: { radius: 0.9, cover: false },
  boulder: { radius: 1.5, cover: true },
} as const satisfies Partial<Record<PropKind, { radius: number; cover: boolean }>>;

/** Free-standing box objects (half extents at scale 1). */
export const BOX_PROPS = {
  cart: { hx: 1.9, hz: 0.95, cover: false },
  log_pile: { hx: 2.0, hz: 0.8, cover: false },
  trough: { hx: 1.3, hz: 0.45, cover: false },
  beehives: { hx: 1.7, hz: 0.5, cover: false },
} as const satisfies Partial<Record<PropKind, { hx: number; hz: number; cover: boolean }>>;

/** Linear barriers: half thickness, and whether they are taller than a hero. */
export const BARRIERS = {
  hedge: { half: 0.7, cover: true },
  stone_wall: { half: 0.32, cover: false },
  terrace_wall: { half: 0.45, cover: false },
  fence: { half: 0.14, cover: false },
  bridge_parapet: { half: 0.15, cover: false },
  ruin_wall: { half: 0.42, cover: true },
  ruin_fragment: { half: 0.42, cover: false },
} as const satisfies Partial<Record<PropKind, { half: number; cover: boolean }>>;

export type BarrierKind = keyof typeof BARRIERS;

/** Yaw that turns a model's local +x axis onto the ground direction (ux, uz). Render only. */
export function yawOfAxis(ux: number, uz: number): number {
  return Math.atan2(-uz, ux);
}

/** Yaw that turns a model's front (+z) to face the ground direction (fx, fz). Render only. */
export function yawFacing(fx: number, fz: number): number {
  return Math.atan2(fx, fz);
}

function unit(dx: number, dz: number): { x: number; z: number; len: number } {
  const len = Math.sqrt(dx * dx + dz * dz);
  return { x: dx / len, z: dz / len, len };
}

function distPointSegment(px: number, pz: number, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((px - a.x) * abx + (pz - a.z) * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + abx * t - px;
  const dz = a.z + abz * t - pz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Smallest distance from a point to a collider's edge (negative inside). */
function distToCollider(prop: PropDef, x: number, z: number): number {
  const c = prop.collider;
  let lx = x - prop.x;
  let lz = z - prop.z;
  if (c.shape === 'circle') return Math.sqrt(lx * lx + lz * lz) - c.radius;
  if (c.shape === 'obox') {
    const rx = lx * c.ux + lz * c.uz;
    lz = lz * c.ux - lx * c.uz;
    lx = rx;
  }
  const ox = (lx < 0 ? -lx : lx) - c.hx;
  const oz = (lz < 0 ? -lz : lz) - c.hz;
  if (ox <= 0 && oz <= 0) return ox > oz ? ox : oz;
  const qx = ox > 0 ? ox : 0;
  const qz = oz > 0 ? oz : 0;
  return Math.sqrt(qx * qx + qz * qz);
}

export interface RiverSpec {
  channel: ChannelFeature;
  /** Blocked half width: the water plus the bank too steep to stand on. */
  blockRadius: number;
  /** Openings in the blockers, as [from, to] distances along the polyline. */
  openings: { from: number; to: number }[];
}

/**
 * Collects props, paths and dressing for one region. Every placement helper
 * returns the builder so that a layout reads as a list of sentences.
 */
export class RegionBuilder {
  readonly props: PropDef[] = [];
  readonly paths: RegionPath[] = [];
  readonly dressing: DressingDef[] = [];
  readonly plots: OrchardPlot[] = [];
  private rng: number;
  private rivers: RiverSpec[] = [];
  /** Extra keep-clear discs (spawns, sites, yards). */
  private reserved: { x: number; z: number; r: number }[] = [];

  constructor(readonly bounds: Bounds, seed: number) {
    this.rng = (seed ^ 0x9e3779b9) >>> 0 || 1;
  }

  /** Deterministic value in [0, 1). Integer arithmetic only. */
  random(): number {
    let x = this.rng;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.rng = x;
    return x / 4294967296;
  }

  /**
   * Run `fn` with its own random stream, seeded from `key` (for example a row's
   * end points), then resume the shared stream where it was. A planted row then
   * looks the same however many unrelated props were added before it.
   */
  private stream(key: number[], fn: () => void): void {
    const saved = this.rng;
    let h = 0x811c9dc5;
    for (const v of key) h = Math.imul(h ^ (Math.round(v * 100) | 0), 16777619) >>> 0;
    this.rng = h || 1;
    try {
      fn();
    } finally {
      this.rng = saved;
    }
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.random();
  }

  reserve(x: number, z: number, r: number): this {
    this.reserved.push({ x, z, r });
    return this;
  }

  path(kind: RegionPath['kind'], width: number, points: [number, number][]): this {
    this.paths.push({ kind, width, points: points.map(([x, z]) => ({ x, z })) });
    return this;
  }

  /**
   * Is a disc of radius r at (x, z) clear of every collider (plus `gap`),
   * every path (plus `pathGap`), rivers, reserved spots and the map edge?
   */
  isClear(x: number, z: number, r: number, gap = 0.4, pathGap = 0.6): boolean {
    const b = this.bounds;
    if (x < b.minX + r + 0.5 || x > b.maxX - r - 0.5 || z < b.minZ + r + 0.5 || z > b.maxZ - r - 0.5) return false;
    for (const p of this.props) if (distToCollider(p, x, z) < r + gap) return false;
    for (const path of this.paths) {
      const need = path.width / 2 + r + pathGap;
      for (let i = 0; i < path.points.length - 1; i++) {
        if (distPointSegment(x, z, path.points[i]!, path.points[i + 1]!) < need) return false;
      }
    }
    for (const river of this.rivers) {
      if (polylineNearest(river.channel.points, x, z).dist < river.blockRadius + r + 0.3) return false;
    }
    for (const s of this.reserved) {
      const dx = x - s.x;
      const dz = z - s.z;
      if (Math.sqrt(dx * dx + dz * dz) < s.r + r) return false;
    }
    return true;
  }

  private add(kind: PropKind, x: number, z: number, yaw: number, scale: number, collider: Collider, blocksSight: boolean, variant?: number): PropDef {
    const prop: PropDef = { kind, x, z, yaw, scale, collider, blocksSight };
    if (variant !== undefined) prop.variant = variant;
    this.props.push(prop);
    return prop;
  }

  tree(kind: TreeKind, x: number, z: number, scale = 1, variant?: number): this {
    const spec = TREES[kind];
    this.add(kind, x, z, this.random() * 6.2832, scale, { shape: 'circle', radius: spec.radius * scale }, spec.cover, variant ?? Math.floor(this.random() * 4));
    return this;
  }

  /** A tree only if the spot is clear. Returns whether it was planted. */
  tryTree(kind: TreeKind, x: number, z: number, scale = 1, gap = 0.6, pathGap = 0.8): boolean {
    if (!this.isClear(x, z, TREES[kind].radius * scale, gap, pathGap)) return false;
    this.tree(kind, x, z, scale);
    return true;
  }

  round(kind: keyof typeof ROUND_PROPS, x: number, z: number, scale = 1, yaw?: number): this {
    const spec = ROUND_PROPS[kind];
    this.add(kind, x, z, yaw ?? this.random() * 6.2832, scale, { shape: 'circle', radius: spec.radius * scale }, spec.cover, Math.floor(this.random() * 4));
    return this;
  }

  /** A box object whose long side points along (dx, dz). */
  boxProp(kind: keyof typeof BOX_PROPS, x: number, z: number, dx: number, dz: number, scale = 1): this {
    const spec = BOX_PROPS[kind];
    const u = unit(dx, dz);
    this.add(kind, x, z, yawOfAxis(u.x, u.z), scale, { shape: 'obox', hx: spec.hx * scale, hz: spec.hz * scale, ux: u.x, uz: u.z }, spec.cover, Math.floor(this.random() * 4));
    return this;
  }

  /** A building whose front door faces the ground direction (fx, fz). */
  building(kind: BuildingKind, x: number, z: number, fx: number, fz: number, variant = 0): this {
    const f = unit(fx, fz);
    const spec = FOOTPRINTS[kind];
    // Local +x of a model that faces +z is (fz, -fx).
    this.add(kind, x, z, yawFacing(f.x, f.z), 1, { shape: 'obox', hx: spec.hx, hz: spec.hz, ux: f.z, uz: -f.x }, true, variant);
    return this;
  }

  /**
   * A linear barrier through the given points. `gaps` are [from, to] distances
   * along the line that are left open (gates, lane mouths).
   */
  barrier(kind: BarrierKind, points: [number, number][], gaps: [number, number][] = [], cover?: boolean): this {
    const spec = BARRIERS[kind];
    let run = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i]!;
      const [bx, bz] = points[i + 1]!;
      const u = unit(bx - ax, bz - az);
      // Cut this stretch at the gaps.
      let cuts: [number, number][] = [[0, u.len]];
      for (const [g0, g1] of gaps) {
        const lo = g0 - run;
        const hi = g1 - run;
        cuts = cuts.flatMap(([s, e]): [number, number][] => {
          if (hi <= s || lo >= e) return [[s, e]];
          const out: [number, number][] = [];
          if (lo > s) out.push([s, lo]);
          if (hi < e) out.push([hi, e]);
          return out;
        });
      }
      for (const [s, e] of cuts) {
        if (e - s < 0.6) continue;
        const mid = (s + e) / 2;
        this.add(
          kind, ax + u.x * mid, az + u.z * mid, yawOfAxis(u.x, u.z), 1,
          { shape: 'obox', hx: (e - s) / 2, hz: spec.half, ux: u.x, uz: u.z },
          cover ?? spec.cover, Math.floor(this.random() * 4),
        );
      }
      run += u.len;
    }
    return this;
  }

  /** Axis-aligned bramble clump (the M1 thicket). */
  thicket(x: number, z: number, hx: number, hz: number): this {
    this.add('thicket', x, z, 0, 1, { shape: 'box', hx, hz }, true);
    return this;
  }

  dress(kind: DressingKind, x: number, z: number, yaw = 0, scale = 1): this {
    this.dressing.push({ kind, x, z, yaw, scale });
    return this;
  }

  /**
   * Water blockers for a river: the water and its steep banks cannot be
   * walked, except through the openings (a bridge deck, a ford). The visible
   * river is drawn from the same channel feature.
   */
  river(spec: RiverSpec): this {
    this.rivers.push(spec);
    const pts = spec.channel.points;
    const R = spec.blockRadius;
    const b = this.bounds;
    const pad = R + 2;
    const inside = (x: number, z: number) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;
    let run = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const c = pts[i + 1]!;
      const u = unit(c.x - a.x, c.z - a.z);
      let cuts: [number, number][] = [[0, u.len]];
      for (const o of spec.openings) {
        const lo = o.from - run;
        const hi = o.to - run;
        cuts = cuts.flatMap(([s, e]): [number, number][] => {
          if (hi <= s || lo >= e) return [[s, e]];
          const out: [number, number][] = [];
          if (lo > s) out.push([s, lo]);
          if (hi < e) out.push([hi, e]);
          return out;
        });
      }
      for (const [s, e] of cuts) {
        const mid = (s + e) / 2;
        const x = a.x + u.x * mid;
        const z = a.z + u.z * mid;
        if (!inside(x, z) && !inside(a.x + u.x * s, a.z + u.z * s) && !inside(a.x + u.x * e, a.z + u.z * e)) continue;
        this.add('water', x, z, 0, 1, { shape: 'obox', hx: (e - s) / 2, hz: R, ux: u.x, uz: u.z }, false);
      }
      // Round the outside of each bend.
      if (i > 0 && inside(a.x, a.z) && !spec.openings.some((o) => run > o.from - R + 0.5 && run < o.to + R - 0.5)) {
        this.add('water', a.x, a.z, 0, 1, { shape: 'circle', radius: R }, false);
      }
      run += u.len;
    }
    return this;
  }

  /**
   * Retaining walls for a terrace: a wall wherever the step is too steep to
   * walk, none where a ramp spreads it out. Derived from the same feature the
   * height function uses, so wall and slope cannot disagree.
   */
  terraceWalls(f: TerraceFeature, maxGrade: number): this {
    const u = unit(f.b.x - f.a.x, f.b.z - f.a.z);
    const step = 0.25;
    let start: number | null = null;
    const flush = (end: number) => {
      if (start === null) return;
      if (end - start > 0.8) {
        const mid = (start + end) / 2;
        this.add(
          'terrace_wall', f.a.x + u.x * mid, f.a.z + u.z * mid, yawOfAxis(u.x, u.z), 1,
          { shape: 'obox', hx: (end - start) / 2, hz: BARRIERS.terrace_wall.half, ux: u.x, uz: u.z },
          false, Math.floor(this.random() * 4),
        );
      }
      start = null;
    };
    for (let s = 0; s <= u.len + 1e-9; s += step) {
      // Steepest slope of a smoothstep of half width w and height h is 1.5 h / (2 w).
      const grade = (1.5 * f.rise * terraceStrength(f, s, u.len)) / (2 * terraceRun(f, s));
      if (grade > maxGrade) {
        if (start === null) start = s;
      } else flush(s);
    }
    flush(u.len);
    // Cheek walls: each ramp is a cutting, retained on both sides for the
    // whole length of its slope.
    for (const ramp of f.ramps) {
      for (const side of [-1, 1]) {
        const s = ramp.at + side * (ramp.halfWidth + 0.25);
        this.add(
          'terrace_wall', f.a.x + u.x * s, f.a.z + u.z * s, yawOfAxis(u.z, -u.x), 1,
          { shape: 'obox', hx: f.rampRun, hz: BARRIERS.terrace_wall.half, ux: u.z, uz: -u.x },
          false, 4,
        );
      }
    }
    return this;
  }

  /** Low walls along both edges of a bridge deck. */
  parapets(deck: DeckFeature, length: number): this {
    for (const side of [-1, 1]) {
      const off = (deck.hz + BARRIERS.bridge_parapet.half) * side;
      // Across-deck direction is (-uz, ux).
      this.add(
        'bridge_parapet', deck.x - deck.uz * off, deck.z + deck.ux * off, yawOfAxis(deck.ux, deck.uz), 1,
        { shape: 'obox', hx: length / 2, hz: BARRIERS.bridge_parapet.half, ux: deck.ux, uz: deck.uz },
        false,
      );
    }
    return this;
  }

  /**
   * One planted row of fruit trees from (ax, az) to (bx, bz). Most trees are
   * mature; a few are old survivors, a few are young replants and a few
   * places are empty, the way a worked orchard looks. Harvest clutter
   * (ladders, baskets, windfalls) is added as dressing.
   */
  orchardRow(ax: number, az: number, bx: number, bz: number, spacing: number, opts: { feral?: boolean; clutter?: number } = {}): this {
    this.stream([ax, az, bx, bz, spacing], () => this.plantRow(ax, az, bx, bz, spacing, opts));
    return this;
  }

  private plantRow(ax: number, az: number, bx: number, bz: number, spacing: number, opts: { feral?: boolean; clutter?: number }): void {
    const u = unit(bx - ax, bz - az);
    const n = Math.floor(u.len / spacing);
    const clutter = opts.clutter ?? 0.16;
    for (let i = 0; i <= n; i++) {
      const roll = this.random();
      const jitterAlong = (this.random() - 0.5) * 0.7;
      const jitterAcross = (this.random() - 0.5) * 0.5;
      const scale = 0.86 + this.random() * 0.3;
      const x = ax + u.x * (i * spacing + jitterAlong) - u.z * jitterAcross;
      const z = az + u.z * (i * spacing + jitterAlong) + u.x * jitterAcross;
      let kind: TreeKind;
      if (opts.feral) {
        if (roll < 0.3) continue;
        kind = roll < 0.75 ? 'tree_apple_feral' : 'tree_dead';
      } else {
        if (roll < 0.05) continue; // a gap where a tree was lost
        kind = roll < 0.14 ? 'tree_apple_young' : roll < 0.28 ? 'tree_apple_old' : 'tree_apple';
      }
      if (!this.tryTree(kind, x, z, scale, 1.0, 1.0)) continue;
      if (opts.feral || kind === 'tree_apple_young') continue;
      const c = this.random();
      if (c < clutter * 0.35) {
        // Ladder leaning into the crown, feet on the row side.
        const side = this.random() < 0.5 ? 1 : -1;
        this.dress('ladder', x - u.z * 0.95 * side, z + u.x * 0.95 * side, yawFacing(u.z * side, -u.x * side), 1);
        this.dress('basket', x - u.z * 1.5 * side + u.x * 0.5, z + u.x * 1.5 * side + u.z * 0.5, this.random() * 6.28, 1);
      } else if (c < clutter * 0.7) {
        this.dress('basket', x + (this.random() - 0.5) * 2.4, z + (this.random() - 0.5) * 2.4, this.random() * 6.28, 0.9 + this.random() * 0.3);
      } else if (c < clutter) {
        this.dress('apple_pile', x + (this.random() - 0.5) * 2.6, z + (this.random() - 0.5) * 2.6, this.random() * 6.28, 0.8 + this.random() * 0.5);
      }
    }
  }

  /**
   * Scatter trees over an area by jittered grid. `accept` says whether a
   * point belongs to the area; `pick` chooses what to plant there.
   */
  scatter(
    area: Bounds,
    spacing: number,
    accept: (x: number, z: number) => boolean,
    pick: (x: number, z: number, roll: number) => { kind: TreeKind; scale: number } | null,
    gap = 0.8,
    pathGap = 1.0,
  ): this {
    this.stream([area.minX, area.maxX, area.minZ, area.maxZ, spacing], () => this.scatterIn(area, spacing, accept, pick, gap, pathGap));
    return this;
  }

  private scatterIn(
    area: Bounds,
    spacing: number,
    accept: (x: number, z: number) => boolean,
    pick: (x: number, z: number, roll: number) => { kind: TreeKind; scale: number } | null,
    gap: number,
    pathGap: number,
  ): void {
    for (let gz = area.minZ; gz <= area.maxZ; gz += spacing) {
      for (let gx = area.minX; gx <= area.maxX; gx += spacing) {
        const x = gx + (this.random() - 0.5) * spacing * 0.8;
        const z = gz + (this.random() - 0.5) * spacing * 0.8;
        const roll = this.random();
        if (!accept(x, z)) continue;
        const choice = pick(x, z, roll);
        if (choice) this.tryTree(choice.kind, x, z, choice.scale, gap, pathGap);
      }
    }
  }
}

/** Distance along a polyline of the point nearest to (x, z). */
export function alongPolyline(points: readonly Point[], x: number, z: number): number {
  return polylineNearest(points, x, z).along;
}
