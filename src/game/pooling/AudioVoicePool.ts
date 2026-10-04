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
  public allocSeq: number = 0;
  private readonly modulators: Set<AudioNode> = new Set();

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
        // Safe fallback for restricted or mock contexts - teardown partially created nodes
        this.disconnect();
      }
    }
  }

  public attachModulator(node: AudioNode): void {
    this.modulators.add(node);
  }

  public detachModulator(node: AudioNode): void {
    this.modulators.delete(node);
  }

  public detachAllModulators(): void {
    for (const mod of this.modulators) {
      try {
        mod.disconnect();
      } catch {}
    }
    this.modulators.clear();
  }

  public play(params: AudioVoiceToneParams, ctx: AudioContext): void {
    if (!this.osc || !this.gain || !this.filter) return;
    const now = ctx.currentTime;
    const duration = Math.max(0.01, Number.isFinite(params.duration) ? params.duration : 0.1);
    const wasActive = this.isBusy && Number.isFinite(this.endTime) && now < this.endTime;

    // Cancel all scheduled parameter automations from previous sounds & unhook modulators
    this.detachAllModulators();
    this.gain.gain.cancelScheduledValues(now);
    this.osc.frequency.cancelScheduledValues(now);
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.Q.cancelScheduledValues(now);

    // 1. Oscillator type & frequency
    if (params.type) {
      this.osc.type = params.type;
    }
    const baseFreq = Number.isFinite(params.frequency) ? Math.max(10, params.frequency) : 440;
    this.osc.frequency.setValueAtTime(baseFreq, now);

    if (params.frequencyRamp && Number.isFinite(params.frequencyRamp.target) && Number.isFinite(params.frequencyRamp.duration) && params.frequencyRamp.duration > 0) {
      const rampEnd = now + params.frequencyRamp.duration;
      const targetFreq = Math.max(10, params.frequencyRamp.target);
      if (params.frequencyRamp.exponential) {
        this.osc.frequency.exponentialRampToValueAtTime(targetFreq, rampEnd);
      } else {
        this.osc.frequency.linearRampToValueAtTime(targetFreq, rampEnd);
      }
    }

    // 2. Filter configuration
    if (params.filter && Number.isFinite(params.filter.frequency)) {
      this.filter.type = params.filter.type;
      this.filter.frequency.setValueAtTime(Math.max(10, params.filter.frequency), now);
      if (params.filter.q !== undefined && Number.isFinite(params.filter.q)) {
        this.filter.Q.setValueAtTime(params.filter.q, now);
      } else {
        this.filter.Q.setValueAtTime(1.0, now);
      }
      if (params.filter.rampTarget !== undefined && params.filter.rampDuration !== undefined &&
          Number.isFinite(params.filter.rampTarget) && Number.isFinite(params.filter.rampDuration) && params.filter.rampDuration > 0) {
        this.filter.frequency.exponentialRampToValueAtTime(
          Math.max(10, params.filter.rampTarget),
          now + params.filter.rampDuration
        );
      }
    } else {
      this.filter.type = 'allpass';
      this.filter.frequency.setValueAtTime(350, now);
      this.filter.Q.setValueAtTime(1.0, now);
    }

    // 3. Gain Envelope with click-free preemption de-zippering
    const peakGain = Number.isFinite(params.gain) ? Math.max(0.0001, Math.min(1.0, params.gain!)) : 0.3;
    const attack = (params.attackTime && Number.isFinite(params.attackTime)) ? Math.max(0.001, params.attackTime) : 0.005;

    if (wasActive) {
      // 2ms micro-fade down to eliminate DC jump pop/click, then ramp attack
      this.gain.gain.linearRampToValueAtTime(0.0001, now + 0.002);
      this.gain.gain.linearRampToValueAtTime(peakGain, now + 0.002 + attack);
    } else {
      this.gain.gain.setValueAtTime(0.0001, now);
      this.gain.gain.linearRampToValueAtTime(peakGain, now + attack);
    }

    const attackEnd = now + (wasActive ? 0.002 + attack : attack);
    const totalEnd = now + duration;

    if (params.decayTime && Number.isFinite(params.decayTime) && params.decayTime > 0 &&
        params.sustainLevel !== undefined && Number.isFinite(params.sustainLevel)) {
      const decayEnd = attackEnd + params.decayTime;
      const sustainGain = Math.max(0.0001, peakGain * params.sustainLevel);
      this.gain.gain.linearRampToValueAtTime(sustainGain, decayEnd);
      const release = (params.releaseTime && Number.isFinite(params.releaseTime) && params.releaseTime > 0) ? params.releaseTime : 0.05;
      const releaseStart = Math.max(decayEnd, totalEnd - release);
      this.gain.gain.setValueAtTime(sustainGain, releaseStart);
    }

    this.gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(attackEnd + 0.001, totalEnd));

    this.isBusy = true;
    this.startTime = now;
    this.endTime = totalEnd;
  }

  public forceSilence(ctx: AudioContext): void {
    this.detachAllModulators();
    if (!this.gain) return;
    const now = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    if (this.osc) {
      this.osc.frequency.cancelScheduledValues(now);
    }
    if (this.filter) {
      this.filter.frequency.cancelScheduledValues(now);
      this.filter.Q.cancelScheduledValues(now);
    }
    // 3ms quick fade to avoid speaker clicks
    this.gain.gain.linearRampToValueAtTime(0.0001, now + 0.003);
    this.isBusy = false;
    this.endTime = now + 0.003;
  }

  public stop(ctx?: AudioContext): void {
    if (ctx) {
      this.forceSilence(ctx);
    } else {
      this.detachAllModulators();
      this.isBusy = false;
      this.endTime = 0;
    }
  }

  public disconnect(): void {
    this.detachAllModulators();
    try {
      if (this.osc) {
        try {
          this.osc.stop();
        } catch {}
        this.osc.disconnect();
        this.osc = null;
      }
      if (this.filter) {
        this.filter.disconnect();
        this.filter = null;
      }
      if (this.gain) {
        this.gain.disconnect();
        this.gain = null;
      }
    } catch {
      // Safe teardown
    }
    this.isBusy = false;
  }
}

