"use client";

import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import GameScene from '../game/GameScene';
import nipplejs from 'nipplejs';
import { Bomb } from 'lucide-react';

// Extend window to hold mobile input state for Phaser to read easily
declare global {
  interface Window {
    mobileInput: {
      up: boolean;
      down: boolean;
      left: boolean;
      right: boolean;
      bomb: boolean;
    };
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
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Initialize global input state
    window.mobileInput = { up: false, down: false, left: false, right: false, bomb: false };

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
            debug: false
          }
        },
        scene: [GameScene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        },
        // Make background transparent if we want react background
        backgroundColor: '#87CEEB',
      };

      phaserGameRef.current = new Phaser.Game(config);
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
    };
  }, []);

  // Initialize NippleJS
  useEffect(() => {
    if (isMobile && joystickRef.current) {
      const manager = nipplejs.create({
        zone: joystickRef.current,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white',
        size: 100
      });

      (manager as any).on('move', (evt: any, data: any) => {
        const angle = data.angle.degree;
        window.mobileInput.up = angle > 45 && angle < 135;
        window.mobileInput.down = angle > 225 && angle < 315;
        window.mobileInput.left = angle > 135 && angle < 225;
        window.mobileInput.right = (angle >= 0 && angle <= 45) || (angle >= 315 && angle <= 360);
      });

      (manager as any).on('end', () => {
        window.mobileInput = { ...window.mobileInput, up: false, down: false, left: false, right: false };
      });

      return () => manager.destroy();
    }
  }, [isMobile]);

  const handleBombPress = () => {
    window.mobileInput.bomb = true;
    setTimeout(() => {
      window.mobileInput.bomb = false;
    }, 100);
  };

  return (
    <div className="relative flex flex-col justify-center items-center w-full h-screen bg-gray-900 overflow-hidden select-none">
      <div 
        ref={gameRef} 
        className="w-full max-w-4xl max-h-screen overflow-hidden rounded-lg shadow-2xl" 
        style={{ aspectRatio: '4/3' }}
      />
      
      {/* Mobile Controls Overlay */}
      {isMobile && (
        <div className="absolute bottom-10 left-0 w-full px-8 flex justify-between items-center z-50">
          {/* Joystick Area */}
          <div className="relative w-32 h-32 bg-white/10 rounded-full" ref={joystickRef}></div>
          
          {/* Bomb Button */}
          <button 
            onPointerDown={handleBombPress}
            className="w-24 h-24 bg-red-500 rounded-full border-4 border-red-700 shadow-[0_0_15px_rgba(255,0,0,0.5)] flex items-center justify-center active:scale-95 active:bg-red-600 transition-transform"
          >
            <Bomb size={40} className="text-white drop-shadow-md" />
          </button>
        </div>
      )}
    </div>
  );
}
