import * as THREE from 'three';
import { BiomeId, ShaderStyleMode } from './types';

interface BiomeGradeProfile {
  shadowTint: number;
  midtoneTint: number;
  highlightTint: number;
  gradeStrength: number;
  saturation: number;
  contrast: number;
  vignette: number;
}

/**
 * Per-biome 3-way split-tone color-grading profiles that unify the hero,
 * illustrated enemies, 3D VFX particles, and 5-layer parallax scenery into
 * a single harmonious palette.
 */
const BIOME_GRADES: Record<BiomeId, BiomeGradeProfile> = {
  'deep-forest': {
    shadowTint: 0x0b2628,
    midtoneTint: 0xdff5e6,
    highlightTint: 0xf4ffd8,
    gradeStrength: 0.34,
    saturation: 1.08,
    contrast: 1.07,
    vignette: 0.28,
  },
  'green-hills': {
    shadowTint: 0x16324f,
    midtoneTint: 0xf0faeb,
    highlightTint: 0xfff8dc,
    gradeStrength: 0.28,
    saturation: 1.12,
    contrast: 1.05,
    vignette: 0.2,
  },
  'hare-canyon': {
    shadowTint: 0x3b1822,
    midtoneTint: 0xffebd6,
    highlightTint: 0xffe0b2,
    gradeStrength: 0.36,
    saturation: 1.1,
    contrast: 1.09,
    vignette: 0.26,
  },
  'bamboo-forest': {
    shadowTint: 0x182616,
    midtoneTint: 0xf2f7d4,
    highlightTint: 0xfffcc7,
    gradeStrength: 0.34,
    saturation: 1.06,
    contrast: 1.06,
    vignette: 0.24,
  },
  winter: {
    shadowTint: 0x102347,
    midtoneTint: 0xe3f2ff,
    highlightTint: 0xf2fbff,
    gradeStrength: 0.34,
    saturation: 1.04,
    contrast: 1.08,
    vignette: 0.24,
  },
  'wheat-field': {
    shadowTint: 0x331f12,
    midtoneTint: 0xfff1cf,
    highlightTint: 0xfff6d1,
    gradeStrength: 0.32,
    saturation: 1.1,
    contrast: 1.06,
    vignette: 0.22,
  },
};

