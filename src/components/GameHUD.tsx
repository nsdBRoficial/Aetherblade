'use client';

import React, { useRef } from 'react';
import {
  ArrowRight,
  Check,
  Gamepad2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Skull,
  Swords,
  Upload,
  Volume2,
  VolumeX,
  Box,
  Palette,
} from 'lucide-react';
import {
  BIOME_ORDER,
  BIOME_PALETTES,
  BiomeId,
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESETS,
  DifficultyId,
  HudSnapshot,
  ShaderStyleMode,
} from '../game/types';
import { BIOME_ROSTERS } from '../game/BiomeRoster';
import { ComboCounter } from './ComboCounter';
import { OffscreenEnemyIndicators } from './OffscreenEnemyIndicators';

interface GameHUDProps {
  hud: HudSnapshot;
  touchControlsEnabled: boolean;
  isFullscreen: boolean;
  onStart: () => void;
  onResume: () => void;
  onPause: () => void;
  onReturnTitle: () => void;
  onSelectBiome: (biome: BiomeId) => void;
  onSelectDifficulty: (difficulty: DifficultyId) => void;
  onAdvanceNextArea: (targetBiome?: BiomeId) => void;
  onToggleMute: () => void;
  onToggleDebug: () => void;
  onCycleShaderMode: () => void;
  onUploadSprite: (file: File) => void;
  onToggleTouchControls: () => void;
  onToggleFullscreen: () => void;
}

