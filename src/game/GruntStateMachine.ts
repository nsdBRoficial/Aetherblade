import * as THREE from 'three';
import { PlayerController } from './PlayerController';
import { ProceduralAudio, VfxManager } from './VfxAudio';
import type { EnemyEntity } from './EnemyManager';

/**
 * Top-level Finite State Machine states for Goblin Grunts.
 */
export type GruntState = 'Patrol' | 'Aggro' | 'Stunned';

export type GruntPatrolPhase = 'march' | 'lookout';
export type GruntAggroPhase =
  | 'alert'
  | 'pursue'
  | 'strafe'
  | 'windup'
  | 'attack'
  | 'recover';

export type GruntArchetype = 'skirmisher' | 'berserker' | 'flanker';
export type GruntAttackKind = 'cleave' | 'lunge';

export interface GruntFsmData {
  state: GruntState;
  patrolPhase: GruntPatrolPhase;
  aggroPhase: GruntAggroPhase;
  phaseTimer: number;
  aggroMemory: number;
  poise: number;
  maxPoise: number;
  poiseRegenDelay: number;
  archetype: GruntArchetype;
  attackKind: GruntAttackKind;
  patrolRadius: number;
  lungeCooldown: number;
  alertBadgeTimer: number;
}

export interface GruntUpdateContext {
  dt: number;
  elapsed: number;
  player: PlayerController;
  allEnemies: EnemyEntity[];
  dx: number;
  dy: number;
  dist: number;
  aggression: number;
  cooldownMult: number;
  vfx: VfxManager;
  audio: ProceduralAudio;
  onPlayerHitResult: (res: 'parried' | 'guarded' | 'hit', heavy: boolean) => void;
  onParried: (e: EnemyEntity) => void;
}

export interface GruntTransitionOptions {
  stunDuration?: number;
  skipAlert?: boolean;
  alertNearby?: boolean;
  fromParry?: boolean;
}

const ARCHETYPE_CYCLE: GruntArchetype[] = ['skirmisher', 'berserker', 'flanker'];

interface ArchetypeTuning {
  patrolSpeed: number;
  chaseSpeed: number;
  maxPoise: number;
  windupCleave: number;
  windupLunge: number;
  attackCooldown: number;
  lungeCooldown: number;
  patrolRadius: number;
  backstepChance: number;
}

const ARCHETYPE_TUNING: Record<GruntArchetype, ArchetypeTuning> = {
  skirmisher: {
    patrolSpeed: 2.15,
    chaseSpeed: 4.55,
    maxPoise: 32,
    windupCleave: 0.38,
    windupLunge: 0.44,
    attackCooldown: 0.95,
    lungeCooldown: 3.1,
    patrolRadius: 3.8,
    backstepChance: 0.65,
  },
  berserker: {
    patrolSpeed: 1.9,
    chaseSpeed: 5.15,
    maxPoise: 46,
    windupCleave: 0.34,
    windupLunge: 0.4,
    attackCooldown: 0.78,
    lungeCooldown: 2.4,
    patrolRadius: 2.8,
    backstepChance: 0.15,
  },
  flanker: {
    patrolSpeed: 2.35,
    chaseSpeed: 4.85,
    maxPoise: 34,
    windupCleave: 0.36,
    windupLunge: 0.38,
    attackCooldown: 0.88,
    lungeCooldown: 2.1,
    patrolRadius: 4.4,
    backstepChance: 0.45,
  },
};

/**
 * Dedicated Finite State Machine governing Goblin Grunts across
 * 'Patrol', 'Aggro', and 'Stunned' states with tactical variety:
 * - Patrol: corridor march + lookout scan pauses + directional sightline & pack alerts
 * - Aggro: startled alert hop, squad attack-spacing strafe, close cleave, leaping lunge & skirmisher disengage hop
 * - Stunned: poise-break / parry stagger lockout, dizzy visual cue, and +35% stagger damage vulnerability
 */
