/**
 * ULTIMATE SKILLS (필살기), CAMERA TRAUMA, PROCEDURAL WEB AUDIO, AND HIGH-IMPACT VFX
 *
 * Provides:
 * - 5 Distinct Ultimate Skills (Meteor Strike, Super Nova, Chrono Freeze, Nuclear Barrage, Aegis Overdrive)
 * - 100-Point Resource Gauge Engine with 6,000ms Anti-Snowball Lockout Window
 * - Square-Law Camera Trauma Decay Model (lambda = 1.4 s^-1, maxOffset = 18px, maxAngle = 3.5 deg)
 * - Zero-Dependency Procedural Web Audio Synthesizer (WebAudioSynth)
 * - Canvas/Phaser Procedural VFX Generation Helpers
 */

import type Phaser from 'phaser';

/* ==============================================================================
 * ULTIMATE SKILLS SPECIFICATION & REGISTRY
 * ============================================================================== */

export type UltimateSkillId =
  | 'METEOR_STRIKE'
  | 'SUPER_NOVA'
  | 'CHRONO_FREEZE'
  | 'NUCLEAR_BARRAGE'
  | 'AEGIS_OVERDRIVE';

export interface UltimateSkillDefinition {
  id: UltimateSkillId;
  name: string;
  koreanName: string;
  archetype: string;
  cost: number;
  lockoutMs: number;
  warningMs?: number;
  impactRadius?: number;
  meteorCountMin?: number;
  meteorCountMax?: number;
  meteorCount?: number;
  traumaPerImpact?: number;
  scorchDecalMs?: number;
  implosionMs?: number;
  hitStopMs?: number;
  maxRadiusTiles?: number;
  tileWaveDelayMs?: number;
  trauma?: number;
  durationMs?: number;
  playerSpeedMultiplier?: number;
  traumaOnResume?: number;
  maxWarheads?: number;
  maxDepthPerArm?: number;
  fuseMs?: number;
  cascadeStepDelayMs?: number;
  traumaPerStep?: number;
  maxDurationMs?: number;
  absorbBonusMs?: number;
  absorbDurationBonusMs?: number;
  speedBonus?: number;
  reflectKnockbackTiles?: number;
  reflectDamage?: number;
}

export const ULTIMATE_SKILLS: Record<UltimateSkillId, UltimateSkillDefinition> = {
  METEOR_STRIKE: {
    id: 'METEOR_STRIKE',
    name: 'Meteor Strike',
    koreanName: '유성 폭격',
    archetype: 'Heavy Artillery',
    cost: 100,
    lockoutMs: 6000,
    warningMs: 600,
    impactRadius: 1, // 3x3 footprint
    meteorCountMin: 8,
    meteorCountMax: 10,
    meteorCount: 8,
    trauma: 0.35,
    traumaPerImpact: 0.35,
    scorchDecalMs: 2000,
  },
  SUPER_NOVA: {
    id: 'SUPER_NOVA',
    name: 'Super Nova',
    koreanName: '초신성 대폭발',
    archetype: 'Radial Shock',
    cost: 100,
    lockoutMs: 6000,
    implosionMs: 300,
    hitStopMs: 60,
    maxRadiusTiles: 5,
    tileWaveDelayMs: 40,
    trauma: 1.0, // Max saturation
  },
  CHRONO_FREEZE: {
    id: 'CHRONO_FREEZE',
    name: 'Chrono Freeze',
    koreanName: '시간 정지',
    archetype: 'Spatiotemporal',
    cost: 100,
    lockoutMs: 6000,
    durationMs: 5000,
    playerSpeedMultiplier: 1.20,
    traumaOnResume: 0.60,
  },
  NUCLEAR_BARRAGE: {
    id: 'NUCLEAR_BARRAGE',
    name: 'Nuclear Barrage',
    koreanName: '카펫 바밍',
    archetype: 'Cross Carpet',
    cost: 100,
    lockoutMs: 6000,
    maxWarheads: 16,
    maxDepthPerArm: 4,
    fuseMs: 1200,
    cascadeStepDelayMs: 70,
    traumaPerStep: 0.15,
  },
  AEGIS_OVERDRIVE: {
    id: 'AEGIS_OVERDRIVE',
    name: 'Aegis Overdrive',
    koreanName: '이지스 오버드라이브',
    archetype: 'Defensive Counter',
    cost: 100,
    lockoutMs: 6000,
    durationMs: 6000,
    maxDurationMs: 8000,
    absorbBonusMs: 300,
    absorbDurationBonusMs: 300,
    speedBonus: 40,
    reflectKnockbackTiles: 2,
    reflectDamage: 100,
  },
};

