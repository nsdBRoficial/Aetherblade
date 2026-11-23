import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AABB,
  BIOME_PALETTES,
  BiomeId,
  BOSS_TRIGGER_X,
  DIFFICULTY_PRESETS,
  DifficultyId,
  GamePhase,
  getComboDamageMultiplier,
  HudSnapshot,
  LEVEL_LENGTH,
  ShaderStyleMode,
} from './types';
import { LevelBuilder } from './LevelBuilder';
import { InputState, PlayerController } from './PlayerController';
import { EnemyManager } from './EnemyManager';
import { ProceduralAudio, VfxManager } from './VfxAudio';
import { PostProcessingPass } from './PostProcessingPass';
import { VictorySequence } from './VictorySequence';
import { MagicUpdateCallbacks, PlayerMagicSystem } from './PlayerMagicSystem';
import { ExecutionCallbacks, ExecutionSystem } from './ExecutionSystem';
import { BIOME_ROSTERS } from './BiomeRoster';

const SHADER_MODE_ORDER: ShaderStyleMode[] = ['hd2d', 'retro16', 'grade', 'off'];
const HIGH_SCORE_KEY = 'aetherblade_25d_highscore_v1';
const DIFFICULTY_KEY = 'aetherblade_25d_difficulty_v1';
const BOSS_INTRO_DURATION = 2.35;

function smoothstep01(t: number): number {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

// Reusable scratch colors for zero-GC dynamic boss lighting interpolation
const _fogCol = new THREE.Color();
const _sunCol = new THREE.Color();
const _hemiSkyCol = new THREE.Color();
const _hemiGndCol = new THREE.Color();
const _ambCol = new THREE.Color();
const _skyTintCol = new THREE.Color();
const _panoTintCol = new THREE.Color();
const _bossFogPhase1 = new THREE.Color(0x281220);
const _bossFogPhase2 = new THREE.Color(0x2e0b14);
const _bossSunPhase1 = new THREE.Color(0xff9c6b);
const _bossSunPhase2 = new THREE.Color(0xff5238);
const _bossHemiSky1 = new THREE.Color(0x6b3556);
const _bossHemiSky2 = new THREE.Color(0x8c2432);
const _bossSkyTint1 = new THREE.Color(0x7c586e);
const _bossSkyTint2 = new THREE.Color(0x5e2932);
const _bossPanoTint1 = new THREE.Color(0x8c6878);
const _bossPanoTint2 = new THREE.Color(0x733a42);
const _whiteCol = new THREE.Color(0xffffff);

function boxesOverlap(a: AABB, b: AABB): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) * 0.5 &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function detectSoftwareGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function detectMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
  const mobileUa =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
  return coarsePointer || mobileUa || (touchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 900);
}

