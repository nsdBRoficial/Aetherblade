export type BiomeId =
  | 'deep-forest'
  | 'green-hills'
  | 'hare-canyon'
  | 'bamboo-forest'
  | 'winter'
  | 'wheat-field';

export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover' | 'victory';

export type ShaderStyleMode = 'hd2d' | 'retro16' | 'grade' | 'off';

export type HeroAnimState =
  | 'IDLE'
  | 'RUN'
  | 'ATTACK_1'
  | 'ATTACK_2'
  | 'ATTACK_3'
  | 'GUARD'
  | 'PARRY'
  | 'JUMP'
  | 'AIR_ATTACK'
  | 'FALL'
  | 'HURT'
  | 'DEAD';

export type EnemyType = 'grunt' | 'ranger' | 'flyer' | 'brute' | 'boss';

export interface BiomePalette {
  id: BiomeId;
  name: string;
  subtitle: string;
  bossName: string;
  bossTitle: string;
  skyTop: string;
  skyBottom: string;
  fogColor: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  ambientColor: number;
  ambientIntensity: number;
  groundTop: number;
  groundSide: number;
  groundTrim: string;
  groundSoil: string;
  platformTop: number;
  platformSide: number;
  farMountain: number;
  midFoliage: number;
  midTrunk: number;
  nearAccent: number;
  foregroundColor: number;
  particleColor: number;
  particleStyle: 'leaf' | 'pollen' | 'dust' | 'snow' | 'petal';
  torchColor: number;
  hudAccent: string;
}

export interface GroundSegment {
  xStart: number;
  xEnd: number;
  y: number;
}

export interface PlatformBox {
  id: string;
  x: number; // center X
  y: number; // top surface Y
  width: number;
  thickness: number;
  oneWay: boolean;
}

export interface AABB {
  x: number; // center X
  y: number; // bottom Y
  width: number;
  height: number;
}

export interface FloatingDamageText {
  id: number;
  text: string;
  screenX: number;
  screenY: number;
  color: string;
  scale: number;
  age: number;
  maxAge: number;
}

export interface BossHudState {
  active: boolean;
  introActive: boolean;
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  phase: 1 | 2;
  accent: string;
}

export type StageTransitionStage =
  | 'none'
  | 'celebrate'
  | 'intermission'
  | 'departing'
  | 'arriving';

export type PerformanceRank = 'S' | 'A' | 'B' | 'C';

export interface VictoryPerformanceSummary {
  clearTimeSeconds: number;
  maxCombo: number;
  enemiesDefeated: number;
  parriesCount: number;
  hpRemainingPct: number;
  damageTakenHits: number;
  clearBonus: number;
  rank: PerformanceRank;
  rankTitle: string;
}

export interface StageTransitionState {
  stage: StageTransitionStage;
  fadeAlpha: number; // 0..1 smooth cross-map cinema curtain
  timeScale: number; // 0.22..1.0 dramatic slow-motion dilation during boss death zoom-out
  fromBiome: BiomeId;
  toBiome: BiomeId;
  areaIndex: number; // 1-based index of current/incoming area
  totalAreas: number;
  isCampaignComplete: boolean;
  performance: VictoryPerformanceSummary | null;
}

export interface OffscreenEnemyIndicator {
  id: number;
  type: EnemyType;
  label: string;
  accent: string;
  side: 'left' | 'right';
  screenY: number;
  distance: number;
  urgency: number; // 0..1 proximity & aggro urgency
  aggro: boolean;
}

export type DifficultyId = 'story' | 'knight' | 'hunter' | 'nightmare';

export interface DifficultyConfig {
  id: DifficultyId;
  name: string;
  subtitle: string;
  playerDamageMult: number;
  enemyAggression: number;
  enemyCooldownMult: number;
  scoreMult: number;
  accent: string;
}

export const DIFFICULTY_ORDER: DifficultyId[] = ['story', 'knight', 'hunter', 'nightmare'];

