'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Smartphone } from 'lucide-react';
import { GameEngine } from '../game/GameEngine';
import {
  BIOME_EXECUTION_META,
  BiomeId,
  DifficultyId,
  HudSnapshot,
} from '../game/types';
import { BIOME_ROSTERS } from '../game/BiomeRoster';
import { GameHUD } from './GameHUD';
import { MobileControls } from './MobileControls';

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  biome: 'deep-forest',
  difficulty: 'knight',
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  score: 0,
  highScore: 0,
  combo: 0,
  comboTimer: 0,
  comboMultiplier: 1.0,
  slashStep: 0,
  slashMultiplier: 1.0,
  attackCharge: 0,
  guardCharge: 0,
  execution: {
    ready: false,
    windowTimer: 0,
    active: false,
    activeProgress: 0,
    moveName: BIOME_EXECUTION_META['deep-forest'].name,
    subtitle: BIOME_EXECUTION_META['deep-forest'].subtitle,
    accent: BIOME_EXECUTION_META['deep-forest'].accent,
  },
  progress: 0,
  zone: 1,
  enemiesDefeated: 0,
  parriesCount: 0,
  muted: false,
  debugHitboxes: false,
  shaderMode: 'hd2d',
  boss: {
    active: false,
    introActive: false,
    name: BIOME_ROSTERS['deep-forest'].boss.name,
    title: BIOME_ROSTERS['deep-forest'].boss.title,
    accent: BIOME_ROSTERS['deep-forest'].boss.accentCss,
    hp: BIOME_ROSTERS['deep-forest'].boss.maxHp,
    maxHp: BIOME_ROSTERS['deep-forest'].boss.maxHp,
    phase: 1,
  },
  transition: {
    stage: 'none',
    fadeAlpha: 0,
    timeScale: 1,
    fromBiome: 'deep-forest',
    toBiome: 'green-hills',
    areaIndex: 1,
    totalAreas: 6,
    isCampaignComplete: false,
    performance: null,
  },
  floatingTexts: [],
  offscreenEnemies: [],
  spriteSource: 'procedural',
};

function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const mobileUa =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
  const touchPts = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
  return coarse || mobileUa || (touchPts > 0 && Math.min(window.innerWidth, window.innerHeight) <= 900);
}

async function tryLockLandscapeFullscreen(): Promise<void> {
  try {
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (!document.fullscreenElement) {
      if (typeof docEl.requestFullscreen === 'function') {
        await docEl.requestFullscreen();
      } else if (typeof docEl.webkitRequestFullscreen === 'function') {
        docEl.webkitRequestFullscreen();
      }
    }
  } catch {
    // Fullscreen may be blocked by iframe or browser policy
  }

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (type: string) => Promise<void>;
    };
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('landscape');
    }
  } catch {
    // Orientation lock is optional on iOS Safari / desktop browsers
  }
}

