import * as THREE from 'three';
import { HeroAnimState } from './types';

interface AnimClip {
  row: number;
  frames: number[];
  fps: number;
  loop: boolean;
}

interface RawFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  // Horizontal anchor offset ratio (0.5 = center of bbox; <0.5 keeps torso steady when sword arc extends right)
  anchorXRatio?: number;
}

const ATLAS_COLS = 9;
const ATLAS_ROWS = 4;
const CELL_W = 176;
const CELL_H = 120;

// Exact pixel bounding boxes measured from the attached 4-row hero spritesheet (838 x 476)
const ATTACHED_SHEET_URL =
  '/assets/aistudio/Captura_de_tela_2026-11-18_195915_91a616c5.png';

const ATTACHED_SHEET_RECTS: RawFrameRect[][] = [
  // Row 0: IDLE (0..3), RUN (4..8)
  [
    { x: 19, y: 26, w: 72, h: 97, anchorXRatio: 0.56 },
    { x: 107, y: 26, w: 66, h: 97, anchorXRatio: 0.56 },
    { x: 190, y: 27, w: 60, h: 97, anchorXRatio: 0.55 },
    { x: 268, y: 27, w: 59, h: 97, anchorXRatio: 0.55 },
    { x: 366, y: 40, w: 75, h: 81, anchorXRatio: 0.56 },
    { x: 459, y: 42, w: 74, h: 82, anchorXRatio: 0.56 },
    { x: 546, y: 45, w: 74, h: 75, anchorXRatio: 0.56 },
    { x: 631, y: 41, w: 83, h: 82, anchorXRatio: 0.52 },
    { x: 721, y: 41, w: 102, h: 82, anchorXRatio: 0.45 },
  ],
  // Row 1: ATTACK_1 (0..1), ATTACK_2 (2..3), ATTACK_3 (4..5)
  [
    { x: 21, y: 142, w: 82, h: 96, anchorXRatio: 0.55 },
    { x: 118, y: 159, w: 114, h: 78, anchorXRatio: 0.38 },
    { x: 255, y: 155, w: 162, h: 81, anchorXRatio: 0.32 },
    { x: 424, y: 160, w: 118, h: 75, anchorXRatio: 0.38 },
    { x: 561, y: 138, w: 111, h: 98, anchorXRatio: 0.42 },
    { x: 687, y: 162, w: 79, h: 75, anchorXRatio: 0.52 },
  ],
  // Row 2: GUARD (0..5), PARRY (6..7)
  [
    { x: 17, y: 253, w: 81, h: 80, anchorXRatio: 0.55 },
    { x: 110, y: 253, w: 85, h: 79, anchorXRatio: 0.55 },
    { x: 232, y: 258, w: 69, h: 76, anchorXRatio: 0.54 },
    { x: 329, y: 264, w: 81, h: 70, anchorXRatio: 0.54 },
    { x: 431, y: 265, w: 72, h: 69, anchorXRatio: 0.54 },
    { x: 524, y: 260, w: 72, h: 74, anchorXRatio: 0.54 },
    { x: 607, y: 250, w: 79, h: 83, anchorXRatio: 0.56 },
    { x: 712, y: 252, w: 81, h: 82, anchorXRatio: 0.55 },
  ],
  // Row 3: JUMP (0..1), AIR_ATTACK (2), FALL (3), HURT (4..5), DEAD (6..8)
  [
    { x: 21, y: 366, w: 65, h: 77, anchorXRatio: 0.52 },
    { x: 113, y: 353, w: 68, h: 78, anchorXRatio: 0.52 },
    { x: 217, y: 355, w: 91, h: 81, anchorXRatio: 0.42 },
    { x: 308, y: 372, w: 63, h: 65, anchorXRatio: 0.52 },
    { x: 414, y: 357, w: 63, h: 90, anchorXRatio: 0.5 },
    { x: 495, y: 363, w: 65, h: 74, anchorXRatio: 0.5 },
    { x: 583, y: 376, w: 54, h: 57, anchorXRatio: 0.5 },
    { x: 647, y: 376, w: 68, h: 52, anchorXRatio: 0.5 },
    { x: 721, y: 394, w: 98, h: 59, anchorXRatio: 0.5 },
  ],
];