export const DIFFICULTY_PRESETS: Record<DifficultyId, DifficultyConfig> = {
  story: {
    id: 'story',
    name: 'Story',
    subtitle: 'Forgiving hits & calmer foes',
    playerDamageMult: 0.65,
    enemyAggression: 0.78,
    enemyCooldownMult: 1.28,
    scoreMult: 0.85,
    accent: '#34d399',
  },
  knight: {
    id: 'knight',
    name: 'Knight',
    subtitle: 'Balanced classic challenge',
    playerDamageMult: 1.0,
    enemyAggression: 1.0,
    enemyCooldownMult: 1.0,
    scoreMult: 1.0,
    accent: '#38bdf8',
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    subtitle: 'Fierce foes & punishing hits',
    playerDamageMult: 1.35,
    enemyAggression: 1.22,
    enemyCooldownMult: 0.76,
    scoreMult: 1.25,
    accent: '#fb923c',
  },
  nightmare: {
    id: 'nightmare',
    name: 'Nightmare',
    subtitle: 'Relentless aggression & lethal blows',
    playerDamageMult: 1.75,
    enemyAggression: 1.38,
    enemyCooldownMult: 0.58,
    scoreMult: 1.6,
    accent: '#f43f5e',
  },
};

export function getComboDamageMultiplier(combo: number): { mult: number; tierLabel: string } {
  if (combo >= 35) return { mult: 2.4, tierLabel: 'OVERDRIVE' };
  if (combo >= 20) return { mult: 1.95, tierLabel: 'AETHERLORD' };
  if (combo >= 10) return { mult: 1.55, tierLabel: 'RELENTLESS' };
  if (combo >= 5) return { mult: 1.25, tierLabel: 'FURY' };
  return { mult: 1.0, tierLabel: 'CHAIN' };
}

export interface ExecutionHudState {
  ready: boolean;
  windowTimer: number; // 0..1 remaining execution trigger window
  active: boolean;
  activeProgress: number; // 0..1 elapsed progress during Execution sequence
  moveName: string;
  subtitle: string;
  accent: string;
}

export interface BiomeExecutionMeta {
  name: string;
  subtitle: string;
  primaryHex: number;
  secondaryHex: number;
  accent: string;
}

export const BIOME_EXECUTION_META: Record<BiomeId, BiomeExecutionMeta> = {
  'deep-forest': {
    name: 'Emerald Thornstorm',
    subtitle: 'Canopy Vortex & Briar Lances',
    primaryHex: 0x34d399,
    secondaryHex: 0xa7f3d0,
    accent: '#34d399',
  },
  'green-hills': {
    name: 'Sakura Tempest',
    subtitle: 'Blossom Cyclone & Sunburst',
    primaryHex: 0xf472b6,
    secondaryHex: 0xfde047,
    accent: '#f472b6',
  },
  'hare-canyon': {
    name: 'Crimson Meteorfall',
    subtitle: 'Volcanic Barrage & Cinder Quake',
    primaryHex: 0xf97316,
    secondaryHex: 0xfef08a,
    accent: '#fb923c',
  },
  'bamboo-forest': {
    name: 'Jade Judgement',
    subtitle: 'Dimensional Cross-Cuts',
    primaryHex: 0xa3e635,
    secondaryHex: 0xfef08a,
    accent: '#a3e635',
  },
  winter: {
    name: 'Glacial Shatter',
    subtitle: 'Cryo Spires & Diamond Burst',
    primaryHex: 0x38bdf8,
    secondaryHex: 0xe0f2fe,
    accent: '#38bdf8',
  },
  'wheat-field': {
    name: 'Solaris Harvest',
    subtitle: 'Dawn Scythes & Golden Halo',
    primaryHex: 0xfacc15,
    secondaryHex: 0xfffbeb,
    accent: '#facc15',
  },
};

export interface HudSnapshot {
  phase: GamePhase;
  biome: BiomeId;
  difficulty: DifficultyId;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  score: number;
  highScore: number;
  combo: number;
  comboTimer: number; // 0..1 normalized
  comboMultiplier: number;
  slashStep: number;
  slashMultiplier: number;
  attackCharge: number; // 0..1 concentrated sword magic charge
  guardCharge: number; // 0..1 concentrated shield magic charge
  execution: ExecutionHudState;
  progress: number; // 0..1 along X=0..180
  zone: 1 | 2 | 3 | 4;
  enemiesDefeated: number;
  parriesCount: number;
  muted: boolean;
  debugHitboxes: boolean;
  shaderMode: ShaderStyleMode;
  boss: BossHudState;
  transition: StageTransitionState;
  floatingTexts: FloatingDamageText[];
  offscreenEnemies: OffscreenEnemyIndicator[];
  spriteSource: 'attached' | 'custom' | 'procedural';
}

