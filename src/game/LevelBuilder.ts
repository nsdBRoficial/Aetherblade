import * as THREE from 'three';
import {
  BIOME_PALETTES,
  BiomeId,
  BiomePalette,
  BOSS_ARENA_MAX_X,
  BOSS_ARENA_MIN_X,
  GroundSegment,
  PlatformBox,
} from './types';
import {
  paintFarPanorama,
  paintFloatingIslandTexture,
  paintForegroundSilhouetteTexture,
  paintGroundFacadeTexture,
  paintMidLandmarkTexture,
  paintPropTexture,
  paintSkyBackdrop,
  paintTorchSconceTexture,
} from './IllustratedBiomeArt';

export interface DestructibleProp {
  id: string;
  kind: 'barrel' | 'crate' | 'crystal';
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  destroyed: boolean;
  group: THREE.Group;
  hitFlash: number;
}

export interface PickupOrb {
  id: number;
  kind: 'heal' | 'gem';
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  mesh: THREE.Group;
  collected: boolean;
}

function createContactShadowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createHeroCelRampTex(): THREE.DataTexture {
  // Crisp 3-band cel-shading ramp matching the Hero sprite's shadow / midtone / highlight steps
  const data = new Uint8Array([
    112, 112, 112, 255,
    196, 196, 196, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function createEmissiveGlowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class LevelBuilder {
  public root = new THREE.Group();
  public groundSegments: GroundSegment[] = [];
  public platforms: PlatformBox[] = [];
  public props: DestructibleProp[] = [];
  public pickups: PickupOrb[] = [];
  public palette: BiomePalette;

  private skyMesh: THREE.Mesh;
  private skyMat: THREE.MeshBasicMaterial;
  private panoramaFar: THREE.Mesh;
  private panoMat: THREE.MeshBasicMaterial;
  private arenaGateLeft: THREE.Group;
  private arenaGateRight: THREE.Group;
  private arenaLocked = false;
  private torchLights: { light: THREE.PointLight; baseIntensity: number; phase: number }[] = [];
  private torchGlows: { mesh: THREE.Mesh; baseScale: number; phase: number }[] = [];
  private disposableGeos: THREE.BufferGeometry[] = [];
  private disposableMats: THREE.Material[] = [];
  private disposableTexs: THREE.Texture[] = [];
  private nextPickupId = 1;

  constructor(biomeId: BiomeId, maxAnisotropy: number, isSoftwareGl: boolean) {
    this.palette = BIOME_PALETTES[biomeId];

    // 1. Hand-painted illustrated sky & volumetric storybook clouds
    const skyTex = paintSkyBackdrop(this.palette);
    this.disposableTexs.push(skyTex);
    const skyGeo = this.trackGeo(new THREE.PlaneGeometry(155, 62));
    this.skyMat = this.trackMat(
      new THREE.MeshBasicMaterial({ map: skyTex, fog: false, depthWrite: false }),
    );
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.skyMesh.position.set(10, 8.5, -26);
    this.skyMesh.renderOrder = -20;
    this.root.add(this.skyMesh);

    // 2. Seamless painted distant mountain / forest / mesa panorama (Layer 1, Z = -15)
    const panoTex = paintFarPanorama(biomeId, this.palette);
    panoTex.repeat.set(5.5, 1);
    panoTex.anisotropy = maxAnisotropy;
    this.disposableTexs.push(panoTex);
    const panoGeo = this.trackGeo(new THREE.PlaneGeometry(290, 26));
    this.panoMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: panoTex,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    );
    this.panoramaFar = new THREE.Mesh(panoGeo, this.panoMat);
    this.panoramaFar.position.set(95, 7.2, -15.5);
    this.panoramaFar.renderOrder = -15;
    this.root.add(this.panoramaFar);

    // 3. 4-zone ground layout (with 3 chasm jumps in Zones 2 & 3)
    this.groundSegments = [
      { xStart: -22, xEnd: 56, y: 0 },
      { xStart: 62, xEnd: 106, y: 0 },
      { xStart: 112.5, xEnd: 132, y: 0 },
      { xStart: 138, xEnd: 215, y: 0 },
    ];

    // 4. One-way organic floating island platforms
    this.platforms = [
      // Zone 1
      { id: 'p1', x: 18, y: 2.6, width: 5.4, thickness: 1.5, oneWay: true },
      { id: 'p2', x: 27, y: 4.5, width: 5.0, thickness: 1.45, oneWay: true },
      { id: 'p3', x: 38, y: 2.8, width: 5.8, thickness: 1.55, oneWay: true },
      // Zone 2
      { id: 'p4', x: 52, y: 2.5, width: 5.0, thickness: 1.45, oneWay: true },
      { id: 'p5', x: 59, y: 3.1, width: 4.9, thickness: 1.45, oneWay: true },
      { id: 'p6', x: 69, y: 4.9, width: 5.8, thickness: 1.55, oneWay: true },
      { id: 'p7', x: 79, y: 3.0, width: 5.4, thickness: 1.5, oneWay: true },
      { id: 'p8', x: 88, y: 5.1, width: 5.4, thickness: 1.5, oneWay: true },
      // Zone 3
      { id: 'p9', x: 99, y: 2.9, width: 5.4, thickness: 1.5, oneWay: true },
      { id: 'p10', x: 109.2, y: 2.7, width: 4.6, thickness: 1.4, oneWay: true },
      { id: 'p11', x: 119, y: 4.6, width: 6.0, thickness: 1.6, oneWay: true },
      { id: 'p12', x: 127, y: 2.8, width: 4.8, thickness: 1.45, oneWay: true },
      { id: 'p13', x: 135, y: 3.2, width: 4.8, thickness: 1.45, oneWay: true },
      // Zone 4 Boss Arena tactical perches
      { id: 'p_boss_l', x: 154, y: 3.1, width: 4.8, thickness: 1.45, oneWay: true },
      { id: 'p_boss_r', x: 173, y: 3.1, width: 4.8, thickness: 1.45, oneWay: true },
    ];

    this.buildIllustratedGameplayPlane(maxAnisotropy);
    this.buildIllustratedMidBackground(biomeId);
    this.buildIllustratedNearBackground(isSoftwareGl);
    this.buildIllustratedForeground();
    this.buildDestructibleProps();

    // Boss Arena glowing rune barriers
    this.arenaGateLeft = this.buildArenaBarrier(BOSS_ARENA_MIN_X);
    this.arenaGateRight = this.buildArenaBarrier(BOSS_ARENA_MAX_X);
    this.arenaGateLeft.position.y = -8;
    this.arenaGateRight.position.y = -8;
    this.root.add(this.arenaGateLeft, this.arenaGateRight);
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.disposableGeos.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.disposableMats.push(mat);
    return mat;
  }

  private buildIllustratedGameplayPlane(maxAnisotropy: number): void {
    const facadeBaseTex = paintGroundFacadeTexture(this.palette);
    facadeBaseTex.anisotropy = maxAnisotropy;
    facadeBaseTex.magFilter = THREE.NearestFilter;
    this.disposableTexs.push(facadeBaseTex);

    const celRamp = createHeroCelRampTex();
    this.disposableTexs.push(celRamp);

    // Cel-shaded 2.5D walkable trail surface matching the Hero's quantized tonal bands
    const walkTopMat = this.trackMat(
      new THREE.MeshToonMaterial({
        color: this.palette.groundTop,
        gradientMap: celRamp,
      }),
    );
    const chasmRimMat = this.trackMat(
      new THREE.MeshToonMaterial({
        color: this.palette.groundSide,
        gradientMap: celRamp,
      }),
    );

    for (const seg of this.groundSegments) {
      const width = seg.xEnd - seg.xStart;
      const cx = (seg.xStart + seg.xEnd) * 0.5;

      // Painted curved scalloped turf & soil cliff front facade (NO blocky box look!)
      const segTex = facadeBaseTex.clone();
      segTex.magFilter = THREE.NearestFilter;
      segTex.needsUpdate = true;
      segTex.repeat.set(Math.max(1, width / 5.2), 1);
      this.disposableTexs.push(segTex);

      const facadeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          map: segTex,
          transparent: true,
          alphaTest: 0.14,
          depthWrite: true,
        }),
      );
      const facadeGeo = this.trackGeo(new THREE.PlaneGeometry(width + 0.3, 6.2));
      const facade = new THREE.Mesh(facadeGeo, facadeMat);
      // Slight upward offset so grass blades peek cleanly right at foot line y = 0
      facade.position.set(cx, seg.y - 2.86, 0.55);
      facade.renderOrder = 2;
      this.root.add(facade);

      // Walkable 2.5D top trail receding slightly in Z so contact shadows & perspective feel lush
      const topGeo = this.trackGeo(new THREE.PlaneGeometry(width, 3.2));
      const topStrip = new THREE.Mesh(topGeo, walkTopMat);
      topStrip.rotation.x = -Math.PI * 0.5;
      topStrip.position.set(cx, seg.y - 0.01, -1.0);
      topStrip.receiveShadow = true;
      this.root.add(topStrip);

      // Deep dark earth backdrop behind chasms so edges read cleanly in 2.5D
      const underGeo = this.trackGeo(new THREE.BoxGeometry(width - 0.15, 6.0, 2.2));
      const under = new THREE.Mesh(underGeo, chasmRimMat);
      under.position.set(cx, seg.y - 3.06, -0.58);
      this.root.add(under);
    }

    // Hand-painted organic floating islands (matching Green Hills & Bamboo Forest reference!)
    const islandTex = paintFloatingIslandTexture(this.palette);
    islandTex.anisotropy = maxAnisotropy;
    islandTex.magFilter = THREE.NearestFilter;
    this.disposableTexs.push(islandTex);

    const islandMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: islandTex,
        transparent: true,
        alphaTest: 0.16,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
    );

    const islandTopMat = this.trackMat(
      new THREE.MeshToonMaterial({
        color: this.palette.platformTop,
        gradientMap: celRamp,
      }),
    );

    for (const p of this.platforms) {
      const grp = new THREE.Group();
      grp.position.set(p.x, p.y, 0);

      // Front illustrated floating island card
      const cardH = Math.max(1.55, p.width * 0.34);
      const card = new THREE.Mesh(
        this.trackGeo(new THREE.PlaneGeometry(p.width + 0.35, cardH)),
        islandMat,
      );
      card.position.set(0, -cardH * 0.42, 0.25);
      card.renderOrder = 2;
      grp.add(card);

      // Subtle rounded walkable top depth shelf so hero contact shadow grounds nicely
      const shelf = new THREE.Mesh(
        this.trackGeo(new THREE.PlaneGeometry(p.width - 0.35, 1.15)),
        islandTopMat,
      );
      shelf.rotation.x = -Math.PI * 0.5;
      shelf.position.set(0, -0.02, -0.32);
      grp.add(shelf);

      this.root.add(grp);
    }
  }

  private buildIllustratedMidBackground(biomeId: BiomeId): void {
    // Paint 2 bespoke illustrated landmark variants (trees, cacti/spires, bamboo, pines, towers/sunflowers)
    const texA = paintMidLandmarkTexture(biomeId, 0);
    const texB = paintMidLandmarkTexture(biomeId, 1);
    this.disposableTexs.push(texA, texB);

    const matA = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: texA,
        transparent: true,
        alphaTest: 0.12,
        fog: true,
        depthWrite: false,
      }),
    );
    const matB = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: texB,
        transparent: true,
        alphaTest: 0.12,
        fog: true,
        depthWrite: false,
      }),
    );

    const planeGeo = this.trackGeo(new THREE.PlaneGeometry(1, 1));

    // Staggered real-Z parallax landmarks at Z = -9.5 to -4.0
    const count = 44;
    for (let i = 0; i < count; i++) {
      const x = -18 + i * 5.2 + Math.sin(i * 2.7) * 1.4;
      const zLayer = i % 3;
      const z = zLayer === 0 ? -9.2 : zLayer === 1 ? -6.4 : -4.2;
      const useB = i % 2 === 1;
      const baseH =
        biomeId === 'deep-forest' || biomeId === 'bamboo-forest'
          ? 10.2
          : biomeId === 'wheat-field' && !useB
            ? 8.8
            : 7.4;
      const scaleVar = 0.84 + ((i * 19) % 5) * 0.085;
      const h = baseH * scaleVar;
      const w = h;

      const mesh = new THREE.Mesh(planeGeo, useB ? matB : matA);
      const flip = i % 4 === 0 ? -1 : 1;
      mesh.scale.set(w * flip, h, 1);
      mesh.position.set(x, h * 0.48 - 0.45, z);
      mesh.renderOrder = -8 + zLayer;
      this.root.add(mesh);
    }
  }

  private buildIllustratedNearBackground(isSoftwareGl: boolean): void {
    // Hand-painted glowing sconces / stone lanterns at Z = -1.85 with warm/emerald PointLights
    const sconceTex = paintTorchSconceTexture(this.palette.torchColor);
    this.disposableTexs.push(sconceTex);
    const sconceMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: sconceTex,
        transparent: true,
        alphaTest: 0.12,
        depthWrite: false,
      }),
    );
    const sconceGeo = this.trackGeo(new THREE.PlaneGeometry(1.75, 2.65));
    const glowTex = createEmissiveGlowTex();
    this.disposableTexs.push(glowTex);
    const torchGlowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: new THREE.Color(this.palette.torchColor).multiplyScalar(2.35),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const torchGlowGeo = this.trackGeo(new THREE.PlaneGeometry(1.35, 1.35));

    const torchPositions = [8, 34, 68, 96, 124, 152, 174];
    torchPositions.forEach((tx, idx) => {
      const card = new THREE.Mesh(sconceGeo, sconceMat);
      card.position.set(tx, 1.28, -1.7);
      card.renderOrder = -1;
      this.root.add(card);

      // Flickering HDR biome flame/lantern emissive orb for selective Bloom
      const glow = new THREE.Mesh(torchGlowGeo, torchGlowMat);
      glow.position.set(tx, 2.12, -1.62);
      glow.renderOrder = 0;
      this.root.add(glow);
      this.torchGlows.push({ mesh: glow, baseScale: 1.0, phase: idx * 1.4 });

      if (!isSoftwareGl || idx % 2 === 0) {
        const pt = new THREE.PointLight(this.palette.torchColor, 3.6, 11, 1.7);
        pt.position.set(tx, 2.3, -1.1);
        this.root.add(pt);
        this.torchLights.push({ light: pt, baseIntensity: 3.6, phase: idx * 1.4 });
      }
    });

    // Near-background silhouette bushes tucked softly behind the trail (Z = -2.1)
    const bushTex = paintForegroundSilhouetteTexture(this.palette);
    this.disposableTexs.push(bushTex);
    const nearTint = new THREE.Color(this.palette.nearAccent);
    const bushMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: bushTex,
        color: nearTint,
        transparent: true,
        alphaTest: 0.12,
        depthWrite: false,
        fog: true,
      }),
    );
    const bushGeo = this.trackGeo(new THREE.PlaneGeometry(4.4, 2.1));
    for (let i = 0; i < 32; i++) {
      const x = -10 + i * 6.8 + Math.cos(i * 1.9) * 1.3;
      const b = new THREE.Mesh(bushGeo, bushMat);
      const s = 0.8 + (i % 3) * 0.22;
      b.scale.set((i % 2 === 0 ? 1 : -1) * s, s, 1);
      b.position.set(x, 0.78 * s, -2.05 - (i % 2) * 0.35);
      b.renderOrder = -2;
      this.root.add(b);
    }
  }

  private buildIllustratedForeground(): void {
    // Cinematic dark illustrated silhouette framing foliage/cliffs at Z = +3.3..+4.0
    const fgTex = paintForegroundSilhouetteTexture(this.palette);
    this.disposableTexs.push(fgTex);
    const fgMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: fgTex,
        transparent: true,
        alphaTest: 0.12,
        depthWrite: false,
      }),
    );
    const fgGeo = this.trackGeo(new THREE.PlaneGeometry(5.6, 2.6));

    for (let i = 0; i < 20; i++) {
      const x = -8 + i * 11.4 + Math.sin(i * 3.1) * 2.2;
      const m = new THREE.Mesh(fgGeo, fgMat);
      const sc = 0.88 + (i % 3) * 0.18;
      m.scale.set((i % 2 === 0 ? 1 : -1) * sc, sc, 1);
      m.position.set(x, -0.35, 3.35 + (i % 3) * 0.28);
      m.renderOrder = 14;
      this.root.add(m);
    }
  }

  private buildDestructibleProps(): void {
    const barrelTex = paintPropTexture('barrel', this.palette.torchColor);
    const crateTex = paintPropTexture('crate', this.palette.torchColor);
    const crystalTex = paintPropTexture('crystal', this.palette.torchColor);
    barrelTex.magFilter = THREE.NearestFilter;
    crateTex.magFilter = THREE.NearestFilter;
    crystalTex.magFilter = THREE.NearestFilter;
    const shadowTex = createContactShadowTex();
    this.disposableTexs.push(barrelTex, crateTex, crystalTex, shadowTex);

    const mats: Record<DestructibleProp['kind'], THREE.MeshBasicMaterial> = {
      barrel: this.trackMat(
        new THREE.MeshBasicMaterial({
          map: barrelTex,
          transparent: true,
          alphaTest: 0.18,
          depthWrite: true,
        }),
      ),
      crate: this.trackMat(
        new THREE.MeshBasicMaterial({
          map: crateTex,
          transparent: true,
          alphaTest: 0.18,
          depthWrite: true,
        }),
      ),
      crystal: this.trackMat(
        new THREE.MeshBasicMaterial({
          map: crystalTex,
          transparent: true,
          alphaTest: 0.18,
          depthWrite: true,
        }),
      ),
    };

    const shadowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.7,
      }),
    );

    const cardGeo = this.trackGeo(new THREE.PlaneGeometry(1.38, 1.38));
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(1.2, 0.45));
    const crystalGlowTex = createEmissiveGlowTex();
    this.disposableTexs.push(crystalGlowTex);
    const crystalGlowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: crystalGlowTex,
        color: new THREE.Color(this.palette.torchColor).multiplyScalar(2.15),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const crystalGlowGeo = this.trackGeo(new THREE.PlaneGeometry(1.35, 1.35));

    const propSpecs: { x: number; y: number; kind: DestructibleProp['kind'] }[] = [
      { x: 11.5, y: 0, kind: 'barrel' },
      { x: 18.2, y: 2.6, kind: 'crate' },
      { x: 27.5, y: 4.5, kind: 'crystal' },
      { x: 35.5, y: 0, kind: 'barrel' },
      { x: 46.5, y: 0, kind: 'crate' },
      { x: 52.5, y: 2.5, kind: 'barrel' },
      { x: 69.5, y: 4.9, kind: 'crystal' },
      { x: 75.0, y: 0, kind: 'crate' },
      { x: 88.2, y: 5.1, kind: 'barrel' },
      { x: 99.2, y: 2.9, kind: 'crystal' },
      { x: 115.5, y: 0, kind: 'barrel' },
      { x: 119.5, y: 4.6, kind: 'crate' },
      { x: 129.0, y: 0, kind: 'barrel' },
      { x: 141.5, y: 0, kind: 'crystal' },
      { x: 143.2, y: 0, kind: 'barrel' },
    ];

    propSpecs.forEach((spec, idx) => {
      const grp = new THREE.Group();
      grp.position.set(spec.x, spec.y, 0);

      const card = new THREE.Mesh(cardGeo, mats[spec.kind]);
      card.position.set(0, 0.64, 0.04);
      card.renderOrder = 3;
      grp.add(card);

      // Biome-colored emissive core aura on destructible crystals
      if (spec.kind === 'crystal') {
        const cGlow = new THREE.Mesh(crystalGlowGeo, crystalGlowMat);
        cGlow.position.set(0, 0.72, 0.08);
        cGlow.renderOrder = 4;
        grp.add(cGlow);
      }

      const sh = new THREE.Mesh(shadowGeo, shadowMat);
      sh.rotation.x = -Math.PI * 0.5;
      sh.position.set(0, 0.02, 0);
      grp.add(sh);

      this.root.add(grp);
      this.props.push({
        id: `prop_${idx}`,
        kind: spec.kind,
        x: spec.x,
        y: spec.y,
        width: 1.0,
        height: 1.18,
        hp: spec.kind === 'crate' ? 2 : 1,
        destroyed: false,
        group: grp,
        hitFlash: 0,
      });
    });
  }

  private buildArenaBarrier(x: number): THREE.Group {
    const grp = new THREE.Group();
    grp.position.set(x, 0, 0);

    const beamMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x38bdf8).multiplyScalar(1.95),
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const coreMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xe0f2fe).multiplyScalar(2.6),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );

    const beam = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(0.9, 8.2)), beamMat);
    beam.position.set(0, 4.1, 0.15);
    const core = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(0.24, 8.2)), coreMat);
    core.position.set(0, 4.1, 0.18);
    grp.add(beam, core);
    return grp;
  }

  public spawnPickup(x: number, y: number, kind: 'heal' | 'gem'): void {
    const grp = new THREE.Group();
    grp.position.set(x, y + 0.6, 0);

    const colorHex = kind === 'heal' ? 0x34d399 : 0xfacc15;
    const coreMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex).multiplyScalar(2.0),
        toneMapped: false,
      }),
    );
    const haloMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex).multiplyScalar(2.2),
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );

    const core = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.28, kind === 'heal' ? 1 : 0)),
      coreMat,
    );
    const halo = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.45, 10, 8)), haloMat);
    grp.add(core, halo);
    this.root.add(grp);

    this.pickups.push({
      id: this.nextPickupId++,
      kind,
      x,
      y: y + 0.65,
      vx: (Math.random() - 0.5) * 2.5,
      vy: 4.5,
      age: 0,
      mesh: grp,
      collected: false,
    });
  }

  public setArenaLocked(locked: boolean): void {
    this.arenaLocked = locked;
  }

  public setAtmosphereTint(skyTint: THREE.Color, panoTint: THREE.Color): void {
    this.skyMat.color.copy(skyTint);
    this.panoMat.color.copy(panoTint);
  }

  public getGroundHeightAt(x: number): number | null {
    for (const seg of this.groundSegments) {
      if (x >= seg.xStart && x <= seg.xEnd) {
        return seg.y;
      }
    }
    return null;
  }

  public update(dt: number, cameraX: number, elapsed: number): void {
    this.skyMesh.position.x = cameraX;

    // Gentle torch glow pulse
    for (const t of this.torchLights) {
      t.light.intensity = t.baseIntensity + Math.sin(elapsed * 7.5 + t.phase) * 0.55;
    }
    for (const g of this.torchGlows) {
      const flick = g.baseScale + Math.sin(elapsed * 8.2 + g.phase) * 0.14;
      g.mesh.scale.set(flick, flick, 1);
    }

    // Smoothly raise/lower Boss Arena rune barriers
    const targetY = this.arenaLocked ? 0 : -8.5;
    const damp = 1 - Math.exp(-7 * dt);
    this.arenaGateLeft.position.y = THREE.MathUtils.lerp(
      this.arenaGateLeft.position.y,
      targetY,
      damp,
    );
    this.arenaGateRight.position.y = THREE.MathUtils.lerp(
      this.arenaGateRight.position.y,
      targetY,
      damp,
    );

    // Wobble destructible props on hit
    for (const prop of this.props) {
      if (prop.destroyed) continue;
      if (prop.hitFlash > 0) {
        prop.hitFlash = Math.max(0, prop.hitFlash - dt);
        prop.group.rotation.z = Math.sin(prop.hitFlash * 60) * 0.2;
      } else {
        prop.group.rotation.z = 0;
      }
    }

    // Update bouncing/bobbing pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.collected) {
        this.root.remove(p.mesh);
        this.pickups.splice(i, 1);
        continue;
      }
      p.age += dt;
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - 4 * dt);

      const floorY = this.getGroundHeightAt(p.x);
      let supportY = floorY !== null ? floorY + 0.45 : -99;
      for (const plat of this.platforms) {
        if (Math.abs(p.x - plat.x) <= plat.width * 0.5 && p.y >= plat.y + 0.25) {
          supportY = Math.max(supportY, plat.y + 0.45);
        }
      }
      if (p.y < supportY) {
        p.y = supportY;
        p.vy = Math.abs(p.vy) > 1.8 ? Math.abs(p.vy) * 0.35 : 0;
      }

      p.mesh.position.set(p.x, p.y + Math.sin(p.age * 5.2) * 0.12, 0);
      p.mesh.rotation.y = p.age * 2.8;
    }
  }

  public dispose(): void {
    for (const p of this.pickups) {
      this.root.remove(p.mesh);
    }
    this.pickups = [];
    for (const g of this.disposableGeos) g.dispose();
    for (const m of this.disposableMats) m.dispose();
    for (const t of this.disposableTexs) t.dispose();
    this.disposableGeos = [];
    this.disposableMats = [];
    this.disposableTexs = [];
  }
}