const POST_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const POST_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float uExposure;

  // Color grading uniforms (biome harmonization)
  uniform vec3 uShadowTint;
  uniform vec3 uMidtoneTint;
  uniform vec3 uHighlightTint;
  uniform float uGradeStrength;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uVignette;

  // Pixel-art ordered dither & color quantization uniforms
  uniform float uPixelSize;      // 1.0 = native, 2.0 = crisp HD-2D, 3.0 = 16-bit retro
  uniform float uColorSteps;     // levels per channel (e.g. 20.0 HD-2D, 11.0 16-bit)
  uniform float uDitherStrength; // 0.0..1.0 Bayer dither intensity
  uniform float uQuantizeMix;    // 0.0 = off, 1.0 = full quantization + dither

  // Dynamic combat grade pulse (e.g. Parry cyan / Crit warm amber)
  uniform vec3 uFlashColor;
  uniform float uFlashAmount;

  varying vec2 vUv;

  // ACES Filmic Tone Mapping (Narkowicz approximation)
  vec3 acesFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  // Exact branchless 4x4 Bayer ordered dithering threshold in [0.0, 1.0)
  float bayer4x4(vec2 coord) {
    vec2 p = mod(floor(coord), 4.0);
    float x0 = mod(p.x, 2.0);
    float y0 = mod(p.y, 2.0);
    float x1 = floor(p.x * 0.5);
    float y1 = floor(p.y * 0.5);
    float m0 = 2.0 * abs(x0 - y0) + y0;
    float m1 = 2.0 * abs(x1 - y1) + y1;
    return (4.0 * m0 + m1) / 16.0;
  }

  void main() {
    // 1. Optional pixel-art grid snapping in screen space
    vec2 pixelRes = max(vec2(1.0), floor(uResolution / max(1.0, uPixelSize)));
    vec2 sampleUv = uPixelSize > 1.05
      ? (floor(vUv * pixelRes) + 0.5) / pixelRes
      : vUv;

    vec4 texel = texture2D(tDiffuse, sampleUv);
    vec3 col = texel.rgb * uExposure;

    // 2. Filmic tone mapping + linear-to-sRGB perceptual encoding
    col = acesFilm(col);
    col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));

    // 3. Unified Biome 3-Way Split-Tone Color Grading
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float shadowWeight = 1.0 - smoothstep(0.05, 0.48, luma);
    float highlightWeight = smoothstep(0.52, 0.96, luma);
    float midWeight = clamp(1.0 - shadowWeight - highlightWeight, 0.0, 1.0);

    // Harmonize shadows toward biome dark tone, mids toward unified palette, highlights toward warm/cool sky
    vec3 graded = col;
    graded = mix(graded, graded * uMidtoneTint, midWeight * uGradeStrength * 0.85);
    graded = mix(graded, mix(graded, uShadowTint, 0.42), shadowWeight * uGradeStrength);
    graded = mix(graded, graded * uHighlightTint, highlightWeight * uGradeStrength * 0.9);

    // Balanced saturation & subtle contrast curve
    float gradedLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
    graded = mix(vec3(gradedLuma), graded, uSaturation);
    graded = (graded - 0.5) * uContrast + 0.5;
    graded = clamp(graded, 0.0, 1.0);

    // Subtle combat impact tint (Parry / Crit finisher)
    graded = mix(graded, clamp(graded + uFlashColor * 0.35, 0.0, 1.0), uFlashAmount);

    // 4. Subtle cinematic vignette framing the 2.5D action corridor
    vec2 centered = vUv - 0.5;
    float vig = 1.0 - dot(centered, centered) * uVignette * 1.45;
    graded *= clamp(vig, 0.62, 1.0);

    // 5. Uniform Pixel-Art 4x4 Bayer Ordered Dither & Color Quantization
    if (uQuantizeMix > 0.01) {
      vec2 ditherCoord = floor(vUv * pixelRes);
      float threshold = bayer4x4(ditherCoord) - 0.5;
      float steps = max(4.0, uColorSteps);
      vec3 dithered = clamp(graded + (threshold * uDitherStrength) / steps, 0.0, 1.0);
      vec3 quantized = floor(dithered * steps + 0.5) / steps;
      graded = mix(graded, quantized, uQuantizeMix);
    }

    gl_FragColor = vec4(graded, 1.0);
  }
