'use client';

import React from 'react';

interface ComboCounterProps {
  combo: number;
  comboTimer: number; // 0..1 normalized remaining decay timer
  comboMultiplier: number;
  slashStep: number;
  slashMultiplier: number;
}

interface ComboTierStyle {
  rank: string;
  numColor: string;
  accentText: string;
  borderColor: string;
  barGradient: string;
  glowSoft: string;
  glowStrong: string;
  glowInner: string;
  textGlow: string;
  pulseDuration: string;
}

function getComboTier(combo: number): ComboTierStyle {
  if (combo >= 35) {
    return {
      rank: 'OVERDRIVE',
      numColor: '#fef08a',
      accentText: 'text-amber-200',
      borderColor: 'rgba(250, 204, 21, 0.85)',
      barGradient: 'from-cyan-300 via-fuchsia-400 to-amber-300',
      glowSoft: 'rgba(250, 204, 21, 0.5)',
      glowStrong: 'rgba(232, 121, 249, 0.8)',
      glowInner: 'rgba(250, 204, 21, 0.24)',
      textGlow:
        '0 0 22px rgba(250,204,21,0.92), 0 0 40px rgba(232,121,249,0.72), 0 2px 6px rgba(0,0,0,0.95)',
      pulseDuration: '0.62s',
    };
  }
  if (combo >= 20) {
    return {
      rank: 'AETHERLORD',
      numColor: '#fde047',
      accentText: 'text-rose-200',
      borderColor: 'rgba(244, 63, 94, 0.72)',
      barGradient: 'from-sky-400 via-fuchsia-400 to-amber-300',
      glowSoft: 'rgba(244, 63, 94, 0.45)',
      glowStrong: 'rgba(56, 189, 248, 0.72)',
      glowInner: 'rgba(244, 63, 94, 0.22)',
      textGlow: '0 0 18px rgba(244,63,94,0.85), 0 0 34px rgba(56,189,248,0.65), 0 2px 6px rgba(0,0,0,0.95)',
      pulseDuration: '0.78s',
    };
  }
  if (combo >= 10) {
    return {
      rank: 'RELENTLESS',
      numColor: '#fb923c',
      accentText: 'text-orange-200',
      borderColor: 'rgba(251, 146, 60, 0.65)',
      barGradient: 'from-rose-500 via-orange-400 to-amber-300',
      glowSoft: 'rgba(249, 115, 22, 0.4)',
      glowStrong: 'rgba(251, 146, 60, 0.72)',
      glowInner: 'rgba(249, 115, 22, 0.2)',
      textGlow: '0 0 16px rgba(249,115,22,0.82), 0 0 28px rgba(251,191,36,0.5), 0 2px 6px rgba(0,0,0,0.95)',
      pulseDuration: '0.95s',
    };
  }
  if (combo >= 5) {
    return {
      rank: 'FURY',
      numColor: '#fde047',
      accentText: 'text-amber-200',
      borderColor: 'rgba(250, 204, 21, 0.56)',
      barGradient: 'from-amber-500 via-yellow-400 to-amber-200',
      glowSoft: 'rgba(250, 204, 21, 0.34)',
      glowStrong: 'rgba(250, 204, 21, 0.64)',
      glowInner: 'rgba(250, 204, 21, 0.16)',
      textGlow: '0 0 14px rgba(250,204,21,0.75), 0 0 24px rgba(245,158,11,0.42), 0 2px 6px rgba(0,0,0,0.95)',
      pulseDuration: '1.18s',
    };
  }
  return {
    rank: 'CHAIN',
    numColor: '#7dd3fc',
    accentText: 'text-sky-200',
    borderColor: 'rgba(56, 189, 248, 0.5)',
    barGradient: 'from-sky-500 via-cyan-300 to-sky-200',
    glowSoft: 'rgba(56, 189, 248, 0.3)',
    glowStrong: 'rgba(56, 189, 248, 0.58)',
    glowInner: 'rgba(56, 189, 248, 0.14)',
    textGlow: '0 0 12px rgba(56,189,248,0.72), 0 2px 5px rgba(0,0,0,0.95)',
    pulseDuration: '1.45s',
  };
}

function getSlashLabel(step: number): string | null {
  if (step === 5) return 'FINISHER';
  if (step === 4) return 'TWIN SLASH';
  if (step === 3) return 'CRESCENT';
  return null;
}

export const ComboCounter: React.FC<ComboCounterProps> = ({
  combo,
  comboTimer,
  comboMultiplier,
  slashStep,
  slashMultiplier,
}) => {
  if (combo < 1) return null;

  const tier = getComboTier(combo);
  // Progressively scales up from 1.0x (1 hit) to 1.38x (35+ hits) as the player strings hits
  const progressiveScale = 1 + Math.min(combo - 1, 34) * 0.011;
  const slashLabel = getSlashLabel(slashStep);
  const isExpiring = comboTimer < 0.26;

  const cssVars = {
    '--combo-glow-soft': tier.glowSoft,
    '--combo-glow-strong': tier.glowStrong,
    '--combo-glow-inner': tier.glowInner,
    '--combo-pulse-dur': tier.pulseDuration,
    borderColor: tier.borderColor,
  } as React.CSSProperties;

  return (
    <div
      className="origin-top-right transition-transform duration-150 ease-out"
      style={{
        transform: `scale(${progressiveScale.toFixed(3)})`,
        opacity: isExpiring ? 0.68 + Math.max(0, comboTimer) * 1.2 : 1,
      }}
    >
      <div
        className="animate-combo-glow relative rounded-lg border bg-[#090d16]/90 px-4 py-2 text-right"
        style={cssVars}
      >
        {/* Expanding luminous ring burst re-triggered on every hit */}
        <div
          key={`ring-${combo}`}
          className="animate-combo-burst pointer-events-none absolute inset-0 rounded-lg border-2"
          style={{ borderColor: tier.borderColor }}
        />

        <div className="mb-0.5 flex items-center justify-between gap-4">
          <span className="font-mono-num text-[11px] font-bold tracking-wider text-amber-200">
            ×{comboMultiplier.toFixed(2)} DMG
          </span>
          <span
            className={`font-display text-[10px] font-bold tracking-[0.16em] ${tier.accentText}`}
          >
            {tier.rank}
          </span>
        </div>

        {/* Elastic pop-in numeral re-triggered on every chained hit */}
        <div
          key={`num-${combo}`}
          className="animate-combo-pop flex items-baseline justify-end gap-1.5"
        >
          <span
            className="font-mono-num text-3xl font-black leading-none tracking-tight"
            style={{
              color: tier.numColor,
              textShadow: tier.textGlow,
            }}
          >
            {combo}
          </span>
          <span
            className="font-display text-sm font-extrabold tracking-widest uppercase"
            style={{
              color: tier.numColor,
              textShadow: tier.textGlow,
            }}
          >
            {combo === 1 ? 'Hit' : 'Hits'}
          </span>
        </div>

        {slashLabel && (
          <div className="mt-0.5 font-mono-num text-[10px] font-semibold tracking-wider text-sky-300">
            {slashLabel} · ×{slashMultiplier.toFixed(2)}
          </div>
        )}

        {/* Draining combo window gauge */}
        <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-sm bg-slate-900 ring-1 ring-white/10">
          <div
            className={`h-full origin-left bg-gradient-to-r ${tier.barGradient}`}
            style={{
              transform: `scaleX(${Math.max(0, Math.min(1, comboTimer))})`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
