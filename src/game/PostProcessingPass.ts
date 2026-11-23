import * as THREE from 'three';
import { BiomeId, ShaderStyleMode } from './types';

interface BiomeUnifiedProfile {
  shadowTint: number;
  midtoneTint: number;
  highlightTint: number;
  inkColor: number;
  gradeStrength: number;
  saturation: number;
  contrast: number;
  vignette: number;
  bloomStrength: number;
  /**
   * 16-color Hero-Anchored Master Palette per biome.
   * Indices 0..6 are LOCKED to the Hero sprite's exact visual DNA
   * (warm espresso ink, armor indigo, royal cobalt, aether cyan, chestnut leather,
   * antique gold, forged steel/ivory), while indices 7..15 harmonize each biome's
   * foliage, terrain, sky, and enemy accents to the exact same artbook gamut.
   */
  palette16: readonly number[];
}

// Hero's 7 signature anchor colors sampled from the reference 4-row hero spritesheet
const HERO_ANCHORS = [
  0x1d1414, // 0: Warm espresso ink outline & deepest shadow
  0x252d52, // 1: Dark navy armor & cape shadow
  0x2e5ec4, // 2: Royal cobalt hero tunic & cape midtone
  0x74dcff, // 3: Aether cyan sword slash & parry glow
  0x8b532e, // 4: Chestnut hair & leather boots midtone
  0xe7b64a, // 5: Antique gold trim & shield emblem
  0xf2e6d3, // 6: Warm ivory skin & forged blade highlight
] as const;

const BIOME_PROFILES: Record<BiomeId, BiomeUnifiedProfile> = {
  'deep-forest': {
    shadowTint: 0x182628,
    midtoneTint: 0xe8f3e6,
    highlightTint: 0xf7f7d8,
    inkColor: 0x1a1514,
    gradeStrength: 0.32,
    saturation: 1.06,
    contrast: 1.07,
    vignette: 0.25,
    bloomStrength: 0.82,
    palette16: [
      ...HERO_ANCHORS,
      0x153b34, // Deep emerald canopy shadow
      0x276246, // Forest moss midtone
      0x4f9a54, // Sunlit leaf highlight
      0x8cd88a, // Mint canopy rim
      0x4e3524, // Ancient root & bark brown
      0x7d6d5c, // Weathered ruin stone
      0xb64a38, // Enemy crimson/imp accent
      0xd87c42, // Torch amber ember
      0x478c7e, // Misty forest sky teal
    ],
  },
  'green-hills': {
    shadowTint: 0x1d2b42,
    midtoneTint: 0xf4f8eb,
    highlightTint: 0xfff7dc,
    inkColor: 0x1e1614,
    gradeStrength: 0.28,
    saturation: 1.08,
    contrast: 1.06,
    vignette: 0.19,
    bloomStrength: 0.66,
    palette16: [
      ...HERO_ANCHORS,
      0x26592e, // Shaded meadow grass
      0x52a33c, // Bright hill turf
      0x99d959, // Sunlit clover highlight
      0x5e4129, // Rich soil & cliff earth
      0x996b42, // Warm sandstone & timber
      0x3482d6, // Cerulean meadow sky
      0xa6def7, // Horizon sky blue
      0xb94438, // Enemy crimson accent
      0xd98444, // Warm wood & lantern
    ],
  },
  'hare-canyon': {
    shadowTint: 0x321a22,
    midtoneTint: 0xfcecd9,
    highlightTint: 0xffe4bc,
    inkColor: 0x241412,
    gradeStrength: 0.34,
    saturation: 1.07,
    contrast: 1.08,
    vignette: 0.24,
    bloomStrength: 0.74,
    palette16: [
      ...HERO_ANCHORS,
      0x6b2a1e, // Deep mesa shadow
      0xb34b2e, // Terracotta canyon rock
      0xe07c4a, // Sun-baked ochre cliff
      0xf5ba7a, // Warm desert dust highlight
      0x3f6b39, // Saguaro cactus green
      0x70a354, // Desert sage highlight
      0x2f74b8, // High canyon sky
      0x9dd0e8, // Horizon haze blue
      0xc23c34, // Crimson enemy armor
    ],
  },
  'bamboo-forest': {
    shadowTint: 0x1f2618,
    midtoneTint: 0xf4f6d8,
    highlightTint: 0xfff8c8,
    inkColor: 0x1b1712,
    gradeStrength: 0.32,
    saturation: 1.05,
    contrast: 1.06,
    vignette: 0.22,
    bloomStrength: 0.72,
    palette16: [
      ...HERO_ANCHORS,
      0x2f421e, // Shaded bamboo hollow
      0x5e7d32, // Jade bamboo stalk
      0x9bb54a, // Golden-green sunlit leaf
      0xdce68a, // Misty golden canopy glow
      0x4d412e, // Shrine moss stone
      0x7c705a, // Weathered granite
      0xbd4936, // Demon/crimson banner accent
      0xe08d3c, // Paper lantern amber
      0x99a85c, // Bamboo mist midtone
    ],
  },
  winter: {
    shadowTint: 0x162442,
    midtoneTint: 0xeaf4ff,
    highlightTint: 0xf5fbff,
    inkColor: 0x171824,
    gradeStrength: 0.32,
    saturation: 1.04,
    contrast: 1.08,
    vignette: 0.22,
    bloomStrength: 0.68,
    palette16: [
      ...HERO_ANCHORS,
      0x284770, // Glacial shadow blue
      0x5c8ab8, // Frosted slate ice
      0x9ecdf0, // Snowdrift sky blue
      0xdcf0fc, // Crisp packed snow
      0x38524a, // Frozen pine needle
      0x594a42, // Winter timber & stone
      0xb84040, // Warm crimson enemy contrast
      0xd98448, // Hearth torch ember
      0x738fa8, // Steel mountain rock
    ],
  },
  'wheat-field': {
    shadowTint: 0x2e1f16,
    midtoneTint: 0xfcf1d4,
    highlightTint: 0xfff6d4,
    inkColor: 0x211612,
    gradeStrength: 0.3,
    saturation: 1.08,
    contrast: 1.06,
    vignette: 0.2,
    bloomStrength: 0.7,
    palette16: [
      ...HERO_ANCHORS,
      0x634222, // Rich tilled furrow
      0xa67428, // Shaded golden wheat
      0xd9a838, // Harvest grain midtone
      0xf7d86c, // Sunlit sunflower gold
      0x4a7836, // Hedgerow green
      0x387ec7, // Clear harvest sky
      0xaed9f5, // Pale horizon cloud
      0xb84234, // Red barn / enemy crest
      0x8a6d56, // Watchtower timber
    ],
  },
};