export class GruntStateMachine {
  public createData(spawnIndex: number): GruntFsmData {
    const archetype = ARCHETYPE_CYCLE[spawnIndex % ARCHETYPE_CYCLE.length];
    const tuning = ARCHETYPE_TUNING[archetype];
    return {
      state: 'Patrol',
      patrolPhase: 'march',
      aggroPhase: 'pursue',
      phaseTimer: 1.4 + (spawnIndex % 3) * 0.55,
      aggroMemory: 0,
      poise: tuning.maxPoise,
      maxPoise: tuning.maxPoise,
      poiseRegenDelay: 0,
      archetype,
      attackKind: 'cleave',
      patrolRadius: tuning.patrolRadius,
      lungeCooldown: 0.9 + (spawnIndex % 3) * 0.4,
      alertBadgeTimer: 0,
    };
  }

  public getState(e: EnemyEntity): GruntState {
    return e.gruntFsm ? e.gruntFsm.state : 'Patrol';
  }

  /**
   * Centralized state transition with deterministic onExit / onEnter hooks.
   */
  public transition(
    e: EnemyEntity,
    next: GruntState,
    vfx: VfxManager,
    allEnemies?: EnemyEntity[],
    options: GruntTransitionOptions = {},
  ): void {
    const fsm = e.gruntFsm;
    if (!fsm || !e.alive) return;

    const prev = fsm.state;
    const isReEnteringStun = prev === 'Stunned' && next === 'Stunned';
    if (prev === next && !isReEnteringStun) return;

    // --- onExit(prev) ---
    if (prev === 'Aggro') {
      e.telegraphMat.opacity = 0;
      e.didDealAttackHit = false;
    } else if (prev === 'Stunned') {
      // Refill poise cleanly upon recovering from Stunned state
      fsm.poise = fsm.maxPoise;
      fsm.poiseRegenDelay = 0;
    }

    // --- Commit next state ---
    fsm.state = next;

    // --- onEnter(next) ---
    if (next === 'Patrol') {
      fsm.patrolPhase = 'march';
      fsm.phaseTimer = 1.6 + Math.random() * 1.1;
      fsm.aggroMemory = 0;
      fsm.alertBadgeTimer = 0;
      e.aiState = 'patrol';
      e.telegraphMat.opacity = 0;
    } else if (next === 'Aggro') {
      fsm.aggroMemory = 3.8;
      if (prev === 'Patrol' && !options.skipAlert) {
        // Tactile spotted reaction beat: startled hop + HDR '!' badge
        fsm.aggroPhase = 'alert';
        fsm.phaseTimer = 0.24;
        fsm.alertBadgeTimer = 0.85;
        e.vx = 0;
        if (e.y <= 0.15) {
          e.vy = 3.4;
        }
        e.squashX = 0.86;
        e.squashY = 1.22;
        e.aiState = 'chase';

        // Pack coordination: alert nearby patrolling grunts within warcry radius
        if (options.alertNearby !== false && allEnemies) {
          for (const ally of allEnemies) {
            if (
              ally.id !== e.id &&
              ally.alive &&
              ally.type === 'grunt' &&
              ally.gruntFsm &&
              ally.gruntFsm.state === 'Patrol' &&
              Math.abs(ally.x - e.x) < 7.8
            ) {
              this.transition(ally, 'Aggro', vfx, undefined, {
                skipAlert: false,
                alertNearby: false,
              });
            }
          }
        }
      } else {
        fsm.aggroPhase = 'pursue';
        fsm.phaseTimer = 0.35;
        e.aiState = 'chase';
      }
    } else if (next === 'Stunned') {
      const duration = options.stunDuration ?? 1.1;
      e.stateTimer = Math.max(isReEnteringStun ? e.stateTimer : 0, duration);
      e.aiState = 'stunned';
      e.telegraphMat.opacity = 0;
      e.didDealAttackHit = false;
      fsm.alertBadgeTimer = 0;
      fsm.poise = 0;
      e.squashX = 0.8;
      e.squashY = 1.22;

      if (!options.fromParry) {
        vfx.spawnRing(e.x, e.y + e.height * 0.65, 0xfacc15, 0.2, 1.55, 0.26);
      }
    }
  }

