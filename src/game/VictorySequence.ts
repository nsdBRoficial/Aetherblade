import * as THREE from 'three';
import {
  BIOME_ORDER,
  BiomeId,
  PerformanceRank,
  StageTransitionStage,
  StageTransitionState,
  VictoryPerformanceSummary,
} from './types';
import { LevelBuilder } from './LevelBuilder';
import { PlayerController } from './PlayerController';
import { EnemyManager } from './EnemyManager';
import { ProceduralAudio, VfxManager } from './VfxAudio';
import { PostProcessingPass } from './PostProcessingPass';

const VICTORY_CELEBRATE_DURATION = 3.15;
const AREA_DEPART_DURATION = 1.25;
const AREA_ARRIVE_DURATION = 1.45;

function smoothstep01(t: number): number {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

function easeOutCubic(t: number): number {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return 1 - Math.pow(1 - u, 3);
}

export interface VictoryPerformanceInput {
  clearTimeSeconds: number;
  maxCombo: number;
  enemiesDefeated: number;
  parriesCount: number;
  hp: number;
  maxHp: number;
  damageTakenHits: number;
}

export interface VictoryCameraPose {
  camX: number;
  camY: number;
  camZ: number;
}

export interface VictorySequenceContext {
  dt: number;
  elapsed: number;
  camera: VictoryCameraPose;
  player: PlayerController;
  enemies: EnemyManager;
  level: LevelBuilder;
  vfx: VfxManager;
  audio: ProceduralAudio;
  postPass: PostProcessingPass;
  onUpdateBossAtmosphere: (dt: number) => void;
  onLoadNextArea: (targetBiome: BiomeId) => void;
  onCompleteArrival: () => void;
  onEmitHud: () => void;
}

/**
 * Computes a genuine, run-driven performance rating ('S' | 'A' | 'B' | 'C')
 * and clear bonus from the player's actual stage telemetry.
 */
export function evaluateStagePerformance(
  input: VictoryPerformanceInput,
): VictoryPerformanceSummary {
  const hpRemainingPct = Math.round(
    THREE.MathUtils.clamp((input.hp / Math.max(1, input.maxHp)) * 100, 0, 100),
  );
  const clearTimeSeconds = Math.max(1, Math.round(input.clearTimeSeconds));

  // Weighted performance points (max ~100)
  const timePts =
    clearTimeSeconds <= 75
      ? 35
      : clearTimeSeconds <= 110
        ? 27
        : clearTimeSeconds <= 150
          ? 18
          : 10;
  const comboPts = Math.min(25, input.maxCombo * 2);
  const parryPts = Math.min(20, input.parriesCount * 5);
  const survivalPts = Math.round((hpRemainingPct / 100) * 20);
  const flawlessBonusPts = input.damageTakenHits === 0 ? 15 : 0;

  const ratingScore = timePts + comboPts + parryPts + survivalPts + flawlessBonusPts;

  let rank: PerformanceRank = 'C';
  let rankTitle = 'Survivor';
  if (ratingScore >= 82) {
    rank = 'S';
    rankTitle = input.damageTakenHits === 0 ? 'Flawless Vanguard' : 'Blade Sovereign';
  } else if (ratingScore >= 64) {
    rank = 'A';
    rankTitle = 'Aether Champion';
  } else if (ratingScore >= 44) {
    rank = 'B';
    rankTitle = 'Seasoned Knight';
  }

  const timeBonus = Math.max(0, Math.round((160 - clearTimeSeconds) * 12));
  const parryBonus = input.parriesCount * 150;
  const comboBonus = input.maxCombo * 45;
  const noHitBonus = input.damageTakenHits === 0 ? 1000 : 0;
  const clearBonus = timeBonus + parryBonus + comboBonus + noHitBonus;

  return {
    clearTimeSeconds,
    maxCombo: input.maxCombo,
    enemiesDefeated: input.enemiesDefeated,
    parriesCount: input.parriesCount,
    hpRemainingPct,
    damageTakenHits: input.damageTakenHits,
    clearBonus,
    rank,
    rankTitle,
  };
}

/**
 * Orchestrates the post-boss Victory Sequence:
 * 1. 'celebrate'    — Dramatic slow-motion dilation (0.22x -> 1.0x) & panoramic camera zoom-out
 *                     revealing the conquered biome while the Boss shatters and Hero salutes.
 * 2. 'intermission' — Calm panoramic vista behind the stylized 'Stage Cleared' performance overlay.
 * 3. 'departing'    — Hero sprints rightward into the horizon while a cinema curtain closes.
 * 4. 'arriving'     — Fresh biome loads seamlessly and curtain lifts onto an establishing arrival shot.
 */
export class VictorySequence {
  public stage: StageTransitionStage = 'none';
  public fadeAlpha = 0;
  public timeScale = 1;
  public fromBiome: BiomeId = 'deep-forest';
  public toBiome: BiomeId = 'green-hills';
  public performance: VictoryPerformanceSummary | null = null;

  private timer = 0;
  private saluteDone = false;
  private sparkAccum = 0;
  private startCamX = 163.5;
  private startCamY = 4.0;
  private startCamZ = 22.2;
  private bossX = 171;

  public static getNextBiomeInfo(current: BiomeId): {
    next: BiomeId;
    isCampaignComplete: boolean;
  } {
    const idx = BIOME_ORDER.indexOf(current);
    if (idx < 0 || idx >= BIOME_ORDER.length - 1) {
      return { next: BIOME_ORDER[0], isCampaignComplete: true };
    }
    return { next: BIOME_ORDER[idx + 1], isCampaignComplete: false };
  }

  public get isBusyTransitioning(): boolean {
    return this.stage === 'departing' || this.stage === 'arriving';
  }

  public reset(): void {
    this.stage = 'none';
    this.timer = 0;
    this.fadeAlpha = 0;
    this.timeScale = 1;
    this.saluteDone = false;
    this.sparkAccum = 0;
    this.performance = null;
  }

  /**
   * Triggers the dramatic slow-motion zoom-out sequence upon Boss death.
   * Returns the computed stage performance summary so GameEngine can award the clearBonus.
   */
  public trigger(
    currentBiome: BiomeId,
    camera: VictoryCameraPose,
    bossX: number,
    perfInput: VictoryPerformanceInput,
    vfx: VfxManager,
    postPass: PostProcessingPass,
  ): VictoryPerformanceSummary {
    const { next } = VictorySequence.getNextBiomeInfo(currentBiome);
    this.stage = 'celebrate';
    this.timer = 0;
    this.fadeAlpha = 0;
    this.timeScale = 0.22;
    this.fromBiome = currentBiome;
    this.toBiome = next;
    this.saluteDone = false;
    this.sparkAccum = 0;
    this.startCamX = camera.camX;
    this.startCamY = camera.camY;
    this.startCamZ = camera.camZ;
    this.bossX = bossX;

    this.performance = evaluateStagePerformance(perfInput);

    // Visceral slow-motion death shockwave at the Boss's position
    postPass.triggerFlash(0xfde047, 0.42);
    vfx.flashLight(bossX, 2.2, 0xfacc15, 18, 0.7);
    vfx.spawnRing(bossX, 1.8, 0xfde047, 0.5, 9.2, 0.72);
    vfx.spawnRing(bossX, 1.8, 0x38bdf8, 0.35, 6.8, 0.58);

    return this.performance;
  }

  public skipCelebrateToIntermission(): boolean {
    if (this.stage === 'celebrate' && this.timer > 1.15) {
      this.stage = 'intermission';
      this.timeScale = 1;
      return true;
    }
    return false;
  }

  public startDeparture(
    currentBiome: BiomeId,
    audio: ProceduralAudio,
    targetBiome?: BiomeId,
  ): boolean {
    if (this.isBusyTransitioning || this.stage === 'none') return false;
    const { next } = VictorySequence.getNextBiomeInfo(currentBiome);
    this.fromBiome = currentBiome;
    this.toBiome = targetBiome ?? next;
    this.stage = 'departing';
    this.timer = 0;
    this.fadeAlpha = 0;
    this.timeScale = 1;
    audio.playAreaTransition();
    return true;
  }

  public beginArrival(): void {
    this.stage = 'arriving';
    this.timer = 0;
    this.fadeAlpha = 1;
    this.timeScale = 1;
  }

  public update(ctx: VictorySequenceContext): void {
    const {
      dt,
      elapsed,
      camera,
      player,
      enemies,
      level,
      vfx,
      audio,
      postPass,
      onUpdateBossAtmosphere,
      onLoadNextArea,
      onCompleteArrival,
      onEmitHud,
    } = ctx;

    this.timer += dt;
    const t = this.timer;

    if (this.stage === 'celebrate') {
      // Dramatic slow-motion time-scale curve: 0.22x at Boss death -> 0.72x salute -> 1.0x vista
      if (t < 0.85) {
        this.timeScale = 0.22;
      } else if (t < 1.95) {
        this.timeScale = THREE.MathUtils.lerp(0.22, 0.72, smoothstep01((t - 0.85) / 1.1));
      } else {
        this.timeScale = THREE.MathUtils.lerp(0.72, 1.0, smoothstep01((t - 1.95) / 1.2));
      }
      const scaledDt = dt * this.timeScale;

      // Let Boss finish its slow-motion collapse & particle burst
      if (t < 2.2) {
        enemies.update(scaledDt, elapsed, player, level, vfx, audio, () => {});
      }

      // Settle Hero cleanly onto the conquered arena floor facing right
      player.vx *= Math.max(0, 1 - 10 * scaledDt);
      if (player.y > 0) {
        player.vy = Math.max(-24, player.vy - 36 * scaledDt);
        player.y = Math.max(0, player.y + player.vy * scaledDt);
        if (player.y === 0) {
          player.vy = 0;
          player.grounded = true;
        }
      }
      player.facing = 1;
      player.animator.setFacing(1);

      // Triumphant Hero Salute Slash & Victory Fanfare as slow-motion lifts
      if (t >= 0.9 && !this.saluteDone) {
        this.saluteDone = true;
        audio.playVictoryFanfare();
        player.animator.setState('ATTACK_3', true);
        player.animator.triggerSquash(1.18, 0.88);
        postPass.triggerFlash(0xfacc15, 0.26);
        vfx.flashLight(player.x + 0.6, player.y + 1.8, 0xfacc15, 13, 0.55);
        vfx.spawnRing(player.x, player.y + 1.1, 0xfacc15, 0.35, 5.8, 0.56);
        vfx.spawnRing(player.x, player.y + 1.1, 0x38bdf8, 0.25, 4.4, 0.48);
        vfx.spawnBurst(player.x, player.y + 1.6, 0.25, 28, 0xfacc15, 7.6, 7.2, 1.2);
      } else if (t < 0.9) {
        player.animator.setState(player.y > 0.05 ? 'FALL' : 'IDLE');
      } else if (t >= 1.65) {
        player.animator.setState('IDLE');
      }

      // Celebratory golden embers rising across the widening vista
      if (t > 0.65) {
        this.sparkAccum += dt;
        if (this.sparkAccum >= 0.28) {
          this.sparkAccum = 0;
          const sx = THREE.MathUtils.lerp(player.x, this.bossX, Math.random());
          vfx.spawnBurst(sx, 0.5 + Math.random() * 2.6, 0.15, 8, 0xfde047, 4.4, 4.0, 0.9);
        }
      }

      player.syncVisuals(level);
      player.animator.update(scaledDt, false);

      // Dramatic panoramic camera ZOOM-OUT framing Hero, fallen Boss embers & 5-layer biome!
      const zoomK = easeOutCubic(t / (VICTORY_CELEBRATE_DURATION * 0.92));
      const vistaCenterX = THREE.MathUtils.clamp(
        (player.x + this.bossX) * 0.5,
        158.5,
        168.5,
      );
      camera.camX = THREE.MathUtils.lerp(this.startCamX, vistaCenterX, zoomK);
      camera.camY = THREE.MathUtils.lerp(this.startCamY, 5.05, zoomK);
      camera.camZ = THREE.MathUtils.lerp(this.startCamZ, 28.6, zoomK);

      // Restore biome daylight smoothly in real-time while particles & animation glide in slow-mo
      onUpdateBossAtmosphere(dt);
      level.update(scaledDt, camera.camX, elapsed);
      vfx.update(scaledDt, camera.camX, elapsed);

      if (t >= VICTORY_CELEBRATE_DURATION) {
        this.stage = 'intermission';
        this.timeScale = 1;
        onEmitHud();
      }
      return;
    }

    if (this.stage === 'intermission') {
      // Hold wide scenic panoramic vista behind the stylized 'Stage Cleared' performance overlay
      const damp = 1 - Math.exp(-2.2 * dt);
      const vistaX = THREE.MathUtils.clamp((player.x + this.bossX) * 0.5, 158.5, 168.5);
      camera.camX = THREE.MathUtils.lerp(camera.camX, vistaX + Math.sin(elapsed * 0.35) * 0.65, damp);
      camera.camY = THREE.MathUtils.lerp(camera.camY, 4.7, damp);
      camera.camZ = THREE.MathUtils.lerp(camera.camZ, 26.8, damp);

      player.animator.setState('IDLE');
      player.animator.update(dt, false);
      onUpdateBossAtmosphere(dt);
      level.update(dt * 0.7, camera.camX, elapsed);
      vfx.update(dt * 0.7, camera.camX, elapsed);
      return;
    }

    if (this.stage === 'departing') {
      // Hero marches briskly rightward toward the next area while the cinema curtain closes
      player.facing = 1;
      player.animator.setFacing(1);
      player.animator.setState('RUN');
      player.x += 7.4 * dt;
      player.syncVisuals(level);
      player.animator.update(dt, false);

      this.sparkAccum += dt;
      if (this.sparkAccum >= 0.16) {
        this.sparkAccum = 0;
        vfx.spawnDustPuff(player.x - 0.35, player.y, 4);
      }

      const damp = 1 - Math.exp(-3.8 * dt);
      camera.camX = THREE.MathUtils.lerp(camera.camX, player.x + 3.2, damp);
      camera.camY = THREE.MathUtils.lerp(camera.camY, 3.45, damp);
      camera.camZ = THREE.MathUtils.lerp(camera.camZ, 21.0, damp);

      this.fadeAlpha = smoothstep01((t - 0.22) / (AREA_DEPART_DURATION - 0.22));
      level.update(dt, camera.camX, elapsed);
      vfx.update(dt, camera.camX, elapsed);

      if (t >= AREA_DEPART_DURATION) {
        onLoadNextArea(this.toBiome);
      }
      return;
    }

    if (this.stage === 'arriving') {
      // Reveal the fresh biome as the hero jogs onto the starting ridge
      const jogEnd = 0.72;
      if (t < jogEnd) {
        player.animator.setState('RUN');
        player.x = THREE.MathUtils.lerp(1.4, 4.2, smoothstep01(t / jogEnd));
      } else {
        player.animator.setState('IDLE');
        player.x = 4.2;
      }
      player.y = 0;
      player.facing = 1;
      player.animator.setFacing(1);
      player.syncVisuals(level);
      player.animator.update(dt, false);

      const camK = smoothstep01(t / AREA_ARRIVE_DURATION);
      camera.camX = THREE.MathUtils.lerp(7.6, player.x + 2.5, camK);
      camera.camY = THREE.MathUtils.lerp(3.85, 3.2, camK);
      camera.camZ = THREE.MathUtils.lerp(22.8, 20.0, camK);

      this.fadeAlpha = 1 - smoothstep01((t - 0.24) / (AREA_ARRIVE_DURATION - 0.36));
      level.update(dt, camera.camX, elapsed);
      vfx.update(dt, camera.camX, elapsed);

      if (t >= AREA_ARRIVE_DURATION) {
        this.reset();
        onCompleteArrival();
      }
    }
  }

  public getSnapshot(currentBiome: BiomeId): StageTransitionState {
    const { next, isCampaignComplete } = VictorySequence.getNextBiomeInfo(currentBiome);
    const activeTransitionBiome =
      this.stage === 'departing' || this.stage === 'arriving'
        ? this.toBiome
        : currentBiome;
    const areaIndex = Math.max(1, BIOME_ORDER.indexOf(activeTransitionBiome) + 1);

    return {
      stage: this.stage,
      fadeAlpha: this.fadeAlpha,
      timeScale: this.timeScale,
      fromBiome: this.fromBiome,
      toBiome: this.stage === 'none' ? next : this.toBiome,
      areaIndex,
      totalAreas: BIOME_ORDER.length,
      isCampaignComplete,
      performance: this.performance,
    };
  }
}
