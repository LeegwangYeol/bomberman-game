/**
 * Web Audio Voice Recycling Engine for Zero-GC Procedural Sound Synthesis
 *
 * Pre-allocates a fixed pool of AudioVoice instances with persistent oscillators,
 * dynamic waveform switching, ADSR envelope shaping, and click-free voice stealing.
 */

export interface AudioVoiceToneParams {
  type?: OscillatorType; // 'sine' | 'triangle' | 'sawtooth' | 'square'
  frequency: number;
  frequencyRamp?: {
    target: number;
    duration: number;
    exponential?: boolean;
  };
  gain?: number; // Peak amplitude [0.0 - 1.0]
  duration: number; // Total duration in seconds
  attackTime?: number; // Envelope attack in seconds (default 0.005s)
  decayTime?: number; // Envelope decay in seconds
  sustainLevel?: number; // Sustain multiplier [0.0 - 1.0]
  releaseTime?: number; // Release time before duration
  filter?: {
    type: BiquadFilterType;
    frequency: number;
    q?: number;
    rampTarget?: number;
    rampDuration?: number;
  };
}

export class AudioVoice {
  public readonly id: number;
  public osc: OscillatorNode | null = null;
  public filter: BiquadFilterNode | null = null;
  public gain: GainNode | null = null;
  public isBusy: boolean = false;
  public startTime: number = 0;
  public endTime: number = 0;

  constructor(id: number, ctx: AudioContext | null, masterBus?: AudioNode | null) {
    this.id = id;
    if (ctx) {
      try {
        this.osc = ctx.createOscillator();
        this.filter = ctx.createBiquadFilter();
        this.gain = ctx.createGain();

        // Audio routing graph: osc -> filter -> gain -> masterBus/destination
        this.osc.connect(this.filter);
        this.filter.connect(this.gain);
        if (masterBus) {
          this.gain.connect(masterBus);
        } else {
          this.gain.connect(ctx.destination);
        }

        // Silent quiescent state
        this.gain.gain.setValueAtTime(0, ctx.currentTime);
        this.filter.type = 'allpass';
        this.osc.start();
      } catch {
        // Safe fallback for restricted or mock contexts
      }
    }
  }

  public play(params: AudioVoiceToneParams, ctx: AudioContext): void {
    if (!this.osc || !this.gain || !this.filter) return;
    const now = ctx.currentTime;
    const duration = Math.max(0.01, params.duration);

    // Cancel all scheduled parameter automations from previous sounds
    this.gain.gain.cancelScheduledValues(now);
    this.osc.frequency.cancelScheduledValues(now);
    this.filter.frequency.cancelScheduledValues(now);

    // 1. Oscillator type & frequency
    if (params.type) {
      this.osc.type = params.type;
    }
    const baseFreq = Math.max(10, params.frequency);
    this.osc.frequency.setValueAtTime(baseFreq, now);

    if (params.frequencyRamp) {
      const rampEnd = now + params.frequencyRamp.duration;
      const targetFreq = Math.max(10, params.frequencyRamp.target);
      if (params.frequencyRamp.exponential) {
        this.osc.frequency.exponentialRampToValueAtTime(targetFreq, rampEnd);
      } else {
        this.osc.frequency.linearRampToValueAtTime(targetFreq, rampEnd);
      }
    }

    // 2. Filter configuration
    if (params.filter) {
      this.filter.type = params.filter.type;
      this.filter.frequency.setValueAtTime(params.filter.frequency, now);
      if (params.filter.q !== undefined) {
        this.filter.Q.setValueAtTime(params.filter.q, now);
      }
      if (params.filter.rampTarget !== undefined && params.filter.rampDuration !== undefined) {
        this.filter.frequency.exponentialRampToValueAtTime(
          Math.max(10, params.filter.rampTarget),
          now + params.filter.rampDuration
        );
      }
    } else {
      this.filter.type = 'allpass';
    }

    // 3. Gain Envelope
    const peakGain = Math.max(0.0001, Math.min(1.0, params.gain ?? 0.3));
    const attack = params.attackTime ?? 0.005;
    const attackEnd = now + attack;
    const totalEnd = now + duration;

    this.gain.gain.setValueAtTime(0.0001, now);
    this.gain.gain.linearRampToValueAtTime(peakGain, attackEnd);

    if (params.decayTime && params.sustainLevel !== undefined) {
      const decayEnd = attackEnd + params.decayTime;
      const sustainGain = Math.max(0.0001, peakGain * params.sustainLevel);
      this.gain.gain.linearRampToValueAtTime(sustainGain, decayEnd);
      const releaseStart = Math.max(decayEnd, totalEnd - (params.releaseTime ?? 0.05));
      this.gain.gain.setValueAtTime(sustainGain, releaseStart);
    }

    this.gain.gain.exponentialRampToValueAtTime(0.0001, totalEnd);

    this.isBusy = true;
    this.startTime = now;
    this.endTime = totalEnd;
  }

  public forceSilence(ctx: AudioContext): void {
    if (!this.gain) return;
    const now = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    // 3ms quick fade to avoid speaker clicks
    this.gain.gain.linearRampToValueAtTime(0.0001, now + 0.003);
    this.isBusy = false;
    this.endTime = now + 0.003;
  }
}

export class AudioVoicePool {
  public readonly capacity: number;
  private readonly voices: AudioVoice[] = [];
  private ctx: AudioContext | null = null;
  private masterBus: GainNode | null = null;

  constructor(capacity: number = 16) {
    this.capacity = capacity;
  }

  public init(ctx: AudioContext): void {
    if (this.ctx === ctx && this.voices.length > 0) return;
    this.ctx = ctx;

    try {
      this.masterBus = ctx.createGain();
      this.masterBus.gain.setValueAtTime(0.85, ctx.currentTime);
      this.masterBus.connect(ctx.destination);
    } catch {
      this.masterBus = null;
    }

    this.voices.length = 0;
    for (let i = 0; i < this.capacity; i++) {
      this.voices.push(new AudioVoice(i, ctx, this.masterBus));
    }
  }

  public acquireVoice(): AudioVoice | null {
    if (!this.ctx || this.voices.length === 0) return null;
    const now = this.ctx.currentTime;

    // 1. Find an idle or expired voice
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i];
      if (!voice.isBusy || now >= voice.endTime) {
        voice.isBusy = true;
        return voice;
      }
    }

    // 2. All voices active -> Voice Stealing: find voice nearest to finish
    let oldestIdx = 0;
    let minRemaining = Infinity;
    for (let i = 0; i < this.voices.length; i++) {
      const remaining = this.voices[i].endTime - now;
      if (remaining < minRemaining) {
        minRemaining = remaining;
        oldestIdx = i;
      }
    }

    const stolenVoice = this.voices[oldestIdx];
    stolenVoice.forceSilence(this.ctx);
    stolenVoice.isBusy = true;
    return stolenVoice;
  }

  public playTone(params: AudioVoiceToneParams): AudioVoice | null {
    if (!this.ctx) return null;
    const voice = this.acquireVoice();
    if (!voice) return null;
    voice.play(params, this.ctx);
    return voice;
  }

  public getActiveCount(): number {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime;
    let count = 0;
    for (let i = 0; i < this.voices.length; i++) {
      if (this.voices[i].isBusy && now < this.voices[i].endTime) {
        count++;
      }
    }
    return count;
  }

  public reset(): void {
    if (!this.ctx) return;
    for (let i = 0; i < this.voices.length; i++) {
      this.voices[i].forceSilence(this.ctx);
    }
  }
}