`;

export class PostProcessingPass {
  private renderTarget: THREE.WebGLRenderTarget;
  private postScene: THREE.Scene;
  private postCamera: THREE.OrthographicCamera;
  private quadGeo: THREE.PlaneGeometry;
  public material: THREE.ShaderMaterial;

  public mode: ShaderStyleMode = 'hd2d';
  private flashAmount = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    initialBiome: BiomeId,
  ) {
    const pixelRatio = renderer.getPixelRatio();
    const rtW = Math.max(1, Math.floor(width * pixelRatio));
    const rtH = Math.max(1, Math.floor(height * pixelRatio));

    const supportsHalfFloat =
      renderer.capabilities.isWebGL2 &&
      (renderer.extensions.has('EXT_color_buffer_float') ||
        renderer.extensions.has('EXT_color_buffer_half_float'));

    this.renderTarget = new THREE.WebGLRenderTarget(rtW, rtH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: supportsHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        uResolution: { value: new THREE.Vector2(Math.max(1, width), Math.max(1, height)) },
        uExposure: { value: 1.08 },
        uShadowTint: { value: new THREE.Color().setHex(0x0b2628, THREE.LinearSRGBColorSpace) },
        uMidtoneTint: { value: new THREE.Color().setHex(0xdff5e6, THREE.LinearSRGBColorSpace) },
        uHighlightTint: { value: new THREE.Color().setHex(0xf4ffd8, THREE.LinearSRGBColorSpace) },
        uGradeStrength: { value: 0.34 },
        uSaturation: { value: 1.08 },
        uContrast: { value: 1.07 },
        uVignette: { value: 0.26 },
        uPixelSize: { value: 2.0 },
        uColorSteps: { value: 20.0 },
        uDitherStrength: { value: 0.72 },
        uQuantizeMix: { value: 0.85 },
        uFlashColor: { value: new THREE.Color().setHex(0x38bdf8, THREE.LinearSRGBColorSpace) },
        uFlashAmount: { value: 0.0 },
      },
      vertexShader: POST_VERTEX_SHADER,
      fragmentShader: POST_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    const quad = new THREE.Mesh(this.quadGeo, this.material);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    this.setBiome(initialBiome);
    this.setMode('hd2d');
  }

  public setBiome(biomeId: BiomeId): void {
    const profile = BIOME_GRADES[biomeId];
    const u = this.material.uniforms;
    u.uShadowTint.value.setHex(profile.shadowTint, THREE.LinearSRGBColorSpace);
    u.uMidtoneTint.value.setHex(profile.midtoneTint, THREE.LinearSRGBColorSpace);
    u.uHighlightTint.value.setHex(profile.highlightTint, THREE.LinearSRGBColorSpace);
    u.uGradeStrength.value = profile.gradeStrength;
    u.uSaturation.value = profile.saturation;
    u.uContrast.value = profile.contrast;
    u.uVignette.value = profile.vignette;
  }

  public setMode(mode: ShaderStyleMode): void {
    this.mode = mode;
    const u = this.material.uniforms;

    if (mode === 'hd2d') {
      // Balanced HD-2D: crisp 2px pixel-art dither + unified 20-step palette quantization + biome grade
      u.uPixelSize.value = 2.0;
      u.uColorSteps.value = 20.0;
      u.uDitherStrength.value = 0.78;
      u.uQuantizeMix.value = 0.88;
      this.renderTarget.texture.minFilter = THREE.NearestFilter;
      this.renderTarget.texture.magFilter = THREE.NearestFilter;
    } else if (mode === 'retro16') {
      // Classic 16-bit Castlevania / Metal Slug aesthetic: 3px grid + pronounced 4x4 Bayer dither + 11 steps
      u.uPixelSize.value = 3.0;
      u.uColorSteps.value = 11.0;
      u.uDitherStrength.value = 0.95;
      u.uQuantizeMix.value = 1.0;
      this.renderTarget.texture.minFilter = THREE.NearestFilter;
      this.renderTarget.texture.magFilter = THREE.NearestFilter;
    } else if (mode === 'grade') {
      // Full biome color-grading harmonization at native crisp resolution without pixelation
      u.uPixelSize.value = 1.0;
      u.uColorSteps.value = 32.0;
      u.uDitherStrength.value = 0.25;
      u.uQuantizeMix.value = 0.0;
      this.renderTarget.texture.minFilter = THREE.LinearFilter;
      this.renderTarget.texture.magFilter = THREE.LinearFilter;
    }
    this.renderTarget.texture.needsUpdate = true;
  }

  public triggerFlash(colorHex: number, amount = 0.35): void {
    this.material.uniforms.uFlashColor.value.setHex(colorHex, THREE.LinearSRGBColorSpace);
    this.flashAmount = Math.max(this.flashAmount, amount);
  }

  public update(dt: number): void {
    if (this.flashAmount > 0) {
      this.flashAmount *= Math.exp(-10 * dt);
      if (this.flashAmount < 0.005) this.flashAmount = 0;
    }
    this.material.uniforms.uFlashAmount.value = this.flashAmount;
  }

  public resize(width: number, height: number, pixelRatio: number): void {
    const rtW = Math.max(1, Math.floor(width * pixelRatio));
    const rtH = Math.max(1, Math.floor(height * pixelRatio));
    this.renderTarget.setSize(rtW, rtH);
    this.material.uniforms.uResolution.value.set(Math.max(1, width), Math.max(1, height));
  }

  public render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): void {
    if (this.mode === 'off') {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    // Pass 1: Render entire 3D/2.5D scene into linear offscreen target
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(scene, camera);

    // Pass 2: Full-screen custom ShaderMaterial (biome color-grade + Bayer dither + color quantization)
    renderer.setRenderTarget(null);
    renderer.render(this.postScene, this.postCamera);
  }

  public dispose(): void {
    this.renderTarget.dispose();
    this.quadGeo.dispose();
    this.material.dispose();
  }
}
