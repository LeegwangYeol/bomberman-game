"use client";

import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import GameScene from '../game/GameScene';
import {
  PlayerStats,
  createInitialPlayerStats,
  ITEM_DEFINITIONS,
  ItemType,
  ItemDefinition,
} from '../game/gameplay_mechanics';
import nipplejs from 'nipplejs';
import { Bomb, Flame, Gamepad2, Sparkles, Keyboard, Smartphone, Zap, Shield, Trophy, Package, X, Heart } from 'lucide-react';

// Extend window to hold mobile & unified input state for Phaser to read easily
export interface MobileInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  bomb: boolean;
  dash: boolean;
  ultimate: boolean;
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

  // Real-time Player Stats updated via Phaser game.events
  const [stats, setStats] = useState<PlayerStats>(createInitialPlayerStats());
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [selectedMobileItem, setSelectedMobileItem] = useState<(ItemDefinition & { count: number }) | null>(null);
  const [hoveredDesktopItem, setHoveredDesktopItem] = useState<(ItemDefinition & { count: number }) | null>(null);

  // Derive dynamic list of collected items
  const collectedItems = Object.entries(stats.inventory || {})
    .filter(([, count]) => (count as number) > 0)
    .map(([id, count]) => {
      const def = ITEM_DEFINITIONS[id as ItemType];
      return {
        ...(def || {
          id: id as ItemType,
          name: id,
          category: 'stat' as const,
          rarity: 'common' as const,
          iconKey: `item_${id.toLowerCase()}`,
          description: '',
          mechanics: '',
          badge: id,
          color: '#94a3b8',
          bgColor: 0x334155,
          ringColor: 0x94a3b8,
        }),
        count: count as number,
      };
    });

  const getRarityBadgeStyle = (rarity: string) => {
    switch (rarity) {
      case 'epic':
        return {
          badge: 'bg-purple-900/60 text-purple-300 border-purple-500/50',
          border: 'border-purple-500/60',
          bg: 'bg-purple-950/40',
          text: 'text-purple-300',
          glow: 'shadow-[0_0_12px_rgba(192,132,252,0.35)]',
        };
      case 'rare':
        return {
          badge: 'bg-cyan-900/60 text-cyan-300 border-cyan-500/50',
          border: 'border-cyan-500/60',
          bg: 'bg-cyan-950/40',
          text: 'text-cyan-300',
          glow: 'shadow-[0_0_12px_rgba(56,189,248,0.35)]',
        };
      case 'uncommon':
        return {
          badge: 'bg-emerald-900/60 text-emerald-300 border-emerald-500/50',
          border: 'border-emerald-500/60',
          bg: 'bg-emerald-950/40',
          text: 'text-emerald-300',
          glow: 'shadow-[0_0_12px_rgba(74,222,128,0.35)]',
        };
      case 'common':
      default:
        return {
          badge: 'bg-slate-800/80 text-slate-300 border-slate-600/50',
          border: 'border-slate-700',
          bg: 'bg-slate-900/60',
          text: 'text-slate-300',
          glow: '',
        };
    }
  };

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
    window.mobileInput = { up: false, down: false, left: false, right: false, bomb: false, dash: false, ultimate: false };

    // Keyboard controls (Arrow keys + WASD + Spacebar + Shift/E + R/Q)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!window.mobileInput) return;
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'e', 'r', 'q'].includes(key) || e.code === 'Space') {
        e.preventDefault();
      }

      if (key === 'w' || key === 'arrowup') window.mobileInput.up = true;
      if (key === 's' || key === 'arrowdown') window.mobileInput.down = true;
      if (key === 'a' || key === 'arrowleft') window.mobileInput.left = true;
      if (key === 'd' || key === 'arrowright') window.mobileInput.right = true;
      if (key === ' ' || e.code === 'Space') {
        window.mobileInput.bomb = true;
      }
      if (key === 'shift' || key === 'e') {
        window.mobileInput.dash = true;
      }
      if (key === 'r' || key === 'q') {
        window.mobileInput.ultimate = true;
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
      if (key === 'shift' || key === 'e') {
        window.mobileInput.dash = false;
      }
      if (key === 'r' || key === 'q') {
        window.mobileInput.ultimate = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let handleStatsUpdate: ((newStats: PlayerStats) => void) | null = null;

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

      const phaserGame = new Phaser.Game(config);
      phaserGameRef.current = phaserGame;

      // Event listener bridge for real-time stats
      handleStatsUpdate = (newStats: PlayerStats) => {
        setStats(newStats);
      };
      phaserGame.events.on('stats-update', handleStatsUpdate);
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (phaserGameRef.current) {
        if (handleStatsUpdate) {
          phaserGameRef.current.events.off('stats-update', handleStatsUpdate);
        }
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

  const handleDashPress = () => {
    if (window.mobileInput) {
      window.mobileInput.dash = true;
      setTimeout(() => {
        if (window.mobileInput) {
          window.mobileInput.dash = false;
        }
      }, 100);
    }
  };

  const handleUltimatePress = () => {
    if (window.mobileInput) {
      if (stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0) {
        window.mobileInput.ultimate = true;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([40, 20, 40]);
          } catch {}
        }
        setTimeout(() => {
          if (window.mobileInput) {
            window.mobileInput.ultimate = false;
          }
        }, 150);
      }
    }
  };

  const handleUltimateRelease = () => {
    if (window.mobileInput) {
      window.mobileInput.ultimate = false;
    }
  };

  return (
    <div className="relative flex flex-col justify-between items-center w-full min-h-screen bg-gradient-to-b from-slate-950 via-gray-900 to-slate-950 text-white overflow-hidden select-none px-2 py-2 sm:px-4 sm:py-3">
      {/* Retro Arcade Cabinet Header / Marquee */}
      <header className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-2 px-4 py-2 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/60 shadow-[0_0_20px_rgba(59,130,246,0.15)] z-20">
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
              <span>Dodge enemies, gather power-ups & blast blocks!</span>
            </p>
          </div>
        </div>

        {/* Controls Guide Badge */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Desktop Controls Pills */}
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-300 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg shadow-inner">
            <Keyboard className="w-4 h-4 text-cyan-400" />
            <span className="flex items-center gap-1 font-mono">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-amber-300 text-[11px] shadow-sm">WASD</kbd>
              <span className="text-slate-400 text-[11px]">Move</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 font-mono">
              <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-rose-300 text-[11px] shadow-sm">Space</kbd>
              <span className="text-slate-400 text-[11px]">Bomb</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 font-mono">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-cyan-300 text-[11px] shadow-sm">Shift/E</kbd>
              <span className="text-slate-400 text-[11px]">Dash</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 font-mono">
              <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-amber-300 text-[11px] shadow-sm">R/Q</kbd>
              <span className="text-slate-400 text-[11px]">Ult</span>
            </span>
          </div>

          {/* Mobile Badge */}
          <div className="flex md:hidden items-center gap-1.5 text-xs text-cyan-300 bg-cyan-950/40 border border-cyan-700/50 px-2.5 py-1 rounded-lg">
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>Touch Controls</span>
          </div>
        </div>
      </header>

      {/* Real-Time Retro Arcade HUD Bar */}
      <section className="w-full max-w-4xl flex flex-col gap-1.5 px-3 py-2 my-1 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-800 shadow-md z-20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Core Gauges: Bombs, Fire, Speed, Ultimate */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Bombs Gauge */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-rose-900/60 shadow-inner">
              <Bomb className="w-4 h-4 text-rose-400 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400">BOMBS</span>
                <span className="text-xs font-mono font-bold text-amber-300">
                  {stats.activeBombs} <span className="text-slate-500">/</span> {stats.maxBombs}
                </span>
              </div>
            </div>

            {/* Fire Power Gauge */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-orange-900/60 shadow-inner">
              <Flame className="w-4 h-4 text-orange-400" />
              <div className="flex flex-col">
                <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400">FIRE</span>
                <span className="text-xs font-mono font-bold text-orange-400">
                  Lv. {stats.bombPower}
                </span>
              </div>
            </div>

            {/* Speed Gauge */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-cyan-900/60 shadow-inner">
              <Zap className="w-4 h-4 text-cyan-400" />
              <div className="flex flex-col">
                <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400">SPEED</span>
                <span className="text-xs font-mono font-bold text-cyan-300">
                  {stats.speed} <span className="text-[10px] text-slate-500 font-normal">px/s (Lv. {stats.speedLevel})</span>
                </span>
              </div>
            </div>

            {/* Ultimate Energy Gauge Bar */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-950/90 border shadow-inner relative overflow-hidden min-w-[170px] ${
              stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0
                ? 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.6)]'
                : 'border-slate-800'
            }`}>
              {/* Shimmer sweep line when ready */}
              {stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0 && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse pointer-events-none" />
              )}

              <div className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/20 text-amber-300">
                <span className="text-xs">👑</span>
              </div>

              <div className="flex flex-col flex-1">
                <div className="flex justify-between items-center text-[8px] font-mono uppercase tracking-wider">
                  <span className={stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0 ? 'text-amber-300 font-bold animate-pulse' : 'text-slate-400'}>
                    ULT {stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0 ? '(R/Q)' : ''}
                  </span>
                  <span className="font-bold text-amber-400">
                    {Math.floor(stats.ultimateGauge)}%
                  </span>
                </div>

                {/* Golden Progress Bar Container */}
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80 mt-0.5 relative">
                  <div 
                    className={`h-full transition-all duration-150 rounded-full ${
                      stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0
                        ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 shadow-[0_0_10px_rgba(245,158,11,0.8)] animate-pulse' 
                        : 'bg-gradient-to-r from-amber-600 to-amber-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, stats.ultimateGauge))}%` }}
                  />
                </div>
              </div>

              {/* Ready Indicator or Lockout Countdown */}
              {stats.ultimateLockoutRemaining > 0 ? (
                <span className="text-[9px] font-mono text-rose-400 font-bold">
                  {(stats.ultimateLockoutRemaining / 1000).toFixed(1)}s
                </span>
              ) : stats.ultimateGauge >= 100 ? (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black tracking-wider animate-bounce">
                  READY
                </span>
              ) : null}
            </div>
          </div>

          {/* Skills & Perks Badges: Dash, Kick, Shield, Extra Lives, Score */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Dash Skill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-800 shadow-inner">
              <span className="text-xs">💨</span>
              <div className="flex flex-col">
                <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400">DASH</span>
                <span className={`text-[11px] font-mono font-bold ${stats.dashCooldownRemaining === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {stats.dashCooldownRemaining === 0 ? 'READY' : `${(stats.dashCooldownRemaining / 1000).toFixed(1)}s`}
                </span>
              </div>
            </div>

            {/* Kick Skill */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-inner ${stats.hasKick ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : 'bg-slate-950/50 border-slate-800/80 text-slate-500'}`}>
              <span className="text-xs">👟</span>
              <div className="flex flex-col">
                <span className="text-[8px] font-mono uppercase tracking-wider">KICK</span>
                <span className="text-[10px] font-mono font-bold">{stats.hasKick ? 'ACTIVE' : 'LOCKED'}</span>
              </div>
            </div>

            {/* Shield */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-inner ${stats.hasShield ? 'bg-amber-950/40 border-amber-500/50 text-amber-300' : 'bg-slate-950/50 border-slate-800/80 text-slate-500'}`}>
              <Shield className={`w-3.5 h-3.5 ${stats.hasShield ? 'text-amber-400 animate-pulse' : 'text-slate-600'}`} />
              <div className="flex flex-col">
                <span className="text-[8px] font-mono uppercase tracking-wider">SHIELD</span>
                <span className="text-[10px] font-mono font-bold">
                  {stats.hasShield ? `${stats.shieldCharges}/${stats.maxShields}` : 'OFF'}
                </span>
              </div>
            </div>

            {/* Extra Lives (1-UP) */}
            {stats.extraLives > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-500/50 text-rose-300 shadow-inner">
                <Heart className="w-3.5 h-3.5 text-rose-400 animate-pulse fill-rose-500" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-mono uppercase tracking-wider">LIFE</span>
                  <span className="text-[10px] font-mono font-bold">+{stats.extraLives}</span>
                </div>
              </div>
            )}

            {/* Score Display */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold shadow-[0_0_8px_rgba(245,158,11,0.2)]">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>{stats.score.toString().padStart(6, '0')}</span>
            </div>
          </div>
        </div>

        {/* Row 2: Desktop Equipment Shelf & Active Buffs Bar */}
        <div className="hidden sm:flex items-center justify-between gap-3 pt-1 border-t border-slate-800/70 w-full">
          {/* Equipment Tray / Inventory */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
              <Package className="w-3.5 h-3.5 text-amber-400" />
              <span>ARSENAL ({collectedItems.length}):</span>
            </div>

            {collectedItems.length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {collectedItems.map((item) => {
                  const style = getRarityBadgeStyle(item.rarity);
                  return (
                    <div
                      key={item.id}
                      className="relative group cursor-pointer"
                      onMouseEnter={() => setHoveredDesktopItem(item)}
                      onMouseLeave={() => setHoveredDesktopItem(null)}
                    >
                      <div
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-mono transition-all hover:scale-105 ${style.bg} ${style.border} ${style.text} ${style.glow}`}
                      >
                        <span>{item.badge}</span>
                        {item.count > 1 && (
                          <span className="text-[10px] font-bold text-amber-400">x{item.count}</span>
                        )}
                      </div>

                      {/* Floating Glassmorphic Tooltip Card */}
                      {hoveredDesktopItem?.id === item.id && (
                        <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-3 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-[0_4px_24px_rgba(0,0,0,0.85)] pointer-events-none animate-fadeIn flex flex-col gap-1.5">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                            <span className="font-bold text-xs text-white flex items-center gap-1">
                              <span>{item.badge.split(' ')[0]}</span>
                              <span>{item.name}</span>
                            </span>
                            <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded uppercase border ${style.badge}`}>
                              {item.rarity}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                            {item.category.toUpperCase()} MODIFIER
                          </div>
                          <p className="text-[11px] text-emerald-300 font-medium leading-tight">
                            {item.mechanics}
                          </p>
                          <p className="text-[10px] text-slate-400 italic leading-snug">
                            {item.description}
                          </p>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                            <span>Quantity</span>
                            <span className="text-amber-400 font-bold">x{item.count}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <span className="text-[11px] font-mono text-slate-500 italic">
                Equipment tray empty — blast blocks to gather power-ups!
              </span>
            )}
          </div>

          {/* Active Buffs (Desktop) */}
          {stats.activeBuffs && stats.activeBuffs.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">BUFFS:</span>
              <div className="flex items-center gap-1.5">
                {stats.activeBuffs.map((buff) => (
                  <div
                    key={buff.id}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/50 border border-amber-500/60 text-amber-300 text-xs font-mono animate-pulse"
                  >
                    <span>{buff.icon}</span>
                    <span className="text-[10px] font-bold">{buff.name}</span>
                    <span className="text-[9px] text-amber-400 font-bold">
                      {(buff.remainingMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Quick Bar: Inventory Drawer Toggle & Buffs */}
        <div className="flex sm:hidden items-center justify-between gap-2 pt-1 border-t border-slate-800/60 w-full">
          <button
            type="button"
            onClick={() => setIsInventoryOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-amber-500/40 text-amber-300 font-mono text-xs active:scale-95 transition-all cursor-pointer"
          >
            <Package className="w-3.5 h-3.5 text-amber-400" />
            <span>🎒 ARSENAL ({collectedItems.length})</span>
          </button>

          {stats.activeBuffs && stats.activeBuffs.length > 0 && (
            <div className="flex items-center gap-1">
              {stats.activeBuffs.map((buff) => (
                <span
                  key={buff.id}
                  className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/50 text-[10px] font-mono text-amber-300"
                >
                  {buff.icon} {(buff.remainingMs / 1000).toFixed(0)}s
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Arcade Cabinet Screen Framing */}
      <main className="relative flex-1 flex items-center justify-center w-full max-w-4xl py-1 my-auto">
        <div className="relative w-full max-h-[70vh] sm:max-h-[74vh] flex items-center justify-center p-2 sm:p-3 rounded-2xl bg-gradient-to-b from-slate-800 via-slate-900 to-black border-4 border-slate-700/70 shadow-[0_0_35px_rgba(59,130,246,0.25),0_0_70px_rgba(168,85,247,0.15)] ring-1 ring-white/10">
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
      <footer className="w-full max-w-4xl flex items-center justify-between px-4 py-1 text-xs text-slate-400 z-10">
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
        <div className="fixed bottom-3 left-0 w-full px-5 pb-2 flex justify-between items-end z-50 pointer-events-none">
          {/* Virtual Joystick Plate */}
          <div className="pointer-events-auto flex flex-col items-center gap-1">
            <div 
              ref={joystickRef} 
              className="relative w-28 h-28 sm:w-32 sm:h-32 bg-slate-900/70 backdrop-blur-md rounded-full border-2 border-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.3)] touch-none"
            />
            <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400/80">Move Stick</span>
          </div>

          {/* Center Utility Button: Inventory Drawer Toggle */}
          <div className="pointer-events-auto flex flex-col items-center gap-1 mb-2">
            <button 
              type="button"
              onClick={() => setIsInventoryOpen(true)}
              aria-label="Open Inventory Drawer"
              className="w-14 h-14 bg-gradient-to-tr from-slate-900 via-slate-800 to-indigo-950 rounded-2xl border-2 border-amber-400/60 shadow-[0_0_15px_rgba(245,158,11,0.4)] flex flex-col items-center justify-center active:scale-95 transition-all select-none touch-none cursor-pointer"
            >
              <Package size={22} className="text-amber-400 drop-shadow-md" />
              <span className="text-[8px] font-black tracking-wider text-amber-300">
                INV {collectedItems.length > 0 ? `(${collectedItems.length})` : ''}
              </span>
            </button>
            <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400/80">Arsenal</span>
          </div>
          
          {/* Action Buttons: ULT + DASH + BOMB */}
          <div className="pointer-events-auto flex items-end gap-3">
            {/* Ultimate Button (64px, Golden Crown) */}
            <div className="flex flex-col items-center gap-1 -translate-y-3">
              <button
                type="button"
                onPointerDown={handleUltimatePress}
                onPointerUp={handleUltimateRelease}
                disabled={stats.ultimateGauge < 100 || stats.ultimateLockoutRemaining > 0}
                aria-label="Ultimate Skill"
                className={`w-16 h-16 rounded-full border-3 flex flex-col items-center justify-center transition-all select-none touch-none cursor-pointer ${
                  stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0
                    ? 'bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-600 border-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.85),inset_0_2px_4px_rgba(255,255,255,0.5)] scale-105 animate-pulse'
                    : 'bg-slate-900/85 border-slate-700 text-slate-500 opacity-60 grayscale'
                }`}
              >
                <span className="text-xl drop-shadow">👑</span>
                <span className="text-[8px] font-black tracking-wider text-white drop-shadow">
                  {stats.ultimateGauge >= 100 && stats.ultimateLockoutRemaining <= 0 ? 'ULT' : `${Math.floor(stats.ultimateGauge)}%`}
                </span>
              </button>
              <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400/80">
                {stats.ultimateLockoutRemaining > 0 ? `${(stats.ultimateLockoutRemaining / 1000).toFixed(1)}s` : 'Ult'}
              </span>
            </div>

            {/* Dash Button */}
            <div className="flex flex-col items-center gap-1">
              <button 
                type="button"
                onPointerDown={handleDashPress}
                aria-label="Dash"
                className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-tr from-cyan-600 via-blue-500 to-indigo-600 rounded-full border-3 border-cyan-900 shadow-[0_0_20px_rgba(6,182,212,0.6),inset_0_3px_6px_rgba(255,255,255,0.4)] flex flex-col items-center justify-center active:scale-95 active:brightness-90 transition-all select-none touch-none cursor-pointer"
              >
                <Zap size={24} className="text-white drop-shadow-md" />
                <span className="text-[9px] font-black tracking-wider text-white drop-shadow">DASH</span>
              </button>
              <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-400/80">Dash</span>
            </div>

            {/* Bomb Button */}
            <div className="flex flex-col items-center gap-1">
              <button 
                type="button"
                onPointerDown={handleBombPress}
                aria-label="Plant Bomb"
                className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-tr from-rose-600 via-red-500 to-amber-500 rounded-full border-4 border-red-900 shadow-[0_0_25px_rgba(239,68,68,0.7),inset_0_3px_6px_rgba(255,255,255,0.4)] flex flex-col items-center justify-center active:scale-95 active:brightness-90 transition-all select-none touch-none cursor-pointer"
              >
                <Bomb size={30} className="text-white drop-shadow-md" />
                <span className="text-[10px] font-black tracking-wider text-white drop-shadow">BOMB</span>
              </button>
              <span className="text-[9px] font-mono uppercase tracking-widest text-rose-400/80">Plant</span>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Mobile / Screen Inventory Drawer */}
      {isInventoryOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm pointer-events-auto">
          {/* Backdrop dismiss click */}
          <div
            className="flex-1 w-full cursor-pointer"
            onClick={() => {
              setIsInventoryOpen(false);
              setSelectedMobileItem(null);
            }}
          />

          <div className="w-full max-h-[75vh] bg-slate-900/95 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-4 shadow-2xl flex flex-col gap-3 overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold font-mono text-white tracking-wider">
                  ARSENAL & INVENTORY
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono font-bold">
                  {collectedItems.length} items
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsInventoryOpen(false);
                  setSelectedMobileItem(null);
                }}
                aria-label="Close inventory"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selected Item Detail Inspector */}
            {selectedMobileItem ? (
              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col gap-1.5 shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{selectedMobileItem.badge.split(' ')[0]}</span>
                    <div>
                      <h3 className="font-bold text-sm text-white">{selectedMobileItem.name}</h3>
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                        {selectedMobileItem.category} modifier
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded uppercase border ${
                        getRarityBadgeStyle(selectedMobileItem.rarity).badge
                      }`}
                    >
                      {selectedMobileItem.rarity}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      x{selectedMobileItem.count}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-emerald-300 font-medium leading-relaxed">
                  {selectedMobileItem.mechanics}
                </p>
                <p className="text-[11px] text-slate-400 italic">
                  {selectedMobileItem.description}
                </p>
              </div>
            ) : (
              <div className="py-2.5 px-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-400 font-mono">
                Tap any item below to inspect detailed stats, lore & mechanics.
              </div>
            )}

            {/* Grid of collected items with 48px touch targets */}
            <div className="overflow-y-auto max-h-[40vh] pr-1 grid grid-cols-4 sm:grid-cols-6 gap-2.5 pb-2">
              {collectedItems.map((item) => {
                const style = getRarityBadgeStyle(item.rarity);
                const isSelected = selectedMobileItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedMobileItem(item)}
                    className={`min-h-[48px] min-w-[48px] p-2 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-950/40 ring-2 ring-amber-400/40'
                        : `${style.border} ${style.bg} hover:brightness-125`
                    }`}
                  >
                    <span className="text-lg">{item.badge.split(' ')[0]}</span>
                    <span className="text-[10px] font-mono font-bold text-slate-200 truncate max-w-full">
                      x{item.count}
                    </span>
                  </button>
                );
              })}

              {collectedItems.length === 0 && (
                <div className="col-span-full py-8 text-center text-xs font-mono text-slate-500">
                  No items collected yet.
                  <br />
                  Blast destructible blocks or discover golden chests to collect power-ups!
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