export const CHARGE_VALUES = {
  BLOCK_DESTROYED: 2,
  ENEMY_DEFEATED: 15,
  TRACKER_DEFEATED: 25,
  ENERGY_SPARK: 10,
  CLOSE_CALL: 5,
  SURVIVAL_TICK: 1, // Awarded every 3000ms
} as const;

/* ==============================================================================
 * CAMERA TRAUMA MODEL (SQUARE-LAW DECAY)
 * ============================================================================== */

/**
 * Camera Trauma Model (Square-Law Decay)
 * Trauma in [0.0, 1.0]
 * Offset = Trauma^2 * MaxOffset
 * Angle = Trauma^2 * MaxAngle
 * Decay rate = 1.4 s^-1
 */
export interface CameraOffsets {
  x: number;
  y: number;
  angle: number;
}

export interface ShakeMagnitude {
  trauma: number;
  offsetPx: number;
  angleDeg: number;
}

export class CameraTraumaSimulator {
  public trauma: number = 0.0;
  public maxOffset: number;
  public maxAngle: number;
  public decayRate: number;

  private readonly _scratchOffsets: CameraOffsets = { x: 0, y: 0, angle: 0 };
  private readonly _scratchMagnitude: ShakeMagnitude = { trauma: 0, offsetPx: 0, angleDeg: 0 };

  constructor(maxOffset: number = 18, maxAngle: number = 3.5, decayRate: number = 1.4) {
    this.trauma = 0.0;
    this.maxOffset = maxOffset;
    this.maxAngle = maxAngle;
    this.decayRate = decayRate; // per second (1.4 s^-1)
  }

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1.0, Math.max(0.0, this.trauma + amount));
  }

  public update(deltaSec: number): void {
    if (this.trauma > 0) {
      this.trauma = Math.max(0.0, this.trauma - this.decayRate * deltaSec);
    }
  }

  public getShakeMagnitude(out?: ShakeMagnitude): ShakeMagnitude {
    // Non-linear square law: Trauma^2
    const target = out ?? this._scratchMagnitude;
    const factor = this.trauma * this.trauma;
    target.trauma = this.trauma;
    target.offsetPx = factor * this.maxOffset;
    target.angleDeg = factor * this.maxAngle;
    return target;
  }

  /**
   * Calculates pseudo-harmonic camera shake displacement for Phaser frame updates
   */
  public getOffsets(timeMs: number = 0, out?: CameraOffsets): CameraOffsets {
    const target = out ?? this._scratchOffsets;
    const mag = this.getShakeMagnitude();
    if (mag.trauma <= 0.0001) {
      target.x = 0;
      target.y = 0;
      target.angle = 0;
      return target;
    }
    const t = timeMs * 0.04;
    target.x = mag.offsetPx * (Math.sin(t * 1.37) * 0.65 + Math.cos(t * 2.11) * 0.35);
    target.y = mag.offsetPx * (Math.cos(t * 1.73) * 0.65 + Math.sin(t * 2.89) * 0.35);
    target.angle = mag.angleDeg * Math.sin(t * 1.93);
    return target;
  }
}

export const CameraTrauma = CameraTraumaSimulator;

/* ==============================================================================
 * ULTIMATE ENGINE SIMULATOR
 * ============================================================================== */