export class AudioVoicePool {
  private static instance: AudioVoicePool | null = null;

  public static getInstance(capacity: number = 16): AudioVoicePool {
    if (!AudioVoicePool.instance) {
      AudioVoicePool.instance = new AudioVoicePool(capacity);
    }
    return AudioVoicePool.instance;
  }

  public static resetInstance(): void {
    if (AudioVoicePool.instance) {
      AudioVoicePool.instance.destroy();
      AudioVoicePool.instance = null;
    }
  }

  public readonly capacity: number;
  private readonly voices: AudioVoice[] = [];
  private ctx: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private sequence: number = 0;

  constructor(capacity: number = 16) {
    this.capacity = capacity;
  }

  public init(ctx: AudioContext): void {
    if (this.ctx === ctx && this.voices.length > 0) return;

    // Disconnect old voices if re-initializing
    for (let i = 0; i < this.voices.length; i++) {
      this.voices[i].disconnect();
    }
    this.voices.length = 0;

    if (this.masterBus) {
      try {
        this.masterBus.disconnect();
      } catch {}
      this.masterBus = null;
    }

    this.ctx = ctx;
    this.sequence = 0;

    // Handle suspended context
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }

    try {
      this.masterBus = ctx.createGain();
      this.masterBus.gain.setValueAtTime(0.85, ctx.currentTime);
      this.masterBus.connect(ctx.destination);
    } catch {
      this.masterBus = null;
    }

    for (let i = 0; i < this.capacity; i++) {
      this.voices.push(new AudioVoice(i, ctx, this.masterBus));
    }
  }

  public acquireVoice(): AudioVoice | null {
    if (!this.ctx || this.voices.length === 0) return null;
    if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().catch(() => {});
    }
    const now = this.ctx.currentTime;

    // 1. Find an idle or expired voice
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i];
      if (!voice.isBusy || !Number.isFinite(voice.endTime) || now >= voice.endTime) {
        voice.isBusy = true;
        voice.allocSeq = ++this.sequence;
        return voice;
      }
    }

    // 2. All voices active -> Hybrid Voice Stealing:
    // If durations differ by > 0.05s, prioritize smallest remaining duration.
    // If durations are similar or tied (burst/stress), prioritize oldest voice (FIFO lowest allocSeq) to avoid voice-0 starvation.
    let minRemaining = Infinity;
    let maxRemaining = -Infinity;
    for (let i = 0; i < this.voices.length; i++) {
      const r = Math.max(0, this.voices[i].endTime - now);
      if (r < minRemaining) minRemaining = r;
      if (r > maxRemaining) maxRemaining = r;
    }

    let bestIdx = 0;
    if (maxRemaining - minRemaining > 0.05) {
      let minR = Infinity;
      let minSeq = Infinity;
      for (let i = 0; i < this.voices.length; i++) {
        const r = Math.max(0, this.voices[i].endTime - now);
        if (r < minR - 0.01) {
          minR = r;
          minSeq = this.voices[i].allocSeq;
          bestIdx = i;
        } else if (Math.abs(r - minR) <= 0.01 && this.voices[i].allocSeq < minSeq) {
          minSeq = this.voices[i].allocSeq;
          bestIdx = i;
        }
      }
    } else {
      let minSeq = Infinity;
      for (let i = 0; i < this.voices.length; i++) {
        if (this.voices[i].allocSeq < minSeq) {
          minSeq = this.voices[i].allocSeq;
          bestIdx = i;
        }
      }
    }

    const stolenVoice = this.voices[bestIdx];
    stolenVoice.forceSilence(this.ctx);
    stolenVoice.allocSeq = ++this.sequence;
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

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public reset(): void {
    if (!this.ctx) return;
    for (let i = 0; i < this.voices.length; i++) {
      this.voices[i].forceSilence(this.ctx);
    }
  }

  public stop(): void {
    this.reset();
  }

  public destroy(): void {
    for (let i = 0; i < this.voices.length; i++) {
      this.voices[i].disconnect();
    }
    this.voices.length = 0;
    if (this.masterBus) {
      try {
        this.masterBus.disconnect();
      } catch {}
      this.masterBus = null;
    }
    this.ctx = null;
    if (AudioVoicePool.instance === this) {
      AudioVoicePool.instance = null;
    }
  }

  public disconnect(): void {
    this.destroy();
  }
}
