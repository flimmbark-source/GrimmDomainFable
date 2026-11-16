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

interface SanctuaryVisual {
  group: THREE.Group;
  flame: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
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
      const stone = new THREE.MeshLambertMaterial({ color: 0xb9b4a6 });
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2;
        const x = Math.cos(angle) * CONTEST.sanctuaryRadius;
        const z = Math.sin(angle) * CONTEST.sanctuaryRadius;
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5 + (i % 3) * 0.22, 0.4), stone);
        block.position.set(x, this.heightAt(view.x + x, view.z + z) - group.position.y + 0.25, z);
        block.rotation.y = -angle + (i % 2 ? 0.3 : -0.2);
        block.castShadow = true;
        group.add(block);
      }
      const cairn = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 1.3, 7), stone);
      cairn.position.y = 0.65;
      cairn.castShadow = true;
      const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial());
      flame.position.y = 1.75;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.9, 14, 12, 1, true),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
      );
      beam.position.y = 7;
      const ringGeo = new THREE.RingGeometry(CONTEST.sanctuaryRadius - 0.14, CONTEST.sanctuaryRadius, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false }));
      ring.position.y = 0.09;
      group.add(cairn, flame, beam, ring);
      this.group.add(group);
      visual = { group, flame, beam, ring };
      this.sanctuaries.set(view.id, visual);
    }
    const clean = new THREE.Color(0xf7e3a1);
    const tainted = new THREE.Color(0x9a2fd0);
    const color = clean.lerp(tainted, view.corrupted ? 1 : view.corruption * 0.85);
    visual.ring.material.color.copy(color);
    visual.flame.material.color.copy(color);
    visual.flame.rotation.y = now * 0.001;
    visual.flame.visible = !view.corrupted;
    visual.beam.material.color.copy(color);
    visual.beam.visible = !view.corrupted;
    visual.beam.material.opacity = 0.2 + (view.corruption > 0 ? Math.abs(Math.sin(now / 260)) * 0.14 : 0);
  }

  /** A fallen hero: a pale figure lying where it fell, ringed at rescue range. */
  private createBody(body: BodyView): THREE.Group {
    const group = new THREE.Group();
    group.name = `body:${body.heroId}`;
    group.position.set(body.x, this.heightAt(body.x, body.z), body.z);
    const figure = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 8), new THREE.MeshLambertMaterial({ color: 0xcfd8e6 }));
    figure.rotation.z = Math.PI / 2;
    figure.rotation.y = body.heroId * 1.7;
    figure.position.y = 0.3;
    figure.castShadow = true;
    const ringGeo = new THREE.RingGeometry(CONTEST.rescueRange - 0.1, CONTEST.rescueRange, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.55, depthWrite: false }));
    ring.position.y = 0.08;
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyph('†', '#cfe6ff'), depthTest: false, transparent: true }));
    sign.position.y = 2.2;
    sign.scale.set(1.3, 1.3, 1);
    sign.renderOrder = 20;
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
    sprite.scale.set(1.1, 1.1, 1);
    sprite.position.y = 1.1;
    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf3d27a, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.position.y = 0.07;
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
