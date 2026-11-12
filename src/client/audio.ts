/**
 * Synthesised audio cues (Web Audio, no asset files yet). Detection must be
 * readable by ear as well as by eye (D-014):
 *   growl   - a monster has noticed something and is turning to look
 *   howl    - a monster has confirmed a sighting
 *   pulse   - the local hero's own attention level (faster = closer to confirmed)
 *   sting   - the local hero has just been confirmed
 *   bell    - Dark side: a new sighting alert arrived
 * Sounds carry loudness only. Nothing here knows where an unseen monster is.
 */
import type { SoundView } from '../shared/protocol.ts';

export class AudioCues {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nextPulse = 0;
  /** Count of cues played, by kind (for the browser check). */
  readonly played: Record<string, number> = {};

  constructor() {
    // Browsers only allow audio after a user gesture.
    const unlock = () => {
      if (!this.ctx) {
        try {
          this.ctx = new AudioContext();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.5;
          this.master.connect(this.ctx.destination);
        } catch {
          this.ctx = null;
        }
      }
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private count(kind: string): void {
    this.played[kind] = (this.played[kind] ?? 0) + 1;
  }

  private tone(type: OscillatorType, from: number, to: number, seconds: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + seconds);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + Math.min(0.04, seconds / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.05);
  }

  /** World sounds the server says this hero can hear this tick. */
  play(sound: SoundView): void {
    this.count(sound.kind);
    const v = sound.volume;
    switch (sound.kind) {
      case 'growl':
        this.tone('sawtooth', 95, 60, 0.55, 0.35 * v);
        this.tone('sawtooth', 142, 70, 0.5, 0.18 * v, 0.03);
        break;
      case 'howl':
        this.tone('triangle', 300, 720, 0.45, 0.4 * v);
        this.tone('triangle', 720, 420, 0.7, 0.35 * v, 0.42);
        break;
      case 'whistle':
        this.tone('sine', 1700, 2500, 0.22, 0.25 * v);
        break;
      case 'cache':
        this.tone('square', 180, 90, 0.12, 0.2 * v);
        this.tone('sine', 880, 1320, 0.35, 0.2 * v, 0.1);
        break;
    }
  }

  /** Local attention indicator, as sound: a heartbeat that quickens. */
  attention(level: number, spotted: boolean, now: number): void {
    if (level < 0.12) return;
    if (now < this.nextPulse) return;
    this.nextPulse = now + (spotted ? 330 : 950 - level * 520);
    this.count('pulse');
    this.tone('sine', 70, 42, 0.16, 0.25 + level * 0.3);
    this.tone('sine', 62, 40, 0.14, 0.15 + level * 0.2, 0.17);
  }

  spotted(): void {
    this.count('sting');
    this.tone('sawtooth', 520, 130, 0.5, 0.35);
    this.tone('square', 260, 65, 0.6, 0.2, 0.02);
  }

  alert(): void {
    this.count('bell');
    this.tone('sine', 1180, 1170, 0.9, 0.3);
    this.tone('sine', 1770, 1760, 0.6, 0.12, 0.01);
  }
}
