/**
 * Ground markers drawn from what THIS client was sent, and nothing else:
 *   - caches (both teams; Dark sees their state only when a Dark eye is on them)
 *   - evidence (Dark only): where and how long ago something was perceived
 *   - development-only sensor overlay, when the server streams debug data
 */
import * as THREE from 'three';
import type { DebugMessage, EvidenceKind, EvidenceView, Snapshot } from '../../shared/protocol.ts';
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

export class MarkerLayer {
  readonly group = new THREE.Group();
  readonly debug = new THREE.Group();
  private readonly evidence = new Map<number, EvidenceVisual>();
  private readonly glyphs = new Map<EvidenceKind, THREE.Texture>();
  private readonly sites = new Map<number, { chest: THREE.Object3D; ring: THREE.Mesh; progress: THREE.Mesh }>();

  constructor(private readonly assets: AssetLibrary) {
    this.group.name = 'markers';
    this.debug.name = 'debug-senses';
    this.debug.visible = false;
    this.group.add(this.debug);
  }

  update(snapshot: Snapshot, now: number): void {
    this.updateSites(snapshot, now);
    this.updateEvidence(snapshot, now);
  }

  private updateSites(snapshot: Snapshot, now: number): void {
    for (const site of snapshot.sites) {
      let visual = this.sites.get(site.id);
      if (!visual) {
        const chest = this.assets.instantiate('cache');
        chest.position.set(site.x, 0, site.z);
        chest.rotation.y = site.id * 1.3 + 0.4;
        const ringGeo = new THREE.RingGeometry(1.55, 1.8, 40);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf3d27a, transparent: true, opacity: 0.8, depthWrite: false }));
        ring.position.set(site.x, 0.05, site.z);
        const fillGeo = new THREE.CircleGeometry(1.5, 40);
        fillGeo.rotateX(-Math.PI / 2);
        const progress = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xf3d27a, transparent: true, opacity: 0.35, depthWrite: false }));
        progress.position.set(site.x, 0.045, site.z);
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
      visual.group.position.set(item.x, 0, item.z);
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
      const points = [new THREE.Vector3(m.x, 0.12, m.z)];
      for (let i = 0; i <= 16; i++) {
        const a = facing - half + (i / 16) * half * 2;
        points.push(new THREE.Vector3(m.x + Math.sin(a) * m.viewRange, 0.12, m.z + Math.cos(a) * m.viewRange));
      }
      const hot = m.targets.some((t) => t.visible);
      const cone = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: hot ? 0xff4b2e : 0x4ad8ff, depthTest: false }));
      cone.renderOrder = 12;
      this.debug.add(cone);
      const dots = [...m.searchPoints, ...(m.lastSeen ? [m.lastSeen] : [])];
      for (const p of dots) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: p === m.lastSeen ? 0xff4b2e : 0xff9d3c, depthTest: false }));
        dot.position.set(p.x, 0.3, p.z);
        this.debug.add(dot);
      }
      if (m.path.length) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(m.x, 0.15, m.z), ...m.path.map((p) => new THREE.Vector3(p.x, 0.15, p.z))]), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
        line.renderOrder = 12;
        this.debug.add(line);
      }
    }
  }
}