export class UltimateEngineSimulator {
  public gauge: number = 0.0;
  public maxGauge: number = 100.0;
  public lockoutRemainingMs: number = 0;
  public activeSkill: UltimateSkillId | null = null;
  public activeSkillRemainingMs: number = 0;
  public traumaEngine: CameraTraumaSimulator = new CameraTraumaSimulator();
  public lastSurvivalTickMs: number = 0;
  public isChronoFrozen: boolean = false;
  public isAegisOverdriveActive: boolean = false;
  public aegisDurationMs: number = 0;

  constructor() {
    this.gauge = 0.0;
    this.maxGauge = 100.0;
    this.lockoutRemainingMs = 0;
    this.activeSkill = null;
    this.activeSkillRemainingMs = 0;
    this.traumaEngine = new CameraTraumaSimulator();
    this.lastSurvivalTickMs = 0;
    this.isChronoFrozen = false;
    this.isAegisOverdriveActive = false;
    this.aegisDurationMs = 0;
  }

  public addCharge(points: number): number {
    // Defensive input sanitization against NaN, undefined, null, non-numbers
    if (typeof points !== 'number' || isNaN(points)) {
      return 0;
    }
    // Anti-snowball lockout invariant:
    // No charge can be accumulated while lockout timer is active!
    if (this.lockoutRemainingMs > 0) {
      return 0;
    }
    const prev = this.gauge;
    const safePoints = points === Infinity ? this.maxGauge : points === -Infinity ? -this.maxGauge : points;
    this.gauge = Math.min(this.maxGauge, Math.max(0.0, this.gauge + safePoints));
    return this.gauge - prev;
  }

  public isReady(): boolean {
    return this.gauge >= this.maxGauge && this.lockoutRemainingMs <= 0;
  }

  public trigger(skillId: UltimateSkillId, currentTime: number = 0): boolean {
    void currentTime;
    if (!ULTIMATE_SKILLS[skillId]) {
      throw new Error(`Unknown ultimate skill: ${skillId}`);
    }
    if (!this.isReady()) {
      return false;
    }

    const skill = ULTIMATE_SKILLS[skillId];
    this.gauge = 0.0;
    this.lockoutRemainingMs = skill.lockoutMs;
    this.activeSkill = skillId;

    switch (skillId) {
      case 'METEOR_STRIKE':
        this.activeSkillRemainingMs = 1200;
        this.traumaEngine.addTrauma(skill.traumaPerImpact ?? 0.35);
        break;
      case 'SUPER_NOVA':
        this.activeSkillRemainingMs = 700;
        this.traumaEngine.addTrauma(skill.trauma ?? 1.0);
        break;
      case 'CHRONO_FREEZE':
        this.activeSkillRemainingMs = skill.durationMs ?? 5000;
        this.isChronoFrozen = true;
        break;
      case 'NUCLEAR_BARRAGE':
        this.activeSkillRemainingMs = 1500;
        this.traumaEngine.addTrauma((skill.traumaPerStep ?? 0.15) * 3);
        break;
      case 'AEGIS_OVERDRIVE':
        this.activeSkillRemainingMs = skill.durationMs ?? 6000;
        this.isAegisOverdriveActive = true;
        this.aegisDurationMs = skill.durationMs ?? 6000;
        break;
    }

    return true;
  }

  public update(deltaMs: number, currentTime: number = 0): void {
    // 1. Decay lockout
    if (this.lockoutRemainingMs > 0) {
      this.lockoutRemainingMs = Math.max(0, this.lockoutRemainingMs - deltaMs);
    }

    // 2. Decay existing camera trauma
    this.traumaEngine.update(deltaMs / 1000);

    // 3. Active skill timers
    if (this.activeSkillRemainingMs > 0) {
      this.activeSkillRemainingMs = Math.max(0, this.activeSkillRemainingMs - deltaMs);
      if (this.activeSkillRemainingMs <= 0) {
        // Skill finished
        if (this.activeSkill === 'CHRONO_FREEZE') {
          this.isChronoFrozen = false;
          this.traumaEngine.addTrauma(ULTIMATE_SKILLS.CHRONO_FREEZE.traumaOnResume ?? 0.60);
        } else if (this.activeSkill === 'AEGIS_OVERDRIVE') {
          this.isAegisOverdriveActive = false;
        }
        this.activeSkill = null;
      }
    }

    // 4. Survival drip: +1 point every 3000ms
    if (currentTime - this.lastSurvivalTickMs >= 3000) {
      this.addCharge(CHARGE_VALUES.SURVIVAL_TICK);
      this.lastSurvivalTickMs = currentTime;
    }
  }

