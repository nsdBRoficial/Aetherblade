import * as THREE from 'three';
import { AABB } from './types';
import { EnemyEntity, EnemyManager } from './EnemyManager';
import { LevelBuilder } from './LevelBuilder';
import { PlayerController } from './PlayerController';
import { ProceduralAudio, VfxManager } from './VfxAudio';

type PlayerSpellKind = 'aether-wave' | 'sanctum-orb';

interface PlayerSpellEntity {
  kind: PlayerSpellKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  radiusX: number;
  radiusY: number;
  damage: number;
  heavy: boolean;
  knockbackX: number;
  piercing: boolean;
  fullCharge: boolean;
  age: number;
  maxAge: number;
  trailTimer: number;
  alive: boolean;
  hitEnemyIds: Set<number>;
  group: THREE.Group;
  materials: THREE.Material[];
}

export interface MagicHitEvent {
  enemy: EnemyEntity;
  defeated: boolean;
  heavy: boolean;
  refundStamina: number;
  isSpell: true;
}

export interface MagicUpdateCallbacks {
  onEnemyHit: (ev: MagicHitEvent) => void;
  onPropDestroyed: (x: number, y: number, isCrystal: boolean) => void;
  onProjectileVaporized: (x: number, y: number) => void;
  onScreenPulse: (colorHex: number, flashStrength: number, shake: number) => void;
}

/**
 * Manages concentrated player magic powers:
 * 1. Hold Attack (M1 / J) & Release -> Aether Blade Wave (piercing HDR crescent slash wave;
 *    full charge fires a Twin Supernova Wave!).
 * 2. Hold Block (M2 / K) & Release -> Aegis Nova & Sanctum Orbs (radial shockwave that
 *    vaporizes enemy projectiles & stuns nearby foes + launches homing Sanctum Orbs that
 *    damage enemies, build combo, and refund stamina).
 */
export class PlayerMagicSystem {
  private scene: THREE.Scene;
  private spells: PlayerSpellEntity[] = [];