const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Pass A (Quarter-Res): Selective HDR Emissive + Gameplay Cyan/Aether Bloom Extractor.
 * Isolates HDR > 1.05 elements (cyan sword trails, parry rings, sparks, biome torches,
 * crystals, rune gates, projectiles, pickups) plus luminous painted cyan arcs on the
 * hero sprite on the gameplay plane while keeping bright daytime skies/snow clean.
 */
const BLOOM_PREFILTER_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uTexelSize;
  uniform float uHasDepth;
  uniform float uHasHdr;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uThreshold;
  uniform float uSoftKnee;

  varying vec2 vUv;

  float linearizeDepth(float d) {
    float zNdc = d * 2.0 - 1.0;
    return (2.0 * uCameraNear * uCameraFar) /
      max(0.0001, (uCameraFar + uCameraNear - zNdc * (uCameraFar - uCameraNear)));
  }

  vec3 extractEmissive(vec2 uv) {
    vec3 c = texture2D(tDiffuse, uv).rgb;
    float peak = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float chroma = peak - minC;

    // 1. Primary HDR emissive extraction (exceeds 1.0 in HalfFloat target)
    float knee = uThreshold * uSoftKnee + 0.0001;
    float soft = clamp(peak - uThreshold + knee, 0.0, 2.0 * knee);
    soft = (soft * soft) / (4.0 * knee);
    float contrib = max(soft, peak - uThreshold) / max(peak, 0.0001);
    vec3 hdrBloom = c * max(0.0, contrib);

    // Non-HDR fallback (UnsignedByteType): require strong chroma + high brightness so white clouds stay crisp
    if (uHasHdr < 0.5) {
      float ldrMask = smoothstep(0.76, 0.96, peak) * smoothstep(0.24, 0.55, chroma);
      hdrBloom = max(hdrBloom, c * ldrMask * 0.85);
    }

    // 2. Selective gameplay-plane boost for the Hero spritesheet's painted cyan slash arc & parry ring
    float gameplayMask = 1.0;
    if (uHasDepth > 0.5) {
      float linD = linearizeDepth(texture2D(tDepth, uv).r);
      gameplayMask = 1.0 - smoothstep(21.5, 24.5, linD);
    }
    // Painted cyan slash & parry glow in linear space (high blue + green, lower red)
    float cyanGlow =
      smoothstep(0.42, 0.82, c.b) *
      smoothstep(0.28, 0.68, c.g) *
      smoothstep(0.14, 0.36, c.b - c.r) *
      gameplayMask;
    vec3 spriteCyanBloom = c * cyanGlow * 0.72;

    return min(hdrBloom + spriteCyanBloom, vec3(3.2));
  }

  void main() {
    // 4-tap box downsample to prevent flickering on thin 1px sword arcs & sparks
    vec2 h = uTexelSize * 0.5;
    vec3 sum =
      extractEmissive(vUv + vec2(-h.x, -h.y)) +
      extractEmissive(vUv + vec2( h.x, -h.y)) +
      extractEmissive(vUv + vec2(-h.x,  h.y)) +
      extractEmissive(vUv + vec2( h.x,  h.y));
    gl_FragColor = vec4(sum * 0.25, 1.0);
  }
