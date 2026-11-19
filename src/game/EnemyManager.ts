import * as THREE from 'three';
import {
  AABB,
  BiomePalette,
  BOSS_ARENA_MAX_X,
  BOSS_ARENA_MIN_X,
  EnemyType,
} from './types';
import { LevelBuilder } from './LevelBuilder';
import { PlayerController } from './PlayerController';
import { ProceduralAudio, VfxManager } from './VfxAudio';
import {
  buildFallbackEnemyTexture,
  loadAndProcessEnemyAtlas,
  SheetSliceConfig,
} from './SpriteAtlasProcessor';

const ENEMY_SHEET_CONFIGS: Record<EnemyType, SheetSliceConfig> = {
  grunt: {
    url: '/src/assets/images/enemy_goblin_grunt_1795046235672.jpg',
    cols: 4,
    rows: 2,
    // Crop cleanly above bottom text labels in both rows
    rowBands: [
      [0.02, 0.43],
      [0.52, 0.9],
    ],
    cellW: 192,
    cellH: 192,
    footMargin: 6,
    bgTolerance: 32,
  },
  ranger: {
    url: '/src/assets/images/enemy_skeleton_ranger_1795046236265.jpg',
    cols: 4,
    rows: 2,
    // Crop cleanly above text labels
    rowBands: [
      [0.035, 0.46],
      [0.505, 0.922],
    ],
    cellW: 192,
    cellH: 192,
    footMargin: 6,
    bgTolerance: 32,
  },
  flyer: {
    url: '/src/assets/images/enemy_imp_flyer_1795046235791.jpg',
    cols: 4,
    rows: 2,
    rowBands: [
      [0.015, 0.48],
      [0.5, 0.98],
    ],
    cellW: 204,
    cellH: 184,
    footMargin: 10,
    bgTolerance: 32,
  },
  brute: {
    url: '/src/assets/images/enemy_golem_brute_1795046234970.jpg',
    cols: 4,
    rows: 2,
    rowBands: [
      [0.015, 0.48],
      [0.495, 0.98],
    ],
    cellW: 216,
    cellH: 196,
    footMargin: 6,
    bgTolerance: 30,
  },
  boss: {
    url: '/src/assets/images/enemy_boss_overlord_1795046233981.jpg',
    cols: 4,
    rows: 2,
    rowBands: [
      [0.01, 0.47],
      [0.49, 0.975],
    ],
    cellW: 248,
    cellH: 224,
    footMargin: 6,
    bgTolerance: 30,
    ignoreIsolatedBottomShadow: true,
  },
};

const ENEMY_FALLBACK_COLORS: Record<EnemyType, string> = {
  grunt: '#4d9e3f',
  ranger: '#7e3af2',
  flyer: '#dc2626',
  brute: '#64748b',
  boss: '#b91c1c',
};

const ENEMY_VISUAL_SCALES: Record<EnemyType, { w: number; h: number; yOff: number }> = {
  grunt: { w: 2.55, h: 2.4, yOff: -0.05 },
  ranger: { w: 2.5, h: 2.45, yOff: -0.05 },
  flyer: { w: 2.6, h: 2.25, yOff: -0.25 },
  brute: { w: 3.55, h: 3.25, yOff: -0.06 },
  boss: { w: 4.85, h: 4.45, yOff: -0.08 },
};

export interface EnemyEntity {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  dyingTimer: number; // Brief lingering defeated sprite pose before disappearing
  homeX: number;
  homeY: number;

  // AI state machine
  aiState:
    | 'patrol'
    | 'chase'
    | 'windup'
    | 'attack'
    | 'recover'
    | 'stunned'
    | 'leap'
    | 'dash'
    | 'dead';
  stateTimer: number;
  attackCooldown: number;
  bossAttackKind: 'dash' | 'slam' | 'volley';
  bossPhase: 1 | 2;
  didDealAttackHit: boolean;
  lastHitByAttackId: number;
  hitFlashTimer: number;
  animTimer: number;
  squashX: number;
  squashY: number;

  // Visual illustrated sprite card
  group: THREE.Group;
  spriteMesh: THREE.Mesh;
  spriteMat: THREE.MeshBasicMaterial;
  spriteTex: THREE.Texture;
  shadowMesh: THREE.Mesh;
  telegraphHalo: THREE.Mesh;
  telegraphMat: THREE.MeshBasicMaterial;
  hpBarBg?: THREE.Mesh;
  hpBarFill?: THREE.Mesh;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  reflected: boolean;
  isGroundWave: boolean;
  age: number;
  maxAge: number;
  alive: boolean;
  mesh: THREE.Group;
  coreMat: THREE.MeshBasicMaterial;
}

function createShadowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.52)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class EnemyManager {
  public enemies: EnemyEntity[] = [];
  public projectiles: Projectile[] = [];
  public boss: EnemyEntity | null = null;
  public bossTriggered = false;
  public bossDefeated = false;

  private scene: THREE.Scene;
  private palette: BiomePalette;
  private baseAtlases: Record<EnemyType, THREE.CanvasTexture>;
  private shadowTex: THREE.CanvasTexture;
  private spriteGeo: THREE.PlaneGeometry;
  private shadowGeo: THREE.PlaneGeometry;
  private nextId = 1;
  private nextProjId = 1;
  private disposed = false;

  private sharedGeos: THREE.BufferGeometry[] = [];
  private sharedMats: THREE.Material[] = [];

  constructor(scene: THREE.Scene, palette: BiomePalette) {
    this.scene = scene;
    this.palette = palette;
    this.shadowTex = createShadowTex();
    this.spriteGeo = new THREE.PlaneGeometry(1, 1);
    this.shadowGeo = new THREE.PlaneGeometry(1.7, 0.6);

    // Initialize immediate fallback atlases and kick off async processing of the 5 bespoke sheets
    this.baseAtlases = {
      grunt: buildFallbackEnemyTexture(ENEMY_FALLBACK_COLORS.grunt),
      ranger: buildFallbackEnemyTexture(ENEMY_FALLBACK_COLORS.ranger),
      flyer: buildFallbackEnemyTexture(ENEMY_FALLBACK_COLORS.flyer),
      brute: buildFallbackEnemyTexture(ENEMY_FALLBACK_COLORS.brute),
      boss: buildFallbackEnemyTexture(ENEMY_FALLBACK_COLORS.boss),
    };

    (Object.keys(ENEMY_SHEET_CONFIGS) as EnemyType[]).forEach((type) => {
      loadAndProcessEnemyAtlas(ENEMY_SHEET_CONFIGS[type], (loadedTex) => {
        if (this.disposed) {
          loadedTex.dispose();
          return;
        }
        const prev = this.baseAtlases[type];
        this.baseAtlases[type] = loadedTex;
        // Hot-swap texture on all spawned enemies of this type seamlessly
        for (const e of this.enemies) {
          if (e.type === type) {
            const oldClone = e.spriteTex;
            const nextClone = loadedTex.clone();
            nextClone.needsUpdate = true;
            nextClone.repeat.set(1 / 4, 1 / 2);
            e.spriteTex = nextClone;
            e.spriteMat.map = nextClone;
            e.spriteMat.needsUpdate = true;
            oldClone.dispose();
          }
        }
        prev.dispose();
      });
    });
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.sharedGeos.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.sharedMats.push(m);
    return m;
  }

  public setPalette(palette: BiomePalette): void {
    this.palette = palette;
  }

  public spawnStageWave(): void {
    this.clearAll();
    this.bossTriggered = false;
    this.bossDefeated = false;

    // Zone 1 (X: 0..45) — Goblin Grunts + first Skeleton Ranger on platform
    this.spawnEnemy('grunt', 16, 0);
    this.spawnEnemy('grunt', 28, 0);
    this.spawnEnemy('ranger', 38.5, 2.8);
    this.spawnEnemy('grunt', 43, 0);

    // Zone 2 (X: 45..95) — Winged Imps, Skeleton Archers & Goblins
    this.spawnEnemy('grunt', 51, 0);
    this.spawnEnemy('flyer', 59, 5.2);
    this.spawnEnemy('ranger', 69.2, 4.9);
    this.spawnEnemy('grunt', 72, 0);
    this.spawnEnemy('flyer', 81, 5.6);
    this.spawnEnemy('ranger', 88.4, 5.1);
    this.spawnEnemy('grunt', 90, 0);

    // Zone 3 (X: 95..145) — Mossy Stone Golem Brutes + mixed ambush
    this.spawnEnemy('brute', 101, 0);
    this.spawnEnemy('flyer', 109, 5.2);
    this.spawnEnemy('ranger', 119.5, 4.6);
    this.spawnEnemy('grunt', 117, 0);
    this.spawnEnemy('brute', 124.5, 0);
    this.spawnEnemy('flyer', 134, 5.4);
    this.spawnEnemy('grunt', 140, 0);

    // Zone 4 (X: 150..180) — Dark Dragon-Knight Overlord Boss
    this.boss = this.spawnEnemy('boss', 171, 0);
  }

  private spawnEnemy(type: EnemyType, x: number, y: number): EnemyEntity {
    const group = new THREE.Group();
    group.position.set(x, y, 0);

    const clonedTex = this.baseAtlases[type].clone();
    clonedTex.needsUpdate = true;
    clonedTex.repeat.set(1 / 4, 1 / 2);
    clonedTex.offset.set(0, 0.5);

    const spriteMat = new THREE.MeshBasicMaterial({
      map: clonedTex,
      transparent: true,
      alphaTest: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const vis = ENEMY_VISUAL_SCALES[type];
    const spriteMesh = new THREE.Mesh(this.spriteGeo, spriteMat);
    spriteMesh.position.set(0, vis.h * 0.5 + vis.yOff, 0.06);
    spriteMesh.scale.set(-vis.w, vis.h, 1);
    spriteMesh.renderOrder = type === 'boss' ? 6 : 4;
    group.add(spriteMesh);

    // Grounded soft radial contact shadow
    const shadowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: type === 'flyer' ? 0.32 : 0.65,
      }),
    );
    const shadowMesh = new THREE.Mesh(this.shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI * 0.5;
    const shScale = type === 'boss' ? 2.1 : type === 'brute' ? 1.5 : 1.0;
    shadowMesh.scale.set(shScale, shScale, 1);
    shadowMesh.position.set(0, 0.03, 0);
    group.add(shadowMesh);

    let width = 1.15;
    let height = 1.85;
    let maxHp = 48;
    if (type === 'ranger') {
      width = 1.05;
      height = 1.85;
      maxHp = 38;
    } else if (type === 'flyer') {
      width = 1.25;
      height = 1.25;
      maxHp = 36;
    } else if (type === 'brute') {
      width = 1.85;
      height = 2.65;
      maxHp = 110;
    } else if (type === 'boss') {
      width = 2.35;
      height = 3.85;
      maxHp = 440;
    }

    // Windup telegraph glow halo
    const telegraphMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff453a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const telegraphHalo = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(width * 0.55, width * 0.85, 22)),
      telegraphMat,
    );
    telegraphHalo.position.set(0, height * 0.55, 0.25);
    telegraphHalo.renderOrder = 7;
    group.add(telegraphHalo);

    // Overhead mini HP bar for standard monsters
    let hpBarBg: THREE.Mesh | undefined;
    let hpBarFill: THREE.Mesh | undefined;
    if (type !== 'boss') {
      const bgMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0x0f172a }));
      const fillMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      hpBarBg = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(1.25, 0.14)), bgMat);
      hpBarBg.position.set(0, height + 0.45, 0.22);
      hpBarBg.visible = false;
      hpBarFill = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(1.18, 0.09)), fillMat);
      hpBarFill.position.set(0, height + 0.45, 0.24);
      hpBarFill.visible = false;
      group.add(hpBarBg, hpBarFill);
    }

    this.scene.add(group);

    const entity: EnemyEntity = {
      id: this.nextId++,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      facing: -1,
      width,
      height,
      hp: maxHp,
      maxHp,
      alive: true,
      dyingTimer: 0,
      homeX: x,
      homeY: y,
      aiState: 'patrol',
      stateTimer: 0.6 + Math.random() * 0.8,
      attackCooldown: 0.8 + Math.random() * 0.7,
      bossAttackKind: 'dash',
      bossPhase: 1,
      didDealAttackHit: false,
      lastHitByAttackId: -1,
      hitFlashTimer: 0,
      animTimer: Math.random() * 4,
      squashX: 1,
      squashY: 1,
      group,
      spriteMesh,
      spriteMat,
      spriteTex: clonedTex,
      shadowMesh,
      telegraphHalo,
      telegraphMat,
      hpBarBg,
      hpBarFill,
    };

    this.enemies.push(entity);
    return entity;
  }

  private setEnemyFrame(e: EnemyEntity, col: number, row: number): void {
    e.spriteTex.repeat.set(1 / 4, 1 / 2);
    e.spriteTex.offset.set(col / 4, 1 - (row + 1) / 2);
  }

  private updateEnemySpriteAnimation(e: EnemyEntity, dt: number): void {
    e.animTimer += dt;

    // Select crisp illustrated pose from each monster's 4x2 spritesheet
    if (e.aiState === 'dead') {
      // Row 1 Col 3: Defeated lying on ground / pile of bones / crumbled golem
      this.setEnemyFrame(e, e.type === 'boss' ? 0 : 3, e.type === 'boss' ? 0 : 1);
      return;
    }

    if (e.aiState === 'stunned' || e.hitFlashTimer > 0) {
      if (e.type === 'flyer' && e.aiState === 'stunned') {
        this.setEnemyFrame(e, 3, 1); // Dizzy stunned spiral imp!
      } else if (e.type === 'boss') {
        this.setEnemyFrame(e, 1, 0);
      } else {
        this.setEnemyFrame(e, 2, 1); // Recoil hurt stagger frame!
      }
      return;
    }

    if (e.type === 'boss') {
      if (e.aiState === 'windup') {
        this.setEnemyFrame(e, e.bossAttackKind === 'volley' ? 3 : 0, 1);
      } else if (e.aiState === 'dash') {
        this.setEnemyFrame(e, 1, 1); // Colossal blazing horizontal slash arc!
      } else if (e.aiState === 'leap') {
        this.setEnemyFrame(e, 2, 1); // Leaping overhead greatsword slam!
      } else if (e.aiState === 'recover' && e.bossAttackKind === 'volley') {
        this.setEnemyFrame(e, 3, 1); // Casting floating fireballs!
      } else if (Math.abs(e.vx) > 0.6) {
        const step = Math.floor(e.animTimer * 6.5) % 2;
        this.setEnemyFrame(e, 2 + step, 0); // Heavy marching strides
      } else {
        const idleIdx = e.bossPhase === 2 ? 1 : Math.floor(e.animTimer * 2.5) % 2;
        this.setEnemyFrame(e, idleIdx, 0);
      }
      return;
    }

    if (e.type === 'flyer') {
      if (e.aiState === 'windup') {
        this.setEnemyFrame(e, 0, 1); // Fiery dive windup!
      } else if (e.aiState === 'attack') {
        this.setEnemyFrame(e, 1, 1); // Fast swooping claw lunge!
      } else {
        const flap = Math.floor(e.animTimer * 10) % 4;
        this.setEnemyFrame(e, flap, 0); // 4-frame wing flap cycle!
      }
      return;
    }

    if (e.type === 'brute') {
      if (e.aiState === 'windup') {
        this.setEnemyFrame(e, 0, 1); // Overhead rune warhammer windup!
      } else if (e.aiState === 'attack' || e.aiState === 'recover') {
        this.setEnemyFrame(e, e.aiState === 'attack' ? 1 : 3, e.aiState === 'attack' ? 1 : 0);
      } else if (Math.abs(e.vx) > 0.5) {
        const stride = Math.floor(e.animTimer * 5.2) % 2;
        this.setEnemyFrame(e, 1 + stride, 0);
      } else {
        this.setEnemyFrame(e, Math.floor(e.animTimer * 2) % 2 === 0 ? 0 : 3, 0);
      }
      return;
    }

    if (e.type === 'ranger') {
      if (e.aiState === 'windup') {
        this.setEnemyFrame(e, 0, 1); // Drawing glowing magenta magic arrow!
      } else if (e.aiState === 'recover') {
        this.setEnemyFrame(e, 1, 1); // Releasing arrow shot!
      } else if (Math.abs(e.vx) > 0.5) {
        const step = Math.floor(e.animTimer * 6.5) % 2;
        this.setEnemyFrame(e, 2 + step, 0);
      } else {
        this.setEnemyFrame(e, Math.floor(e.animTimer * 3) % 2, 0);
      }
      return;
    }

    // Goblin Grunt
    if (e.aiState === 'windup') {
      this.setEnemyFrame(e, 0, 1); // Axe raised overhead windup!
    } else if (e.aiState === 'attack') {
      this.setEnemyFrame(e, 1, 1); // Fiery orange downward axe slash arc!
    } else if (Math.abs(e.vx) > 0.5) {
      const stride = Math.floor(e.animTimer * 8.5) % 2;
      this.setEnemyFrame(e, 2 + stride, 0); // Running strides!
    } else {
      this.setEnemyFrame(e, Math.floor(e.animTimer * 3.5) % 2, 0);
    }
  }

  public getEnemyHurtbox(e: EnemyEntity): AABB {
    return {
      x: e.x,
      y: e.y,
      width: e.width,
      height: e.height,
    };
  }

  public damageEnemy(
    e: EnemyEntity,
    amount: number,
    knockbackX: number,
    heavy: boolean,
    vfx: VfxManager,
    audio: ProceduralAudio,
    isReflected = false,
  ): boolean {
    if (!e.alive) return false;

    e.hp = Math.max(0, e.hp - amount);
    e.hitFlashTimer = 0.12;
    e.squashX = 0.84;
    e.squashY = 1.18;
    const kbScale = e.type === 'boss' ? 0.14 : e.type === 'brute' ? 0.35 : 1.0;
    e.vx = knockbackX * kbScale;
    if (e.type !== 'flyer' && e.type !== 'boss') {
      e.vy = heavy ? 4.4 : 2.3;
    }

    if (isReflected) {
      e.aiState = 'stunned';
      e.stateTimer = e.type === 'boss' ? 1.15 : 1.65;
    } else if (heavy && e.type !== 'boss' && e.type !== 'brute') {
      e.aiState = 'stunned';
      e.stateTimer = 0.45;
    }

    if (e.hpBarBg && e.hpBarFill) {
      e.hpBarBg.visible = true;
      e.hpBarFill.visible = true;
      const ratio = Math.max(0.001, e.hp / e.maxHp);
      e.hpBarFill.scale.x = ratio;
      e.hpBarFill.position.x = -(1 - ratio) * 0.59;
    }

    audio.playHit(heavy || isReflected);
    vfx.spawnBurst(
      e.x,
      e.y + e.height * 0.55,
      0.2,
      heavy || isReflected ? 18 : 10,
      isReflected ? 0x60a5fa : heavy ? 0xfacc15 : 0x7dd3fc,
      heavy ? 7.5 : 5.5,
      16,
      heavy ? 1.15 : 0.85,
    );

    const label = isReflected
      ? `COUNTER -${amount}!`
      : heavy
        ? `CRIT -${amount}!`
        : `-${amount}`;
    const color = isReflected ? '#60a5fa' : heavy ? '#fde047' : '#ffffff';
    vfx.spawnFloatingText(e.x, e.y + e.height * 0.6, label, color, heavy || isReflected ? 1.25 : 1.0);

    // Boss Phase 2 at <= 50% HP
    if (e.type === 'boss' && e.bossPhase === 1 && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
      e.bossPhase = 2;
      audio.playBossRoar();
      vfx.flashLight(e.x, e.y + 2.2, 0xf97316, 14, 0.35);
      vfx.spawnRing(e.x, e.y + 2.0, 0xf97316, 0.5, 5.2, 0.42);
      vfx.spawnFloatingText(e.x, e.y + 3.2, 'ENRAGED!', '#fb923c', 1.45);
    }

    if (e.hp <= 0) {
      e.alive = false;
      e.aiState = 'dead';
      e.dyingTimer = e.type === 'boss' ? 1.2 : 0.75;
      e.telegraphMat.opacity = 0;
      if (e.hpBarBg) e.hpBarBg.visible = false;
      if (e.hpBarFill) e.hpBarFill.visible = false;

      vfx.spawnBurst(
        e.x,
        e.y + e.height * 0.5,
        0.15,
        e.type === 'boss' ? 56 : 22,
        e.type === 'boss' ? 0xf59e0b : 0xf87171,
        e.type === 'boss' ? 11 : 7,
        14,
        e.type === 'boss' ? 1.65 : 1.0,
      );
      if (e.type === 'boss') {
        this.bossDefeated = true;
        audio.playBossDefeat();
        vfx.flashLight(e.x, e.y + 2, 0xf59e0b, 16, 0.55);
        vfx.spawnRing(e.x, e.y + 1.8, 0xfacc15, 0.4, 7.5, 0.55);
      }
      return true;
    }

    return false;
  }

  public stunEnemyFromParry(e: EnemyEntity, vfx: VfxManager): void {
    e.aiState = 'stunned';
    e.stateTimer = e.type === 'boss' ? 1.35 : 1.85;
    e.vx = -e.facing * (e.type === 'boss' ? 3.2 : 6.4);
    e.telegraphMat.opacity = 0;
    e.squashX = 0.82;
    e.squashY = 1.2;
    vfx.spawnFloatingText(e.x, e.y + e.height + 0.2, 'STUNNED!', '#38bdf8', 1.15);
  }

  private spawnProjectile(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    isGroundWave = false,
    colorHex?: number,
  ): void {
    const grp = new THREE.Group();
    grp.position.set(x, y, 0.15);

    const coreColor = colorHex ?? (isGroundWave ? 0xf97316 : 0xe879f9);
    const coreMat = this.trackMat(new THREE.MeshBasicMaterial({ color: coreColor }));
    const glowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: isGroundWave ? 0xfde047 : 0xf5d0fe,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    if (isGroundWave) {
      const wave = new THREE.Mesh(this.trackGeo(new THREE.ConeGeometry(0.45, 1.35, 6)), coreMat);
      wave.position.y = 0.65;
      const halo = new THREE.Mesh(this.trackGeo(new THREE.ConeGeometry(0.64, 1.55, 6)), glowMat);
      halo.position.y = 0.65;
      grp.add(wave, halo);
    } else {
      const bolt = new THREE.Mesh(this.trackGeo(new THREE.OctahedronGeometry(0.28, 0)), coreMat);
      bolt.scale.set(1.8, 0.75, 0.75);
      const halo = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.44, 8, 8)), glowMat);
      grp.add(bolt, halo);
    }

    this.scene.add(grp);
    this.projectiles.push({
      id: this.nextProjId++,
      x,
      y,
      vx,
      vy,
      radius: isGroundWave ? 0.58 : 0.36,
      damage,
      reflected: false,
      isGroundWave,
      age: 0,
      maxAge: 3.4,
      alive: true,
      mesh: grp,
      coreMat,
    });
  }

  public update(
    dt: number,
    elapsed: number,
    player: PlayerController,
    level: LevelBuilder,
    vfx: VfxManager,
    audio: ProceduralAudio,
    onPlayerHitResult: (res: 'parried' | 'guarded' | 'hit', heavy: boolean) => void,
  ): void {
    const playerHurt = player.getHurtbox();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const vis = ENEMY_VISUAL_SCALES[e.type];

      // Animate defeated linger & fade-out before removal
      if (!e.alive) {
        if (e.dyingTimer > 0) {
          e.dyingTimer -= dt;
          e.vx *= Math.max(0, 1 - 10 * dt);
          e.x += e.vx * dt;
          if (e.type !== 'flyer') {
            e.vy -= 34 * dt;
            e.y += e.vy * dt;
            const gY = level.getGroundHeightAt(e.x);
            if (gY !== null && e.y < gY) {
              e.y = gY;
              e.vy = 0;
            }
          }
          this.updateEnemySpriteAnimation(e, dt);
          e.group.position.set(e.x, e.y, 0);
          e.spriteMat.opacity = Math.max(0, Math.min(1, e.dyingTimer / 0.55));
          if (e.dyingTimer <= 0) {
            this.scene.remove(e.group);
          }
        }
        continue;
      }

      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
        e.spriteMat.color.setHex(0xffb4b4);
      } else if (e.type === 'boss' && e.bossPhase === 2) {
        e.spriteMat.color.setHex(0xffe0cc);
      } else {
        e.spriteMat.color.setHex(0xffffff);
      }

      if (e.attackCooldown > 0) e.attackCooldown = Math.max(0, e.attackCooldown - dt);

      const dx = player.x - e.x;
      const dist = Math.abs(dx);
      const dy = player.y - e.y;

      if (e.type === 'boss' && !this.bossTriggered) {
        this.updateEnemySpriteAnimation(e, dt);
        e.group.position.set(e.x, e.y, 0);
        continue;
      }
      if (e.type !== 'boss' && dist > 26) continue;

      if (e.aiState === 'stunned') {
        e.stateTimer -= dt;
        e.vx *= Math.max(0, 1 - 7 * dt);
        e.telegraphMat.opacity = 0;
        if (e.stateTimer <= 0) {
          e.aiState = 'chase';
          e.attackCooldown = 0.65;
        }
      } else if (e.type === 'boss') {
        this.updateBossAI(dt, elapsed, e, player, dx, dist, vfx, audio, onPlayerHitResult);
      } else if (e.type === 'flyer') {
        this.updateFlyerAI(dt, elapsed, e, player, dx, dy, dist, vfx, audio, onPlayerHitResult);
      } else if (e.type === 'ranger') {
        this.updateRangerAI(dt, e, player, dx, dist, vfx);
      } else {
        this.updateMeleeAI(dt, elapsed, e, player, dx, dist, vfx, audio, onPlayerHitResult);
      }

      // Grounding physics for non-flyers
      if (e.type !== 'flyer') {
        e.vy -= 36 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;

        if (e.type === 'boss') {
          e.x = THREE.MathUtils.clamp(e.x, BOSS_ARENA_MIN_X + 1.8, BOSS_ARENA_MAX_X - 1.8);
        } else {
          const aheadGround = level.getGroundHeightAt(e.x + Math.sign(e.vx) * 0.6);
          if (aheadGround === null && e.y <= 0.1 && e.aiState !== 'stunned') {
            e.vx = -e.vx * 0.4;
          }
        }

        let landed = false;
        if (e.vy <= 0) {
          for (const plat of level.platforms) {
            if (
              Math.abs(e.x - plat.x) <= plat.width * 0.5 &&
              e.y >= plat.y - 0.35 &&
              e.y <= plat.y + 0.15
            ) {
              e.y = plat.y;
              e.vy = 0;
              landed = true;
              break;
            }
          }
          if (!landed) {
            const gY = level.getGroundHeightAt(e.x);
            if (gY !== null && e.y <= gY) {
              e.y = gY;
              e.vy = 0;
            }
          }
        }
        if (e.y < -10) {
          e.alive = false;
          e.dyingTimer = 0;
          this.scene.remove(e.group);
          continue;
        }
      } else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }

      // Squash & stretch damping + sprite UV frame sync
      const damp = 1 - Math.exp(-14 * dt);
      e.squashX = THREE.MathUtils.lerp(e.squashX, 1, damp);
      e.squashY = THREE.MathUtils.lerp(e.squashY, 1, damp);

      this.updateEnemySpriteAnimation(e, dt);

      e.group.position.set(e.x, e.y, 0);
      e.spriteMesh.scale.set(e.facing * vis.w * e.squashX, vis.h * e.squashY, 1);
      e.spriteMesh.position.y = vis.h * e.squashY * 0.5 + vis.yOff;

      // Ground contact shadow height tracking for flyers & jumping boss
      if (e.type === 'flyer') {
        const gY = level.getGroundHeightAt(e.x);
        e.shadowMesh.visible = gY !== null;
        if (gY !== null) {
          e.shadowMesh.position.y = gY - e.y + 0.03;
        }
      } else {
        e.shadowMesh.position.y = Math.max(-e.y + 0.03, 0.03 - Math.max(0, e.y - 0.1));
      }
    }

    // Update projectiles & Parry Reflection
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      if (!p.alive || p.age >= p.maxAge) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.mesh.position.set(p.x, p.y, 0.15);
      if (!p.isGroundWave) {
        p.mesh.rotation.z += dt * 10;
      }

      if (!p.reflected) {
        const hitX = Math.abs(p.x - playerHurt.x) < playerHurt.width * 0.5 + p.radius;
        const hitY =
          p.y + p.radius > playerHurt.y && p.y - p.radius < playerHurt.y + playerHurt.height;

        if (hitX && hitY) {
          const res = player.receiveDamage(p.damage, p.x, vfx, audio);
          if (res === 'parried') {
            if (p.isGroundWave) {
              p.alive = false;
            } else {
              p.reflected = true;
              p.vx = -p.vx * 1.65;
              p.vy = -p.vy * 1.25;
              p.damage = Math.round(p.damage * 2.4);
              p.age = 0;
              p.coreMat.color.setHex(0x38bdf8);
            }
            onPlayerHitResult('parried', true);
          } else if (res === 'guarded' || res === 'hit') {
            p.alive = false;
            onPlayerHitResult(res, p.isGroundWave);
          }
        }
      } else {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const hitX = Math.abs(p.x - e.x) < e.width * 0.55 + p.radius;
          const hitY = p.y + p.radius > e.y && p.y - p.radius < e.y + e.height;
          if (hitX && hitY) {
            this.damageEnemy(e, p.damage, Math.sign(p.vx) * 9, true, vfx, audio, true);
            p.alive = false;
            break;
          }
        }
      }
    }
  }

  private updateMeleeAI(
    dt: number,
    elapsed: number,
    e: EnemyEntity,
    player: PlayerController,
    dx: number,
    dist: number,
    vfx: VfxManager,
    audio: ProceduralAudio,
    onPlayerHitResult: (res: 'parried' | 'guarded' | 'hit', heavy: boolean) => void,
  ): void {
    const isBrute = e.type === 'brute';
    const attackRange = isBrute ? 2.6 : 2.0;
    const speed = isBrute ? 2.8 : 4.0;

    if (e.aiState === 'patrol' || e.aiState === 'chase') {
      e.telegraphMat.opacity = 0;
      if (dist < 13 && Math.abs(player.y - e.y) < 3.5) {
        e.aiState = 'chase';
        e.facing = dx >= 0 ? 1 : -1;
        if (dist <= attackRange && e.attackCooldown <= 0) {
          e.aiState = 'windup';
          e.stateTimer = isBrute ? 0.55 : 0.4;
          e.vx = 0;
          e.didDealAttackHit = false;
        } else {
          e.vx = e.facing * speed;
        }
      } else {
        e.aiState = 'patrol';
        const offset = e.x - e.homeX;
        if (offset > 3.2) e.facing = -1;
        if (offset < -3.2) e.facing = 1;
        e.vx = e.facing * (speed * 0.5);
      }
    } else if (e.aiState === 'windup') {
      e.vx *= Math.max(0, 1 - 12 * dt);
      e.stateTimer -= dt;
      e.telegraphMat.color.setHex(isBrute ? 0x34d399 : 0xf97316);
      e.telegraphMat.opacity = 0.55 + Math.sin(elapsed * 32) * 0.3;
      e.telegraphHalo.scale.setScalar(1 + Math.sin(elapsed * 26) * 0.12);
      if (e.stateTimer <= 0) {
        e.aiState = 'attack';
        e.stateTimer = 0.26;
        e.vx = e.facing * (isBrute ? 6.5 : 5.6);
        e.squashX = 1.15;
        e.squashY = 0.88;
        e.telegraphMat.opacity = 0;
        if (isBrute) {
          vfx.spawnRing(e.x + e.facing * 1.1, e.y + 0.25, 0x34d399, 0.3, 2.5, 0.25);
          vfx.flashLight(e.x + e.facing * 1.0, e.y + 0.8, 0x34d399, 7, 0.16);
        }
      }
    } else if (e.aiState === 'attack') {
      e.stateTimer -= dt;
      e.vx *= Math.max(0, 1 - 8 * dt);
      if (!e.didDealAttackHit && dist <= attackRange + 0.6 && Math.abs(player.y - e.y) < 1.8) {
        e.didDealAttackHit = true;
        const dmg = isBrute ? 22 : 12;
        const res = player.receiveDamage(dmg, e.x, vfx, audio);
        if (res === 'parried') {
          this.stunEnemyFromParry(e, vfx);
          onPlayerHitResult('parried', true);
        } else if (res === 'guarded' || res === 'hit') {
          onPlayerHitResult(res, isBrute);
        }
      }
      if (e.stateTimer <= 0) {
        e.aiState = 'recover';
        e.stateTimer = isBrute ? 0.65 : 0.48;
        e.attackCooldown = isBrute ? 1.5 : 1.05;
      }
    } else if (e.aiState === 'recover') {
      e.vx *= Math.max(0, 1 - 10 * dt);
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) e.aiState = 'chase';
    }
  }

  private updateRangerAI(
    dt: number,
    e: EnemyEntity,
    player: PlayerController,
    dx: number,
    dist: number,
    vfx: VfxManager,
  ): void {
    e.facing = dx >= 0 ? 1 : -1;
    if (e.aiState === 'patrol' || e.aiState === 'chase') {
      e.telegraphMat.opacity = 0;
      if (dist < 4.2) {
        e.vx = -e.facing * 2.4;
      } else {
        e.vx *= Math.max(0, 1 - 10 * dt);
      }
      if (dist < 16 && e.attackCooldown <= 0) {
        e.aiState = 'windup';
        e.stateTimer = 0.52;
        e.vx = 0;
      }
    } else if (e.aiState === 'windup') {
      e.stateTimer -= dt;
      e.telegraphMat.color.setHex(0xe879f9);
      e.telegraphMat.opacity = 0.65;
      e.telegraphHalo.scale.setScalar(0.85 + e.stateTimer * 0.5);
      if (e.stateTimer <= 0) {
        e.telegraphMat.opacity = 0;
        const aimDx = player.x - e.x;
        const aimDy = player.y + 0.9 - (e.y + 1.1);
        const len = Math.hypot(aimDx, aimDy) || 1;
        const spd = 11.5;
        this.spawnProjectile(
          e.x + e.facing * 0.75,
          e.y + 1.1,
          (aimDx / len) * spd,
          THREE.MathUtils.clamp((aimDy / len) * spd, -3.5, 3.5),
          14,
          false,
          0xe879f9,
        );
        vfx.spawnBurst(e.x + e.facing * 0.75, e.y + 1.1, 0.2, 7, 0xe879f9, 4, 6, 0.7);
        e.aiState = 'recover';
        e.stateTimer = 0.42;
        e.attackCooldown = 1.9;
      }
    } else if (e.aiState === 'recover') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) e.aiState = 'chase';
    }
  }

  private updateFlyerAI(
    dt: number,
    elapsed: number,
    e: EnemyEntity,
    player: PlayerController,
    dx: number,
    dy: number,
    dist: number,
    vfx: VfxManager,
    audio: ProceduralAudio,
    onPlayerHitResult: (res: 'parried' | 'guarded' | 'hit', heavy: boolean) => void,
  ): void {
    if (e.aiState === 'patrol' || e.aiState === 'chase') {
      e.telegraphMat.opacity = 0;
      e.facing = dx >= 0 ? 1 : -1;
      const targetX = e.homeX + Math.sin(elapsed * 1.4 + e.id) * 4.2;
      const targetY = e.homeY + Math.sin(elapsed * 2.7 + e.id) * 0.75;
      e.vx = (targetX - e.x) * 2.2;
      e.vy = (targetY - e.y) * 2.5;

      if (dist < 10.5 && e.attackCooldown <= 0) {
        e.aiState = 'windup';
        e.stateTimer = 0.45;
        e.didDealAttackHit = false;
      }
    } else if (e.aiState === 'windup') {
      e.vx *= 0.9;
      e.vy = 1.6;
      e.stateTimer -= dt;
      e.telegraphMat.color.setHex(0xf97316);
      e.telegraphMat.opacity = 0.75;
      if (e.stateTimer <= 0) {
        e.aiState = 'attack';
        e.stateTimer = 0.65;
        const len = Math.hypot(dx, dy + 0.8) || 1;
        e.vx = (dx / len) * 11.5;
        e.vy = ((dy + 0.8) / len) * 11.5;
        e.telegraphMat.opacity = 0;
      }
    } else if (e.aiState === 'attack') {
      e.stateTimer -= dt;
      if (!e.didDealAttackHit && dist < 1.35 && Math.abs(player.y + 0.7 - (e.y + 0.5)) < 1.2) {
        e.didDealAttackHit = true;
        const res = player.receiveDamage(13, e.x, vfx, audio);
        if (res === 'parried') {
          this.stunEnemyFromParry(e, vfx);
          onPlayerHitResult('parried', true);
        } else if (res === 'guarded' || res === 'hit') {
          onPlayerHitResult(res, false);
        }
      }
      if (e.stateTimer <= 0 || e.y < 0.7) {
        e.aiState = 'recover';
        e.stateTimer = 0.65;
        e.attackCooldown = 1.95;
      }
    } else if (e.aiState === 'recover') {
      e.vx *= 0.94;
      e.vy = (e.homeY - e.y) * 3.0;
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) e.aiState = 'patrol';
    }
  }

  private updateBossAI(
    dt: number,
    elapsed: number,
    e: EnemyEntity,
    player: PlayerController,
    dx: number,
    dist: number,
    vfx: VfxManager,
    audio: ProceduralAudio,
    onPlayerHitResult: (res: 'parried' | 'guarded' | 'hit', heavy: boolean) => void,
  ): void {
    const fast = e.bossPhase === 2;
    const speed = fast ? 5.2 : 3.8;

    if (e.aiState === 'patrol' || e.aiState === 'chase') {
      e.telegraphMat.opacity = 0;
      e.facing = dx >= 0 ? 1 : -1;
      e.vx = dist > 4.2 ? e.facing * speed : e.vx * 0.88;

      if (e.attackCooldown <= 0) {
        const roll = Math.random();
        if (dist > 9.5 || roll < 0.34) {
          e.bossAttackKind = 'volley';
        } else if (roll < 0.68) {
          e.bossAttackKind = 'dash';
        } else {
          e.bossAttackKind = 'slam';
        }
        e.aiState = 'windup';
        e.stateTimer = fast ? 0.48 : 0.64;
        e.vx = 0;
        e.didDealAttackHit = false;
      }
    } else if (e.aiState === 'windup') {
      e.facing = dx >= 0 ? 1 : -1;
      e.stateTimer -= dt;
      e.telegraphMat.color.setHex(
        e.bossAttackKind === 'volley' ? 0x38bdf8 : e.bossAttackKind === 'slam' ? 0xf97316 : 0xef4444,
      );
      e.telegraphMat.opacity = 0.72 + Math.sin(elapsed * 30) * 0.25;
      e.telegraphHalo.scale.setScalar(1.0 + Math.sin(elapsed * 24) * 0.14);

      if (e.stateTimer <= 0) {
        e.telegraphMat.opacity = 0;
        if (e.bossAttackKind === 'dash') {
          e.aiState = 'dash';
          e.stateTimer = 0.44;
          e.vx = e.facing * (fast ? 19.5 : 16.0);
          e.squashX = 1.18;
          e.squashY = 0.88;
          audio.playSlash(3);
          vfx.flashLight(e.x, e.y + 1.8, 0xef4444, 10, 0.22);
        } else if (e.bossAttackKind === 'slam') {
          e.aiState = 'leap';
          e.stateTimer = 0.9;
          e.vy = 15.8;
          e.vx = THREE.MathUtils.clamp(dx * 1.15, -10.5, 10.5);
          audio.playJump(false);
        } else {
          const count = fast ? 3 : 2;
          for (let k = 0; k < count; k++) {
            const spreadY = (k - (count - 1) * 0.5) * 1.45;
            this.spawnProjectile(
              e.x + e.facing * 1.4,
              e.y + 1.7 + spreadY * 0.35,
              e.facing * (fast ? 12.8 : 10.6),
              spreadY * 0.75,
              16,
              false,
              0xf97316,
            );
          }
          audio.playSlash(2);
          vfx.flashLight(e.x + e.facing * 1.2, e.y + 1.8, 0xf97316, 9, 0.22);
          e.aiState = 'recover';
          e.stateTimer = fast ? 0.55 : 0.8;
          e.attackCooldown = fast ? 1.15 : 1.65;
        }
      }
    } else if (e.aiState === 'dash') {
      e.stateTimer -= dt;
      if (!e.didDealAttackHit && dist < 2.45 && Math.abs(player.y - e.y) < 2.3) {
        e.didDealAttackHit = true;
        const res = player.receiveDamage(20, e.x, vfx, audio);
        if (res === 'parried') {
          this.stunEnemyFromParry(e, vfx);
          onPlayerHitResult('parried', true);
          return;
        } else if (res === 'guarded' || res === 'hit') {
          onPlayerHitResult(res, true);
        }
      }
      if (e.stateTimer <= 0) {
        e.vx *= 0.3;
        e.aiState = 'recover';
        e.stateTimer = fast ? 0.45 : 0.68;
        e.attackCooldown = fast ? 1.05 : 1.5;
      }
    } else if (e.aiState === 'leap') {
      e.stateTimer -= dt;
      if (e.y <= 0.08 && e.vy <= 0 && e.stateTimer < 0.72) {
        e.vx = 0;
        e.squashX = 1.25;
        e.squashY = 0.78;
        audio.playHit(true);
        vfx.flashLight(e.x, 1.0, 0xf97316, 12, 0.26);
        vfx.spawnRing(e.x, 0.2, 0xf97316, 0.5, 4.4, 0.32);
        vfx.spawnDustPuff(e.x, 0, 16);
        this.spawnProjectile(e.x - 1.1, 0.1, -11.5, 0, 18, true, 0xf97316);
        this.spawnProjectile(e.x + 1.1, 0.1, 11.5, 0, 18, true, 0xf97316);
        if (dist < 2.6 && player.y < 1.2) {
          const res = player.receiveDamage(22, e.x, vfx, audio);
          if (res === 'parried') {
            this.stunEnemyFromParry(e, vfx);
            onPlayerHitResult('parried', true);
          } else if (res === 'guarded' || res === 'hit') {
            onPlayerHitResult(res, true);
          }
        }
        e.aiState = 'recover';
        e.stateTimer = fast ? 0.6 : 0.88;
        e.attackCooldown = fast ? 1.25 : 1.75;
      }
    } else if (e.aiState === 'recover') {
      e.vx *= Math.max(0, 1 - 10 * dt);
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) e.aiState = 'chase';
    }
  }

  public clearAll(): void {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      e.spriteMat.dispose();
      e.spriteTex.dispose();
    }
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
    }
    this.enemies = [];
    this.projectiles = [];
    this.boss = null;
  }

  public dispose(): void {
    this.disposed = true;
    this.clearAll();
    (Object.keys(this.baseAtlases) as EnemyType[]).forEach((k) => {
      this.baseAtlases[k].dispose();
    });
    this.shadowTex.dispose();
    this.spriteGeo.dispose();
    this.shadowGeo.dispose();
    for (const g of this.sharedGeos) g.dispose();
    for (const m of this.sharedMats) m.dispose();
    this.sharedGeos = [];
    this.sharedMats = [];
  }
}