const ANIM_CLIPS: Record<HeroAnimState, AnimClip> = {
  IDLE: { row: 0, frames: [0, 1, 2, 3], fps: 7, loop: true },
  RUN: { row: 0, frames: [4, 5, 6, 7, 8], fps: 13, loop: true },
  ATTACK_1: { row: 1, frames: [0, 1, 1], fps: 13, loop: false },
  ATTACK_2: { row: 1, frames: [2, 2, 3], fps: 14, loop: false },
  ATTACK_3: { row: 1, frames: [4, 4, 5], fps: 12, loop: false },
  GUARD: { row: 2, frames: [2, 3, 4], fps: 10, loop: false },
  PARRY: { row: 2, frames: [6, 6, 7], fps: 12, loop: false },
  JUMP: { row: 3, frames: [0, 1], fps: 9, loop: false },
  AIR_ATTACK: { row: 3, frames: [2, 2], fps: 12, loop: false },
  FALL: { row: 3, frames: [3], fps: 8, loop: true },
  HURT: { row: 3, frames: [4, 5], fps: 10, loop: false },
  DEAD: { row: 3, frames: [6, 7, 8], fps: 6, loop: false },
};

/**
 * Removes solid grey background and rounded dark corners using edge-connected flood fill,
 * keeping silver swords and armor completely intact.
 */