export class GameEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;

  private isSoftwareGl: boolean;
  public readonly isMobile: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envTex: THREE.Texture;

  // Lighting rig
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private dirLight: THREE.DirectionalLight;
  private bossSpotLight: THREE.PointLight;

  // Core game subsystems
  private biome: BiomeId = 'deep-forest';
  private difficulty: DifficultyId = 'knight';
  private level: LevelBuilder;
  private player: PlayerController;
  private enemies: EnemyManager;
  private magic: PlayerMagicSystem;
  private execution: ExecutionSystem;
  private vfx: VfxManager;
  private audio: ProceduralAudio;
  private postPass: PostProcessingPass;

  // Simulation state
  private phase: GamePhase = 'title';
  private score = 0;
  private highScore = 0;
  private combo = 0;
  private comboTimer = 0;
  private enemiesDefeated = 0;
  private parriesCount = 0;
  private stageElapsed = 0;
  private stageMaxCombo = 0;
  private stageEnemiesDefeated = 0;
  private stageParriesCount = 0;
  private stageDamageHits = 0;
  private spriteSource: 'attached' | 'custom' | 'procedural' = 'procedural';

  // Camera, Boss Intro Choreography, VictorySequence & Dynamic Multi-Phase Atmosphere
  private camX = 6;
  private camY = 3.2;
  private camZ = 20;
  private bossIntroActive = false;
  private bossIntroTimer = 0;
  private bossIntroRoared = false;
  private bossIntroStartX = 148;
  private bossIntroStartY = 3.2;
  private bossAtmosphereLevel = 0;
  private lastBossPhase: 1 | 2 = 1;
  private victorySeq = new VictorySequence();
  private shakeIntensity = 0;
  private hitStopTimer = 0;
  private elapsed = 0;
  private lastTime = 0;
  private frameId = 0;
  private hudEmitAccum = 0;
  private disposed = false;

  // Debug hitbox overlay (F2)
  private debugEnabled = false;
  private debugGroup: THREE.Group;
  private debugBoxGeo: THREE.EdgesGeometry;
  private debugMatPlayer: THREE.LineBasicMaterial;
  private debugMatAttack: THREE.LineBasicMaterial;
  private debugMatEnemy: THREE.LineBasicMaterial;
  private debugMatPlat: THREE.LineBasicMaterial;
  private debugPlayerWire: THREE.LineSegments;
  private debugAttackWire: THREE.LineSegments;
  private debugEnemyWires: THREE.LineSegments[] = [];
  private debugPlatWires: THREE.LineSegments[] = [];

  // Input buffers (held vs edge-triggered)
  private keysHeld = new Set<string>();
  private mouseLeftHeld = false;
  private mouseRightHeld = false;
  private touchLeft = false;
  private touchRight = false;
  private touchDown = false;
  private touchJumpHeld = false;
  private touchAttackHeld = false;
  private touchGuardHeld = false;
  private queuedJump = false;
  private queuedAttack = false;
  private queuedAttackRelease = false;
  private queuedGuard = false;
  private queuedGuardRelease = false;
  private queuedDash = false;
  private queuedExecute = false;
  private queuedQuickSpell: 'wave' | 'nova' | null = null;

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.isSoftwareGl = detectSoftwareGl();
    this.isMobile = detectMobileDevice();

    // Load saved high score & difficulty safely
    try {
      const saved = window.localStorage.getItem(HIGH_SCORE_KEY);
      if (saved) this.highScore = Math.max(0, parseInt(saved, 10) || 0);
      const savedDiff = window.localStorage.getItem(DIFFICULTY_KEY) as DifficultyId | null;
      if (savedDiff && savedDiff in DIFFICULTY_PRESETS) {
        this.difficulty = savedDiff;
      }
    } catch {
      this.highScore = 0;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    // Renderer configured per Three.js studio PBR & mobile GPU bandwidth guidelines
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && !this.isMobile,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    const maxDpr = this.isMobile ? 1.35 : 2;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = this.isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // Scene & Studio Environment Map (PMREM RoomEnvironment)
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    pmrem.dispose();

    // 2.5D Low-FOV PerspectiveCamera at Z = 20 looking at Z = 0
    this.camera = new THREE.PerspectiveCamera(this.computeCameraFov(width, height), width / height, 0.5, 160);
    this.camera.position.set(6, 3.3, 20);
    this.camera.lookAt(6, 2.3, 0);

    // Biome-driven 3-point outdoor lighting rig
    const pal = BIOME_PALETTES[this.biome];
    this.scene.background = new THREE.Color(pal.fogColor);
    this.scene.fog = new THREE.FogExp2(pal.fogColor, pal.fogDensity);

    this.ambientLight = new THREE.AmbientLight(pal.ambientColor, pal.ambientIntensity);
    this.hemiLight = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, 0.85);
    this.dirLight = new THREE.DirectionalLight(pal.sunColor, pal.sunIntensity);
    this.dirLight.position.set(16, 26, 14);
    this.dirLight.castShadow = !this.isSoftwareGl;
    const shadowRes = this.isMobile ? 512 : 1024;
    this.dirLight.shadow.mapSize.set(shadowRes, shadowRes);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 65;
    this.dirLight.shadow.camera.left = -22;
    this.dirLight.shadow.camera.right = 22;
    this.dirLight.shadow.camera.top = 18;
    this.dirLight.shadow.camera.bottom = -10;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    this.bossSpotLight = new THREE.PointLight(0xff5a2a, 0, 24, 1.45);
    this.bossSpotLight.position.set(171, 3.2, 3.4);
    this.scene.add(
      this.ambientLight,
      this.hemiLight,
      this.dirLight,
      this.dirLight.target,
      this.bossSpotLight,
    );

    // Instantiate core game subsystems
    this.audio = new ProceduralAudio();
    this.vfx = new VfxManager(this.scene, pal, this.isMobile);
    this.level = new LevelBuilder(
      this.biome,
      this.isMobile ? Math.min(2, this.renderer.capabilities.getMaxAnisotropy()) : this.renderer.capabilities.getMaxAnisotropy(),
      this.isSoftwareGl,
    );
    this.scene.add(this.level.root);

    this.player = new PlayerController(this.scene, (kind) => {
      this.spriteSource = kind;
      this.emitHud();
    });
    this.enemies = new EnemyManager(this.scene, pal);
    this.magic = new PlayerMagicSystem(this.scene);
    this.execution = new ExecutionSystem(this.scene);

    // Apply initial difficulty tuning before spawning wave
    const diffCfg = DIFFICULTY_PRESETS[this.difficulty];
    this.player.incomingDamageMult = diffCfg.playerDamageMult;
    this.enemies.setDifficulty(diffCfg);
    this.enemies.spawnStageWave();

    // Full-scene post-processing pass: biome color grading + 4x4 Bayer dither & color quantization
    this.postPass = new PostProcessingPass(this.renderer, width, height, this.biome, this.isMobile);

    // Debug F2 hitbox group
    this.debugGroup = new THREE.Group();
    this.debugGroup.visible = false;
    this.debugBoxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 0.4));
    this.debugMatPlayer = new THREE.LineBasicMaterial({ color: 0x22c55e });
    this.debugMatAttack = new THREE.LineBasicMaterial({ color: 0xef4444 });
    this.debugMatEnemy = new THREE.LineBasicMaterial({ color: 0xfacc15 });
    this.debugMatPlat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });

    this.debugPlayerWire = new THREE.LineSegments(this.debugBoxGeo, this.debugMatPlayer);
    this.debugAttackWire = new THREE.LineSegments(this.debugBoxGeo, this.debugMatAttack);
    this.debugGroup.add(this.debugPlayerWire, this.debugAttackWire);
    this.rebuildDebugPlatforms();
    this.scene.add(this.debugGroup);

    // Pre-compile shaders on GPU to eliminate first-frame stutter
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud();
    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.renderer.domElement.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.renderer.domElement.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private computeCameraFov(width: number, height: number): number {
    const aspect = width / Math.max(1, height);
    if (height < 520 && aspect >= 1.65) {
      // Slightly wider crisp framing on ultra-wide phone landscape viewports (19.5:9 / 20:9)
      return aspect > 2.0 ? 31.5 : 33;
    }
    if (aspect < 1.1) {
      // Portrait fallback keeps enough horizontal corridor visibility
      return 44;
    }
    return 34;
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.fov = this.computeCameraFov(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.postPass.resize(width, height, this.renderer.getPixelRatio());
  };

  private handleBlur = (): void => {
    this.keysHeld.clear();
    this.mouseLeftHeld = false;
    this.mouseRightHeld = false;
    this.clearTouchInputs();
  };

  // =========================================================================
  // MOBILE VIRTUAL TOUCH INPUT BRIDGE (Multi-touch safe, zero desktop clash)
  // =========================================================================
  public unlockAudio(): void {
    this.audio.unlock();
  }

  public setTouchMove(left: boolean, right: boolean, down: boolean): void {
    this.audio.unlock();
    this.touchLeft = left;
    this.touchRight = right;
    this.touchDown = down;
  }

  public setTouchJump(pressed: boolean): void {
    this.audio.unlock();
    if (pressed && !this.touchJumpHeld && this.phase === 'playing') {
      this.queuedJump = true;
    }
    this.touchJumpHeld = pressed;
  }

  public setTouchAttack(pressed: boolean): void {
    this.audio.unlock();
    if (pressed && !this.touchAttackHeld && this.phase === 'playing') {
      this.queuedAttack = true;
    } else if (!pressed && this.touchAttackHeld) {
      this.queuedAttackRelease = true;
    }
    this.touchAttackHeld = pressed;
  }

  public setTouchGuard(pressed: boolean): void {
    this.audio.unlock();
    if (pressed && !this.touchGuardHeld && this.phase === 'playing') {
      this.queuedGuard = true;
    } else if (!pressed && this.touchGuardHeld) {
      this.queuedGuardRelease = true;
    }
    this.touchGuardHeld = pressed;
  }

  public triggerTouchDash(): void {
    this.audio.unlock();
    if (this.phase === 'playing') {
      this.queuedDash = true;
    }
  }

  public triggerTouchExecute(): void {
    this.audio.unlock();
    if (this.phase === 'playing') {
      this.queuedExecute = true;
    }
  }

  public triggerQuickSpell(kind: 'wave' | 'nova'): void {
    this.audio.unlock();
    if (this.phase === 'playing') {
      this.queuedQuickSpell = kind;
    }
  }

  public clearTouchInputs(): void {
    this.touchLeft = false;
    this.touchRight = false;
    this.touchDown = false;
    this.touchJumpHeld = false;
    this.touchAttackHeld = false;
    this.touchGuardHeld = false;
    this.queuedQuickSpell = null;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.audio.unlock();
    const code = e.code;

    if (code === 'F2') {
      e.preventDefault();
      this.toggleDebugHitboxes();
      return;
    }

    if (code === 'F3') {
      e.preventDefault();
      this.cycleShaderMode();
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (this.phase === 'playing') {
        this.setPhase('paused');
        return;
      }
      if (this.phase === 'paused') {
        this.setPhase('playing');
        return;
      }
    }

    if (this.phase === 'title' && (code === 'Enter' || code === 'Space')) {
      e.preventDefault();
      this.startGame();
      return;
    }

    if (this.phase === 'victory' && (code === 'Enter' || code === 'Space')) {
      e.preventDefault();
      if (this.victorySeq.stage === 'intermission') {
        this.advanceToNextArea();
      } else if (this.victorySeq.skipCelebrateToIntermission()) {
        this.emitHud();
      }
      return;
    }

    if ((this.phase === 'gameover' || this.phase === 'victory') && code === 'KeyR') {
      if (!this.victorySeq.isBusyTransitioning) {
        this.startGame();
      }
      return;
    }

    if (
      ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)
    ) {
      e.preventDefault();
    }

    const wasHeld = this.keysHeld.has(code);
    this.keysHeld.add(code);

    if (!wasHeld && this.phase === 'playing') {
      if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') {
        this.queuedJump = true;
      }
      if (code === 'KeyJ' || code === 'KeyZ') {
        this.queuedAttack = true;
      }
      if (code === 'KeyK' || code === 'KeyX') {
        this.queuedGuard = true;
      }
      if (code === 'KeyL' || code === 'ShiftLeft' || code === 'ShiftRight') {
        this.queuedDash = true;
      }
      if (code === 'KeyE' || code === 'KeyQ') {
        this.queuedExecute = true;
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const code = e.code;
    this.keysHeld.delete(code);
    if (
      (code === 'KeyJ' || code === 'KeyZ') &&
      !this.mouseLeftHeld &&
      !this.keysHeld.has('KeyJ') &&
      !this.keysHeld.has('KeyZ')
    ) {
      this.queuedAttackRelease = true;
    }
    if (
      (code === 'KeyK' || code === 'KeyX') &&
      !this.mouseRightHeld &&
      !this.keysHeld.has('KeyK') &&
      !this.keysHeld.has('KeyX')
    ) {
      this.queuedGuardRelease = true;
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    this.audio.unlock();
    if (this.phase !== 'playing') return;
    if (e.button === 0) {
      this.mouseLeftHeld = true;
      this.queuedAttack = true;
    } else if (e.button === 2) {
      this.mouseRightHeld = true;
      this.queuedGuard = true;
    } else if (e.button === 1) {
      e.preventDefault();
      this.queuedExecute = true;
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mouseLeftHeld = false;
      if (!this.keysHeld.has('KeyJ') && !this.keysHeld.has('KeyZ')) {
        this.queuedAttackRelease = true;
      }
    }
    if (e.button === 2) {
      this.mouseRightHeld = false;
      if (!this.keysHeld.has('KeyK') && !this.keysHeld.has('KeyX')) {
        this.queuedGuardRelease = true;
      }
    }
  };

  public selectDifficulty(diff: DifficultyId): void {
    if (!(diff in DIFFICULTY_PRESETS)) return;
    this.difficulty = diff;
    const cfg = DIFFICULTY_PRESETS[diff];
    this.player.incomingDamageMult = cfg.playerDamageMult;
    this.enemies.setDifficulty(cfg);
    try {
      window.localStorage.setItem(DIFFICULTY_KEY, diff);
    } catch {
      // Ignore storage restrictions
    }
    this.emitHud();
  }

  public selectBiome(biomeId: BiomeId): void {
    // From Victory Intermission, switching areas uses the full cinematic walk-out transition
    if (this.phase === 'victory' && this.victorySeq.stage === 'intermission') {
      this.advanceToNextArea(biomeId);
      return;
    }
    if (this.biome === biomeId) return;
    this.biome = biomeId;
    const pal = BIOME_PALETTES[biomeId];

    // Swap lighting & fog to new biome palette
    this.scene.background = new THREE.Color(pal.fogColor);
    this.scene.fog = new THREE.FogExp2(pal.fogColor, pal.fogDensity);
    this.ambientLight.color.setHex(pal.ambientColor);
    this.ambientLight.intensity = pal.ambientIntensity;
    this.hemiLight.color.setHex(pal.hemiSky);
    this.hemiLight.groundColor.setHex(pal.hemiGround);
    this.dirLight.color.setHex(pal.sunColor);
    this.dirLight.intensity = pal.sunIntensity;

    // Rebuild 5-layer level & biome particles
    this.scene.remove(this.level.root);
    this.level.dispose();
    this.level = new LevelBuilder(
      biomeId,
      this.renderer.capabilities.getMaxAnisotropy(),
      this.isSoftwareGl,
    );
    this.scene.add(this.level.root);

    this.vfx.configureBiomeParticles(pal, this.camX);
    this.postPass.setBiome(biomeId);

    // Preserve decoded enemy sprite atlases while updating biome palette
    this.enemies.setPalette(pal);
    this.enemies.spawnStageWave();
    this.magic.clear();
    this.execution.clear();
    this.rebuildDebugPlatforms();

    this.bossIntroActive = false;
    this.bossIntroTimer = 0;
    this.bossIntroRoared = false;
    this.bossAtmosphereLevel = 0;
    this.lastBossPhase = 1;
    this.bossSpotLight.intensity = 0;
    this.postPass.setBossIntensity(0);
    this.victorySeq.reset();

    if (this.phase !== 'title') {
      this.startGame();
    } else {
      this.emitHud();
    }
  }

  public startGame(): void {
    this.audio.unlock();
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.enemiesDefeated = 0;
    this.parriesCount = 0;
    this.resetStageMetrics();
    this.hitStopTimer = 0;
    this.shakeIntensity = 0;
    this.queuedJump = false;
    this.queuedAttack = false;
    this.queuedAttackRelease = false;
    this.queuedGuard = false;
    this.queuedGuardRelease = false;
    this.queuedDash = false;
    this.queuedExecute = false;

    // Reset level props & boss barriers cleanly
    this.scene.remove(this.level.root);
    this.level.dispose();
    this.level = new LevelBuilder(
      this.biome,
      this.renderer.capabilities.getMaxAnisotropy(),
      this.isSoftwareGl,
    );
    this.scene.add(this.level.root);
    this.rebuildDebugPlatforms();

    this.player.reset();
    const diffCfg = DIFFICULTY_PRESETS[this.difficulty];
    this.player.incomingDamageMult = diffCfg.playerDamageMult;
    this.enemies.setDifficulty(diffCfg);
    this.enemies.spawnStageWave();
    this.magic.clear();
    this.execution.clear();
    this.vfx.clearTransient();
    this.camX = this.player.x + 2.5;
    this.camY = 3.2;
    this.camZ = 20;
    this.bossIntroActive = false;
    this.bossIntroTimer = 0;
    this.bossIntroRoared = false;
    this.bossAtmosphereLevel = 0;
    this.lastBossPhase = 1;
    this.victorySeq.reset();
    this.resetAtmosphereToBiome();

    this.setPhase('playing');
  }

  private resetStageMetrics(): void {
    this.stageElapsed = 0;
    this.stageMaxCombo = 0;
    this.stageEnemiesDefeated = 0;
    this.stageParriesCount = 0;
    this.stageDamageHits = 0;
  }

  public advanceToNextArea(targetBiome?: BiomeId): void {
    if (this.phase !== 'victory') return;
    this.audio.unlock();
    if (this.victorySeq.startDeparture(this.biome, this.audio, targetBiome)) {
      this.emitHud();
    }
  }

  public setPhase(next: GamePhase): void {
    this.phase = next;
    if (next !== 'playing') {
      this.keysHeld.clear();
      this.mouseLeftHeld = false;
      this.mouseRightHeld = false;
      this.clearTouchInputs();
    }
    if (next === 'title') {
      this.victorySeq.reset();
    }
    this.emitHud();
  }

  public toggleMute(): void {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.emitHud();
  }

  public toggleDebugHitboxes(): void {
    this.debugEnabled = !this.debugEnabled;
    this.debugGroup.visible = this.debugEnabled;
    this.emitHud();
  }

  public cycleShaderMode(): void {
    const idx = SHADER_MODE_ORDER.indexOf(this.postPass.mode);
    const next = SHADER_MODE_ORDER[(idx + 1) % SHADER_MODE_ORDER.length];
    this.postPass.setMode(next);
    this.emitHud();
  }

  public loadCustomSpritesheet(file: File, cols = 9, rows = 4): void {
    const url = URL.createObjectURL(file);
    this.player.animator.loadCustomUniformSheet(url, cols, rows);
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    if (this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick(): void {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.phase === 'title') {
      this.elapsed += dt;
      // Atmospheric live-world camera glide over the biome on Title Screen
      const panX = 11 + Math.sin(this.elapsed * 0.28) * 6.5;
      this.camX = THREE.MathUtils.lerp(this.camX, panX, 1 - Math.exp(-3 * dt));
      this.camY = 3.3 + Math.sin(this.elapsed * 0.5) * 0.25;
      this.camZ = THREE.MathUtils.lerp(this.camZ, 20, 1 - Math.exp(-3 * dt));
      this.player.animator.setState('IDLE');
      this.player.animator.update(dt, false);
      this.level.update(dt, this.camX, this.elapsed);
      this.vfx.update(dt, this.camX, this.elapsed);
      this.applyCameraAndShadowFollow();
    } else if (this.phase === 'playing') {
      this.elapsed += dt;
      this.stepPlaying(dt);
    } else if (this.phase === 'victory') {
      this.elapsed += dt;
      this.stepVictoryAndTransition(dt);
    } else {
      // Paused / Game Over: keep subtle ambient particles drifting smoothly
      this.elapsed += dt * 0.35;
      this.vfx.update(dt * 0.35, this.camX, this.elapsed);
    }

    this.postPass.update(dt);
    this.postPass.render(this.renderer, this.scene, this.camera);

    // Throttle React HUD updates to ~20Hz while keeping canvas at full 60fps
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.05) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }

    this.scheduleNextFrame();
  }

  private stepPlaying(dt: number): void {
    // Hit-stop freeze frame (keeps rendering & shake decay silky while pausing simulation!)
    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
      this.shakeIntensity *= Math.exp(-12 * dt);
      this.applyCameraAndShadowFollow();
      return;
    }

    // Build edge-triggered + held input frame (keyboard + mouse + mobile virtual touch controls)
    const input: InputState = {
      left: this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') || this.touchLeft,
      right: this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') || this.touchRight,
      down: this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') || this.touchDown,
      jumpHeld:
        this.keysHeld.has('Space') ||
        this.keysHeld.has('KeyW') ||
        this.keysHeld.has('ArrowUp') ||
        this.touchJumpHeld,
      jumpJustPressed: this.queuedJump,
      attackHeld:
        this.keysHeld.has('KeyJ') ||
        this.keysHeld.has('KeyZ') ||
        this.mouseLeftHeld ||
        this.touchAttackHeld,
      attackJustPressed: this.queuedAttack,
      attackJustReleased: this.queuedAttackRelease,
      guardHeld:
        this.keysHeld.has('KeyK') ||
        this.keysHeld.has('KeyX') ||
        this.mouseRightHeld ||
        this.touchGuardHeld,
      guardJustPressed: this.queuedGuard,
      guardJustReleased: this.queuedGuardRelease,
      dashJustPressed: this.queuedDash,
      executeJustPressed: this.queuedExecute,
    };
    const quickSpell = this.queuedQuickSpell;
    this.queuedJump = false;
    this.queuedAttack = false;
    this.queuedAttackRelease = false;
    this.queuedGuard = false;
    this.queuedGuardRelease = false;
    this.queuedDash = false;
    this.queuedExecute = false;
    this.queuedQuickSpell = null;

    // Handle automated cinematic Boss Intro Camera Pan when active
    if (this.bossIntroActive) {
      this.stepBossIntro(dt);
      return;
    }

    // Trigger automated Boss Intro Pan & Lighting Shift when player approaches the Boss Arena
    if (!this.enemies.bossTriggered && !this.bossIntroActive && this.player.x >= BOSS_TRIGGER_X) {
      this.bossIntroActive = true;
      this.bossIntroTimer = 0;
      this.bossIntroRoared = false;
      this.bossIntroStartX = this.camX;
      this.bossIntroStartY = this.camY;
      this.level.setArenaLocked(true);
      this.queuedJump = false;
      this.queuedAttack = false;
      this.queuedAttackRelease = false;
      this.queuedGuard = false;
      this.queuedGuardRelease = false;
      this.queuedDash = false;
      this.queuedExecute = false;
      this.emitHud();
      return;
    }

    this.stageElapsed += dt;

    // Combo decay timer
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
    }

    const diffCfg = DIFFICULTY_PRESETS[this.difficulty];
    const scoreMult = diffCfg.scoreMult;
    const magicCallbacks: MagicUpdateCallbacks = {
      onEnemyHit: (ev) => {
        this.combo++;
        if (this.combo > this.stageMaxCombo) this.stageMaxCombo = this.combo;
        this.comboTimer = 3.5;
        if (ev.refundStamina > 0) {
          this.player.stamina = Math.min(
            this.player.maxStamina,
            this.player.stamina + ev.refundStamina,
          );
        }
        const basePts = ev.defeated
          ? ev.enemy.type === 'boss'
            ? 2500
            : ev.enemy.type === 'brute'
              ? 300
              : 150
          : 35;
        this.score += Math.round(basePts * scoreMult);
        if (ev.defeated) {
          this.enemiesDefeated++;
          this.stageEnemiesDefeated++;
          if (ev.enemy.type !== 'boss' && Math.random() < 0.34) {
            this.level.spawnPickup(ev.enemy.x, ev.enemy.y, this.player.hp < 75 ? 'heal' : 'gem');
          }
        }
        if (ev.heavy || ev.defeated) {
          this.hitStopTimer = Math.max(this.hitStopTimer, ev.defeated ? 0.055 : 0.032);
          this.addShake(ev.defeated ? 0.3 : 0.16);
        }
        this.saveHighScoreIfNeeded();
      },
      onPropDestroyed: (px, py, isCrystal) => {
        this.addShake(0.14);
        this.score += Math.round(60 * scoreMult);
        const dropHeal =
          isCrystal || this.player.hp < this.player.maxHp * 0.72 || Math.random() < 0.45;
        this.level.spawnPickup(px, py, dropHeal ? 'heal' : 'gem');
      },
      onProjectileVaporized: () => {
        this.combo++;
        if (this.combo > this.stageMaxCombo) this.stageMaxCombo = this.combo;
        this.comboTimer = 3.5;
        this.score += Math.round(45 * scoreMult);
        this.saveHighScoreIfNeeded();
      },
      onScreenPulse: (colorHex, flashStrength, shake) => {
        this.postPass.triggerFlash(colorHex, flashStrength);
        this.addShake(shake);
      },
    };

    const executionCallbacks: ExecutionCallbacks = {
      onEnemyHit: (ev) => {
        this.combo += ev.comboGain;
        if (this.combo > this.stageMaxCombo) this.stageMaxCombo = this.combo;
        this.comboTimer = 3.5;
        if (ev.staminaRefund > 0) {
          this.player.stamina = Math.min(
            this.player.maxStamina,
            this.player.stamina + ev.staminaRefund,
          );
        }
        const basePts = ev.defeated
          ? ev.enemy.type === 'boss'
            ? 2500
            : ev.enemy.type === 'brute'
              ? 360
              : ev.executed
                ? 280
                : 180
          : 55;
        this.score += Math.round(basePts * scoreMult);
        if (ev.defeated) {
          this.enemiesDefeated++;
          this.stageEnemiesDefeated++;
          if (ev.enemy.type !== 'boss' && Math.random() < 0.45) {
            this.level.spawnPickup(ev.enemy.x, ev.enemy.y, this.player.hp < 80 ? 'heal' : 'gem');
          }
        }
        this.saveHighScoreIfNeeded();
      },
      onPropDestroyed: (px, py, isCrystal) => {
        this.score += Math.round(60 * scoreMult);
        const dropHeal =
          isCrystal || this.player.hp < this.player.maxHp * 0.72 || Math.random() < 0.45;
        this.level.spawnPickup(px, py, dropHeal ? 'heal' : 'gem');
      },
      onProjectileVaporized: () => {
        this.combo++;
        if (this.combo > this.stageMaxCombo) this.stageMaxCombo = this.combo;
        this.comboTimer = 3.5;
        this.score += Math.round(50 * scoreMult);
        this.saveHighScoreIfNeeded();
      },
      onShake: (amount) => {
        this.addShake(amount);
      },
    };

    const spellCallbacks = {
      onCastAetherWave: (chargeLevel: number) => {
        const comboMult = getComboDamageMultiplier(this.combo).mult;
        this.magic.castAetherWave(
          this.player,
          chargeLevel,
          comboMult,
          this.vfx,
          this.audio,
          magicCallbacks,
        );
      },
      onCastAegisNova: (chargeLevel: number) => {
        const comboMult = getComboDamageMultiplier(this.combo).mult;
        this.magic.castAegisNova(
          this.player,
          chargeLevel,
          comboMult,
          this.enemies,
          this.vfx,
          this.audio,
          magicCallbacks,
        );
      },
      onTriggerExecution: () => {
        const comboMult = getComboDamageMultiplier(this.combo).mult;
        this.execution.trigger(
          this.biome,
          this.player,
          this.camX,
          comboMult,
          this.enemies,
          this.vfx,
          this.audio,
          this.postPass,
          executionCallbacks,
        );
        this.emitHud();
      },
    };

    // Update player (hold-to-charge spells + 3-Hit Combo Biome Execution Finisher)
    this.player.update(
      dt,
      input,
      this.level,
      this.vfx,
      this.audio,
      this.enemies.bossTriggered && !this.enemies.bossDefeated,
      spellCallbacks,
    );

    // Handle dedicated mobile quick-spell tap (one-tap Aether Wave / Aegis Nova)
    if (quickSpell) {
      this.player.triggerQuickSpell(quickSpell, this.vfx, this.audio, spellCallbacks);
    }

    // Update active screen-wide Biome Execution sequence (full fluidity even during slow-mo beat)
    this.execution.update(
      dt,
      this.enemies,
      this.level,
      this.vfx,
      this.audio,
      this.postPass,
      executionCallbacks,
    );

    // Update active player magic projectiles (Aether Blade Waves & Homing Sanctum Orbs)
    this.magic.update(dt, this.enemies, this.level, this.vfx, this.audio, magicCallbacks);

    // Check player sword hitbox against destructible props & enemies
    const swordHitbox = this.player.getAttackHitbox();
    if (swordHitbox) {
      const { damage, heavy, knockbackX } = this.player.getAttackDamage();
      const attackId = this.player.attackInstanceId;

      // 1. Destructible props (barrels, crates, crystals)
      for (const prop of this.level.props) {
        if (prop.destroyed) continue;
        const propBox: AABB = {
          x: prop.x,
          y: prop.y,
          width: prop.width,
          height: prop.height,
        };
        if (boxesOverlap(swordHitbox, propBox)) {
          prop.hp -= heavy ? 2 : 1;
          prop.hitFlash = 0.14;
          if (prop.hp <= 0) {
            prop.destroyed = true;
            this.level.root.remove(prop.group);
            this.audio.playBreakProp();
            this.addShake(0.16);
            this.score += Math.round(60 * scoreMult);
            const burstColor =
              prop.kind === 'crystal' ? this.level.palette.torchColor : 0xb5834a;
            this.vfx.spawnBurst(prop.x, prop.y + 0.6, 0.1, 16, burstColor, 6.5, 18, 0.95);
            // Crystals & low-HP barrels reliably drop Heal Orbs!
            const dropHeal =
              prop.kind === 'crystal' ||
              this.player.hp < this.player.maxHp * 0.72 ||
              Math.random() < 0.45;
            this.level.spawnPickup(prop.x, prop.y, dropHeal ? 'heal' : 'gem');
          } else {
            this.audio.playHit(false);
            this.vfx.spawnBurst(prop.x, prop.y + 0.6, 0.1, 7, 0xc99a62, 4.5, 16, 0.7);
          }
        }
      }

      // 2. Enemies & Boss (with tiered combo damage multipliers up to 2.40x!)
      for (const enemy of this.enemies.enemies) {
        if (!enemy.alive || enemy.lastHitByAttackId === attackId) continue;
        if (boxesOverlap(swordHitbox, this.enemies.getEnemyHurtbox(enemy))) {
          enemy.lastHitByAttackId = attackId;
          const comboMult = getComboDamageMultiplier(this.combo).mult;
          const finalDmg = Math.round(damage * comboMult);
          const defeated = this.enemies.damageEnemy(
            enemy,
            finalDmg,
            this.player.facing * knockbackX,
            heavy,
            this.vfx,
            this.audio,
          );

          this.combo++;
          if (this.combo > this.stageMaxCombo) this.stageMaxCombo = this.combo;
          this.comboTimer = 3.5;
          const basePts = defeated
            ? enemy.type === 'boss'
              ? 2500
              : enemy.type === 'brute'
                ? 300
                : 150
            : 25;
          this.score += Math.round(basePts * scoreMult);

          if (defeated) {
            this.enemiesDefeated++;
            this.stageEnemiesDefeated++;
            if (enemy.type !== 'boss' && Math.random() < 0.32) {
              this.level.spawnPickup(enemy.x, enemy.y, this.player.hp < 75 ? 'heal' : 'gem');
            }
          }

          this.hitStopTimer = heavy || defeated ? 0.068 : 0.04;
          this.addShake(heavy || defeated ? 0.34 : 0.14);
          if (heavy || defeated) {
            this.postPass.triggerFlash(
              enemy.type === 'boss' ? 0xfbbf24 : 0x38bdf8,
              enemy.type === 'boss' ? 0.34 : 0.16,
            );
          }
          this.saveHighScoreIfNeeded();
        }
      }
    }

    // Pickup collection
    const pHurt = this.player.getHurtbox();
    for (const orb of this.level.pickups) {
      if (orb.collected) continue;
      if (
        Math.abs(orb.x - pHurt.x) < 1.05 &&
        Math.abs(orb.y - (pHurt.y + 0.85)) < 1.25
      ) {
        orb.collected = true;
        this.audio.playHeal();
        if (orb.kind === 'heal') {
          const gained = this.player.heal(25);
          this.vfx.spawnFloatingText(
            this.player.x,
            this.player.y + 0.5,
            gained > 0 ? `+${gained} HP` : 'MAX HP',
            '#34d399',
            1.1,
          );
          this.vfx.spawnBurst(orb.x, orb.y, 0.1, 12, 0x34d399, 5, 8, 0.85);
        } else {
          this.score += 180;
          this.vfx.spawnFloatingText(this.player.x, this.player.y + 0.5, '+180', '#facc15', 1.05);
          this.vfx.spawnBurst(orb.x, orb.y, 0.1, 12, 0xfacc15, 5, 10, 0.85);
          this.saveHighScoreIfNeeded();
        }
      }
    }

    // Update enemies & projectiles (with brief cinematic slow-mo dilation during Biome Execution)
    const worldDt = dt * this.execution.getTimeScale();
    this.enemies.update(
      worldDt,
      this.elapsed,
      this.player,
      this.level,
      this.vfx,
      this.audio,
      (res, heavy) => {
        if (res === 'parried') {
          this.parriesCount++;
          this.stageParriesCount++;
          this.combo += 2;
          if (this.combo > this.stageMaxCombo) this.stageMaxCombo = this.combo;
          this.comboTimer = 3.5;
          this.score += 120;
          this.hitStopTimer = 0.075;
          this.addShake(0.32);
          this.postPass.triggerFlash(0x38bdf8, 0.34);
          this.saveHighScoreIfNeeded();
        } else if (res === 'hit') {
          this.stageDamageHits++;
          this.combo = 0;
          this.comboTimer = 0;
          this.hitStopTimer = heavy ? 0.06 : 0.035;
          this.addShake(heavy ? 0.42 : 0.26);
          this.postPass.triggerFlash(0xf43f5e, heavy ? 0.26 : 0.16);
        } else if (res === 'guarded') {
          this.addShake(0.14);
        }
      },
    );

    // Check Victory / Game Over transitions
    if (this.player.isDead) {
      this.saveHighScoreIfNeeded();
      this.setPhase('gameover');
    } else if (this.enemies.bossDefeated) {
      this.startVictoryScene();
      return;
    }

    // Detect multi-phase Boss Phase 2 transition for dramatic lighting surge & screen pulse
    const bossEntity = this.enemies.boss;
    if (bossEntity && bossEntity.alive && bossEntity.bossPhase === 2 && this.lastBossPhase === 1) {
      this.lastBossPhase = 2;
      const bossColor = BIOME_ROSTERS[this.biome].boss.primaryHex;
      this.addShake(0.55);
      this.postPass.triggerFlash(bossColor, 0.44);
    }

    // Update dynamic multi-phase boss environment lighting
    this.updateBossAtmosphere(dt);

    // Update world, particles, and damped 2.5D camera
    this.level.update(worldDt, this.camX, this.elapsed);
    this.vfx.update(dt, this.camX, this.elapsed);

    // Camera target: smooth look-ahead, approaching sanctum pull-back, or wide Boss Arena framing
    let targetCamX: number;
    let targetCamY: number;
    let targetCamZ = 20;
    if (this.enemies.bossTriggered && !this.enemies.bossDefeated) {
      targetCamX = 163.5;
      targetCamY = 4.0;
      targetCamZ = 22.2;
    } else {
      const approach = THREE.MathUtils.clamp((this.player.x - 130) / 18, 0, 1);
      const lookAhead = this.player.facing === 1 ? 2.65 + approach * 1.45 : -1.1;
      targetCamX = THREE.MathUtils.clamp(this.player.x + lookAhead, 4.5, LEVEL_LENGTH - 8);
      targetCamY = THREE.MathUtils.clamp(this.player.y * 0.48 + 3.1 + approach * 0.4, 2.8, 7.6);
      targetCamZ = 20 + approach * 0.85;
    }
    targetCamZ += this.execution.getCameraZoomOffset();

    const camDampX = 1 - Math.exp(-5.6 * dt);
    const camDampY = 1 - Math.exp(-4.2 * dt);
    const camDampZ = 1 - Math.exp(-3.4 * dt);
    this.camX = THREE.MathUtils.lerp(this.camX, targetCamX, camDampX);
    this.camY = THREE.MathUtils.lerp(this.camY, targetCamY, camDampY);
    this.camZ = THREE.MathUtils.lerp(this.camZ, targetCamZ, camDampZ);
    this.shakeIntensity *= Math.exp(-11 * dt);
    if (this.shakeIntensity < 0.005) this.shakeIntensity = 0;

    this.applyCameraAndShadowFollow();
    if (this.debugEnabled) {
      this.updateDebugOverlay();
    }
  }

  private stepBossIntro(dt: number): void {
    this.bossIntroTimer += dt;
    const t = this.bossIntroTimer;
    const boss = this.enemies.boss;
    const bossX = boss ? boss.x : 171;

    // Gently settle hero onto the arena floor in a combat-ready stance facing the Boss
    this.player.vx *= Math.max(0, 1 - 10 * dt);
    if (this.player.y > 0) {
      this.player.vy = Math.max(-24, this.player.vy - 36 * dt);
      this.player.y = Math.max(0, this.player.y + this.player.vy * dt);
      if (this.player.y === 0) {
        this.player.vy = 0;
        this.player.grounded = true;
      }
    }
    this.player.facing = 1;
    this.player.animator.setFacing(1);
    this.player.animator.setState(this.player.y > 0.05 ? 'FALL' : 'IDLE');
    this.player.syncVisuals(this.level);
    this.player.animator.update(dt, false);

    // 3-Beat Automated Camera Choreography:
    //   0.00..0.85s -> Smooth pan + dolly close-up onto the Boss
    //   0.85..1.60s -> Hold dramatic framing while Boss roars & ignites arena lighting
    //   1.60..2.35s -> Smooth pull-back to wide Boss Arena tactical framing
    const bossFocusX = bossX - 0.6;
    const bossFocusY = 3.5;
    const bossFocusZ = 15.0;
    const arenaCenterX = 163.5;
    const arenaCenterY = 4.0;
    const arenaCenterZ = 22.2;

    if (t < 0.85) {
      const k = smoothstep01(t / 0.85);
      this.camX = THREE.MathUtils.lerp(this.bossIntroStartX, bossFocusX, k);
      this.camY = THREE.MathUtils.lerp(this.bossIntroStartY, bossFocusY, k);
      this.camZ = THREE.MathUtils.lerp(20.6, bossFocusZ, k);
    } else if (t < 1.6) {
      this.camX = bossFocusX;
      this.camY = bossFocusY;
      this.camZ = bossFocusZ;
      if (!this.bossIntroRoared) {
        this.bossIntroRoared = true;
        const bp = BIOME_ROSTERS[this.biome].boss;
        this.audio.playBossRoar();
        this.addShake(0.52);
        this.postPass.triggerFlash(bp.primaryHex, 0.36);
        this.vfx.flashLight(bossX, 2.2, bp.primaryHex, 15, 0.45);
        this.vfx.spawnRing(bossX, 2.0, bp.primaryHex, 0.45, 6.2, 0.5);
        this.vfx.spawnBurst(bossX, 2.0, 0.25, 28, bp.secondaryHex, 8.5, 10, 1.35);
      }
    } else {
      const k = smoothstep01((t - 1.6) / (BOSS_INTRO_DURATION - 1.6));
      this.camX = THREE.MathUtils.lerp(bossFocusX, arenaCenterX, k);
      this.camY = THREE.MathUtils.lerp(bossFocusY, arenaCenterY, k);
      this.camZ = THREE.MathUtils.lerp(bossFocusZ, arenaCenterZ, k);
    }

    this.shakeIntensity *= Math.exp(-8 * dt);
    if (this.shakeIntensity < 0.005) this.shakeIntensity = 0;

    this.updateBossAtmosphere(dt);
    this.level.update(dt, this.camX, this.elapsed);
    this.vfx.update(dt, this.camX, this.elapsed);
    this.applyCameraAndShadowFollow();

    if (t >= BOSS_INTRO_DURATION) {
      this.bossIntroActive = false;
      this.enemies.bossTriggered = true;
      this.emitHud();
    }
  }

  private startVictoryScene(): void {
    this.level.setArenaLocked(false);
    const bossX = this.enemies.boss ? this.enemies.boss.x : 171;
    const summary = this.victorySeq.trigger(
      this.biome,
      { camX: this.camX, camY: this.camY, camZ: this.camZ },
      bossX,
      {
        clearTimeSeconds: this.stageElapsed,
        maxCombo: this.stageMaxCombo,
        enemiesDefeated: this.stageEnemiesDefeated,
        parriesCount: this.stageParriesCount,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        damageTakenHits: this.stageDamageHits,
      },
      this.vfx,
      this.postPass,
    );
    // Award stage clear bonus from genuine performance telemetry
    this.score += summary.clearBonus;
    this.saveHighScoreIfNeeded();
    this.hitStopTimer = 0;
    this.setPhase('victory');
  }

  private stepVictoryAndTransition(dt: number): void {
    const camPose = { camX: this.camX, camY: this.camY, camZ: this.camZ };
    this.victorySeq.update({
      dt,
      elapsed: this.elapsed,
      camera: camPose,
      player: this.player,
      enemies: this.enemies,
      level: this.level,
      vfx: this.vfx,
      audio: this.audio,
      postPass: this.postPass,
      onUpdateBossAtmosphere: (stepDt) => this.updateBossAtmosphere(stepDt),
      onLoadNextArea: (targetBiome) => this.loadNextAreaForArrival(targetBiome),
      onCompleteArrival: () => this.setPhase('playing'),
      onEmitHud: () => this.emitHud(),
    });
    this.camX = camPose.camX;
    this.camY = camPose.camY;
    this.camZ = camPose.camZ;
    this.shakeIntensity *= Math.exp(-9 * dt);
    if (this.shakeIntensity < 0.005) this.shakeIntensity = 0;
    this.applyCameraAndShadowFollow();
  }

  private loadNextAreaForArrival(targetBiome: BiomeId): void {
    this.biome = targetBiome;
    const pal = BIOME_PALETTES[targetBiome];

    // Rebuild 5-layer level, biome particles, palette & enemies while preserving campaign score
    this.scene.remove(this.level.root);
    this.level.dispose();
    this.level = new LevelBuilder(
      targetBiome,
      this.renderer.capabilities.getMaxAnisotropy(),
      this.isSoftwareGl,
    );
    this.scene.add(this.level.root);

    this.vfx.clearTransient();
    this.magic.clear();
    this.execution.clear();
    this.vfx.configureBiomeParticles(pal, 6);
    this.postPass.setBiome(targetBiome);
    this.enemies.setPalette(pal);
    this.enemies.setDifficulty(DIFFICULTY_PRESETS[this.difficulty]);
    this.enemies.spawnStageWave();
    this.rebuildDebugPlatforms();

    // Restore Hero Vitality & Stamina for the fresh area, staged at western entrance
    this.player.reset();
    this.player.x = 1.4;
    this.player.y = 0;
    this.player.facing = 1;
    this.player.animator.setFacing(1);
    this.player.syncVisuals(this.level);

    this.resetStageMetrics();
    this.combo = 0;
    this.comboTimer = 0;
    this.hitStopTimer = 0;
    this.shakeIntensity = 0;
    this.bossIntroActive = false;
    this.bossIntroTimer = 0;
    this.bossIntroRoared = false;
    this.bossAtmosphereLevel = 0;
    this.lastBossPhase = 1;
    this.resetAtmosphereToBiome();

    this.camX = 7.6;
    this.camY = 3.85;
    this.camZ = 22.8;
    this.victorySeq.beginArrival();
    this.applyCameraAndShadowFollow();
    this.emitHud();
  }

  private resetAtmosphereToBiome(): void {
    const pal = BIOME_PALETTES[this.biome];
    this.scene.background = new THREE.Color(pal.fogColor);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(pal.fogColor);
      this.scene.fog.density = pal.fogDensity;
    }
    this.ambientLight.color.setHex(pal.ambientColor);
    this.ambientLight.intensity = pal.ambientIntensity;
    this.hemiLight.color.setHex(pal.hemiSky);
    this.hemiLight.groundColor.setHex(pal.hemiGround);
    this.hemiLight.intensity = 0.85;
    this.dirLight.color.setHex(pal.sunColor);
    this.dirLight.intensity = pal.sunIntensity;
    this.bossSpotLight.intensity = 0;
    this.level.setAtmosphereTint(_whiteCol, _whiteCol);
    this.postPass.setBossIntensity(0);
  }

  private updateBossAtmosphere(dt: number): void {
    const pal = BIOME_PALETTES[this.biome];
    const boss = this.enemies.boss;

    let targetMood = 0;
    if (this.enemies.bossDefeated) {
      targetMood = 0;
    } else if (boss && boss.alive && boss.bossPhase === 2) {
      targetMood = 1.0; // Phase II Enraged Crimson Eclipse
    } else if (this.enemies.bossTriggered) {
      targetMood = 0.62; // Phase I Boss Twilight Sanctum
    } else if (this.bossIntroActive) {
      targetMood = THREE.MathUtils.lerp(0.28, 0.66, smoothstep01(this.bossIntroTimer / 1.15));
    } else if (this.player.x > 130) {
      // Subtle atmospheric foreshadowing as the player approaches the Boss Arena
      targetMood = THREE.MathUtils.clamp((this.player.x - 130) / 18, 0, 1) * 0.28;
    }

    const rate = targetMood > this.bossAtmosphereLevel ? 3.2 : 1.8;
    this.bossAtmosphereLevel = THREE.MathUtils.lerp(
      this.bossAtmosphereLevel,
      targetMood,
      1 - Math.exp(-rate * dt),
    );

    const lvl = this.bossAtmosphereLevel;
    const p1 = THREE.MathUtils.clamp(lvl / 0.62, 0, 1);
    const p2 = THREE.MathUtils.clamp((lvl - 0.62) / 0.38, 0, 1);

    // 1. Dynamic Fog & Background Shift
    _fogCol.setHex(pal.fogColor).lerp(_bossFogPhase1, p1 * 0.62).lerp(_bossFogPhase2, p2 * 0.65);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(_fogCol);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_fogCol);
      this.scene.fog.density = pal.fogDensity + p1 * 0.0055 + p2 * 0.004;
    }

    // 2. Dynamic Sun, Hemisphere & Ambient Rig Shift
    _sunCol.setHex(pal.sunColor).lerp(_bossSunPhase1, p1 * 0.65).lerp(_bossSunPhase2, p2 * 0.72);
    this.dirLight.color.copy(_sunCol);
    this.dirLight.intensity = pal.sunIntensity * (1 - p1 * 0.32 - p2 * 0.14);

    _hemiSkyCol.setHex(pal.hemiSky).lerp(_bossHemiSky1, p1 * 0.68).lerp(_bossHemiSky2, p2 * 0.7);
    _hemiGndCol.setHex(pal.hemiGround).lerp(_bossFogPhase2, lvl * 0.55);
    this.hemiLight.color.copy(_hemiSkyCol);
    this.hemiLight.groundColor.copy(_hemiGndCol);
    this.hemiLight.intensity = 0.85 * (1 - p1 * 0.35 - p2 * 0.15);

    _ambCol.setHex(pal.ambientColor).lerp(_bossFogPhase1, lvl * 0.55);
    this.ambientLight.color.copy(_ambCol);
    this.ambientLight.intensity = pal.ambientIntensity * (1 - p1 * 0.28);

    // 3. Painted Sky & Far Mountain Twilight/Eclipse Tint
    _skyTintCol.copy(_whiteCol).lerp(_bossSkyTint1, p1).lerp(_bossSkyTint2, p2);
    _panoTintCol.copy(_whiteCol).lerp(_bossPanoTint1, p1).lerp(_bossPanoTint2, p2);
    this.level.setAtmosphereTint(_skyTintCol, _panoTintCol);

    // 4. Dramatic Flickering Boss Arena Spotlight tinted to the active Biome Boss
    if (boss && boss.alive && lvl > 0.18) {
      const bp = BIOME_ROSTERS[this.biome].boss;
      this.bossSpotLight.position.set(boss.x, boss.y + 3.2, 3.6);
      const pulseSpeed = p2 > 0.2 ? 12.0 : 5.5;
      const flicker = 1 + Math.sin(this.elapsed * pulseSpeed) * (p2 > 0.2 ? 0.22 : 0.12);
      this.bossSpotLight.color.setHex(p2 > 0.35 ? bp.secondaryHex : bp.primaryHex);
      this.bossSpotLight.intensity = (p1 * 11.0 + p2 * 8.0) * flicker;
    } else {
      this.bossSpotLight.intensity = 0;
    }

    // 5. Post-Processing Color Grade, Vignette & Bloom Tension Boost
    this.postPass.setBossIntensity(lvl);
  }

  private applyCameraAndShadowFollow(): void {
    const sx = (Math.random() - 0.5) * 2 * this.shakeIntensity;
    const sy = (Math.random() - 0.5) * 2 * this.shakeIntensity;
    const isCompactLandscape =
      this.container.clientHeight < 520 && this.container.clientWidth > this.container.clientHeight;
    // Slight camera framing lift on compact mobile landscape screens keeps the action plane clear of thumb controls
    const zAdjust = isCompactLandscape ? -1.1 : 0;
    const lookYOffset = isCompactLandscape ? -0.92 : -0.65;
    this.camera.position.set(this.camX + sx, this.camY + sy, this.camZ + zAdjust);
    this.camera.lookAt(this.camX + sx * 0.35, this.camY + lookYOffset + sy * 0.35, 0);

    // Keep shadow frustum centered around active camera X
    this.dirLight.position.set(this.camX + 12, 24, 14);
    this.dirLight.target.position.set(this.camX, 0, 0);
    this.dirLight.target.updateMatrixWorld();
  }

  private addShake(amount: number): void {
    this.shakeIntensity = Math.min(0.68, Math.max(this.shakeIntensity, amount));
  }

  private saveHighScoreIfNeeded(): void {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try {
        window.localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
      } catch {
        // Ignore storage restrictions
      }
    }
  }

  private rebuildDebugPlatforms(): void {
    for (const w of this.debugPlatWires) this.debugGroup.remove(w);
    this.debugPlatWires = [];
    for (const p of this.level.platforms) {
      const wire = new THREE.LineSegments(this.debugBoxGeo, this.debugMatPlat);
      wire.position.set(p.x, p.y - p.thickness * 0.5, 0.25);
      wire.scale.set(p.width, p.thickness, 1);
      this.debugGroup.add(wire);
      this.debugPlatWires.push(wire);
    }
  }

  private updateDebugOverlay(): void {
    const ph = this.player.getHurtbox();
    this.debugPlayerWire.position.set(ph.x, ph.y + ph.height * 0.5, 0.3);
    this.debugPlayerWire.scale.set(ph.width, ph.height, 1);

    const ah = this.player.getAttackHitbox();
    if (ah) {
      this.debugAttackWire.visible = true;
      this.debugAttackWire.position.set(ah.x, ah.y + ah.height * 0.5, 0.35);
      this.debugAttackWire.scale.set(ah.width, ah.height, 1);
    } else {
      this.debugAttackWire.visible = false;
    }

    // Sync enemy wireframes
    const aliveEnemies = this.enemies.enemies.filter((e) => e.alive);
    while (this.debugEnemyWires.length < aliveEnemies.length) {
      const w = new THREE.LineSegments(this.debugBoxGeo, this.debugMatEnemy);
      this.debugGroup.add(w);
      this.debugEnemyWires.push(w);
    }
    for (let i = 0; i < this.debugEnemyWires.length; i++) {
      const wire = this.debugEnemyWires[i];
      if (i < aliveEnemies.length) {
        const eh = this.enemies.getEnemyHurtbox(aliveEnemies[i]);
        wire.visible = true;
        wire.position.set(eh.x, eh.y + eh.height * 0.5, 0.3);
        wire.scale.set(eh.width, eh.height, 1);
      } else {
        wire.visible = false;
      }
    }
  }

  private emitHud(): void {
    const progress = THREE.MathUtils.clamp(this.player.x / LEVEL_LENGTH, 0, 1);
    const zone: 1 | 2 | 3 | 4 =
      this.player.x >= BOSS_TRIGGER_X
        ? 4
        : this.player.x >= 95
          ? 3
          : this.player.x >= 45
            ? 2
            : 1;

    const bossEntity = this.enemies.boss;

    const viewportW = Math.max(1, this.container.clientWidth);
    const viewportH = Math.max(1, this.container.clientHeight);

    this.onHudUpdate({
      phase: this.phase,
      biome: this.biome,
      difficulty: this.difficulty,
      hp: Math.ceil(this.player.hp),
      maxHp: this.player.maxHp,
      stamina: Math.round(this.player.stamina),
      maxStamina: this.player.maxStamina,
      score: this.score,
      highScore: this.highScore,
      combo: this.combo,
      comboTimer: THREE.MathUtils.clamp(this.comboTimer / 3.5, 0, 1),
      comboMultiplier: getComboDamageMultiplier(this.combo).mult,
      slashStep: this.player.attackStep > 0 ? this.player.attackStep : this.player.lastSlashStep,
      slashMultiplier: this.player.lastSlashMult,
      attackCharge: this.player.attackCharge,
      guardCharge: this.player.guardCharge,
      execution: this.execution.getHudState(
        this.biome,
        this.player.executionWindowTimer,
        PlayerController.EXECUTION_WINDOW_MAX,
      ),
      progress,
      zone,
      enemiesDefeated: this.enemiesDefeated,
      parriesCount: this.parriesCount,
      muted: this.audio.muted,
      debugHitboxes: this.debugEnabled,
      shaderMode: this.postPass.mode,
      boss: {
        active: this.enemies.bossTriggered && !!bossEntity && bossEntity.alive,
        introActive: this.bossIntroActive,
        name: BIOME_ROSTERS[this.biome].boss.name,
        title: BIOME_ROSTERS[this.biome].boss.title,
        accent: BIOME_ROSTERS[this.biome].boss.accentCss,
        hp: bossEntity ? Math.ceil(bossEntity.hp) : 0,
        maxHp: bossEntity ? bossEntity.maxHp : BIOME_ROSTERS[this.biome].boss.maxHp,
        phase: bossEntity ? bossEntity.bossPhase : 1,
      },
      transition: this.victorySeq.getSnapshot(this.biome),
      floatingTexts: this.vfx.projectFloatingTexts(this.camera, viewportW, viewportH),
      offscreenEnemies:
        this.phase === 'playing' && !this.bossIntroActive
          ? this.enemies.getOffscreenIndicators(
              this.camera,
              this.player.x,
              viewportW,
              viewportH,
            )
          : [],
      spriteSource: this.spriteSource,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();

    this.level.dispose();
    this.player.dispose();
    this.enemies.dispose();
    this.magic.dispose();
    this.execution.dispose();
    this.vfx.dispose();
    this.audio.dispose();
    this.postPass.dispose();

    this.debugBoxGeo.dispose();
    this.debugMatPlayer.dispose();
    this.debugMatAttack.dispose();
    this.debugMatEnemy.dispose();
    this.debugMatPlat.dispose();
    this.envTex.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
