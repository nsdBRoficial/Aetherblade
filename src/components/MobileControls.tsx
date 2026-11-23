'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Flame,
  Shield,
  Sparkles,
  Swords,
  Wind,
  Zap,
} from 'lucide-react';
import { HudSnapshot } from '../game/types';

export interface MobileControlsProps {
  hud: HudSnapshot;
  onMove: (left: boolean, right: boolean, down: boolean) => void;
  onJump: (pressed: boolean) => void;
  onAttack: (pressed: boolean) => void;
  onGuard: (pressed: boolean) => void;
  onDash: () => void;
  onExecute: () => void;
  onQuickSpell: (kind: 'wave' | 'nova') => void;
  onClearInputs: () => void;
}

function triggerHaptic(ms = 10): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore unsupported or restricted vibration
  }
}

interface RadialChargeRingProps {
  size: number;
  progress: number;
  color: string;
  strokeWidth?: number;
}

const RadialChargeRing: React.FC<RadialChargeRingProps> = ({
  size,
  progress,
  color,
  strokeWidth = 3.5,
}) => {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0.02) return null;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      className="pointer-events-none absolute inset-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - clamped)}
      />
    </svg>
  );
};

export const MobileControls: React.FC<MobileControlsProps> = ({
  hud,
  onMove,
  onJump,
  onAttack,
  onGuard,
  onDash,
  onExecute,
  onQuickSpell,
  onClearInputs,
}) => {
  // Left virtual joystick state (tracks its own pointerId independently for true multi-touch)
  const stickBaseRef = useRef<HTMLDivElement | null>(null);
  const stickPointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dirState, setDirState] = useState<{ left: boolean; right: boolean; down: boolean }>({
    left: false,
    right: false,
    down: false,
  });

  // Right-side action pressed visual states & individual pointer IDs
  const [pressedMap, setPressedMap] = useState<Record<string, boolean>>({});
  const actionPointers = useRef<Record<string, number | null>>({});

  // Clear all active touches cleanly if gameplay pauses, transitions, or unmounts
  useEffect(() => {
    return () => {
      onClearInputs();
    };
  }, [onClearInputs]);

  const updateStickFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = stickBaseRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = 38;
      const rawDx = clientX - cx;
      const rawDy = clientY - cy;
      const dist = Math.hypot(rawDx, rawDy);
      const scale = dist > maxR ? maxR / dist : 1;
      const dx = rawDx * scale;
      const dy = rawDy * scale;

      setKnobOffset({ x: dx, y: dy });

      const left = rawDx < -13;
      const right = rawDx > 13;
      const down = rawDy > 26 && Math.abs(rawDy) > Math.abs(rawDx) * 0.72;

      setDirState((prev) => {
        if (prev.left === left && prev.right === right && prev.down === down) return prev;
        return { left, right, down };
      });
      onMove(left, right, down);
    },
    [onMove],
  );

  const releaseStick = useCallback(() => {
    stickPointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    setDirState({ left: false, right: false, down: false });
    onMove(false, false, false);
  }, [onMove]);

  const handleStickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (stickPointerId.current !== null) return;
    stickPointerId.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer capture error
    }
    updateStickFromClient(e.clientX, e.clientY);
  };

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerId.current !== e.pointerId) return;
    e.preventDefault();
    updateStickFromClient(e.clientX, e.clientY);
  };

  const handleStickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerId.current !== e.pointerId) return;
    e.preventDefault();
    releaseStick();
  };

  const bindHoldButton = (
    key: string,
    onChange: (down: boolean) => void,
    hapticMs = 10,
  ) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (actionPointers.current[key] != null) return;
      actionPointers.current[key] = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure
      }
      triggerHaptic(hapticMs);
      setPressedMap((prev) => ({ ...prev, [key]: true }));
      onChange(true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (actionPointers.current[key] !== e.pointerId) return;
      e.preventDefault();
      actionPointers.current[key] = null;
      setPressedMap((prev) => ({ ...prev, [key]: false }));
      onChange(false);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (actionPointers.current[key] !== e.pointerId) return;
      actionPointers.current[key] = null;
      setPressedMap((prev) => ({ ...prev, [key]: false }));
      onChange(false);
    },
  });

  const bindTapButton = (key: string, onTrigger: () => void, hapticMs = 12) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      actionPointers.current[key] = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure
      }
      triggerHaptic(hapticMs);
      setPressedMap((prev) => ({ ...prev, [key]: true }));
      onTrigger();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (actionPointers.current[key] !== e.pointerId) return;
      e.preventDefault();
      actionPointers.current[key] = null;
      setPressedMap((prev) => ({ ...prev, [key]: false }));
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (actionPointers.current[key] !== e.pointerId) return;
      actionPointers.current[key] = null;
      setPressedMap((prev) => ({ ...prev, [key]: false }));
    },
  });

  const canDash = hud.stamina >= 22;
  const canWave = hud.stamina >= 22;
  const canNova = hud.stamina >= 24;
  const execReady = hud.execution.ready && !hud.execution.active;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 select-none touch-none"
      aria-label="Mobile Touch Controls"
    >
      {/* =================================================================== */}
      {/* LEFT THUMB ZONE: MULTI-TOUCH VIRTUAL JOYSTICK (Horizontal + Drop)   */}
      {/* =================================================================== */}
      <div className="safe-bottom-left pointer-events-auto fixed flex items-center justify-center p-2">
        <div
          ref={stickBaseRef}
          onPointerDown={handleStickDown}
          onPointerMove={handleStickMove}
          onPointerUp={handleStickUp}
          onPointerCancel={handleStickUp}
          className="relative flex h-[126px] w-[126px] items-center justify-center rounded-full border-2 border-white/18 bg-[#090d16]/72 shadow-[0_6px_22px_rgba(0,0,0,0.55)] touch-none"
          role="slider"
          aria-label="Move Joystick"
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={dirState.right ? 1 : dirState.left ? -1 : 0}
        >
          {/* Inner guide ring */}
          <div className="pointer-events-none absolute inset-4 rounded-full border border-white/10" />

          {/* Directional feedback arrows */}
          <ArrowLeft
            className={`pointer-events-none absolute left-2.5 h-4 w-4 transition-colors duration-75 ${
              dirState.left ? 'text-sky-300' : 'text-white/30'
            }`}
          />
          <ArrowRight
            className={`pointer-events-none absolute right-2.5 h-4 w-4 transition-colors duration-75 ${
              dirState.right ? 'text-sky-300' : 'text-white/30'
            }`}
          />
          <ArrowDown
            className={`pointer-events-none absolute bottom-2 h-3.5 w-3.5 transition-colors duration-75 ${
              dirState.down ? 'text-amber-300' : 'text-white/22'
            }`}
          />

          {/* Tactile Thumb Nub */}
          <div
            className={`pointer-events-none flex h-[54px] w-[54px] items-center justify-center rounded-full border-2 shadow-lg transition-colors duration-75 ${
              dirState.left || dirState.right || dirState.down
                ? 'border-sky-300/85 bg-sky-500/35'
                : 'border-white/35 bg-slate-800/88'
            }`}
            style={{
              transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
            }}
          >
            <div className="h-3.5 w-3.5 rounded-full bg-white/75" />
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* RIGHT THUMB ZONE: ERGONOMIC COMBAT ARC (Attack / Jump / Magias)     */}
      {/* =================================================================== */}
      <div className="safe-bottom-right pointer-events-none fixed h-[196px] w-[246px]">
        {/* BIOME EXECUTION FINISHER (pops above Attack when 3-Hit Combo completes) */}
        {execReady && (
          <button
            type="button"
            {...bindTapButton('execute', onExecute, 24)}
            className="pointer-events-auto absolute right-[8px] top-[-26px] flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full border-2 bg-[#090d16]/90 text-white shadow-xl transition-transform duration-75 touch-none"
            style={{
              borderColor: hud.execution.accent,
              boxShadow: `0 0 22px ${hud.execution.accent}70`,
              transform: pressedMap.execute ? 'scale(0.9)' : 'scale(1)',
            }}
            aria-label={`Execute ${hud.execution.moveName}`}
          >
            <RadialChargeRing
              size={62}
              progress={hud.execution.windowTimer}
              color={hud.execution.accent}
              strokeWidth={4}
            />
            <Flame className="h-5 w-5" style={{ color: hud.execution.accent }} />
            <span
              className="mt-0.5 text-[9px] font-extrabold tracking-wider uppercase"
              style={{ color: hud.execution.accent }}
            >
              EXEC
            </span>
          </button>
        )}

        {/* MAGIC 1: AETHER WAVE (One-tap concentrated Sword Magic — Upper Arc Left) */}
        <button
          type="button"
          {...bindTapButton('wave', () => onQuickSpell('wave'), 16)}
          className={`pointer-events-auto absolute right-[132px] top-[18px] flex h-[50px] w-[50px] flex-col items-center justify-center rounded-full border-2 bg-[#090d16]/82 shadow-lg transition-transform duration-75 touch-none ${
            canWave
              ? 'border-cyan-400/75 text-cyan-200'
              : 'border-white/12 text-slate-500 opacity-60'
          }`}
          style={{
            transform: pressedMap.wave ? 'scale(0.9)' : 'scale(1)',
          }}
          aria-label="Cast Aether Wave Magic"
        >
          <Zap className="h-4 w-4" />
          <span className="text-[9px] font-bold tracking-tight uppercase">Wave</span>
        </button>

        {/* MAGIC 2: AEGIS NOVA (One-tap concentrated Shield Magic — Upper Arc Center) */}
        <button
          type="button"
          {...bindTapButton('nova', () => onQuickSpell('nova'), 16)}
          className={`pointer-events-auto absolute right-[72px] top-[4px] flex h-[50px] w-[50px] flex-col items-center justify-center rounded-full border-2 bg-[#090d16]/82 shadow-lg transition-transform duration-75 touch-none ${
            canNova
              ? 'border-fuchsia-400/75 text-fuchsia-200'
              : 'border-white/12 text-slate-500 opacity-60'
          }`}
          style={{
            transform: pressedMap.nova ? 'scale(0.9)' : 'scale(1)',
          }}
          aria-label="Cast Aegis Nova Magic"
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-[9px] font-bold tracking-tight uppercase">Nova</span>
        </button>

        {/* DASH / DODGE (Lower-Left Outer Arc) */}
        <button
          type="button"
          {...bindTapButton('dash', onDash, 10)}
          className={`pointer-events-auto absolute right-[176px] bottom-[10px] flex h-[50px] w-[50px] flex-col items-center justify-center rounded-full border-2 bg-[#090d16]/80 shadow-lg transition-transform duration-75 touch-none ${
            canDash
              ? 'border-emerald-400/65 text-emerald-200'
              : 'border-white/12 text-slate-500 opacity-55'
          }`}
          style={{
            transform: pressedMap.dash ? 'scale(0.9)' : 'scale(1)',
          }}
          aria-label="Dash"
        >
          <Wind className="h-4 w-4" />
          <span className="text-[9px] font-bold tracking-tight uppercase">Dash</span>
        </button>

        {/* GUARD / PERFECT PARRY (Hold to charge Aegis Nova!) */}
        <button
          type="button"
          {...bindHoldButton('guard', onGuard, 10)}
          className={`pointer-events-auto absolute right-[104px] bottom-[66px] flex h-[56px] w-[56px] flex-col items-center justify-center rounded-full border-2 bg-[#090d16]/82 shadow-lg transition-transform duration-75 touch-none ${
            hud.guardCharge >= 0.95
              ? 'border-amber-300 text-amber-200'
              : pressedMap.guard
                ? 'border-fuchsia-300 bg-fuchsia-500/25 text-white'
                : 'border-indigo-300/65 text-indigo-200'
          }`}
          style={{
            transform: pressedMap.guard ? 'scale(0.91)' : 'scale(1)',
          }}
          aria-label="Guard and Parry (Hold for Aegis Nova)"
        >
          <RadialChargeRing
            size={56}
            progress={hud.guardCharge}
            color={hud.guardCharge >= 0.95 ? '#facc15' : '#e879f9'}
            strokeWidth={3.5}
          />
          <Shield className="h-5 w-5" />
          <span className="text-[9px] font-bold tracking-tight uppercase">Parry</span>
        </button>

        {/* JUMP / DOUBLE JUMP (Bottom Arc — ergonomic thumb roll from Attack) */}
        <button
          type="button"
          {...bindHoldButton('jump', onJump, 8)}
          className={`pointer-events-auto absolute right-[100px] bottom-[2px] flex h-[60px] w-[60px] flex-col items-center justify-center rounded-full border-2 bg-[#090d16]/84 shadow-xl transition-transform duration-75 touch-none ${
            pressedMap.jump
              ? 'border-amber-300 bg-amber-400/25 text-amber-100'
              : 'border-amber-300/70 text-amber-200'
          }`}
          style={{
            transform: pressedMap.jump ? 'scale(0.91)' : 'scale(1)',
          }}
          aria-label="Jump"
        >
          <ArrowUp className="h-5 w-5" />
          <span className="text-[9px] font-bold tracking-wide uppercase">Jump</span>
        </button>

        {/* PRIMARY ATTACK (Largest Button — Tap 5-Hit Combo, Hold for Aether Wave) */}
        <button
          type="button"
          {...bindHoldButton('attack', onAttack, 12)}
          className={`pointer-events-auto absolute right-[4px] bottom-[10px] flex h-[74px] w-[74px] flex-col items-center justify-center rounded-full border-2 shadow-2xl transition-transform duration-75 touch-none ${
            hud.attackCharge >= 0.95
              ? 'border-amber-300 bg-amber-500/30 text-amber-100'
              : pressedMap.attack
                ? 'border-sky-300 bg-sky-500/35 text-white'
                : 'border-sky-400/85 bg-[#0b1628]/88 text-sky-100'
          }`}
          style={{
            transform: pressedMap.attack ? 'scale(0.91)' : 'scale(1)',
          }}
          aria-label="Attack Combo (Hold for Aether Wave)"
        >
          <RadialChargeRing
            size={74}
            progress={hud.attackCharge}
            color={hud.attackCharge >= 0.95 ? '#facc15' : '#38bdf8'}
            strokeWidth={4}
          />
          <Swords className="h-7 w-7" />
          <span className="mt-0.5 text-[10px] font-extrabold tracking-wider uppercase">
            {hud.attackCharge > 0.15 ? 'WAVE' : 'ATK'}
          </span>
        </button>
      </div>
    </div>
  );
};