function stripGreyBackground(
  img: HTMLImageElement,
): HTMLCanvasElement {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const ctx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Sample background grey from a guaranteed clear top margin spot
  const sampleIdx = (Math.min(12, h - 1) * w + Math.min(40, w - 1)) * 4;
  const bgR = data[sampleIdx];
  const bgG = data[sampleIdx + 1];
  const bgB = data[sampleIdx + 2];

  const visited = new Uint8Array(w * h);
  const isBg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qHead = 0;
  let qTail = 0;

  const matchesBgOrCorner = (idx: number, x: number, y: number): boolean => {
    const p = idx * 4;
    const a = data[p + 3];
    if (a < 20) return true;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];

    // Black rounded corners near outer border
    if (r < 34 && g < 34 && b < 34 && (x < 28 || x > w - 28 || y < 28 || y > h - 28)) {
      return true;
    }

    const dr = r - bgR;
    const dg = g - bgG;
    const db = b - bgB;
    const distSq = dr * dr + dg * dg + db * db;
    // Grey background tolerance (neutral saturation + close luminance)
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const sat = maxCh - minCh;
    return distSq < 25 * 25 && sat < 24;
  };

  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    if (!matchesBgOrCorner(idx, x, y)) return;
    visited[idx] = 1;
    isBg[idx] = 1;
    queue[qTail++] = idx;
  };

  // Seed outer border
  for (let x = 0; x < w; x++) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }
  // Seed horizontal gutters between the 4 sprite rows
  const gutters = [12, 131, 243, 344, h - 10];
  for (const gy of gutters) {
    if (gy >= 0 && gy < h) {
      for (let x = 0; x < w; x += 2) enqueue(x, gy);
    }
  }

  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) enqueue(x - 1, y);
    if (x < w - 1) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y < h - 1) enqueue(x, y + 1);
  }

  // Also clear isolated interior grey pockets (between legs/cape) that are strictly flat bg grey
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (isBg[idx]) {
        data[idx * 4 + 3] = 0;
      } else {
        const p = idx * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        if (dist <= 10) {
          data[p + 3] = 0;
          isBg[idx] = 1;
        }
      }
    }
  }

  // 1px fringe cleanup: soften neutral grey anti-aliased edge pixels touching transparent bg
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (isBg[idx]) continue;
      if (
        isBg[idx - 1] ||
        isBg[idx + 1] ||
        isBg[idx - w] ||
        isBg[idx + w]
      ) {
        const p = idx * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
        if (sat < 22 && dist < 44) {
          data[p + 3] = Math.round(data[p + 3] * 0.2);
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return srcCanvas;
}

/**
 * Repacks the cleaned 4-row irregular spritesheet into a uniform 9x4 foot-aligned CanvasTexture.
 */
function buildNormalizedAtlasFromAttached(img: HTMLImageElement): THREE.CanvasTexture {
  const cleaned = stripGreyBackground(img);
  const atlas = document.createElement('canvas');
  atlas.width = ATLAS_COLS * CELL_W;
  atlas.height = ATLAS_ROWS * CELL_H;
  const ctx = atlas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const footMargin = 6;
  const targetBodyH = 92; // consistent hero height across all frames

  ATTACHED_SHEET_RECTS.forEach((rowRects, rowIdx) => {
    rowRects.forEach((rect, colIdx) => {
      const cellX = colIdx * CELL_W;
      const cellY = rowIdx * CELL_H;
      const anchorRatio = rect.anchorXRatio ?? 0.5;
      // Slight scale normalize for row 2/3 while preserving exact art proportions
      const scale = Math.min(1.06, (CELL_H - footMargin - 4) / Math.max(rect.h, targetBodyH));
      const drawW = rect.w * scale;
      const drawH = rect.h * scale;

      const destX = cellX + CELL_W * 0.5 - drawW * anchorRatio;
      const destY = cellY + CELL_H - footMargin - drawH;

      ctx.drawImage(
        cleaned,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        destX,
        destY,
        drawW,
        drawH,
      );
    });
  });

  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * High-craft procedural fallback hero spritesheet (9x4 uniform atlas)
 * matching the exact 4-row knight layout (cape, armor, sword, cyan slash, shield, parry ring).
 */
function buildProceduralHeroAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL_W;
  canvas.height = ATLAS_ROWS * CELL_H;
  const ctx = canvas.getContext('2d')!;

  const drawHero = (
    col: number,
    row: number,
    opts: {
      lean?: number;
      bobY?: number;
      legSpread?: number;
      swordAngle?: number;
      swordExtend?: number;
      slashArc?: 'down' | 'horiz' | 'up' | 'air' | null;
      shieldUp?: boolean;
      parryGlow?: boolean;
      hurt?: boolean;
      deadStep?: number;
    },
  ) => {
    const cx = col * CELL_W + CELL_W * 0.5;
    const baseY = row * CELL_H + CELL_H - 8;
    const bob = opts.bobY ?? 0;
    const lean = opts.lean ?? 0;

    ctx.save();
    ctx.translate(cx, baseY + bob);

    if (opts.deadStep === 3) {
      // Lying defeated on ground
      ctx.translate(0, -14);
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.ellipse(-6, 4, 34, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7c4a26';
      ctx.beginPath();
      ctx.arc(20, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      // Dropped sword & shield
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-32, 10);
      ctx.lineTo(-4, 10);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (opts.hurt || opts.deadStep) {
      ctx.rotate(opts.deadStep ? -0.75 * opts.deadStep * 0.55 : -0.28);
    } else {
      ctx.rotate(lean);
    }

    // Flowing royal-blue cape behind hero
    ctx.fillStyle = '#1d4ed8';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, -56);
    ctx.quadraticCurveTo(-38, -42, -42 - Math.abs(lean) * 30, -14);
    ctx.lineTo(-14, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Legs & brown boots
    const spread = opts.legSpread ?? 8;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    const drawLeg = (lx: number, ly: number) => {
      ctx.fillStyle = '#334155';
      ctx.fillRect(lx - 5, -26, 10, 14);
      ctx.fillStyle = '#6b3f20';
      ctx.fillRect(lx - 6, -14 + ly, 13, 14 - ly);
      ctx.strokeRect(lx - 6, -14 + ly, 13, 14 - ly);
    };
    drawLeg(-spread * 0.6, 0);
    drawLeg(spread * 0.7, opts.legSpread ? -3 : 0);

    // Armored blue & gold tunic torso
    ctx.fillStyle = '#1e40af';
    ctx.beginPath();
    ctx.roundRect(-15, -58, 30, 34, 6);
    ctx.fill();
    ctx.stroke();

    // Gold belt & trim
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-15, -35, 30, 5);
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(-12, -52, 8, 0, Math.PI * 2);
    ctx.arc(12, -52, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Head & spiky chestnut hair
    ctx.fillStyle = '#fcd5b5';
    ctx.beginPath();
    ctx.arc(2, -72, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(5, -75, 4, 5);
    ctx.fillRect(12, -75, 3, 5);

    // Spiky brown hair
    ctx.fillStyle = '#7c431f';
    ctx.beginPath();
    ctx.moveTo(-14, -74);
    ctx.lineTo(-18, -88);
    ctx.lineTo(-5, -84);
    ctx.lineTo(0, -96);
    ctx.lineTo(9, -86);
    ctx.lineTo(20, -92);
    ctx.lineTo(17, -77);
    ctx.quadraticCurveTo(2, -82, -14, -74);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sword
    const swAng = opts.swordAngle ?? 0.65;
    const swExt = opts.swordExtend ?? 0;
    ctx.save();
    ctx.translate(12 + swExt, -42);
    ctx.rotate(swAng);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-3, -6, 6, 12);
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3, -3.5);
    ctx.lineTo(42, -2);
    ctx.lineTo(48, 0);
    ctx.lineTo(42, 2.5);
    ctx.lineTo(3, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Cyan luminous slash arcs
    if (opts.slashArc) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = '#7dd3fc';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (opts.slashArc === 'down') {
        ctx.arc(16, -46, 50, -Math.PI * 0.45, Math.PI * 0.35);
      } else if (opts.slashArc === 'horiz') {
        ctx.ellipse(26, -40, 62, 22, 0.08, -Math.PI * 0.2, Math.PI * 0.55);
      } else if (opts.slashArc === 'up') {
        ctx.arc(16, -44, 52, Math.PI * 0.2, -Math.PI * 0.6, true);
      } else {
        ctx.arc(10, -45, 48, -Math.PI * 0.55, Math.PI * 0.45);
      }
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.restore();
    }

    // Shield (GUARD & PARRY)
    if (opts.shieldUp) {
      ctx.save();
      ctx.translate(22, -44);
      ctx.fillStyle = '#1d4ed8';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.lineTo(11, -18);
      ctx.lineTo(11, 6);
      ctx.lineTo(0, 20);
      ctx.lineTo(-10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-1.5, -10, 3, 20);
      ctx.fillRect(-6, -2, 12, 3);
      ctx.restore();
    }

    // Parry energy ring
    if (opts.parryGlow) {
      ctx.save();
      ctx.strokeStyle = '#60a5fa';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(30, -44, 14, 34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // Hurt impact spark
    if (opts.hurt) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(18, -86, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  // Row 0: IDLE (0..3) & RUN (4..8)
  for (let i = 0; i < 4; i++) {
    drawHero(i, 0, { bobY: Math.sin((i / 4) * Math.PI * 2) * 2.5, swordAngle: 0.72 + i * 0.03 });
  }
  for (let i = 0; i < 5; i++) {
    drawHero(4 + i, 0, {
      lean: 0.22,
      bobY: -Math.abs(Math.sin((i / 5) * Math.PI * 2)) * 5,
      legSpread: 14 + Math.sin(i * 1.4) * 6,
      swordAngle: i < 3 ? 2.4 : -0.35,
    });
  }

  // Row 1: ATTACK_1 (0..1), ATTACK_2 (2..3), ATTACK_3 (4..5)
  drawHero(0, 1, { lean: -0.05, swordAngle: -1.85 });
  drawHero(1, 1, { lean: 0.2, swordAngle: 0.5, swordExtend: 8, slashArc: 'down' });
  drawHero(2, 1, { lean: 0.25, swordAngle: 0.15, swordExtend: 14, slashArc: 'horiz' });
  drawHero(3, 1, { lean: 0.28, swordAngle: 0.0, swordExtend: 18 });
  drawHero(4, 1, { lean: 0.12, swordAngle: -0.95, swordExtend: 10, slashArc: 'up' });
  drawHero(5, 1, { lean: 0.15, swordAngle: 0.8 });

  // Row 2: GUARD (0..5), PARRY (6..7)
  for (let i = 0; i < 6; i++) {
    drawHero(i, 2, { lean: i > 2 ? 0.18 : 0.06, swordAngle: 2.3, shieldUp: true });
  }
  drawHero(6, 2, { lean: 0.12, swordAngle: 2.4, shieldUp: true, parryGlow: true });
  drawHero(7, 2, { lean: 0.05, swordAngle: 2.2, shieldUp: true });

  // Row 3: JUMP (0..1), AIR_ATTACK (2), FALL (3), HURT (4..5), DEAD (6..8)
  drawHero(0, 3, { bobY: -10, legSpread: 12, swordAngle: 1.2 });
  drawHero(1, 3, { bobY: -14, legSpread: 10, swordAngle: 0.8 });
  drawHero(2, 3, { bobY: -10, lean: 0.22, swordAngle: 0.05, swordExtend: 14, slashArc: 'air' });
  drawHero(3, 3, { bobY: -4, lean: 0.12, legSpread: 10, swordAngle: 1.4 });
  drawHero(4, 3, { hurt: true, swordAngle: 1.8 });
  drawHero(5, 3, { hurt: true, bobY: 4, swordAngle: 2.1 });
  drawHero(6, 3, { deadStep: 1 });
  drawHero(7, 3, { deadStep: 2 });
  drawHero(8, 3, { deadStep: 3 });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class SpriteAnimator {
  public group: THREE.Group;
  public mesh: THREE.Mesh;
  public material: THREE.MeshBasicMaterial;
  private geometry: THREE.PlaneGeometry;
  private texture: THREE.Texture;

  private cols = ATLAS_COLS;
  private rows = ATLAS_ROWS;
  private currentState: HeroAnimState = 'IDLE';
  private frameIndex = 0;
  private frameTimer = 0;
  private facing: 1 | -1 = 1;
  private baseScaleX = 3.25;
  private baseScaleY = 2.25;

  private flashTimer = 0;
  private squashX = 1;
  private squashY = 1;
  public sourceKind: 'attached' | 'custom' | 'procedural' = 'procedural';
  private onSourceChange?: (kind: 'attached' | 'custom' | 'procedural') => void;
  private disposed = false;

  constructor(onSourceChange?: (kind: 'attached' | 'custom' | 'procedural') => void) {
    this.onSourceChange = onSourceChange;
    this.group = new THREE.Group();

    // Start immediately with rich procedural fallback so frame 0 looks crisp
    this.texture = buildProceduralHeroAtlas();
    this.applyTextureSlice(0, 0);

    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.18,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    // Align feet exactly on y = 0 relative to group
    this.mesh.position.set(0, this.baseScaleY * 0.5 - 0.08, 0.08);
    this.mesh.scale.set(this.baseScaleX, this.baseScaleY, 1);
    this.mesh.renderOrder = 5;
    this.group.add(this.mesh);

    // Load the user's attached 4-row hero spritesheet asynchronously
    this.loadAttachedSpritesheet();
  }

  private loadAttachedSpritesheet(): void {
    if (typeof window === 'undefined') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.disposed) return;
      try {
        const nextTex = buildNormalizedAtlasFromAttached(img);
        this.swapTexture(nextTex, ATLAS_COLS, ATLAS_ROWS, 'attached');
      } catch {
        // Keep procedural fallback seamlessly
      }
    };
    img.onerror = () => {
      // Keep procedural fallback seamlessly
    };
    img.src = ATTACHED_SHEET_URL;
  }

  /**
   * Allows swapping in a custom uniform transparent PNG spritesheet (e.g. from /sprites/hero.png or file upload).
   */
  public loadCustomUniformSheet(url: string, cols = 9, rows = 4): void {
    if (typeof window === 'undefined') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.disposed) return;
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      this.swapTexture(tex, cols, rows, 'custom');
    };
    img.src = url;
  }

  private swapTexture(
    nextTex: THREE.Texture,
    cols: number,
    rows: number,
    kind: 'attached' | 'custom' | 'procedural',
  ): void {
    const prev = this.texture;
    this.texture = nextTex;
    this.cols = cols;
    this.rows = rows;
    this.material.map = this.texture;
    this.material.needsUpdate = true;
    this.sourceKind = kind;
    this.syncCurrentFrameUV();
    prev.dispose();
    this.onSourceChange?.(kind);
  }

  public setState(state: HeroAnimState, forceRestart = false): void {
    if (this.currentState === state && !forceRestart) return;
    this.currentState = state;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.syncCurrentFrameUV();
  }

  public setFacing(dir: 1 | -1): void {
    this.facing = dir;
  }

  public triggerFlash(duration = 0.1): void {
    this.flashTimer = duration;
  }

  public triggerSquash(sx: number, sy: number): void {
    this.squashX = sx;
    this.squashY = sy;
  }

  private applyTextureSlice(col: number, row: number): void {
    const safeCol = Math.min(col, this.cols - 1);
    const safeRow = Math.min(row, this.rows - 1);
    this.texture.repeat.set(1 / this.cols, 1 / this.rows);
    this.texture.offset.set(safeCol / this.cols, 1 - (safeRow + 1) / this.rows);
  }

  private syncCurrentFrameUV(): void {
    const clip = ANIM_CLIPS[this.currentState];
    const col = clip.frames[Math.min(this.frameIndex, clip.frames.length - 1)];
    this.applyTextureSlice(col, clip.row);
  }

  public update(dt: number, blinkInvisible = false): void {
    const clip = ANIM_CLIPS[this.currentState];
    const frameDur = 1 / clip.fps;
    this.frameTimer += dt;

    while (this.frameTimer >= frameDur) {
      this.frameTimer -= frameDur;
      if (this.frameIndex + 1 < clip.frames.length) {
        this.frameIndex++;
      } else if (clip.loop) {
        this.frameIndex = 0;
      }
      this.syncCurrentFrameUV();
    }

    // Smoothly return squash & stretch back to 1
    const damp = 1 - Math.exp(-16 * dt);
    this.squashX = THREE.MathUtils.lerp(this.squashX, 1, damp);
    this.squashY = THREE.MathUtils.lerp(this.squashY, 1, damp);

    this.mesh.scale.set(
      this.facing * this.baseScaleX * this.squashX,
      this.baseScaleY * this.squashY,
      1,
    );
    // Keep feet planted at y=0 even during squash/stretch
    this.mesh.position.y = this.baseScaleY * this.squashY * 0.5 - 0.08;

    // Hit flash tint
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      this.material.color.setHex(0xff9999);
    } else {
      this.material.color.setHex(0xffffff);
    }

    this.mesh.visible = !blinkInvisible;
  }

  /**
   * Spawns a translucent cyan dash ghost mesh at the hero's current pose.
   */
  public createGhostMesh(worldX: number, worldY: number): {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    texture: THREE.Texture;
  } {
    const clonedTex = this.texture.clone();
    clonedTex.needsUpdate = true;
    clonedTex.repeat.copy(this.texture.repeat);
    clonedTex.offset.copy(this.texture.offset);
    const mat = new THREE.MeshBasicMaterial({
      map: clonedTex,
      color: new THREE.Color(0x38bdf8).multiplyScalar(1.6),
      transparent: true,
      opacity: 0.58,
      alphaTest: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const ghost = new THREE.Mesh(this.geometry, mat);
    ghost.position.set(worldX, worldY + this.baseScaleY * 0.5 - 0.08, -0.05);
    ghost.scale.set(this.facing * this.baseScaleX, this.baseScaleY, 1);
    ghost.renderOrder = 4;
    return { mesh: ghost, material: mat, texture: clonedTex };
  }

  public dispose(): void {
    this.disposed = true;
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
