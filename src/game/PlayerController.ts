import * as THREE from 'three';
import { SpriteAnimator } from './SpriteAnimator';
import { AABB, BOSS_ARENA_MAX_X, BOSS_ARENA_MIN_X, LEVEL_LENGTH } from './types';
import { LevelBuilder } from './LevelBuilder';
import { ProceduralAudio, VfxManager } from './VfxAudio';

export interface InputState {
  left: boolean;
  right: boolean;
  down: boolean;
  jumpHeld: boolean;
  jumpJustPressed: boolean;
  attackHeld: boolean;
  attackJustPressed: boolean;
  attackJustReleased: boolean;
  guardHeld: boolean;
  guardJustPressed: boolean;
  guardJustReleased: boolean;
  dashJustPressed: boolean;
  executeJustPressed: boolean;
}

export interface PlayerSpellCallbacks {
  onCastAetherWave?: (chargeLevel: number) => void;
  onCastAegisNova?: (chargeLevel: number) => void;
  onTriggerExecution?: () => void;
}

interface DashGhost {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.Texture;
  age: number;
  maxAge: number;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.58)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class PlayerController {
  public animator: SpriteAnimator;
  public x = 3.5;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public facing: 1 | -1 = 1;

  public hp = 100;
  public maxHp = 100;
  public stamina = 100;
  public maxStamina = 100;
  public isDead = false;

  // Grounding & jump physics
  public grounded = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private doubleJumpAvailable = true;
  private dropThroughTimer = 0;
  private lastSafeX = 3.5;
  private lastSafeY = 0;

  // Combat & 5-Hit Combo state (1..5 ground combo, 6 air attack)
  public attackStep: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0;
  public lastSlashStep = 0;
  public lastSlashMult = 1.0;
  public incomingDamageMult = 1.0;
  private attackTimer = 0;
  private attackDuration = 0;
  private attackQueued = false;
  private comboGraceTimer = 0;
  private lastGroundStep: 0 | 1 | 2 | 3 | 4 = 0;
  private step4SecondHitFired = false;
  public attackInstanceId = 0;
  public isAttackHitboxActive = false;

  // Combo Finisher Execution window (unlocked on completing the 3-hit combo)
  public static readonly EXECUTION_WINDOW_MAX = 2.6;
  public executionWindowTimer = 0;
  private executionWindowOpenedForAttackId = -1;

  // Guard & Perfect Parry
  public isGuarding = false;
  public parryWindowTimer = 0; // active perfect parry timing window (190ms)
  private parrySuccessTimer = 0; // plays PARRY animation pose

  // Concentrated Magic Charging (Hold Attack -> Aether Wave, Hold Block -> Aegis Nova)
  public attackCharge = 0; // 0..1
  public guardCharge = 0; // 0..1
  private attackHoldTime = 0;
  private guardHoldTime = 0;
  private attackChargeReadyPlayed = false;
  private guardChargeReadyPlayed = false;
  private chargePulseTimer = 0;
  private chargeSparkTimer = 0;
  private castPoseTimer = 0;
  private chargeAuraSpin = 0;

  // Dash & Invincibility
  private dashTimer = 0;
  private dashCooldown = 0;
  private dashGhostTimer = 0;
  private ghosts: DashGhost[] = [];
  public invulnTimer = 0;
  private hurtTimer = 0;

  // Contact shadow & 3D HDR Charge Aura meshes
  private shadowMesh: THREE.Mesh;
  private shadowGeo: THREE.PlaneGeometry;
  private shadowMat: THREE.MeshBasicMaterial;
  private shadowTex: THREE.CanvasTexture;
  private chargeRingGeo: THREE.RingGeometry;
  private chargeRingMat: THREE.MeshBasicMaterial;
  private chargeRingMesh: THREE.Mesh;
  private chargeCoreGeo: THREE.RingGeometry;
  private chargeCoreMat: THREE.MeshBasicMaterial;
  private chargeCoreMesh: THREE.Mesh;
  private scene: THREE.Scene;

  constructor(
    scene: THREE.Scene,
    onSpriteSourceChange?: (kind: 'attached' | 'custom' | 'procedural') => void,
  ) {
    this.scene = scene;
    this.animator = new SpriteAnimator(onSpriteSourceChange);
    this.animator.group.position.set(this.x, this.y, 0);
    scene.add(this.animator.group);

    this.shadowTex = createContactShadowTexture();
    this.shadowGeo = new THREE.PlaneGeometry(1.75, 0.65);
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    });
    this.shadowMesh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    this.shadowMesh.rotation.x = -Math.PI * 0.5;
    this.shadowMesh.position.set(this.x, 0.03, 0);
    scene.add(this.shadowMesh);

    // 3D HDR Charge Aura rings (blooms cleanly when channeling Sword or Shield magic)
    this.chargeRingGeo = new THREE.RingGeometry(0.86, 1.06, 28);
    this.chargeRingMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x38bdf8).multiplyScalar(2.4),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.chargeRingMesh = new THREE.Mesh(this.chargeRingGeo, this.chargeRingMat);
    this.chargeRingMesh.visible = false;
    this.chargeRingMesh.renderOrder = 8;

    this.chargeCoreGeo = new THREE.RingGeometry(0.45, 0.62, 6);
    this.chargeCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xfef08a).multiplyScalar(2.6),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.chargeCoreMesh = new THREE.Mesh(this.chargeCoreGeo, this.chargeCoreMat);
    this.chargeCoreMesh.visible = false;
    this.chargeCoreMesh.renderOrder = 8;

    scene.add(this.chargeRingMesh, this.chargeCoreMesh);
  }

  public reset(): void {
    this.x = 3.5;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.isDead = false;
    this.grounded = true;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.doubleJumpAvailable = true;
    this.dropThroughTimer = 0;
    this.lastSafeX = 3.5;
    this.lastSafeY = 0;
    this.attackStep = 0;
    this.lastSlashStep = 0;
    this.lastSlashMult = 1.0;
    this.attackTimer = 0;
    this.attackQueued = false;
    this.comboGraceTimer = 0;
    this.lastGroundStep = 0;
    this.step4SecondHitFired = false;
    this.isAttackHitboxActive = false;
    this.executionWindowTimer = 0;
    this.executionWindowOpenedForAttackId = -1;
    this.isGuarding = false;
    this.parryWindowTimer = 0;
    this.parrySuccessTimer = 0;
    this.attackCharge = 0;
    this.guardCharge = 0;
    this.attackHoldTime = 0;
    this.guardHoldTime = 0;
    this.attackChargeReadyPlayed = false;
    this.guardChargeReadyPlayed = false;
    this.chargePulseTimer = 0;
    this.chargeSparkTimer = 0;
    this.castPoseTimer = 0;
    this.chargeRingMesh.visible = false;
    this.chargeCoreMesh.visible = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.invulnTimer = 0;
    this.hurtTimer = 0;
    this.clearGhosts();
    this.animator.setFacing(1);
    this.animator.setState('IDLE', true);
    this.animator.group.position.set(this.x, this.y, 0);
    this.shadowMesh.position.set(this.x, 0.03, 0);
  }

  public syncVisuals(level: LevelBuilder): void {
    this.animator.group.position.set(this.x, this.y, 0);
    this.updateContactShadow(level);
  }

  public getHurtbox(): AABB {
    return {
      x: this.x,
      y: this.y,
      width: 0.92,
      height: 1.72,
    };
  }

  public getAttackHitbox(): AABB | null {
    if (!this.isAttackHitboxActive || this.attackStep === 0) return null;
    const isFinisher = this.attackStep === 5;
    const isHeavy = this.attackStep === 3 || this.attackStep === 4;
    const reach = isFinisher ? 2.95 : isHeavy ? 2.5 : this.attackStep === 2 ? 2.3 : 2.08;
    const height = isFinisher ? 2.45 : isHeavy ? 2.15 : 1.78;
    return {
      x: this.x + this.facing * (reach * 0.52 + 0.25),
      y: this.y + (this.attackStep === 6 ? -0.15 : 0.08),
      width: reach,
      height,
    };
  }

  public getAttackDamage(): {
    damage: number;
    heavy: boolean;
    knockbackX: number;
    slashMult: number;
  } {
    if (this.attackStep === 5) {
      return { damage: 48, heavy: true, knockbackX: 13.5, slashMult: 2.25 };
    }
    if (this.attackStep === 4) {
      // Twin Cross-Slash hits TWICE during one swing!
      return { damage: 22, heavy: this.step4SecondHitFired, knockbackX: 7.4, slashMult: 1.7 };
    }
    if (this.attackStep === 3) {
      return { damage: 30, heavy: true, knockbackX: 10.2, slashMult: 1.45 };
    }
    if (this.attackStep === 2) {
      return { damage: 21, heavy: false, knockbackX: 6.2, slashMult: 1.2 };
    }
    if (this.attackStep === 6) {
      return { damage: 22, heavy: false, knockbackX: 5.8, slashMult: 1.25 };
    }
    return { damage: 16, heavy: false, knockbackX: 5.0, slashMult: 1.0 };
  }

  public heal(amount: number): number {
    const prev = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - prev;
  }

  /**
   * Dedicated mobile quick-spell trigger (one-tap Aether Wave or Aegis Nova).
   * Hold-to-charge on Attack/Guard also remains fully functional.
   */
  public triggerQuickSpell(
    kind: 'wave' | 'nova',
    vfx: VfxManager,
    audio: ProceduralAudio,
    spellCallbacks?: PlayerSpellCallbacks,
  ): boolean {
    if (this.isDead || this.hurtTimer > 0 || this.dashTimer > 0 || this.castPoseTimer > 0) {
      return false;
    }

    const staminaCost = kind === 'wave' ? 22 : 24;
    if (this.stamina < staminaCost) {
      return false;
    }

    this.stamina = Math.max(0, this.stamina - staminaCost);
    this.attackStep = 0;
    this.attackQueued = false;
    this.isAttackHitboxActive = false;
    this.isGuarding = false;
    this.attackCharge = 0;
    this.guardCharge = 0;
    this.attackHoldTime = 0;
    this.guardHoldTime = 0;
    this.attackChargeReadyPlayed = false;
    this.guardChargeReadyPlayed = false;

    if (kind === 'wave') {
      this.castPoseTimer = 0.24;
      this.vx = -this.facing * 2.6;
      this.animator.setState('ATTACK_3', true);
      this.animator.triggerSquash(1.2, 0.86);
      vfx.spawnRing(this.x + this.facing * 0.6, this.y + 1.05, 0x38bdf8, 0.3, 2.0, 0.22);
      audio.playChargeReady('attack');
      spellCallbacks?.onCastAetherWave?.(1.0);
    } else {
      this.parrySuccessTimer = 0.26;
      this.castPoseTimer = 0.24;
      this.vx *= 0.25;
      this.animator.setState('PARRY', true);
      this.animator.triggerSquash(1.2, 0.86);
      vfx.spawnRing(this.x, this.y + 1.05, 0xc084fc, 0.35, 2.2, 0.24);
      audio.playChargeReady('guard');
      spellCallbacks?.onCastAegisNova?.(1.0);
    }
    return true;
  }

  /**
   * Evaluates incoming hit against invulnerability, Perfect Parry, and Guard.
   */
  public receiveDamage(
    amount: number,
    attackerX: number,
    vfx: VfxManager,
    audio: ProceduralAudio,
  ): 'ignored' | 'parried' | 'guarded' | 'hit' {
    if (this.isDead || this.invulnTimer > 0) return 'ignored';

    const attackFromFront =
      (attackerX >= this.x && this.facing === 1) ||
      (attackerX <= this.x && this.facing === -1);

    // PERFECT PARRY window (works omnidirectionally slightly forgiving or frontal)
    if (this.parryWindowTimer > 0) {
      this.parrySuccessTimer = 0.28;
      this.parryWindowTimer = 0;
      this.invulnTimer = 0.36;
      this.stamina = Math.min(this.maxStamina, this.stamina + 28);
      this.animator.setState('PARRY', true);
      this.animator.triggerSquash(1.16, 0.9);
      audio.playParry();
      vfx.flashLight(this.x + this.facing * 0.65, this.y + 1.0, 0x60a5fa, 12, 0.24);
      vfx.spawnRing(this.x + this.facing * 0.65, this.y + 1.0, 0x60a5fa, 0.3, 3.0, 0.3);
      vfx.spawnBurst(this.x + this.facing * 0.65, this.y + 1.0, 0.2, 22, 0x93c5fd, 8, 12, 1.1);
      vfx.spawnFloatingText(this.x, this.y + 0.5, 'PARRY!', '#60a5fa', 1.35);
      return 'parried';
    }

    const scaledAmount = Math.max(1, Math.round(amount * this.incomingDamageMult));

    // Standard GUARD
    if (this.isGuarding && attackFromFront && this.stamina >= 12) {
      const chip = Math.max(2, Math.round(scaledAmount * 0.25));
      this.hp = Math.max(1, this.hp - chip);
      this.stamina = Math.max(0, this.stamina - 18);
      this.vx = -this.facing * 5.2;
      this.invulnTimer = 0.22;
      audio.playGuard();
      vfx.flashLight(this.x + this.facing * 0.5, this.y + 1.0, 0x38bdf8, 5, 0.14);
      vfx.spawnBurst(this.x + this.facing * 0.5, this.y + 1.0, 0.2, 10, 0x7dd3fc, 5.5, 16, 0.8);
      vfx.spawnFloatingText(this.x, this.y + 0.3, `BLOCK -${chip}`, '#93c5fd', 0.95);
      return 'guarded';
    }

    // Direct Hit (scaled by active Difficulty multiplier)
    this.hp = Math.max(0, this.hp - scaledAmount);
    this.attackStep = 0;
    this.lastGroundStep = 0;
    this.comboGraceTimer = 0;
    this.attackCharge = 0;
    this.guardCharge = 0;
    this.attackHoldTime = 0;
    this.guardHoldTime = 0;
    this.attackChargeReadyPlayed = false;
    this.guardChargeReadyPlayed = false;
    this.isAttackHitboxActive = false;
    this.hurtTimer = 0.28;
    this.invulnTimer = 0.72;
    const pushDir = this.x >= attackerX ? 1 : -1;
    this.vx = pushDir * 7.8;
    this.vy = 5.4;
    this.grounded = false;

    this.animator.triggerFlash(0.18);
    this.animator.triggerSquash(0.84, 1.18);
    audio.playHurt();
    vfx.spawnBurst(this.x, this.y + 1.0, 0.15, 16, 0xf87171, 6.5, 18, 1.0);
    vfx.spawnFloatingText(this.x, this.y + 0.3, `-${scaledAmount}`, '#f87171', 1.15);

    if (this.hp <= 0) {
      this.isDead = true;
      this.executionWindowTimer = 0;
      this.animator.setState('DEAD', true);
    } else {
      this.animator.setState('HURT', true);
    }
    return 'hit';
  }

  public update(
    dt: number,
    input: InputState,
    level: LevelBuilder,
    vfx: VfxManager,
    audio: ProceduralAudio,
    arenaLocked: boolean,
    spellCallbacks?: PlayerSpellCallbacks,
  ): void {
    this.updateGhosts(dt);

    if (this.isDead) {
      this.vy -= 42 * dt;
      this.y += this.vy * dt;
      const gY = level.getGroundHeightAt(this.x);
      if (gY !== null && this.y < gY) {
        this.y = gY;
        this.vy = 0;
      }
      this.animator.group.position.set(this.x, this.y, 0);
      this.animator.update(dt, false);
      this.updateContactShadow(level);
      return;
    }

    // Timers
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.dropThroughTimer > 0) this.dropThroughTimer = Math.max(0, this.dropThroughTimer - dt);
    if (this.parryWindowTimer > 0) this.parryWindowTimer = Math.max(0, this.parryWindowTimer - dt);
    if (this.parrySuccessTimer > 0) this.parrySuccessTimer = Math.max(0, this.parrySuccessTimer - dt);
    if (this.castPoseTimer > 0) this.castPoseTimer = Math.max(0, this.castPoseTimer - dt);
    if (this.executionWindowTimer > 0) {
      this.executionWindowTimer = Math.max(0, this.executionWindowTimer - dt);
    }
    if (this.comboGraceTimer > 0) {
      this.comboGraceTimer = Math.max(0, this.comboGraceTimer - dt);
      if (this.comboGraceTimer === 0) {
        this.lastGroundStep = 0;
      }
    }

    // Coyote time & jump buffer
    if (this.grounded) {
      this.coyoteTimer = 0.11;
      this.doubleJumpAvailable = true;
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (input.jumpJustPressed) {
      this.jumpBufferTimer = 0.12;
    } else if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    // Stamina regen (slower while guarding or channeling)
    const isChanneling = this.attackCharge > 0.05 || this.guardCharge > 0.05;
    const regenRate = this.isGuarding || isChanneling ? 7 : 26;
    if (this.dashTimer <= 0 && this.attackStep === 0) {
      this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * dt);
    }

    // Movement directional input
    const moveDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    // 0. SCREEN-WIDE BIOME EXECUTION FINISHER (Extra input E / Q / Middle-Click after 3-Hit Combo)
    if (
      input.executeJustPressed &&
      this.executionWindowTimer > 0 &&
      this.hurtTimer <= 0 &&
      !this.isDead
    ) {
      this.executionWindowTimer = 0;
      this.attackStep = 0;
      this.attackQueued = false;
      this.lastGroundStep = 0;
      this.comboGraceTimer = 0;
      this.isAttackHitboxActive = false;
      this.isGuarding = false;
      this.attackCharge = 0;
      this.guardCharge = 0;
      this.attackHoldTime = 0;
      this.guardHoldTime = 0;
      this.attackChargeReadyPlayed = false;
      this.guardChargeReadyPlayed = false;
      this.dashTimer = 0;
      this.invulnTimer = Math.max(this.invulnTimer, 1.3);
      this.castPoseTimer = 0.72;
      this.vx = 0;
      this.vy = Math.max(0, this.vy);
      this.animator.setState('ATTACK_3', true);
      this.animator.triggerSquash(1.24, 0.84);
      spellCallbacks?.onTriggerExecution?.();
    }

    // 1. DASH (L / Shift)
    if (
      input.dashJustPressed &&
      this.dashCooldown <= 0 &&
      this.dashTimer <= 0 &&
      this.hurtTimer <= 0 &&
      this.stamina >= 22
    ) {
      if (moveDir !== 0) this.facing = moveDir > 0 ? 1 : -1;
      this.stamina -= 22;
      this.dashTimer = 0.19;
      this.dashCooldown = 0.44;
      this.invulnTimer = Math.max(this.invulnTimer, 0.24);
      this.attackStep = 0;
      this.isAttackHitboxActive = false;
      this.isGuarding = false;
      this.attackCharge = 0;
      this.guardCharge = 0;
      this.attackHoldTime = 0;
      this.guardHoldTime = 0;
      this.attackChargeReadyPlayed = false;
      this.guardChargeReadyPlayed = false;
      this.vy = 0;
      this.vx = this.facing * 20.5;
      this.dashGhostTimer = 0;
      this.animator.triggerSquash(1.22, 0.84);
      audio.playDash();
      vfx.spawnDustPuff(this.x, this.y, 7);
    }

    // 2. GUARD, PERFECT PARRY & CONCENTRATED AEGIS NOVA (Hold K / Right Click & Release)
    if (input.guardJustPressed && this.hurtTimer <= 0 && this.dashTimer <= 0) {
      this.parryWindowTimer = 0.19; // Crisp 190ms Perfect Parry window
      this.attackStep = 0;
      this.isAttackHitboxActive = false;
      this.attackCharge = 0;
      this.attackHoldTime = 0;
      this.attackChargeReadyPlayed = false;
    }
    this.isGuarding =
      input.guardHeld &&
      this.hurtTimer <= 0 &&
      this.dashTimer <= 0 &&
      this.attackStep === 0 &&
      this.grounded;

    if (this.isGuarding && this.stamina >= 10) {
      this.guardHoldTime += dt;
      if (this.guardHoldTime >= 0.26) {
        this.guardCharge = THREE.MathUtils.clamp((this.guardHoldTime - 0.26) / 0.68, 0, 1);
        this.chargePulseTimer -= dt;
        if (this.chargePulseTimer <= 0 && this.guardCharge < 0.99) {
          this.chargePulseTimer = 0.17;
          audio.playChargePulse(this.guardCharge, 'guard');
        }
        if (this.guardCharge >= 0.99 && !this.guardChargeReadyPlayed) {
          this.guardChargeReadyPlayed = true;
          audio.playChargeReady('guard');
          vfx.spawnRing(this.x, this.y + 1.05, 0xfde047, 0.35, 2.2, 0.25);
          vfx.flashLight(this.x, this.y + 1.1, 0xc084fc, 8, 0.18);
        }
      }
    } else if (this.guardCharge > 0 || this.guardHoldTime > 0) {
      const released = input.guardJustReleased || !input.guardHeld;
      if (
        released &&
        this.guardCharge >= 0.42 &&
        this.hurtTimer <= 0 &&
        this.dashTimer <= 0 &&
        this.stamina >= 18
      ) {
        this.stamina = Math.max(0, this.stamina - 18);
        this.parrySuccessTimer = 0.26;
        this.animator.setState('PARRY', true);
        this.animator.triggerSquash(1.2, 0.86);
        spellCallbacks?.onCastAegisNova?.(this.guardCharge);
      }
      this.guardHoldTime = 0;
      this.guardCharge = 0;
      this.guardChargeReadyPlayed = false;
    }

    // 3. 5-HIT ESCALATING COMBO & CONCENTRATED AETHER WAVE (Hold J / Left Click & Release)
    if (input.attackJustPressed && this.hurtTimer <= 0 && this.dashTimer <= 0) {
      if (this.attackStep === 0) {
        if (!this.grounded) {
          this.startAttack(6, vfx, audio);
        } else if (this.comboGraceTimer > 0 && this.lastGroundStep > 0 && this.lastGroundStep < 5) {
          const nextStep = (this.lastGroundStep + 1) as 2 | 3 | 4 | 5;
          if (moveDir !== 0) this.facing = moveDir > 0 ? 1 : -1;
          this.startAttack(nextStep, vfx, audio);
        } else {
          this.startAttack(1, vfx, audio);
        }
      } else if (this.attackStep >= 1 && this.attackStep <= 4) {
        // Queue next slash in the 5-hit escalating combo during generous cancel window
        if (this.attackTimer > this.attackDuration * 0.26) {
          this.attackQueued = true;
        }
      }
    }

    // Channel concentrated Sword magic while Attack button is held past initial tap
    if (input.attackHeld && !this.isGuarding && this.hurtTimer <= 0 && this.dashTimer <= 0) {
      this.attackHoldTime += dt;
      if (this.attackHoldTime >= 0.24) {
        this.attackCharge = THREE.MathUtils.clamp((this.attackHoldTime - 0.24) / 0.64, 0, 1);
        this.chargePulseTimer -= dt;
        if (this.chargePulseTimer <= 0 && this.attackCharge < 0.99) {
          this.chargePulseTimer = 0.16;
          audio.playChargePulse(this.attackCharge, 'attack');
        }
        if (this.attackCharge >= 0.99 && !this.attackChargeReadyPlayed) {
          this.attackChargeReadyPlayed = true;
          audio.playChargeReady('attack');
          vfx.spawnRing(this.x, this.y + 1.05, 0xfde047, 0.35, 2.3, 0.26);
          vfx.flashLight(this.x, this.y + 1.1, 0x38bdf8, 8.5, 0.18);
        }
      }
    } else if (this.attackCharge > 0 || this.attackHoldTime > 0) {
      const released = input.attackJustReleased || !input.attackHeld;
      if (
        released &&
        this.attackCharge >= 0.4 &&
        this.hurtTimer <= 0 &&
        this.dashTimer <= 0 &&
        this.stamina >= 16
      ) {
        const cost = this.attackCharge >= 0.95 ? 22 : 16;
        this.stamina = Math.max(0, this.stamina - cost);
        if (moveDir !== 0) this.facing = moveDir > 0 ? 1 : -1;
        this.attackStep = 0;
        this.isAttackHitboxActive = false;
        this.castPoseTimer = 0.22;
        this.vx = -this.facing * 2.8; // Crisp spellcast recoil
        this.animator.setState('ATTACK_3', true);
        this.animator.triggerSquash(1.18, 0.88);
        spellCallbacks?.onCastAetherWave?.(this.attackCharge);
      }
      this.attackHoldTime = 0;
      this.attackCharge = 0;
      this.attackChargeReadyPlayed = false;
    }

    // Advance active attack timers & active hitbox window
    if (this.attackStep > 0) {
      this.attackTimer += dt;
      const t = this.attackTimer / this.attackDuration;

      // Step 4 (Twin Cross-Slash) triggers a second mid-swing hit instance & dual arc!
      if (this.attackStep === 4 && !this.step4SecondHitFired && t >= 0.48) {
        this.step4SecondHitFired = true;
        this.attackInstanceId++;
        audio.playSlash(4);
        vfx.spawnSlashArc(this.x, this.y, this.facing, 3, 0xe879f9);
        vfx.flashLight(this.x + this.facing * 1.15, this.y + 1.1, 0xe879f9, 8.5, 0.14);
        this.animator.triggerSquash(1.14, 0.9);
      }

      // Active hitbox ONLY during impact frames
      this.isAttackHitboxActive =
        this.attackStep === 4 ? t >= 0.18 && t <= 0.82 : t >= 0.22 && t <= 0.68;

      // Completing the 3-hit combo (step 3, refreshed on steps 4-5) opens the Execution Finisher window!
      if (
        this.attackStep >= 3 &&
        this.attackStep <= 5 &&
        t >= 0.5 &&
        this.executionWindowOpenedForAttackId !== this.attackInstanceId
      ) {
        const wasAlreadyReady = this.executionWindowTimer > 0;
        this.executionWindowOpenedForAttackId = this.attackInstanceId;
        this.executionWindowTimer = PlayerController.EXECUTION_WINDOW_MAX;
        if (!wasAlreadyReady) {
          audio.playExecutionReady();
          vfx.spawnRing(this.x, this.y + 1.05, 0xfef08a, 0.35, 2.15, 0.26);
        }
      }

      if (this.attackTimer >= this.attackDuration) {
        if (this.attackQueued && this.grounded && this.attackStep >= 1 && this.attackStep <= 4) {
          const nextStep = (this.attackStep + 1) as 2 | 3 | 4 | 5;
          if (moveDir !== 0) this.facing = moveDir > 0 ? 1 : -1;
          this.startAttack(nextStep, vfx, audio);
        } else {
          if (this.attackStep >= 1 && this.attackStep <= 4 && this.grounded) {
            this.lastGroundStep = this.attackStep as 1 | 2 | 3 | 4;
            this.comboGraceTimer = 0.24;
          } else {
            this.lastGroundStep = 0;
            this.comboGraceTimer = 0;
          }
          this.attackStep = 0;
          this.attackQueued = false;
          this.isAttackHitboxActive = false;
        }
      }
    } else {
      this.isAttackHitboxActive = false;
    }

    // 4. HORIZONTAL VELOCITY
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vx = this.facing * 20.5;
      this.vy = 0;
      this.dashGhostTimer -= dt;
      if (this.dashGhostTimer <= 0) {
        this.dashGhostTimer = 0.042;
        const g = this.animator.createGhostMesh(this.x, this.y);
        this.scene.add(g.mesh);
        this.ghosts.push({ ...g, age: 0, maxAge: 0.24 });
      }
    } else if (this.hurtTimer > 0) {
      this.vx *= Math.max(0, 1 - 6 * dt);
    } else if (this.isGuarding || this.parrySuccessTimer > 0) {
      this.vx *= Math.max(0, 1 - 16 * dt);
      if (moveDir !== 0 && this.parrySuccessTimer <= 0) {
        this.facing = moveDir > 0 ? 1 : -1;
      }
    } else if (this.attackStep > 0 && this.grounded) {
      // Subtle forward momentum step on combo attacks
      this.vx *= Math.max(0, 1 - 12 * dt);
    } else {
      const chargeSpeedScale = this.attackCharge > 0.05 ? 0.64 : 1.0;
      const targetSpeed = moveDir * 9.4 * chargeSpeedScale;
      const accel = this.grounded ? 62 : 36;
      if (moveDir !== 0) {
        this.facing = moveDir > 0 ? 1 : -1;
        this.vx = THREE.MathUtils.lerp(this.vx, targetSpeed, 1 - Math.exp(-accel * 0.18 * dt));
      } else {
        const friction = this.grounded ? 18 : 5;
        this.vx *= Math.max(0, 1 - friction * dt);
        if (Math.abs(this.vx) < 0.08) this.vx = 0;
      }
    }

    // 5. JUMP / DOUBLE JUMP / ONE-WAY DROP
    if (this.jumpBufferTimer > 0 && this.hurtTimer <= 0 && this.dashTimer <= 0) {
      if (input.down && this.grounded && this.y > 0.2) {
        // Drop through one-way platform
        this.dropThroughTimer = 0.24;
        this.grounded = false;
        this.y -= 0.14;
        this.vy = -3.0;
        this.jumpBufferTimer = 0;
      } else if (this.coyoteTimer > 0) {
        // Primary jump
        this.vy = 14.8;
        this.grounded = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.attackStep = 0;
        this.isAttackHitboxActive = false;
        this.animator.triggerSquash(0.82, 1.24);
        audio.playJump(false);
        vfx.spawnDustPuff(this.x, this.y, 6);
      } else if (this.doubleJumpAvailable) {
        // Double jump in midair
        this.vy = 13.6;
        this.doubleJumpAvailable = false;
        this.jumpBufferTimer = 0;
        this.attackStep = 0;
        this.isAttackHitboxActive = false;
        this.animator.triggerSquash(0.84, 1.22);
        audio.playJump(true);
        vfx.spawnDustPuff(this.x, this.y, 9);
        vfx.spawnRing(this.x, this.y + 0.1, 0x7dd3fc, 0.2, 1.15, 0.2);
      }
    }

    // Variable jump height (release jump early to cut upward arc)
    if (!input.jumpHeld && this.vy > 4.5 && this.dashTimer <= 0) {
      this.vy *= Math.pow(0.28, dt * 8);
    }

    // 6. GRAVITY & COLLISION RESOLUTION
    if (this.dashTimer <= 0) {
      const gravity = this.vy > 0 ? 34 : 46;
      this.vy = Math.max(-26, this.vy - gravity * dt);
    }

    const prevY = this.y;
    const wasGrounded = this.grounded;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Horizontal map / boss arena bounds
    const minX = arenaLocked ? BOSS_ARENA_MIN_X + 0.9 : -4.2;
    const maxX = arenaLocked ? BOSS_ARENA_MAX_X - 0.9 : LEVEL_LENGTH + 1.0;
    if (this.x < minX) {
      this.x = minX;
      if (this.vx < 0) this.vx = 0;
    }
    if (this.x > maxX) {
      this.x = maxX;
      if (this.vx > 0) this.vx = 0;
    }

    // Resolve ground & one-way floating platforms
    this.grounded = false;

    if (this.vy <= 0) {
      // Check one-way floating platforms first
      if (this.dropThroughTimer <= 0) {
        for (const plat of level.platforms) {
          const halfW = plat.width * 0.5 + 0.3;
          if (Math.abs(this.x - plat.x) <= halfW) {
            if (prevY >= plat.y - 0.18 && this.y <= plat.y) {
              this.y = plat.y;
              this.vy = 0;
              this.grounded = true;
              break;
            }
          }
        }
      }

      // Check solid ground segments (respecting chasms!)
      if (!this.grounded) {
        const groundH = level.getGroundHeightAt(this.x);
        if (groundH !== null && prevY >= groundH - 0.55 && this.y <= groundH) {
          this.y = groundH;
          this.vy = 0;
          this.grounded = true;
          // Save safe respawn point away from pit edges
          if (
            level.getGroundHeightAt(this.x - 1.2) !== null &&
            level.getGroundHeightAt(this.x + 1.2) !== null
          ) {
            this.lastSafeX = this.x;
            this.lastSafeY = groundH;
          }
        }
      }
    }

    // Landing impact dust & squash
    if (this.grounded && !wasGrounded) {
      this.animator.triggerSquash(1.2, 0.82);
      vfx.spawnDustPuff(this.x, this.y, 7);
    }

    // Chasm pitfall recovery
    if (this.y < -8.5) {
      this.hp = Math.max(0, this.hp - 18);
      audio.playHurt();
      if (this.hp <= 0) {
        this.isDead = true;
        this.y = -4;
        this.animator.setState('DEAD', true);
      } else {
        this.x = this.lastSafeX;
        this.y = this.lastSafeY + 1.2;
        this.vx = 0;
        this.vy = 0;
        this.invulnTimer = 1.1;
        this.animator.triggerFlash(0.2);
        vfx.spawnFloatingText(this.x, this.y + 0.4, '-18 PIT', '#f87171', 1.1);
        vfx.spawnBurst(this.x, this.y + 0.5, 0.1, 14, 0x38bdf8, 5, 10, 0.9);
      }
    }

    // 7. ANIMATION STATE MACHINE
    this.animator.setFacing(this.facing);
    if (this.hurtTimer > 0) {
      this.animator.setState('HURT');
    } else if (this.parrySuccessTimer > 0) {
      this.animator.setState('PARRY');
    } else if (this.castPoseTimer > 0) {
      this.animator.setState('ATTACK_3');
    } else if (this.attackStep === 1) {
      this.animator.setState('ATTACK_1');
    } else if (this.attackStep === 2) {
      this.animator.setState('ATTACK_2');
    } else if (this.attackStep === 3 || this.attackStep === 5) {
      this.animator.setState('ATTACK_3');
    } else if (this.attackStep === 4) {
      this.animator.setState(this.step4SecondHitFired ? 'ATTACK_1' : 'ATTACK_2');
    } else if (this.attackStep === 6) {
      this.animator.setState('AIR_ATTACK');
    } else if (this.isGuarding) {
      this.animator.setState('GUARD');
    } else if (!this.grounded) {
      this.animator.setState(this.vy > 0.8 ? 'JUMP' : 'FALL');
    } else if (Math.abs(this.vx) > 0.65) {
      this.animator.setState('RUN');
    } else {
      this.animator.setState('IDLE');
    }

    // Blink during post-hit invulnerability (not during dash or Execution pose)
    const blinkHide =
      this.invulnTimer > 0 &&
      this.dashTimer <= 0 &&
      this.parrySuccessTimer <= 0 &&
      this.castPoseTimer <= 0 &&
      Math.floor(this.invulnTimer * 22) % 2 === 0;

    this.animator.group.position.set(this.x, this.y, 0);
    this.animator.update(dt, blinkHide);
    this.updateContactShadow(level);
    this.updateChargeVisuals(dt, vfx);
  }

  private updateChargeVisuals(dt: number, vfx: VfxManager): void {
    const activeKind: 'attack' | 'guard' | null =
      this.attackCharge > 0.04 ? 'attack' : this.guardCharge > 0.04 ? 'guard' : null;
    const lvl = activeKind === 'attack' ? this.attackCharge : this.guardCharge;

    if (!activeKind) {
      this.chargeRingMesh.visible = false;
      this.chargeCoreMesh.visible = false;
      return;
    }

    const full = lvl >= 0.95;
    this.chargeAuraSpin += dt * (full ? 7.5 : 3.8);
    const pulse = 1 + Math.sin(this.chargeAuraSpin * 2.4) * (full ? 0.14 : 0.06);
    const ringScale = (0.58 + lvl * 0.68) * pulse;
    const baseHex =
      activeKind === 'attack' ? (full ? 0xfacc15 : 0x38bdf8) : full ? 0xfacc15 : 0xc084fc;
    const coreHex =
      activeKind === 'attack' ? (full ? 0x7dd3fc : 0xfef08a) : full ? 0xe879f9 : 0xf5d0fe;

    this.chargeRingMesh.visible = true;
    this.chargeRingMesh.position.set(this.x, this.y + 1.05, 0.26);
    this.chargeRingMesh.scale.setScalar(ringScale);
    this.chargeRingMesh.rotation.z = this.chargeAuraSpin;
    this.chargeRingMat.color.setHex(baseHex).multiplyScalar(full ? 3.1 : 2.3);
    this.chargeRingMat.opacity = 0.25 + lvl * 0.65;

    this.chargeCoreMesh.visible = true;
    this.chargeCoreMesh.position.set(this.x, this.y + 1.05, 0.28);
    this.chargeCoreMesh.scale.setScalar(ringScale * 0.72);
    this.chargeCoreMesh.rotation.z = -this.chargeAuraSpin * 1.45;
    this.chargeCoreMat.color.setHex(coreHex).multiplyScalar(full ? 3.2 : 2.4);
    this.chargeCoreMat.opacity = 0.2 + lvl * 0.6;

    // Emit rising arcane charge motes around the hero
    this.chargeSparkTimer -= dt;
    if (this.chargeSparkTimer <= 0) {
      this.chargeSparkTimer = full ? 0.075 : 0.12;
      vfx.spawnBurst(
        this.x + (Math.random() - 0.5) * 0.9,
        this.y + 0.4 + Math.random() * 0.9,
        0.22,
        full ? 3 : 2,
        baseHex,
        2.4,
        -6, // negative gravity -> rising arcane sparks!
        full ? 0.78 : 0.58,
      );
    }
  }

  private startAttack(
    step: 1 | 2 | 3 | 4 | 5 | 6,
    vfx: VfxManager,
    audio: ProceduralAudio,
  ): void {
    this.attackStep = step;
    this.lastSlashStep = step;
    this.attackTimer = 0;
    this.attackQueued = false;
    this.comboGraceTimer = 0;
    this.step4SecondHitFired = false;
    this.attackInstanceId++;
    this.attackDuration =
      step === 5
        ? 0.38
        : step === 4
          ? 0.34
          : step === 3
            ? 0.3
            : step === 6
              ? 0.26
              : step === 2
                ? 0.24
                : 0.23;

    this.lastSlashMult = this.getAttackDamage().slashMult;

    if (this.grounded) {
      const lunge =
        step === 5 ? 9.4 : step === 4 ? 7.2 : step === 3 ? 6.8 : step === 2 ? 4.8 : 4.1;
      this.vx = this.facing * lunge;
    }

    const animMap: Record<
      1 | 2 | 3 | 4 | 5 | 6,
      'ATTACK_1' | 'ATTACK_2' | 'ATTACK_3' | 'AIR_ATTACK'
    > = {
      1: 'ATTACK_1',
      2: 'ATTACK_2',
      3: 'ATTACK_3',
      4: 'ATTACK_2',
      5: 'ATTACK_3',
      6: 'AIR_ATTACK',
    };
    this.animator.setState(animMap[step], true);
    this.animator.triggerSquash(
      step === 5 ? 1.26 : step === 3 || step === 4 ? 1.16 : 1.09,
      step === 5 ? 0.82 : step === 3 || step === 4 ? 0.88 : 0.94,
    );

    const slashColor =
      step === 5 ? 0xfacc15 : step === 4 ? 0x38bdf8 : step === 3 ? 0x38bdf8 : 0x7dd3fc;

    audio.playSlash(step);
    vfx.spawnSlashArc(this.x, this.y, this.facing, step, slashColor);
    vfx.flashLight(
      this.x + this.facing * 1.15,
      this.y + 1.1,
      slashColor,
      step === 5 ? 12.5 : step === 3 || step === 4 ? 8.5 : 5.2,
      step === 5 ? 0.22 : 0.14,
    );

    if (step === 5) {
      // Aether Finisher explosive shockwave ring & golden-cyan sparks
      vfx.spawnRing(this.x + this.facing * 1.15, this.y + 1.05, 0xfacc15, 0.35, 3.1, 0.28);
      vfx.spawnBurst(this.x + this.facing * 1.2, this.y + 1.1, 0.2, 18, 0xfde047, 8.2, 12, 1.05);
    }
  }

  private updateContactShadow(level: LevelBuilder): void {
    // Project shadow straight down onto highest surface below player
    let surfaceY: number | null = level.getGroundHeightAt(this.x);
    for (const plat of level.platforms) {
      if (Math.abs(this.x - plat.x) <= plat.width * 0.5 + 0.15 && plat.y <= this.y + 0.1) {
        if (surfaceY === null || plat.y > surfaceY) {
          surfaceY = plat.y;
        }
      }
    }
    if (surfaceY === null) {
      this.shadowMesh.visible = false;
    } else {
      this.shadowMesh.visible = true;
      const heightAbove = Math.max(0, this.y - surfaceY);
      const scale = Math.max(0.35, 1 - heightAbove * 0.11);
      this.shadowMesh.position.set(this.x, surfaceY + 0.03, 0);
      this.shadowMesh.scale.set(scale, scale, 1);
      this.shadowMat.opacity = Math.max(0.15, 0.72 - heightAbove * 0.1);
    }
  }

  private updateGhosts(dt: number): void {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.age += dt;
      if (g.age >= g.maxAge) {
        this.scene.remove(g.mesh);
        g.material.dispose();
        g.texture.dispose();
        this.ghosts.splice(i, 1);
      } else {
        g.material.opacity = (1 - g.age / g.maxAge) * 0.55;
      }
    }
  }

  private clearGhosts(): void {
    for (const g of this.ghosts) {
      this.scene.remove(g.mesh);
      g.material.dispose();
      g.texture.dispose();
    }
    this.ghosts = [];
  }

  public dispose(): void {
    this.clearGhosts();
    this.scene.remove(this.animator.group);
    this.scene.remove(this.shadowMesh);
    this.scene.remove(this.chargeRingMesh, this.chargeCoreMesh);
    this.animator.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    this.shadowTex.dispose();
    this.chargeRingGeo.dispose();
    this.chargeRingMat.dispose();
    this.chargeCoreGeo.dispose();
    this.chargeCoreMat.dispose();
  }
}
