'use client';

import React, { useRef } from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  Shield,
  Skull,
  Swords,
  Upload,
  Volume2,
  VolumeX,
  Box,
  Palette,
} from 'lucide-react';
import { BIOME_PALETTES, BiomeId, HudSnapshot, ShaderStyleMode } from '../game/types';

interface GameHUDProps {
  hud: HudSnapshot;
  onStart: () => void;
  onResume: () => void;
  onPause: () => void;
  onReturnTitle: () => void;
  onSelectBiome: (biome: BiomeId) => void;
  onToggleMute: () => void;
  onToggleDebug: () => void;
  onCycleShaderMode: () => void;
  onUploadSprite: (file: File) => void;
}

const SHADER_MODE_LABELS: Record<ShaderStyleMode, string> = {
  hd2d: 'HD-2D Dither',
  retro16: '16-Bit Pixel',
  grade: 'Color Grade',
  off: 'Filter Off',
};

const BIOME_ORDER: BiomeId[] = [
  'deep-forest',
  'green-hills',
  'hare-canyon',
  'bamboo-forest',
  'winter',
  'wheat-field',
];

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  onStart,
  onResume,
  onPause,
  onReturnTitle,
  onSelectBiome,
  onToggleMute,
  onToggleDebug,
  onCycleShaderMode,
  onUploadSprite,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const palette = BIOME_PALETTES[hud.biome];

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const stamPct = Math.max(0, Math.min(100, (hud.stamina / hud.maxStamina) * 100));
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

      {/* IN-GAME PERIMETER HUD */}
      {hud.phase !== 'title' && (
        <>
          <div className="flex items-start justify-between gap-4 px-5 pt-4">
            {/* Top-Left: Vitality & Stamina Cluster */}
            <div className="w-[260px] rounded-lg border border-white/12 bg-[#090d16]/86 px-3.5 py-2.5 shadow-lg">
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-300">
                <span className="font-semibold tracking-wide text-slate-100">
                  {palette.name}
                </span>
                <span className="font-mono-num text-slate-400">
                  Zone {hud.zone} / 4
                </span>
              </div>

              {/* HP Bar */}
              <div className="mb-2">
                <div className="mb-0.5 flex items-center justify-between text-[11px]">
                  <span className="font-medium text-rose-300">Vitality</span>
                  <span className="font-mono-num font-semibold text-slate-100">
                    {hud.hp} / {hud.maxHp}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-sm bg-slate-900/95 ring-1 ring-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-rose-700 via-rose-500 to-rose-400 transition-transform duration-150 ease-out origin-left"
                    style={{ transform: `scaleX(${hpPct / 100})` }}
                  />
                </div>
              </div>

              {/* Stamina Bar */}
              <div>
                <div className="mb-0.5 flex items-center justify-between text-[11px]">
                  <span className="font-medium text-sky-300">Stamina</span>
                  <span className="font-mono-num text-slate-300">{hud.stamina}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-900/95 ring-1 ring-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-sky-600 to-cyan-300 transition-transform duration-100 ease-out origin-left"
                    style={{ transform: `scaleX(${stamPct / 100})` }}
                  />
                </div>
              </div>
            </div>

            {/* Top-Center: Stage Progress Map Bar (X = 0..180 -> Boss) */}
            <div className="hidden md:flex flex-col items-center rounded-lg border border-white/12 bg-[#090d16]/84 px-4 py-2.5 shadow-lg w-[340px]">
              <div className="mb-1.5 flex w-full items-center justify-between text-[11px] text-slate-300">
                <span>Stage Progress</span>
                <span className="font-mono-num text-slate-200">
                  {Math.round(hud.progress * 100)}%
                </span>
              </div>
              <div className="relative h-2 w-full rounded-sm bg-slate-800/95">
                {/* Zone divider ticks */}
                <div className="absolute left-1/4 top-0 h-full w-px bg-slate-600/80" />
                <div className="absolute left-1/2 top-0 h-full w-px bg-slate-600/80" />
                <div className="absolute left-[82%] top-0 h-full w-px bg-amber-400/70" />
                {/* Fill */}
                <div
                  className="h-full rounded-sm transition-transform duration-150 origin-left"
                  style={{
                    backgroundColor: palette.hudAccent,
                    transform: `scaleX(${hud.progress})`,
                  }}
                />
                {/* Player diamond cursor */}
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rotate-45 border border-white bg-sky-400 shadow"
                  style={{ left: `${hud.progress * 100}%` }}
                />
              </div>
              <div className="mt-1.5 flex w-full items-center justify-between text-[10px] text-slate-400">
                <span>Outskirts</span>
                <span>Ridge</span>
                <span>Gauntlet</span>
                <span className="flex items-center gap-1 text-amber-300 font-medium">
                  <Skull className="h-3 w-3" /> Boss
                </span>
              </div>
            </div>

            {/* Top-Right: Score, Combo & Utility Controls */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <div className="rounded-lg border border-white/12 bg-[#090d16]/86 px-3.5 py-2 text-right shadow-lg">
                  <div className="text-[10px] tracking-wide text-slate-400">Score</div>
                  <div className="font-mono-num text-base font-bold leading-tight text-slate-100">
                    {hud.score.toLocaleString()}
                  </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#090d16]/86 p-1.5 shadow-lg">
                  <button
                    type="button"
                    onClick={onCycleShaderMode}
                    title={`Visual Filter: ${SHADER_MODE_LABELS[hud.shaderMode]} (F3)`}
                    className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      hud.shaderMode !== 'off'
                        ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/45 hover:bg-sky-500/30'
                        : 'text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Palette className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onToggleDebug}
                    title="Toggle Hitbox Debug (F2)"
                    className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
                      hud.debugHitboxes
                        ? 'bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/50'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Box className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    title={hud.muted ? 'Unmute Audio' : 'Mute Audio'}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
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
                    className="flex h-9 w-9 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {hud.phase === 'paused' ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Active Combo Meter */}
              {hud.combo > 1 && (
                <div className="rounded-lg border border-amber-400/35 bg-[#090d16]/88 px-3.5 py-1.5 text-right shadow-lg">
                  <div className="flex items-baseline justify-end gap-1.5">
                    <span className="font-mono-num text-xl font-extrabold text-amber-300">
                      {hud.combo}x
                    </span>
                    <span className="text-xs font-semibold text-amber-100">Combo</span>
                  </div>
                  <div className="mt-1 h-1 w-24 overflow-hidden rounded-sm bg-slate-800">
                    <div
                      className="h-full bg-amber-400 origin-left"
                      style={{ transform: `scaleX(${hud.comboTimer})` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* F2 Hitbox Debug Strip (only shown when F2 toggled ON) */}
          {hud.debugHitboxes && (
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

          {/* BOTTOM BOSS HEALTH BAR */}
          {hud.boss.active && hud.phase === 'playing' && (
            <div className="fixed bottom-5 left-1/2 w-[min(640px,90vw)] -translate-x-1/2 rounded-lg border border-amber-400/35 bg-[#090d16]/90 px-5 py-3 shadow-2xl">
              <div className="mb-1.5 flex items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-display text-lg font-bold tracking-wider text-amber-200">
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
              <div className="h-3 w-full overflow-hidden rounded-sm bg-slate-900 ring-1 ring-amber-400/25">
                <div
                  className={`h-full transition-transform duration-150 ease-out origin-left ${
                    hud.boss.phase === 2
                      ? 'bg-gradient-to-r from-red-700 via-orange-500 to-amber-300'
                      : 'bg-gradient-to-r from-rose-800 via-rose-500 to-amber-400'
                  }`}
                  style={{ transform: `scaleX(${bossPct / 100})` }}
                />
              </div>
            </div>
          )}

          {/* DISCREET BOTTOM CONTROLS HINT (hidden when Boss Bar or Debug active) */}
          {!hud.boss.active && !hud.debugHitboxes && hud.phase === 'playing' && (
            <div className="fixed bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-white/10 bg-[#090d16]/76 px-4 py-1.5 text-[11px] text-slate-300 whitespace-nowrap">
              A/D Move · Space Jump (x2) · J / Click Attack · K / Right-Click Guard &amp; Parry · Shift Dash · F2 Debug · F3 {SHADER_MODE_LABELS[hud.shaderMode]}
            </div>
          )}
        </>
      )}

      {/* TITLE SCREEN OVERLAY (Live 3D world staged cleanly behind) */}
      {hud.phase === 'title' && (
        <div className="pointer-events-auto fixed inset-0 flex flex-col justify-between bg-gradient-to-b from-[#070b12]/72 via-[#070b12]/28 to-[#070b12]/88 px-6 py-7">
          {/* Top corner quiet audio button */}
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-slate-300">
              {hud.highScore > 0 ? (
                <span className="font-mono-num">
                  Best Score · {hud.highScore.toLocaleString()}
                </span>
              ) : (
                <span>Side-Scrolling 2.5D Action</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCycleShaderMode}
                title="Cycle Color-Grading & Pixel Dither Filter (F3)"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-[#090d16]/80 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-white/15 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Palette className="h-4 w-4 text-sky-300" />
                {SHADER_MODE_LABELS[hud.shaderMode]}
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                title={hud.muted ? 'Unmute Audio' : 'Mute Audio'}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#090d16]/80 text-slate-200 transition-colors hover:bg-white/15 cursor-pointer"
              >
                {hud.muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Center Title Crest & Primary CTA */}
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            {/* Bespoke SVG Sword & Shield Crest Lockup */}
            <svg
              viewBox="0 0 360 92"
              className="mb-2 h-20 w-auto max-w-[340px] drop-shadow-[0_6px_18px_rgba(0,0,0,0.8)]"
              aria-label="Aetherblade"
            >
              <defs>
                <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
              </defs>
              {/* Ornate horizontal blade divider */}
              <path
                d="M28 74 L145 74 L180 65 L215 74 L332 74 L215 78 L180 86 L145 78 Z"
                fill="url(#bladeGrad)"
                opacity="0.92"
              />
              {/* Emblem diamond */}
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

            <p className="mb-6 max-w-md text-sm text-slate-200/90">
              Slash through 4 gauntlet zones, reflect projectiles with Perfect Parry, and vanquish{' '}
              <span className="font-semibold text-white">{palette.bossName}</span> in{' '}
              <span className="font-semibold text-white">{palette.name}</span>.
            </p>

            {/* Primary Start CTA */}
            <button
              type="button"
              onClick={onStart}
              className="mb-6 inline-flex items-center gap-2.5 rounded-lg bg-sky-500 px-8 py-3.5 text-sm font-bold tracking-wide text-slate-950 shadow-[0_0_28px_rgba(56,189,248,0.4)] transition-transform duration-150 hover:scale-[1.02] hover:bg-sky-400 active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Swords className="h-4 w-4" />
              Play Stage
            </button>

            {/* Biome Selector (Segmented functional buttons — live-previews the 3D biome!) */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-[#090d16]/86 p-1.5 shadow-xl">
              {BIOME_ORDER.map((id) => {
                const b = BIOME_PALETTES[id];
                const active = hud.biome === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectBiome(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
          </div>

          {/* Single flat control-hint line */}
          <div className="text-center text-xs text-slate-300/90">
            A/D Move · Space Jump (x2) · J / Left-Click 3-Hit Combo · K / Right-Click Guard &amp; Parry · Shift Dash · F2 Debug · F3 Filter
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {hud.phase === 'paused' && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/68 p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#0b101b] p-6 text-center shadow-2xl">
            <h2 className="font-display mb-1 text-2xl font-bold tracking-wide text-white">
              Paused
            </h2>
            <p className="mb-5 text-xs text-slate-400">
              {palette.name} · Zone {hud.zone} of 4
            </p>

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

      {/* GAME OVER / STAGE CLEAR MODALS */}
      {(hud.phase === 'gameover' || hud.phase === 'victory') && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/72 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0b101b] p-7 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/15">
              {hud.phase === 'victory' ? (
                <Shield className="h-6 w-6 text-amber-300" />
              ) : (
                <Skull className="h-6 w-6 text-rose-400" />
              )}
            </div>

            <h2
              className={`font-display mb-1 text-3xl font-extrabold tracking-wider ${
                hud.phase === 'victory' ? 'text-amber-300' : 'text-rose-400'
              }`}
            >
              {hud.phase === 'victory' ? 'Stage Clear' : 'Defeated'}
            </h2>
            <p className="mb-6 text-xs text-slate-400">
              {hud.phase === 'victory'
                ? `${palette.bossName} has fallen in ${palette.name}.`
                : `Fallen in ${palette.name} · Zone ${hud.zone}`}
            </p>

            {/* Run Summary Grid */}
            <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-slate-950/75 p-4 text-left">
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

            {/* Quick Biome Switcher on Victory/Game Over */}
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
