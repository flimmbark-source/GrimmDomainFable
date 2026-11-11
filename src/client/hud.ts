/** Plain-DOM overlay. No UI framework is justified yet (see architecture.md). */
import type { EvidenceKind, Snapshot } from '../shared/protocol.ts';
import type { CameraMode } from './cameras.ts';

const CONTROLS: Record<CameraMode, string> = {
  rts: '<b>Strategy view</b> &middot; Click ground: move hero &middot; WASD / arrows: pan &middot; Wheel: zoom &middot; Space: centre on hero &middot; X: stop',
  hero: '<b>Hero view</b> &middot; WASD / arrows: move &middot; Q / E or drag: turn camera &middot; Wheel: zoom',
};

const EVIDENCE_TEXT: Record<EvidenceKind, string> = {
  sighting: 'Hero SIGHTED',
  lastSeen: 'Lost sight here',
  glimpse: 'Something glimpsed',
  noise: 'Noise heard',
};

const TICKS_PER_SECOND = 30;

export class Hud {
  private readonly status = document.getElementById('status')!;
  private readonly slots = document.getElementById('slots')!;
  private readonly controls = document.getElementById('controls')!;
  private readonly debug = document.getElementById('debug')!;
  private readonly modeButton = document.getElementById('mode') as HTMLButtonElement;
  private readonly attention = document.getElementById('attention')!;
  private readonly attentionFill = document.getElementById('attention-fill')!;
  private readonly attentionLabel = document.getElementById('attention-label')!;
  private readonly vignette = document.getElementById('vignette')!;
  private readonly objective = document.getElementById('objective')!;
  private readonly reports = document.getElementById('reports')!;
  private slotsKey = '';
  private mode: CameraMode = 'rts';
  private controlsKey = '';

  constructor(onToggleMode: () => void) {
    this.modeButton.addEventListener('click', () => {
      onToggleMode();
      this.modeButton.blur();
    });
  }

  setStatus(text: string, kind: 'ok' | 'warn' | 'error' = 'ok'): void {
    this.status.textContent = text;
    this.status.dataset.kind = kind;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.controlsKey = '';
    this.modeButton.textContent = mode === 'rts' ? 'Switch to hero view (Tab)' : 'Switch to strategy view (Tab)';
  }

  setSnapshot(snapshot: Snapshot): void {
    this.setSlots(snapshot);
    this.setControls(snapshot);
    this.setAttention(snapshot);
    this.setObjective(snapshot);
    this.setReports(snapshot);
  }

  private setSlots(snapshot: Snapshot): void {
    const key = snapshot.slots.map((s) => s.occupant[0]).join('') + (snapshot.you?.slot ?? '-');
    if (key === this.slotsKey) return;
    this.slotsKey = key;
    const row = (team: 'dark' | 'light') =>
      snapshot.slots
        .filter((s) => s.team === team)
        .map((s) => {
          const you = snapshot.you?.slot === s.id;
          const label = you ? 'YOU' : s.occupant === 'empty' ? 'open' : s.occupant;
          return `<span class="slot ${s.occupant}${you ? ' you' : ''}" title="slot ${s.id}">${label}</span>`;
        })
        .join('');
    this.slots.innerHTML = `<div class="team dark"><b>Dark</b>${row('dark')}</div><div class="team light"><b>Light</b>${row('light')}</div>`;
  }

  private setControls(snapshot: Snapshot): void {
    const team = snapshot.you?.team ?? 'spectator';
    const owns = snapshot.actors.some((a) => a.kind === 'monster' && a.mode !== undefined);
    const key = `${this.mode}|${team}|${owns}`;
    if (key === this.controlsKey) return;
    this.controlsKey = key;
    let extra = ' &middot; Shift: sneak (slow, silent) &middot; F: whistle';
    if (owns) extra += this.mode === 'rts' ? ' &middot; <b>Right-click: post your Scout</b> &middot; P: Scout resumes patrol' : ' &middot; P: Scout resumes patrol';
    this.controls.innerHTML = `${CONTROLS[this.mode]}${extra} &middot; Tab: switch view &middot; G: debug`;
  }

  /**
   * Local attention indicator (D-014): an eye that opens as a monster's
   * attention on YOU builds, and turns red once you are confirmed. It shows
   * a level only. It never points at anything.
   */
  private setAttention(snapshot: Snapshot): void {
    const you = snapshot.you;
    const level = you?.team === 'light' ? you.attention : 0;
    const spotted = you?.spotted === true;
    const state = spotted ? 'spotted' : level > 0 ? 'noticed' : 'hidden';
    if (this.attention.dataset.state !== state) {
      this.attention.dataset.state = state;
      this.attentionLabel.textContent = spotted ? 'SPOTTED' : level > 0 ? 'Something is noticing you' : '';
      this.vignette.dataset.state = state;
    }
    this.attentionFill.style.transform = `scaleY(${Math.max(0.08, level).toFixed(2)})`;
    this.attention.style.opacity = state === 'hidden' ? '0' : String(0.55 + level * 0.45);
    this.vignette.style.opacity = spotted ? '1' : String(Math.max(0, level - 0.4) * 0.8);
  }

  private setObjective(snapshot: Snapshot): void {
    const you = snapshot.you;
    let html = '';
    if (!you) html = 'Spectating: you see only what both teams can see.';
    else if (you.team === 'light') {
      const full = snapshot.sites.filter((s) => s.available).length;
      const opening = snapshot.sites.find((s) => s.progress !== undefined && s.progress > 0);
      html = `<b>Caches collected: ${you.carried}</b> &middot; ${full} of ${snapshot.sites.length} full`;
      html += opening ? ' &middot; <i>opening&hellip; hold still</i>' : ' &middot; stand still on a cache to open it';
      if (you.whistleCooldown > 0) html += ` &middot; whistle in ${Math.ceil(you.whistleCooldown / TICKS_PER_SECOND)}s`;
    } else {
      const scout = snapshot.actors.find((a) => a.kind === 'monster' && a.mode !== undefined);
      html = scout ? `<b>Your Scout:</b> ${scout.mode}` : 'You own no monster. You still receive confirmed sighting alerts.';
    }
    if (this.objective.innerHTML !== html) this.objective.innerHTML = html;
  }

  /** Dark side: time-stamped reports, newest first. Never live positions. */
  private setReports(snapshot: Snapshot): void {
    if (snapshot.you?.team !== 'dark') {
      this.reports.style.display = 'none';
      return;
    }
    this.reports.style.display = '';
    const rows = [...snapshot.evidence]
      .sort((a, b) => b.tick - a.tick)
      .slice(0, 5)
      .map((e) => {
        const age = Math.max(0, Math.floor((snapshot.tick - e.tick) / TICKS_PER_SECOND));
        return `<div class="report ${e.kind}"><span>${EVIDENCE_TEXT[e.kind]}</span><span>${age}s ago</span></div>`;
      })
      .join('');
    const html = `<b>Reports</b>${rows || '<div class="report none">Nothing reported</div>'}`;
    if (this.reports.innerHTML !== html) this.reports.innerHTML = html;
  }

  setDebug(text: string): void {
    this.debug.textContent = text;
  }
}