`;

/**
 * Pass B & C (Quarter-Res): Separable 9-Tap Gaussian Blur for velvety bloom halos.
 */
const BLOOM_BLUR_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D tInput;
  uniform vec2 uDirection; // (texelX * spread, 0) or (0, texelY * spread)

  varying vec2 vUv;

  void main() {
    vec3 res = texture2D(tInput, vUv).rgb * 0.227027;
    res += texture2D(tInput, vUv + uDirection * 1.0).rgb * 0.1945946;
    res += texture2D(tInput, vUv - uDirection * 1.0).rgb * 0.1945946;
    res += texture2D(tInput, vUv + uDirection * 2.0).rgb * 0.1216216;
    res += texture2D(tInput, vUv - uDirection * 2.0).rgb * 0.1216216;
    res += texture2D(tInput, vUv + uDirection * 3.0).rgb * 0.054054;
    res += texture2D(tInput, vUv - uDirection * 3.0).rgb * 0.054054;
    res += texture2D(tInput, vUv + uDirection * 4.0).rgb * 0.016216;
    res += texture2D(tInput, vUv - uDirection * 4.0).rgb * 0.016216;
    gl_FragColor = vec4(res, 1.0);
  }
`;

/**
 * Pass D (Full-Res): Unified Hero-Style Aesthetic Composite + Bloom Integration.
 */
