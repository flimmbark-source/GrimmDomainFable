/** Plain-DOM overlay. No UI framework is justified yet (see architecture.md). */
import type { Snapshot } from '../shared/protocol.ts';
import type { CameraMode } from './cameras.ts';

const CONTROLS: Record<CameraMode, string> = {
  rts: '<b>Strategy view</b> &middot; Click ground: move hero &middot; WASD / arrows: pan &middot; Wheel: zoom &middot; Space: centre on hero &middot; X: stop',
  hero: '<b>Hero view</b> &middot; WASD / arrows: move &middot; Q / E or drag: turn camera &middot; Wheel: zoom',
};

export class Hud {
  private readonly status = document.getElementById('status')!;
  private readonly slots = document.getElementById('slots')!;
  private readonly controls = document.getElementById('controls')!;
  private readonly debug = document.getElementById('debug')!;
  private readonly modeButton = document.getElementById('mode') as HTMLButtonElement;
  private slotsKey = '';

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
    this.controls.innerHTML = `${CONTROLS[mode]} &middot; Tab: switch view &middot; G: collision debug`;
    this.modeButton.textContent = mode === 'rts' ? 'Switch to hero view (Tab)' : 'Switch to strategy view (Tab)';
  }

  setSnapshot(snapshot: Snapshot): void {
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

  setDebug(text: string): void {
    this.debug.textContent = text;
  }
}
