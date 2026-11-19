import * as THREE from 'three';
import { BiomeId, BiomePalette } from './types';

function makeTex(canvas: HTMLCanvasElement, repeatX = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Hand-painted illustrated sky & volumetric storybook clouds matching MAPA_E_LAYOUTS.
 */
export function paintSkyBackdrop(palette: BiomePalette): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, palette.skyTop);
  grad.addColorStop(0.62, palette.skyBottom);
  grad.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Soft radiant sun / canopy light bloom
  const sunX = 720;
  const sunY = 128;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 210);
  sunGrad.addColorStop(0, 'rgba(255,253,235,0.95)');
  sunGrad.addColorStop(0.24, 'rgba(255,248,215,0.48)');
  sunGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // Diagonal sunlit god-rays for Deep Forest & Bamboo Forest
  if (palette.id === 'deep-forest' || palette.id === 'bamboo-forest') {
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const rx = 80 + i * 115;
      const rayGrad = ctx.createLinearGradient(rx, 0, rx + 70, 512);
      rayGrad.addColorStop(0, 'rgba(240,255,215,0.22)');
      rayGrad.addColorStop(0.7, 'rgba(220,255,200,0.06)');
      rayGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(rx - 22, 0);
      ctx.lineTo(rx + 28, 0);
      ctx.lineTo(rx + 125, 512);
      ctx.lineTo(rx + 35, 512);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else {
    // Painterly cel-shaded storybook clouds (like Green Hills / Wheat Field / Hare Canyon)
    const drawCloud = (cx: number, cy: number, s: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      // Soft cool underside
      ctx.fillStyle = 'rgba(186, 224, 248, 0.72)';
      ctx.beginPath();
      ctx.arc(-52, 8, 30, 0, Math.PI * 2);
      ctx.arc(-10, -10, 44, 0, Math.PI * 2);
      ctx.arc(38, -2, 34, 0, Math.PI * 2);
      ctx.arc(68, 12, 22, 0, Math.PI * 2);
      ctx.fill();
      // Bright cream sunlit top
      ctx.fillStyle = 'rgba(255, 254, 248, 0.92)';
      ctx.beginPath();
      ctx.arc(-50, 2, 28, 0, Math.PI * 2);
      ctx.arc(-8, -16, 42, 0, Math.PI * 2);
      ctx.arc(36, -8, 32, 0, Math.PI * 2);
      ctx.arc(64, 7, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawCloud(180, 150, 1.05);
    drawCloud(495, 118, 1.35);
    drawCloud(835, 165, 1.1);
    drawCloud(960, 105, 0.85);
  }

  return makeTex(c, false);
}

/**
 * Seamless 2048x512 hand-painted panoramic Layer 1 (distant mountains, canopy silhouettes, mesas).
 */
export function paintFarPanorama(biomeId: BiomeId, palette: BiomePalette): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const baseColor = '#' + palette.farMountain.toString(16).padStart(6, '0');
  const fogHex = '#' + palette.fogColor.toString(16).padStart(6, '0');

  if (biomeId === 'deep-forest') {
    // Layered emerald mist & distant tall forest trunks
    ctx.fillStyle = '#1d6b56';
    for (let i = 0; i < 36; i++) {
      const tx = (i * 58 + ((i * 19) % 24)) % 2048;
      const tw = 16 + (i % 4) * 9;
      ctx.fillRect(tx, 60, tw, 452);
    }
    // Misty curving distant hills
    ctx.fillStyle = '#155444';
    ctx.beginPath();
    ctx.moveTo(0, 512);
    for (let x = 0; x <= 2048; x += 64) {
      const y = 265 + Math.sin(x * 0.00613) * 45 + Math.cos(x * 0.01227) * 28;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(2048, 512);
    ctx.closePath();
    ctx.fill();
    // Glowing canopy upper foliage arch
    ctx.fillStyle = '#134739';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= 2048; x += 48) {
      const y = 78 + Math.sin(x * 0.01227) * 30 + Math.cos(x * 0.0245) * 16;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(2048, 0);
    ctx.closePath();
    ctx.fill();
  } else if (biomeId === 'green-hills' || biomeId === 'wheat-field') {
    const hillBack = biomeId === 'wheat-field' ? '#e0c06c' : '#65b884';
    const hillFront = biomeId === 'wheat-field' ? '#cfa442' : '#4fa65b';
    const hillEdge = biomeId === 'wheat-field' ? '#f5dc82' : '#85d674';

    // Distant smooth rolling hills
    ctx.fillStyle = hillBack;
    ctx.beginPath();
    ctx.moveTo(0, 512);
    for (let x = 0; x <= 2048; x += 32) {
      const y = 250 + Math.sin(x * 0.00613) * 68 + Math.cos(x * 0.00306) * 35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(2048, 512);
    ctx.closePath();
    ctx.fill();

    // Closer sunlit hill waves with crisp highlighted ridge
    ctx.fillStyle = hillFront;
    ctx.beginPath();
    ctx.moveTo(0, 512);
    for (let x = 0; x <= 2048; x += 32) {
      const y = 320 + Math.sin(x * 0.0092 + 1.4) * 52 + Math.cos(x * 0.00613) * 28;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(2048, 512);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hillEdge;
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let x = 0; x <= 2048; x += 32) {
      const y = 324 + Math.sin(x * 0.0092 + 1.4) * 52 + Math.cos(x * 0.00613) * 28;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (biomeId === 'hare-canyon') {
    // Distant stratified sandstone mesas & arches (matching Hare Canyon reference)
    const drawMesa = (cx: number, topY: number, w: number, col: string, lit: string) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.65, 512);
      ctx.lineTo(cx - w * 0.42, topY + 35);
      ctx.lineTo(cx - w * 0.35, topY);
      ctx.lineTo(cx + w * 0.36, topY + 6);
      ctx.lineTo(cx + w * 0.48, topY + 50);
      ctx.lineTo(cx + w * 0.68, 512);
      ctx.closePath();
      ctx.fill();

      // Sunlit horizontal cliff strata bands
      ctx.fillStyle = lit;
      ctx.fillRect(cx - w * 0.35, topY, w * 0.71, 16);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(cx - w * 0.43, topY + 55, w * 0.86, 14);
      ctx.fillRect(cx - w * 0.48, topY + 110, w * 0.96, 16);
      ctx.globalAlpha = 1;
    };
    drawMesa(260, 175, 420, '#b57b65', '#e3a88a');
    drawMesa(760, 125, 520, '#a6654e', '#d99375');
    drawMesa(1340, 160, 460, '#b57b65', '#e3a88a');
    drawMesa(1820, 135, 440, '#a6654e', '#d99375');
  } else if (biomeId === 'bamboo-forest') {
    // Dense misty golden-olive bamboo stalks across entire vista
    for (let i = 0; i < 95; i++) {
      const bx = (i * 22 + ((i * 13) % 14)) % 2048;
      const bw = 9 + (i % 4) * 4;
      ctx.fillStyle = i % 2 === 0 ? '#a8ba59' : '#8da342';
      ctx.fillRect(bx, 0, bw, 512);
      // Bamboo nodes
      ctx.fillStyle = '#d4e386';
      for (let ny = (i * 29) % 70; ny < 512; ny += 68) {
        ctx.fillRect(bx - 1, ny, bw + 2, 4);
      }
    }
    const mist = ctx.createLinearGradient(0, 180, 0, 512);
    mist.addColorStop(0, 'rgba(227,232,150,0)');
    mist.addColorStop(1, 'rgba(218,227,138,0.68)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, 180, 2048, 332);
  } else {
    // Winter jagged snow-capped alpine peaks with crisp sunlit/shaded faces
    const peaks = [
      [180, 125, 360],
      [540, 85, 440],
      [960, 145, 380],
      [1350, 95, 460],
      [1780, 130, 420],
    ];
    for (const [px, py, pw] of peaks) {
      // Shaded right slope
      ctx.fillStyle = '#6d9bc7';
      ctx.beginPath();
      ctx.moveTo(px - pw * 0.55, 512);
      ctx.lineTo(px, py);
      ctx.lineTo(px + pw * 0.55, 512);
      ctx.closePath();
      ctx.fill();
      // Sunlit snowy left face
      ctx.fillStyle = '#e8f5ff';
      ctx.beginPath();
      ctx.moveTo(px - pw * 0.55, 512);
      ctx.lineTo(px, py);
      ctx.lineTo(px + pw * 0.08, py + 150);
      ctx.lineTo(px - pw * 0.16, py + 230);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Bottom atmospheric blend
  const bGrad = ctx.createLinearGradient(0, 390, 0, 512);
  bGrad.addColorStop(0, 'rgba(0,0,0,0)');
  bGrad.addColorStop(1, fogHex);
  ctx.fillStyle = bGrad;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, 390, 2048, 122);
  ctx.globalAlpha = 1;
  void baseColor;

  return makeTex(c, true);
}

/**
 * Paints rich cel-shaded illustrated mid-ground prop cards (trees, ruins, cacti, bamboo clusters,
 * frosted pines, watchtowers) matching the dark-ink-outlined painterly RPG aesthetic of the hero.
 */
export function paintMidLandmarkTexture(
  biomeId: BiomeId,
  variant: 0 | 1,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const ink = '#151c24';

  if (biomeId === 'deep-forest' || biomeId === 'green-hills') {
    const isDeep = biomeId === 'deep-forest';
    // Curved gnarled tree trunk with bark shading & dark outline
    ctx.fillStyle = isDeep ? '#4a3222' : '#7a4b2a';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(212, 496);
    ctx.quadraticCurveTo(230, 360, 224, 225);
    ctx.lineTo(286, 225);
    ctx.quadraticCurveTo(282, 365, 310, 496);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sunlit bark highlight
    ctx.fillStyle = isDeep ? '#694a34' : '#9c653c';
    ctx.beginPath();
    ctx.moveTo(226, 486);
    ctx.quadraticCurveTo(238, 360, 234, 240);
    ctx.lineTo(256, 240);
    ctx.quadraticCurveTo(254, 360, 250, 486);
    ctx.closePath();
    ctx.fill();

    // Layered organic bulbous foliage puffs (matching Green Hills & Deep Forest reference)
    const darkLeaf = isDeep ? '#165236' : '#2d7a31';
    const midLeaf = isDeep ? '#247a49' : '#4ca638';
    const litLeaf = isDeep ? '#4bb865' : '#85d649';

    const puffs =
      variant === 0
        ? [
            [175, 220, 86],
            [335, 224, 82],
            [256, 152, 108],
            [168, 156, 70],
            [340, 158, 68],
          ]
        : [
            [185, 232, 92],
            [328, 212, 90],
            [258, 140, 100],
            [255, 225, 85],
          ];

    // Outer dark ink silhouette
    ctx.fillStyle = ink;
    for (const [x, y, r] of puffs) {
      ctx.beginPath();
      ctx.arc(x, y, r + 7, 0, Math.PI * 2);
      ctx.fill();
    }
    // Deep shadow canopy
    ctx.fillStyle = darkLeaf;
    for (const [x, y, r] of puffs) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mid foliage
    ctx.fillStyle = midLeaf;
    for (const [x, y, r] of puffs) {
      ctx.beginPath();
      ctx.arc(x - 4, y - 10, r * 0.88, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sunlit top crowns
    ctx.fillStyle = litLeaf;
    for (const [x, y, r] of puffs) {
      ctx.beginPath();
      ctx.arc(x - 10, y - 24, r * 0.58, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hanging vines in Deep Forest
    if (isDeep) {
      ctx.strokeStyle = '#339957';
      ctx.lineWidth = 5;
      for (const vx of [155, 210, 315, 355]) {
        ctx.beginPath();
        ctx.moveTo(vx, 255);
        ctx.quadraticCurveTo(vx + 12, 320, vx - 6, 375);
        ctx.stroke();
      }
    }
  } else if (biomeId === 'hare-canyon') {
    if (variant === 0) {
      // Painterly cel-shaded Saguaro Cactus
      ctx.fillStyle = '#4e9643';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 7;
      // Left arm
      ctx.beginPath();
      ctx.roundRect(140, 215, 44, 120, 22);
      ctx.roundRect(140, 290, 95, 40, 20);
      ctx.fill();
      ctx.stroke();
      // Right arm
      ctx.beginPath();
      ctx.roundRect(320, 175, 44, 125, 22);
      ctx.roundRect(268, 260, 95, 40, 20);
      ctx.fill();
      ctx.stroke();
      // Main trunk
      ctx.beginPath();
      ctx.roundRect(218, 95, 76, 405, 38);
      ctx.fill();
      ctx.stroke();
      // Bright green vertical ribs
      ctx.fillStyle = '#7acc5c';
      ctx.fillRect(236, 120, 14, 360);
      ctx.fillRect(152, 232, 10, 75);
      ctx.fillRect(332, 195, 10, 78);
    } else {
      // Sculpted red canyon spire rock
      ctx.fillStyle = '#b84b2c';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(115, 498);
      ctx.lineTo(155, 180);
      ctx.lineTo(220, 120);
      ctx.lineTo(315, 138);
      ctx.lineTo(355, 250);
      ctx.lineTo(405, 498);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Sunlit ochre cliff face
      ctx.fillStyle = '#e07a4c';
      ctx.beginPath();
      ctx.moveTo(155, 180);
      ctx.lineTo(220, 120);
      ctx.lineTo(275, 140);
      ctx.lineTo(230, 492);
      ctx.lineTo(126, 492);
      ctx.closePath();
      ctx.fill();
    }
  } else if (biomeId === 'bamboo-forest') {
    // Cluster of 3 curving cel-shaded bamboo stalks with painted leaf sprays
    const stalks = [
      { x: 185, w: 30, lean: -14 },
      { x: 256, w: 36, lean: 6 },
      { x: 325, w: 28, lean: 18 },
    ];
    for (const s of stalks) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 6;
      for (let seg = 0; seg < 5; seg++) {
        const y0 = 496 - seg * 95;
        const x0 = s.x + s.lean * seg * 0.18;
        ctx.fillStyle = seg % 2 === 0 ? '#789e35' : '#8fb83e';
        ctx.beginPath();
        ctx.roundRect(x0 - s.w * 0.5, y0 - 92, s.w, 90, 8);
        ctx.fill();
        ctx.stroke();
        // Specular highlight
        ctx.fillStyle = '#c4e065';
        ctx.fillRect(x0 - s.w * 0.3, y0 - 84, s.w * 0.24, 72);
      }
    }
    // Delicate bamboo leaf sprays
    const drawLeaf = (lx: number, ly: number, ang: number) => {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(ang);
      ctx.fillStyle = '#4e8a2c';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(32, 0, 36, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    drawLeaf(175, 140, -0.4);
    drawLeaf(175, 155, -0.85);
    drawLeaf(270, 95, 0.35);
    drawLeaf(270, 115, 0.72);
    drawLeaf(335, 195, 0.25);
    drawLeaf(335, 210, -0.2);
  } else if (biomeId === 'winter') {
    // Cel-shaded snow-laden alpine pine tree
    ctx.fillStyle = '#573c2c';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 7;
    ctx.fillRect(228, 395, 56, 102);
    ctx.strokeRect(228, 395, 56, 102);

    const tiers = [
      { y: 410, w: 175, h: 155 },
      { y: 300, w: 145, h: 145 },
      { y: 195, w: 110, h: 135 },
    ];
    for (const t of tiers) {
      // Pine foliage underside
      ctx.fillStyle = '#336b87';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(256, t.y - t.h);
      ctx.lineTo(256 + t.w, t.y);
      ctx.quadraticCurveTo(256, t.y + 22, 256 - t.w, t.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Thick snowy white-ice cap on top of each pine bough
      ctx.fillStyle = '#f0f8ff';
      ctx.beginPath();
      ctx.moveTo(256, t.y - t.h + 4);
      ctx.lineTo(256 + t.w * 0.82, t.y - t.h * 0.22);
      ctx.quadraticCurveTo(256 + t.w * 0.35, t.y - t.h * 0.08, 256, t.y - t.h * 0.25);
      ctx.quadraticCurveTo(256 - t.w * 0.35, t.y - t.h * 0.08, 256 - t.w * 0.82, t.y - t.h * 0.22);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Wheat Field: variant 0 = red-roofed wooden watchtower, variant 1 = giant sunflowers
    if (variant === 0) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 7;
      ctx.fillStyle = '#855129';
      // Support stilts
      ctx.beginPath();
      ctx.moveTo(190, 496);
      ctx.lineTo(212, 230);
      ctx.lineTo(234, 230);
      ctx.lineTo(218, 496);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(322, 496);
      ctx.lineTo(300, 230);
      ctx.lineTo(278, 230);
      ctx.lineTo(294, 496);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Cross braces
      ctx.fillRect(202, 330, 108, 18);
      ctx.strokeRect(202, 330, 108, 18);
      // Wooden tower cabin
      ctx.fillStyle = '#a86934';
      ctx.beginPath();
      ctx.roundRect(175, 130, 162, 115, 10);
      ctx.fill();
      ctx.stroke();
      // Red barn roof
      ctx.fillStyle = '#cc4b2b';
      ctx.beginPath();
      ctx.moveTo(148, 138);
      ctx.lineTo(256, 56);
      ctx.lineTo(364, 138);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Giant bright cel-shaded Sunflowers
      const drawFlower = (fx: number, fy: number, r: number) => {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 6;
        ctx.fillStyle = '#4e8f31';
        ctx.fillRect(fx - 9, fy, 18, 496 - fy);
        ctx.strokeRect(fx - 9, fy, 18, 496 - fy);
        // Petals
        ctx.fillStyle = '#facc15';
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          ctx.save();
          ctx.translate(fx + Math.cos(ang) * r * 0.9, fy + Math.sin(ang) * r * 0.9);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 0.5, r * 0.25, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        // Center seeds
        ctx.fillStyle = '#6b3e1b';
        ctx.beginPath();
        ctx.arc(fx, fy, r * 0.56, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      };
      drawFlower(200, 210, 48);
      drawFlower(320, 275, 40);
    }
  }

  return makeTex(c, false);
}

/**
 * Hand-painted organic floating island platform (matches MAPA_E_LAYOUTS Green Hills / Bamboo islands!)
 * Rounded grass/snow/moss cap with overhanging blades, rocky curved tapered bottom, dark ink outline.
 */
export function paintFloatingIslandTexture(palette: BiomePalette): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const ink = '#141921';
  const soil = palette.groundSoil;
  const trim = palette.groundTrim;
  const trimLit = new THREE.Color(palette.groundTrim).offsetHSL(0.01, 0.05, 0.14).getStyle();
  const soilDark = new THREE.Color(palette.groundSoil).multiplyScalar(0.68).getStyle();

  // Organic curved rocky underside (tapered islet, NOT a rectangle!)
  ctx.fillStyle = soil;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(28, 52);
  ctx.lineTo(484, 52);
  ctx.bezierCurveTo(476, 128, 415, 162, 345, 168);
  ctx.bezierCurveTo(285, 182, 225, 182, 168, 168);
  ctx.bezierCurveTo(95, 162, 38, 126, 28, 52);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Darker rocky shadow facets on underside
  ctx.fillStyle = soilDark;
  ctx.beginPath();
  ctx.moveTo(64, 108);
  ctx.quadraticCurveTo(256, 152, 448, 108);
  ctx.bezierCurveTo(410, 156, 330, 174, 256, 174);
  ctx.bezierCurveTo(175, 174, 98, 154, 64, 108);
  ctx.closePath();
  ctx.fill();

  // Stylized stone chunks embedded in earth
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (const [rx, ry, rw, rh] of [
    [130, 108, 34, 18],
    [248, 124, 44, 20],
    [365, 106, 32, 16],
  ]) {
    ctx.beginPath();
    ctx.ellipse(rx, ry, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lush scalloped overhanging turf / snow / sand cap
  ctx.fillStyle = trim;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(24, 22);
  ctx.quadraticCurveTo(256, 6, 488, 22);
  ctx.quadraticCurveTo(504, 48, 486, 68);
  for (let x = 472; x >= 40; x -= 36) {
    const dip = 74 + ((x * 13) % 20);
    ctx.quadraticCurveTo(x - 18, dip, x - 36, 62);
  }
  ctx.quadraticCurveTo(8, 48, 24, 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bright top sunlit highlight band
  ctx.fillStyle = trimLit;
  ctx.beginPath();
  ctx.moveTo(34, 24);
  ctx.quadraticCurveTo(256, 12, 478, 24);
  ctx.quadraticCurveTo(256, 36, 34, 24);
  ctx.closePath();
  ctx.fill();

  return makeTex(c, false);
}

/**
 * Hand-painted seamless curved ground cliff facade (placed at gameplay plane front)
 * with lush grass blades, layered soil bands, roots, and dark storybook outlines.
 */
export function paintGroundFacadeTexture(palette: BiomePalette): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const ink = '#141921';
  const soilDark = new THREE.Color(palette.groundSoil).multiplyScalar(0.72).getStyle();
  const trimLit = new THREE.Color(palette.groundTrim).offsetHSL(0.01, 0.06, 0.14).getStyle();

  // Deep painted earth body
  ctx.fillStyle = palette.groundSoil;
  ctx.fillRect(0, 32, 512, 480);

  // Soft wavy geological strata bands
  for (let band = 0; band < 6; band++) {
    ctx.fillStyle = band % 2 === 0 ? soilDark : 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    const baseY = 95 + band * 68;
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= 512; x += 64) {
      ctx.lineTo(x, baseY + Math.sin(x * 0.0245 + band) * 14);
    }
    ctx.lineTo(512, baseY + 46);
    ctx.lineTo(0, baseY + 46);
    ctx.closePath();
    ctx.fill();
  }

  // Hand-drawn embedded stones with dark outlines
  ctx.strokeStyle = 'rgba(20,25,33,0.55)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 14; i++) {
    const sx = ((i * 73 + 22) % 460) + 26;
    const sy = 110 + ((i * 89) % 320);
    const rx = 18 + (i % 4) * 8;
    const ry = 11 + (i % 3) * 5;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, (i % 3 - 1) * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Scalloped lush overhanging turf lip at top with crisp dark outline
  ctx.fillStyle = palette.groundTrim;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-10, 14);
  ctx.lineTo(522, 14);
  ctx.lineTo(522, 66);
  for (let x = 512; x >= 0; x -= 32) {
    const dip = 74 + ((x * 17) % 24);
    ctx.quadraticCurveTo(x - 16, dip, x - 32, 60);
  }
  ctx.lineTo(-10, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bright top grass/snow highlight & playful grass tufts poking upward
  ctx.fillStyle = trimLit;
  ctx.fillRect(0, 16, 512, 16);
  for (let x = 10; x < 504; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x + 6, 3 + (x % 7));
    ctx.lineTo(x + 13, 18);
    ctx.closePath();
    ctx.fill();
  }

  return makeTex(c, true);
}

/**
 * Paints illustrated storybook destructible props (oak barrel, supply crate, spirit crystal)
 * with crisp dark outlines matching the hero spritesheet.
 */
export function paintPropTexture(
  kind: 'barrel' | 'crate' | 'crystal',
  glowHex: number,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const ink = '#141921';

  if (kind === 'barrel') {
    // Bulging cel-shaded oak barrel
    ctx.fillStyle = '#996030';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(64, 48);
    ctx.quadraticCurveTo(128, 30, 192, 48);
    ctx.quadraticCurveTo(222, 140, 192, 232);
    ctx.quadraticCurveTo(128, 248, 64, 232);
    ctx.quadraticCurveTo(34, 140, 64, 48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Vertical wood stave lines & highlight
    ctx.fillStyle = '#bf7e45';
    ctx.fillRect(88, 48, 32, 184);
    ctx.strokeStyle = 'rgba(20,25,33,0.45)';
    ctx.lineWidth = 4;
    for (const sx of [90, 128, 166]) {
      ctx.beginPath();
      ctx.moveTo(sx, 48);
      ctx.lineTo(sx, 232);
      ctx.stroke();
    }

    // Two riveted iron bands
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(48, 76, 160, 26, 8);
    ctx.roundRect(48, 174, 160, 26, 8);
    ctx.fill();
    ctx.stroke();
    // Rivet gleams
    ctx.fillStyle = '#cbd5e1';
    for (const rx of [72, 128, 184]) {
      ctx.beginPath();
      ctx.arc(rx, 89, 5, 0, Math.PI * 2);
      ctx.arc(rx, 187, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'crate') {
    // Reinforced storybook supply crate
    ctx.fillStyle = '#b57b42';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(42, 46, 172, 188, 12);
    ctx.fill();
    ctx.stroke();

    // Inner recessed planks
    ctx.fillStyle = '#8c5929';
    ctx.fillRect(68, 72, 120, 136);
    ctx.strokeRect(68, 72, 120, 136);

    // Diagonal brace
    ctx.fillStyle = '#c98e51';
    ctx.beginPath();
    ctx.moveTo(68, 186);
    ctx.lineTo(166, 72);
    ctx.lineTo(188, 72);
    ctx.lineTo(188, 94);
    ctx.lineTo(90, 208);
    ctx.lineTo(68, 208);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Corner iron plates
    ctx.fillStyle = '#475569';
    for (const [cx, cy] of [
      [42, 46],
      [182, 46],
      [42, 202],
      [182, 202],
    ]) {
      ctx.fillRect(cx, cy, 32, 32);
      ctx.strokeRect(cx, cy, 32, 32);
    }
  } else {
    // Glowing hand-painted spirit crystal cluster on stone plinth
    const glowCss = '#' + glowHex.toString(16).padStart(6, '0');
    const glowGrad = ctx.createRadialGradient(128, 130, 12, 128, 130, 110);
    glowGrad.addColorStop(0, glowCss);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = ink;
    ctx.lineWidth = 7;

    // Left crystal shard
    ctx.fillStyle = glowCss;
    ctx.beginPath();
    ctx.moveTo(76, 200);
    ctx.lineTo(52, 112);
    ctx.lineTo(86, 86);
    ctx.lineTo(116, 196);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right crystal shard
    ctx.beginPath();
    ctx.moveTo(144, 198);
    ctx.lineTo(176, 98);
    ctx.lineTo(208, 122);
    ctx.lineTo(184, 202);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Center tall shard
    ctx.beginPath();
    ctx.moveTo(96, 204);
    ctx.lineTo(106, 62);
    ctx.lineTo(128, 34);
    ctx.lineTo(154, 66);
    ctx.lineTo(160, 204);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Specular white crystal shine
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.moveTo(112, 72);
    ctx.lineTo(128, 46);
    ctx.lineTo(132, 180);
    ctx.lineTo(110, 180);
    ctx.closePath();
    ctx.fill();

    // Mossy stone base
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.roundRect(56, 196, 144, 42, 14);
    ctx.fill();
    ctx.stroke();
  }

  return makeTex(c, false);
}

/**
 * Paints illustrated foreground silhouette bushes / ferns / rocky outcrops (Z = +3.5).
 */
export function paintForegroundSilhouetteTexture(palette: BiomePalette): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const fgHex = '#' + palette.foregroundColor.toString(16).padStart(6, '0');
  const rimHex = new THREE.Color(palette.foregroundColor).offsetHSL(0, 0.05, 0.09).getStyle();

  ctx.fillStyle = fgHex;
  // Organic clustered foliage & rock silhouette
  for (const [x, y, r] of [
    [95, 215, 78],
    [185, 192, 92],
    [290, 205, 86],
    [390, 218, 74],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sweeping leaf/grass blades
  for (let i = 0; i < 12; i++) {
    const bx = 48 + i * 38;
    const h = 75 + (i % 3) * 32;
    const lean = (i % 2 === 0 ? -1 : 1) * 28;
    ctx.beginPath();
    ctx.moveTo(bx - 12, 250);
    ctx.quadraticCurveTo(bx + lean * 0.5, 250 - h * 0.6, bx + lean, 250 - h);
    ctx.quadraticCurveTo(bx + lean * 0.2 + 12, 250 - h * 0.5, bx + 12, 250);
    ctx.closePath();
    ctx.fill();
  }

  // Subtle rim edge so foreground silhouettes read crisply against bright terrain
  ctx.strokeStyle = rimHex;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(185, 192, 88, Math.PI * 1.1, Math.PI * 1.85);
  ctx.stroke();

  return makeTex(c, false);
}

/**
 * Paints illustrated near-background stone lantern / glowing forest sconce.
 */
export function paintTorchSconceTexture(glowHex: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const ctx = c.getContext('2d')!;
  const ink = '#141921';
  const glowCss = '#' + glowHex.toString(16).padStart(6, '0');

  // Soft outer aura
  const aura = ctx.createRadialGradient(128, 92, 8, 128, 92, 96);
  aura.addColorStop(0, glowCss);
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.52;
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, 256, 220);
  ctx.globalAlpha = 1;

  // Carved post & stone base
  ctx.fillStyle = '#5c4330';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(108, 128, 40, 236, 10);
  ctx.fill();
  ctx.stroke();

  // Iron brazier cup
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(80, 114);
  ctx.lineTo(176, 114);
  ctx.lineTo(158, 148);
  ctx.lineTo(98, 148);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Stylized cel-shaded flame / spirit orb
  ctx.fillStyle = glowCss;
  ctx.beginPath();
  ctx.moveTo(96, 114);
  ctx.quadraticCurveTo(88, 66, 128, 32);
  ctx.quadraticCurveTo(168, 66, 160, 114);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(128, 92, 14, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  return makeTex(c, false);
}
