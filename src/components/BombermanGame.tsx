"use client";

import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import GameScene from '../game/GameScene';
import nipplejs from 'nipplejs';
import { Bomb, Flame, Gamepad2, Sparkles, Keyboard, Smartphone } from 'lucide-react';

// Extend window to hold mobile & unified input state for Phaser to read easily
export interface MobileInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  bomb: boolean;
}

declare global {
  interface Window {
    mobileInput: MobileInputState;
  }
}

export default function BombermanGame() {
  const gameRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if mobile based on touch support or screen size
    const checkMobile = () => {
      setIsMobile(
        window.innerWidth < 768 ||
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0
      );
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Initialize global input state
    window.mobileInput = { up: false, down: false, left: false, right: false, bomb: false };

    // Keyboard controls (Arrow keys + WASD + Spacebar)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!window.mobileInput) return;
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) || e.code === 'Space') {
        e.preventDefault();
      }

      if (key === 'w' || key === 'arrowup') window.mobileInput.up = true;
      if (key === 's' || key === 'arrowdown') window.mobileInput.down = true;
      if (key === 'a' || key === 'arrowleft') window.mobileInput.left = true;
      if (key === 'd' || key === 'arrowright') window.mobileInput.right = true;
      if (key === ' ' || e.code === 'Space') {
        window.mobileInput.bomb = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!window.mobileInput) return;
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') window.mobileInput.up = false;
      if (key === 's' || key === 'arrowdown') window.mobileInput.down = false;
      if (key === 'a' || key === 'arrowleft') window.mobileInput.left = false;
      if (key === 'd' || key === 'arrowright') window.mobileInput.right = false;
      if (key === ' ' || e.code === 'Space') {
        window.mobileInput.bomb = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    if (typeof window !== 'undefined' && gameRef.current && !phaserGameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        parent: gameRef.current,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { y: 0, x: 0 },
            debug: false,
          },
        },
        scene: [GameScene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        backgroundColor: '#1e293b',
      };

      phaserGameRef.current = new Phaser.Game(config);
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
    };
  }, []);

  // Initialize NippleJS for mobile touch joystick
  useEffect(() => {
    if (isMobile && joystickRef.current) {
      const manager = nipplejs.create({
        zone: joystickRef.current,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white',
        size: 100,
      });

      manager.on('move', (evt) => {
        const angle = evt.data.angle.degree;
        window.mobileInput.up = angle > 45 && angle < 135;
        window.mobileInput.down = angle > 225 && angle < 315;
        window.mobileInput.left = angle > 135 && angle < 225;
        window.mobileInput.right = (angle >= 0 && angle <= 45) || (angle >= 315 && angle <= 360);
      });

      manager.on('end', () => {
        window.mobileInput = { ...window.mobileInput, up: false, down: false, left: false, right: false };
      });

      return () => {
        manager.destroy();
      };
    }
  }, [isMobile]);

  const handleBombPress = () => {
    if (window.mobileInput) {
      window.mobileInput.bomb = true;
      setTimeout(() => {
        if (window.mobileInput) {
          window.mobileInput.bomb = false;
        }
      }, 100);
    }
  };

  return (
    <div className="relative flex flex-col justify-between items-center w-full min-h-screen bg-gradient-to-b from-slate-950 via-gray-900 to-slate-950 text-white overflow-hidden select-none px-2 py-3 sm:px-4 sm:py-4">
      {/* Retro Arcade Cabinet Header / Marquee */}
      <header className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/60 shadow-[0_0_20px_rgba(59,130,246,0.15)] z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 shadow-[0_0_12px_rgba(245,158,11,0.5)] border border-amber-300/40">
            <Bomb className="w-6 h-6 text-white drop-shadow-md animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-wider uppercase bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                Bomberman Arcade
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 tracking-wider">
                <Sparkles className="w-3 h-3 text-rose-400" /> CLASSIC 1983
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Gamepad2 className="w-3 h-3 text-emerald-400" />
              <span>Stage 1 • Dodge tracking enemies & blast blocks!</span>
            </p>
          </div>
        </div>

        {/* Controls Guide Badge */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Desktop Controls Pills */}
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-300 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg shadow-inner">
            <Keyboard className="w-4 h-4 text-cyan-400" />
            <span className="flex items-center gap-1 font-mono">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-amber-300 text-[11px] shadow-sm">Arrow Keys</kbd>
              <span className="text-slate-500">/</span>
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-amber-300 text-[11px] shadow-sm">WASD</kbd>
              <span className="text-slate-400 ml-0.5">Move</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 font-mono">
              <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-rose-300 text-[11px] shadow-sm">Spacebar</kbd>
              <span className="text-slate-400 ml-0.5">Plant Bomb</span>
            </span>
          </div>

          {/* Mobile Badge */}
          <div className="flex md:hidden items-center gap-1.5 text-xs text-cyan-300 bg-cyan-950/40 border border-cyan-700/50 px-2.5 py-1 rounded-lg">
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>Touch Controls Active</span>
          </div>
        </div>
      </header>

      {/* Arcade Cabinet Screen Framing */}
      <main className="relative flex-1 flex items-center justify-center w-full max-w-4xl py-2 my-auto">
        <div className="relative w-full max-h-[72vh] sm:max-h-[76vh] flex items-center justify-center p-2 sm:p-3 rounded-2xl bg-gradient-to-b from-slate-800 via-slate-900 to-black border-4 border-slate-700/70 shadow-[0_0_35px_rgba(59,130,246,0.25),0_0_70px_rgba(168,85,247,0.15)] ring-1 ring-white/10">
          {/* Corner Rivet Screws */}
          <div className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-400/40 shadow-inner" />
          <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-400/40 shadow-inner" />
          <div className="absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-400/40 shadow-inner" />
          <div className="absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-400/40 shadow-inner" />

          {/* Canvas Viewport */}
          <div 
            ref={gameRef} 
            className="w-full h-full overflow-hidden rounded-xl border-2 border-slate-950 bg-black shadow-inner relative" 
            style={{ aspectRatio: '4/3' }}
          />
        </div>
      </main>

      {/* Footer / Status Marquee */}
      <footer className="w-full max-w-4xl flex items-center justify-between px-4 py-1.5 text-xs text-slate-400 z-10">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-mono text-emerald-400 font-semibold tracking-wider">CREDIT 01</span>
          <span className="hidden sm:inline text-slate-600">•</span>
          <span className="hidden sm:inline font-mono text-amber-300">1P READY</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-mono">
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>RETRO COIN-OP EDITION</span>
        </div>
      </footer>

      {/* Mobile Controls Overlay */}
      {isMobile && (
        <div className="fixed bottom-4 left-0 w-full px-6 pb-2 flex justify-between items-end z-50 pointer-events-none">
          {/* Virtual Joystick Plate */}
          <div className="pointer-events-auto flex flex-col items-center gap-1">
            <div 
              ref={joystickRef} 
              className="relative w-32 h-32 bg-slate-900/70 backdrop-blur-md rounded-full border-2 border-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.3)] touch-none"
            />
            <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400/80">Move Stick</span>
          </div>
          
          {/* Bomb Button */}
          <div className="pointer-events-auto flex flex-col items-center gap-1">
            <button 
              type="button"
              onPointerDown={handleBombPress}
              aria-label="Plant Bomb"
              className="w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-tr from-rose-600 via-red-500 to-amber-500 rounded-full border-4 border-red-900 shadow-[0_0_25px_rgba(239,68,68,0.7),inset_0_3px_6px_rgba(255,255,255,0.4)] flex flex-col items-center justify-center active:scale-95 active:brightness-90 transition-all select-none touch-none cursor-pointer"
            >
              <Bomb size={36} className="text-white drop-shadow-md" />
              <span className="text-xs font-black tracking-wider text-white drop-shadow">BOMB</span>
            </button>
            <span className="text-[10px] font-mono uppercase tracking-widest text-rose-400/80">Plant Bomb</span>
          </div>
        </div>
      )}
    </div>
  );
}
