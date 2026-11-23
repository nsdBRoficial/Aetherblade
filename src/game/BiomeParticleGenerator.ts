import * as THREE from 'three';
import { BiomeId } from './types';

type PrimaryShape = 'leaf' | 'petal' | 'dust' | 'bamboo' | 'snow' | 'chaff';
type MotionStyle = 'flutter' | 'gust' | 'snowfall' | 'breeze' | 'rise';

interface BiomeParticleProfile {
  primaryShape: PrimaryShape;
  primaryColors: readonly number[];
  primaryCount: number;
  primaryBaseSize: [number, number];
  primaryMotion: MotionStyle;
  primaryVx: [number, number];
  primaryVy: [number, number];
  primarySwayAmp: number;
  primarySwayFreq: number;
  primaryOpacity: number;

  // Secondary HDR-emissive atmospheric motes (fireflies, embers, frost glints, pollen)
  accentColors: readonly number[];
  accentCount: number;
  accentHdrBoost: number;
  accentBaseSize: number;
  accentRise: boolean; // true = rising embers/fireflies, false = twinkling suspended motes
  accentVx: [number, number];
  accentVy: [number, number];
  accentPulseSpeed: number;
}

interface PrimaryMote {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  phase: number;
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
}

interface AccentMote {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  phase: number;
  scale: number;
  baseColor: THREE.Color;
}

const BIOME_PARTICLE_PROFILES: Record<BiomeId, BiomeParticleProfile> = {
  'deep-forest': {
    primaryShape: 'leaf',
    primaryColors: [0x59c462, 0x3b9c49, 0x8ae67e, 0x2f7d3d],
    primaryCount: 105,
    primaryBaseSize: [0.34, 0.24],
    primaryMotion: 'flutter',
    primaryVx: [-1.4, -0.4],
    primaryVy: [-1.15, -0.55],
    primarySwayAmp: 1.55,
    primarySwayFreq: 1.7,
    primaryOpacity: 0.94,

    accentColors: [0x45ffbe, 0x7effd4, 0xc8ff82],
    accentCount: 38,
    accentHdrBoost: 2.25,
    accentBaseSize: 0.22,
    accentRise: true,
    accentVx: [-0.35, 0.35],
    accentVy: [0.22, 0.68],
    accentPulseSpeed: 3.1,
  },
  'green-hills': {
    primaryShape: 'petal',
    primaryColors: [0xffcfe3, 0xffa6cb, 0xfff0f7, 0xffb8d9],
    primaryCount: 112,
    primaryBaseSize: [0.28, 0.24],
    primaryMotion: 'flutter',
    primaryVx: [-2.1, -0.85],
    primaryVy: [-1.05, -0.45],
    primarySwayAmp: 1.75,
    primarySwayFreq: 2.1,
    primaryOpacity: 0.95,

    accentColors: [0xfff0a3, 0xffe478, 0xffffff],
    accentCount: 32,
    accentHdrBoost: 1.85,
    accentBaseSize: 0.17,
    accentRise: false,
    accentVx: [-0.7, -0.15],
    accentVy: [-0.12, 0.24],
    accentPulseSpeed: 2.4,
  },
  'hare-canyon': {
    primaryShape: 'dust',
    primaryColors: [0xe69f6c, 0xc97349, 0xf7c594, 0xb55b38],
    primaryCount: 100,
    primaryBaseSize: [0.46, 0.16],
    primaryMotion: 'gust',
    primaryVx: [-5.6, -2.8],
    primaryVy: [-0.45, 0.22],
    primarySwayAmp: 0.45,
    primarySwayFreq: 3.2,
    primaryOpacity: 0.78,

    accentColors: [0xff8c38, 0xff5a1f, 0xffd15c],
    accentCount: 42,
    accentHdrBoost: 2.55,
    accentBaseSize: 0.21,
    accentRise: true,
    accentVx: [-1.4, -0.35],
    accentVy: [0.85, 2.05],
    accentPulseSpeed: 5.4,
  },
  'bamboo-forest': {
    primaryShape: 'bamboo',
    primaryColors: [0xbfd95b, 0x8fb83d, 0xdeeb83, 0xffbed6],
    primaryCount: 110,
    primaryBaseSize: [0.4, 0.17],
    primaryMotion: 'breeze',
    primaryVx: [-1.95, -0.75],
    primaryVy: [-1.1, -0.45],
    primarySwayAmp: 1.4,
    primarySwayFreq: 1.9,
    primaryOpacity: 0.92,

    accentColors: [0xffe066, 0xfff2a6, 0xd4ff6b],
    accentCount: 36,
    accentHdrBoost: 2.15,
    accentBaseSize: 0.21,
    accentRise: true,
    accentVx: [-0.4, 0.25],
    accentVy: [0.35, 0.85],
    accentPulseSpeed: 2.7,
  },
  winter: {
    primaryShape: 'snow',
    primaryColors: [0xffffff, 0xe0f3ff, 0xc4e7ff, 0xf2faff],
    primaryCount: 130,
    primaryBaseSize: [0.26, 0.26],
    primaryMotion: 'snowfall',
    primaryVx: [-1.6, -0.45],
    primaryVy: [-2.15, -1.05],
    primarySwayAmp: 0.95,
    primarySwayFreq: 2.3,
    primaryOpacity: 0.96,

    accentColors: [0x8ee6ff, 0xd6f6ff, 0xffffff],
    accentCount: 34,
    accentHdrBoost: 2.3,
    accentBaseSize: 0.19,
    accentRise: false,
    accentVx: [-0.8, -0.2],
    accentVy: [-0.55, -0.15],
    accentPulseSpeed: 4.6,
  },
  'wheat-field': {
    primaryShape: 'chaff',
    primaryColors: [0xffe066, 0xf5be38, 0xffef9e, 0xe09f24],
    primaryCount: 108,
    primaryBaseSize: [0.34, 0.2],
    primaryMotion: 'breeze',
    primaryVx: [-2.8, -1.1],
    primaryVy: [-0.75, -0.15],
    primarySwayAmp: 1.35,
    primarySwayFreq: 2.0,
    primaryOpacity: 0.92,

    accentColors: [0xffe270, 0xffb838, 0xfff5bd],
    accentCount: 36,
    accentHdrBoost: 2.05,
    accentBaseSize: 0.2,
    accentRise: true,
    accentVx: [-0.85, -0.1],
    accentVy: [0.22, 0.72],
    accentPulseSpeed: 3.4,
  },
};

