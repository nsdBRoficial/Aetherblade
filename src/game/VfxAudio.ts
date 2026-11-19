import * as THREE from 'three';
import { BiomePalette, FloatingDamageText } from './types';

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

interface AmbientMote {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  phase: number;
  scale: number;
  rotSpeed: number;
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

interface WorldFloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  z: number;
  vy: number;
  color: string;
  scale: number;
  age: number;
  maxAge: number;
}

const _dummy = new THREE.Object3D();
const _projVec = new THREE.Vector3();
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

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseFreq = step === 3 ? 1150 : step === 2 ? 1500 : 1800;
    filter.frequency.setValueAtTime(baseFreq, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.13);
    filter.Q.value = 1.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(step === 3 ? 0.28 : 0.2, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.16);

    // Subtle steel ring
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(step === 3 ? 520 : 680 + step * 70, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.09);
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.06, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
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

  // Ambient biome particles
  private ambientCount = 130;
  private ambientMotes: AmbientMote[] = [];
  private ambientMesh: THREE.InstancedMesh;
  private ambientGeo: THREE.BufferGeometry;
  private ambientMat: THREE.MeshBasicMaterial;
  private ambientStyle: BiomePalette['particleStyle'] = 'leaf';

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

  // Floating 3D->2D damage numbers
  private floatingTexts: WorldFloatingText[] = [];
  private nextTextId = 1;

  constructor(scene: THREE.Scene, palette: BiomePalette) {
    this.scene = scene;

    // Pooled combat particles
    this.particleGeo = new THREE.OctahedronGeometry(0.12, 0);
    this.particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
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

    // Ambient biome particles
    this.ambientGeo = new THREE.PlaneGeometry(0.2, 0.12);
    this.ambientMat = new THREE.MeshBasicMaterial({
      color: palette.particleColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.ambientMesh = new THREE.InstancedMesh(
      this.ambientGeo,
      this.ambientMat,
      this.ambientCount,
    );
    this.ambientMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ambientMesh.frustumCulled = false;
    this.configureBiomeParticles(palette, 6);
    scene.add(this.ambientMesh);

    // Dynamic PointLight
    this.actionLight = new THREE.PointLight(0x38bdf8, 0, 11, 1.6);
    this.actionLight.position.set(0, 2, 1.5);
    scene.add(this.actionLight);

    // Shared geometries for rings & slash arcs
    this.ringGeo = new THREE.RingGeometry(0.68, 0.96, 28);
    this.slashGeo = new THREE.RingGeometry(0.95, 1.65, 22, 1, -Math.PI * 0.42, Math.PI * 0.84);
  }

  public configureBiomeParticles(palette: BiomePalette, centerX: number): void {
    this.ambientStyle = palette.particleStyle;
    this.ambientMat.color.setHex(palette.particleColor);
    this.ambientMotes = [];
    for (let i = 0; i < this.ambientCount; i++) {
      const isSnow = palette.particleStyle === 'snow';
      const isDust = palette.particleStyle === 'dust';
      this.ambientMotes.push({
        x: centerX + (Math.random() - 0.5) * 34,
        y: Math.random() * 12 + 0.2,
        z: (Math.random() - 0.5) * 9,
        vx: isDust ? -2.2 - Math.random() * 1.5 : -0.8 - Math.random() * 1.1,
        vy: isSnow ? -1.4 - Math.random() * 1.2 : isDust ? -0.25 : -0.65 - Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        scale: isSnow ? 0.55 + Math.random() * 0.55 : 0.7 + Math.random() * 0.85,
        rotSpeed: (Math.random() - 0.5) * 3.5,
      });
    }
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
        // Subtle brightness jitter
        p.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
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
    const material = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
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
    const material = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.slashGeo, material);
    mesh.position.set(x + facing * 0.55, y + 1.05, 0.28);
    const scaleVal = comboStep === 3 ? 1.25 : 0.95;
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
      maxAge: comboStep === 3 ? 0.18 : 0.14,
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
  ): void {
    this.floatingTexts.push({
      id: this.nextTextId++,
      text,
      x: x + (Math.random() - 0.5) * 0.4,
      y: y + 1.4,
      z: 0.4,
      vy: 2.4,
      color,
      scale,
      age: 0,
      maxAge: 0.78,
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

    // Update ambient biome particles wrapping around camera
    for (let i = 0; i < this.ambientCount; i++) {
      const m = this.ambientMotes[i];
      const sway =
        this.ambientStyle === 'snow'
          ? Math.sin(elapsed * 2.1 + m.phase) * 0.7
          : Math.sin(elapsed * 1.6 + m.phase) * 1.1;
      m.x += (m.vx + sway * 0.4) * dt;
      m.y += m.vy * dt;

      if (m.y < -0.5) {
        m.y = 11.5 + Math.random() * 2;
        m.x = cameraX + (Math.random() - 0.45) * 32;
      }
      if (m.x < cameraX - 18) m.x += 36;
      if (m.x > cameraX + 18) m.x -= 36;

      _dummy.position.set(m.x, m.y, m.z);
      if (this.ambientStyle === 'snow') {
        _dummy.rotation.set(0, 0, elapsed * m.rotSpeed);
        _dummy.scale.set(m.scale * 0.65, m.scale * 0.65, 1);
      } else {
        _dummy.rotation.set(
          Math.sin(elapsed * 2 + m.phase) * 0.8,
          elapsed * m.rotSpeed,
          Math.cos(elapsed * 1.5 + m.phase) * 0.6,
        );
        _dummy.scale.set(m.scale, m.scale * 0.7, 1);
      }
      _dummy.updateMatrix();
      this.ambientMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.ambientMesh.instanceMatrix.needsUpdate = true;

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

    // Update floating damage texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.age += dt;
      ft.y += ft.vy * dt;
      ft.vy *= Math.max(0, 1 - 2.6 * dt);
      if (ft.age >= ft.maxAge) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  public projectFloatingTexts(
    camera: THREE.PerspectiveCamera,
    viewportWidth: number,
    viewportHeight: number,
  ): FloatingDamageText[] {
    const out: FloatingDamageText[] = [];
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const ft = this.floatingTexts[i];
      _projVec.set(ft.x, ft.y, ft.z).project(camera);
      const screenX = (_projVec.x * 0.5 + 0.5) * viewportWidth;
      const screenY = (-_projVec.y * 0.5 + 0.5) * viewportHeight;
      out.push({
        id: ft.id,
        text: ft.text,
        screenX,
        screenY,
        color: ft.color,
        scale: ft.scale,
        age: ft.age,
        maxAge: ft.maxAge,
      });
    }
    return out;
  }

  public clearTransient(): void {
    this.floatingTexts = [];
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
    this.scene.remove(this.particleMesh);
    this.scene.remove(this.ambientMesh);
    this.scene.remove(this.actionLight);
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.ambientGeo.dispose();
    this.ambientMat.dispose();
    this.ringGeo.dispose();
    this.slashGeo.dispose();
  }
}