  public absorbThermalExplosion(): boolean {
    if (this.isAegisOverdriveActive) {
      const maxDur = ULTIMATE_SKILLS.AEGIS_OVERDRIVE.maxDurationMs ?? 8000;
      const bonus = ULTIMATE_SKILLS.AEGIS_OVERDRIVE.absorbDurationBonusMs ?? 300;
      this.aegisDurationMs = Math.min(maxDur, this.aegisDurationMs + bonus);
      this.activeSkillRemainingMs = this.aegisDurationMs;
      return true;
    }
    return false;
  }
}

export const UltimateEngine = UltimateEngineSimulator;

/* ==============================================================================
 * PROCEDURAL WEB AUDIO SYNTHESIZER (ZERO EXTERNAL ASSETS)
 * ============================================================================== */

export class WebAudioSynth {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playMeteorWhistleAndBoom(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      // Descending whistle oscillator
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.45);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);

      // Sub-bass detonation at touchdown
      setTimeout(() => {
        this.playSubBassBoom(0.7, 55, 20);
      }, 450);
    } catch {
      // AudioContext failure gracefully ignored
    }
  }

  public playSuperNovaShockwave(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.28);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);

      setTimeout(() => {
        this.playSubBassBoom(1.0, 90, 20);
      }, 280);
    } catch {}
  }

  public playSubBassBoom(duration: number = 0.8, startFreq: number = 65, endFreq: number = 25): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), now + duration);

      gain.gain.setValueAtTime(0.75, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  }

  public playChronoFreeze(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(200, now);
      filter.frequency.exponentialRampToValueAtTime(3200, now + 0.35);
      filter.Q.value = 8;

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {}
  }

  public playChronoTick(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }

  public playChronoResume(): void {
    this.playSubBassBoom(0.65, 120, 25);
  }

  public playNuclearLaunch(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const freqs = [320, 440, 560, 680];
      freqs.forEach((freq, idx) => {
        const now = ctx.currentTime + idx * 0.04;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 1.4, now + 0.07);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
      });
    } catch {}
  }

  public playCarpetDetonation(step: number = 0): void {
    const startFreq = Math.max(35, 80 - step * 8);
    this.playSubBassBoom(0.32, startFreq, 20);
  }

  public playAegisChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 - E5 - G5 - C6
      notes.forEach((freq, idx) => {
        const now = ctx.currentTime + idx * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      });
    } catch {}
  }

  public playAegisReflect(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, now);
      osc.frequency.exponentialRampToValueAtTime(2200, now + 0.15);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {}
  }

  public playUltimateReadyChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [880, 1320, 1760];
      notes.forEach((freq, idx) => {
        const now = ctx.currentTime + idx * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      });
    } catch {}
  }
}

export const webAudioSynth = new WebAudioSynth();

/* ==============================================================================
 * PROCEDURAL VFX & GRAPHICS GENERATION HELPERS
 * ============================================================================== */

export interface PlayerLike {
  x: number;
  y: number;
  active?: boolean;
}

/**
 * Renders an animated targeting reticle on a grid tile before a meteor impact
 */
