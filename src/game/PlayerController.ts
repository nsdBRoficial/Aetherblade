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
  attackJustPressed: boolean;
  guardHeld: boolean;
  guardJustPressed: boolean;
  dashJustPressed: boolean;
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

  // Combat & Combo state
  public attackStep: 0 | 1 | 2 | 3 | 4 = 0; // 1..3 ground combo, 4 air attack
  private attackTimer = 0;
  private attackDuration = 0;
  private attackQueued = false;
  public attackInstanceId = 0;
  public isAttackHitboxActive = false;

  // Guard & Perfect Parry
  public isGuarding = false;
  public parryWindowTimer = 0; // active perfect parry timing window (190ms)
  private parrySuccessTimer = 0; // plays PARRY animation pose

  // Dash & Invincibility
  private dashTimer = 0;
  private dashCooldown = 0;
  private dashGhostTimer = 0;
  private ghosts: DashGhost[] = [];
  public invulnTimer = 0;
  private hurtTimer = 0;

  // Contact shadow
  private shadowMesh: THREE.Mesh;
  private shadowGeo: THREE.PlaneGeometry;
  private shadowMat: THREE.MeshBasicMaterial;
  private shadowTex: THREE.CanvasTexture;
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
    this.attackTimer = 0;
    this.attackQueued = false;
    this.isAttackHitboxActive = false;
    this.isGuarding = false;
    this.parryWindowTimer = 0;
    this.parrySuccessTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.invulnTimer = 0;
    this.hurtTimer = 0;
    this.clearGhosts();
    this.animator.setFacing(1);
    this.animator.setState('IDLE', true);
    this.animator.group.position.set(this.x, this.y, 0);
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
    const isFinisher = this.attackStep === 3;
    const reach = isFinisher ? 2.45 : this.attackStep === 2 ? 2.3 : 2.05;
    const height = isFinisher ? 2.15 : 1.75;
    return {
      x: this.x + this.facing * (reach * 0.52 + 0.25),
      y: this.y + (this.attackStep === 4 ? -0.15 : 0.1),
      width: reach,
      height,
    };
  }

  public getAttackDamage(): { damage: number; heavy: boolean; knockbackX: number } {
    if (this.attackStep === 3) {
      return { damage: 34, heavy: true, knockbackX: 11.5 };
    }
    if (this.attackStep === 2) {
      return { damage: 20, heavy: false, knockbackX: 6.2 };
    }
    if (this.attackStep === 4) {
      return { damage: 19, heavy: false, knockbackX: 5.5 };
    }
    return { damage: 16, heavy: false, knockbackX: 5.0 };
  }

  public heal(amount: number): number {
    const prev = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - prev;
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

    // Standard GUARD
    if (this.isGuarding && attackFromFront && this.stamina >= 12) {
      const chip = Math.max(2, Math.round(amount * 0.25));
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

    // Direct Hit
    this.hp = Math.max(0, this.hp - amount);
    this.attackStep = 0;
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
    vfx.spawnFloatingText(this.x, this.y + 0.3, `-${amount}`, '#f87171', 1.15);

    if (this.hp <= 0) {
      this.isDead = true;
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

    // Stamina regen (slower while guarding)
    const regenRate = this.isGuarding ? 6 : 26;
    if (this.dashTimer <= 0 && this.attackStep === 0) {
      this.stamina = Math.min(this.maxStamina, this.stamina + regenRate * dt);
    }

    // Movement directional input
    const moveDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

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
      this.vy = 0;
      this.vx = this.facing * 20.5;
      this.dashGhostTimer = 0;
      this.animator.triggerSquash(1.22, 0.84);
      audio.playDash();
      vfx.spawnDustPuff(this.x, this.y, 7);
    }

    // 2. GUARD & PERFECT PARRY (K / Right Click)
    if (input.guardJustPressed && this.hurtTimer <= 0 && this.dashTimer <= 0) {
      this.parryWindowTimer = 0.19; // Crisp 190ms Perfect Parry window
      this.attackStep = 0;
      this.isAttackHitboxActive = false;
    }
    this.isGuarding =
      input.guardHeld &&
      this.hurtTimer <= 0 &&
      this.dashTimer <= 0 &&
      this.attackStep === 0 &&
      this.grounded;

    // 3. ATTACK COMBO (J / Left Click)
    if (input.attackJustPressed && this.hurtTimer <= 0 && this.dashTimer <= 0) {
      if (this.attackStep === 0) {
        if (!this.grounded) {
          this.startAttack(4, vfx, audio);
        } else {
          this.startAttack(1, vfx, audio);
        }
      } else if (this.attackStep === 1 || this.attackStep === 2) {
        // Queue next combo hit during cancel window
        if (this.attackTimer > this.attackDuration * 0.3) {
          this.attackQueued = true;
        }
      }
    }

    // Advance active attack timers & active hitbox window
    if (this.attackStep > 0) {
      this.attackTimer += dt;
      const t = this.attackTimer / this.attackDuration;
      // Active hitbox ONLY during impact frames (0.24..0.68 of clip)
      this.isAttackHitboxActive = t >= 0.22 && t <= 0.68;

      if (this.attackTimer >= this.attackDuration) {
        if (this.attackQueued && this.grounded && this.attackStep < 3) {
          const nextStep = (this.attackStep + 1) as 2 | 3;
          if (moveDir !== 0) this.facing = moveDir > 0 ? 1 : -1;
          this.startAttack(nextStep, vfx, audio);
        } else {
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
      const targetSpeed = moveDir * 9.4;
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
    } else if (this.attackStep === 1) {
      this.animator.setState('ATTACK_1');
    } else if (this.attackStep === 2) {
      this.animator.setState('ATTACK_2');
    } else if (this.attackStep === 3) {
      this.animator.setState('ATTACK_3');
    } else if (this.attackStep === 4) {
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

    // Blink during post-hit invulnerability (not during dash)
    const blinkHide =
      this.invulnTimer > 0 &&
      this.dashTimer <= 0 &&
      this.parrySuccessTimer <= 0 &&
      Math.floor(this.invulnTimer * 22) % 2 === 0;

    this.animator.group.position.set(this.x, this.y, 0);
    this.animator.update(dt, blinkHide);
    this.updateContactShadow(level);
  }

  private startAttack(step: 1 | 2 | 3 | 4, vfx: VfxManager, audio: ProceduralAudio): void {
    this.attackStep = step;
    this.attackTimer = 0;
    this.attackQueued = false;
    this.attackInstanceId++;
    this.attackDuration = step === 3 ? 0.34 : step === 2 ? 0.25 : step === 4 ? 0.26 : 0.24;

    if (this.grounded) {
      this.vx = this.facing * (step === 3 ? 7.5 : 4.2);
    }

    const animMap: Record<1 | 2 | 3 | 4, 'ATTACK_1' | 'ATTACK_2' | 'ATTACK_3' | 'AIR_ATTACK'> = {
      1: 'ATTACK_1',
      2: 'ATTACK_2',
      3: 'ATTACK_3',
      4: 'AIR_ATTACK',
    };
    this.animator.setState(animMap[step], true);
    this.animator.triggerSquash(step === 3 ? 1.18 : 1.09, step === 3 ? 0.88 : 0.94);

    audio.playSlash(step);
    vfx.spawnSlashArc(
      this.x,
      this.y,
      this.facing,
      step,
      step === 3 ? 0x38bdf8 : 0x7dd3fc,
    );
    vfx.flashLight(
      this.x + this.facing * 1.1,
      this.y + 1.1,
      step === 3 ? 0x38bdf8 : 0x7dd3fc,
      step === 3 ? 8.5 : 5.2,
      0.14,
    );
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
    this.animator.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    this.shadowTex.dispose();
  }
}
