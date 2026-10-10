/**
 * HazardRenderer.ts — High-Performance Zero-GC 2D Procedural Renderer for Dynamic Hazards
 *
 * Modularly encapsulates rendering of the Heptagonal Elemental Pantheon:
 *     1. Aether / Light: Quantum Spire Beams & Polarized Spires (DynamicHazard)
 *     2. Frost / Ice: Cryo Glaciation, Permafrost Creep & Absolute Zero (FrostHazard)
 *     3. Volt / Lightning: Tesla Ionization Arcs & Lightning Discharge (VoltHazard)
 *     4. Magma / Fire: Pyroclastic Bursts & Solidified Obsidian Crust (MagmaHazard)
 *     5. Nature / Decay: Toxic Spores, Corrosive Bloom & Fertile Cleansed Soil (MiasmaHazard)
 *     6. Time / Spacetime: Chrono Dilation, Time Collapse & Stabilized Timeline Anchors (ChronoHazard)
 *
 * Architectural Invariants:
 * - Single-pass vector batching on a persistent Graphics instance
 * - Pure procedural canvas/graphics with zero external asset dependencies
 * - Full SSR and headless test-runner safety (returns cleanly if graphics is null/undefined)
 */

import { COLS, TILE_SIZE } from '../pathfinding.ts';
import {
  DynamicHazard,
  HazardLifecycleState,
  TelegraphPhase,
  HazardSubtype,
} from './DynamicHazard.ts';
import {
  FrostHazard,
  FrostLifecycleState,
  HoarfrostPhase,
} from './FrostHazard.ts';
import {
  VoltHazard,
  VoltLifecycleState,
  VoltTelegraphPhase,
} from './VoltHazard.ts';
import {
  MagmaHazard,
  MagmaLifecycleState,
  MagmaTelegraphPhase,
} from './MagmaHazard.ts';
import {
  MiasmaHazard,
  MiasmaLifecycleState,
  MiasmaTelegraphPhase,
} from './MiasmaHazard.ts';
import {
  ChronoHazard,
  ChronoLifecycleState,
  ChronoTelegraphPhase,
  ChronoDangerValue,
} from './ChronoHazard.ts';
import {
  GravityHazard,
  GravityLifecycleState,
  AccretionPhase,
  GravityDangerValue,
} from './GravityHazard.ts';
import {
  SolarHazard,
  SolarLifecycleState,
  SolarTelegraphPhase,
  SolarDangerValue,
} from './SolarHazard.ts';
import {
  NebulaHazard,
  NebulaLifecycleState,
  NebulaTelegraphPhase,
  NebulaDangerValue,
} from './NebulaHazard.ts';

export interface HazardRendererContext {
  dynamicHazard?: DynamicHazard | null;
  frostHazard?: FrostHazard | null;
  voltHazard?: VoltHazard | null;
  magmaHazard?: MagmaHazard | null;
  miasmaHazard?: MiasmaHazard | null;
  chronoHazard?: ChronoHazard | null;
  gravityHazard?: GravityHazard | null;
  solarHazard?: SolarHazard | null;
  nebulaHazard?: NebulaHazard | null;
}