export const BIOME_ORDER: BiomeId[] = [
  'deep-forest',
  'green-hills',
  'hare-canyon',
  'bamboo-forest',
  'winter',
  'wheat-field',
];

export const LEVEL_LENGTH = 180;
export const BOSS_TRIGGER_X = 148;
export const BOSS_ARENA_MIN_X = 146;
export const BOSS_ARENA_MAX_X = 181;
export const GROUND_Y = 0;

export const BIOME_PALETTES: Record<BiomeId, BiomePalette> = {
  'deep-forest': {
    id: 'deep-forest',
    name: 'Deep Forest',
    subtitle: 'Emerald Canopy & Ancient Roots',
    bossName: 'Sylvarok',
    bossTitle: 'Warden of the Overgrown Sanctum',
    skyTop: '#0d3b3e',
    skyBottom: '#65b891',
    fogColor: 0x266556,
    fogDensity: 0.017,
    sunColor: 0xd9ffd6,
    sunIntensity: 1.75,
    hemiSky: 0x72d4a5,
    hemiGround: 0x1e2e20,
    ambientColor: 0x2a5243,
    ambientIntensity: 0.55,
    groundTop: 0x3b6e38,
    groundSide: 0x453526,
    groundTrim: '#4c8f41',
    groundSoil: '#3e2d20',
    platformTop: 0x45803d,
    platformSide: 0x4e3c2c,
    farMountain: 0x164a3e,
    midFoliage: 0x1e5c3b,
    midTrunk: 0x3d2b1f,
    nearAccent: 0x2d7a47,
    foregroundColor: 0x0b1a14,
    particleColor: 0x7df08d,
    particleStyle: 'leaf',
    torchColor: 0x38f2c2,
    hudAccent: '#34d399',
  },
  'green-hills': {
    id: 'green-hills',
    name: 'Green Hills',
    subtitle: 'Sunlit Meadows & Floating Islets',
    bossName: 'Aurelion',
    bossTitle: 'Highland Iron Colossus',
    skyTop: '#1d7be0',
    skyBottom: '#b4ecff',
    fogColor: 0x9cdcf5,
    fogDensity: 0.011,
    sunColor: 0xfff4d6,
    sunIntensity: 2.0,
    hemiSky: 0x99dcff,
    hemiGround: 0x4b702f,
    ambientColor: 0x6ba6c9,
    ambientIntensity: 0.55,
    groundTop: 0x62b53c,
    groundSide: 0x6e4f34,
    groundTrim: '#75cc47',
    groundSoil: '#694a2e',
    platformTop: 0x6bc244,
    platformSide: 0x785638,
    farMountain: 0x5ca4a9,
    midFoliage: 0x3e8c35,
    midTrunk: 0x6b472b,
    nearAccent: 0x4ca33e,
    foregroundColor: 0x172b15,
    particleColor: 0xfff8c7,
    particleStyle: 'pollen',
    torchColor: 0xffb347,
    hudAccent: '#4ade80',
  },
  'hare-canyon': {
    id: 'hare-canyon',
    name: 'Hare Canyon',
    subtitle: 'Crimson Mesas & Saguaro Cliffs',
    bossName: 'Kargath',
    bossTitle: 'Redstone Ravager',
    skyTop: '#1868b8',
    skyBottom: '#9fd7f0',
    fogColor: 0xd49b79,
    fogDensity: 0.012,
    sunColor: 0xffddb0,
    sunIntensity: 2.15,
    hemiSky: 0x8cc9eb,
    hemiGround: 0x8f4025,
    ambientColor: 0xb06e4d,
    ambientIntensity: 0.52,
    groundTop: 0xc95e3a,
    groundSide: 0x853721,
    groundTrim: '#d96e45',
    groundSoil: '#7a311e',
    platformTop: 0xd46a42,
    platformSide: 0x8c3a23,
    farMountain: 0xa66b56,
    midFoliage: 0x5a8c45,
    midTrunk: 0xb54b2c,
    nearAccent: 0x629648,
    foregroundColor: 0x30140d,
    particleColor: 0xffcf99,
    particleStyle: 'dust',
    torchColor: 0xff7733,
    hudAccent: '#fb923c',
  },
  'bamboo-forest': {
    id: 'bamboo-forest',
    name: 'Bamboo Forest',
    subtitle: 'Golden Stalks & Misty Shrines',
    bossName: 'Kenshiro',
    bossTitle: 'Jade Blade Shogun',
    skyTop: '#6b8c42',
    skyBottom: '#e3e896',
    fogColor: 0xc4cc78,
    fogDensity: 0.016,
    sunColor: 0xfff7c2,
    sunIntensity: 1.85,
    hemiSky: 0xdce68a,
    hemiGround: 0x3b4d24,
    ambientColor: 0x7d8f44,
    ambientIntensity: 0.55,
    groundTop: 0x5f7d32,
    groundSide: 0x3b3528,
    groundTrim: '#77993c',
    groundSoil: '#363024',
    platformTop: 0x6e8c3a,
    platformSide: 0x4a4232,
    farMountain: 0x87994c,
    midFoliage: 0x8ea842,
    midTrunk: 0x99ab48,
    nearAccent: 0x4b702c,
    foregroundColor: 0x19210f,
    particleColor: 0xdcf073,
    particleStyle: 'leaf',
    torchColor: 0xffcf54,
    hudAccent: '#a3e635',
  },
  winter: {
    id: 'winter',
    name: 'Winter',
    subtitle: 'Glacial Peaks & Frozen Pines',
    bossName: 'Borealis',
    bossTitle: 'Frostbound Executioner',
    skyTop: '#16459e',
    skyBottom: '#a8dcfa',
    fogColor: 0xb8dcf2,
    fogDensity: 0.013,
    sunColor: 0xe6f6ff,
    sunIntensity: 1.9,
    hemiSky: 0xbadfff,
    hemiGround: 0x4b637d,
    ambientColor: 0x7ca2c9,
    ambientIntensity: 0.62,
    groundTop: 0xe2f0fa,
    groundSide: 0x5c7794,
    groundTrim: '#f0f8ff',
    groundSoil: '#4f6985',
    platformTop: 0xd9ecfa,
    platformSide: 0x526e8c,
    farMountain: 0x7ca6cf,
    midFoliage: 0xcde3f5,
    midTrunk: 0x47596b,
    nearAccent: 0x9cc7e6,
    foregroundColor: 0x152233,
    particleColor: 0xffffff,
    particleStyle: 'snow',
    torchColor: 0x5cd6ff,
    hudAccent: '#38bdf8',
  },
  'wheat-field': {
    id: 'wheat-field',
    name: 'Wheat Field',
    subtitle: 'Golden Harvest & Watchtowers',
    bossName: 'Solarius',
    bossTitle: 'Harvester of Dawn',
    skyTop: '#2475d6',
    skyBottom: '#c9e8ff',
    fogColor: 0xe8d59b,
    fogDensity: 0.011,
    sunColor: 0xffe9a8,
    sunIntensity: 2.05,
    hemiSky: 0xb5dfff,
    hemiGround: 0x8f6b24,
    ambientColor: 0xb89c56,
    ambientIntensity: 0.56,
    groundTop: 0xd4a437,
    groundSide: 0x6e4b26,
    groundTrim: '#e5b842',
    groundSoil: '#5e3f1f',
    platformTop: 0xc9962c,
    platformSide: 0x6b4723,
    farMountain: 0xd4b66a,
    midFoliage: 0xe0b53f,
    midTrunk: 0x7d4c27,
    nearAccent: 0xf2c938,
    foregroundColor: 0x2b1d0d,
    particleColor: 0xffe27a,
    particleStyle: 'petal',
    torchColor: 0xffaa33,
    hudAccent: '#facc15',
  },
};