export function renderMeteorReticle(
  scene: Phaser.Scene,
  targetX: number,
  targetY: number,
  warningMs: number = 600,
  onImpact?: () => void
): Phaser.GameObjects.Graphics | null {
  if (!scene || !scene.add || !scene.time) return null;
  const g = scene.add.graphics();
  g.setDepth(20);

  let elapsed = 0;
  const timer = scene.time.addEvent({
    delay: 16,
    repeat: Math.floor(warningMs / 16),
    callback: () => {
      elapsed += 16;
      const progress = Math.min(1.0, elapsed / warningMs);
      if (!g || !g.active) return;
      g.clear();

      // Outer warning ring contracting to center
      const currentRadius = 32 * (1 - progress);
      g.lineStyle(2, 0xef4444, 0.85);
      g.strokeCircle(targetX, targetY, Math.max(2, currentRadius));

      // Rotating inner crosshair
      const angle = (elapsed / 1000) * Math.PI * 2;
      const crosshairLen = 14;
      g.lineStyle(1.5, 0xfbbf24, 0.9);
      g.beginPath();
      g.moveTo(targetX + Math.cos(angle) * crosshairLen, targetY + Math.sin(angle) * crosshairLen);
      g.lineTo(targetX - Math.cos(angle) * crosshairLen, targetY - Math.sin(angle) * crosshairLen);
      g.moveTo(
        targetX + Math.cos(angle + Math.PI / 2) * crosshairLen,
        targetY + Math.sin(angle + Math.PI / 2) * crosshairLen
      );
      g.lineTo(
        targetX - Math.cos(angle + Math.PI / 2) * crosshairLen,
        targetY - Math.sin(angle + Math.PI / 2) * crosshairLen
      );
      g.strokePath();

      // Pulsing center dot
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(targetX, targetY, 3);

      if (progress >= 1.0) {
        g.destroy();
        timer.remove();
        if (onImpact) onImpact();
      }
    },
  });

  return g;
}

/**
 * Renders atmospheric meteor descent streak
 */
export function renderMeteorStreak(
  scene: Phaser.Scene,
  targetX: number,
  targetY: number,
  onTouchdown?: () => void
): void {
  if (!scene || !scene.add || !scene.tweens) return;

  const startX = targetX - 80;
  const startY = targetY - 260;

  const meteor = scene.add.circle(startX, startY, 9, 0xffedd5, 1.0);
  meteor.setDepth(24);

  // Flaming corona
  const corona = scene.add.circle(startX, startY, 16, 0xf97316, 0.6);
  corona.setDepth(23);

  scene.tweens.add({
    targets: [meteor, corona],
    x: targetX,
    y: targetY,
    duration: 280,
    ease: 'Quad.easeIn',
    onUpdate: () => {
      // Spawn trail ember
      if (scene.add && scene.tweens && Math.random() < 0.7) {
        const ember = scene.add.circle(
          meteor.x + (Math.random() - 0.5) * 8,
          meteor.y + (Math.random() - 0.5) * 8,
          Math.floor(Math.random() * 4) + 2,
          0xfbbf24,
          0.8
        );
        ember.setDepth(22);
        scene.tweens.add({
          targets: ember,
          alpha: 0,
          scale: 0.1,
          duration: 200,
          onComplete: () => ember.destroy(),
        });
      }
    },
    onComplete: () => {
      meteor.destroy();
      corona.destroy();
      if (onTouchdown) onTouchdown();
    },
  });
}

/**
 * Expanding Multi-Ring Chromatic Shockwave
 */
export function renderSuperNovaWave(
  scene: Phaser.Scene,
  centerX: number,
  centerY: number,
  maxRadius: number = 220,
  durationMs: number = 320
): void {
  if (!scene || !scene.add || !scene.tweens) return;
  const g = scene.add.graphics();
  g.setDepth(25);

  const colors = [0xffffff, 0xfbbf24, 0xf43f5e];

  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: durationMs,
    ease: 'Cubic.easeOut',
    onUpdate: (tween: Phaser.Tweens.Tween) => {
      const p = tween.getValue() ?? 0;
      if (!g || !g.active) return;
      g.clear();

      // Outer wave
      g.lineStyle(5 * (1 - p) + 0.5, colors[1], 0.9 * (1 - p));
      g.strokeCircle(centerX, centerY, p * maxRadius);

      // Inner white flash ring
      const pInner = Math.max(0, p - 0.15) / 0.85;
      g.lineStyle(3 * (1 - pInner) + 0.5, colors[0], 0.8 * (1 - pInner));
      g.strokeCircle(centerX, centerY, pInner * (maxRadius * 0.88));

      // Trailing magenta refraction ring
      const pOuter = Math.max(0, p - 0.3) / 0.7;
      g.lineStyle(2 * (1 - pOuter) + 0.5, colors[2], 0.7 * (1 - pOuter));
      g.strokeCircle(centerX, centerY, pOuter * (maxRadius * 0.7));
    },
    onComplete: () => {
      if (g && g.active) g.destroy();
    },
  });
}