export const GameCanvas: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [webglError, setWebglError] = useState<string | null>(null);

  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(() => detectTouchDevice());
  const [touchControlsEnabled, setTouchControlsEnabled] = useState<boolean>(() =>
    detectTouchDevice(),
  );
  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false,
  );
  const [portraitDismissed, setPortraitDismissed] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Sync orientation, mobile detection & fullscreen state
  useEffect(() => {
    const updateViewport = () => {
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
      if (!portrait) {
        setPortraitDismissed(false);
      }
      const mobileNow = detectTouchDevice();
      setIsMobileDevice(mobileNow);
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const handleFirstTouch = () => {
      setTouchControlsEnabled(true);
      setIsMobileDevice(true);
      engineRef.current?.unlockAudio();
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    document.addEventListener('fullscreenchange', updateViewport);
    window.addEventListener('touchstart', handleFirstTouch, { once: true, passive: true });

    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      document.removeEventListener('fullscreenchange', updateViewport);
      window.removeEventListener('touchstart', handleFirstTouch);
    };
  }, []);

  // Auto-pause active combat if mobile user rotates to portrait so they never take unfair hits
  const showRotatePrompt = isMobileDevice && isPortrait && !portraitDismissed;
  useEffect(() => {
    if (showRotatePrompt && hud.phase === 'playing') {
      engineRef.current?.setPhase('paused');
    }
  }, [showRotatePrompt, hud.phase]);

  useEffect(() => {
    if (typeof window === 'undefined' || !mountRef.current) return;

    let engine: GameEngine | null = null;
    try {
      engine = new GameEngine(mountRef.current, (snapshot) => {
        setHud(snapshot);
      });
      engineRef.current = engine;
    } catch (err) {
      setWebglError(
        err instanceof Error ? err.message : 'Unable to initialize 3D WebGL renderer.',
      );
    }

    return () => {
      if (engine) {
        engine.dispose();
        engineRef.current = null;
      }
    };
  }, []);

  const handleStart = useCallback(() => {
    if (isMobileDevice) {
      void tryLockLandscapeFullscreen();
    }
    engineRef.current?.startGame();
  }, [isMobileDevice]);

  const handleResume = useCallback(() => {
    engineRef.current?.setPhase('playing');
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.setPhase('paused');
  }, []);

  const handleReturnTitle = useCallback(() => {
    engineRef.current?.setPhase('title');
  }, []);

  const handleSelectBiome = useCallback((biome: BiomeId) => {
    engineRef.current?.selectBiome(biome);
  }, []);

  const handleSelectDifficulty = useCallback((difficulty: DifficultyId) => {
    engineRef.current?.selectDifficulty(difficulty);
  }, []);

  const handleAdvanceNextArea = useCallback((targetBiome?: BiomeId) => {
    engineRef.current?.advanceToNextArea(targetBiome);
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleToggleDebug = useCallback(() => {
    engineRef.current?.toggleDebugHitboxes();
  }, []);

  const handleCycleShaderMode = useCallback(() => {
    engineRef.current?.cycleShaderMode();
  }, []);

  const handleUploadSprite = useCallback((file: File) => {
    engineRef.current?.loadCustomSpritesheet(file, 9, 4);
  }, []);

  const handleToggleTouchControls = useCallback(() => {
    setTouchControlsEnabled((prev) => {
      if (prev) engineRef.current?.clearTouchInputs();
      return !prev;
    });
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      void tryLockLandscapeFullscreen();
    }
  }, []);

  // Multi-touch virtual input handlers
  const handleTouchMove = useCallback((left: boolean, right: boolean, down: boolean) => {
    engineRef.current?.setTouchMove(left, right, down);
  }, []);

  const handleTouchJump = useCallback((pressed: boolean) => {
    engineRef.current?.setTouchJump(pressed);
  }, []);

  const handleTouchAttack = useCallback((pressed: boolean) => {
    engineRef.current?.setTouchAttack(pressed);
  }, []);

  const handleTouchGuard = useCallback((pressed: boolean) => {
    engineRef.current?.setTouchGuard(pressed);
  }, []);

  const handleTouchDash = useCallback(() => {
    engineRef.current?.triggerTouchDash();
  }, []);

  const handleTouchExecute = useCallback(() => {
    engineRef.current?.triggerTouchExecute();
  }, []);

  const handleQuickSpell = useCallback((kind: 'wave' | 'nova') => {
    engineRef.current?.triggerQuickSpell(kind);
  }, []);

  const handleClearTouchInputs = useCallback(() => {
    engineRef.current?.clearTouchInputs();
  }, []);

  const showMobileControls =
    touchControlsEnabled &&
    hud.phase === 'playing' &&
    !hud.boss.introActive &&
    hud.transition.stage === 'none' &&
    !showRotatePrompt;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#080b12] touch-none">
      {/* Isolated WebGL mount container so HUD updates never remount the canvas */}
      <div ref={mountRef} className="h-full w-full touch-none" />

      {webglError && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#080b12] p-6 text-center">
          <div className="max-w-md rounded-xl border border-white/15 bg-slate-900 p-6">
            <h2 className="font-display mb-2 text-xl font-bold text-white">
              WebGL Renderer Unavailable
            </h2>
            <p className="text-sm text-slate-300">{webglError}</p>
          </div>
        </div>
      )}

      <GameHUD
        hud={hud}
        touchControlsEnabled={touchControlsEnabled}
        isFullscreen={isFullscreen}
        onStart={handleStart}
        onResume={handleResume}
        onPause={handlePause}
        onReturnTitle={handleReturnTitle}
        onSelectBiome={handleSelectBiome}
        onSelectDifficulty={handleSelectDifficulty}
        onAdvanceNextArea={handleAdvanceNextArea}
        onToggleMute={handleToggleMute}
        onToggleDebug={handleToggleDebug}
        onCycleShaderMode={handleCycleShaderMode}
        onUploadSprite={handleUploadSprite}
        onToggleTouchControls={handleToggleTouchControls}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* DEDICATED MOBILE LANDSCAPE MULTI-TOUCH CONTROLS */}
      {showMobileControls && (
        <MobileControls
          hud={hud}
          onMove={handleTouchMove}
          onJump={handleTouchJump}
          onAttack={handleTouchAttack}
          onGuard={handleTouchGuard}
          onDash={handleTouchDash}
          onExecute={handleTouchExecute}
          onQuickSpell={handleQuickSpell}
          onClearInputs={handleClearTouchInputs}
        />
      )}

      {/* LANDSCAPE ORIENTATION PROMPT FOR MOBILE PORTRAIT */}
      {showRotatePrompt && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#060910]/96 px-6 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-sky-400/35 bg-sky-500/10 text-sky-300 shadow-[0_0_32px_rgba(56,189,248,0.22)]">
            <Smartphone className="h-10 w-10 animate-phone-rotate" />
          </div>
          <h2 className="font-display mb-2 text-2xl font-extrabold tracking-wider text-white">
            Gire para Horizontal
          </h2>
          <p className="mb-6 max-w-xs text-sm text-slate-300">
            Aetherblade Mobile foi otimizado para visão horizontal com controles de combate em tela cheia.
          </p>
          <div className="flex flex-col items-center gap-3 w-full max-w-[240px]">
            <button
              type="button"
              onClick={() => void tryLockLandscapeFullscreen()}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 text-sm font-bold text-slate-950 shadow-lg active:scale-95 transition-transform cursor-pointer"
            >
              <Maximize2 className="h-4 w-4" />
              Tela Cheia Horizontal
            </button>
            <button
              type="button"
              onClick={() => setPortraitDismissed(true)}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 text-xs font-semibold text-slate-300 active:scale-95 transition-transform cursor-pointer"
            >
              Continuar mesmo assim
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameCanvas;
