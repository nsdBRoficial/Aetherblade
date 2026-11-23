import * as THREE from 'three';
import {
  BIOME_EXECUTION_META,
  BiomeId,
  ExecutionHudState,
} from './types';
import { EnemyEntity, EnemyManager } from './EnemyManager';
import { LevelBuilder } from './LevelBuilder';
import { PlayerController } from './PlayerController';
import { ProceduralAudio, VfxManager } from './VfxAudio';
import { PostProcessingPass } from './PostProcessingPass';

interface ExecParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  vRot: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  age: number;
  maxAge: number;
  gravity: number;
  color: THREE.Color;
}

interface ExecAccentSlot {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  delay: number;
  age: number;
  maxAge: number;
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  startRotZ: number;
  endRotZ: number;
  startScaleX: number;
  startScaleY: number;
  endScaleX: number;
  endScaleY: number;
  impactFired: boolean;
}

export interface ExecutionHitEvent {
  enemy: EnemyEntity;
  defeated: boolean;
  executed: boolean;
  comboGain: number;
  staminaRefund: number;
}

export interface ExecutionCallbacks {
  onEnemyHit: (ev: ExecutionHitEvent) => void;
  onPropDestroyed: (x: number, y: number, isCrystal: boolean) => void;
  onProjectileVaporized: (x: number, y: number) => void;
  onShake: (amount: number) => void;
}

const MAX_EXEC_PARTICLES = 180;
const RIBBON_SLOTS = 8;
const LANCE_SLOTS = 8;
const HALO_SLOTS = 2;
const EXECUTION_DURATION = 1.16;

// Reusable scratch objects for zero-GC updates
const _dummy = new THREE.Object3D();
const _tempColor = new THREE.Color();

/**
 * Screen-Wide Biome Execution Finisher System.
 * Triggered by pressing the extra input (E / Q / Middle-Click) after completing
 * the 3-hit combo. Unleashes a dramatic slow-mo zoomed-in screen-wide Execution
 * with unique 3D particle choreography & geometric effects per biome.
 */
export class ExecutionSystem {
  private scene: THREE.Scene;
  private root: THREE.Group;

  // Active execution state
  public active = false;
  private elapsed = 0;
  private biome: BiomeId = 'deep-forest';
  private originX = 0;
  private originY = 0;
  private cameraCenterX = 0;
  private comboMult = 1.0;
  private wave1Fired = false;
  private wave2Fired = false;

  // Pooled HDR 3D InstancedMesh particles (blooms cleanly via toneMapped: false)
  private particles: ExecParticle[] = [];
  private particleGeo: THREE.OctahedronGeometry;
  private particleMat: THREE.MeshBasicMaterial;
  private particleMesh: THREE.InstancedMesh;

  // Pre-allocated reusable 3D biome accent meshes
  private ribbonGeo: THREE.PlaneGeometry;
  private lanceGeo: THREE.ConeGeometry;
  private haloGeo: THREE.RingGeometry;
  private ribbons: ExecAccentSlot[] = [];
  private lances: ExecAccentSlot[] = [];
  private halos: ExecAccentSlot[] = [];