  /**
   * Handles incoming hit impact on a Grunt:
   * - Returns `{ bonusMultiplier, triggeredStun }` so EnemyManager can apply Stagger Bonus damage.
   * - Wakes up patrolling Grunts immediately into 'Aggro' if not stunned.
   * - Chips away poise on light hits and triggers 'Stunned' on poise break, heavy hits, or reflected shots.
   */
  public onHit(
    e: EnemyEntity,
    rawDamage: number,
    heavy: boolean,
    isReflected: boolean,
    vfx: VfxManager,
    allEnemies: EnemyEntity[],
  ): { bonusMultiplier: number; triggeredStun: boolean; wasAlreadyStunned: boolean } {
    const fsm = e.gruntFsm;
    if (!fsm) {
      return { bonusMultiplier: 1, triggeredStun: false, wasAlreadyStunned: false };
    }

    const wasAlreadyStunned = fsm.state === 'Stunned';
    // Tactically reward punishing Stunned grunts with +35% stagger damage!
    const bonusMultiplier = wasAlreadyStunned ? 1.35 : 1.0;

    if (isReflected) {
      this.transition(e, 'Stunned', vfx, allEnemies, { stunDuration: 1.75 });
      return { bonusMultiplier, triggeredStun: !wasAlreadyStunned, wasAlreadyStunned };
    }

    if (heavy) {
      this.transition(e, 'Stunned', vfx, allEnemies, { stunDuration: 0.85 });
      return { bonusMultiplier, triggeredStun: !wasAlreadyStunned, wasAlreadyStunned };
    }

    // Light hit chips away grunt poise; breaking poise triggers a full Stagger Stun!
    if (!wasAlreadyStunned) {
      fsm.poise -= rawDamage * 0.95;
      fsm.poiseRegenDelay = 2.4;
      if (fsm.poise <= 0) {
        this.transition(e, 'Stunned', vfx, allEnemies, { stunDuration: 1.05 });
        return { bonusMultiplier, triggeredStun: true, wasAlreadyStunned: false };
      }
      if (fsm.state === 'Patrol') {
        // Ambushing a patrolling grunt instantly alerts it & nearby allies
        this.transition(e, 'Aggro', vfx, allEnemies, { skipAlert: true, alertNearby: true });
      } else {
        fsm.aggroMemory = 4.0;
      }
    }

    return { bonusMultiplier, triggeredStun: false, wasAlreadyStunned };
  }

  /**
   * Per-frame FSM tick dispatching cleanly across 'Patrol', 'Aggro', and 'Stunned'.
   */
  public update(e: EnemyEntity, ctx: GruntUpdateContext): void {
    const fsm = e.gruntFsm;
    if (!fsm) return;

    const { dt } = ctx;
    if (fsm.lungeCooldown > 0) fsm.lungeCooldown = Math.max(0, fsm.lungeCooldown - dt);
    if (fsm.alertBadgeTimer > 0) fsm.alertBadgeTimer = Math.max(0, fsm.alertBadgeTimer - dt);

    // Passive poise regeneration when undisturbed outside Stunned state
    if (fsm.state !== 'Stunned') {
      if (fsm.poiseRegenDelay > 0) {
        fsm.poiseRegenDelay = Math.max(0, fsm.poiseRegenDelay - dt);
      } else if (fsm.poise < fsm.maxPoise) {
        fsm.poise = Math.min(fsm.maxPoise, fsm.poise + 14 * dt);
      }
    }

    switch (fsm.state) {
      case 'Patrol':
        this.updatePatrol(e, fsm, ctx);
        break;
      case 'Aggro':
        this.updateAggro(e, fsm, ctx);
        break;
      case 'Stunned':
        this.updateStunned(e, fsm, ctx);
        break;
    }
  }