export class HazardRenderer {
  public static render(
    graphics: Phaser.GameObjects.Graphics | null | undefined,
    context: HazardRendererContext,
    time: number
  ): void {
    if (!graphics) return;
    graphics.clear();

    const dState = context.dynamicHazard?.getState();
    const fState = context.frostHazard?.getState();
    const vState = context.voltHazard?.getState();
    const mState = context.magmaHazard?.getState();
    const miState = context.miasmaHazard?.getState();
    const cState = context.chronoHazard?.getState();
    const gState = context.gravityHazard?.getState();
    const sState = context.solarHazard?.getState();
    const nState = context.nebulaHazard?.getState();

    const hasDynamic = context.dynamicHazard && dState !== HazardLifecycleState.INACTIVE;
    const hasFrost = context.frostHazard && fState !== FrostLifecycleState.DORMANT && fState !== FrostLifecycleState.THAW_COOLDOWN;
    const hasVolt = context.voltHazard && vState !== VoltLifecycleState.DORMANT && vState !== VoltLifecycleState.DISCHARGE_COOLDOWN;
    const hasMagma = context.magmaHazard && mState !== MagmaLifecycleState.DORMANT && mState !== MagmaLifecycleState.OBSIDIAN_COOLDOWN;
    const hasMiasma = context.miasmaHazard && miState !== MiasmaLifecycleState.DORMANT && miState !== MiasmaLifecycleState.SPORE_DISSIPATION;
    const hasChrono = context.chronoHazard && cState !== ChronoLifecycleState.DORMANT && cState !== ChronoLifecycleState.TACHYON_RECOVERY;
    const hasGravity = context.gravityHazard && gState !== GravityLifecycleState.DORMANT && gState !== GravityLifecycleState.COOLDOWN;
    const hasSolar = context.solarHazard && sState !== SolarLifecycleState.DORMANT && sState !== SolarLifecycleState.CORONA_RECOVERY;
    const hasNebula = context.nebulaHazard && nState !== NebulaLifecycleState.DORMANT && nState !== NebulaLifecycleState.STELLAR_DAWN;

    if (!hasDynamic && !hasFrost && !hasVolt && !hasMagma && !hasMiasma && !hasChrono && !hasGravity && !hasSolar && !hasNebula) return;

    // 1. Dynamic Hazard (Quantum Spires & Beams)
    if (hasDynamic && context.dynamicHazard) {
      const beamIndices = context.dynamicHazard.getActiveBeamIndices();
      const beamCount = context.dynamicHazard.getActiveBeamCount();
      const dangerMask = context.dynamicHazard.getDangerMask();

      for (let i = 0; i < beamCount; i++) {
        const idx = beamIndices[i];
        const r = (idx / COLS) | 0;
        const c = idx % COLS;
        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const code = dangerMask[idx];

        if (code === 1) {
          const phase = context.dynamicHazard.getTelegraphPhase();
          if (phase === TelegraphPhase.YELLOW) {
            graphics.lineStyle(2, 0x00e5ff, 0.45);
            graphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            graphics.fillStyle(0x00e5ff, 0.15);
            graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          } else if (phase === TelegraphPhase.AMBER) {
            graphics.lineStyle(2, 0xa855f7, 0.7);
            graphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            graphics.fillStyle(0xa855f7, 0.35);
            graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          } else if (phase === TelegraphPhase.RED) {
            const pulse = 0.7 + 0.3 * Math.sin(time / 40);
            graphics.lineStyle(2.5, 0xef4444, 0.9 * pulse);
            graphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            graphics.fillStyle(0xd946ef, 0.55 * pulse);
            graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          }
        } else if (code === 2) {
          graphics.fillStyle(0xffffff, 0.95);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(3, 0x00ffff, 0.9);
          graphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else if (code === 3) {
          const goldPulse = 0.8 + 0.2 * Math.sin(time / 120);
          graphics.fillStyle(0xfacc15, 0.45 * goldPulse);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(2, 0xffe066, 0.85);
          graphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }
      }

      // Render Spire Crystals
      const spires = context.dynamicHazard.getSpires();
      for (let i = 0; i < spires.length; i++) {
        const spire = spires[i];
        const sx = spire.c * TILE_SIZE + TILE_SIZE / 2;
        const sy = spire.r * TILE_SIZE + TILE_SIZE / 2;

        if (spire.isPolarized) {
          const aura = 18 + 4 * Math.sin(time / 100 + i);
          graphics.fillStyle(0xfacc15, 0.35);
          graphics.fillCircle(sx, sy, aura);
          graphics.fillStyle(0xfde047, 0.95);
          graphics.fillCircle(sx, sy, 10);
          graphics.lineStyle(2, 0xffffff, 1.0);
          graphics.strokeCircle(sx, sy, 10);
        } else {
          const color = spire.subtype === HazardSubtype.NEXUS ? 0xd946ef : 0x00e5ff;
          const pulse = 0.8 + 0.2 * Math.sin(time / 180 + i);
          graphics.fillStyle(color, 0.25 * pulse);
          graphics.fillCircle(sx, sy, 16 * pulse);
          graphics.fillStyle(color, 0.9);
          graphics.beginPath();
          graphics.moveTo(sx, sy - 12);
          graphics.lineTo(sx + 10, sy);
          graphics.lineTo(sx, sy + 12);
          graphics.lineTo(sx - 10, sy);
          graphics.closePath();
          graphics.fillPath();
          graphics.lineStyle(1.5, 0xffffff, 0.9);
          graphics.strokePath();
        }
      }
    }

    // 2. Frost Hazard (Glaciated Tiles & Crystals)
    if (hasFrost && context.frostHazard) {
      const frostIndices = context.frostHazard.getActiveFrostIndices();
      const frostCount = context.frostHazard.getActiveFrostCount();
      const isBurst = fState === FrostLifecycleState.ABSOLUTE_ZERO_BURST;
      const phase = context.frostHazard.getHoarfrostPhase();

      for (let i = 0; i < frostCount; i++) {
        const idx = frostIndices[i];
        const r = (idx / COLS) | 0;
        const c = idx % COLS;
        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const cx = left + TILE_SIZE / 2;
        const cy = top + TILE_SIZE / 2;

        if (isBurst) {
          const pulse = 0.8 + 0.2 * Math.sin(time / 30);
          graphics.fillStyle(0x00ffff, 0.45 * pulse);
          graphics.fillRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          graphics.lineStyle(2, 0xffffff, 0.9);
          graphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else {
          const alpha =
            phase === HoarfrostPhase.CRYSTALLIZATION
              ? 0.15
              : phase === HoarfrostPhase.PERMAFROST_CREEP
              ? 0.30
              : 0.45;
          graphics.fillStyle(0x38bdf8, alpha);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0x93c5fd, 0.5);
          graphics.strokeCircle(cx, cy, 6);
        }
      }
    }

    // 3. Volt Hazard (Electrified Tiles & Arcs)
    if (hasVolt && context.voltHazard) {
      const voltIndices = context.voltHazard.getActiveVoltIndices();
      const voltCount = context.voltHazard.getActiveVoltCount();
      const isBurst = vState === VoltLifecycleState.LIGHTNING_DISCHARGE;
      const phase = context.voltHazard.getTelegraphPhase();

      for (let i = 0; i < voltCount; i++) {
        const idx = voltIndices[i];
        const r = (idx / COLS) | 0;
        const c = idx % COLS;
        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const cx = left + TILE_SIZE / 2;
        const cy = top + TILE_SIZE / 2;

        if (isBurst) {
          const pulse = 0.8 + 0.2 * Math.sin(time / 25);
          graphics.fillStyle(0xffffff, 0.95);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(2.5, 0xfacc15, 0.95 * pulse);
          graphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else {
          const alpha =
            phase === VoltTelegraphPhase.STATIC_CHARGE
              ? 0.15
              : phase === VoltTelegraphPhase.ARC_BUILDUP
              ? 0.30
              : 0.50;
          graphics.fillStyle(0xfacc15, alpha);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0x38bdf8, 0.6);
          graphics.strokeCircle(cx, cy, 6);
        }
      }
    }

    // 4. Magma Hazard (Molten Caldera & Obsidian Crust)
    if (hasMagma && context.magmaHazard) {
      const magmaIndices = context.magmaHazard.getActiveMagmaIndices();
      const magmaCount = context.magmaHazard.getActiveMagmaCount();
      const isBurst = mState === MagmaLifecycleState.PYROCLASTIC_BURST;
      const phase = context.magmaHazard.getTelegraphPhase();
      const dangerMask = context.magmaHazard.dangerMask;

      for (let i = 0; i < magmaCount; i++) {
        const idx = magmaIndices[i];
        const r = (idx / COLS) | 0;
        const c = idx % COLS;
        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const cx = left + TILE_SIZE / 2;
        const cy = top + TILE_SIZE / 2;
        const code = dangerMask[idx];

        if (code === 3) {
          graphics.fillStyle(0x312e81, 0.65);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(2, 0x6366f1, 0.85);
          graphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (isBurst || code === 2) {
          const pulse = 0.8 + 0.2 * Math.sin(time / 20);
          graphics.fillStyle(0xffedd5, 0.95);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(2.5, 0xf97316, 0.95 * pulse);
          graphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else {
          const alpha =
            phase === MagmaTelegraphPhase.CRUST_HEATING
              ? 0.20
              : phase === MagmaTelegraphPhase.MAGMA_UPWELLING
              ? 0.40
              : 0.65;
          graphics.fillStyle(0xea580c, alpha);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0xf97316, 0.7);
          graphics.strokeCircle(cx, cy, 7);
        }
      }
    }

    // 5. Miasma Hazard (Toxic Spores & Fertile Cleansed Soil)
    if (hasMiasma && context.miasmaHazard) {
      const sporeIndices = context.miasmaHazard.getActiveSporeIndices();
      const sporeCount = context.miasmaHazard.getActiveSporeCount();
      const isBurst = miState === MiasmaLifecycleState.CORROSIVE_BURST;
      const phase = context.miasmaHazard.getTelegraphPhase();
      const dangerMask = context.miasmaHazard.dangerMask;

      for (let i = 0; i < sporeCount; i++) {
        const idx = sporeIndices[i];
        const r = (idx / COLS) | 0;
        const c = idx % COLS;
        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const cx = left + TILE_SIZE / 2;
        const cy = top + TILE_SIZE / 2;
        const maskVal = dangerMask[idx];

        if (maskVal === 3) {
          graphics.fillStyle(0x34d399, 0.25);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0x10b981, 0.65);
          graphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (isBurst || maskVal === 2) {
          const pulse = 0.8 + 0.2 * Math.sin(time / 20);
          graphics.fillStyle(0xa7f3d0, 0.90);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(2.5, 0x10b981, 0.95 * pulse);
          graphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else {
          const alpha =
            phase === MiasmaTelegraphPhase.POD_SWELLING
              ? 0.20
              : phase === MiasmaTelegraphPhase.SPORE_EXHALATION
              ? 0.40
              : 0.65;
          graphics.fillStyle(0x059669, alpha);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0x10b981, 0.7);
          graphics.strokeCircle(cx, cy, 7);
        }
      }
    }

    // 6. Chrono Hazard (Time Dilation, Time Collapse & Stabilized Anchors)
    if (hasChrono && context.chronoHazard) {
      const chronoIndices = context.chronoHazard.getActiveChronoIndices();
      const chronoCount = context.chronoHazard.getActiveChronoCount();
      const isBurst = cState === ChronoLifecycleState.TIME_COLLAPSE;
      const phase = context.chronoHazard.getTelegraphPhase();
      const dangerMask = context.chronoHazard.getDangerMask();

      for (let i = 0; i < chronoCount; i++) {
        const idx = chronoIndices[i];
        const r = (idx / COLS) | 0;
        const c = idx % COLS;
        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const cx = left + TILE_SIZE / 2;
        const cy = top + TILE_SIZE / 2;
        const maskVal = dangerMask[idx];

        if (maskVal === ChronoDangerValue.ANCHOR) {
          // Stabilized timeline anchor: serene cyan/emerald harmonic field
          graphics.fillStyle(0x38bdf8, 0.30);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0x67e8f9, 0.75);
          graphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (isBurst || maskVal === ChronoDangerValue.COLLAPSE) {
          // Lethal Time Collapse: white-hot temporal core with neon indigo outer pulse
          const pulse = 0.8 + 0.2 * Math.sin(time / 20);
          graphics.fillStyle(0xffffff, 0.95);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(2.5, 0x818cf8, 0.95 * pulse);
          graphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else {
          // Telegraph phases: progressive violet/indigo dilation field with gear tick glyph
          const alpha =
            phase === ChronoTelegraphPhase.TEMPORAL_RIPPLE
              ? 0.20
              : phase === ChronoTelegraphPhase.TACHYON_WARP
              ? 0.40
              : 0.65; // EVENT_HORIZON_IMMINENT
          graphics.fillStyle(0x6366f1, alpha);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0xa5b4fc, 0.75);
          graphics.strokeCircle(cx, cy, 7);
        }
      }
    }

    // 7. Solar Hazard (Solar Corona & Coronal Flare)
    if (hasSolar && context.solarHazard) {
      const activeIndices = context.solarHazard.getActiveSolarIndices();
      const activeCount = context.solarHazard.getActiveSolarCount();
      const dangerMask = context.solarHazard.getDangerMask();
      const phase = context.solarHazard.getTelegraphPhase();
      const isBurst = context.solarHazard.getState() === SolarLifecycleState.SUPERHEAT_FLARE;

      for (let i = 0; i < activeCount; i++) {
        const idx = activeIndices[i];
        const r = (idx / COLS) | 0;
        const c = idx % COLS;
        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const cx = left + TILE_SIZE / 2;
        const cy = top + TILE_SIZE / 2;
        const maskVal = dangerMask[idx];

        if (maskVal === SolarDangerValue.ANCHOR) {
          // Stabilized solar calm: serene golden-amber harmonic field
          graphics.fillStyle(0xfbbf24, 0.30);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0xfde047, 0.75);
          graphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (isBurst || maskVal === SolarDangerValue.FLARE) {
          // Lethal Superheat Flare: blinding white-gold core with radiant sunburst outer stroke
          const pulse = 0.8 + 0.2 * Math.sin(time / 20);
          graphics.fillStyle(0xffffff, 0.95);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(2.5, 0xf97316, 0.95 * pulse);
          graphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else {
          // Telegraph phases: progressive golden/orange corona with sunburst pip
          const alpha =
            phase === SolarTelegraphPhase.SOLAR_WHISPER
              ? 0.18
              : phase === SolarTelegraphPhase.CORONA_SURGE
              ? 0.36
              : 0.40; // SUPERHEAT_DISCHARGE strictly clamped to 0.40 to prevent UI occlusion!
          graphics.fillStyle(0xf59e0b, alpha);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0xfbbf24, 0.75);
          graphics.strokeCircle(cx, cy, 7);
        }
      }
    }

    // 8. Nebula Hazard (Astral Nebula & Solar Eclipse)
    if (hasNebula && context.nebulaHazard) {
      const activeIndices = context.nebulaHazard.getActiveNebulaIndices();
      const activeCount = context.nebulaHazard.getActiveNebulaCount();
      const dangerMask = context.nebulaHazard.getDangerMask();
      const phase = context.nebulaHazard.getTelegraphPhase();
      const isBurst = context.nebulaHazard.getState() === NebulaLifecycleState.ECLIPSE_COLLAPSE;

      for (let i = 0; i < activeCount; i++) {
        const idx = activeIndices[i];
        const r = (idx / COLS) | 0;
        const c = idx % COLS;
        const left = c * TILE_SIZE;
        const top = r * TILE_SIZE;
        const cx = left + TILE_SIZE / 2;
        const cy = top + TILE_SIZE / 2;
        const maskVal = dangerMask[idx];

        if (maskVal === NebulaDangerValue.ANCHOR) {
          // Stabilized stardust calm sanctuary: serene starlight cyan field
          graphics.fillStyle(0x06b6d4, 0.30);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0x67e8f9, 0.75);
          graphics.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (isBurst || maskVal === NebulaDangerValue.COLLAPSE) {
          // Lethal Eclipse Collapse: deep abyssal black-violet core with pulsing diamond white corona rim
          const pulse = 0.8 + 0.2 * Math.sin(time / 20);
          graphics.fillStyle(0x4c1d95, 0.95);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(2.5, 0xffffff, 0.95 * pulse);
          graphics.strokeRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        } else {
          // Telegraph phases: progressive astral violet/cosmic indigo with starlight cyan pip
          const alpha =
            phase === NebulaTelegraphPhase.ASTRAL_WHISPER
              ? 0.18
              : phase === NebulaTelegraphPhase.COSMIC_CONVERGENCE
              ? 0.36
              : 0.40; // ECLIPSE_IMMINENT strictly clamped to 0.40 to prevent UI occlusion!
          graphics.fillStyle(0x8b5cf6, alpha);
          graphics.fillRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(1.5, 0x06b6d4, 0.75);
          graphics.strokeCircle(cx, cy, 7);
        }
      }
    }
  }
}