/**
 * Global Chrono Freeze visual stasis tint and particles
 */
export function renderChronoStasisVFX(scene: Phaser.Scene, durationMs: number = 5000): { destroy: () => void } {
  if (!scene || !scene.add || !scene.time || !scene.scale) return { destroy: () => {} };

  const overlay = scene.add.rectangle(
    scene.scale.width / 2,
    scene.scale.height / 2,
    scene.scale.width * 2,
    scene.scale.height * 2,
    0x0284c7,
    0.28
  );
  overlay.setDepth(30);

  // Vignette border
  const border = scene.add.graphics();
  border.setDepth(31);
  border.lineStyle(6, 0x38bdf8, 0.75);
  border.strokeRect(4, 4, scene.scale.width - 8, scene.scale.height - 8);

  const cleanup = () => {
    if (overlay && overlay.active) overlay.destroy();
    if (border && border.active) border.destroy();
  };

  scene.time.delayedCall(durationMs, cleanup);

  return { destroy: cleanup };
}

/**
 * Renders a lingering scorched ground decal on a tile
 */
export function renderScorchDecal(
  scene: Phaser.Scene,
  x: number,
  y: number,
  durationMs: number = 2000
): void {
  if (!scene || !scene.add || !scene.tweens) return;
  const decal = scene.add.graphics();
  decal.setDepth(2); // Just above floor tiles
  decal.fillStyle(0x18181b, 0.75);
  decal.fillCircle(x, y, 16);

  // Inner charred crackle
  decal.fillStyle(0x7f1d1d, 0.4);
  decal.fillCircle(x, y, 9);

  scene.tweens.add({
    targets: decal,
    alpha: 0,
    duration: durationMs,
    ease: 'Quad.easeOut',
    onComplete: () => decal.destroy(),
  });
}

/**
 * Renders Aegis Overdrive orbiting sacred polyhedral barrier around player
 */
export function createAegisDomeVisual(
  scene: Phaser.Scene,
  player: PlayerLike
): { update: (remainingMs: number) => void; destroy: () => void } {
  if (!scene || !scene.add) return { update: () => {}, destroy: () => {} };

  const g = scene.add.graphics();
  g.setDepth(15);

  let angle = 0;

  const update = (remainingMs: number) => {
    if (!g || !g.active || !player || !player.active) return;
    g.clear();

    if (remainingMs <= 0) {
      g.destroy();
      return;
    }

    angle += 0.05;
    const px = player.x;
    const py = player.y;
    const radius = 26;

    // Outer revolving hexagon
    g.lineStyle(2.5, 0xfbbf24, 0.85);
    g.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = angle + (i * Math.PI) / 3;
      const hx = px + Math.cos(a) * radius;
      const hy = py + Math.sin(a) * radius;
      if (i === 0) g.moveTo(hx, hy);
      else g.lineTo(hx, hy);
    }
    g.strokePath();

    // Inner pulsating energy shield
    const pulseAlpha = 0.2 + 0.15 * Math.sin(angle * 3);
    g.fillStyle(0x38bdf8, pulseAlpha);
    g.fillCircle(px, py, radius - 2);

    // 4 orbital light motes
    for (let i = 0; i < 4; i++) {
      const moteAngle = -angle * 1.5 + (i * Math.PI) / 2;
      const mx = px + Math.cos(moteAngle) * (radius + 4);
      const my = py + Math.sin(moteAngle) * (radius + 4);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(mx, my, 2.5);
    }
  };

  const destroy = () => {
    if (g && g.active) g.destroy();
  };

  return { update, destroy };
}