const POST_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform sampler2D tBloom;
  uniform float uHasDepth;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform vec2 uResolution;
  uniform float uExposure;
  uniform float uBloomStrength;

  // Hero-anchored biome color harmonization
  uniform vec3 uShadowTint;
  uniform vec3 uMidtoneTint;
  uniform vec3 uHighlightTint;
  uniform vec3 uInkColor;
  uniform float uGradeStrength;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uVignette;

  // Unified pixel-art quantization, Bayer dithering, palette constraint & ink contours
  uniform float uPixelSize;       // 1.0 = native, 2.0 = Hero Unified, 3.0 = 16-Bit Pixel
  uniform float uColorSteps;      // per-channel levels (e.g. 12.0 Hero Unified, 8.0 16-bit)
  uniform float uLumaBands;       // cel-shaded tonal value bands (e.g. 9.0 Hero Unified, 6.0 16-bit)
  uniform float uDitherStrength;  // 4x4 Bayer ordered dither strength
  uniform float uQuantizeMix;     // 0.0 = off, 1.0 = full unified quantization
  uniform float uPaletteSnap;     // blend toward curated 16-color Hero-Biome master palette
  uniform float uOutlineStrength; // unified warm-espresso hero ink contour strength
  uniform vec3 uPalette[16];      // 16-color Hero + Biome Master Palette (sRGB)

  // Dynamic combat impact pulse (Parry cyan / Crit gold / Hurt crimson)
  uniform vec3 uFlashColor;
  uniform float uFlashAmount;

  varying vec2 vUv;

  vec3 acesFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  float linearizeDepth(float d) {
    float zNdc = d * 2.0 - 1.0;
    return (2.0 * uCameraNear * uCameraFar) /
      max(0.0001, (uCameraFar + uCameraNear - zNdc * (uCameraFar - uCameraNear)));
  }

  // Exact branchless 4x4 Bayer ordered dither threshold in [0.0, 1.0)
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

  // Perceptually weighted Rec.709 color distance for cohesive Hero-palette snapping
  float colorDistSq(vec3 a, vec3 b) {
    vec3 d = a - b;
    vec3 w = vec3(0.299, 0.587, 0.114);
    float lumaDiff = dot(d, w);
    return dot(d * d, vec3(0.32, 0.52, 0.16)) + lumaDiff * lumaDiff * 0.65;
  }

  vec3 snapToHeroBiomePalette(vec3 col) {
    vec3 best = uPalette[0];
    float bestDist = 1e9;
    for (int i = 0; i < 16; i++) {
      float dist = colorDistSq(col, uPalette[i]);
      if (dist < bestDist) {
        bestDist = dist;
        best = uPalette[i];
      }
    }
    return best;
  }

  vec3 toPerceptualSRGB(vec3 linearRgb) {
    vec3 mapped = acesFilm(linearRgb * uExposure);
    return pow(max(mapped, vec3(0.0)), vec3(1.0 / 2.2));
  }

  void main() {
    // 1. Unified Virtual Pixel Grid (locks Hero, Enemies, 3D Props, Bloom & Environment to identical texel density)
    vec2 pixelRes = max(vec2(1.0), floor(uResolution / max(1.0, uPixelSize)));
    vec2 texelStep = 1.0 / pixelRes;
    vec2 sampleUv = uPixelSize > 1.05
      ? (floor(vUv * pixelRes) + 0.5) / pixelRes
      : vUv;

    vec3 linearScene = texture2D(tDiffuse, sampleUv).rgb;
    vec3 bloomLinear = texture2D(tBloom, sampleUv).rgb;

    // Composite selective HDR Bloom in linear space before ACES Filmic & Hero-style dithering
    // so sword trails, parry rings & biome embers dissolve with authentic dithered glow falloff
    vec3 linearCombined = linearScene + bloomLinear * (uBloomStrength * 0.85);
    vec3 col = toPerceptualSRGB(linearCombined);

    // 2. Unified Hero-Anchored 3-Way Split-Tone Color Harmonization
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float shadowWeight = 1.0 - smoothstep(0.05, 0.45, luma);
    float highlightWeight = smoothstep(0.55, 0.95, luma);
    float midWeight = clamp(1.0 - shadowWeight - highlightWeight, 0.0, 1.0);

    vec3 graded = col;
    graded = mix(graded, graded * uMidtoneTint, midWeight * uGradeStrength * 0.85);
    graded = mix(graded, mix(graded, uShadowTint, 0.46), shadowWeight * uGradeStrength);
    graded = mix(graded, graded * uHighlightTint, highlightWeight * uGradeStrength * 0.9);

    // Constrain chroma & contrast into the Hero sprite's storybook RPG gamut
    // (Allowing glowing emissive pixels slightly extra vibrancy so cyan slashes & torches pop!)
    float bloomEnergy = clamp(dot(bloomLinear, vec3(0.3, 0.55, 0.15)) * uBloomStrength, 0.0, 1.0);
    float gLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
    vec3 chroma = graded - vec3(gLuma);
    float chromaLen = length(chroma);
    float clampedChroma = min(chromaLen, mix(0.56, 0.78, bloomEnergy));
    if (chromaLen > 0.001) {
      graded = vec3(gLuma) + chroma * (clampedChroma / chromaLen);
    }
    graded = mix(vec3(gLuma), graded, uSaturation);
    graded = clamp((graded - 0.5) * uContrast + 0.5, 0.0, 1.0);

    // 3. Unified Hero-Style Pixel Quantization, Cel-Value Banding, 4x4 Bayer Dither & Palette Constraint
    if (uQuantizeMix > 0.01) {
      vec2 ditherCoord = floor(vUv * pixelRes);
      float bayer = bayer4x4(ditherCoord) - 0.5;

      // (a) Cel-shaded luminance value banding with Bayer dither transition
      float curLuma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
      float bands = max(4.0, uLumaBands);
      float ditheredLuma = clamp(curLuma + (bayer * uDitherStrength * 0.85) / bands, 0.0, 1.0);
      float quantLuma = floor(ditheredLuma * bands + 0.5) / bands;
      float lumaRatio = (quantLuma + 0.015) / (curLuma + 0.015);
      vec3 celCol = clamp(graded * mix(1.0, lumaRatio, 0.62), 0.0, 1.0);

      // (b) Per-channel Bayer-dithered pixel-art quantization
      float steps = max(4.0, uColorSteps);
      vec3 ditheredRgb = clamp(celCol + (bayer * uDitherStrength) / steps, 0.0, 1.0);
      vec3 quantRgb = floor(ditheredRgb * steps + 0.5) / steps;

      // (c) Hero + Biome 16-Color Master Palette Constraint (with ordered dither spread)
      if (uPaletteSnap > 0.01) {
        vec3 palInput = clamp(celCol + (bayer * uDitherStrength) * 0.085, 0.0, 1.0);
        vec3 palCol = snapToHeroBiomePalette(palInput);
        float palLuma = dot(palCol, vec3(0.2126, 0.7152, 0.0722));
        vec3 harmonizedPal = clamp(palCol * mix(1.0, (quantLuma + 0.04) / (palLuma + 0.04), 0.45), 0.0, 1.0);
        // Relax palette snap slightly inside intense emissive bloom halos so cyan/amber glows stay luminous
        float effectiveSnap = uPaletteSnap * (1.0 - bloomEnergy * 0.42);
        quantRgb = mix(quantRgb, harmonizedPal, effectiveSnap);
      }

      graded = mix(graded, quantRgb, uQuantizeMix);
    }

    // 4. Unified Hero Warm-Espresso Ink Contour Pass (Depth + Color Edge Reinforcement)
    if (uOutlineStrength > 0.01) {
      float edgeFactor = 0.0;
      float depthFade = 1.0;

      if (uHasDepth > 0.5) {
        float dC = linearizeDepth(texture2D(tDepth, sampleUv).r);
        float dL = linearizeDepth(texture2D(tDepth, sampleUv - vec2(texelStep.x, 0.0)).r);
        float dR = linearizeDepth(texture2D(tDepth, sampleUv + vec2(texelStep.x, 0.0)).r);
        float dU = linearizeDepth(texture2D(tDepth, sampleUv + vec2(0.0, texelStep.y)).r);
        float dD = linearizeDepth(texture2D(tDepth, sampleUv - vec2(0.0, texelStep.y)).r);

        depthFade = 1.0 - smoothstep(23.5, 31.0, dC);

        float maxBackJump = max(
          max(dL - dC, dR - dC),
          max(dU - dC, dD - dC)
        );
        float depthEdge = smoothstep(0.55, 1.65, maxBackJump) * depthFade;
        edgeFactor = max(edgeFactor, depthEdge);
      }

      vec3 cL = toPerceptualSRGB(texture2D(tDiffuse, sampleUv - vec2(texelStep.x, 0.0)).rgb);
      vec3 cR = toPerceptualSRGB(texture2D(tDiffuse, sampleUv + vec2(texelStep.x, 0.0)).rgb);
      vec3 cU = toPerceptualSRGB(texture2D(tDiffuse, sampleUv + vec2(0.0, texelStep.y)).rgb);
      vec3 cD = toPerceptualSRGB(texture2D(tDiffuse, sampleUv - vec2(0.0, texelStep.y)).rgb);
      float gradColor = length(cR - cL) + length(cU - cD);
      float colorEdge = smoothstep(0.58, 1.15, gradColor) * depthFade * 0.45;
      edgeFactor = clamp(max(edgeFactor, colorEdge), 0.0, 1.0);

      // Protect bright glowing slashes, parry rings & torch embers from being dimmed by dark ink
      float brightGuard = 1.0 - smoothstep(0.80, 0.96, max(dot(col, vec3(0.2126, 0.7152, 0.0722)), bloomEnergy * 1.1));
      graded = mix(graded, uInkColor, edgeFactor * uOutlineStrength * brightGuard);
    }

    // Subtle post-ink atmospheric bloom sheen so glowing energy arcs & torches shine softly over edges
    vec3 bloomSRGB = pow(clamp(acesFilm(bloomLinear * uBloomStrength * 0.52), 0.0, 1.0), vec3(1.0 / 2.2));
    graded = clamp(graded + bloomSRGB * 0.24, 0.0, 1.0);

    // 5. Combat Impact Grade Pulse (Parry cyan / Boss crit gold / Hurt crimson)
    graded = mix(graded, clamp(graded + uFlashColor * 0.35, 0.0, 1.0), uFlashAmount);

    // 6. Subtle 2.5D Corridor Vignette
    vec2 centered = vUv - 0.5;
    float vig = 1.0 - dot(centered, centered) * uVignette * 1.35;
    graded *= clamp(vig, 0.68, 1.0);

    gl_FragColor = vec4(graded, 1.0);
  }
