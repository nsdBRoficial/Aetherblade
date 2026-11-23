import * as THREE from 'three';
import { BiomeId, BiomePalette, FloatingDamageText } from './types';
import { FloatingText3DSystem } from './FloatingText3D';
import { BiomeParticleGenerator } from './BiomeParticleGenerator';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  vRot: number;
  scale: number;
  age: number;
  maxAge: number;
  gravity: number;
  color: THREE.Color;
}

interface RingVfx {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
}

interface SlashVfx {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  startRotZ: number;
  endRotZ: number;
}

const _dummy = new THREE.Object3D();
const _tempColor = new THREE.Color();

export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public muted = false;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.buildNoiseBuffer();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private buildNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
  }

  public playSlash(step: number): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const isFinisher = step === 5;
    const isHeavy = step === 3 || step === 4 || step === 5;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseFreq = isFinisher ? 920 : step === 4 ? 1320 : step === 3 ? 1150 : step === 2 ? 1500 : 1800;
    filter.frequency.setValueAtTime(baseFreq, now);
    filter.frequency.exponentialRampToValueAtTime(isFinisher ? 210 : 320, now + (isFinisher ? 0.2 : 0.13));
    filter.Q.value = isFinisher ? 2.2 : 1.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isFinisher ? 0.34 : isHeavy ? 0.27 : 0.2, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinisher ? 0.22 : 0.15));

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + (isFinisher ? 0.24 : 0.16));

    // Subtle steel ring (escalates across 5-hit chain)
    const osc = this.ctx.createOscillator();
    osc.type = isFinisher ? 'sawtooth' : 'triangle';
    const pitch = isFinisher ? 440 : step === 4 ? 860 : step === 3 ? 520 : 680 + step * 70;
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(isFinisher ? 120 : 190, now + (isFinisher ? 0.18 : 0.09));
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(isFinisher ? 0.11 : 0.06, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + (isFinisher ? 0.2 : 0.1));
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (isFinisher ? 0.22 : 0.11));
  }

  public playChargePulse(charge01: number, kind: 'attack' | 'guard'): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = kind === 'attack' ? 'triangle' : 'sine';
    const base = kind === 'attack' ? 320 + charge01 * 560 : 260 + charge01 * 440;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.18, now + 0.09);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055 + charge01 * 0.045, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playChargeReady(kind: 'attack' | 'guard'): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = kind === 'attack' ? [880, 1318.5, 1760] : [659.25, 987.77, 1480];
    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const t = now + idx * 0.032;
      osc.frequency.setValueAtTime(f, t);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playMagicWave(fullCharge: boolean): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Sweeping arcane slash beam
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(fullCharge ? 960 : 720, now);
    osc.frequency.exponentialRampToValueAtTime(fullCharge ? 190 : 240, now + (fullCharge ? 0.34 : 0.24));

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(fullCharge ? 2100 : 1650, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.3);
    filter.Q.value = 1.6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(fullCharge ? 0.26 : 0.19, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (fullCharge ? 0.36 : 0.26));

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);

    // Bright aether overtone shimmer
    const chime = this.ctx.createOscillator();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(fullCharge ? 1318.5 : 1046.5, now);
    chime.frequency.exponentialRampToValueAtTime(fullCharge ? 659.25 : 523.25, now + 0.28);
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(fullCharge ? 0.15 : 0.1, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    chime.connect(cg);
    cg.connect(this.ctx.destination);
    chime.start(now);
    chime.stop(now + 0.32);
  }

  public playAegisNova(fullCharge: boolean): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Resonant shield shockwave pulse
    const sub = this.ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(fullCharge ? 220 : 185, now);
    sub.frequency.exponentialRampToValueAtTime(46, now + (fullCharge ? 0.42 : 0.3));
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(fullCharge ? 0.32 : 0.22, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + (fullCharge ? 0.44 : 0.32));
    sub.connect(sg);
    sg.connect(this.ctx.destination);
    sub.start(now);
    sub.stop(now + 0.46);

    // Ascending sanctum orb chimes
    const notes = fullCharge ? [587.33, 880, 1174.66, 1760] : [523.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      const t = now + idx * 0.04;
      o.frequency.setValueAtTime(freq, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + 0.34);
    });
  }

  public playExecutionReady(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [1046.5, 1567.98];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const t = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq, t);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playExecutionMove(biome: BiomeId): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Cinematic sub-bass impact drop
    const sub = this.ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(biome === 'hare-canyon' ? 165 : 195, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.65);

    const subFilter = this.ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(520, now);
    subFilter.frequency.exponentialRampToValueAtTime(110, now + 0.65);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.34, now + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

    sub.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(this.ctx.destination);
    sub.start(now);
    sub.stop(now + 0.76);

    // 2. Filtered wind/slash burst sweep
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      const startF =
        biome === 'winter' ? 2800 : biome === 'bamboo-forest' ? 2400 : biome === 'hare-canyon' ? 950 : 1600;
      bp.frequency.setValueAtTime(startF, now);
      bp.frequency.exponentialRampToValueAtTime(280, now + 0.45);
      bp.Q.value = 1.6;

      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.001, now);
      ng.gain.linearRampToValueAtTime(0.28, now + 0.025);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      noise.connect(bp);
      bp.connect(ng);
      ng.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.5);
    }

    // 3. Biome-signature harmonic flourish & second coup-de-grace hit resonance
    const chordMap: Record<BiomeId, number[]> = {
      'deep-forest': [440, 659.25, 880, 1318.5],
      'green-hills': [587.33, 880, 1174.66, 1760],
      'hare-canyon': [293.66, 440, 587.33, 880],
      'bamboo-forest': [659.25, 987.77, 1318.5, 1975.5],
      winter: [783.99, 1174.66, 1567.98, 2349.3],
      'wheat-field': [523.25, 783.99, 1046.5, 1567.98],
    };
    const chord = chordMap[biome];
    const waveType: OscillatorType =
      biome === 'bamboo-forest' || biome === 'hare-canyon' ? 'triangle' : 'sine';

    chord.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = waveType;
      const t = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.04, t + 0.42);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.46);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.48);
    });

    // Delayed coup-de-grace shatter ring (aligns with Wave 2 at ~0.52s)
    const finOsc = this.ctx.createOscillator();
    finOsc.type = 'triangle';
    const t2 = now + 0.52;
    finOsc.frequency.setValueAtTime(chord[2], t2);
    finOsc.frequency.exponentialRampToValueAtTime(chord[0] * 0.5, t2 + 0.34);
    const finGain = this.ctx.createGain();
    finGain.gain.setValueAtTime(0.001, t2);
    finGain.gain.linearRampToValueAtTime(0.24, t2 + 0.015);
    finGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.38);
    finOsc.connect(finGain);
    finGain.connect(this.ctx.destination);
    finOsc.start(t2);
    finOsc.stop(t2 + 0.4);
  }

  public playHit(heavy = false): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 185 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + (heavy ? 0.16 : 0.1));

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.34 : 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.17 : 0.11));

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.18 : 0.12));

    if (this.noiseBuffer) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(heavy ? 1400 : 2000, now);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(heavy ? 0.2 : 0.12, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      n.connect(f);
      f.connect(ng);
      ng.connect(this.ctx.destination);
      n.start(now);
      n.stop(now + 0.08);
    }
  }

  public playParry(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [987.77, 1480, 2217.46];
    freqs.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.03, now + 0.32);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(idx === 0 ? 0.22 : 0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.38);
    });
  }

  public playGuard(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playJump(doubleJump = false): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const startFreq = doubleJump ? 340 : 210;
    const endFreq = doubleJump ? 680 : 440;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playDash(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(700, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 0.11);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    n.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    n.start(now);
    n.stop(now + 0.14);
  }

  public playHurt(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.22);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playBreakProp(): void {
    if (this.muted || !this.ctx) return;
    this.playHit(false);
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playHeal(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + i * 0.055);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.055 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.24);
    });
  }

  public playBossRoar(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.55);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  public playBossDefeat(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    // Sub boom
    const sub = this.ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.8);
    const subG = this.ctx.createGain();
    subG.gain.setValueAtTime(0.26, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    sub.connect(subG);
    subG.connect(this.ctx.destination);
    sub.start(now);
    sub.stop(now + 0.88);

    // Victory triad
    [392.0, 493.88, 587.33, 783.99].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const t = now + 0.22 + i * 0.09;
      osc.frequency.setValueAtTime(freq, t);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  public playVictoryFanfare(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    // Noble Castlevania-inspired ascending fanfare (G4 -> B4 -> D5 -> G5 -> A5 -> B5)
    const notes: Array<{ freq: number; offset: number; dur: number; amp: number }> = [
      { freq: 392.0, offset: 0.0, dur: 0.16, amp: 0.14 },
      { freq: 493.88, offset: 0.12, dur: 0.16, amp: 0.14 },
      { freq: 587.33, offset: 0.24, dur: 0.18, amp: 0.15 },
      { freq: 783.99, offset: 0.38, dur: 0.42, amp: 0.18 },
      { freq: 659.25, offset: 0.62, dur: 0.18, amp: 0.13 },
      { freq: 783.99, offset: 0.78, dur: 0.95, amp: 0.2 },
    ];
    for (const n of notes) {
      const osc = this.ctx.createOscillator();
      const harm = this.ctx.createOscillator();
      osc.type = 'triangle';
      harm.type = 'sine';
      const t = now + n.offset;
      osc.frequency.setValueAtTime(n.freq, t);
      harm.frequency.setValueAtTime(n.freq * 2, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(n.amp, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);

      const hGain = this.ctx.createGain();
      hGain.gain.setValueAtTime(0.001, t);
      hGain.gain.linearRampToValueAtTime(n.amp * 0.32, t + 0.025);
      hGain.gain.exponentialRampToValueAtTime(0.001, t + n.dur * 0.85);

      osc.connect(gain);
      harm.connect(hGain);
      gain.connect(this.ctx.destination);
      hGain.connect(this.ctx.destination);

      osc.start(t);
      harm.start(t);
      osc.stop(t + n.dur + 0.04);
      harm.stop(t + n.dur + 0.04);
    }
  }

  public playAreaTransition(): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Gentle airy wind whoosh
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, now);
      filter.frequency.exponentialRampToValueAtTime(1250, now + 0.35);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.75);
      filter.Q.value = 1.4;

      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.001, now);
      ng.gain.linearRampToValueAtTime(0.12, now + 0.2);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.78);

      noise.connect(filter);
      filter.connect(ng);
      ng.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.8);
    }

    // Warm horizon transition chime
    [523.25, 659.25, 987.77].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const t = now + i * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.68);
    });
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export class VfxManager {
  private scene: THREE.Scene;
  private maxParticles = 320;
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private particleGeo: THREE.BufferGeometry;
  private particleMat: THREE.MeshBasicMaterial;

  // Unique 3D environmental particle system generator per biome
  private biomeParticles: BiomeParticleGenerator;

  // Dynamic action PointLight (slashes, parry, explosions)
  public actionLight: THREE.PointLight;
  private actionLightLife = 0;
  private actionLightMaxLife = 0.2;
  private actionLightPeak = 0;

  // Rings & Slash Arcs
  private rings: RingVfx[] = [];
  private ringGeo: THREE.RingGeometry;
  private slashes: SlashVfx[] = [];
  private slashGeo: THREE.RingGeometry;

  // Native Three.js 3D Sprite floating damage numbers
  private floatingText3D: FloatingText3DSystem;

  constructor(scene: THREE.Scene, palette: BiomePalette) {
    this.scene = scene;
    this.floatingText3D = new FloatingText3DSystem(scene);

    // Pooled combat particles (HDR-capable for selective bloom on bright sparks)
    this.particleGeo = new THREE.OctahedronGeometry(0.12, 0);
    this.particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeo,
      this.particleMat,
      this.maxParticles,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        vRot: 0,
        scale: 0,
        age: 0,
        maxAge: 0.4,
        gravity: 16,
        color: new THREE.Color(0xffffff),
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _tempColor.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    scene.add(this.particleMesh);

    // Unique 3D environmental particles per biome (cherry blossoms, forest fireflies, canyon embers, bamboo wisps, snow, harvest chaff)
    this.biomeParticles = new BiomeParticleGenerator(scene, palette.id, 6);

    // Dynamic PointLight
    this.actionLight = new THREE.PointLight(0x38bdf8, 0, 11, 1.6);
    this.actionLight.position.set(0, 2, 1.5);
    scene.add(this.actionLight);

    // Shared geometries for rings & slash arcs
    this.ringGeo = new THREE.RingGeometry(0.68, 0.96, 28);
    this.slashGeo = new THREE.RingGeometry(0.95, 1.65, 22, 1, -Math.PI * 0.42, Math.PI * 0.84);
  }

  public configureBiomeParticles(palette: BiomePalette, centerX: number): void {
    this.biomeParticles.configureBiome(palette.id, centerX);
  }

  public flashLight(x: number, y: number, colorHex: number, intensity: number, duration = 0.16): void {
    this.actionLight.position.set(x, y, 1.8);
    this.actionLight.color.setHex(colorHex);
    this.actionLight.intensity = intensity;
    this.actionLightPeak = intensity;
    this.actionLightLife = duration;
    this.actionLightMaxLife = duration;
  }

  public spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    speed = 6,
    gravity = 18,
    scale = 1,
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 0.35;
        p.y = y + (Math.random() - 0.5) * 0.35;
        p.z = z + (Math.random() - 0.5) * 0.4;
        const angle = Math.random() * Math.PI * 2;
        const spd = speed * (0.45 + Math.random() * 0.85);
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd * 0.85 + speed * 0.35;
        p.vz = (Math.random() - 0.5) * spd * 0.5;
        p.rotX = Math.random() * Math.PI;
        p.rotY = Math.random() * Math.PI;
        p.vRot = (Math.random() - 0.5) * 14;
        p.scale = scale * (0.65 + Math.random() * 0.7);
        p.age = 0;
        p.maxAge = 0.28 + Math.random() * 0.28;
        p.gravity = gravity;
        p.color.setHex(colorHex);
        // Subtle brightness jitter + HDR boost for luminous combat sparks (cyan, gold, fire, emerald)
        p.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
        if (colorHex !== 0xd6d3c9 && colorHex !== 0xb5834a && colorHex !== 0xc99a62) {
          p.color.multiplyScalar(1.95);
        }
        spawned++;
      }
    }
  }

  public spawnDustPuff(x: number, y: number, count = 8): void {
    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 0.6;
        p.y = y + 0.08;
        p.z = (Math.random() - 0.5) * 0.3;
        p.vx = (Math.random() - 0.5) * 4.5;
        p.vy = 0.9 + Math.random() * 1.8;
        p.vz = (Math.random() - 0.5) * 1.2;
        p.rotX = Math.random() * Math.PI;
        p.rotY = Math.random() * Math.PI;
        p.vRot = 6;
        p.scale = 0.9 + Math.random() * 0.6;
        p.age = 0;
        p.maxAge = 0.26 + Math.random() * 0.16;
        p.gravity = 3;
        p.color.setHex(0xd6d3c9);
        spawned++;
      }
    }
  }

  public spawnRing(
    x: number,
    y: number,
    colorHex: number,
    startScale = 0.35,
    endScale = 2.6,
    duration = 0.28,
  ): void {
    const hdrColor = new THREE.Color(colorHex).multiplyScalar(2.7);
    const material = new THREE.MeshBasicMaterial({
      color: hdrColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, material);
    mesh.position.set(x, y, 0.35);
    mesh.scale.setScalar(startScale);
    this.scene.add(mesh);
    this.rings.push({ mesh, material, age: 0, maxAge: duration, startScale, endScale });
  }

  public spawnSlashArc(
    x: number,
    y: number,
    facing: 1 | -1,
    comboStep: number,
    colorHex = 0x5ce1ff,
  ): void {
    const isFinisher = comboStep === 5;
    const hdrMult = isFinisher ? 3.2 : comboStep === 3 || comboStep === 4 ? 2.85 : 2.45;
    const hdrColor = new THREE.Color(colorHex).multiplyScalar(hdrMult);
    const material = new THREE.MeshBasicMaterial({
      color: hdrColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.slashGeo, material);
    mesh.position.set(x + facing * (isFinisher ? 0.72 : 0.55), y + 1.05, 0.28);
    const scaleVal = isFinisher ? 1.55 : comboStep === 4 ? 1.22 : comboStep === 3 ? 1.25 : 0.95;
    mesh.scale.set(facing * scaleVal, scaleVal, 1);

    let startRotZ = 0.7;
    let endRotZ = -0.8;
    if (comboStep === 2) {
      startRotZ = 0.25;
      endRotZ = -0.35;
    } else if (comboStep === 3) {
      startRotZ = -0.9;
      endRotZ = 0.95;
    } else if (comboStep === 4) {
      // Twin Cross-Slash diagonal sweep
      startRotZ = 1.1;
      endRotZ = -1.05;
    } else if (comboStep === 5) {
      // Colossal Aether Finisher cleave
      startRotZ = 1.35;
      endRotZ = -1.3;
    } else if (comboStep === 6) {
      // Air attack
      startRotZ = 1.0;
      endRotZ = -1.1;
    }

    mesh.rotation.z = startRotZ * facing;
    this.scene.add(mesh);
    this.slashes.push({
      mesh,
      material,
      age: 0,
      maxAge: isFinisher ? 0.22 : comboStep === 3 || comboStep === 4 ? 0.17 : 0.14,
      startRotZ: startRotZ * facing,
      endRotZ: endRotZ * facing,
    });
  }

  public spawnFloatingText(
    x: number,
    y: number,
    text: string,
    color = '#ffffff',
    scale = 1,
    vxHint?: number,
  ): void {
    this.floatingText3D.spawn({
      x,
      y: y + 0.9,
      text,
      color,
      scale,
      vxHint,
    });
  }

  public update(dt: number, cameraX: number, elapsed: number): void {
    // Update dynamic action PointLight
    if (this.actionLightLife > 0) {
      this.actionLightLife = Math.max(0, this.actionLightLife - dt);
      const t = this.actionLightLife / this.actionLightMaxLife;
      this.actionLight.intensity = this.actionLightPeak * t * t;
    } else {
      this.actionLight.intensity = 0;
    }

    // Update combat particle pool
    let dirtyParticles = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirtyParticles = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rotX += p.vRot * dt;
      p.rotY += p.vRot * 0.7 * dt;

      const lifeT = 1 - p.age / p.maxAge;
      const curScale = p.scale * lifeT;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.rotX, p.rotY, 0);
      _dummy.scale.setScalar(curScale);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (dirtyParticles) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }

    // Update unique 3D biome environmental particles (dual-layer weather + HDR emissive motes)
    this.biomeParticles.update(dt, cameraX, elapsed);

    // Update rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age >= r.maxAge) {
        this.scene.remove(r.mesh);
        r.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const t = r.age / r.maxAge;
      const eased = 1 - Math.pow(1 - t, 3);
      r.mesh.scale.setScalar(THREE.MathUtils.lerp(r.startScale, r.endScale, eased));
      r.material.opacity = (1 - t) * 0.95;
    }

    // Update slash arcs
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.age += dt;
      if (s.age >= s.maxAge) {
        this.scene.remove(s.mesh);
        s.material.dispose();
        this.slashes.splice(i, 1);
        continue;
      }
      const t = s.age / s.maxAge;
      s.mesh.rotation.z = THREE.MathUtils.lerp(s.startRotZ, s.endRotZ, t);
      s.material.opacity = (1 - t) * 0.9;
    }

    // Update native 3D floating damage text sprites at full 60fps
    this.floatingText3D.update(dt);
  }

  public projectFloatingTexts(
    _camera: THREE.PerspectiveCamera,
    _viewportWidth: number,
    _viewportHeight: number,
  ): FloatingDamageText[] {
    // Rendered natively in 3D via THREE.Sprite inside FloatingText3DSystem
    return [];
  }

  public clearTransient(): void {
    this.floatingText3D.clearActive();
    for (const r of this.rings) {
      this.scene.remove(r.mesh);
      r.material.dispose();
    }
    this.rings = [];
    for (const s of this.slashes) {
      this.scene.remove(s.mesh);
      s.material.dispose();
    }
    this.slashes = [];
  }

  public dispose(): void {
    this.clearTransient();
    this.floatingText3D.dispose();
    this.biomeParticles.dispose();
    this.scene.remove(this.particleMesh);
    this.scene.remove(this.actionLight);
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.ringGeo.dispose();
    this.slashGeo.dispose();
  }
}