  private updatePatrol(e: EnemyEntity, fsm: GruntFsmData, ctx: GruntUpdateContext): void {
    const { dt, dx, dy, dist, vfx, allEnemies } = ctx;
    const tuning = ARCHETYPE_TUNING[fsm.archetype];

    e.aiState = 'patrol';
    e.telegraphMat.opacity = 0;

    // Directional sightline check scaled by difficulty aggression
    const playerInFront = (dx >= 0 && e.facing === 1) || (dx < 0 && e.facing === -1);
    const aggroSense = 0.85 + ctx.aggression * 0.15;
    const detectDist = (playerInFront ? 13.2 : 6.8) * aggroSense;
    if (dist < detectDist && Math.abs(dy) < 3.6) {
      e.facing = dx >= 0 ? 1 : -1;
      this.transition(e, 'Aggro', vfx, allEnemies, { alertNearby: true });
      return;
    }

    fsm.phaseTimer -= dt;
    if (fsm.patrolPhase === 'march') {
      const offset = e.x - e.homeX;
      if (offset > fsm.patrolRadius && e.facing === 1) {
        fsm.patrolPhase = 'lookout';
        fsm.phaseTimer = 0.75 + Math.random() * 0.55;
        e.vx = 0;
        return;
      }
      if (offset < -fsm.patrolRadius && e.facing === -1) {
        fsm.patrolPhase = 'lookout';
        fsm.phaseTimer = 0.75 + Math.random() * 0.55;
        e.vx = 0;
        return;
      }

      e.vx = e.facing * tuning.patrolSpeed * e.speedMult;
      if (fsm.phaseTimer <= 0) {
        fsm.patrolPhase = 'lookout';
        fsm.phaseTimer = 0.65 + Math.random() * 0.5;
        e.vx = 0;
      }
    } else {
      // 'lookout': pause briefly and scan the opposite direction before resuming march
      e.vx *= Math.max(0, 1 - 12 * dt);
      if (fsm.phaseTimer <= 0) {
        const offset = e.x - e.homeX;
        if (offset > fsm.patrolRadius * 0.75) {
          e.facing = -1;
        } else if (offset < -fsm.patrolRadius * 0.75) {
          e.facing = 1;
        } else {
          e.facing = e.facing === 1 ? -1 : 1;
        }
        fsm.patrolPhase = 'march';
        fsm.phaseTimer = 1.8 + Math.random() * 1.1;
      }
    }
  }

