import type { Sfx } from './game';

/**
 * Alle Sounds werden zur Laufzeit per Web Audio synthetisiert –
 * keine Audiodateien, keine Lizenzfragen.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private last = new Map<Sfx, number>();
  private musicTimer: number | null = null;
  private step = 0;
  private noiseBuf: AudioBuffer | null = null;
  soundOn = true;
  musicOn = true;

  /** Muss aus einer Nutzerinteraktion heraus aufgerufen werden (Autoplay-Regeln). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.18;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.applyMusic();
  }

  suspend(): void { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend(); }
  resume(): void { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume(); }

  setSound(on: boolean): void { this.soundOn = on; }
  setMusic(on: boolean): void { this.musicOn = on; this.applyMusic(); }

  private applyMusic(): void {
    if (!this.ctx) return;
    if (this.musicOn && this.musicTimer === null) {
      this.musicTimer = window.setInterval(() => this.musicTick(), 220);
    } else if (!this.musicOn && this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  // Einfache, entspannte Insel-Melodie (pentatonisch, Marimba-artig)
  private musicTick(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const bass = [0, 0, 5, 5, 7, 7, 4, 4];
    const s = this.step++;
    const bar = Math.floor(s / 8) % 8;
    const now = this.ctx.currentTime;
    if (s % 4 === 0) this.tone(110 * 2 ** (bass[bar] / 12), now, 0.5, 'triangle', 0.35, this.musicGain);
    const pattern = (s * 7 + bar * 3) % 11;
    if (pattern < 6) {
      const note = scale[(s * 3 + bar + (s >> 3)) % scale.length];
      this.tone(330 * 2 ** (note / 12), now, 0.28, 'sine', 0.22, this.musicGain);
    }
  }

  play(name: Sfx): void {
    if (!this.ctx || !this.soundOn || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const minGap: Partial<Record<Sfx, number>> = { shoot: 0.06, hit: 0.05, pop: 0.04, zap: 0.08, pulse: 0.1, boom: 0.08, fire: 0.08, spear: 0.08 };
    const l = this.last.get(name) ?? -1;
    if (now - l < (minGap[name] ?? 0)) return;
    this.last.set(name, now);
    const out = this.sfxGain;
    switch (name) {
      case 'shoot': this.sweep(520, 260, now, 0.08, 'square', 0.06, out); break;
      case 'spear': this.noise(now, 0.12, 0.12, 2400, out); this.sweep(900, 400, now, 0.1, 'sawtooth', 0.04, out); break;
      case 'fire': this.noise(now, 0.25, 0.15, 700, out); break;
      case 'pulse': this.sweep(180, 90, now, 0.35, 'sine', 0.25, out); this.sweep(360, 180, now, 0.3, 'triangle', 0.08, out); break;
      case 'zap': this.noise(now, 0.15, 0.2, 5000, out); this.sweep(1400, 300, now, 0.15, 'sawtooth', 0.06, out); break;
      case 'hit': this.noise(now, 0.05, 0.08, 1800, out); break;
      case 'pop': this.sweep(700, 1100, now, 0.08, 'triangle', 0.1, out); break;
      case 'boom': this.noise(now, 0.4, 0.3, 400, out); this.sweep(140, 40, now, 0.35, 'sine', 0.3, out); break;
      case 'build': this.sweep(200, 120, now, 0.12, 'square', 0.08, out); this.noise(now, 0.15, 0.12, 900, out); break;
      case 'sell': this.arp([784, 523], now, 0.07, 'triangle', 0.12, out); break;
      case 'upgrade': this.arp([523, 659, 784, 1047], now, 0.07, 'triangle', 0.14, out); break;
      case 'coin': this.arp([988, 1319], now, 0.06, 'square', 0.06, out); break;
      case 'leak': this.sweep(300, 90, now, 0.4, 'sawtooth', 0.12, out); break;
      case 'wave': this.arp([392, 523, 659], now, 0.12, 'sawtooth', 0.08, out); break;
      case 'error': this.sweep(160, 120, now, 0.15, 'square', 0.08, out); break;
      case 'win': this.arp([523, 659, 784, 1047, 784, 1047], now, 0.14, 'triangle', 0.18, out); break;
      case 'lose': this.arp([392, 330, 262, 196], now, 0.25, 'sawtooth', 0.12, out); break;
    }
  }

  private tone(f: number, t: number, dur: number, type: OscillatorType, vol: number, out: AudioNode): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private sweep(f0: number, f1: number, t: number, dur: number, type: OscillatorType, vol: number, out: AudioNode): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private arp(notes: number[], t: number, step: number, type: OscillatorType, vol: number, out: AudioNode): void {
    notes.forEach((f, i) => this.tone(f, t + i * step, step * 1.6, type, vol, out));
  }

  private noise(t: number, dur: number, vol: number, cutoff: number, out: AudioNode): void {
    const c = this.ctx!;
    if (!this.noiseBuf) return;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