const SHADER_MODE_LABELS: Record<ShaderStyleMode, string> = {
  hd2d: 'Hero Unified',
  retro16: '16-Bit Pixel',
  grade: 'Hero Grade',
  off: 'Filter Off',
};

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  touchControlsEnabled,
  isFullscreen,
  onStart,
  onResume,
  onPause,
  onReturnTitle,
  onSelectBiome,
  onSelectDifficulty,
  onAdvanceNextArea,
  onToggleMute,
  onToggleDebug,
  onCycleShaderMode,
  onUploadSprite,
  onToggleTouchControls,
  onToggleFullscreen,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const palette = BIOME_PALETTES[hud.biome];
  const roster = BIOME_ROSTERS[hud.biome];
  const diffConfig = DIFFICULTY_PRESETS[hud.difficulty];
  const nextPalette = BIOME_PALETTES[hud.transition.toBiome];
  const currentBiomeIdx = Math.max(0, BIOME_ORDER.indexOf(hud.biome));
  const isTransitioning = hud.transition.stage !== 'none';

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const stamPct = Math.max(0, Math.min(100, (hud.stamina / hud.maxStamina) * 100));
  const activeChargeKind: 'attack' | 'guard' | null =
    hud.attackCharge > 0.03 ? 'attack' : hud.guardCharge > 0.03 ? 'guard' : null;
  const activeChargeVal = activeChargeKind === 'attack' ? hud.attackCharge : hud.guardCharge;
  const bossPct =
    hud.boss.maxHp > 0
      ? Math.max(0, Math.min(100, (hud.boss.hp / hud.boss.maxHp) * 100))
      : 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadSprite(file);
      e.target.value = '';
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden select-none">
      {/* Hidden custom spritesheet input for classroom/student sprite testing */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* FLOATING 3D-PROJECTED DAMAGE & PARRY NUMBERS */}
      {hud.phase === 'playing' &&
        hud.floatingTexts.map((ft) => {
          const opacity = Math.max(0, 1 - ft.age / ft.maxAge);
          return (
            <div
              key={ft.id}
              className="font-mono-num fixed left-0 top-0 font-bold tracking-tight whitespace-nowrap"
              style={{
                color: ft.color,
                opacity,
                transform: `translate3d(${ft.screenX}px, ${ft.screenY}px, 0) translate(-50%, -50%) scale(${ft.scale})`,
                textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.75)',
                fontSize: '15px',
              }}
            >
              {ft.text}
            </div>
          );
        })}

      {/* DIRECTIONAL OFF-SCREEN ENEMY THREAT INDICATORS */}
      {hud.phase === 'playing' && !hud.boss.introActive && !isTransitioning && (
        <OffscreenEnemyIndicators indicators={hud.offscreenEnemies} />
      )}

      {/* IN-GAME PERIMETER HUD (hidden briefly during Boss Intro & Victory/Area Transitions) */}
      {hud.phase !== 'title' && !hud.boss.introActive && !isTransitioning && (
        <>
          <div className="safe-top safe-x flex items-start justify-between gap-2 sm:gap-4 sm:px-5 sm:pt-4">
            {/* Top-Left: Vitality, Stamina & Concentrated Magic Charge Cluster (compact on mobile landscape) */}
            <div
              className={`rounded-lg border border-white/12 bg-[#090d16]/86 shadow-lg ${
                touchControlsEnabled
                  ? 'w-[188px] px-2.5 py-1.5 sm:w-[248px] sm:px-3.5 sm:py-2'
                  : 'w-[220px] px-3 py-2 sm:w-[264px] sm:px-3.5 sm:py-2.5'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-1 text-[10px] sm:text-xs text-slate-300">
                <span className="truncate font-semibold tracking-wide text-slate-100">
                  {palette.name}
                </span>
                <span className="font-mono-num shrink-0 text-slate-400">
                  Z{hud.zone}/4 ·{' '}
                  <span style={{ color: diffConfig.accent }} className="font-semibold">
                    {diffConfig.name}
                  </span>
                </span>
              </div>

              {/* HP Bar */}
              <div className="mb-1.5">
                <div className="mb-0.5 flex items-center justify-between text-[10px] sm:text-[11px]">
                  <span className="font-medium text-rose-300">HP</span>
                  <span className="font-mono-num font-semibold text-slate-100">
                    {hud.hp}/{hud.maxHp}
                  </span>
                </div>
                <div className="h-2 sm:h-2.5 w-full overflow-hidden rounded-sm bg-slate-900/95 ring-1 ring-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-rose-700 via-rose-500 to-rose-400 transition-transform duration-150 ease-out origin-left"
                    style={{ transform: `scaleX(${hpPct / 100})` }}
                  />
                </div>
              </div>

              {/* Stamina Bar */}
              <div>
                <div className="mb-0.5 flex items-center justify-between text-[10px] sm:text-[11px]">
                  <span className="font-medium text-sky-300">SP</span>
                  <span className="font-mono-num text-slate-300">{hud.stamina}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-900/95 ring-1 ring-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-sky-600 to-cyan-300 transition-transform duration-100 ease-out origin-left"
                    style={{ transform: `scaleX(${stamPct / 100})` }}
                  />
                </div>
              </div>

              {/* Concentrated Magic Charge Meter (visible only while channeling M1 or M2) */}
              {activeChargeKind && (
                <div className="mt-1.5 border-t border-white/10 pt-1">
                  <div className="mb-0.5 flex items-center justify-between text-[10px]">
                    <span
                      className={`truncate font-semibold tracking-wide ${
                        activeChargeVal >= 0.95
                          ? 'text-amber-300'
                          : activeChargeKind === 'attack'
                            ? 'text-cyan-300'
                            : 'text-fuchsia-300'
                      }`}
                    >
                      {activeChargeKind === 'attack'
                        ? activeChargeVal >= 0.95
                          ? 'WAVE READY!'
                          : 'Aether Wave'
                        : activeChargeVal >= 0.95
                          ? 'NOVA READY!'
                          : 'Aegis Nova'}
                    </span>
                    <span className="font-mono-num font-bold text-slate-200">
                      {Math.round(activeChargeVal * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-900 ring-1 ring-white/15">
                    <div
                      className={`h-full origin-left ${
                        activeChargeVal >= 0.95
                          ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-white'
                          : activeChargeKind === 'attack'
                            ? 'bg-gradient-to-r from-sky-500 via-cyan-300 to-amber-200'
                            : 'bg-gradient-to-r from-purple-600 via-fuchsia-400 to-amber-200'
                      }`}
                      style={{ transform: `scaleX(${Math.max(0, Math.min(1, activeChargeVal))})` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Top-Center: Stage Progress Map Bar (or Boss Health Bar on Mobile Touch Mode!) */}
            {touchControlsEnabled && hud.boss.active && hud.phase === 'playing' ? (
              <div
                className="flex flex-col rounded-lg border bg-[#090d16]/90 px-3 py-1.5 shadow-xl w-[min(320px,42vw)]"
                style={{ borderColor: `${hud.boss.accent}66` }}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span
                    className="font-display truncate text-xs sm:text-sm font-bold tracking-wider"
                    style={{ color: hud.boss.accent }}
                  >
                    {hud.boss.name}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                    {hud.boss.phase === 2 && (
                      <span className="font-bold text-orange-400">II</span>
                    )}
                    <span className="font-mono-num text-slate-200">
                      {hud.boss.hp}/{hud.boss.maxHp}
                    </span>
                  </div>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-sm bg-slate-900 ring-1 ring-white/15">
                  <div
                    className="h-full origin-left transition-transform duration-150 ease-out"
                    style={{
                      transform: `scaleX(${bossPct / 100})`,
                      background:
                        hud.boss.phase === 2
                          ? `linear-gradient(90deg, #b91c1c, ${hud.boss.accent}, #fef08a)`
                          : `linear-gradient(90deg, #9f1239, ${hud.boss.accent})`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                className={`hidden sm:flex flex-col items-center rounded-lg border border-white/12 bg-[#090d16]/84 shadow-lg ${
                  touchControlsEnabled
                    ? 'w-[210px] md:w-[290px] px-3 py-1.5'
                    : 'w-[260px] md:w-[340px] px-4 py-2.5'
                }`}
              >
                <div className="mb-1 flex w-full items-center justify-between text-[10px] sm:text-[11px] text-slate-300">
                  <span>Stage</span>
                  <span className="font-mono-num text-slate-200">
                    {Math.round(hud.progress * 100)}%
                  </span>
                </div>
                <div className="relative h-1.5 sm:h-2 w-full rounded-sm bg-slate-800/95">
                  <div className="absolute left-1/4 top-0 h-full w-px bg-slate-600/80" />
                  <div className="absolute left-1/2 top-0 h-full w-px bg-slate-600/80" />
                  <div className="absolute left-[82%] top-0 h-full w-px bg-amber-400/70" />
                  <div
                    className="h-full rounded-sm transition-transform duration-150 origin-left"
                    style={{
                      backgroundColor: palette.hudAccent,
                      transform: `scaleX(${hud.progress})`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 h-2.5 w-2.5 sm:h-3 sm:w-3 -translate-y-1/2 -translate-x-1/2 rotate-45 border border-white bg-sky-400 shadow"
                    style={{ left: `${hud.progress * 100}%` }}
                  />
                </div>
                {!touchControlsEnabled && (
                  <div className="mt-1.5 flex w-full items-center justify-between text-[10px] text-slate-400">
                    <span>Outskirts</span>
                    <span>Ridge</span>
                    <span>Gauntlet</span>
                    <span className="flex items-center gap-1 text-amber-300 font-medium">
                      <Skull className="h-3 w-3" /> Boss
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Top-Right: Score, Combo & Utility Controls */}
            <div className="flex flex-col items-end gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="rounded-lg border border-white/12 bg-[#090d16]/86 px-2.5 py-1 sm:px-3.5 sm:py-2 text-right shadow-lg">
                  <div className="text-[9px] sm:text-[10px] tracking-wide text-slate-400">Score</div>
                  <div className="font-mono-num text-xs sm:text-base font-bold leading-tight text-slate-100">
                    {hud.score.toLocaleString()}
                  </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/12 bg-[#090d16]/86 p-1 sm:p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={onToggleTouchControls}
                    title={touchControlsEnabled ? 'Hide Mobile Touch Controls' : 'Show Mobile Touch Controls'}
                    className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      touchControlsEnabled
                        ? 'bg-sky-500/25 text-sky-300 ring-1 ring-sky-400/50'
                        : 'text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Gamepad2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onToggleFullscreen}
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Landscape'}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-4 w-4 text-sky-300" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onCycleShaderMode}
                    title={`Visual Filter: ${SHADER_MODE_LABELS[hud.shaderMode]} (F3)`}
                    className={`hidden sm:flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      hud.shaderMode !== 'off'
                        ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/45 hover:bg-sky-500/30'
                        : 'text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Palette className="h-4 w-4" />
                  </button>
                  {!touchControlsEnabled && (
                    <button
                      type="button"
                      onClick={onToggleDebug}
                      title="Toggle Hitbox Debug (F2)"
                      className={`hidden md:flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
                        hud.debugHitboxes
                          ? 'bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/50'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Box className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onToggleMute}
                    title={hud.muted ? 'Unmute Audio' : 'Mute Audio'}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    {hud.muted ? (
                      <VolumeX className="h-4 w-4 text-rose-400" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={hud.phase === 'paused' ? onResume : onPause}
                    title="Pause (Esc)"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    {hud.phase === 'paused' ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Active Visual Combo Counter (scales & pulses with glow as hits chain) */}
              <ComboCounter
                combo={hud.combo}
                comboTimer={hud.comboTimer}
                comboMultiplier={hud.comboMultiplier}
                slashStep={hud.slashStep}
                slashMultiplier={hud.slashMultiplier}
              />
            </div>
          </div>

          {/* F2 Hitbox Debug Strip (only shown when F2 toggled ON) */}
          {hud.debugHitboxes && !touchControlsEnabled && (
            <div className="pointer-events-auto fixed left-5 bottom-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-400/30 bg-[#090d16]/90 px-3.5 py-2 text-xs text-slate-200 shadow-lg">
              <span className="font-semibold text-emerald-300">F2 Debug</span>
              <span className="text-slate-400">·</span>
              <span className="text-emerald-400">Green: Player</span>
              <span className="text-rose-400">Red: Sword</span>
              <span className="text-amber-300">Yellow: Enemy</span>
              <span className="text-sky-400">Blue: Platform</span>
              <span className="text-slate-400">·</span>
              <span className="text-sky-300">F3: {SHADER_MODE_LABELS[hud.shaderMode]}</span>
              <span className="text-slate-400">·</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                Load Custom hero.png
              </button>
            </div>
          )}

          {/* BOTTOM BOSS HEALTH BAR (Desktop mode — on Touch Mode it lives cleanly in Top-Center!) */}
          {!touchControlsEnabled && hud.boss.active && hud.phase === 'playing' && (
            <div
              className="fixed bottom-5 left-1/2 w-[min(640px,90vw)] -translate-x-1/2 rounded-lg border bg-[#090d16]/92 px-5 py-3 shadow-2xl"
              style={{ borderColor: `${hud.boss.accent}59` }}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-2.5">
                  <span
                    className="font-display text-lg font-bold tracking-wider"
                    style={{ color: hud.boss.accent }}
                  >
                    {hud.boss.name}
                  </span>
                  <span className="text-xs text-slate-400">{hud.boss.title}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {hud.boss.phase === 2 && (
                    <span className="font-semibold text-orange-400">Phase II</span>
                  )}
                  <span className="font-mono-num text-slate-200">
                    {hud.boss.hp} / {hud.boss.maxHp}
                  </span>
                </div>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-sm bg-slate-900 ring-1 ring-white/15">
                <div
                  className="h-full origin-left transition-transform duration-150 ease-out"
                  style={{
                    transform: `scaleX(${bossPct / 100})`,
                    background:
                      hud.boss.phase === 2
                        ? `linear-gradient(90deg, #b91c1c, ${hud.boss.accent}, #fef08a)`
                        : `linear-gradient(90deg, #9f1239, ${hud.boss.accent})`,
                  }}
                />
              </div>
            </div>
          )}

          {/* EXECUTION READY PROMPT (top-center on Touch Mode so bottom controls stay unobstructed) */}
          {hud.phase === 'playing' &&
            hud.execution.ready &&
            !hud.execution.active && (
              <div
                className={`fixed left-1/2 -translate-x-1/2 rounded-lg border bg-[#090d16]/92 px-3.5 py-2 shadow-2xl ${
                  touchControlsEnabled
                    ? hud.boss.active
                      ? 'top-[76px] w-[min(270px,46vw)]'
                      : 'top-14 w-[min(280px,52vw)]'
                    : hud.boss.active
                      ? 'bottom-[106px] w-[min(360px,88vw)]'
                      : 'bottom-12 w-[min(360px,88vw)]'
                }`}
                style={{
                  borderColor: `${hud.execution.accent}88`,
                  boxShadow: `0 0 24px ${hud.execution.accent}33`,
                }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="font-mono-num inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950 shrink-0"
                      style={{ backgroundColor: hud.execution.accent }}
                    >
                      {touchControlsEnabled ? 'EXEC' : 'E / Q'}
                    </span>
                    <span className="truncate text-xs font-bold tracking-wide text-white">
                      {hud.execution.moveName}
                    </span>
                  </div>
                  {!touchControlsEnabled && (
                    <span
                      className="text-[10px] font-semibold tracking-wider uppercase shrink-0"
                      style={{ color: hud.execution.accent }}
                    >
                      Execution Ready
                    </span>
                  )}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-900 ring-1 ring-white/10">
                  <div
                    className="h-full origin-left"
                    style={{
                      backgroundColor: hud.execution.accent,
                      transform: `scaleX(${Math.max(0, Math.min(1, hud.execution.windowTimer))})`,
                    }}
                  />
                </div>
              </div>
            )}

          {/* DISCREET BOTTOM CONTROLS HINT (Desktop only — hidden when Touch Controls active) */}
          {!touchControlsEnabled && !hud.boss.active && !hud.debugHitboxes && hud.phase === 'playing' && (
            <div className="fixed bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-white/10 bg-[#090d16]/76 px-4 py-1.5 text-[11px] text-slate-300 whitespace-nowrap">
              A/D Move · Space Jump (x2) · M1/J Combo · E/Q Execution (after 3-Hit) · Hold M1/M2 Spells · Shift Dash
            </div>
          )}
        </>
      )}

      {/* CINEMATIC SCREEN-WIDE BIOME EXECUTION BANNER (brief 1.16s burst) */}
      {hud.phase === 'playing' && hud.execution.active && (() => {
        const p = hud.execution.activeProgress;
        const opacity = p < 0.14 ? p / 0.14 : p > 0.72 ? Math.max(0, (1 - p) / 0.28) : 1;
        return (
          <div style={{ opacity }}>
            <div className="fixed inset-x-0 top-0 h-11 bg-gradient-to-b from-[#05070c]/95 to-transparent" />
            <div className="fixed inset-x-0 bottom-0 h-11 bg-gradient-to-t from-[#05070c]/95 to-transparent" />
            <div className="fixed inset-x-0 top-16 flex flex-col items-center px-6 text-center">
              <div
                className="mb-1 text-[11px] font-bold tracking-[0.3em] uppercase"
                style={{ color: hud.execution.accent }}
              >
                Combo Execution · {palette.name}
              </div>
              <h2
                className="font-display text-3xl font-extrabold tracking-[0.16em] text-white uppercase sm:text-4xl"
                style={{
                  textShadow: `0 0 28px ${hud.execution.accent}, 0 4px 14px rgba(0,0,0,0.95)`,
                }}
              >
                {hud.execution.moveName}
              </h2>
              <div
                className="my-1.5 h-0.5 w-60"
                style={{
                  background: `linear-gradient(90deg, transparent, ${hud.execution.accent}, transparent)`,
                }}
              />
              <div className="text-[11px] font-medium tracking-wider text-slate-200/95">
                {hud.execution.subtitle}
              </div>
            </div>
          </div>
        );
      })()}

      {/* CINEMATIC BOSS INTRO LETTERBOX & ENCOUNTER REVEAL (2.35s automated camera pan) */}
      {hud.phase === 'playing' && hud.boss.introActive && (
        <>
          <div className="fixed inset-x-0 top-0 h-14 bg-gradient-to-b from-[#05070c] via-[#05070c]/95 to-transparent" />
          <div className="fixed inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#05070c] via-[#05070c]/95 to-transparent" />

          <div className="fixed inset-x-0 bottom-14 flex flex-col items-center text-center px-6">
            <div
              className="mb-1 text-[11px] font-semibold tracking-[0.28em] uppercase"
              style={{ color: hud.boss.accent }}
            >
              {palette.name} Boss · Multi-Phase Battle
            </div>
            <h2
              className="font-display text-4xl font-extrabold tracking-[0.18em] text-white uppercase"
              style={{
                textShadow: `0 0 26px ${hud.boss.accent}, 0 4px 12px rgba(0,0,0,0.95)`,
              }}
            >
              {hud.boss.name}
            </h2>
            <div
              className="my-2 h-0.5 w-64"
              style={{
                background: `linear-gradient(90deg, transparent, ${hud.boss.accent}, transparent)`,
              }}
            />
            <div className="text-xs font-medium tracking-wider text-slate-200/90">
              {hud.boss.title}
            </div>
          </div>
        </>
      )}

      {/* TITLE SCREEN OVERLAY (Live 3D world staged cleanly behind — scroll-safe for compact mobile landscape) */}
      {hud.phase === 'title' && (
        <div className="pointer-events-auto fixed inset-0 flex flex-col justify-between overflow-y-auto bg-gradient-to-b from-[#070b12]/72 via-[#070b12]/28 to-[#070b12]/88 px-4 py-3 sm:px-6 sm:py-6 safe-x">
          {/* Top corner quiet utility buttons */}
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="text-[11px] sm:text-xs font-medium text-slate-300">
              {hud.highScore > 0 ? (
                <span className="font-mono-num">
                  Best Score · {hud.highScore.toLocaleString()}
                </span>
              ) : (
                <span>Aetherblade 2.5D · Mobile & Desktop</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={onToggleTouchControls}
                title="Toggle Mobile Touch Controls"
                className={`inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  touchControlsEnabled
                    ? 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                    : 'border-white/15 bg-[#090d16]/80 text-slate-200 hover:bg-white/15'
                }`}
              >
                <Gamepad2 className="h-4 w-4" />
                <span>{touchControlsEnabled ? 'Touch ON' : 'Touch'}</span>
              </button>
              <button
                type="button"
                onClick={onCycleShaderMode}
                title="Cycle Color-Grading & Pixel Dither Filter (F3)"
                className="hidden sm:inline-flex h-9 sm:h-10 items-center gap-2 rounded-lg border border-white/15 bg-[#090d16]/80 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-white/15 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Palette className="h-4 w-4 text-sky-300" />
                {SHADER_MODE_LABELS[hud.shaderMode]}
              </button>
              <button
                type="button"
                onClick={onToggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Landscape'}
                className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-white/15 bg-[#090d16]/80 text-slate-200 transition-colors hover:bg-white/15 cursor-pointer"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4 text-sky-300" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                title={hud.muted ? 'Unmute Audio' : 'Mute Audio'}
                className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-white/15 bg-[#090d16]/80 text-slate-200 transition-colors hover:bg-white/15 cursor-pointer"
              >
                {hud.muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Center Title Crest & Primary CTA */}
          <div className="mx-auto my-auto flex max-w-2xl flex-col items-center py-1 text-center">
            {/* Bespoke SVG Sword & Shield Crest Lockup */}
            <svg
              viewBox="0 0 360 92"
              className="mb-1 sm:mb-2 h-12 sm:h-20 w-auto max-w-[340px] drop-shadow-[0_6px_18px_rgba(0,0,0,0.8)]"
              aria-label="Aetherblade"
            >
              <defs>
                <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
              </defs>
              <path
                d="M28 74 L145 74 L180 65 L215 74 L332 74 L215 78 L180 86 L145 78 Z"
                fill="url(#bladeGrad)"
                opacity="0.92"
              />
              <polygon
                points="180,6 190,18 180,30 170,18"
                fill="#38bdf8"
                stroke="#fde68a"
                strokeWidth="1.5"
              />
              <text
                x="180"
                y="57"
                textAnchor="middle"
                className="font-display"
                fill="#f8fafc"
                fontSize="36"
                fontWeight="800"
                letterSpacing="5"
              >
                AETHERBLADE
              </text>
            </svg>

            <p className="mb-2.5 sm:mb-5 max-w-md text-xs sm:text-sm text-slate-200/90">
              Slash through 4 gauntlet zones, reflect projectiles with Perfect Parry, and vanquish{' '}
              <span className="font-semibold text-white">{palette.bossName}</span> in{' '}
              <span className="font-semibold text-white">{palette.name}</span>.
            </p>

            {/* Primary Start CTA */}
            <button
              type="button"
              onClick={onStart}
              className="mb-2.5 sm:mb-4 inline-flex min-h-[44px] items-center gap-2.5 rounded-lg bg-sky-500 px-7 py-2.5 sm:px-8 sm:py-3.5 text-sm font-bold tracking-wide text-slate-950 shadow-[0_0_28px_rgba(56,189,248,0.4)] transition-transform duration-150 hover:scale-[1.02] hover:bg-sky-400 active:scale-[0.97] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Swords className="h-4 w-4" />
              Play Stage
            </button>

            {/* Biome Selector (Segmented functional buttons — live-previews the 3D biome!) */}
            <div className="mb-1.5 flex flex-wrap items-center justify-center gap-1 rounded-xl border border-white/12 bg-[#090d16]/86 p-1 sm:p-1.5 shadow-xl">
              {BIOME_ORDER.map((id) => {
                const b = BIOME_PALETTES[id];
                const active = hud.biome === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectBiome(id)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-white text-slate-950 shadow'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>

            {/* Clean unboxed native biome bestiary & Boss preview line */}
            <div className="mb-2 text-[10px] sm:text-[11px] text-slate-300/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              <span className="text-slate-400">Foes:</span>{' '}
              <span className="text-slate-100">{roster.units.grunt.name}</span> ·{' '}
              <span className="text-slate-100">{roster.units.ranger.name}</span> ·{' '}
              <span className="text-slate-100">{roster.units.flyer.name}</span> ·{' '}
              <span className="text-slate-100">{roster.units.brute.name}</span>{' '}
              <span className="text-slate-500">|</span>{' '}
              <span className="text-slate-400">Boss:</span>{' '}
              <span className="font-semibold" style={{ color: roster.boss.accentCss }}>
                {roster.boss.name}
              </span>
            </div>

            {/* Difficulty Select Menu */}
            <div className="flex flex-col items-center gap-1 rounded-xl border border-white/12 bg-[#090d16]/86 px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-xl">
              <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
                <span className="px-1 text-[10px] sm:text-[11px] font-medium text-slate-400">
                  Difficulty
                </span>
                {DIFFICULTY_ORDER.map((id) => {
                  const cfg = DIFFICULTY_PRESETS[id];
                  const active = hud.difficulty === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectDifficulty(id)}
                      className={`rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'text-slate-950 shadow'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                      style={active ? { backgroundColor: cfg.accent } : undefined}
                    >
                      {cfg.name}
                    </button>
                  );
                })}
              </div>
              <div className="font-mono-num text-[10px] sm:text-[11px] text-slate-300">
                Incoming DMG{' '}
                <span style={{ color: diffConfig.accent }} className="font-semibold">
                  {diffConfig.playerDamageMult.toFixed(2)}×
                </span>{' '}
                · Aggression{' '}
                <span style={{ color: diffConfig.accent }} className="font-semibold">
                  {diffConfig.enemyAggression.toFixed(2)}×
                </span>{' '}
                · Score{' '}
                <span className="font-semibold text-amber-300">
                  {diffConfig.scoreMult.toFixed(2)}×
                </span>
              </div>
            </div>
          </div>

          {/* Single flat control-hint line */}
          <div className="shrink-0 text-center text-[10px] sm:text-xs text-slate-300/90">
            {touchControlsEnabled
              ? 'Joystick Move · ATK Combo (Hold Wave) · Jump (x2) · Parry (Hold Nova) · Wave & Nova Quick Magic · EXEC after 3-Hit'
              : 'A/D Move · Space Jump (x2) · M1/J Combo · E/Q Execution (after 3-Hit) · Hold M1/M2 Spells · Shift Dash'}
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {hud.phase === 'paused' && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/68 p-3 sm:p-4">
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-[#0b101b] p-4 sm:p-6 text-center shadow-2xl">
            <h2 className="font-display mb-1 text-xl sm:text-2xl font-bold tracking-wide text-white">
              Paused
            </h2>
            <p className="mb-3 sm:mb-4 text-xs text-slate-400">
              {palette.name} · Zone {hud.zone} of 4
            </p>

            {/* Live Difficulty Select in Pause HUD */}
            <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-300">Difficulty</span>
                <span className="text-slate-400">{diffConfig.subtitle}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {DIFFICULTY_ORDER.map((id) => {
                  const cfg = DIFFICULTY_PRESETS[id];
                  const active = hud.difficulty === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectDifficulty(id)}
                      className={`rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'text-slate-950 shadow'
                          : 'bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white'
                      }`}
                      style={active ? { backgroundColor: cfg.accent } : undefined}
                    >
                      {cfg.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 font-mono-num flex items-center justify-between text-[10px] text-slate-300">
                <span>
                  Damage Taken{' '}
                  <strong style={{ color: diffConfig.accent }}>
                    {diffConfig.playerDamageMult.toFixed(2)}×
                  </strong>
                </span>
                <span>
                  Aggression{' '}
                  <strong style={{ color: diffConfig.accent }}>
                    {diffConfig.enemyAggression.toFixed(2)}×
                  </strong>
                </span>
                <span>
                  Score{' '}
                  <strong className="text-amber-300">{diffConfig.scoreMult.toFixed(2)}×</strong>
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-400 cursor-pointer"
              >
                <Play className="h-4 w-4" />
                Resume
              </button>
              <button
                type="button"
                onClick={onStart}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/12 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                Restart Stage
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/5 px-5 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Custom hero.png (9x4)
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="mt-1 rounded-lg px-4 py-2 text-xs font-medium text-slate-400 transition-colors hover:text-white cursor-pointer"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BEAT 1: SLOW-MOTION CAMERA ZOOM-OUT & 'STAGE CLEARED' BANNER */}
      {hud.phase === 'victory' && hud.transition.stage === 'celebrate' && (
        <>
          <div className="fixed inset-x-0 top-0 h-14 bg-gradient-to-b from-[#05070c] via-[#05070c]/95 to-transparent" />
          <div className="fixed inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#05070c] via-[#05070c]/95 to-transparent" />

          <div className="fixed inset-x-0 bottom-12 flex flex-col items-center px-6 text-center">
            <div className="mb-1 text-xs font-medium tracking-[0.22em] text-amber-300/95">
              Area {hud.transition.areaIndex} of {hud.transition.totalAreas} · Boss Vanquished
            </div>
            <h2
              className="font-display text-4xl font-extrabold tracking-[0.16em] text-amber-100 sm:text-5xl"
              style={{
                textShadow:
                  '0 0 32px rgba(250,204,21,0.75), 0 4px 14px rgba(0,0,0,0.95)',
              }}
            >
              Stage Cleared
            </h2>
            <div className="my-2.5 h-0.5 w-72 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
            <div className="text-xs font-medium tracking-wide text-slate-200/95">
              {palette.bossName} has fallen in {palette.name}
            </div>
          </div>
        </>
      )}

      {/* BEAT 2: STYLIZED 'STAGE CLEARED' END-GAME PERFORMANCE OVERLAY & AREA TRANSITION */}
      {hud.phase === 'victory' && hud.transition.stage === 'intermission' && (() => {
        const perf = hud.transition.performance;
        const mins = perf ? Math.floor(perf.clearTimeSeconds / 60) : 0;
        const secs = perf ? perf.clearTimeSeconds % 60 : 0;
        const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        const rankColor =
          perf?.rank === 'S'
            ? 'text-amber-300'
            : perf?.rank === 'A'
              ? 'text-sky-300'
              : perf?.rank === 'B'
                ? 'text-emerald-300'
                : 'text-slate-200';
        const rankBorder =
          perf?.rank === 'S'
            ? 'border-amber-300/60 bg-amber-400/12'
            : perf?.rank === 'A'
              ? 'border-sky-300/55 bg-sky-400/12'
              : perf?.rank === 'B'
                ? 'border-emerald-300/50 bg-emerald-400/10'
                : 'border-white/20 bg-white/5';

        return (
          <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-[#060910]/66 p-3 sm:p-4">
            <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-amber-300/22 bg-[#0b101b]/95 p-4 sm:p-7 text-center shadow-2xl">
              {/* Stylized 'Stage Cleared' Banner Crest */}
              <div className="mb-1 text-xs font-medium text-amber-300/90">
                Area {currentBiomeIdx + 1} of {BIOME_ORDER.length} · {palette.name}
              </div>
              <div className="mb-1.5 flex items-center justify-center gap-3">
                <div className="h-px w-14 bg-gradient-to-r from-transparent to-amber-400/80" />
                <h2
                  className="font-display text-3xl font-extrabold tracking-[0.12em] text-amber-200 sm:text-4xl"
                  style={{
                    textShadow: '0 0 24px rgba(250,204,21,0.35)',
                  }}
                >
                  {hud.transition.isCampaignComplete ? 'Realm Conquered' : 'Stage Cleared'}
                </h2>
                <div className="h-px w-14 bg-gradient-to-l from-transparent to-amber-400/80" />
              </div>
              <p className="mb-5 text-xs text-slate-300">
                {palette.bossName} vanquished · Vitality and Stamina restored for {nextPalette.name}
              </p>

              {/* Performance Rating + Detailed Tabular Performance Summary */}
              <div className="mb-6 flex flex-col items-center gap-5 border-y border-white/10 py-5 sm:flex-row sm:items-stretch sm:justify-between">
                {/* Left: Performance Grade Emblem */}
                <div className="flex flex-col items-center justify-center sm:w-36 sm:border-r sm:border-white/10 sm:pr-5">
                  <div className="mb-1.5 text-[11px] text-slate-400">Performance</div>
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-lg border font-display text-4xl font-extrabold ${rankBorder} ${rankColor}`}
                  >
                    {perf?.rank ?? 'A'}
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-slate-200">
                    {perf?.rankTitle ?? 'Aether Champion'}
                  </div>
                </div>

                {/* Right: 6-Metric Performance Grid (unboxed tabular figures) */}
                <div className="grid flex-1 grid-cols-3 gap-x-4 gap-y-3.5 text-left">
                  <div>
                    <div className="text-[11px] text-slate-400">Clear Time</div>
                    <div className="font-mono-num text-base font-bold text-white">
                      {formattedTime}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Max Combo</div>
                    <div className="font-mono-num text-base font-bold text-amber-300">
                      {perf ? `${perf.maxCombo} Hits` : '0 Hits'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Vitality Left</div>
                    <div className="font-mono-num text-base font-bold text-emerald-300">
                      {perf ? `${perf.hpRemainingPct}%` : '100%'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Enemies Slain</div>
                    <div className="font-mono-num text-base font-semibold text-slate-100">
                      {perf ? perf.enemiesDefeated : hud.enemiesDefeated}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Perfect Parries</div>
                    <div className="font-mono-num text-base font-semibold text-sky-300">
                      {perf ? perf.parriesCount : hud.parriesCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Clear Bonus</div>
                    <div className="font-mono-num text-base font-semibold text-amber-200">
                      +{perf ? perf.clearBonus.toLocaleString() : 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Score Line */}
              <div className="mb-5 flex items-center justify-center gap-6 text-xs text-slate-300">
                <span>
                  Total Score{' '}
                  <strong className="font-mono-num ml-1 text-sm text-white">
                    {hud.score.toLocaleString()}
                  </strong>
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span>
                  Best Score{' '}
                  <strong className="font-mono-num ml-1 text-sm text-amber-300">
                    {hud.highScore.toLocaleString()}
                  </strong>
                </span>
                {perf && perf.damageTakenHits === 0 && (
                  <>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span className="font-semibold text-emerald-300">No-Damage Clear</span>
                  </>
                )}
              </div>

              {/* Realm Journey Progress Track (clickable area transition selector) */}
              <div className="mb-6 text-left">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">Realm Journey</span>
                  <span className="text-slate-400">
                    Next · <span className="font-semibold text-white">{nextPalette.name}</span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {BIOME_ORDER.map((id, idx) => {
                    const b = BIOME_PALETTES[id];
                    const isCurrent = id === hud.biome;
                    const isNext = id === hud.transition.toBiome;
                    const isCleared = idx <= currentBiomeIdx;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onAdvanceNextArea(id)}
                        className={`group flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                          isNext
                            ? 'border-amber-300/65 bg-amber-400/14 text-white'
                            : isCurrent
                              ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-200'
                              : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white'
                        }`}
                      >
                        <div className="mb-1 flex w-full items-center justify-between text-[10px]">
                          <span className="font-mono-num text-slate-400">0{idx + 1}</span>
                          {isCleared && <Check className="h-3 w-3 text-emerald-400" />}
                        </div>
                        <span className="w-full truncate text-[11px] font-semibold">
                          {b.name}
                        </span>
                        <div
                          className="mt-1.5 h-0.5 w-full rounded-full opacity-80"
                          style={{ backgroundColor: b.hudAccent }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary & Secondary Actions */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onAdvanceNextArea()}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(251,191,36,0.3)] transition-colors hover:bg-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {hud.transition.isCampaignComplete
                    ? `New Journey: ${nextPalette.name}`
                    : `Advance to ${nextPalette.name}`}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onStart}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/12 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  Replay Area
                </button>
                <button
                  type="button"
                  onClick={onReturnTitle}
                  className="rounded-lg px-3.5 py-2.5 text-xs font-medium text-slate-400 transition-colors hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Title Screen
                </button>
              </div>
              <div className="mt-3 text-[11px] text-slate-400">
                Press Enter to depart for {nextPalette.name}
              </div>
            </div>
          </div>
        );
      })()}

      {/* BEAT 3 & 4: SEAMLESS CROSS-MAP CURTAIN & NEW AREA ARRIVAL TITLE CARD */}
      {hud.phase === 'victory' &&
        (hud.transition.stage === 'departing' || hud.transition.stage === 'arriving') && (
          <>
            {/* Subtle cinema letterbox during hero walk-out / arrival jog */}
            <div className="fixed inset-x-0 top-0 h-12 bg-gradient-to-b from-[#05070c] to-transparent" />
            <div className="fixed inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#05070c] to-transparent" />

            {/* Smooth Fade Curtain + Destination Area Card */}
            <div
              className="fixed inset-0 flex flex-col items-center justify-center bg-[#060910] px-6 text-center"
              style={{ opacity: hud.transition.fadeAlpha }}
            >
              <div className="mb-2 text-xs font-medium tracking-[0.26em] text-slate-400">
                Area {hud.transition.areaIndex} of {hud.transition.totalAreas}
              </div>
              <h2 className="font-display text-4xl font-extrabold tracking-[0.14em] text-white sm:text-5xl">
                {nextPalette.name}
              </h2>
              <div
                className="my-3 h-0.5 w-48"
                style={{
                  background: `linear-gradient(90deg, transparent, ${nextPalette.hudAccent}, transparent)`,
                }}
              />
              <p className="text-sm text-slate-300">{nextPalette.subtitle}</p>
              <p className="mt-4 text-xs text-slate-400">
                Guardian · <span className="text-slate-200">{nextPalette.bossName}</span>, {nextPalette.bossTitle}
              </p>
            </div>
          </>
        )}

      {/* GAME OVER MODAL */}
      {hud.phase === 'gameover' && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/72 p-3 sm:p-4">
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-[#0b101b] p-5 sm:p-7 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/15">
              <Skull className="h-6 w-6 text-rose-400" />
            </div>

            <h2 className="font-display mb-1 text-3xl font-extrabold tracking-wider text-rose-400">
              Defeated
            </h2>
            <p className="mb-6 text-xs text-slate-400">
              Fallen in {palette.name} · Zone {hud.zone}
            </p>

            {/* Unboxed Run Summary */}
            <div className="mb-6 grid grid-cols-2 gap-3 border-y border-white/10 py-4 text-left">
              <div>
                <div className="text-[11px] text-slate-400">Score</div>
                <div className="font-mono-num text-lg font-bold text-white">
                  {hud.score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Best Score</div>
                <div className="font-mono-num text-lg font-bold text-amber-300">
                  {hud.highScore.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Enemies Slain</div>
                <div className="font-mono-num text-base font-semibold text-slate-200">
                  {hud.enemiesDefeated}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Perfect Parries</div>
                <div className="font-mono-num text-base font-semibold text-sky-300">
                  {hud.parriesCount}
                </div>
              </div>
            </div>

            {/* Quick Biome Switcher on Game Over */}
            <div className="mb-5 flex flex-wrap justify-center gap-1.5">
              {BIOME_ORDER.map((id) => {
                const b = BIOME_PALETTES[id];
                const active = hud.biome === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectBiome(id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-white text-slate-950'
                        : 'bg-white/6 text-slate-300 hover:bg-white/14 hover:text-white'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onStart}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-400 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                Play Again
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/12 cursor-pointer"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
