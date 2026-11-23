import * as THREE from 'three';

export interface SpawnText3DOptions {
  /** World X position */
  x: number;
  /** World Y position (typically above the enemy's head) */
  y: number;
  /** Optional world Z depth (defaults to 0.72 in front of gameplay sprites) */
  z?: number;
  /** Text string (e.g. "-24", "CRIT -42!", "PERFECT PARRY!") */
  text: string;
  /** Primary hex CSS color for the fill gradient (e.g. "#fde047", "#38bdf8", "#ffffff") */
  color?: string;
  /** Relative scale multiplier (1.0 = standard hit, 1.25+ = heavy crit / counter) */
  scale?: number;
  /** Optional horizontal launch velocity impulse (e.g. along knockback direction) */
  vxHint?: number;
}

interface CachedTextEntry {
  texture: THREE.CanvasTexture;
  aspect: number;
}

interface ActiveSpriteText {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  gravity: number;
  baseWidth: number;
  baseHeight: number;
  baseRotation: number;
  age: number;
  maxAge: number;
  isEmphasis: boolean;
}

const MAX_CACHE_ENTRIES = 96;
const WORLD_HEIGHT_BASE = 0.56;

/**
 * Lightens a CSS hex color toward warm white for the top stop of the RPG text gradient.
 */
function lightenHex(hex: string, amount = 0.55): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return '#ffffff';
  const r = Math.min(255, Math.round(((num >> 16) & 255) + (255 - ((num >> 16) & 255)) * amount));
  const g = Math.min(255, Math.round(((num >> 8) & 255) + (255 - ((num >> 8) & 255)) * amount));
  const b = Math.min(255, Math.round((num & 255) + (255 - (num & 255)) * amount));
  return `rgb(${r},${g},${b})`;
}

/**
 * Generates and animates native Three.js 3D floating damage numbers using
 * cached CanvasTexture THREE.Sprites with warm-espresso Hero-style outlines,
 * ballistic arc physics, elastic pop-in, and HDR bloom emphasis on crits/parries.
 */
