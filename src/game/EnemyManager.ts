import * as THREE from 'three';
import {
  AABB,
  BiomeId,
  BiomePalette,
  BOSS_ARENA_MAX_X,
  BOSS_ARENA_MIN_X,
  DIFFICULTY_PRESETS,
  DifficultyConfig,
  EnemyType,
  OffscreenEnemyIndicator,
} from './types';
import { LevelBuilder } from './LevelBuilder';
import { PlayerController } from './PlayerController';
import { ProceduralAudio, VfxManager } from './VfxAudio';
import {
  buildFallbackEnemyTexture,
  loadAndProcessEnemyAtlas,
  SheetSliceConfig,
} from './SpriteAtlasProcessor';
import {
  GruntFsmData,
  GruntState,
  GruntStateMachine,
} from './GruntStateMachine';
import {
  BIOME_ROSTERS,
  BiomeBossProfile,
  ENEMY_SHEET_LIBRARY,
} from './BiomeRoster';

export type { GruntState };

const _projVec = new THREE.Vector3();

const ENEMY_TYPES: EnemyType[] = ['grunt', 'ranger', 'flyer', 'brute', 'boss'];

const ENEMY_VISUAL_SCALES: Record<EnemyType, { w: number; h: number; yOff: number }> = {
  grunt: { w: 2.55, h: 2.4, yOff: -0.05 },
  ranger: { w: 2.5, h: 2.45, yOff: -0.05 },
  flyer: { w: 2.6, h: 2.25, yOff: -0.25 },
  brute: { w: 3.55, h: 3.25, yOff: -0.06 },
  boss: { w: 4.85, h: 4.45, yOff: -0.08 },
};

export interface EnemyEntity {
  id: number;
  biome: BiomeId;
  type: EnemyType;
  displayName: string;
  shortLabel: string;
  accentCss: string;
  accentHex: number;
  visW: number;
  visH: number;
  visYOff: number;
  unitDamage: number;
  speedMult: number;
  projectileHex: number;
  projectileSpeed: number;
  projectileCount: number;
  bruteShockwave: boolean;
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
  bossDashWaveFired: boolean;
  didDealAttackHit: boolean;
  lastHitByAttackId: number;
  hitFlashTimer: number;
  animTimer: number;
  squashX: number;
  squashY: number;

  // Dedicated Patrol / Aggro / Stunned FSM for Grunts
  gruntFsm?: GruntFsmData;

