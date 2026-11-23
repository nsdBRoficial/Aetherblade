'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Crosshair, Feather, ShieldAlert, Skull, Swords } from 'lucide-react';
import { EnemyType, OffscreenEnemyIndicator } from '../game/types';

interface OffscreenEnemyIndicatorsProps {
  indicators: OffscreenEnemyIndicator[];
}

interface EnemyIndicatorMeta {
  label: string;
  accent: string;
  border: string;
  text: string;
}

const ENEMY_META: Record<EnemyType, EnemyIndicatorMeta> = {
  grunt: {
    label: 'Grunt',
    accent: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.55)',
    text: 'text-amber-200',
  },
  ranger: {
    label: 'Archer',
    accent: '#e879f9',
    border: 'rgba(232, 121, 249, 0.55)',
    text: 'text-fuchsia-200',
  },
  flyer: {
    label: 'Imp',
    accent: '#fb7185',
    border: 'rgba(251, 113, 133, 0.55)',
    text: 'text-rose-200',
  },
  brute: {
    label: 'Brute',
    accent: '#34d399',
    border: 'rgba(52, 211, 153, 0.58)',
    text: 'text-emerald-200',
  },
  boss: {
    label: 'Boss',
    accent: '#fb923c',
    border: 'rgba(251, 146, 60, 0.78)',
    text: 'text-orange-200',
  },
};

function renderEnemyGlyph(type: EnemyType, color: string): React.ReactNode {
  const props = { className: 'h-3.5 w-3.5 shrink-0', style: { color } };
  switch (type) {
    case 'boss':
      return <Skull {...props} />;
    case 'brute':
      return <ShieldAlert {...props} />;
    case 'ranger':
      return <Crosshair {...props} />;
    case 'flyer':
      return <Feather {...props} />;
    default:
      return <Swords {...props} />;
  }
}

export const OffscreenEnemyIndicators: React.FC<OffscreenEnemyIndicatorsProps> = ({
  indicators,
}) => {
  if (indicators.length === 0) return null;

  return (
    <>
      {indicators.map((ind) => {
        const meta = ENEMY_META[ind.type];
        const isLeft = ind.side === 'left';
        const scale = 0.92 + ind.urgency * 0.14;
        const opacity = 0.74 + ind.urgency * 0.26;
        const baseAccent = ind.accent || meta.accent;
        const accentColor = ind.aggro && ind.type === 'grunt' ? '#ef4444' : baseAccent;
        const borderColor =
          ind.aggro || ind.type === 'boss'
            ? accentColor
            : `${baseAccent}8c`;
        const label = ind.label || meta.label;

        return (
          <div
            key={ind.id}
            className="pointer-events-none fixed top-0 z-20 will-change-transform"
            style={{
              left: isLeft ? '12px' : undefined,
              right: isLeft ? undefined : '12px',
              opacity,
              transform: `translate3d(0, ${Math.round(ind.screenY)}px, 0) translateY(-50%) scale(${scale.toFixed(3)})`,
              transformOrigin: isLeft ? 'left center' : 'right center',
            }}
          >
            <div
              className={`flex items-center gap-1.5 rounded-md border bg-[#090d16]/90 px-2 py-1 shadow-lg ${
                isLeft ? 'flex-row' : 'flex-row-reverse'
              }`}
              style={{
                borderColor,
                boxShadow:
                  ind.aggro || ind.type === 'boss'
                    ? `0 0 14px ${accentColor}40, 0 4px 10px rgba(0,0,0,0.65)`
                    : '0 4px 10px rgba(0,0,0,0.6)',
              }}
            >
              {/* Outward directional chevron pointing toward the incoming off-screen threat */}
              {isLeft ? (
                <ChevronLeft
                  className="h-4 w-4 -ml-0.5 shrink-0"
                  style={{ color: accentColor }}
                />
              ) : (
                <ChevronRight
                  className="h-4 w-4 -mr-0.5 shrink-0"
                  style={{ color: accentColor }}
                />
              )}

              {/* Enemy class glyph */}
              {renderEnemyGlyph(ind.type, accentColor)}

              {/* Compact biome-native threat label + tabular world distance */}
              <div
                className={`flex items-baseline gap-1.5 whitespace-nowrap leading-none ${
                  isLeft ? 'flex-row' : 'flex-row-reverse'
                }`}
              >
                <span
                  className="text-[11px] font-semibold tracking-wide"
                  style={{ color: ind.aggro && ind.type === 'grunt' ? '#fecaca' : '#f1f5f9' }}
                >
                  {label}
                </span>
                <span className="font-mono-num text-[10px] font-medium text-slate-300">
                  {ind.distance}m
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};