  private updateAggro(e: EnemyEntity, fsm: GruntFsmData, ctx: GruntUpdateContext): void {
    const {
      dt,
      elapsed,
      player,
      allEnemies,
      dx,
      dy,
      dist,
      aggression,
      cooldownMult,
      vfx,
      audio,
      onPlayerHitResult,
      onParried,
    } = ctx;
    const tuning = ARCHETYPE_TUNING[fsm.archetype];
    const windupScale = 1 / Math.sqrt(Math.max(0.5, aggression));
    const cleaveRange = 2.1;

    // Track aggro leash memory so grunts disengage cleanly if player retreats far away
    if (dist < 16.8 && Math.abs(dy) < 5.5) {
      fsm.aggroMemory = 3.5;
    } else {
      fsm.aggroMemory -= dt;
      if (fsm.aggroMemory <= 0 && fsm.aggroPhase !== 'attack' && fsm.aggroPhase !== 'windup') {
        this.transition(e, 'Patrol', vfx);
        return;
      }
    }

    if (fsm.aggroPhase === 'alert') {
      e.aiState = 'chase';
      e.facing = dx >= 0 ? 1 : -1;
      e.vx *= Math.max(0, 1 - 10 * dt);
      fsm.phaseTimer -= dt;
      if (fsm.phaseTimer <= 0) {
        fsm.aggroPhase = 'pursue';
        fsm.phaseTimer = 0.35;
      }
      return;
    }

    if (fsm.aggroPhase === 'pursue') {
      e.aiState = 'chase';
      e.telegraphMat.opacity = 0;
      e.facing = dx >= 0 ? 1 : -1;

      // Squad coordination: check if another grunt is already swinging right next to the hero
      const allyEngagedInMelee = allEnemies.some(
        (ally) =>
          ally.id !== e.id &&
          ally.alive &&
          ally.type === 'grunt' &&
          ally.gruntFsm &&
          ally.gruntFsm.state === 'Aggro' &&
          (ally.gruntFsm.aggroPhase === 'windup' || ally.gruntFsm.aggroPhase === 'attack') &&
          Math.abs(ally.x - player.x) < 2.9,
      );

      // 1. Close-range Axe Cleave
      if (dist <= cleaveRange && Math.abs(dy) < 2.2 && e.attackCooldown <= 0) {
        if (allyEngagedInMelee && fsm.archetype !== 'berserker' && aggression < 1.3) {
          // Stagger attack rhythm instead of overlapping identically on the hero
          fsm.aggroPhase = 'strafe';
          fsm.phaseTimer = (0.42 + Math.random() * 0.2) * cooldownMult;
          return;
        }
        fsm.attackKind = 'cleave';
        fsm.aggroPhase = 'windup';
        fsm.phaseTimer = tuning.windupCleave * windupScale;
        e.aiState = 'windup';
        e.vx = 0;
        e.didDealAttackHit = false;
        return;
      }

      // 2. Mid-range Leaping Lunge Slash (tactical gap closer!)
      if (
        dist >= 2.8 &&
        dist <= 5.5 &&
        Math.abs(dy) < 2.2 &&
        e.attackCooldown <= 0 &&
        fsm.lungeCooldown <= 0 &&
        (!allyEngagedInMelee || aggression >= 1.3)
      ) {
        fsm.attackKind = 'lunge';
        fsm.aggroPhase = 'windup';
        fsm.phaseTimer = tuning.windupLunge * windupScale;
        e.aiState = 'windup';
        e.vx = -e.facing * 1.4; // Subtle crouch coil back before springing forward
        e.squashX = 1.15;
        e.squashY = 0.84;
        e.didDealAttackHit = false;
        return;
      }

      // 3. Squad spacing strafe when waiting on cooldown right outside cleave range
      if (dist < 3.4 && (e.attackCooldown > 0.25 || allyEngagedInMelee)) {
        fsm.aggroPhase = 'strafe';
        fsm.phaseTimer = (0.36 + Math.random() * 0.22) * cooldownMult;
        return;
      }

      e.vx = e.facing * tuning.chaseSpeed * e.speedMult * aggression;
      return;
    }

    if (fsm.aggroPhase === 'strafe') {
      // Tactical footwork: maintain threat pressure at mid-spacing while facing the player
      e.aiState = 'chase';
      e.telegraphMat.opacity = 0;
      e.facing = dx >= 0 ? 1 : -1;
      fsm.phaseTimer -= dt;

      const idealDist = fsm.archetype === 'flanker' ? 3.9 : 3.2;
      if (dist < idealDist - 0.35) {
        e.vx = -e.facing * (tuning.chaseSpeed * e.speedMult * 0.52 * aggression);
      } else if (dist > idealDist + 0.65) {
        e.vx = e.facing * (tuning.chaseSpeed * e.speedMult * 0.55 * aggression);
      } else {
        e.vx *= Math.max(0, 1 - 10 * dt);
      }

      if (fsm.phaseTimer <= 0) {
        fsm.aggroPhase = 'pursue';
      }
      return;
    }

    if (fsm.aggroPhase === 'windup') {
      e.aiState = 'windup';
      e.vx *= Math.max(0, 1 - 12 * dt);
      fsm.phaseTimer -= dt;

      const isLunge = fsm.attackKind === 'lunge';
      e.telegraphMat.color.setHex(isLunge ? 0xfacc15 : e.accentHex).multiplyScalar(1.95);
      e.telegraphMat.opacity = 0.58 + Math.sin(elapsed * 34) * 0.3;
      e.telegraphHalo.scale.setScalar(
        (isLunge ? 1.12 : 0.96) + Math.sin(elapsed * 28) * 0.12,
      );

      if (fsm.phaseTimer <= 0) {
        fsm.aggroPhase = 'attack';
        fsm.phaseTimer = isLunge ? 0.34 : 0.25;
        e.aiState = 'attack';
        e.telegraphMat.opacity = 0;
        e.squashX = isLunge ? 1.24 : 1.15;
        e.squashY = isLunge ? 0.84 : 0.88;

        if (isLunge) {
          e.vx = e.facing * (8.4 * e.speedMult * (0.88 + aggression * 0.12));
          e.vy = 5.6;
          fsm.lungeCooldown = tuning.lungeCooldown * cooldownMult;
          vfx.spawnDustPuff(e.x, e.y, 7);
        } else {
          e.vx = e.facing * (5.8 * e.speedMult * (0.88 + aggression * 0.12));
        }
      }
      return;
    }

    if (fsm.aggroPhase === 'attack') {
      e.aiState = 'attack';
      fsm.phaseTimer -= dt;
      const isLunge = fsm.attackKind === 'lunge';
      e.vx *= Math.max(0, 1 - (isLunge ? 4.5 : 8.5) * dt);

      const hitReach = isLunge ? cleaveRange + 0.75 : cleaveRange + 0.5;
      if (!e.didDealAttackHit && dist <= hitReach && Math.abs(dy) < 1.85) {
        e.didDealAttackHit = true;
        const dmg = isLunge ? Math.round(e.unitDamage * 1.25) : e.unitDamage;
        const res = player.receiveDamage(dmg, e.x, vfx, audio);
        if (res === 'parried') {
          onParried(e);
          onPlayerHitResult('parried', true);
          return;
        } else if (res === 'guarded' || res === 'hit') {
          onPlayerHitResult(res, isLunge);
        }
      }

      if (fsm.phaseTimer <= 0) {
        fsm.aggroPhase = 'recover';
        fsm.phaseTimer = (isLunge ? 0.52 : 0.42) * cooldownMult;
        e.aiState = 'recover';
        e.attackCooldown = tuning.attackCooldown * cooldownMult;

        // Skirmisher / Flanker tactical disengage hop after swinging!
        if (
          !isLunge &&
          dist < 3.0 &&
          e.y <= 0.15 &&
          Math.random() < tuning.backstepChance
        ) {
          e.vx = -e.facing * 4.6;
          e.vy = 3.1;
          vfx.spawnDustPuff(e.x, e.y, 5);
        }
      }
      return;
    }

    // 'recover'
    e.aiState = 'recover';
    e.vx *= Math.max(0, 1 - 9.5 * dt);
    fsm.phaseTimer -= dt;
    if (fsm.phaseTimer <= 0) {
      fsm.aggroPhase = 'pursue';
      e.aiState = 'chase';
    }
  }

  private updateStunned(e: EnemyEntity, fsm: GruntFsmData, ctx: GruntUpdateContext): void {
    const { dt, dist, vfx } = ctx;
    e.aiState = 'stunned';
    e.stateTimer -= dt;
    e.vx *= Math.max(0, 1 - 7.5 * dt);
    e.telegraphMat.opacity = 0;

    if (e.stateTimer <= 0) {
      // Transition cleanly back to Aggro (or Patrol if hero left the area)
      if (dist > 19.0) {
        this.transition(e, 'Patrol', vfx);
      } else {
        e.attackCooldown = 0.5;
        this.transition(e, 'Aggro', vfx, undefined, { skipAlert: true });
      }
    }
  }
}