  // Visual illustrated sprite card
  group: THREE.Group;
  spriteMesh: THREE.Mesh;
  spriteMat: THREE.MeshBasicMaterial;
  spriteTex: THREE.Texture;
  shadowMesh: THREE.Mesh;
  telegraphHalo: THREE.Mesh;
  telegraphMat: THREE.MeshBasicMaterial;
  bossAuraMesh?: THREE.Mesh;
  bossAuraMat?: THREE.MeshBasicMaterial;
  stateBadgeMesh?: THREE.Mesh;
  stateBadgeMat?: THREE.MeshBasicMaterial;
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

function createAlertBadgeTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);

  // Bold pixel-crisp '!' badge with warm dark-espresso ink border
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 50px system-ui, -apple-system, sans-serif';
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1f120b';
  ctx.strokeText('!', 32, 34);
  const grad = ctx.createLinearGradient(0, 10, 0, 56);
  grad.addColorStop(0, '#fef08a');
  grad.addColorStop(0.5, '#fb923c');
  grad.addColorStop(1, '#ef4444');
  ctx.fillStyle = grad;
  ctx.fillText('!', 32, 34);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createStunBadgeTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 96, 48);

  // Elliptical dizzy orbit ring
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(48, 25, 34, 11, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Three 4-point cartoon-RPG stagger stars
  const drawStar = (cx: number, cy: number, r: number, color: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rad = i % 2 === 0 ? r : r * 0.42;
      const a = (i * Math.PI) / 4;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1f120b';
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };

  drawStar(16, 26, 9.5, '#fde047');
  drawStar(48, 13, 10.5, '#7dd3fc');
  drawStar(80, 26, 9.5, '#fde047');

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  private biomeAtlasCache = new Map<string, THREE.CanvasTexture>();
  private loadingKeys = new Set<string>();
  private shadowTex: THREE.CanvasTexture;
  private alertBadgeTex: THREE.CanvasTexture;
  private stunBadgeTex: THREE.CanvasTexture;
  private spriteGeo: THREE.PlaneGeometry;
  private shadowGeo: THREE.PlaneGeometry;
  private badgeGeo: THREE.PlaneGeometry;
  private bossAuraGeo: THREE.RingGeometry;
  private gruntFsm = new GruntStateMachine();
  private gruntSpawnCount = 0;
  private difficulty: DifficultyConfig = DIFFICULTY_PRESETS.knight;
  private nextId = 1;
  private nextProjId = 1;
  private disposed = false;

  private sharedGeos: THREE.BufferGeometry[] = [];
  private sharedMats: THREE.Material[] = [];

  constructor(scene: THREE.Scene, palette: BiomePalette) {
    this.scene = scene;
    this.palette = palette;
    this.shadowTex = createShadowTex();
    this.alertBadgeTex = createAlertBadgeTex();
    this.stunBadgeTex = createStunBadgeTex();
    this.spriteGeo = new THREE.PlaneGeometry(1, 1);
    this.shadowGeo = new THREE.PlaneGeometry(1.7, 0.6);
    this.badgeGeo = new THREE.PlaneGeometry(1, 1);
    this.bossAuraGeo = new THREE.RingGeometry(1.95, 2.38, 28);

    // Pre-warm all 5 high-res hand-painted spritesheets for the initial biome
    this.preloadBiomeAtlases(palette.id);
  }

  private preloadBiomeAtlases(biome: BiomeId): void {
    for (const type of ENEMY_TYPES) {
      this.getAtlasFor(biome, type);
    }
  }

  private getAtlasFor(biome: BiomeId, type: EnemyType): THREE.CanvasTexture {
    const key = `${biome}:${type}`;
    const existing = this.biomeAtlasCache.get(key);
    if (existing) return existing;

    const roster = BIOME_ROSTERS[biome];
    const isBoss = type === 'boss';
    const sheetKey = isBoss ? roster.boss.sheetKey : roster.units[type].sheetKey;
    const colorGrade = isBoss ? roster.boss.colorGrade : roster.units[type].colorGrade;
    const accentCss = isBoss ? roster.boss.accentCss : roster.units[type].accentCss;

    // Immediate crisp placeholder while the high-res illustrated JPG finishes decoding (~15ms)
    const placeholder = buildFallbackEnemyTexture(accentCss);
    this.biomeAtlasCache.set(key, placeholder);

    if (!this.loadingKeys.has(key)) {
      this.loadingKeys.add(key);
      const baseCfg = ENEMY_SHEET_LIBRARY[sheetKey];
      const sliceCfg: SheetSliceConfig = colorGrade
        ? { ...baseCfg, colorGrade }
        : baseCfg;

      loadAndProcessEnemyAtlas(sliceCfg, (loadedTex) => {
        this.loadingKeys.delete(key);
        if (this.disposed) {
          loadedTex.dispose();
          return;
        }
        const prev = this.biomeAtlasCache.get(key);
        this.biomeAtlasCache.set(key, loadedTex);

        // Hot-swap texture seamlessly onto all spawned enemies matching this biome & type
        for (const e of this.enemies) {
          if (e.biome === biome && e.type === type) {
            const oldClone = e.spriteTex;
            const nextClone = loadedTex.clone();
            nextClone.needsUpdate = true;
            nextClone.repeat.set(1 / 4, 1 / 2);
            nextClone.offset.copy(oldClone.offset);
            e.spriteTex = nextClone;
            e.spriteMat.map = nextClone;
            e.spriteMat.needsUpdate = true;
            oldClone.dispose();
          }
        }
        if (prev && prev !== loadedTex) {
          prev.dispose();
        }
      });
    }

    return placeholder;
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
    this.preloadBiomeAtlases(palette.id);
  }

  public setDifficulty(config: DifficultyConfig): void {
    this.difficulty = config;
  }

  public spawnStageWave(): void {
    this.clearAll();
    this.bossTriggered = false;
    this.bossDefeated = false;
    this.gruntSpawnCount = 0;

    const roster = BIOME_ROSTERS[this.palette.id];
    for (const wave of roster.waves) {
      this.spawnEnemy(wave.type, wave.x, wave.y);
    }

    // Zone 4 (X: 150..180) — Unique Biome-Specific Boss
    this.boss = this.spawnEnemy('boss', 171, 0);
  }

  private spawnEnemy(type: EnemyType, x: number, y: number): EnemyEntity {
    const biome = this.palette.id;
    const roster = BIOME_ROSTERS[biome];
    const isBoss = type === 'boss';
    const unitSpec = isBoss ? null : roster.units[type];
    const bossSpec = roster.boss;

    const group = new THREE.Group();
    group.position.set(x, y, 0);

    const sourceAtlas = this.getAtlasFor(biome, type);
    const clonedTex = sourceAtlas.clone();
    clonedTex.needsUpdate = true;
    clonedTex.repeat.set(1 / 4, 1 / 2);
    clonedTex.offset.set(0, 0.5);

    const spriteMat = new THREE.MeshBasicMaterial({
      map: clonedTex,
      transparent: true,
      alphaTest: 0.18,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    const baseVis = ENEMY_VISUAL_SCALES[type];
    const visW = isBoss ? bossSpec.scaleW : (unitSpec?.scaleW ?? baseVis.w);
    const visH = isBoss ? bossSpec.scaleH : (unitSpec?.scaleH ?? baseVis.h);
    const visYOff = baseVis.yOff;

    const spriteMesh = new THREE.Mesh(this.spriteGeo, spriteMat);
    spriteMesh.position.set(0, visH * 0.5 + visYOff, 0.06);
    spriteMesh.scale.set(-visW, visH, 1);
    spriteMesh.renderOrder = isBoss ? 6 : 4;
    group.add(spriteMesh);

    // Rotating 3D HDR Elemental Sanctum Ring behind each map's unique Boss
    let bossAuraMesh: THREE.Mesh | undefined;
    let bossAuraMat: THREE.MeshBasicMaterial | undefined;
    if (isBoss) {
      bossAuraMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(bossSpec.primaryHex).multiplyScalar(1.65),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      bossAuraMesh = new THREE.Mesh(this.bossAuraGeo, bossAuraMat);
      bossAuraMesh.position.set(0, visH * 0.46, -0.18);
      bossAuraMesh.renderOrder = 3;
      group.add(bossAuraMesh);
    }

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
    const shScale = isBoss ? 2.2 : type === 'brute' ? 1.55 : 1.0;
    shadowMesh.scale.set(shScale, shScale, 1);
    shadowMesh.position.set(0, 0.03, 0);
    group.add(shadowMesh);

    const width = isBoss ? bossSpec.hitWidth : (unitSpec?.hitWidth ?? 1.15);
    const height = isBoss ? bossSpec.hitHeight : (unitSpec?.hitHeight ?? 1.85);
    const maxHp = isBoss ? bossSpec.maxHp : (unitSpec?.maxHp ?? 48);
    const displayName = isBoss ? bossSpec.name : (unitSpec?.name ?? 'Enemy');
    const shortLabel = isBoss ? bossSpec.name : (unitSpec?.shortLabel ?? 'Foe');
    const accentCss = isBoss ? bossSpec.accentCss : (unitSpec?.accentCss ?? '#f59e0b');
    const accentHex = isBoss ? bossSpec.primaryHex : (unitSpec?.accentHex ?? 0xf97316);
    const unitDamage = isBoss ? bossSpec.dashDamage : (unitSpec?.damage ?? 12);
    const speedMult = isBoss ? 1.0 : (unitSpec?.speedMult ?? 1.0);
    const projectileHex = isBoss ? bossSpec.primaryHex : (unitSpec?.projectileHex ?? 0xe879f9);
    const projectileSpeed = isBoss ? bossSpec.volleySpeed : (unitSpec?.projectileSpeed ?? 11.5);
    const projectileCount = isBoss ? bossSpec.volleyCountP1 : (unitSpec?.projectileCount ?? 1);
    const bruteShockwave = Boolean(unitSpec?.bruteShockwave);

    // Windup telegraph glow halo (HDR emissive for selective Bloom)
    const telegraphMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(accentHex).multiplyScalar(1.9),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
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
    if (!isBoss) {
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

    // Diegetic overhead FSM state cue for Grunts (Aggro '!' alert & Stunned dizzy stars)
    let gruntFsmData: GruntFsmData | undefined;
    let stateBadgeMesh: THREE.Mesh | undefined;
    let stateBadgeMat: THREE.MeshBasicMaterial | undefined;
    if (type === 'grunt') {
      gruntFsmData = this.gruntFsm.createData(this.gruntSpawnCount++);
      stateBadgeMat = new THREE.MeshBasicMaterial({
        map: this.alertBadgeTex,
        color: new THREE.Color(1.45, 1.45, 1.45),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      stateBadgeMesh = new THREE.Mesh(this.badgeGeo, stateBadgeMat);
      stateBadgeMesh.position.set(0, height + 0.88, 0.3);
      stateBadgeMesh.renderOrder = 9;
      stateBadgeMesh.visible = false;
      group.add(stateBadgeMesh);
    }

    this.scene.add(group);

    const entity: EnemyEntity = {
      id: this.nextId++,
      biome,
      type,
      displayName,
      shortLabel,
      accentCss,
      accentHex,
      visW,
      visH,
      visYOff,
      unitDamage,
      speedMult,
      projectileHex,
      projectileSpeed,
      projectileCount,
      bruteShockwave,
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
      bossDashWaveFired: false,
      didDealAttackHit: false,
      lastHitByAttackId: -1,
      hitFlashTimer: 0,
      animTimer: Math.random() * 4,
      squashX: 1,
      squashY: 1,
      gruntFsm: gruntFsmData,
      group,
      spriteMesh,
      spriteMat,
      spriteTex: clonedTex,
      shadowMesh,
      telegraphHalo,
      telegraphMat,
      bossAuraMesh,
      bossAuraMat,
      stateBadgeMesh,
      stateBadgeMat,
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
      const cadence = e.gruntFsm?.state === 'Aggro' ? 9.8 : 5.8;
      const stride = Math.floor(e.animTimer * cadence) % 2;
      this.setEnemyFrame(e, 2 + stride, 0); // Patrol march vs Aggro sprint strides!
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

    let finalAmount = amount;
    let wasStunnedGrunt = false;
    let triggeredGruntStun = false;

    if (e.type === 'grunt' && e.gruntFsm) {
      const hitInfo = this.gruntFsm.onHit(
        e,
        amount,
        heavy,
        isReflected,
        vfx,
        this.enemies,
      );
      finalAmount = Math.round(amount * hitInfo.bonusMultiplier);
      wasStunnedGrunt = hitInfo.wasAlreadyStunned;
      triggeredGruntStun = hitInfo.triggeredStun;
    }

    e.hp = Math.max(0, e.hp - finalAmount);
    e.hitFlashTimer = 0.12;
    e.squashX = 0.84;
    e.squashY = 1.18;
    const kbScale = e.type === 'boss' ? 0.14 : e.type === 'brute' ? 0.35 : 1.0;
    e.vx = knockbackX * kbScale;
    if (e.type !== 'flyer' && e.type !== 'boss') {
      e.vy = heavy ? 4.4 : 2.3;
    }

    if (e.type !== 'grunt') {
      if (isReflected) {
        e.aiState = 'stunned';
        e.stateTimer = e.type === 'boss' ? 1.15 : 1.65;
      } else if (heavy && e.type !== 'boss' && e.type !== 'brute') {
        e.aiState = 'stunned';
        e.stateTimer = 0.45;
      }
    }

    if (e.hpBarBg && e.hpBarFill) {
      e.hpBarBg.visible = true;
      e.hpBarFill.visible = true;
      const ratio = Math.max(0.001, e.hp / e.maxHp);
      e.hpBarFill.scale.x = ratio;
      e.hpBarFill.position.x = -(1 - ratio) * 0.59;
    }

    audio.playHit(heavy || isReflected || wasStunnedGrunt);
    vfx.spawnBurst(
      e.x,
      e.y + e.height * 0.55,
      0.2,
      heavy || isReflected || wasStunnedGrunt ? 18 : 10,
      isReflected ? 0x60a5fa : heavy || wasStunnedGrunt ? 0xfacc15 : 0x7dd3fc,
      heavy || wasStunnedGrunt ? 7.5 : 5.5,
      16,
      heavy || wasStunnedGrunt ? 1.15 : 0.85,
    );

    const label = isReflected
      ? `COUNTER -${finalAmount}!`
      : wasStunnedGrunt
        ? `STAGGER -${finalAmount}!`
        : heavy
          ? `CRIT -${finalAmount}!`
          : `-${finalAmount}`;
    const color = isReflected
      ? '#60a5fa'
      : heavy || wasStunnedGrunt
        ? '#fde047'
        : '#ffffff';
    const launchVx = Math.sign(knockbackX || 1) * (heavy || isReflected ? 2.1 : 1.35);
    vfx.spawnFloatingText(
      e.x,
      e.y + e.height * 0.72,
      label,
      color,
      heavy || isReflected || wasStunnedGrunt ? 1.28 : 1.0,
      launchVx,
    );

    if (triggeredGruntStun && e.hp > 0) {
      vfx.spawnFloatingText(e.x, e.y + e.height + 0.45, 'STUNNED!', '#38bdf8', 1.12);
    }

    // Boss Phase 2 at <= 50% HP (elemental burst matched to this biome's Boss!)
    if (e.type === 'boss' && e.bossPhase === 1 && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
      e.bossPhase = 2;
      const bp = BIOME_ROSTERS[this.palette.id].boss;
      audio.playBossRoar();
      vfx.flashLight(e.x, e.y + 2.2, bp.primaryHex, 15, 0.38);
      vfx.spawnRing(e.x, e.y + 2.0, bp.primaryHex, 0.5, 5.5, 0.44);
      vfx.spawnBurst(e.x, e.y + 2.0, 0.25, 26, bp.secondaryHex, 9.0, 10, 1.25);
      vfx.spawnFloatingText(e.x, e.y + 3.3, 'ENRAGED!', bp.accentCss, 1.45);
    }

    if (e.hp <= 0) {
      e.alive = false;
      e.aiState = 'dead';
      e.dyingTimer = e.type === 'boss' ? 1.2 : 0.75;
      e.telegraphMat.opacity = 0;
      if (e.stateBadgeMesh) e.stateBadgeMesh.visible = false;
      if (e.hpBarBg) e.hpBarBg.visible = false;
      if (e.hpBarFill) e.hpBarFill.visible = false;

      const deathColor = e.type === 'boss' ? BIOME_ROSTERS[this.palette.id].boss.primaryHex : e.accentHex;
      vfx.spawnBurst(
        e.x,
        e.y + e.height * 0.5,
        0.15,
        e.type === 'boss' ? 58 : 22,
        deathColor,
        e.type === 'boss' ? 11.5 : 7,
        14,
        e.type === 'boss' ? 1.65 : 1.0,
      );
      if (e.type === 'boss') {
        const bp = BIOME_ROSTERS[this.palette.id].boss;
        this.bossDefeated = true;
        audio.playBossDefeat();
        vfx.flashLight(e.x, e.y + 2, bp.primaryHex, 16, 0.55);
        vfx.spawnRing(e.x, e.y + 1.8, bp.secondaryHex, 0.4, 7.8, 0.55);
      }
      return true;
    }

    return false;
  }

  public stunEnemyFromParry(e: EnemyEntity, vfx: VfxManager): void {
    if (e.type === 'grunt' && e.gruntFsm) {
      this.gruntFsm.transition(e, 'Stunned', vfx, undefined, {
        stunDuration: 1.95,
        fromParry: true,
      });
    } else {
      e.aiState = 'stunned';
      e.stateTimer = e.type === 'boss' ? 1.35 : 1.85;
      e.telegraphMat.opacity = 0;
      e.squashX = 0.82;
      e.squashY = 1.2;
    }
    e.vx = -e.facing * (e.type === 'boss' ? 3.2 : 6.4);
    vfx.spawnFloatingText(e.x, e.y + e.height + 0.2, 'STUNNED!', '#38bdf8', 1.15);
  }

  public stunEnemyFromSpell(
    e: EnemyEntity,
    duration: number,
    knockbackX: number,
    vfx: VfxManager,
  ): void {
    if (!e.alive) return;
    if (e.type === 'grunt' && e.gruntFsm) {
      this.gruntFsm.transition(e, 'Stunned', vfx, undefined, {
        stunDuration: duration,
      });
    } else {
      e.aiState = 'stunned';
      e.stateTimer = e.type === 'boss' ? duration * 0.55 : duration;
      e.telegraphMat.opacity = 0;
      e.squashX = 0.84;
      e.squashY = 1.18;
    }
    e.vx = knockbackX * (e.type === 'boss' ? 0.2 : e.type === 'brute' ? 0.45 : 1.0);
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
    const coreMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(coreColor).multiplyScalar(2.2),
        toneMapped: false,
      }),
    );
    const glowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(isGroundWave ? 0xfde047 : 0xf5d0fe).multiplyScalar(2.35),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
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
          const fadeAlpha = Math.max(0, Math.min(1, e.dyingTimer / 0.55));
          e.spriteMat.opacity = fadeAlpha;
          if (e.bossAuraMat) {
            e.bossAuraMat.opacity = fadeAlpha * 0.32;
          }
          if (e.dyingTimer <= 0) {
            this.scene.remove(e.group);
          }
        }
        continue;
      }

      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
        e.spriteMat.color.setHex(0xffb4b4);
      } else if (e.type === 'grunt' && e.gruntFsm?.state === 'Stunned') {
        // Subtle electric stagger pulse on Stunned grunts
        e.spriteMat.color.setHex(Math.sin(elapsed * 22) > 0 ? 0xd8f3ff : 0xfff5cc);
      } else if (e.type === 'boss' && e.bossPhase === 2) {
        e.spriteMat.color.setHex(0xffe4d6);
      } else {
        e.spriteMat.color.setHex(0xffffff);
      }

      // Animate rotating HDR elemental sanctum ring behind the active biome Boss
      if (e.bossAuraMesh && e.bossAuraMat) {
        const enraged = e.bossPhase === 2;
        e.bossAuraMesh.rotation.z += dt * (enraged ? 2.6 : 0.95);
        const pulse = (enraged ? 1.1 : 0.98) + Math.sin(elapsed * (enraged ? 7.5 : 3.2)) * 0.08;
        e.bossAuraMesh.scale.setScalar(pulse);
        e.bossAuraMat.opacity = enraged ? 0.56 : this.bossTriggered ? 0.34 : 0.2;
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

      if (e.type === 'grunt' && e.gruntFsm) {
        // Dedicated Patrol / Aggro / Stunned Finite State Machine
        this.gruntFsm.update(e, {
          dt,
          elapsed,
          player,
          allEnemies: this.enemies,
          dx,
          dy,
          dist,
          aggression: this.difficulty.enemyAggression,
          cooldownMult: this.difficulty.enemyCooldownMult,
          vfx,
          audio,
          onPlayerHitResult,
          onParried: (target) => this.stunEnemyFromParry(target, vfx),
        });
        this.updateGruntStateBadge(e, elapsed);
      } else if (e.aiState === 'stunned') {
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
            if (e.type === 'grunt' && e.gruntFsm?.state === 'Patrol') {
              e.facing = e.facing === 1 ? -1 : 1;
              e.gruntFsm.patrolPhase = 'lookout';
              e.gruntFsm.phaseTimer = 0.55;
            }
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
      e.spriteMesh.scale.set(e.facing * e.visW * e.squashX, e.visH * e.squashY, 1);
      e.spriteMesh.position.y = e.visH * e.squashY * 0.5 + e.visYOff;

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
              p.coreMat.color.setHex(0x38bdf8).multiplyScalar(2.65);
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
    const agg = this.difficulty.enemyAggression;
    const cdMult = this.difficulty.enemyCooldownMult;
    const windupScale = 1 / Math.sqrt(Math.max(0.5, agg));
    const attackRange = isBrute ? 2.65 : 2.0;
    const speed = (isBrute ? 2.85 : 4.0) * e.speedMult * agg;

    if (e.aiState === 'patrol' || e.aiState === 'chase') {
      e.telegraphMat.opacity = 0;
      if (dist < 13 * (0.88 + agg * 0.12) && Math.abs(player.y - e.y) < 3.5) {
        e.aiState = 'chase';
        e.facing = dx >= 0 ? 1 : -1;
        if (dist <= attackRange && e.attackCooldown <= 0) {
          e.aiState = 'windup';
          e.stateTimer = (isBrute ? 0.55 : 0.4) * windupScale;
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
      e.telegraphMat.color.setHex(e.accentHex).multiplyScalar(1.9);
      e.telegraphMat.opacity = 0.55 + Math.sin(elapsed * 32) * 0.3;
      e.telegraphHalo.scale.setScalar(1 + Math.sin(elapsed * 26) * 0.12);
      if (e.stateTimer <= 0) {
        e.aiState = 'attack';
        e.stateTimer = 0.26;
        e.vx = e.facing * (isBrute ? 6.5 : 5.6) * e.speedMult * (0.88 + agg * 0.12);
        e.squashX = 1.15;
        e.squashY = 0.88;
        e.telegraphMat.opacity = 0;
        if (isBrute) {
          vfx.spawnRing(e.x + e.facing * 1.1, e.y + 0.25, e.accentHex, 0.3, 2.6, 0.26);
          vfx.flashLight(e.x + e.facing * 1.0, e.y + 0.8, e.accentHex, 7.5, 0.18);
          if (e.bruteShockwave) {
            // Obsidian Ravager, Glacier Yeti & Wicker Sentinel launch biome ground shockwaves!
            const waveSpd = e.projectileSpeed * (0.9 + agg * 0.1);
            this.spawnProjectile(
              e.x + e.facing * 1.25,
              e.y + 0.12,
              e.facing * waveSpd,
              0,
              Math.round(e.unitDamage * 0.72),
              true,
              e.projectileHex,
            );
          }
        }
      }
    } else if (e.aiState === 'attack') {
      e.stateTimer -= dt;
      e.vx *= Math.max(0, 1 - 8 * dt);
      if (!e.didDealAttackHit && dist <= attackRange + 0.6 && Math.abs(player.y - e.y) < 1.8) {
        e.didDealAttackHit = true;
        const res = player.receiveDamage(e.unitDamage, e.x, vfx, audio);
        if (res === 'parried') {
          this.stunEnemyFromParry(e, vfx);
          onPlayerHitResult('parried', true);
        } else if (res === 'guarded' || res === 'hit') {
          onPlayerHitResult(res, isBrute);
        }
      }
      if (e.stateTimer <= 0) {
        e.aiState = 'recover';
        e.stateTimer = (isBrute ? 0.65 : 0.48) * cdMult;
        e.attackCooldown = (isBrute ? 1.5 : 1.05) * cdMult;
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
    const agg = this.difficulty.enemyAggression;
    const cdMult = this.difficulty.enemyCooldownMult;
    const windupScale = 1 / Math.sqrt(Math.max(0.5, agg));

    e.facing = dx >= 0 ? 1 : -1;
    if (e.aiState === 'patrol' || e.aiState === 'chase') {
      e.telegraphMat.opacity = 0;
      if (dist < 4.2) {
        e.vx = -e.facing * 2.4 * e.speedMult * agg;
      } else {
        e.vx *= Math.max(0, 1 - 10 * dt);
      }
      if (dist < 16 * (0.9 + agg * 0.1) && e.attackCooldown <= 0) {
        e.aiState = 'windup';
        e.stateTimer = 0.52 * windupScale;
        e.vx = 0;
      }
    } else if (e.aiState === 'windup') {
      e.stateTimer -= dt;
      e.telegraphMat.color.setHex(e.projectileHex).multiplyScalar(1.85);
      e.telegraphMat.opacity = 0.65;
      e.telegraphHalo.scale.setScalar(0.85 + e.stateTimer * 0.5);
      if (e.stateTimer <= 0) {
        e.telegraphMat.opacity = 0;
        const aimDx = player.x - e.x;
        const aimDy = player.y + 0.9 - (e.y + 1.1);
        const len = Math.hypot(aimDx, aimDy) || 1;
        const spd = e.projectileSpeed * (0.88 + agg * 0.12);
        const count = Math.max(1, e.projectileCount);
        const baseVx = (aimDx / len) * spd;
        const baseVy = THREE.MathUtils.clamp((aimDy / len) * spd, -3.5, 3.5);
        for (let k = 0; k < count; k++) {
          const offset = count > 1 ? (k - (count - 1) * 0.5) * 1.35 : 0;
          this.spawnProjectile(
            e.x + e.facing * 0.75,
            e.y + 1.1 + offset * 0.25,
            baseVx,
            baseVy + offset * 0.85,
            e.unitDamage,
            false,
            e.projectileHex,
          );
        }
        vfx.spawnBurst(e.x + e.facing * 0.75, e.y + 1.1, 0.2, 7, e.projectileHex, 4, 6, 0.7);
        e.aiState = 'recover';
        e.stateTimer = 0.42 * cdMult;
        e.attackCooldown = 1.9 * cdMult;
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
    const agg = this.difficulty.enemyAggression;
    const cdMult = this.difficulty.enemyCooldownMult;
    const windupScale = 1 / Math.sqrt(Math.max(0.5, agg));

    if (e.aiState === 'patrol' || e.aiState === 'chase') {
      e.telegraphMat.opacity = 0;
      e.facing = dx >= 0 ? 1 : -1;
      const targetX = e.homeX + Math.sin(elapsed * 1.4 * e.speedMult + e.id) * 4.2;
      const targetY = e.homeY + Math.sin(elapsed * 2.7 + e.id) * 0.75;
      e.vx = (targetX - e.x) * 2.2 * e.speedMult;
      e.vy = (targetY - e.y) * 2.5;

      if (dist < 10.5 * (0.9 + agg * 0.1) && e.attackCooldown <= 0) {
        e.aiState = 'windup';
        e.stateTimer = 0.45 * windupScale;
        e.didDealAttackHit = false;
      }
    } else if (e.aiState === 'windup') {
      e.vx *= 0.9;
      e.vy = 1.6;
      e.stateTimer -= dt;
      e.telegraphMat.color.setHex(e.accentHex).multiplyScalar(1.9);
      e.telegraphMat.opacity = 0.75;
      if (e.stateTimer <= 0) {
        e.aiState = 'attack';
        e.stateTimer = 0.65;
        const len = Math.hypot(dx, dy + 0.8) || 1;
        const diveSpeed = 11.5 * e.speedMult * (0.88 + agg * 0.12);
        e.vx = (dx / len) * diveSpeed;
        e.vy = ((dy + 0.8) / len) * diveSpeed;
        e.telegraphMat.opacity = 0;
      }
    } else if (e.aiState === 'attack') {
      e.stateTimer -= dt;
      if (!e.didDealAttackHit && dist < 1.35 && Math.abs(player.y + 0.7 - (e.y + 0.5)) < 1.2) {
        e.didDealAttackHit = true;
        const res = player.receiveDamage(e.unitDamage, e.x, vfx, audio);
        if (res === 'parried') {
          this.stunEnemyFromParry(e, vfx);
          onPlayerHitResult('parried', true);
        } else if (res === 'guarded' || res === 'hit') {
          onPlayerHitResult(res, false);
        }
      }
      if (e.stateTimer <= 0 || e.y < 0.7) {
        e.aiState = 'recover';
        e.stateTimer = 0.65 * cdMult;
        e.attackCooldown = 1.95 * cdMult;
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
    const bp: BiomeBossProfile = BIOME_ROSTERS[this.palette.id].boss;
    const fast = e.bossPhase === 2;
    const agg = this.difficulty.enemyAggression;
    const cdMult = this.difficulty.enemyCooldownMult;
    const windupScale = 1 / Math.sqrt(Math.max(0.5, agg));
    const speed = bp.moveSpeed * (fast ? 1.32 : 1.0) * (0.85 + agg * 0.15);

    if (e.aiState === 'patrol' || e.aiState === 'chase') {
      e.telegraphMat.opacity = 0;
      e.facing = dx >= 0 ? 1 : -1;
      e.vx = dist > 4.2 ? e.facing * speed : e.vx * 0.88;

      if (e.attackCooldown <= 0) {
        const roll = Math.random();
        if (dist > 10.2 || roll < bp.volleyWeight) {
          e.bossAttackKind = 'volley';
        } else if (roll < bp.volleyWeight + bp.dashWeight) {
          e.bossAttackKind = 'dash';
        } else {
          e.bossAttackKind = 'slam';
        }
        e.aiState = 'windup';
        e.stateTimer = (fast ? 0.46 : 0.62) * windupScale;
        e.vx = 0;
        e.didDealAttackHit = false;
        e.bossDashWaveFired = false;
      }
    } else if (e.aiState === 'windup') {
      e.facing = dx >= 0 ? 1 : -1;
      e.stateTimer -= dt;
      const telegraphHex =
        e.bossAttackKind === 'volley'
          ? bp.secondaryHex
          : e.bossAttackKind === 'slam'
            ? bp.primaryHex
            : 0xef4444;
      e.telegraphMat.color.setHex(telegraphHex).multiplyScalar(2.0);
      e.telegraphMat.opacity = 0.72 + Math.sin(elapsed * 30) * 0.25;
      e.telegraphHalo.scale.setScalar(1.0 + Math.sin(elapsed * 24) * 0.14);

      if (e.stateTimer <= 0) {
        e.telegraphMat.opacity = 0;
        if (e.bossAttackKind === 'dash') {
          e.aiState = 'dash';
          e.stateTimer = 0.44;
          e.vx = e.facing * bp.dashSpeed * (fast ? 1.2 : 1.0) * (0.9 + agg * 0.1);
          e.squashX = 1.18;
          e.squashY = 0.88;
          audio.playSlash(3);
          vfx.flashLight(e.x, e.y + 1.8, bp.primaryHex, 11, 0.24);
          vfx.spawnBurst(e.x, e.y + 1.6, 0.2, 12, bp.primaryHex, 6.5, 8, 1.0);
        } else if (e.bossAttackKind === 'slam') {
          e.aiState = 'leap';
          e.stateTimer = 0.9;
          e.vy = 16.0;
          e.vx = THREE.MathUtils.clamp(dx * 1.18, -11.0, 11.0);
          audio.playJump(false);
        } else {
          const count = fast ? bp.volleyCountP2 : bp.volleyCountP1;
          const projSpd = bp.volleySpeed * (fast ? 1.18 : 1.0) * (0.9 + agg * 0.1);
          const spreadFactor = bp.volleyTripleBurst ? bp.volleySpread * 0.72 : bp.volleySpread;
          for (let k = 0; k < count; k++) {
            const spreadY = (k - (count - 1) * 0.5) * spreadFactor;
            const isCenterLance = bp.volleyTripleBurst && Math.abs(spreadY) < 0.2;
            this.spawnProjectile(
              e.x + e.facing * 1.45,
              e.y + 1.7 + spreadY * 0.34,
              e.facing * projSpd * (isCenterLance ? 1.16 : 1.0),
              spreadY * (bp.volleyTripleBurst ? 0.5 : 0.78),
              bp.volleyDamage,
              false,
              isCenterLance ? bp.secondaryHex : bp.primaryHex,
            );
          }
          audio.playSlash(2);
          vfx.flashLight(e.x + e.facing * 1.2, e.y + 1.8, bp.primaryHex, 10, 0.22);
          e.aiState = 'recover';
          e.stateTimer = (fast ? 0.52 : 0.78) * cdMult;
          e.attackCooldown = (fast ? 1.1 : 1.6) * cdMult;
        }
      }
    } else if (e.aiState === 'dash') {
      e.stateTimer -= dt;
      // Signature Kenshiro (Shogun Iaijutsu) & Solarius (Dawn Reap) dash blade wave!
      if (bp.dashReleasesBladeWave && !e.bossDashWaveFired && e.stateTimer <= 0.22) {
        e.bossDashWaveFired = true;
        const bladeSpd = bp.waveSpeed * (fast ? 1.18 : 1.0) * (0.9 + agg * 0.1);
        this.spawnProjectile(
          e.x + e.facing * 1.3,
          e.y + 1.35,
          e.facing * bladeSpd,
          0,
          Math.round(bp.volleyDamage * 1.05),
          false,
          bp.primaryHex,
        );
        if (fast) {
          this.spawnProjectile(
            e.x + e.facing * 1.3,
            e.y + 2.25,
            e.facing * (bladeSpd * 0.94),
            0.55,
            bp.volleyDamage,
            false,
            bp.secondaryHex,
          );
        }
        vfx.spawnRing(e.x + e.facing * 1.2, e.y + 1.4, bp.primaryHex, 0.3, 2.8, 0.24);
      }

      if (!e.didDealAttackHit && dist < 2.45 && Math.abs(player.y - e.y) < 2.3) {
        e.didDealAttackHit = true;
        const res = player.receiveDamage(bp.dashDamage, e.x, vfx, audio);
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
        e.stateTimer = (fast ? 0.44 : 0.66) * cdMult;
        e.attackCooldown = (fast ? 1.02 : 1.48) * cdMult;
      }
    } else if (e.aiState === 'leap') {
      e.stateTimer -= dt;
      if (e.y <= 0.08 && e.vy <= 0 && e.stateTimer < 0.72) {
        e.vx = 0;
        e.squashX = 1.25;
        e.squashY = 0.78;
        audio.playHit(true);
        vfx.flashLight(e.x, 1.0, bp.primaryHex, 13, 0.28);
        vfx.spawnRing(e.x, 0.2, bp.primaryHex, 0.5, 4.6, 0.34);
        vfx.spawnDustPuff(e.x, 0, 16);
        const waveSpd = bp.waveSpeed * (0.9 + agg * 0.1);
        this.spawnProjectile(e.x - 1.1, 0.1, -waveSpd, 0, Math.round(bp.slamDamage * 0.8), true, bp.primaryHex);
        this.spawnProjectile(e.x + 1.1, 0.1, waveSpd, 0, Math.round(bp.slamDamage * 0.8), true, bp.primaryHex);

        // Signature Sylvarok (Spore Burst), Kargath (Magma Rain) & Solarius (Zenith Flare) extra slam orbs!
        if (bp.slamSpawnsEmberRain) {
          const orbAngles = fast ? [-0.85, -0.35, 0.35, 0.85] : [-0.65, 0.65];
          for (const sideDir of orbAngles) {
            this.spawnProjectile(
              e.x + Math.sign(sideDir) * 0.8,
              1.1,
              sideDir * 10.5,
              2.6 + Math.abs(sideDir) * 1.4,
              Math.round(bp.volleyDamage * 0.9),
              false,
              bp.secondaryHex,
            );
          }
        }

        if (dist < 2.65 && player.y < 1.25) {
          const res = player.receiveDamage(bp.slamDamage, e.x, vfx, audio);
          if (res === 'parried') {
            this.stunEnemyFromParry(e, vfx);
            onPlayerHitResult('parried', true);
          } else if (res === 'guarded' || res === 'hit') {
            onPlayerHitResult(res, true);
          }
        }
        e.aiState = 'recover';
        e.stateTimer = (fast ? 0.58 : 0.86) * cdMult;
        e.attackCooldown = (fast ? 1.2 : 1.72) * cdMult;
      }
    } else if (e.aiState === 'recover') {
      e.vx *= Math.max(0, 1 - 10 * dt);
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) e.aiState = 'chase';
    }
  }

  private updateGruntStateBadge(e: EnemyEntity, elapsed: number): void {
    const fsm = e.gruntFsm;
    const mesh = e.stateBadgeMesh;
    const mat = e.stateBadgeMat;
    if (!fsm || !mesh || !mat) return;

    if (fsm.state === 'Stunned') {
      if (mat.map !== this.stunBadgeTex) {
        mat.map = this.stunBadgeTex;
        mat.needsUpdate = true;
      }
      mesh.visible = true;
      mesh.scale.set(1.22, 0.62, 1);
      mesh.position.set(0, e.height + 0.88 + Math.sin(elapsed * 9.5) * 0.08, 0.3);
      mesh.rotation.z = Math.sin(elapsed * 11) * 0.24;
      mat.opacity = 0.96;
    } else if (fsm.state === 'Aggro' && fsm.alertBadgeTimer > 0) {
      if (mat.map !== this.alertBadgeTex) {
        mat.map = this.alertBadgeTex;
        mat.needsUpdate = true;
      }
      mesh.visible = true;
      const pop = Math.min(1, (0.85 - fsm.alertBadgeTimer) / 0.14);
      const scale = 0.55 + Math.sin(pop * Math.PI * 0.65) * 0.45;
      mesh.scale.set(scale * 0.85, scale * 0.85, 1);
      mesh.position.set(0, e.height + 0.92 + pop * 0.14, 0.3);
      mesh.rotation.z = 0;
      mat.opacity = Math.min(1, fsm.alertBadgeTimer / 0.22);
    } else {
      mesh.visible = false;
    }
  }

  /**
   * Projects alive enemies outside the horizontal camera frustum into edge-pinned
   * directional HUD indicators, sorted by proximity and de-overlapped vertically per edge.
   */
  public getOffscreenIndicators(
    camera: THREE.Camera,
    playerX: number,
    viewportW: number,
    viewportH: number,
  ): OffscreenEnemyIndicator[] {
    const leftList: OffscreenEnemyIndicator[] = [];
    const rightList: OffscreenEnemyIndicator[] = [];
    const minY = 128;
    const maxY = Math.max(minY + 32, viewportH - 112);

    for (const e of this.enemies) {
      if (!e.alive) continue;

      const dist = Math.abs(e.x - playerX);
      const maxRange = e.type === 'boss' ? 30 : 28;
      if (dist > maxRange) continue;
      if (e.type === 'boss' && !this.bossTriggered && dist > 23) continue;

      _projVec.set(e.x, e.y + e.height * 0.55, 0).project(camera);

      // Inside visible horizontal viewport -> no off-screen indicator needed
      if (_projVec.z <= 1 && _projVec.x >= -0.96 && _projVec.x <= 0.96) {
        continue;
      }

      const side: 'left' | 'right' = e.x < playerX ? 'left' : 'right';
      const rawScreenY = (1 - _projVec.y) * 0.5 * viewportH;
      const screenY = THREE.MathUtils.clamp(rawScreenY, minY, maxY);

      const aggro =
        e.type === 'grunt'
          ? e.gruntFsm?.state === 'Aggro'
          : e.aiState === 'chase' ||
            e.aiState === 'windup' ||
            e.aiState === 'attack' ||
            e.aiState === 'dash' ||
            e.aiState === 'leap';

      const baseUrgency = THREE.MathUtils.clamp(1 - (dist - 6) / 22, 0, 1);
      const urgency = THREE.MathUtils.clamp(
        baseUrgency + (aggro ? 0.22 : 0) + (e.type === 'boss' ? 0.25 : 0),
        0,
        1,
      );

      const item: OffscreenEnemyIndicator = {
        id: e.id,
        type: e.type,
        label: e.shortLabel,
        accent: e.accentCss,
        side,
        screenY,
        distance: Math.max(1, Math.round(dist)),
        urgency,
        aggro,
      };

      if (side === 'left') leftList.push(item);
      else rightList.push(item);
    }

    const resolveSide = (list: OffscreenEnemyIndicator[]): OffscreenEnemyIndicator[] => {
      if (list.length <= 1) return list;
      // Keep up to 4 nearest threats per edge so HUD stays scannable
      list.sort((a, b) => a.distance - b.distance);
      const trimmed = list.slice(0, 4);
      // Sort top-to-bottom and nudge apart vertically so indicators never collide
      trimmed.sort((a, b) => a.screenY - b.screenY);
      const minGap = 46;
      for (let i = 1; i < trimmed.length; i++) {
        if (trimmed[i].screenY - trimmed[i - 1].screenY < minGap) {
          trimmed[i].screenY = trimmed[i - 1].screenY + minGap;
        }
      }
      // Pull back up cleanly if bottom overflowed maxY
      const last = trimmed[trimmed.length - 1];
      if (last.screenY > maxY) {
        const shift = last.screenY - maxY;
        for (const item of trimmed) {
          item.screenY = Math.max(minY, item.screenY - shift);
        }
      }
      return trimmed;
    };

    return [...resolveSide(leftList), ...resolveSide(rightList)];
  }

  public clearAll(): void {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      e.spriteMat.dispose();
      e.spriteTex.dispose();
      if (e.bossAuraMat) e.bossAuraMat.dispose();
      if (e.stateBadgeMat) e.stateBadgeMat.dispose();
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
    for (const tex of this.biomeAtlasCache.values()) {
      tex.dispose();
    }
    this.biomeAtlasCache.clear();
    this.loadingKeys.clear();
    this.shadowTex.dispose();
    this.alertBadgeTex.dispose();
    this.stunBadgeTex.dispose();
    this.spriteGeo.dispose();
    this.shadowGeo.dispose();
    this.badgeGeo.dispose();
    this.bossAuraGeo.dispose();
    for (const g of this.sharedGeos) g.dispose();
    for (const m of this.sharedMats) m.dispose();
    this.sharedGeos = [];
    this.sharedMats = [];
  }
}