`;

export class PostProcessingPass {
  private renderTarget: THREE.WebGLRenderTarget;
  private bloomRT_A: THREE.WebGLRenderTarget;
  private bloomRT_B: THREE.WebGLRenderTarget;
  private dummyDepthTex: THREE.DataTexture | null = null;

  private postCamera: THREE.OrthographicCamera;
  private quadGeo: THREE.PlaneGeometry;

  private prefilterScene: THREE.Scene;
  private prefilterMat: THREE.ShaderMaterial;

  private blurScene: THREE.Scene;
  private blurMat: THREE.ShaderMaterial;

  private postScene: THREE.Scene;
  public material: THREE.ShaderMaterial;

  private bloomTexel = new THREE.Vector2(1 / 256, 1 / 256);
  private biomeBloomBase = 0.75;
  private modeBloomScale = 1.0;
  private currentBiome: BiomeId = 'deep-forest';
  private bossIntensity = 0;

  private tmpShadow = new THREE.Color();
  private tmpHighlight = new THREE.Color();
  private bossShadowTarget = new THREE.Color().setHex(0x280d1a, THREE.LinearSRGBColorSpace);
  private bossHighlightTarget = new THREE.Color().setHex(0xffcca8, THREE.LinearSRGBColorSpace);

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
    const bloomW = Math.max(2, rtW >> 2);
    const bloomH = Math.max(2, rtH >> 2);
    this.bloomTexel.set(1 / bloomW, 1 / bloomH);

    const isWebGL2 = renderer.capabilities.isWebGL2;
    const supportsHalfFloat =
      isWebGL2 &&
      (renderer.extensions.has('EXT_color_buffer_float') ||
        renderer.extensions.has('EXT_color_buffer_half_float'));

    const colorType = supportsHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;

    let depthTexture: THREE.DepthTexture | undefined;
    if (isWebGL2) {
      depthTexture = new THREE.DepthTexture(rtW, rtH);
      depthTexture.type = THREE.UnsignedIntType;
      depthTexture.minFilter = THREE.NearestFilter;
      depthTexture.magFilter = THREE.NearestFilter;
    } else {
      const dummy = new Uint8Array([255, 255, 255, 255]);
      this.dummyDepthTex = new THREE.DataTexture(dummy, 1, 1, THREE.RGBAFormat);
      this.dummyDepthTex.needsUpdate = true;
    }

    this.renderTarget = new THREE.WebGLRenderTarget(rtW, rtH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: colorType,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture,
    });

    const bloomOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: colorType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.bloomRT_A = new THREE.WebGLRenderTarget(bloomW, bloomH, bloomOpts);
    this.bloomRT_B = new THREE.WebGLRenderTarget(bloomW, bloomH, bloomOpts);

    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);

    // 1. Bloom Prefilter Pass
    this.prefilterScene = new THREE.Scene();
    this.prefilterMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        tDepth: { value: depthTexture ?? this.dummyDepthTex },
        uTexelSize: { value: new THREE.Vector2(1 / rtW, 1 / rtH) },
        uHasDepth: { value: isWebGL2 ? 1.0 : 0.0 },
        uHasHdr: { value: supportsHalfFloat ? 1.0 : 0.0 },
        uCameraNear: { value: 0.5 },
        uCameraFar: { value: 160.0 },
        uThreshold: { value: 1.05 },
        uSoftKnee: { value: 0.35 },
      },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: BLOOM_PREFILTER_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const prefilterQuad = new THREE.Mesh(this.quadGeo, this.prefilterMat);
    prefilterQuad.frustumCulled = false;
    this.prefilterScene.add(prefilterQuad);

    // 2. Separable Gaussian Blur Pass
    this.blurScene = new THREE.Scene();
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tInput: { value: this.bloomRT_A.texture },
        uDirection: { value: new THREE.Vector2(1 / bloomW, 0) },
      },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: BLOOM_BLUR_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const blurQuad = new THREE.Mesh(this.quadGeo, this.blurMat);
    blurQuad.frustumCulled = false;
    this.blurScene.add(blurQuad);

    // 3. Unified Hero-Style Composite Pass (with Bloom, Bayer Dither, Palette Constraint & Ink Outlines)
    const paletteUniform = Array.from({ length: 16 }, () =>
      new THREE.Color().setHex(0x1d1414, THREE.LinearSRGBColorSpace),
    );

    this.postScene = new THREE.Scene();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        tDepth: { value: depthTexture ?? this.dummyDepthTex },
        tBloom: { value: this.bloomRT_A.texture },
        uHasDepth: { value: isWebGL2 ? 1.0 : 0.0 },
        uCameraNear: { value: 0.5 },
        uCameraFar: { value: 160.0 },
        uResolution: { value: new THREE.Vector2(Math.max(1, width), Math.max(1, height)) },
        uExposure: { value: 1.08 },
        uBloomStrength: { value: 0.78 },
        uShadowTint: { value: new THREE.Color().setHex(0x182628, THREE.LinearSRGBColorSpace) },
        uMidtoneTint: { value: new THREE.Color().setHex(0xe8f3e6, THREE.LinearSRGBColorSpace) },
        uHighlightTint: { value: new THREE.Color().setHex(0xf7f7d8, THREE.LinearSRGBColorSpace) },
        uInkColor: { value: new THREE.Color().setHex(0x1a1514, THREE.LinearSRGBColorSpace) },
        uGradeStrength: { value: 0.32 },
        uSaturation: { value: 1.06 },
        uContrast: { value: 1.07 },
        uVignette: { value: 0.25 },
        uPixelSize: { value: 2.0 },
        uColorSteps: { value: 12.0 },
        uLumaBands: { value: 9.0 },
        uDitherStrength: { value: 0.85 },
        uQuantizeMix: { value: 0.92 },
        uPaletteSnap: { value: 0.42 },
        uOutlineStrength: { value: 0.72 },
        uPalette: { value: paletteUniform },
        uFlashColor: { value: new THREE.Color().setHex(0x38bdf8, THREE.LinearSRGBColorSpace) },
        uFlashAmount: { value: 0.0 },
      },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
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
    this.currentBiome = biomeId;
    const profile = BIOME_PROFILES[biomeId];
    const u = this.material.uniforms;
    u.uMidtoneTint.value.setHex(profile.midtoneTint, THREE.LinearSRGBColorSpace);
    u.uInkColor.value.setHex(profile.inkColor, THREE.LinearSRGBColorSpace);
    u.uGradeStrength.value = profile.gradeStrength;
    u.uSaturation.value = profile.saturation;

    this.biomeBloomBase = profile.bloomStrength;

    const paletteColors = u.uPalette.value as THREE.Color[];
    for (let i = 0; i < 16; i++) {
      paletteColors[i].setHex(profile.palette16[i], THREE.LinearSRGBColorSpace);
    }

    this.applyBossGradeUniforms();
  }

  public setBossIntensity(level: number): void {
    const clamped = THREE.MathUtils.clamp(level, 0, 1);
    if (Math.abs(clamped - this.bossIntensity) < 0.002) return;
    this.bossIntensity = clamped;
    this.applyBossGradeUniforms();
  }

  private applyBossGradeUniforms(): void {
    const profile = BIOME_PROFILES[this.currentBiome];
    const u = this.material.uniforms;
    const b = this.bossIntensity;

    this.tmpShadow.setHex(profile.shadowTint, THREE.LinearSRGBColorSpace);
    this.tmpShadow.lerp(this.bossShadowTarget, b * 0.75);
    u.uShadowTint.value.copy(this.tmpShadow);

    this.tmpHighlight.setHex(profile.highlightTint, THREE.LinearSRGBColorSpace);
    this.tmpHighlight.lerp(this.bossHighlightTarget, b * 0.65);
    u.uHighlightTint.value.copy(this.tmpHighlight);

    u.uContrast.value = profile.contrast + b * 0.09;
    u.uVignette.value = profile.vignette + b * 0.24;
    u.uBloomStrength.value = this.biomeBloomBase * this.modeBloomScale * (1 + b * 0.38);
  }

  public setMode(mode: ShaderStyleMode): void {
    this.mode = mode;
    const u = this.material.uniforms;

    if (mode === 'hd2d') {
      // Hero Unified (Default): Crisp 2px pixel density, cel value bands, 4x4 Bayer dithering,
      // Hero+Biome 16-color palette harmony, warm espresso ink contours & selective HDR bloom
      u.uPixelSize.value = 2.0;
      u.uColorSteps.value = 12.0;
      u.uLumaBands.value = 9.0;
      u.uDitherStrength.value = 0.85;
      u.uQuantizeMix.value = 0.92;
      u.uPaletteSnap.value = 0.42;
      u.uOutlineStrength.value = 0.72;
      this.modeBloomScale = 1.05;
      this.renderTarget.texture.minFilter = THREE.NearestFilter;
      this.renderTarget.texture.magFilter = THREE.NearestFilter;
    } else if (mode === 'retro16') {
      // Classic 16-Bit Pixel Lock + crisp dithered bloom halo
      u.uPixelSize.value = 3.0;
      u.uColorSteps.value = 8.0;
      u.uLumaBands.value = 6.0;
      u.uDitherStrength.value = 1.0;
      u.uQuantizeMix.value = 1.0;
      u.uPaletteSnap.value = 0.74;
      u.uOutlineStrength.value = 0.85;
      this.modeBloomScale = 0.92;
      this.renderTarget.texture.minFilter = THREE.NearestFilter;
      this.renderTarget.texture.magFilter = THREE.NearestFilter;
    } else if (mode === 'grade') {
      // Crisp Hero Color Grade, Ink Contours & Selective Bloom at native resolution
      u.uPixelSize.value = 1.0;
      u.uColorSteps.value = 24.0;
      u.uLumaBands.value = 12.0;
      u.uDitherStrength.value = 0.35;
      u.uQuantizeMix.value = 0.25;
      u.uPaletteSnap.value = 0.22;
      u.uOutlineStrength.value = 0.48;
      this.modeBloomScale = 1.12;
      this.renderTarget.texture.minFilter = THREE.LinearFilter;
      this.renderTarget.texture.magFilter = THREE.LinearFilter;
    }
    this.applyBossGradeUniforms();
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
    const bloomW = Math.max(2, rtW >> 2);
    const bloomH = Math.max(2, rtH >> 2);

    this.renderTarget.setSize(rtW, rtH);
    this.bloomRT_A.setSize(bloomW, bloomH);
    this.bloomRT_B.setSize(bloomW, bloomH);
    this.bloomTexel.set(1 / bloomW, 1 / bloomH);

    this.prefilterMat.uniforms.uTexelSize.value.set(1 / rtW, 1 / rtH);
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

    if (camera instanceof THREE.PerspectiveCamera) {
      this.material.uniforms.uCameraNear.value = camera.near;
      this.material.uniforms.uCameraFar.value = camera.far;
      this.prefilterMat.uniforms.uCameraNear.value = camera.near;
      this.prefilterMat.uniforms.uCameraFar.value = camera.far;
    }

    // Pass 1: Render entire unified scene (Hero, Enemies, Props, VFX & 5-Layer Environment) into offscreen Color + Depth target
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(scene, camera);

    // Pass 2: Extract selective HDR emissives (cyan slashes, parry rings, biome torches/crystals) into quarter-res bloomRT_A
    renderer.setRenderTarget(this.bloomRT_A);
    renderer.render(this.prefilterScene, this.postCamera);

    // Pass 3 & 4: Dual-radius Separable 9-Tap Gaussian Blur (tight luminous core + lush outer halo)
    const dir = this.blurMat.uniforms.uDirection.value as THREE.Vector2;

    // Tight blur pass (spread = 1.0)
    this.blurMat.uniforms.tInput.value = this.bloomRT_A.texture;
    dir.set(this.bloomTexel.x * 1.1, 0);
    renderer.setRenderTarget(this.bloomRT_B);
    renderer.render(this.blurScene, this.postCamera);

    this.blurMat.uniforms.tInput.value = this.bloomRT_B.texture;
    dir.set(0, this.bloomTexel.y * 1.1);
    renderer.setRenderTarget(this.bloomRT_A);
    renderer.render(this.blurScene, this.postCamera);

    // Wide halo pass (spread = 2.15)
    this.blurMat.uniforms.tInput.value = this.bloomRT_A.texture;
    dir.set(this.bloomTexel.x * 2.15, 0);
    renderer.setRenderTarget(this.bloomRT_B);
    renderer.render(this.blurScene, this.postCamera);

    this.blurMat.uniforms.tInput.value = this.bloomRT_B.texture;
    dir.set(0, this.bloomTexel.y * 2.15);
    renderer.setRenderTarget(this.bloomRT_A);
    renderer.render(this.blurScene, this.postCamera);

    // Pass 5: Final Unified Hero-Style Composite with Bloom, Bayer Dither, 16-Color Palette & Espresso Ink Outlines
    this.material.uniforms.tBloom.value = this.bloomRT_A.texture;
    renderer.setRenderTarget(null);
    renderer.render(this.postScene, this.postCamera);
  }

  public dispose(): void {
    this.renderTarget.depthTexture?.dispose();
    this.renderTarget.dispose();
    this.bloomRT_A.dispose();
    this.bloomRT_B.dispose();
    this.dummyDepthTex?.dispose();
    this.quadGeo.dispose();
    this.prefilterMat.dispose();
    this.blurMat.dispose();
    this.material.dispose();
  }
}