  // Shared geometries for zero-allocation spawning
  private crescentGeo: THREE.RingGeometry;
  private coreBladeGeo: THREE.RingGeometry;
  private orbCoreGeo: THREE.OctahedronGeometry;
  private orbHaloGeo: THREE.SphereGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.crescentGeo = new THREE.RingGeometry(0.68, 1.38, 22, 1, -Math.PI * 0.44, Math.PI * 0.88);
    this.coreBladeGeo = new THREE.RingGeometry(0.95, 1.24, 20, 1, -Math.PI * 0.36, Math.PI * 0.72);
    this.orbCoreGeo = new THREE.OctahedronGeometry(0.24, 0);
    this.orbHaloGeo = new THREE.SphereGeometry(0.42, 10, 10);
  }

  public castAetherWave(
    player: PlayerController,
    chargeLevel: number,
    comboMult: number,
    vfx: VfxManager,
    audio: ProceduralAudio,
    callbacks: MagicUpdateCallbacks,
  ): void {
    const full = chargeLevel >= 0.95;
    const baseDmg = Math.round((26 + chargeLevel * 28) * comboMult);

    audio.playMagicWave(full);
    vfx.flashLight(
      player.x + player.facing * 1.1,
      player.y + 1.15,
      full ? 0xfacc15 : 0x38bdf8,
      full ? 14 : 9.5,
      full ? 0.28 : 0.2,
    );
    vfx.spawnRing(
      player.x + player.facing * 0.85,
      player.y + 1.1,
      full ? 0xfacc15 : 0x38bdf8,
      0.28,
      full ? 3.2 : 2.2,
      0.26,
    );
    vfx.spawnBurst(
      player.x + player.facing * 0.85,
      player.y + 1.1,
      0.2,
      full ? 24 : 14,
      full ? 0xfde047 : 0x38bdf8,
      8.5,
      8,
      full ? 1.2 : 0.9,
    );
    vfx.spawnFloatingText(
      player.x,
      player.y + 0.85,
      full ? 'SUPERNOVA WAVE!' : 'AETHER WAVE!',
      full ? '#fde047' : '#7dd3fc',
      full ? 1.3 : 1.12,
    );

    callbacks.onScreenPulse(full ? 0xfacc15 : 0x38bdf8, full ? 0.28 : 0.16, full ? 0.34 : 0.18);

    // Primary piercing crescent wave
    this.spawnWaveProjectile(
      player.x + player.facing * 1.1,
      player.y + 1.12,
      player.facing,
      full ? 22.5 : 18.8,
      baseDmg,
      full,
      full ? 1.35 : 0.92 + chargeLevel * 0.28,
      full ? 0xfacc15 : 0x38bdf8,
      full ? 0x7dd3fc : 0xe0f2fe,
    );

    // At 100% full charge, unleash a second trailing twin crescent wave!
    if (full) {
      this.spawnWaveProjectile(
        player.x + player.facing * 0.25,
        player.y + 1.18,
        player.facing,
        20.2,
        Math.round(baseDmg * 0.65),
        true,
        1.1,
        0x38bdf8,
        0xfef08a,
      );
    }
  }

  private spawnWaveProjectile(
    x: number,
    y: number,
    facing: 1 | -1,
    speed: number,
    damage: number,
    fullCharge: boolean,
    scale: number,
    outerHex: number,
    coreHex: number,
  ): void {
    const group = new THREE.Group();
    group.position.set(x, y, 0.24);
    group.scale.set(facing * scale, scale, 1);

    const outerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(outerHex).multiplyScalar(fullCharge ? 2.9 : 2.45),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(coreHex).multiplyScalar(3.1),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const outerMesh = new THREE.Mesh(this.crescentGeo, outerMat);
    const coreMesh = new THREE.Mesh(this.coreBladeGeo, coreMat);
    coreMesh.position.z = 0.04;
    group.add(outerMesh, coreMesh);
    this.scene.add(group);

    this.spells.push({
      kind: 'aether-wave',
      x,
      y,
      vx: facing * speed,
      vy: 0,
      facing,
      radiusX: 1.05 * scale,
      radiusY: 1.25 * scale,
      damage,
      heavy: fullCharge,
      knockbackX: facing * (fullCharge ? 10.5 : 7.0),
      piercing: true,
      fullCharge,
      age: 0,
      maxAge: fullCharge ? 1.25 : 0.95,
      trailTimer: 0,
      alive: true,
      hitEnemyIds: new Set<number>(),
      group,
      materials: [outerMat, coreMat],
    });
  }

  public castAegisNova(
    player: PlayerController,
    chargeLevel: number,
    comboMult: number,
    enemies: EnemyManager,
    vfx: VfxManager,
    audio: ProceduralAudio,
    callbacks: MagicUpdateCallbacks,
  ): void {
    const full = chargeLevel >= 0.95;
    const novaRadius = full ? 5.9 : 4.2 + chargeLevel * 1.1;
    const novaDamage = Math.round((20 + chargeLevel * 22) * comboMult);

    audio.playAegisNova(full);
    vfx.flashLight(player.x, player.y + 1.15, full ? 0xfacc15 : 0xc084fc, full ? 15 : 11, 0.34);
    vfx.spawnRing(player.x, player.y + 1.05, 0xc084fc, 0.35, novaRadius * 1.15, 0.38);
    vfx.spawnRing(
      player.x,
      player.y + 1.05,
      full ? 0xfde047 : 0x7dd3fc,
      0.2,
      novaRadius * 0.88,
      0.3,
    );
    vfx.spawnBurst(
      player.x,
      player.y + 1.05,
      0.2,
      full ? 34 : 20,
      full ? 0xe879f9 : 0xc084fc,
      9.2,
      9,
      full ? 1.25 : 0.95,
    );
    vfx.spawnFloatingText(
      player.x,
      player.y + 0.95,
      full ? 'AEGIS SUPERNOVA!' : 'AEGIS NOVA!',
      full ? '#fde047' : '#e879f9',
      full ? 1.32 : 1.15,
    );

    callbacks.onScreenPulse(full ? 0xe879f9 : 0xa855f7, full ? 0.3 : 0.2, full ? 0.36 : 0.22);

    // 1. Vaporize hostile enemy projectiles inside the Aegis Sanctuary radius
    for (const p of enemies.projectiles) {
      if (!p.alive || p.reflected) continue;
      const dist = Math.hypot(p.x - player.x, p.y - (player.y + 1.0));
      if (dist <= novaRadius + 0.9) {
        p.alive = false;
        vfx.spawnBurst(p.x, p.y, 0.2, 10, 0x7dd3fc, 6, 10, 0.85);
        vfx.spawnFloatingText(p.x, p.y + 0.35, 'NULLIFIED!', '#7dd3fc', 0.95);
        callbacks.onProjectileVaporized(p.x, p.y);
      }
    }

    // 2. Radial blast knocks back, damages & stuns nearby enemies
    for (const enemy of enemies.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y + enemy.height * 0.5 - (player.y + 1.0);
      const dist = Math.hypot(dx, dy);
      if (dist <= novaRadius) {
        const pushDir = dx >= 0 ? 1 : -1;
        const defeated = enemies.damageEnemy(
          enemy,
          novaDamage,
          pushDir * (full ? 11.5 : 8.5),
          true,
          vfx,
          audio,
        );
        if (!defeated && enemy.alive) {
          enemies.stunEnemyFromSpell(enemy, full ? 1.55 : 1.05, pushDir * 6.5, vfx);
        }
        callbacks.onEnemyHit({
          enemy,
          defeated,
          heavy: true,
          refundStamina: 6,
          isSpell: true,
        });
      }
    }

    // 3. Launch 3 (or 5 at 100% charge) homing Sanctum Orbs that hunt down foes!
    const orbCount = full ? 5 : 3;
    const orbDmg = Math.round((16 + chargeLevel * 10) * comboMult);
    for (let i = 0; i < orbCount; i++) {
      const spreadT = i / (orbCount - 1) - 0.5;
      const launchAngle = Math.PI * 0.5 - player.facing * (0.48 + spreadT * 0.72);
      const spd = 8.2 + Math.abs(spreadT) * 2.2;
      this.spawnSanctumOrb(
        player.x + player.facing * 0.35,
        player.y + 1.35,
        Math.cos(launchAngle) * spd,
        Math.sin(launchAngle) * spd,
        player.facing,
        orbDmg,
        full,
      );
    }
  }

  private spawnSanctumOrb(
    x: number,
    y: number,
    vx: number,
    vy: number,
    facing: 1 | -1,
    damage: number,
    fullCharge: boolean,
  ): void {
    const group = new THREE.Group();
    group.position.set(x, y, 0.22);

    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(fullCharge ? 0xfef08a : 0xf5d0fe).multiplyScalar(3.0),
      toneMapped: false,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(fullCharge ? 0xe879f9 : 0xa855f7).multiplyScalar(2.4),
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const core = new THREE.Mesh(this.orbCoreGeo, coreMat);
    const halo = new THREE.Mesh(this.orbHaloGeo, haloMat);
    group.add(core, halo);
    this.scene.add(group);

    this.spells.push({
      kind: 'sanctum-orb',
      x,
      y,
      vx,
      vy,
      facing,
      radiusX: 0.44,
      radiusY: 0.44,
      damage,
      heavy: false,
      knockbackX: facing * 4.8,
      piercing: false,
      fullCharge,
      age: 0,
      maxAge: 2.35,
      trailTimer: 0,
      alive: true,
      hitEnemyIds: new Set<number>(),
      group,
      materials: [coreMat, haloMat],
    });
  }

  public update(
    dt: number,
    enemies: EnemyManager,
    level: LevelBuilder,
    vfx: VfxManager,
    audio: ProceduralAudio,
    callbacks: MagicUpdateCallbacks,
  ): void {
    for (let i = this.spells.length - 1; i >= 0; i--) {
      const s = this.spells[i];
      s.age += dt;
      if (!s.alive || s.age >= s.maxAge) {
        this.removeSpellAt(i);
        continue;
      }

      if (s.kind === 'sanctum-orb') {
        // Gentle homing lock onto nearest alive enemy within 19 units after brief 0.14s launch arc
        if (s.age > 0.14) {
          let bestTarget: EnemyEntity | null = null;
          let bestDist = 19.5;
          for (const e of enemies.enemies) {
            if (!e.alive) continue;
            const d = Math.hypot(e.x - s.x, e.y + e.height * 0.55 - s.y);
            if (d < bestDist) {
              bestDist = d;
              bestTarget = e;
            }
          }
          if (bestTarget) {
            const tx = bestTarget.x - s.x;
            const ty = bestTarget.y + bestTarget.height * 0.55 - s.y;
            const len = Math.hypot(tx, ty) || 1;
            const desiredSpeed = s.fullCharge ? 17.5 : 15.2;
            const steer = 1 - Math.exp(-7.5 * dt);
            s.vx = THREE.MathUtils.lerp(s.vx, (tx / len) * desiredSpeed, steer);
            s.vy = THREE.MathUtils.lerp(s.vy, (ty / len) * desiredSpeed, steer);
          } else {
            // Cruise gracefully forward if no foes nearby
            const steer = 1 - Math.exp(-4.0 * dt);
            s.vx = THREE.MathUtils.lerp(s.vx, s.facing * 13.5, steer);
            s.vy = THREE.MathUtils.lerp(s.vy, 0, steer);
          }
        }
        s.group.rotation.z += dt * 9.5;
        s.group.rotation.y += dt * 7.0;
      } else {
        // Aether Blade Wave pulses subtly as it tears across the lane
        const pulse = 1 + Math.sin(s.age * 32) * 0.06;
        const baseScale = s.fullCharge ? 1.32 : 1.05;
        s.group.scale.set(s.facing * baseScale * pulse, baseScale * pulse, 1);
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.group.position.set(s.x, s.y, s.kind === 'aether-wave' ? 0.24 : 0.22);

      // Luminous trail sparks
      s.trailTimer -= dt;
      if (s.trailTimer <= 0) {
        s.trailTimer = s.kind === 'aether-wave' ? 0.036 : 0.06;
        vfx.spawnBurst(
          s.x - Math.sign(s.vx || s.facing) * 0.25,
          s.y + (Math.random() - 0.5) * (s.kind === 'aether-wave' ? 1.1 : 0.2),
          0.18,
          s.kind === 'aether-wave' ? 2 : 1,
          s.kind === 'aether-wave'
            ? s.fullCharge
              ? 0xfde047
              : 0x38bdf8
            : s.fullCharge
              ? 0xfde047
              : 0xd946ef,
          2.2,
          2,
          0.55,
        );
      }

      const spellBox: AABB = {
        x: s.x,
        y: s.y - s.radiusY,
        width: s.radiusX * 2,
        height: s.radiusY * 2,
      };

      // 1. Destructible props (Aether Wave slices barrels & crystals cleanly)
      for (const prop of level.props) {
        if (prop.destroyed) continue;
        if (
          Math.abs(spellBox.x - prop.x) < (spellBox.width + prop.width) * 0.5 &&
          spellBox.y < prop.y + prop.height &&
          spellBox.y + spellBox.height > prop.y
        ) {
          prop.hp = 0;
          prop.destroyed = true;
          level.root.remove(prop.group);
          audio.playBreakProp();
          const burstColor = prop.kind === 'crystal' ? level.palette.torchColor : 0xb5834a;
          vfx.spawnBurst(prop.x, prop.y + 0.6, 0.1, 14, burstColor, 6.2, 18, 0.9);
          callbacks.onPropDestroyed(prop.x, prop.y, prop.kind === 'crystal');
          if (!s.piercing) {
            s.alive = false;
            break;
          }
        }
      }
      if (!s.alive) {
        this.removeSpellAt(i);
        continue;
      }

      // 2. Enemy & Boss collisions
      for (const enemy of enemies.enemies) {
        if (!enemy.alive || s.hitEnemyIds.has(enemy.id)) continue;
        const eh = enemies.getEnemyHurtbox(enemy);
        const overlaps =
          Math.abs(spellBox.x - eh.x) < (spellBox.width + eh.width) * 0.5 &&
          spellBox.y < eh.y + eh.height &&
          spellBox.y + spellBox.height > eh.y;
        if (overlaps) {
          s.hitEnemyIds.add(enemy.id);
          const kb = Math.sign(s.vx || s.facing) * Math.abs(s.knockbackX);
          const defeated = enemies.damageEnemy(enemy, s.damage, kb, s.heavy, vfx, audio);
          vfx.spawnRing(
            enemy.x,
            enemy.y + enemy.height * 0.55,
            s.kind === 'aether-wave' ? 0x38bdf8 : 0xe879f9,
            0.22,
            s.heavy ? 2.1 : 1.45,
            0.22,
          );
          callbacks.onEnemyHit({
            enemy,
            defeated,
            heavy: s.heavy,
            refundStamina: s.kind === 'sanctum-orb' ? 7 : 0,
            isSpell: true,
          });
          if (!s.piercing) {
            s.alive = false;
            break;
          }
        }
      }

      if (!s.alive) {
        this.removeSpellAt(i);
      }
    }
  }

  private removeSpellAt(index: number): void {
    const s = this.spells[index];
    this.scene.remove(s.group);
    for (const m of s.materials) m.dispose();
    this.spells.splice(index, 1);
  }

  public clear(): void {
    for (const s of this.spells) {
      this.scene.remove(s.group);
      for (const m of s.materials) m.dispose();
    }
    this.spells = [];
  }

  public dispose(): void {
    this.clear();
    this.crescentGeo.dispose();
    this.coreBladeGeo.dispose();
    this.orbCoreGeo.dispose();
    this.orbHaloGeo.dispose();
  }
}
