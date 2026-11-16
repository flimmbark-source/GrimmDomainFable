/**
 * Ground markers drawn from what THIS client was sent, and nothing else:
 *   - caches (both teams; Dark sees their state only when a Dark eye is on them)
 *   - evidence (Dark only): where and how long ago something was perceived
 *   - development-only sensor overlay, when the server streams debug data
 */
import * as THREE from 'three';
import type { BodyView, DebugMessage, EvidenceKind, EvidenceView, PickupView, SanctuaryView, Snapshot } from '../../shared/protocol.ts';
import { CONTEST } from '../../shared/sim/contest.ts';
import { ITEMS } from '../../shared/sim/items.ts';
import type { AssetLibrary } from './assets.ts';

const EVIDENCE_STYLE: Record<EvidenceKind, { color: number; text: string; css: string }> = {
  sighting: { color: 0xff4b2e, text: '!', css: '#ff4b2e' },
  lastSeen: { color: 0xff8a5c, text: '×', css: '#ff8a5c' },
  glimpse: { color: 0xffd84a, text: '?', css: '#ffd84a' },
  noise: { color: 0xffd84a, text: '♪', css: '#ffd84a' },
};

/** Evidence fades over this many ticks (matches the server's default lifetime). */
const FADE_TICKS = 900;

