import * as THREE from 'three';

export interface SheetSliceConfig {
  url: string;
  cols: number;
  rows: number;
  /** Per-row normalized vertical crop [yStart, yEnd] in 0..1 to exclude any labels */
  rowBands: [number, number][];
  cellW: number;
  cellH: number;
  /** Bottom foot margin in pixels */
  footMargin?: number;
  /** Color distance threshold for flood-fill grey removal */
  bgTolerance?: number;
  /** Trim bottom shadow oval below floating characters (fraction of cell height) */
  ignoreIsolatedBottomShadow?: boolean;
}

/**
 * Loads an illustrated 2D spritesheet on a solid neutral grey background,
 * removes the background cleanly via edge-connected flood fill (preserving
 * metallic silver blades, stone armor, and bone whites), crops out any text
 * bands, centers & foot-aligns every sprite frame into a uniform CanvasTexture.
 */
export function loadAndProcessEnemyAtlas(
  cfg: SheetSliceConfig,
  onReady: (texture: THREE.CanvasTexture) => void,
): void {
  if (typeof window === 'undefined') return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const tex = processImageToUniformAtlas(img, cfg);
      onReady(tex);
    } catch {
      // Fallback texture remains active
    }
  };
  img.src = cfg.url;
}

function processImageToUniformAtlas(
  img: HTMLImageElement,
  cfg: SheetSliceConfig,
): THREE.CanvasTexture {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const atlas = document.createElement('canvas');
  atlas.width = cfg.cols * cfg.cellW;
  atlas.height = cfg.rows * cfg.cellH;
  const outCtx = atlas.getContext('2d')!;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';

  // Draw full source onto an offscreen canvas so we can sample exact grey bg
  const work = document.createElement('canvas');
  work.width = srcW;
  work.height = srcH;
  const wCtx = work.getContext('2d', { willReadFrequently: true })!;
  wCtx.drawImage(img, 0, 0, srcW, srcH);

  // Sample background grey from safe top-left margin
  const cornerData = wCtx.getImageData(4, 4, 8, 8).data;
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  const samples = cornerData.length / 4;
  for (let i = 0; i < cornerData.length; i += 4) {
    bgR += cornerData[i];
    bgG += cornerData[i + 1];
    bgB += cornerData[i + 2];
  }
  bgR = Math.round(bgR / samples);
  bgG = Math.round(bgG / samples);
  bgB = Math.round(bgB / samples);

  const tol = cfg.bgTolerance ?? 30;
  const tolSq = tol * tol;
  const footMargin = cfg.footMargin ?? 6;
  const colWidth = srcW / cfg.cols;

  for (let row = 0; row < cfg.rows; row++) {
    const [bandStart, bandEnd] = cfg.rowBands[row] ?? [row / cfg.rows, (row + 1) / cfg.rows];
    const sy = Math.floor(bandStart * srcH);
    const sh = Math.max(8, Math.floor((bandEnd - bandStart) * srcH));

    for (let col = 0; col < cfg.cols; col++) {
      const sx = Math.floor(col * colWidth);
      const sw = Math.max(8, Math.floor(colWidth));

      // Copy cell to temp canvas and flood-fill remove grey background from its perimeter
      const cellCanvas = document.createElement('canvas');
      cellCanvas.width = sw;
      cellCanvas.height = sh;
      const cCtx = cellCanvas.getContext('2d', { willReadFrequently: true })!;
      cCtx.drawImage(work, sx, sy, sw, sh, 0, 0, sw, sh);

      const imgData = cCtx.getImageData(0, 0, sw, sh);
      const data = imgData.data;
      const total = sw * sh;
      const visited = new Uint8Array(total);
      const isBg = new Uint8Array(total);
      const queue = new Int32Array(total);
      let qHead = 0;
      let qTail = 0;

      const isBgPixel = (idx: number): boolean => {
        const p = idx * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const dr = r - bgR;
        const dg = g - bgG;
        const db = b - bgB;
        const distSq = dr * dr + dg * dg + db * db;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        return distSq < tolSq && sat < 26;
      };

      const enqueue = (x: number, y: number) => {
        if (x < 0 || x >= sw || y < 0 || y >= sh) return;
        const idx = y * sw + x;
        if (visited[idx]) return;
        if (!isBgPixel(idx)) return;
        visited[idx] = 1;
        isBg[idx] = 1;
        queue[qTail++] = idx;
      };

      for (let x = 0; x < sw; x++) {
        enqueue(x, 0);
        enqueue(x, sh - 1);
      }
      for (let y = 0; y < sh; y++) {
        enqueue(0, y);
        enqueue(sw - 1, y);
      }

      while (qHead < qTail) {
        const idx = queue[qHead++];
        const x = idx % sw;
        const y = (idx - x) / sw;
        if (x > 0) enqueue(x - 1, y);
        if (x < sw - 1) enqueue(x + 1, y);
        if (y > 0) enqueue(x, y - 1);
        if (y < sh - 1) enqueue(x, y + 1);
      }

      // Clear background + isolated flat interior grey pockets (between legs/bowstring)
      for (let i = 0; i < total; i++) {
        const p = i * 4;
        if (isBg[i]) {
          data[p + 3] = 0;
        } else {
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          const dr = r - bgR;
          const dg = g - bgG;
          const db = b - bgB;
          if (sat < 10 && dr * dr + dg * dg + db * db < 15 * 15) {
            data[p + 3] = 0;
            isBg[i] = 1;
          }
        }
      }

      // 2px anti-aliased grey halo fringe cleanup around foreground edges
      for (let y = 1; y < sh - 1; y++) {
        for (let x = 1; x < sw - 1; x++) {
          const idx = y * sw + x;
          if (isBg[idx]) continue;
          const touchesBg =
            isBg[idx - 1] ||
            isBg[idx + 1] ||
            isBg[idx - sw] ||
            isBg[idx + sw];
          if (touchesBg) {
            const p = idx * 4;
            const r = data[p];
            const g = data[p + 1];
            const b = data[p + 2];
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
            if (sat < 26 && dist < 56) {
              data[p + 3] = Math.round(data[p + 3] * 0.15);
            }
          }
        }
      }

      // Optional: remove detached dark oval drop-shadow sitting alone at the very bottom
      if (cfg.ignoreIsolatedBottomShadow) {
        // Scan from bottom up to detect a horizontal empty gap separating shadow from floating feet
        const rowOpaque = new Int32Array(sh);
        for (let y = 0; y < sh; y++) {
          let cnt = 0;
          for (let x = 0; x < sw; x++) {
            if (data[(y * sw + x) * 4 + 3] > 60) cnt++;
          }
          rowOpaque[y] = cnt;
        }
        // Check bottom 22% for a small band with an empty gap above it
        const bottomStart = Math.floor(sh * 0.76);
        let gapY = -1;
        for (let y = bottomStart; y < sh - 6; y++) {
          if (rowOpaque[y] === 0 && rowOpaque[y + 1] === 0) {
            // See if there is a small shadow blob below this gap
            let hasBelow = false;
            for (let yy = y + 2; yy < sh; yy++) {
              if (rowOpaque[yy] > 8) {
                hasBelow = true;
                break;
              }
            }
            if (hasBelow) {
              gapY = y;
              break;
            }
          }
        }
        if (gapY > 0) {
          for (let y = gapY; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
              data[(y * sw + x) * 4 + 3] = 0;
            }
          }
        }
      }

      cCtx.putImageData(imgData, 0, 0);

      // Compute tight opaque bounding box inside cell for crisp foot alignment
      let minX = sw;
      let maxX = 0;
      let minY = sh;
      let maxY = 0;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (data[(y * sw + x) * 4 + 3] > 55) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX > minX && maxY > minY) {
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const maxDrawW = cfg.cellW - 10;
        const maxDrawH = cfg.cellH - footMargin - 8;
        const scale = Math.min(maxDrawW / bw, maxDrawH / bh);
        const drawW = bw * scale;
        const drawH = bh * scale;

        const destX = col * cfg.cellW + (cfg.cellW - drawW) * 0.5;
        const destY = row * cfg.cellH + cfg.cellH - footMargin - drawH;
        outCtx.drawImage(cellCanvas, minX, minY, bw, bh, destX, destY, drawW, drawH);
      }
    }
  }

  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates an immediate stylized illustrated fallback sprite texture
 * while the high-res PNG/JPG enemy sheet finishes decoding.
 */
export function buildFallbackEnemyTexture(accentHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const cw = 128;
  const ch = 128;

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = col * cw + cw * 0.5;
      const by = row * ch + ch - 10;
      ctx.save();
      ctx.translate(cx, by);
      ctx.fillStyle = accentHex;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(-24, -72, 48, 56, 12);
      ctx.fill();
      ctx.stroke();
      // Eyes
      ctx.fillStyle = '#fde047';
      ctx.fillRect(4, -56, 7, 7);
      ctx.fillRect(15, -56, 6, 7);
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