const MAX_PRIMARY = 136;
const MAX_ACCENT = 48;

const _dummy = new THREE.Object3D();
const _tmpColor = new THREE.Color();

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Synthesizes a bespoke pixel-crisp Hero-styled particle sprite texture (64x64)
 * with subtle warm-espresso ink edges for cohesion with the unified Hero shader pass.
 */
function paintPrimaryParticleTexture(shape: PrimaryShape): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);

  if (shape === 'leaf') {
    // Pointed forest leaf with espresso outline + central vein
    ctx.save();
    ctx.translate(32, 32);
    ctx.beginPath();
    ctx.moveTo(-24, 2);
    ctx.quadraticCurveTo(-4, -22, 24, -2);
    ctx.quadraticCurveTo(-2, 22, -24, 2);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#241816';
    ctx.stroke();
    // Subtle lighter upper facet & midrib
    ctx.beginPath();
    ctx.moveTo(-18, 1);
    ctx.lineTo(18, -1);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(36, 24, 22, 0.45)';
    ctx.stroke();
    ctx.restore();
  } else if (shape === 'petal') {
    // Heart-notched cherry blossom petal
    ctx.save();
    ctx.translate(32, 32);
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.bezierCurveTo(-22, 12, -24, -14, -8, -20);
    ctx.lineTo(0, -11);
    ctx.lineTo(8, -20);
    ctx.bezierCurveTo(24, -14, 22, 12, 0, 22);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, -20, 0, 22);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#d9d9d9');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = '#3b2429';
    ctx.stroke();
    ctx.restore();
  } else if (shape === 'dust') {
    // Windswept canyon sandstone streak
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 28);
    grad.addColorStop(0, 'rgba(255,255,255,0.98)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.68)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(32, 32, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'bamboo') {
    // Slender curved bamboo leaf blade
    ctx.save();
    ctx.translate(32, 32);
    ctx.beginPath();
    ctx.moveTo(-27, 4);
    ctx.quadraticCurveTo(0, -14, 27, -3);
    ctx.quadraticCurveTo(2, 12, -27, 4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = '#211c14';
    ctx.stroke();
    ctx.restore();
  } else if (shape === 'snow') {
    // Crisp 6-point crystalline snowflake star
    ctx.save();
    ctx.translate(32, 32);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      const dx = Math.cos(a) * 21;
      const dy = Math.sin(a) * 21;
      ctx.beginPath();
      ctx.moveTo(-dx, -dy);
      ctx.lineTo(dx, dy);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // Golden harvest chaff / sunflower petal teardrop
    ctx.save();
    ctx.translate(32, 32);
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.quadraticCurveTo(2, -16, 24, 0);
    ctx.quadraticCurveTo(2, 16, -24, 0);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = '#2d1e12';
    ctx.stroke();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Luminous radial orb texture for HDR-blooming fireflies, embers, pollen & frost glints.
 */
function paintAccentGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(24, 24, 2, 24, 24, 22);
  grad.addColorStop(0, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.32, 'rgba(255,255,255,0.82)');
  grad.addColorStop(0.68, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 48, 48);

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates and simulates unique 3D dual-layer environmental particles for every biome:
 *   Layer 1: Bespoke shaped 3D tumbling weather/foliage sprites (leaves, cherry blossoms,
 *            canyon dust, bamboo blades, crystalline snowflakes, harvest petals).
 *   Layer 2: HDR-emissive atmospheric motes (forest fireflies, canyon embers, shrine wisps,
 *            frost diamond glints, sunlit pollen) that drive the Selective Bloom pass.
 */
export class BiomeParticleGenerator {
  private scene: THREE.Scene;
  private profile: BiomeParticleProfile;

  private primaryGeo: THREE.PlaneGeometry;
  private primaryMat: THREE.MeshBasicMaterial;
  private primaryTex: THREE.CanvasTexture;
  private primaryMesh: THREE.InstancedMesh;
  private primaryMotes: PrimaryMote[] = [];

  private accentGeo: THREE.PlaneGeometry;
  private accentMat: THREE.MeshBasicMaterial;
  private accentTex: THREE.CanvasTexture;
  private accentMesh: THREE.InstancedMesh;
  private accentMotes: AccentMote[] = [];

  constructor(scene: THREE.Scene, initialBiome: BiomeId, centerX = 6) {
    this.scene = scene;
    this.profile = BIOME_PARTICLE_PROFILES[initialBiome];

    // Layer 1: Primary shaped 3D environmental particles
    this.primaryGeo = new THREE.PlaneGeometry(1, 1);
    this.primaryTex = paintPrimaryParticleTexture(this.profile.primaryShape);
    this.primaryMat = new THREE.MeshBasicMaterial({
      map: this.primaryTex,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
      opacity: this.profile.primaryOpacity,
    });
    this.primaryMesh = new THREE.InstancedMesh(this.primaryGeo, this.primaryMat, MAX_PRIMARY);
    this.primaryMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.primaryMesh.frustumCulled = false;
    this.primaryMesh.renderOrder = 8;

    // Layer 2: Secondary HDR-emissive biome motes (fireflies / embers / frost glints / pollen)
    this.accentGeo = new THREE.PlaneGeometry(1, 1);
    this.accentTex = paintAccentGlowTexture();
    this.accentMat = new THREE.MeshBasicMaterial({
      map: this.accentTex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.accentMesh = new THREE.InstancedMesh(this.accentGeo, this.accentMat, MAX_ACCENT);
    this.accentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.accentMesh.frustumCulled = false;
    this.accentMesh.renderOrder = 9;

    scene.add(this.primaryMesh, this.accentMesh);
    this.configureBiome(initialBiome, centerX);
  }

  public configureBiome(biomeId: BiomeId, centerX: number): void {
    const nextProfile = BIOME_PARTICLE_PROFILES[biomeId];
    this.profile = nextProfile;

    // Swap bespoke shaped CanvasTexture cleanly
    const prevTex = this.primaryTex;
    this.primaryTex = paintPrimaryParticleTexture(nextProfile.primaryShape);
    this.primaryMat.map = this.primaryTex;
    this.primaryMat.opacity = nextProfile.primaryOpacity;
    this.primaryMat.needsUpdate = true;
    prevTex.dispose();

    // Populate Primary layer across 3D depth parallax Z = -7.5 .. +3.0
    this.primaryMotes = [];
    this.primaryMesh.count = nextProfile.primaryCount;
    for (let i = 0; i < nextProfile.primaryCount; i++) {
      const z = randRange(-7.2, 2.9);
      // Slight scale boost for near-camera particles for extra 2.5D depth presence
      const depthScale = z > 1.0 ? 1.15 : z < -4.0 ? 0.85 : 1.0;
      this.primaryMotes.push({
        x: centerX + randRange(-20, 20),
        y: randRange(0.2, 12.6),
        z,
        vx: randRange(nextProfile.primaryVx[0], nextProfile.primaryVx[1]),
        vy: randRange(nextProfile.primaryVy[0], nextProfile.primaryVy[1]),
        phase: Math.random() * Math.PI * 2,
        scale: randRange(0.68, 1.32) * depthScale,
        rotX: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI * 2,
        rotZ: Math.random() * Math.PI * 2,
        spinX: randRange(-2.6, 2.6),
        spinY: randRange(-3.2, 3.2),
        spinZ: randRange(-2.2, 2.2),
      });

      const hex = nextProfile.primaryColors[i % nextProfile.primaryColors.length];
      _tmpColor.setHex(hex);
      this.primaryMesh.setColorAt(i, _tmpColor);
    }
    if (this.primaryMesh.instanceColor) {
      this.primaryMesh.instanceColor.needsUpdate = true;
    }

    // Populate Secondary HDR-emissive biome motes
    this.accentMotes = [];
    this.accentMesh.count = nextProfile.accentCount;
    for (let i = 0; i < nextProfile.accentCount; i++) {
      const hex = nextProfile.accentColors[i % nextProfile.accentColors.length];
      const baseColor = new THREE.Color(hex).multiplyScalar(nextProfile.accentHdrBoost);
      this.accentMotes.push({
        x: centerX + randRange(-19, 19),
        y: randRange(0.3, 10.5),
        z: randRange(-5.5, 2.4),
        vx: randRange(nextProfile.accentVx[0], nextProfile.accentVx[1]),
        vy: randRange(nextProfile.accentVy[0], nextProfile.accentVy[1]),
        phase: Math.random() * Math.PI * 2,
        scale: randRange(0.65, 1.35),
        baseColor,
      });
      this.accentMesh.setColorAt(i, baseColor);
    }
    if (this.accentMesh.instanceColor) {
      this.accentMesh.instanceColor.needsUpdate = true;
    }
  }

  public update(dt: number, cameraX: number, elapsed: number): void {
    const p = this.profile;
    const [baseW, baseH] = p.primaryBaseSize;

    // 1. Update Primary 3D environmental layer
    for (let i = 0; i < this.primaryMotes.length; i++) {
      const m = this.primaryMotes[i];
      const wave = Math.sin(elapsed * p.primarySwayFreq + m.phase);
      const wave2 = Math.cos(elapsed * p.primarySwayFreq * 0.72 + m.phase * 1.3);

      let dx = m.vx;
      let dy = m.vy;

      if (p.primaryMotion === 'flutter') {
        // Organic horizontal leaf/petal glide with gentle lift on swoops
        dx += wave * p.primarySwayAmp;
        dy += wave2 * 0.35;
      } else if (p.primaryMotion === 'gust') {
        // Periodic canyon wind bursts
        const gust = 0.75 + 0.55 * Math.sin(elapsed * 1.15 + m.z * 0.4);
        dx *= gust;
        dy += wave * p.primarySwayAmp;
      } else if (p.primaryMotion === 'snowfall') {
        dx += wave * p.primarySwayAmp;
      } else if (p.primaryMotion === 'breeze') {
        dx += wave * p.primarySwayAmp * 0.85;
        dy += wave2 * 0.25;
      }

      m.x += dx * dt;
      m.y += dy * dt;

      // Wrap seamlessly around camera corridor
      if (m.y < -0.6) {
        m.y = 12.2 + Math.random() * 2.2;
        m.x = cameraX + randRange(-19, 21);
      } else if (m.y > 14.5) {
        m.y = -0.2;
        m.x = cameraX + randRange(-19, 21);
      }
      if (m.x < cameraX - 21) m.x += 42;
      if (m.x > cameraX + 21) m.x -= 42;

      _dummy.position.set(m.x, m.y, m.z);

      if (p.primaryShape === 'snow') {
        m.rotZ += m.spinZ * 0.45 * dt;
        _dummy.rotation.set(0, 0, m.rotZ);
      } else if (p.primaryShape === 'dust') {
        // Align dust streaks with wind direction
        _dummy.rotation.set(0, 0, Math.atan2(dy, dx) * 0.35);
      } else {
        // Rich 3D fluttering tumble for leaves, cherry blossoms, bamboo blades & harvest petals
        m.rotX += m.spinX * dt;
        m.rotY += m.spinY * dt;
        m.rotZ += m.spinZ * 0.6 * dt;
        _dummy.rotation.set(
          Math.sin(m.rotX) * 0.95,
          m.rotY,
          Math.cos(m.rotZ) * 0.75,
        );
      }

      _dummy.scale.set(baseW * m.scale, baseH * m.scale, 1);
      _dummy.updateMatrix();
      this.primaryMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.primaryMesh.instanceMatrix.needsUpdate = true;

    // 2. Update Secondary HDR-emissive biome motes (fireflies, embers, frost glints, pollen)
    for (let i = 0; i < this.accentMotes.length; i++) {
      const a = this.accentMotes[i];
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * p.accentPulseSpeed + a.phase);
      const driftX = Math.sin(elapsed * 1.4 + a.phase) * 0.65;

      a.x += (a.vx + driftX) * dt;
      a.y += a.vy * dt;

      if (p.accentRise) {
        if (a.y > 11.8) {
          a.y = -0.3;
          a.x = cameraX + randRange(-19, 19);
        }
      } else {
        if (a.y < -0.4) {
          a.y = 11.5;
          a.x = cameraX + randRange(-19, 19);
        } else if (a.y > 12.2) {
          a.y = 0.2;
        }
      }
      if (a.x < cameraX - 20) a.x += 40;
      if (a.x > cameraX + 20) a.x -= 40;

      // Twinkle scale smoothly (creates sparkling frost glints, firefly blinks & ember flickers)
      const sz = p.accentBaseSize * a.scale * (0.45 + pulse * 0.85);
      _dummy.position.set(a.x, a.y, a.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(sz, sz, 1);
      _dummy.updateMatrix();
      this.accentMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.accentMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.scene.remove(this.primaryMesh);
    this.scene.remove(this.accentMesh);
    this.primaryGeo.dispose();
    this.primaryMat.dispose();
    this.primaryTex.dispose();
    this.accentGeo.dispose();
    this.accentMat.dispose();
    this.accentTex.dispose();
  }
}