function glyph(text: string, css: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const g = canvas.getContext('2d')!;
  g.font = 'bold 72px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 9;
  g.strokeStyle = '#1b1420';
  g.strokeText(text, 48, 52);
  g.fillStyle = css;
  g.fillText(text, 48, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface EvidenceVisual {
  group: THREE.Group;
  ring: THREE.Mesh;
  sprite: THREE.Sprite;
}

/** Soft round glow, white in the middle and clear at the edge. */
let glowTexture: THREE.Texture | null = null;
function glow(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const fill = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  fill.addColorStop(0, 'rgba(255,255,255,1)');
  fill.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fill;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

/** Column of light: bright at the foot, fading upward. */
let shaftTexture: THREE.Texture | null = null;
function shaft(): THREE.Texture {
  if (shaftTexture) return shaftTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const fill = g.createLinearGradient(0, 128, 0, 0);
  fill.addColorStop(0, 'rgba(255,255,255,0.9)');
  fill.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fill;
  g.fillRect(0, 0, 4, 128);
  shaftTexture = new THREE.CanvasTexture(canvas);
  return shaftTexture;
}

/** The carved circle on a wayshrine's floor: two rings and a wheel of marks. */
let sigilTexture: THREE.Texture | null = null;
function sigil(): THREE.Texture {
  if (sigilTexture) return sigilTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d')!;
  g.translate(256, 256);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  for (const [r, w] of [[244, 7], [222, 2.5], [120, 3]] as const) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    g.rotate(Math.PI / 12);
    g.beginPath();
    g.moveTo(0, i % 2 ? 196 : 176);
    g.lineTo(0, 214);
    if (i % 4 === 0) {
      g.moveTo(-9, 150);
      g.lineTo(0, 132);
      g.lineTo(9, 150);
    }
    g.stroke();
  }
  sigilTexture = new THREE.CanvasTexture(canvas);
  sigilTexture.anisotropy = 4;
  return sigilTexture;
}

function groundDisc(radius: number, map: THREE.Texture, color: number, opacity: number): THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> {
  const geo = new THREE.CircleGeometry(radius, 40);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
}

interface SanctuaryVisual {
  group: THREE.Group;
  flame: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
  ward: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
}

export class MarkerLayer {
  readonly group = new THREE.Group();
  readonly debug = new THREE.Group();
  private readonly evidence = new Map<number, EvidenceVisual>();
  private readonly glyphs = new Map<EvidenceKind, THREE.Texture>();
  private readonly sites = new Map<number, { chest: THREE.Object3D; ring: THREE.Mesh; progress: THREE.Mesh }>();
  private readonly sanctuaries = new Map<number, SanctuaryVisual>();
  private readonly bodies = new Map<number, THREE.Group>();
  private readonly pickups = new Map<number, { group: THREE.Group; sprite: THREE.Sprite }>();
  private readonly icons = new Map<string, THREE.Texture>();
  private operation: { crystal: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshLambertMaterial>; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> } | null = null;

  constructor(private readonly assets: AssetLibrary, private readonly heightAt: (x: number, z: number) => number = () => 0) {
    this.group.name = 'markers';
    this.debug.name = 'debug-senses';
    this.debug.visible = false;
    this.group.add(this.debug);
  }

  update(snapshot: Snapshot, now: number): void {
    this.updateSites(snapshot, now);
    this.updateEvidence(snapshot, now);
    if (snapshot.operation) this.updateOperation(snapshot.operation, now);
    for (const sanctuary of snapshot.sanctuaries ?? []) this.updateSanctuary(sanctuary, now);
    this.sync(this.bodies, snapshot.bodies ?? [], (b) => b.heroId, (b) => this.createBody(b), (group) => group);
    this.sync(this.pickups, snapshot.pickups ?? [], (p) => p.id, (p) => this.createPickup(p), (visual) => visual.group);
    for (const { sprite } of this.pickups.values()) sprite.position.y = 1.1 + Math.sin(now / 380) * 0.12;
  }

  /** Keep one visual per item the server currently lists; drop the rest. */
  private sync<T, V>(visuals: Map<number, V>, items: readonly T[], idOf: (item: T) => number, create: (item: T) => V, groupOf: (visual: V) => THREE.Object3D): void {
    const listed = new Set<number>();
    for (const item of items) {
      const id = idOf(item);
      listed.add(id);
      if (visuals.has(id)) continue;
      const visual = create(item);
      visuals.set(id, visual);
      this.group.add(groupOf(visual));
    }
    for (const [id, visual] of visuals) {
      if (listed.has(id)) continue;
      this.group.remove(groupOf(visual));
      visuals.delete(id);
    }
  }

  /**
   * A wayshrine: a ring of low stones round a cairn with a column of light.
   * It is drawn here, from contest data, and has no collider (provisional).
   * The light dims and reddens as corruption rises and goes out when it falls.
   */
  private updateSanctuary(view: SanctuaryView, now: number): void {
    let visual = this.sanctuaries.get(view.id);
    if (!visual) {
      const group = new THREE.Group();
      group.name = `sanctuary:${view.id}`;
      group.position.set(view.x, this.heightAt(view.x, view.z), view.z);
      const stone = new THREE.MeshLambertMaterial({ color: 0x8f8b80, flatShading: true });
      const dark = new THREE.MeshLambertMaterial({ color: 0x6f6c66, flatShading: true });
      const moss = new THREE.MeshLambertMaterial({ color: 0x5f7d3c, flatShading: true });
      const solid = (mesh: THREE.Mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };
      // A ring of weathered standing stones, each a little different, one fallen.
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + 0.2;
        const x = Math.cos(angle) * CONTEST.sanctuaryRadius;
        const z = Math.sin(angle) * CONTEST.sanctuaryRadius;
        const ground = this.heightAt(view.x + x, view.z + z) - group.position.y;
        const height = 1.25 + ((i * 7) % 5) * 0.22;
        const menhir = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, height, 5), i % 3 ? stone : dark));
        if (i === 5) {
          menhir.position.set(x, ground + 0.22, z);
          menhir.rotation.set(Math.PI / 2 - 0.12, -angle, 0.2);
        } else {
          menhir.position.set(x, ground + height / 2 - 0.05, z);
          menhir.rotation.set(((i * 5) % 3 - 1) * 0.07, angle * 2.3, ((i * 3) % 3 - 1) * 0.08);
          const cap = solid(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), moss));
          cap.position.set(x, ground + height - 0.02, z);
          cap.scale.set(1.15, 0.5, 1.15);
        }
      }
      // Stepped dais and the shrine itself: a stone post under a little slate roof.
      const lower = solid(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.65, 0.16, 10), dark));
      lower.position.y = 0.08;
      const upper = solid(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.16, 10), stone));
      upper.position.y = 0.24;
      const post = solid(new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.0, 0.46), stone));
      post.position.y = 0.82;
      const sill = solid(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), dark));
      sill.position.y = 1.37;
      for (const [px, pz] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]] as const) {
        const pillar = solid(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), dark));
        pillar.position.set(px, 1.66, pz);
      }
      const roof = solid(new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.5, 4), new THREE.MeshLambertMaterial({ color: 0x4c5560, flatShading: true })));
      roof.position.y = 2.16;
      roof.rotation.y = Math.PI / 4;
      const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshBasicMaterial({ fog: false }));
      flame.position.y = 1.68;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.85, 16, 14, 1, true),
        new THREE.MeshBasicMaterial({ map: shaft(), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
      );
      beam.position.y = 10;
      const ring = groundDisc(CONTEST.sanctuaryRadius + 0.25, sigil(), 0xffffff, 0.75);
      ring.position.y = 0.1;
      const halo = groundDisc(CONTEST.sanctuaryRadius * 1.6, glow(), 0xffffff, 0.22);
      halo.position.y = 0.07;
      const light = new THREE.PointLight(0xffe2a0, 9, 11, 1.6);
      light.position.y = 2;
      // The wards: a faint dome over the precinct that thins as they are worn down.
      const ward = new THREE.Mesh(
        new THREE.SphereGeometry(CONTEST.siegeRadius, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
      );
      group.add(flame, beam, ring, halo, light, ward);
      this.group.add(group);
      visual = { group, flame, beam, ring, halo, light, ward };
      this.sanctuaries.set(view.id, visual);
    }
    const clean = new THREE.Color(0xffe6a3);
    const tainted = new THREE.Color(0xa62be0);
    const color = clean.lerp(tainted, view.corrupted ? 1 : view.corruption * 0.9);
    const pulse = view.corruption > 0 && !view.corrupted ? Math.abs(Math.sin(now / 240)) : 0;
    visual.ring.material.color.copy(color);
    visual.ring.material.opacity = view.corrupted ? 0.35 : 0.7 + pulse * 0.25;
    visual.ring.rotation.y = now * 0.00006;
    visual.halo.material.color.copy(color);
    visual.halo.material.opacity = view.corrupted ? 0.1 : 0.2 + pulse * 0.12;
    visual.flame.material.color.copy(color);
    visual.flame.rotation.y = now * 0.0015;
    visual.flame.position.y = 1.68 + Math.sin(now / 500) * 0.04;
    visual.flame.visible = !view.corrupted;
    visual.beam.material.color.copy(color);
    visual.beam.visible = !view.corrupted;
    visual.beam.material.opacity = 0.14 + pulse * 0.16;
    visual.ward.visible = !view.corrupted && view.ward > 0;
    visual.ward.material.opacity = (0.03 + view.ward * 0.07) * (view.threatened ? 1.3 + Math.sin(now / 130) * 0.5 : 1);
    visual.light.color.copy(color);
    visual.light.intensity = view.corrupted ? 2 : 9 + pulse * 5;
  }

  /** A fallen hero: a pale figure lying where it fell, ringed at rescue range. */
  private createBody(body: BodyView): THREE.Group {
    const group = new THREE.Group();
    group.name = `body:${body.heroId}`;
    group.position.set(body.x, this.heightAt(body.x, body.z), body.z);
    // A cloaked figure lying on its side, in the Light colour drained pale.
    const cloth = new THREE.MeshLambertMaterial({ color: 0x8fa9c9, flatShading: true });
    const figure = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), cloth);
    torso.scale.set(0.8, 0.42, 1.5);
    torso.position.y = 0.2;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshLambertMaterial({ color: 0xa9b89a, flatShading: true }));
    head.position.set(0.05, 0.24, 0.92);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.6, 6), cloth);
    hood.rotation.x = Math.PI / 2 + 0.3;
    hood.position.set(0.05, 0.3, 1.18);
    figure.add(torso, head, hood);
    figure.rotation.y = body.heroId * 1.7;
    figure.traverse((node) => { if (node instanceof THREE.Mesh) node.castShadow = true; });
    const pool = groundDisc(CONTEST.rescueRange, glow(), 0x9fd8ff, 0.4);
    pool.position.y = 0.06;
    const ringGeo = new THREE.RingGeometry(CONTEST.rescueRange - 0.07, CONTEST.rescueRange, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.6, depthWrite: false }));
    ring.position.y = 0.08;
    // A small spirit light over the body marks it from a distance.
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xbfe6ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sign.position.y = 1.5;
    sign.scale.set(1.5, 1.5, 1);
    group.add(pool);
    group.add(figure, ring, sign);
    return group;
  }

  /** A find: the item's own HUD icon floating over a gold ring. */
  private createPickup(pickup: PickupView): { group: THREE.Group; sprite: THREE.Sprite } {
    const group = new THREE.Group();
    group.name = `pickup:${pickup.item}`;
    group.position.set(pickup.x, this.heightAt(pickup.x, pickup.z), pickup.z);
    const name = ITEMS[pickup.item].icon;
    let texture = this.icons.get(name);
    if (!texture) {
      texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/player-hud/${name}.webp`);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.icons.set(name, texture);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(1.15, 1.15, 1);
    sprite.position.y = 1.1;
    const tint = ITEMS[pickup.item].kind === 'gear' ? 0xffd27a : ITEMS[pickup.item].kind === 'active' ? 0x9fe6b0 : 0xd8d2c0;
    const pool = groundDisc(1.1, glow(), tint, 0.55);
    pool.position.y = 0.06;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.3, 3.2, 8, 1, true),
      new THREE.MeshBasicMaterial({ map: shaft(), color: tint, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    );
    beam.position.y = 1.9;
    const ringGeo = new THREE.RingGeometry(0.6, 0.68, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.position.y = 0.07;
    group.add(pool, beam);
    group.add(sprite, ring);
    return { group, sprite };
  }

  private updateOperation(operation: NonNullable<Snapshot['operation']>, now: number): void {
    if (!this.operation) {
      const y = this.heightAt(operation.x, operation.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 0.85, 6), new THREE.MeshLambertMaterial({ color: 0x392d43 }));
      base.position.set(operation.x, y + 0.42, operation.z);
      base.castShadow = true;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshLambertMaterial());
      crystal.position.set(operation.x, y + 1.45, operation.z);
      crystal.scale.y = 1.5;
      crystal.castShadow = true;
      const ringGeo = new THREE.RingGeometry(2.25, 2.38, 40);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.64, depthWrite: false }));
      ring.position.set(operation.x, y + 0.08, operation.z);
      this.group.add(base, crystal, ring);
      this.operation = { crystal, ring };
    }
    const { crystal, ring } = this.operation;
    crystal.rotation.y = operation.active ? now * 0.0006 : 0;
    crystal.material.color.setHex(operation.active ? 0xbf76ed : 0x6f6574);
    crystal.material.emissive.setHex(operation.active ? 0x602b85 : 0x000000);
    ring.material.color.setHex(operation.active ? 0xbe71e9 : 0x98b2be);
  }

  private updateSites(snapshot: Snapshot, now: number): void {
    for (const site of snapshot.sites) {
      let visual = this.sites.get(site.id);
      if (!visual) {
        const chest = this.assets.instantiate('cache');
        const ground = this.heightAt(site.x, site.z);
        chest.position.set(site.x, ground, site.z);
        chest.rotation.y = site.id * 1.3 + 0.4;
        const ringGeo = new THREE.RingGeometry(1.55, 1.8, 40);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf3d27a, transparent: true, opacity: 0.8, depthWrite: false }));
        ring.position.set(site.x, ground + 0.05, site.z);
        const fillGeo = new THREE.CircleGeometry(1.5, 40);
        fillGeo.rotateX(-Math.PI / 2);
        const progress = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xf3d27a, transparent: true, opacity: 0.35, depthWrite: false }));
        progress.position.set(site.x, ground + 0.045, site.z);
        progress.visible = false;
        this.group.add(chest, ring, progress);
        visual = { chest, ring, progress };
        this.sites.set(site.id, visual);
      }
      const material = visual.ring.material as THREE.MeshBasicMaterial;
      // Full: gold and pulsing. Emptied: dim. Unknown (Dark, not in view): grey.
      if (site.available === true) {
        material.color.setHex(0xf3d27a);
        material.opacity = 0.65 + Math.sin(now / 300) * 0.25;
      } else if (site.available === false) {
        material.color.setHex(0x6b5630);
        material.opacity = 0.35;
      } else {
        material.color.setHex(0x8d8399);
        material.opacity = 0.3;
      }
      visual.chest.scale.setScalar(site.available === false ? 0.82 : 1);
      visual.progress.visible = site.progress !== undefined && site.progress > 0;
      if (visual.progress.visible) visual.progress.scale.setScalar(Math.max(0.05, Math.min(1, (site.progress ?? 0) / 90)));
    }
  }

  private updateEvidence(snapshot: Snapshot, now: number): void {
    const alive = new Set<number>();
    for (const item of snapshot.evidence) {
      alive.add(item.id);
      let visual = this.evidence.get(item.id);
      if (!visual) visual = this.createEvidence(item);
      // Evidence can be refined while its source still perceives it.
      visual.group.position.set(item.x, this.heightAt(item.x, item.z), item.z);
      const age = Math.max(0, snapshot.tick - item.tick);
      const fresh = Math.max(0, 1 - age / FADE_TICKS);
      const pulse = age < 60 ? 1 + (1 - age / 60) * Math.abs(Math.sin(now / 90)) * 0.6 : 1;
      (visual.ring.material as THREE.MeshBasicMaterial).opacity = 0.2 + fresh * 0.7;
      visual.ring.scale.setScalar(pulse);
      visual.sprite.material.opacity = 0.3 + fresh * 0.7;
    }
    for (const [id, visual] of this.evidence) {
      if (alive.has(id)) continue;
      this.group.remove(visual.group);
      this.evidence.delete(id);
    }
  }

  private createEvidence(item: EvidenceView): EvidenceVisual {
    const style = EVIDENCE_STYLE[item.kind];
    const group = new THREE.Group();
    group.name = `evidence:${item.kind}`;
    // Confirmed sightings are a solid diamond; everything unconfirmed is a
    // thin circle, so certainty reads at a glance.
    const confirmed = item.kind === 'sighting';
    const geo = confirmed ? new THREE.RingGeometry(0.9, 1.3, 4) : new THREE.RingGeometry(1.1, 1.22, 32);
    geo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: style.color, transparent: true, depthWrite: false, depthTest: false }));
    ring.position.y = 0.09;
    ring.renderOrder = 15;
    let texture = this.glyphs.get(item.kind);
    if (!texture) {
      texture = glyph(style.text, style.css);
      this.glyphs.set(item.kind, texture);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.position.y = confirmed ? 2.6 : 2.0;
    sprite.scale.setScalar(confirmed ? 2.0 : 1.5);
    sprite.renderOrder = 16;
    group.add(ring, sprite);
    this.group.add(group);
    const visual = { group, ring, sprite };
    this.evidence.set(item.id, visual);
    return visual;
  }

  /** Development only: draw what the server says each monster senses. */
  setDebug(message: DebugMessage): void {
    this.debug.clear();
    for (const m of message.monsters) {
      const half = Math.acos(m.viewHalfArcCos);
      const facing = Math.atan2(m.dirX, m.dirZ);
      const gy = this.heightAt(m.x, m.z);
      const points = [new THREE.Vector3(m.x, gy + 0.12, m.z)];
      for (let i = 0; i <= 16; i++) {
        const a = facing - half + (i / 16) * half * 2;
        points.push(new THREE.Vector3(m.x + Math.sin(a) * m.viewRange, gy + 0.12, m.z + Math.cos(a) * m.viewRange));
      }
      const hot = m.targets.some((t) => t.visible);
      const cone = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: hot ? 0xff4b2e : 0x4ad8ff, depthTest: false }));
      cone.renderOrder = 12;
      this.debug.add(cone);
      const dots = [...m.searchPoints, ...(m.lastSeen ? [m.lastSeen] : [])];
      for (const p of dots) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: p === m.lastSeen ? 0xff4b2e : 0xff9d3c, depthTest: false }));
        dot.position.set(p.x, this.heightAt(p.x, p.z) + 0.3, p.z);
        this.debug.add(dot);
      }
      if (m.path.length) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(m.x, gy + 0.15, m.z), ...m.path.map((p) => new THREE.Vector3(p.x, this.heightAt(p.x, p.z) + 0.15, p.z))]), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
        line.renderOrder = 12;
        this.debug.add(line);
      }
    }
  }
}
