'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/GameEngine';
import {
  BIOME_EXECUTION_META,
  BiomeId,
  DifficultyId,
  HudSnapshot,
} from '../game/types';
import { BIOME_ROSTERS } from '../game/BiomeRoster';
import { GameHUD } from './GameHUD';

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

export const GameCanvas: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [webglError, setWebglError] = useState<string | null>(null);

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
    engineRef.current?.startGame();
  }, []);

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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#080b12]">
      {/* Isolated WebGL mount container so HUD updates never remount the canvas */}
      <div ref={mountRef} className="h-full w-full" />

      {webglError && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#080b12] p-6 text-center">
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
      />
    </div>
  );
};

export default GameCanvas;