export class FloatingText3DSystem {
  private scene: THREE.Scene;
  private active: ActiveSpriteText[] = [];
  private cache = new Map<string, CachedTextEntry>();
  private zStaggerIdx = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private getOrCreateTexture(text: string, color: string): CachedTextEntry {
    const key = `${text}|${color}`;
    const existing = this.cache.get(key);
    if (existing) {
      // Refresh LRU position
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing;
    }

    // Evict oldest cached texture if over budget
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const evicted = this.cache.get(oldestKey);
        evicted?.texture.dispose();
        this.cache.delete(oldestKey);
      }
    }

    const fontSize = 54;
    const fontSpec = `900 ${fontSize}px "JetBrains Mono", "Cinzel", ui-monospace, sans-serif`;

    // Measure text width first on a scratch canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = fontSpec;
    const measured = Math.ceil(ctx.measureText(text).width);

    const padX = 22;
    const padY = 18;
    const width = Math.max(64, measured + padX * 2);
    const height = fontSize + padY * 2;
    canvas.width = width;
    canvas.height = height;

    // Re-apply font after resizing canvas
    ctx.font = fontSpec;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const cx = width * 0.5;
    const cy = height * 0.52;

    // 1. Crisp hard-pixel drop shadow matching Hero RPG UI aesthetic
    ctx.fillStyle = 'rgba(20, 12, 12, 0.92)';
    ctx.strokeStyle = 'rgba(20, 12, 12, 0.92)';
    ctx.lineWidth = 11;
    ctx.strokeText(text, cx + 3, cy + 4);
    ctx.fillText(text, cx + 3, cy + 4);

    // 2. Thick warm-espresso Hero-style outer ink contour (#1c1312)
    ctx.strokeStyle = '#1c1312';
    ctx.lineWidth = 10;
    ctx.strokeText(text, cx, cy);

    // 3. Vibrant 2-stop vertical RPG gradient fill (bright top highlight -> rich base hue)
    const grad = ctx.createLinearGradient(0, cy - fontSize * 0.45, 0, cy + fontSize * 0.45);
    grad.addColorStop(0.0, lightenHex(color, 0.62));
    grad.addColorStop(0.45, color);
    grad.addColorStop(1.0, color);
    ctx.fillStyle = grad;
    ctx.fillText(text, cx, cy);

    // 4. Subtle top specular bevel line for crisp pixel-art gleam
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.fillRect(0, 0, width, cy - fontSize * 0.08);
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    const entry: CachedTextEntry = {
      texture,
      aspect: width / height,
    };
    this.cache.set(key, entry);
    return entry;
  }

  public spawn(opts: SpawnText3DOptions): void {
    const color = opts.color ?? '#ffffff';
    const scale = opts.scale ?? 1.0;
    const isEmphasis = scale >= 1.18;

    const { texture, aspect } = this.getOrCreateTexture(opts.text, color);

    // Subtle HDR lift on Crit / Counter / Parry / Enraged sprites so Selective Bloom halos them cleanly
    const tintColor = isEmphasis
      ? new THREE.Color(1.42, 1.42, 1.42)
      : new THREE.Color(1.06, 1.06, 1.06);

    const material = new THREE.SpriteMaterial({
      map: texture,
      color: tintColor,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: !isEmphasis,
    });

    const sprite = new THREE.Sprite(material);
    this.zStaggerIdx = (this.zStaggerIdx + 1) % 8;
    const spawnX = opts.x + (Math.random() - 0.5) * 0.42;
    const spawnY = opts.y + 0.35 + (Math.random() - 0.5) * 0.16;
    const spawnZ = (opts.z ?? 0.72) + this.zStaggerIdx * 0.025;

    const baseHeight = WORLD_HEIGHT_BASE * scale;
    const baseWidth = baseHeight * aspect;
    const baseRotation = isEmphasis ? (Math.random() - 0.5) * 0.14 : (Math.random() - 0.5) * 0.06;

    sprite.position.set(spawnX, spawnY, spawnZ);
    sprite.scale.set(baseWidth * 0.35, baseHeight * 0.35, 1);
    material.rotation = baseRotation;
    sprite.renderOrder = 18 + this.zStaggerIdx;

    this.scene.add(sprite);

    const vx =
      opts.vxHint !== undefined
        ? opts.vxHint + (Math.random() - 0.5) * 1.1
        : (Math.random() - 0.5) * 2.2;
    const vy = isEmphasis ? 5.2 + Math.random() * 0.8 : 4.2 + Math.random() * 0.7;

    this.active.push({
      sprite,
      material,
      x: spawnX,
      y: spawnY,
      z: spawnZ,
      vx,
      vy,
      gravity: isEmphasis ? 8.8 : 9.6,
      baseWidth,
      baseHeight,
      baseRotation,
      age: 0,
      maxAge: isEmphasis ? 0.96 : 0.78,
      isEmphasis,
    });
  }

  public update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      item.age += dt;
      if (item.age >= item.maxAge) {
        this.scene.remove(item.sprite);
        item.material.dispose();
        this.active.splice(i, 1);
        continue;
      }

      const t = item.age / item.maxAge;

      // Ballistic arc with gentle air drag so damage numbers pop upward then float softly
      item.x += item.vx * dt;
      item.vx *= Math.max(0, 1 - 3.6 * dt);
      item.y += item.vy * dt;
      item.vy = Math.max(0.45, item.vy - item.gravity * dt);

      item.sprite.position.set(item.x, item.y, item.z);

      // Elastic pop-in scale curve (0..0.14s spring overshoot -> settles cleanly at 1.0x)
      let popScale = 1.0;
      if (item.age < 0.085) {
        const p = item.age / 0.085;
        popScale = THREE.MathUtils.lerp(0.35, item.isEmphasis ? 1.38 : 1.24, 1 - (1 - p) * (1 - p));
      } else if (item.age < 0.18) {
        const p = (item.age - 0.085) / 0.095;
        popScale = THREE.MathUtils.lerp(item.isEmphasis ? 1.38 : 1.24, 1.0, p);
      } else if (t > 0.72) {
        // Subtle shrink-drift on final fade out
        const fadeT = (t - 0.72) / 0.28;
        popScale = THREE.MathUtils.lerp(1.0, 0.88, fadeT);
      }

      item.sprite.scale.set(item.baseWidth * popScale, item.baseHeight * popScale, 1);

      // Settle tilt toward level over first half of lifespan
      item.material.rotation = THREE.MathUtils.lerp(item.baseRotation, 0, Math.min(1, t * 2.2));

      // Crisp full opacity through apex, smooth fade over final 36%
      item.material.opacity = t < 0.64 ? 1.0 : Math.max(0, 1 - (t - 0.64) / 0.36);
    }
  }

  public clearActive(): void {
    for (const item of this.active) {
      this.scene.remove(item.sprite);
      item.material.dispose();
    }
    this.active = [];
  }

  public dispose(): void {
    this.clearActive();
    for (const entry of this.cache.values()) {
      entry.texture.dispose();
    }
    this.cache.clear();
  }
}
