import type Phaser from 'phaser';

/**
 * Procedural texture generation for 24 distinct items and game juice assets (particles, drop shadows).
 * Zero external image dependencies — renders sharp 32x32 canvases with graceful graphics fallbacks.
 */

export function generateItemTextures(scene: Phaser.Scene): void {
  if (!scene.textures) return;

  const itemDefs: Array<{
    key: string;
    bgColor: number;
    ringColor: number;
    drawGlyph: (ctx: CanvasRenderingContext2D) => void;
  }> = [
    {
      key: 'item_speed',
      bgColor: 0x06b6d4,
      ringColor: 0x22d3ee,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(10, 22); ctx.lineTo(18, 12); ctx.lineTo(14, 12); ctx.lineTo(20, 8);
        ctx.lineTo(13, 16); ctx.lineTo(17, 16); ctx.closePath();
        ctx.fill();
      },
    },
    {
      key: 'item_bomb',
      bgColor: 0x334155,
      ringColor: 0x94a3b8,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(16, 18, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(16, 11); ctx.quadraticCurveTo(18, 8, 21, 9);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(21, 9, 2, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      key: 'item_fire',
      bgColor: 0xe11d48,
      ringColor: 0xfb7185,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(16, 8);
        ctx.quadraticCurveTo(22, 14, 20, 22);
        ctx.quadraticCurveTo(16, 25, 12, 22);
        ctx.quadraticCurveTo(10, 14, 16, 8);
        ctx.fill();
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(16, 13);
        ctx.quadraticCurveTo(19, 17, 18, 22);
        ctx.quadraticCurveTo(16, 24, 14, 22);
        ctx.quadraticCurveTo(13, 17, 16, 13);
        ctx.fill();
      },
    },
    {
      key: 'item_kick',
      bgColor: 0x16a34a,
      ringColor: 0x4ade80,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(10, 10); ctx.lineTo(15, 10); ctx.lineTo(15, 17); ctx.lineTo(22, 17);
        ctx.lineTo(23, 22); ctx.lineTo(10, 22); ctx.closePath();
        ctx.fill();
      },
    },
    {
      key: 'item_shield',
      bgColor: 0xd97706,
      ringColor: 0xfbbf24,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.moveTo(16, 8); ctx.lineTo(23, 12); ctx.lineTo(21, 20); ctx.lineTo(16, 24); ctx.lineTo(11, 20); ctx.lineTo(9, 12); ctx.closePath();
        ctx.fill();
      },
    },
    {
      key: 'item_piercing_bomb',
      bgColor: 0x1e293b,
      ringColor: 0x06b6d4,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(16, 6); ctx.lineTo(18, 12); ctx.lineTo(14, 12); ctx.closePath();
        ctx.moveTo(16, 26); ctx.lineTo(18, 20); ctx.lineTo(14, 20); ctx.closePath();
        ctx.moveTo(6, 16); ctx.lineTo(12, 14); ctx.lineTo(12, 18); ctx.closePath();
        ctx.moveTo(26, 16); ctx.lineTo(20, 14); ctx.lineTo(20, 18); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(16, 16, 5, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      key: 'item_remote_bomb',
      bgColor: 0x881337,
      ringColor: 0xfbbf24,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(16, 19, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(16, 13); ctx.lineTo(16, 7);
        ctx.stroke();
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(16, 7, 2.5, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      key: 'item_cluster_bomb',
      bgColor: 0x3b0764,
      ringColor: 0xe879f9,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#facc15';
        [ [12, 13], [20, 13], [16, 21] ].forEach(([cx, cy]) => {
          ctx.beginPath();
          ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.strokeStyle = '#e879f9';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(12, 13); ctx.lineTo(20, 13); ctx.lineTo(16, 21); ctx.closePath();
        ctx.stroke();
      },
    },
    {
      key: 'item_landmine',
      bgColor: 0x334155,
      ringColor: 0xeab308,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.ellipse(16, 18, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(16, 18, 3, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      key: 'item_ice_bomb',
      bgColor: 0x082f49,
      ringColor: 0x38bdf8,
      drawGlyph: (ctx) => {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(16, 8); ctx.lineTo(16, 24);
        ctx.moveTo(9, 12); ctx.lineTo(23, 20);
        ctx.moveTo(9, 20); ctx.lineTo(23, 12);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(16, 16, 2, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      key: 'item_ricochet_bomb',
      bgColor: 0x581c87,
      ringColor: 0x22c55e,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(16, 16, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(16, 16, 9, -Math.PI * 0.75, Math.PI * 0.25);
        ctx.stroke();
      },
    },
    {
      key: 'item_mega_fire',
      bgColor: 0xea580c,
      ringColor: 0xfde047,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const r = i % 2 === 0 ? 9 : 4;
          const x = 16 + Math.cos(angle) * r;
          const y = 16 + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      },
    },
    {
      key: 'item_armor_up',
      bgColor: 0x1e3a5f,
      ringColor: 0x60a5fa,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#60a5fa';
        ctx.beginPath();
        ctx.moveTo(10, 10); ctx.lineTo(22, 10); ctx.lineTo(20, 22); ctx.lineTo(12, 22); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(13, 13, 2, 2);
        ctx.fillRect(17, 13, 2, 2);
      },
    },
    {
      key: 'item_blast_resist',
      bgColor: 0xc2410c,
      ringColor: 0xf97316,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#fed7aa';
        ctx.beginPath();
        ctx.moveTo(16, 8); ctx.lineTo(25, 23); ctx.lineTo(7, 23); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c2410c';
        ctx.fillRect(15, 12, 2, 6);
        ctx.fillRect(15, 20, 2, 2);
      },
    },
    {
      key: 'item_wall_pass',
      bgColor: 0x581c87,
      ringColor: 0xc084fc,
      drawGlyph: (ctx) => {
        ctx.strokeStyle = '#e9d5ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(9, 10, 14, 5);
        ctx.strokeRect(9, 17, 14, 5);
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.moveTo(14, 22); ctx.lineTo(22, 14); ctx.lineTo(19, 11); ctx.lineTo(11, 19); ctx.closePath();
        ctx.fill();
      },
    },
    {
      key: 'item_bomb_pass',
      bgColor: 0x312e81,
      ringColor: 0x818cf8,
      drawGlyph: (ctx) => {
        ctx.strokeStyle = '#a5b4fc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(16, 16, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(10, 22); ctx.lineTo(22, 10);
        ctx.stroke();
      },
    },
    {
      key: 'item_time_freeze',
      bgColor: 0x78350f,
      ringColor: 0xfacc15,
      drawGlyph: (ctx) => {
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(16, 17, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(16, 17); ctx.lineTo(16, 13);
        ctx.moveTo(16, 17); ctx.lineTo(19, 17);
        ctx.stroke();
        ctx.strokeRect(14, 7, 4, 3);
      },
    },
    {
      key: 'item_magnet',
      bgColor: 0x172554,
      ringColor: 0x38bdf8,
      drawGlyph: (ctx) => {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(16, 15, 6, Math.PI, Math.PI * 1.5);
        ctx.stroke();
        ctx.strokeStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(16, 15, 6, Math.PI * 1.5, 0);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(9, 15, 3, 4);
        ctx.fillRect(20, 15, 3, 4);
      },
    },
    {
      key: 'item_extra_life',
      bgColor: 0x881337,
      ringColor: 0xfbbf24,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.moveTo(16, 22);
        ctx.bezierCurveTo(9, 17, 9, 11, 13, 11);
        ctx.bezierCurveTo(15, 11, 16, 13, 16, 13);
        ctx.bezierCurveTo(16, 13, 17, 11, 19, 11);
        ctx.bezierCurveTo(23, 11, 23, 17, 16, 22);
        ctx.fill();
      },
    },
    {
      key: 'item_cloak',
      bgColor: 0x0f172a,
      ringColor: 0x818cf8,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.moveTo(16, 9); ctx.lineTo(23, 21); ctx.lineTo(9, 21); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(14, 16, 1.5, 0, Math.PI * 2);
        ctx.arc(18, 16, 1.5, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      key: 'item_deflector',
      bgColor: 0x0f766e,
      ringColor: 0x2dd4bf,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#2dd4bf';
        ctx.beginPath();
        ctx.moveTo(16, 8); ctx.lineTo(24, 16); ctx.lineTo(16, 24); ctx.lineTo(8, 16); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(16, 11); ctx.lineTo(21, 16); ctx.lineTo(16, 21); ctx.lineTo(11, 16); ctx.closePath();
        ctx.fill();
      },
    },
    {
      key: 'item_speed_surge',
      bgColor: 0x15803d,
      ringColor: 0x84cc16,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#bef264';
        ctx.beginPath();
        ctx.moveTo(14, 9); ctx.lineTo(18, 9); ctx.lineTo(18, 13); ctx.lineTo(22, 21);
        ctx.lineTo(10, 21); ctx.lineTo(14, 13); ctx.closePath();
        ctx.fill();
      },
    },
    {
      key: 'item_vampiric',
      bgColor: 0x450a0a,
      ringColor: 0xef4444,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(16, 8); ctx.lineTo(22, 14); ctx.lineTo(16, 24); ctx.lineTo(10, 14); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(16, 14, 2, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    {
      key: 'item_poison_mist',
      bgColor: 0x064e3b,
      ringColor: 0x10b981,
      drawGlyph: (ctx) => {
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(13, 17, 4, 0, Math.PI * 2);
        ctx.arc(19, 17, 4, 0, Math.PI * 2);
        ctx.arc(16, 13, 4.5, 0, Math.PI * 2);
        ctx.fill();
      },
    },
  ];

  itemDefs.forEach(({ key, bgColor, ringColor, drawGlyph }) => {
    if (scene.textures.exists(key)) return;
    try {
      const canvas = scene.textures.createCanvas(key, 32, 32);
      if (canvas) {
        const ctx = canvas.getContext();
        ctx.fillStyle = '#' + bgColor.toString(16).padStart(6, '0');
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(2, 2, 28, 28, 6);
        } else {
          ctx.rect(2, 2, 28, 28);
        }
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#' + ringColor.toString(16).padStart(6, '0');
        ctx.stroke();

        // Draw distinct item glyph
        try {
          drawGlyph(ctx);
        } catch {
          // Glyph drawing safe fallback
        }

        canvas.refresh();
        return;
      }
    } catch {
      // Fallback below
    }

    try {
      const g = scene.add.graphics();
      g.fillStyle(bgColor, 1);
      g.fillRoundedRect(2, 2, 28, 28, 6);
      g.lineStyle(2, ringColor, 1);
      g.strokeRoundedRect(2, 2, 28, 28, 6);
      g.generateTexture(key, 32, 32);
      g.destroy();
    } catch {
      // No-op
    }
  });
}

export function ensureJuiceTextures(scene: Phaser.Scene): void {
  if (!scene.textures) return;

  // 1. Particle textures (dust, spark, debris)
  if (!scene.textures.exists('particle_dust')) {
    try {
      const g = scene.add.graphics();
      g.fillStyle(0xd6cbb8, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('particle_dust', 8, 8);
      g.destroy();
    } catch {
      // Safe headless fallback
    }
  }

  if (!scene.textures.exists('particle_spark')) {
    try {
      const g = scene.add.graphics();
      g.fillStyle(0xfde047, 1);
      g.fillRect(1, 1, 4, 4);
      g.generateTexture('particle_spark', 6, 6);
      g.destroy();
    } catch {
      // Safe headless fallback
    }
  }

  if (!scene.textures.exists('particle_debris')) {
    try {
      const g = scene.add.graphics();
      g.fillStyle(0xe2e8f0, 1);
      g.fillRect(0, 0, 6, 6);
      g.generateTexture('particle_debris', 6, 6);
      g.destroy();
    } catch {
      // Safe headless fallback
    }
  }

  // 2. Procedural radial shadow ellipse texture (32x16)
  if (!scene.textures.exists('shadow_ellipse')) {
    try {
      if (typeof document !== 'undefined') {
        const canvas = scene.textures.createCanvas('shadow_ellipse', 32, 16);
        if (canvas) {
          const ctx = canvas.getContext();
          const grad = ctx.createRadialGradient(16, 8, 1, 16, 8, 15);
          grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
          grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(16, 8, 15, 7, 0, 0, Math.PI * 2);
          ctx.fill();
          canvas.refresh();
        }
      }
    } catch {
      // Fallback graphics below
    }

    if (!scene.textures.exists('shadow_ellipse')) {
      try {
        const g = scene.add.graphics();
        g.fillStyle(0x000000, 0.4);
        g.fillEllipse(16, 8, 30, 14);
        g.generateTexture('shadow_ellipse', 32, 16);
        g.destroy();
      } catch {
        // Safe headless fallback
      }
    }
  }
}
