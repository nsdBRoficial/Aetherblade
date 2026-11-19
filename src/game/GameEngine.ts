import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AABB,
  BIOME_PALETTES,
  BiomeId,
  BOSS_TRIGGER_X,
  GamePhase,
  HudSnapshot,
  LEVEL_LENGTH,
  ShaderStyleMode,
} from './types';
import { LevelBuilder } from './LevelBuilder';
import { InputState, PlayerController } from './PlayerController';
import { EnemyManager } from './EnemyManager';
import { ProceduralAudio, VfxManager } from './VfxAudio';
import { PostProcessingPass } from './PostProcessingPass';

const SHADER_MODE_ORDER: ShaderStyleMode[] = ['hd2d', 'retro16', 'grade', 'off'];
const HIGH_SCORE_KEY = 'aetherblade_25d_highscore_v1';

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

export class GameEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envTex: THREE.Texture;

  // Lighting rig
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private dirLight: THREE.DirectionalLight;

  // Core game subsystems
  private biome: BiomeId = 'deep-forest';
  private level: LevelBuilder;
  private player: PlayerController;
  private enemies: EnemyManager;
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
  private spriteSource: 'attached' | 'custom' | 'procedural' = 'procedural';

  // Camera & Game Feel
  private camX = 6;
  private camY = 3.2;
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
  private queuedJump = false;
  private queuedAttack = false;
  private queuedGuard = false;
  private queuedDash = false;

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.isSoftwareGl = detectSoftwareGl();

    // Load saved high score safely
    try {
      const saved = window.localStorage.getItem(HIGH_SCORE_KEY);
      if (saved) this.highScore = Math.max(0, parseInt(saved, 10) || 0);
    } catch {
      this.highScore = 0;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    // Renderer configured per Three.js studio PBR & software-WebGL guidelines
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Scene & Studio Environment Map (PMREM RoomEnvironment)
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    pmrem.dispose();

    // 2.5D Low-FOV PerspectiveCamera at Z = 20 looking at Z = 0
    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.5, 160);
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
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 65;
    this.dirLight.shadow.camera.left = -22;
    this.dirLight.shadow.camera.right = 22;
    this.dirLight.shadow.camera.top = 18;
    this.dirLight.shadow.camera.bottom = -10;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.ambientLight, this.hemiLight, this.dirLight, this.dirLight.target);

    // Instantiate core game subsystems
    this.audio = new ProceduralAudio();
    this.vfx = new VfxManager(this.scene, pal);
    this.level = new LevelBuilder(
      this.biome,
      this.renderer.capabilities.getMaxAnisotropy(),
      this.isSoftwareGl,
    );
    this.scene.add(this.level.root);

    this.player = new PlayerController(this.scene, (kind) => {
      this.spriteSource = kind;
      this.emitHud();
    });
    this.enemies = new EnemyManager(this.scene, pal);
    this.enemies.spawnStageWave();

    // Full-scene post-processing pass: biome color grading + 4x4 Bayer dither & color quantization
    this.postPass = new PostProcessingPass(this.renderer, width, height, this.biome);

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

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.postPass.resize(width, height, this.renderer.getPixelRatio());
  };

  private handleBlur = (): void => {
    this.keysHeld.clear();
    this.mouseLeftHeld = false;
    this.mouseRightHeld = false;
  };

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

    if ((this.phase === 'gameover' || this.phase === 'victory') && code === 'KeyR') {
      this.startGame();
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
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
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
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseLeftHeld = false;
    if (e.button === 2) this.mouseRightHeld = false;
  };

  public selectBiome(biomeId: BiomeId): void {
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
    this.rebuildDebugPlatforms();

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
    this.hitStopTimer = 0;
    this.shakeIntensity = 0;
    this.queuedJump = false;
    this.queuedAttack = false;
    this.queuedGuard = false;
    this.queuedDash = false;

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
    this.enemies.spawnStageWave();
    this.vfx.clearTransient();
    this.camX = this.player.x + 2.5;
    this.camY = 3.2;

    this.setPhase('playing');
  }

  public setPhase(next: GamePhase): void {
    this.phase = next;
    if (next !== 'playing') {
      this.keysHeld.clear();
      this.mouseLeftHeld = false;
      this.mouseRightHeld = false;
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
      this.player.animator.setState('IDLE');
      this.player.animator.update(dt, false);
      this.level.update(dt, this.camX, this.elapsed);
      this.vfx.update(dt, this.camX, this.elapsed);
      this.applyCameraAndShadowFollow();
    } else if (this.phase === 'playing') {
      this.elapsed += dt;
      this.stepPlaying(dt);
    } else {
      // Paused / Victory / Game Over: keep subtle ambient particles drifting smoothly
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

    // Build edge-triggered + held input frame
    const input: InputState = {
      left: this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft'),
      right: this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight'),
      down: this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown'),
      jumpHeld:
        this.keysHeld.has('Space') ||
        this.keysHeld.has('KeyW') ||
        this.keysHeld.has('ArrowUp'),
      jumpJustPressed: this.queuedJump,
      attackJustPressed: this.queuedAttack,
      guardHeld:
        this.keysHeld.has('KeyK') ||
        this.keysHeld.has('KeyX') ||
        this.mouseRightHeld,
      guardJustPressed: this.queuedGuard,
      dashJustPressed: this.queuedDash,
    };
    this.queuedJump = false;
    this.queuedAttack = false;
    this.queuedGuard = false;
    this.queuedDash = false;

    // Trigger Boss Arena when player crosses X = 148
    if (!this.enemies.bossTriggered && this.player.x >= BOSS_TRIGGER_X) {
      this.enemies.bossTriggered = true;
      this.level.setArenaLocked(true);
      this.audio.playBossRoar();
      this.addShake(0.45);
      if (this.enemies.boss) {
        this.vfx.spawnRing(this.enemies.boss.x, 1.8, 0xf97316, 0.5, 5.5, 0.45);
      }
      this.emitHud();
    }

    // Combo decay timer
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
    }

    // Update player
    this.player.update(
      dt,
      input,
      this.level,
      this.vfx,
      this.audio,
      this.enemies.bossTriggered && !this.enemies.bossDefeated,
    );

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
            this.score += 60;
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

      // 2. Enemies & Boss
      for (const enemy of this.enemies.enemies) {
        if (!enemy.alive || enemy.lastHitByAttackId === attackId) continue;
        if (boxesOverlap(swordHitbox, this.enemies.getEnemyHurtbox(enemy))) {
          enemy.lastHitByAttackId = attackId;
          const comboMult = 1 + Math.min(this.combo, 20) * 0.03;
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
          this.comboTimer = 3.2;
          this.score += defeated
            ? enemy.type === 'boss'
              ? 2500
              : enemy.type === 'brute'
                ? 300
                : 150
            : 25;

          if (defeated) {
            this.enemiesDefeated++;
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

    // Update enemies & projectiles
    this.enemies.update(
      dt,
      this.elapsed,
      this.player,
      this.level,
      this.vfx,
      this.audio,
      (res, heavy) => {
        if (res === 'parried') {
          this.parriesCount++;
          this.combo += 2;
          this.comboTimer = 3.5;
          this.score += 120;
          this.hitStopTimer = 0.075;
          this.addShake(0.32);
          this.postPass.triggerFlash(0x38bdf8, 0.34);
          this.saveHighScoreIfNeeded();
        } else if (res === 'hit') {
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
      this.level.setArenaLocked(false);
      this.saveHighScoreIfNeeded();
      this.setPhase('victory');
    }

    // Update world, particles, and damped 2.5D camera
    this.level.update(dt, this.camX, this.elapsed);
    this.vfx.update(dt, this.camX, this.elapsed);

    // Camera target: smooth look-ahead to the right, or locked smoothly on Boss Arena
    let targetCamX: number;
    let targetCamY: number;
    if (this.enemies.bossTriggered && !this.enemies.bossDefeated) {
      targetCamX = 163.5;
      targetCamY = 3.9;
    } else {
      const lookAhead = this.player.facing === 1 ? 2.65 : -1.1;
      targetCamX = THREE.MathUtils.clamp(this.player.x + lookAhead, 4.5, LEVEL_LENGTH - 8);
      targetCamY = THREE.MathUtils.clamp(this.player.y * 0.48 + 3.1, 2.8, 7.6);
    }

    const camDampX = 1 - Math.exp(-5.6 * dt);
    const camDampY = 1 - Math.exp(-4.2 * dt);
    this.camX = THREE.MathUtils.lerp(this.camX, targetCamX, camDampX);
    this.camY = THREE.MathUtils.lerp(this.camY, targetCamY, camDampY);
    this.shakeIntensity *= Math.exp(-11 * dt);
    if (this.shakeIntensity < 0.005) this.shakeIntensity = 0;

    this.applyCameraAndShadowFollow();
    if (this.debugEnabled) {
      this.updateDebugOverlay();
    }
  }

  private applyCameraAndShadowFollow(): void {
    const sx = (Math.random() - 0.5) * 2 * this.shakeIntensity;
    const sy = (Math.random() - 0.5) * 2 * this.shakeIntensity;
    this.camera.position.set(this.camX + sx, this.camY + sy, 20);
    this.camera.lookAt(this.camX + sx * 0.35, this.camY - 0.65 + sy * 0.35, 0);

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

    const pal = BIOME_PALETTES[this.biome];
    const bossEntity = this.enemies.boss;

    const viewportW = Math.max(1, this.container.clientWidth);
    const viewportH = Math.max(1, this.container.clientHeight);

    this.onHudUpdate({
      phase: this.phase,
      biome: this.biome,
      hp: Math.ceil(this.player.hp),
      maxHp: this.player.maxHp,
      stamina: Math.round(this.player.stamina),
      maxStamina: this.player.maxStamina,
      score: this.score,
      highScore: this.highScore,
      combo: this.combo,
      comboTimer: THREE.MathUtils.clamp(this.comboTimer / 3.2, 0, 1),
      progress,
      zone,
      enemiesDefeated: this.enemiesDefeated,
      parriesCount: this.parriesCount,
      muted: this.audio.muted,
      debugHitboxes: this.debugEnabled,
      shaderMode: this.postPass.mode,
      boss: {
        active: this.enemies.bossTriggered && !!bossEntity && bossEntity.alive,
        name: pal.bossName,
        title: pal.bossTitle,
        hp: bossEntity ? Math.ceil(bossEntity.hp) : 0,
        maxHp: bossEntity ? bossEntity.maxHp : 440,
        phase: bossEntity ? bossEntity.bossPhase : 1,
      },
      floatingTexts: this.vfx.projectFloatingTexts(this.camera, viewportW, viewportH),
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