  // Dynamic biome execution PointLight sweeping across the screen
  private execLight: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    // 1. Pooled HDR Execution Particle InstancedMesh
    this.particleGeo = new THREE.OctahedronGeometry(0.16, 0);
    this.particleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeo,
      this.particleMat,
      MAX_EXEC_PARTICLES,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < MAX_EXEC_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -120,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        vRot: 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        orbitAngle: 0,
        orbitRadius: 0,
        orbitSpeed: 0,
        age: 0,
        maxAge: 0.9,
        gravity: 0,
        color: new THREE.Color(0xffffff),
      });
      _dummy.position.set(0, -120, 0);
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _tempColor.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.root.add(this.particleMesh);

    // 2. Shared Accent Geometries (Ribbons / Dimension Cuts, Lances / Meteors, Halos)
    this.ribbonGeo = new THREE.PlaneGeometry(1, 1);
    this.lanceGeo = new THREE.ConeGeometry(0.42, 2.8, 5);
    this.haloGeo = new THREE.RingGeometry(0.84, 1.0, 36);

    for (let i = 0; i < RIBBON_SLOTS; i++) {
      this.ribbons.push(this.createSlot(this.ribbonGeo, 12));
    }
    for (let i = 0; i < LANCE_SLOTS; i++) {
      this.lances.push(this.createSlot(this.lanceGeo, 11));
    }
    for (let i = 0; i < HALO_SLOTS; i++) {
      this.halos.push(this.createSlot(this.haloGeo, 10));
    }

    // 3. Dedicated dynamic PointLight for execution lighting surge
    this.execLight = new THREE.PointLight(0xffffff, 0, 28, 1.35);
    this.execLight.position.set(0, 3.2, 3.2);
    this.root.add(this.execLight);
  }

  private createSlot(geo: THREE.BufferGeometry, renderOrder: number): ExecAccentSlot {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.visible = false;
    mesh.renderOrder = renderOrder;
    this.root.add(mesh);
    return {
      mesh,
      material,
      active: false,
      delay: 0,
      age: 0,
      maxAge: 0.5,
      startX: 0,
      startY: 0,
      startZ: 0,
      endX: 0,
      endY: 0,
      endZ: 0,
      startRotZ: 0,
      endRotZ: 0,
      startScaleX: 1,
      startScaleY: 1,
      endScaleX: 1,
      endScaleY: 1,
      impactFired: false,
    };
  }

  public trigger(
    biome: BiomeId,
    player: PlayerController,
    cameraX: number,
    comboMult: number,
    enemies: EnemyManager,
    vfx: VfxManager,
    audio: ProceduralAudio,
    postPass: PostProcessingPass,
    callbacks: ExecutionCallbacks,
  ): void {
    const meta = BIOME_EXECUTION_META[biome];
    this.active = true;
    this.elapsed = 0;
    this.biome = biome;
    this.originX = player.x;
    this.originY = player.y + 1.1;
    this.cameraCenterX = cameraX;
    this.comboMult = comboMult;
    this.wave1Fired = false;
    this.wave2Fired = false;

    // Dramatic audio, lighting surge, screen flash & 3D floating banner text
    audio.playExecutionMove(biome);
    postPass.triggerFlash(meta.primaryHex, 0.48);
    callbacks.onShake(0.46);
    vfx.flashLight(player.x, player.y + 1.4, meta.primaryHex, 18, 0.45);
    vfx.spawnRing(player.x, player.y + 1.1, meta.primaryHex, 0.4, 7.2, 0.42);
    vfx.spawnRing(player.x, player.y + 1.1, meta.secondaryHex, 0.25, 4.8, 0.34);
    vfx.spawnFloatingText(
      player.x,
      player.y + 1.25,
      meta.name.toUpperCase() + '!',
      meta.accent,
      1.42,
    );

    this.execLight.color.setHex(meta.primaryHex);
    this.execLight.position.set(cameraX, 3.6, 3.8);
    this.execLight.intensity = 22;

    // Immediately vaporize all hostile projectiles currently on screen
    for (const p of enemies.projectiles) {
      if (!p.alive || p.reflected) continue;
      if (Math.abs(p.x - cameraX) <= 21) {
        p.alive = false;
        vfx.spawnBurst(p.x, p.y, 0.2, 10, meta.primaryHex, 6.5, 8, 0.9);
        vfx.spawnRing(p.x, p.y, meta.secondaryHex, 0.15, 1.35, 0.2);
        callbacks.onProjectileVaporized(p.x, p.y);
      }
    }

    // Configure unique 3D geometric & particle choreography for this biome
    this.resetAccents();
    this.spawnBiomeChoreography(biome, meta.primaryHex, meta.secondaryHex);
  }

  private resetAccents(): void {
    for (const s of this.ribbons) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const s of this.lances) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const s of this.halos) {
      s.active = false;
      s.mesh.visible = false;
    }
  }

  private configureSlot(
    slot: ExecAccentSlot,
    colorHex: number,
    hdrMult: number,
    params: {
      delay: number;
      maxAge: number;
      startX: number;
      startY: number;
      startZ: number;
      endX: number;
      endY: number;
      endZ: number;
      startRotZ: number;
      endRotZ: number;
      startScaleX: number;
      startScaleY: number;
      endScaleX: number;
      endScaleY: number;
    },
  ): void {
    slot.active = true;
    slot.delay = params.delay;
    slot.age = 0;
    slot.maxAge = params.maxAge;
    slot.startX = params.startX;
    slot.startY = params.startY;
    slot.startZ = params.startZ;
    slot.endX = params.endX;
    slot.endY = params.endY;
    slot.endZ = params.endZ;
    slot.startRotZ = params.startRotZ;
    slot.endRotZ = params.endRotZ;
    slot.startScaleX = params.startScaleX;
    slot.startScaleY = params.startScaleY;
    slot.endScaleX = params.endScaleX;
    slot.endScaleY = params.endScaleY;
    slot.impactFired = false;
    slot.material.color.setHex(colorHex).multiplyScalar(hdrMult);
    slot.material.opacity = 0;
    slot.mesh.visible = false;
  }

  private spawnBiomeChoreography(
    biome: BiomeId,
    primaryHex: number,
    secondaryHex: number,
  ): void {
    const cx = this.cameraCenterX;
    const ox = this.originX;
    const oy = this.originY;

    // Expanding biome aura halos centered on hero / viewport
    this.configureSlot(this.halos[0], primaryHex, 3.0, {
      delay: 0.0,
      maxAge: 0.72,
      startX: ox,
      startY: oy,
      startZ: 0.45,
      endX: cx,
      endY: 2.6,
      endZ: 0.45,
      startRotZ: 0,
      endRotZ: 0.8,
      startScaleX: 0.6,
      startScaleY: 0.6,
      endScaleX: 16.5,
      endScaleY: 16.5,
    });
    this.configureSlot(this.halos[1], secondaryHex, 2.8, {
      delay: 0.22,
      maxAge: 0.68,
      startX: cx,
      startY: 2.4,
      startZ: 0.5,
      endX: cx,
      endY: 2.4,
      endZ: 0.5,
      startRotZ: 0,
      endRotZ: -0.6,
      startScaleX: 0.8,
      startScaleY: 0.8,
      endScaleX: 19.0,
      endScaleY: 19.0,
    });

    if (biome === 'deep-forest') {
      // EMERALD THORNSTORM: Rising emerald briar lances erupt across the lane + helical vortex particles
      for (let i = 0; i < LANCE_SLOTS; i++) {
        const laneX = cx - 12.5 + (i / (LANCE_SLOTS - 1)) * 25;
        const tilt = (i % 2 === 0 ? 1 : -1) * (0.14 + Math.random() * 0.16);
        this.configureSlot(this.lances[i], i % 2 === 0 ? primaryHex : secondaryHex, 2.8, {
          delay: 0.06 + Math.abs(laneX - ox) * 0.018,
          maxAge: 0.76,
          startX: laneX,
          startY: -1.8,
          startZ: 0.35 + (i % 3) * 0.15,
          endX: laneX - Math.sin(tilt) * 1.4,
          endY: 3.1 + (i % 3) * 0.65,
          endZ: 0.35 + (i % 3) * 0.15,
          startRotZ: tilt,
          endRotZ: tilt,
          startScaleX: 0.75,
          startScaleY: 0.5,
          endScaleX: 1.45,
          endScaleY: 2.75,
        });
      }
      // Swirling emerald wind ribbons
      for (let i = 0; i < 4; i++) {
        this.configureSlot(this.ribbons[i], secondaryHex, 2.6, {
          delay: 0.12 + i * 0.08,
          maxAge: 0.62,
          startX: cx - 13,
          startY: 1.0 + i * 1.35,
          startZ: 0.7,
          endX: cx + 13,
          endY: 2.6 + i * 1.35,
          endZ: 0.7,
          startRotZ: 0.14,
          endRotZ: -0.08,
          startScaleX: 5.5,
          startScaleY: 0.24,
          endScaleX: 16.0,
          endScaleY: 0.07,
        });
      }
    } else if (biome === 'green-hills') {
      // SAKURA TEMPEST: Sweeping pink-gold blossom cyclone ribbons across the whole screen
      for (let i = 0; i < RIBBON_SLOTS; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const rowY = 0.7 + (i / (RIBBON_SLOTS - 1)) * 6.4;
        this.configureSlot(this.ribbons[i], i % 3 === 0 ? secondaryHex : primaryHex, 2.9, {
          delay: i * 0.045,
          maxAge: 0.66,
          startX: cx - dir * 15,
          startY: rowY - 0.5,
          startZ: 0.55 + (i % 3) * 0.2,
          endX: cx + dir * 15,
          endY: rowY + 1.1,
          endZ: 0.55 + (i % 3) * 0.2,
          startRotZ: dir * 0.12,
          endRotZ: dir * -0.08,
          startScaleX: 4.5,
          startScaleY: 0.34,
          endScaleX: 15.5,
          endScaleY: 0.1,
        });
      }
    } else if (biome === 'hare-canyon') {
      // CRIMSON METEORFALL: Blazing magma meteors streaking diagonally into the canyon floor
      for (let i = 0; i < LANCE_SLOTS; i++) {
        const targetX = cx - 12.2 + (i / (LANCE_SLOTS - 1)) * 24.4;
        const dir = i % 2 === 0 ? 1 : -1;
        this.configureSlot(this.lances[i], i % 3 === 0 ? secondaryHex : primaryHex, 3.2, {
          delay: 0.04 + i * 0.055,
          maxAge: 0.52,
          startX: targetX - dir * 6.5,
          startY: 11.5 + (i % 3) * 1.4,
          startZ: 0.45,
          endX: targetX,
          endY: 0.25,
          endZ: 0.45,
          startRotZ: dir > 0 ? Math.PI * 0.78 : -Math.PI * 0.78,
          endRotZ: dir > 0 ? Math.PI * 0.78 : -Math.PI * 0.78,
          startScaleX: 1.15,
          startScaleY: 1.9,
          endScaleX: 1.65,
          endScaleY: 2.35,
        });
      }
      // Blazing fiery streak ribbons behind meteors
      for (let i = 0; i < 4; i++) {
        const tx = cx - 9 + i * 6;
        this.configureSlot(this.ribbons[i], secondaryHex, 2.8, {
          delay: 0.18 + i * 0.07,
          maxAge: 0.48,
          startX: tx,
          startY: 0.4,
          startZ: 0.6,
          endX: tx,
          endY: 2.6,
          endZ: 0.6,
          startRotZ: 0,
          endRotZ: 0,
          startScaleX: 1.5,
          startScaleY: 0.35,
          endScaleX: 8.5,
          endScaleY: 0.08,
        });
      }
    } else if (biome === 'bamboo-forest') {
      // JADE JUDGEMENT: Criss-crossing dimensional katana slash planes across the whole viewport!
      const slashAngles = [0.42, -0.52, 0.12, -0.22, 0.76, -0.78, 0.03, -0.36];
      for (let i = 0; i < RIBBON_SLOTS; i++) {
        const wave = i < 4 ? 0 : 1;
        const offsetX = cx + ((i % 4) - 1.5) * 4.8;
        const offsetY = 2.1 + (i % 3) * 1.35;
        const ang = slashAngles[i % slashAngles.length];
        this.configureSlot(this.ribbons[i], i % 2 === 0 ? primaryHex : secondaryHex, 3.4, {
          delay: wave === 0 ? 0.04 + i * 0.045 : 0.34 + (i - 4) * 0.045,
          maxAge: 0.44,
          startX: offsetX,
          startY: offsetY,
          startZ: 0.75 + i * 0.02,
          endX: offsetX,
          endY: offsetY,
          endZ: 0.75 + i * 0.02,
          startRotZ: ang,
          endRotZ: ang,
          startScaleX: 1.2,
          startScaleY: 0.42,
          endScaleX: 28.0,
          endScaleY: 0.06,
        });
      }
    } else if (biome === 'winter') {
      // GLACIAL SHATTER: Crystalline ice spires erupt across floor, then burst outward
      for (let i = 0; i < LANCE_SLOTS; i++) {
        const laneX = cx - 12.6 + (i / (LANCE_SLOTS - 1)) * 25.2;
        const lean = ((i % 3) - 1) * 0.16;
        this.configureSlot(this.lances[i], i % 2 === 0 ? primaryHex : secondaryHex, 3.0, {
          delay: 0.03 + i * 0.038,
          maxAge: 0.62,
          startX: laneX,
          startY: -1.6,
          startZ: 0.4,
          endX: laneX,
          endY: 2.85 + (i % 2) * 0.9,
          endZ: 0.4,
          startRotZ: lean,
          endRotZ: lean * 1.2,
          startScaleX: 0.95,
          startScaleY: 0.4,
          endScaleX: 1.75,
          endScaleY: 2.9,
        });
      }
      // Shatter refraction beams on Beat 2
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI;
        this.configureSlot(this.ribbons[i], secondaryHex, 3.1, {
          delay: 0.42 + i * 0.02,
          maxAge: 0.46,
          startX: cx,
          startY: 2.5,
          startZ: 0.75,
          endX: cx,
          endY: 2.5,
          endZ: 0.75,
          startRotZ: ang,
          endRotZ: ang + 0.08,
          startScaleX: 2.0,
          startScaleY: 0.36,
          endScaleX: 26.0,
          endScaleY: 0.05,
        });
      }
    } else {
      // WHEAT FIELD — SOLARIS HARVEST: Sweeping golden solar scythe waves & ascending dawn rays
      for (let i = 0; i < RIBBON_SLOTS; i++) {
        const isRay = i >= 4;
        if (!isRay) {
          const yPos = 1.1 + i * 1.35;
          this.configureSlot(this.ribbons[i], i % 2 === 0 ? primaryHex : secondaryHex, 3.2, {
            delay: 0.06 + i * 0.065,
            maxAge: 0.68,
            startX: cx - 15,
            startY: yPos,
            startZ: 0.65,
            endX: cx + 15,
            endY: yPos + 0.4,
            endZ: 0.65,
            startRotZ: 0.24,
            endRotZ: -0.22,
            startScaleX: 6.0,
            startScaleY: 0.45,
            endScaleX: 19.0,
            endScaleY: 0.12,
          });
        } else {
          const rayIdx = i - 4;
          const ang = -0.55 + rayIdx * 0.36;
          this.configureSlot(this.ribbons[i], secondaryHex, 2.7, {
            delay: 0.22 + rayIdx * 0.05,
            maxAge: 0.72,
            startX: cx + (rayIdx - 1.5) * 4.5,
            startY: 4.8,
            startZ: 0.55,
            endX: cx + (rayIdx - 1.5) * 5.2,
            endY: 4.8,
            endZ: 0.55,
            startRotZ: ang,
            endRotZ: ang,
            startScaleX: 0.2,
            startScaleY: 14.0,
            endScaleX: 1.4,
            endScaleY: 18.0,
          });
        }
      }
    }

    // Spawn all 180 biome-styled 3D HDR particles across the screen
    this.spawnBiomeParticles(biome, primaryHex, secondaryHex);
  }

  private spawnBiomeParticles(
    biome: BiomeId,
    primaryHex: number,
    secondaryHex: number,
  ): void {
    const cx = this.cameraCenterX;
    for (let i = 0; i < MAX_EXEC_PARTICLES; i++) {
      const p = this.particles[i];
      p.active = true;
      p.age = 0;
      p.maxAge = 0.78 + Math.random() * 0.38;
      p.rotX = Math.random() * Math.PI * 2;
      p.rotY = Math.random() * Math.PI * 2;
      p.rotZ = Math.random() * Math.PI * 2;
      p.vRot = (Math.random() - 0.5) * 14;
      p.orbitAngle = Math.random() * Math.PI * 2;
      p.orbitRadius = 0;
      p.orbitSpeed = 0;

      const useSecondary = Math.random() < 0.38;
      p.color.setHex(useSecondary ? secondaryHex : primaryHex);
      p.color.offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.08);
      p.color.multiplyScalar(2.45);

      if (biome === 'deep-forest') {
        // Swirling emerald thorn-leaf vortex pillars across the screen
        const vortexCenter = cx + ((i % 3) - 1) * 7.8;
        p.orbitRadius = 0.9 + Math.random() * 4.2;
        p.orbitSpeed = (i % 2 === 0 ? 1 : -1) * (5.5 + Math.random() * 4.5);
        p.x = vortexCenter + Math.cos(p.orbitAngle) * p.orbitRadius;
        p.y = -0.3 + Math.random() * 3.5;
        p.z = (Math.random() - 0.5) * 3.2;
        p.vx = 0;
        p.vy = 4.2 + Math.random() * 6.4;
        p.vz = 0;
        p.gravity = -1.2;
        p.scaleX = 1.45;
        p.scaleY = 0.55;
        p.scaleZ = 0.55;
      } else if (biome === 'green-hills') {
        // High-speed sweeping cherry blossom cyclone petals
        p.x = cx - 16 + Math.random() * 20;
        p.y = 0.2 + Math.random() * 7.5;
        p.z = (Math.random() - 0.5) * 3.8;
        p.vx = 18 + Math.random() * 14;
        p.vy = (Math.random() - 0.5) * 4.5;
        p.vz = (Math.random() - 0.5) * 2.5;
        p.gravity = -0.8;
        p.scaleX = 1.65;
        p.scaleY = 0.72;
        p.scaleZ = 0.28;
      } else if (biome === 'hare-canyon') {
        // Volcanic meteor sparks & soaring canyon embers
        const isFalling = i < 70;
        p.x = cx + (Math.random() - 0.5) * 27;
        p.y = isFalling ? 5.5 + Math.random() * 6.5 : 0.1 + Math.random() * 1.4;
        p.z = (Math.random() - 0.5) * 3.0;
        p.vx = isFalling ? (Math.random() - 0.5) * 6 : (Math.random() - 0.5) * 11;
        p.vy = isFalling ? -(12 + Math.random() * 9) : 6.5 + Math.random() * 10.5;
        p.vz = (Math.random() - 0.5) * 3.5;
        p.gravity = isFalling ? 6 : 13;
        p.scaleX = isFalling ? 0.85 : 1.15;
        p.scaleY = isFalling ? 2.1 : 1.15;
        p.scaleZ = 0.85;
      } else if (biome === 'bamboo-forest') {
        // Razor jade spirit motes & suspended slash-spark slivers
        p.x = cx + (Math.random() - 0.5) * 26;
        p.y = 0.5 + Math.random() * 6.8;
        p.z = (Math.random() - 0.5) * 2.4;
        const ang = Math.random() * Math.PI * 2;
        const spd = 2.5 + Math.random() * 8.5;
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.sin(ang) * spd;
        p.vz = (Math.random() - 0.5) * 2.2;
        p.gravity = 0.4;
        p.scaleX = 2.2;
        p.scaleY = 0.32;
        p.scaleZ = 0.32;
      } else if (biome === 'winter') {
        // Exploding diamond frost shards & radial blizzard crystals
        p.x = cx + (Math.random() - 0.5) * 25;
        p.y = 0.2 + Math.random() * 4.5;
        p.z = (Math.random() - 0.5) * 3.0;
        const ang = Math.random() * Math.PI * 2;
        const spd = 5.5 + Math.random() * 12.0;
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.abs(Math.sin(ang)) * spd * 0.9 + 2.0;
        p.vz = (Math.random() - 0.5) * 4.0;
        p.gravity = 9.5;
        p.scaleX = 1.0;
        p.scaleY = 1.95;
        p.scaleZ = 1.0;
      } else {
        // WHEAT FIELD — Radiant ascending golden solar sparks & harvest ribbons
        p.x = cx + (Math.random() - 0.5) * 27;
        p.y = -0.2 + Math.random() * 4.0;
        p.z = (Math.random() - 0.5) * 3.2;
        p.vx = 6.5 + Math.random() * 9.0;
        p.vy = 3.8 + Math.random() * 8.2;
        p.vz = (Math.random() - 0.5) * 2.0;
        p.gravity = -2.2;
        p.scaleX = 1.85;
        p.scaleY = 0.45;
        p.scaleZ = 0.45;
      }
    }
  }

  public update(
    dt: number,
    enemies: EnemyManager,
    level: LevelBuilder,
    vfx: VfxManager,
    audio: ProceduralAudio,
    postPass: PostProcessingPass,
    callbacks: ExecutionCallbacks,
  ): void {
    if (!this.active) return;

    this.elapsed += dt;
    const meta = BIOME_EXECUTION_META[this.biome];

    // Dynamic lighting decay
    const lightT = Math.max(0, 1 - this.elapsed / EXECUTION_DURATION);
    this.execLight.intensity = 22 * lightT * lightT;

    // WAVE 1 (t >= 0.24s): Screen-wide stagger strike & prop shatter
    if (!this.wave1Fired && this.elapsed >= 0.24) {
      this.wave1Fired = true;
      this.resolveWave(1, enemies, level, vfx, audio, postPass, callbacks);
    }

    // WAVE 2 (t >= 0.54s): Screen-wide Execution Coup de Grâce!
    if (!this.wave2Fired && this.elapsed >= 0.54) {
      this.wave2Fired = true;
      this.resolveWave(2, enemies, level, vfx, audio, postPass, callbacks);
    }

    // Update 3D accent slots (Ribbons, Lances/Meteors, Halos)
    this.updateAccentGroup(this.ribbons, dt, false, vfx, meta.primaryHex);
    this.updateAccentGroup(this.lances, dt, this.biome === 'hare-canyon', vfx, meta.primaryHex);
    this.updateAccentGroup(this.halos, dt, false, vfx, meta.secondaryHex);

    // Update 180 pooled HDR InstancedMesh particles
    let anyParticleAlive = false;
    for (let i = 0; i < MAX_EXEC_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _dummy.position.set(0, -120, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      anyParticleAlive = true;

      if (p.orbitRadius > 0) {
        const prevAngle = p.orbitAngle;
        p.orbitAngle += p.orbitSpeed * dt;
        const centerX = p.x - Math.cos(prevAngle) * p.orbitRadius;
        p.x = centerX + Math.cos(p.orbitAngle) * p.orbitRadius;
        p.z = Math.sin(p.orbitAngle) * (p.orbitRadius * 0.45);
      } else {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
      }

      p.vy -= p.gravity * dt;
      p.y += p.vy * dt;

      // Subtle petal wave sway in Green Hills
      if (this.biome === 'green-hills') {
        p.y += Math.sin(this.elapsed * 12 + i * 0.7) * 2.2 * dt;
      }

      p.rotX += p.vRot * dt;
      p.rotY += p.vRot * 0.8 * dt;
      p.rotZ += p.vRot * 0.5 * dt;

      const lifeT = p.age / p.maxAge;
      const fade = lifeT < 0.14 ? lifeT / 0.14 : Math.max(0, 1 - (lifeT - 0.14) / 0.86);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.rotX, p.rotY, p.rotZ);
      _dummy.scale.set(p.scaleX * fade, p.scaleY * fade, p.scaleZ * fade);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }

    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }

    if (this.elapsed >= EXECUTION_DURATION && !anyParticleAlive) {
      this.active = false;
      this.execLight.intensity = 0;
      this.resetAccents();
    } else if (this.elapsed >= EXECUTION_DURATION) {
      // Finish sequence cleanly at EXECUTION_DURATION
      this.clear();
    }
  }

  private updateAccentGroup(
    slots: ExecAccentSlot[],
    dt: number,
    triggerGroundBurst: boolean,
    vfx: VfxManager,
    burstColor: number,
  ): void {
    for (const s of slots) {
      if (!s.active) continue;
      if (s.delay > 0) {
        s.delay -= dt;
        continue;
      }
      s.age += dt;
      if (s.age >= s.maxAge) {
        s.active = false;
        s.mesh.visible = false;
        if (triggerGroundBurst && !s.impactFired) {
          s.impactFired = true;
          vfx.spawnBurst(s.endX, Math.max(0.2, s.endY), 0.2, 12, burstColor, 8.5, 16, 1.05);
          vfx.spawnRing(s.endX, Math.max(0.2, s.endY), burstColor, 0.25, 2.4, 0.26);
        }
        continue;
      }
      s.mesh.visible = true;
      const t = s.age / s.maxAge;
      const easeOut = 1 - Math.pow(1 - t, 3);
      s.mesh.position.set(
        THREE.MathUtils.lerp(s.startX, s.endX, easeOut),
        THREE.MathUtils.lerp(s.startY, s.endY, easeOut),
        THREE.MathUtils.lerp(s.startZ, s.endZ, easeOut),
      );
      s.mesh.rotation.z = THREE.MathUtils.lerp(s.startRotZ, s.endRotZ, easeOut);
      s.mesh.scale.set(
        THREE.MathUtils.lerp(s.startScaleX, s.endScaleX, easeOut),
        THREE.MathUtils.lerp(s.startScaleY, s.endScaleY, easeOut),
        1,
      );
      // Fast snap-in, smooth fade-out
      const alpha = t < 0.16 ? t / 0.16 : Math.max(0, 1 - (t - 0.16) / 0.84);
      s.material.opacity = alpha * 0.92;
    }
  }

  private resolveWave(
    wave: 1 | 2,
    enemies: EnemyManager,
    level: LevelBuilder,
    vfx: VfxManager,
    audio: ProceduralAudio,
    postPass: PostProcessingPass,
    callbacks: ExecutionCallbacks,
  ): void {
    const meta = BIOME_EXECUTION_META[this.biome];
    const screenRange = wave === 1 ? 18.5 : 19.5;

    postPass.triggerFlash(wave === 2 ? meta.secondaryHex : meta.primaryHex, wave === 2 ? 0.42 : 0.26);
    callbacks.onShake(wave === 2 ? 0.52 : 0.32);

    // Wave 1 shatters all destructible props on screen
    if (wave === 1) {
      for (const prop of level.props) {
        if (prop.destroyed) continue;
        if (Math.abs(prop.x - this.cameraCenterX) <= screenRange) {
          prop.hp = 0;
          prop.destroyed = true;
          level.root.remove(prop.group);
          audio.playBreakProp();
          vfx.spawnBurst(prop.x, prop.y + 0.65, 0.15, 14, meta.primaryHex, 7.2, 16, 1.0);
          callbacks.onPropDestroyed(prop.x, prop.y, prop.kind === 'crystal');
        }
      }
    }

    // Strike all alive enemies currently within screen range
    for (const enemy of enemies.enemies) {
      if (!enemy.alive) continue;
      if (Math.abs(enemy.x - this.cameraCenterX) > screenRange) continue;

      const pushDir = enemy.x >= this.originX ? 1 : -1;

      if (wave === 1) {
        const dmg = Math.round(34 * this.comboMult);
        const defeated = enemies.damageEnemy(
          enemy,
          dmg,
          pushDir * 8.5,
          true,
          vfx,
          audio,
        );
        if (!defeated && enemy.alive) {
          enemies.stunEnemyFromSpell(enemy, 1.35, pushDir * 5.0, vfx);
        }
        vfx.spawnRing(enemy.x, enemy.y + enemy.height * 0.55, meta.primaryHex, 0.25, 2.4, 0.28);
        vfx.spawnBurst(enemy.x, enemy.y + enemy.height * 0.55, 0.25, 14, meta.secondaryHex, 7.8, 10, 1.05);
        callbacks.onEnemyHit({
          enemy,
          defeated,
          executed: false,
          comboGain: 2,
          staminaRefund: defeated ? 12 : 4,
        });
      } else {
        // Wave 2: Coup de Grâce — executes weakened non-boss enemies (< 50% HP) outright!
        const baseFinisherDmg = Math.round(62 * this.comboMult);
        const canExecute =
          enemy.type !== 'boss' && (enemy.hp / enemy.maxHp <= 0.5 || enemy.hp <= baseFinisherDmg);
        const finalDmg = canExecute ? Math.max(baseFinisherDmg, Math.ceil(enemy.hp) + 8) : baseFinisherDmg;

        const defeated = enemies.damageEnemy(
          enemy,
          finalDmg,
          pushDir * 12.0,
          true,
          vfx,
          audio,
          true,
        );

        if (!defeated && enemy.alive) {
          enemies.stunEnemyFromSpell(enemy, 1.65, pushDir * 6.5, vfx);
        }

        vfx.spawnRing(enemy.x, enemy.y + enemy.height * 0.55, meta.secondaryHex, 0.35, 3.5, 0.34);
        vfx.spawnBurst(
          enemy.x,
          enemy.y + enemy.height * 0.55,
          0.25,
          defeated ? 28 : 18,
          meta.primaryHex,
          9.5,
          12,
          1.25,
        );
        if (defeated && canExecute) {
          vfx.spawnFloatingText(enemy.x, enemy.y + enemy.height + 0.55, 'EXECUTED!', meta.accent, 1.38);
        }
        callbacks.onEnemyHit({
          enemy,
          defeated,
          executed: defeated && canExecute,
          comboGain: defeated ? 3 : 2,
          staminaRefund: defeated ? 16 : 6,
        });
      }
    }
  }

  /**
   * Brief cinematic slow-motion time dilation during the Execution impact beats.
   */
  public getTimeScale(): number {
    if (!this.active) return 1.0;
    if (this.elapsed < 0.24) return 0.24;
    if (this.elapsed < 0.62) return 0.48;
    const t = THREE.MathUtils.clamp((this.elapsed - 0.62) / 0.35, 0, 1);
    return THREE.MathUtils.lerp(0.48, 1.0, t);
  }

  /**
   * Dramatic subtle camera zoom-in pulse (negative Z offset) during Execution.
   */
  public getCameraZoomOffset(): number {
    if (!this.active) return 0;
    if (this.elapsed < 0.32) {
      const k = this.elapsed / 0.32;
      return -2.75 * (1 - Math.pow(1 - k, 3));
    }
    const k = THREE.MathUtils.clamp((this.elapsed - 0.32) / (EXECUTION_DURATION - 0.32), 0, 1);
    return -2.75 * (1 - k * k);
  }

  public getHudState(
    biome: BiomeId,
    readyTimer: number,
    maxReadyWindow: number,
  ): ExecutionHudState {
    const meta = BIOME_EXECUTION_META[biome];
    return {
      ready: readyTimer > 0 && !this.active,
      windowTimer: maxReadyWindow > 0 ? THREE.MathUtils.clamp(readyTimer / maxReadyWindow, 0, 1) : 0,
      active: this.active,
      activeProgress: this.active ? THREE.MathUtils.clamp(this.elapsed / EXECUTION_DURATION, 0, 1) : 0,
      moveName: meta.name,
      subtitle: meta.subtitle,
      accent: meta.accent,
    };
  }

  public clear(): void {
    this.active = false;
    this.elapsed = 0;
    this.wave1Fired = false;
    this.wave2Fired = false;
    this.execLight.intensity = 0;
    this.resetAccents();
    for (let i = 0; i < MAX_EXEC_PARTICLES; i++) {
      this.particles[i].active = false;
      _dummy.position.set(0, -120, 0);
      _dummy.scale.set(0, 0, 0);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.clear();
    this.scene.remove(this.root);
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.ribbonGeo.dispose();
    this.lanceGeo.dispose();
    this.haloGeo.dispose();
    for (const s of this.ribbons) s.material.dispose();
    for (const s of this.lances) s.material.dispose();
    for (const s of this.halos) s.material.dispose();
  }
}
