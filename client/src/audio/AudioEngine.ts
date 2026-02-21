import {
  SynthParams,
  noteToMidi,
  midiToFreq,
  DEFAULT_SYNTH_PARAMS,
  DataStream,
} from '../types';
import { EMA, mapRange, mapRangeLog } from '../utils/smoothing';

// Prevent HMR duplicates — only one engine can run at a time
declare global {
  interface Window {
    __spaceWeatherEngine?: AudioEngine;
    __spaceWeatherStarting?: boolean; // Global lock survives HMR
  }
}

function createReverbIR(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  panner: StereoPannerNode;
  baseMidi: number; // base MIDI note for this voice
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private voices: Voice[] = [];
  private sharpElevenVoice: Voice | null = null;

  private filterNode!: BiquadFilterNode;
  private delayNode!: DelayNode;
  private delayFeedback!: GainNode;
  private delayMix!: GainNode;
  private delayDry!: GainNode;
  private reverbNode!: ConvolverNode;
  private reverbMix!: GainNode;
  private reverbDry!: GainNode;
  private masterGain!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private mixBus!: GainNode;
  private recorderDestination: MediaStreamAudioDestinationNode | null = null;

  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;

  // Arpeggiator state
  private arpEnabled = true;
  private arpTimerId: ReturnType<typeof setTimeout> | null = null;
  private arpRate = 3000;

  private params: SynthParams = { ...DEFAULT_SYNTH_PARAMS };
  private _running = false;
  private _starting = false; // Synchronous lock

  private dataEma = new EMA(0.12);
  private recentValues: number[] = [];

  get audioContext(): AudioContext | null { return this.ctx; }
  get isRunning(): boolean { return this._running; }
  get masterOutputNode(): AudioNode | null { return this.masterGain ?? null; }

  /**
   * Call this SYNCHRONOUSLY from the click/tap handler — before any await.
   * Mobile browsers (iOS Safari) require AudioContext creation + resume
   * to happen in the direct user-gesture call stack.
   */
  initContext(): boolean {
    if (this._starting || this._running || window.__spaceWeatherStarting) return false;
    this._starting = true;
    window.__spaceWeatherStarting = true;

    // Kill any prior engine globally (HMR safety)
    if (window.__spaceWeatherEngine && window.__spaceWeatherEngine !== this) {
      window.__spaceWeatherEngine.stop();
    }
    window.__spaceWeatherEngine = this;

    this.ctx = new AudioContext();
    this.ctx.resume(); // must be called synchronously in gesture

    // Test beep: plain oscillator → destination, bypasses entire chain.
    // If you can't hear this, Web Audio itself isn't working on this device.
    const testOsc = this.ctx.createOscillator();
    const testGain = this.ctx.createGain();
    testOsc.frequency.value = 440;
    testGain.gain.value = 0.3;
    testOsc.connect(testGain);
    testGain.connect(this.ctx.destination);
    testOsc.start();
    testGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    testGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    testOsc.stop(this.ctx.currentTime + 0.6);

    return true;
  }

  async start(params: SynthParams): Promise<void> {
    // initContext() must have been called first (synchronously)
    if (!this.ctx || this._running) {
      this._starting = false;
      window.__spaceWeatherStarting = false;
      return;
    }

    this.params = { ...params };
    this.arpRate = params.arpRate;

    // Ensure context is fully running
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    // ---- Build graph ----
    this.mixBus = this.ctx.createGain();
    this.mixBus.gain.value = 1.0;

    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = params.filter.cutoff;
    this.filterNode.Q.value = params.filter.resonance;

    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = params.delay.time;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = params.delay.feedback;
    this.delayMix = this.ctx.createGain();
    this.delayMix.gain.value = params.delay.mix;
    this.delayDry = this.ctx.createGain();
    this.delayDry.gain.value = 1.0;
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayMix);

    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = createReverbIR(this.ctx, Math.min(params.reverb.decay, 6), 2.5);
    this.reverbMix = this.ctx.createGain();
    this.reverbMix.gain.value = params.reverb.mix;
    this.reverbDry = this.ctx.createGain();
    this.reverbDry.gain.value = 1.0 - params.reverb.mix * 0.3;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = params.masterVolume;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.06;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 80;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filterNode.frequency);
    this.lfo.start();

    // Chain: mixBus -> filter -> delay(parallel) -> reverb(parallel) -> limiter -> master -> dest
    const postFilter = this.ctx.createGain();
    this.mixBus.connect(this.filterNode);
    this.filterNode.connect(postFilter);
    postFilter.connect(this.delayDry);
    postFilter.connect(this.delayNode);

    const postDelay = this.ctx.createGain();
    this.delayDry.connect(postDelay);
    this.delayMix.connect(postDelay);
    postDelay.connect(this.reverbDry);
    postDelay.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbMix);

    const postReverb = this.ctx.createGain();
    this.reverbDry.connect(postReverb);
    this.reverbMix.connect(postReverb);
    postReverb.connect(this.limiter);
    this.limiter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.recorderDestination = this.ctx.createMediaStreamDestination();
    this.masterGain.connect(this.recorderDestination);

    // ---- Voices ----
    this.buildVoices(params);

    this._running = true;
    this._starting = false;
    window.__spaceWeatherStarting = false;

    // ---- Start arp ----
    // Trigger first note IMMEDIATELY so there's sound right away
    if (params.arpEnabled) {
      this.triggerArpNote();
      this.scheduleArpStep();
    } else {
      // If arp is off, bring all voices to audible level immediately
      const now = this.ctx.currentTime;
      const level = params.adsr.sustain * 0.25;
      this.voices.forEach(v => {
        v.gain.gain.setTargetAtTime(level, now, 0.3);
      });
    }

    console.log('[AudioEngine] Started (single instance). ctx.state:', this.ctx.state);
  }

  private buildVoices(params: SynthParams): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const pans = [-0.5, -0.15, 0.15, 0.5];
    const detunes = [-8, -3, 3, 8];

    params.voices.forEach((vc, i) => {
      const midi = noteToMidi(vc.note, vc.octave);
      const osc = this.ctx!.createOscillator();
      osc.type = params.waveform;
      osc.frequency.value = midiToFreq(midi);
      osc.detune.value = detunes[i] ?? 0;

      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0, now);

      const panner = this.ctx!.createStereoPanner();
      panner.pan.value = pans[i] ?? 0;

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.mixBus);
      osc.start(now);
      this.voices.push({ osc, gain, panner, baseMidi: midi });
    });

    // #11 color voice: G4 (= F## = #11 of C#)
    const midi11 = noteToMidi('G', 4);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(midi11);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = 0;
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.mixBus);
    osc.start(now);
    this.sharpElevenVoice = { osc, gain, panner, baseMidi: midi11 };
  }

  // ---- Random arpeggiator with octave transposition ----

  private scheduleArpStep(): void {
    if (!this._running || !this.ctx) return;

    // Random jitter on timing: ±30% for organic feel
    const jitter = this.arpRate * (0.7 + Math.random() * 0.6);

    this.arpTimerId = setTimeout(() => {
      this.triggerArpNote();
      this.scheduleArpStep(); // schedule next
    }, jitter);
  }

  private triggerArpNote(): void {
    if (!this.ctx || !this._running) return;
    const now = this.ctx.currentTime;
    const n = this.voices.length;
    if (n === 0) return;

    // Pick 1-2 random voices to trigger
    const count = Math.random() < 0.3 ? 2 : 1; // 30% chance of cluster
    const indices = new Set<number>();
    while (indices.size < count) {
      indices.add(Math.floor(Math.random() * n));
    }

    // Octave transposition: random shift of -1, 0, or +1 octave (weighted toward 0)
    const octaveShifts = [-12, 0, 0, 0, 0, 12]; // heavily weighted to stay put

    for (const idx of indices) {
      const voice = this.voices[idx];
      const shift = octaveShifts[Math.floor(Math.random() * octaveShifts.length)];
      const targetMidi = voice.baseMidi + shift;
      const targetFreq = midiToFreq(targetMidi);

      // Smoothly shift pitch
      voice.osc.frequency.setTargetAtTime(targetFreq, now, 0.15);

      // Random pan drift
      const panDrift = (Math.random() - 0.5) * 0.4;
      voice.panner.pan.setTargetAtTime(
        Math.max(-1, Math.min(1, voice.panner.pan.value + panDrift)),
        now, 0.3,
      );

      // Volume envelope: swell up then decay
      const peakLevel = (0.35 + Math.random() * 0.2) * this.params.adsr.sustain;
      const attack = 0.1 + Math.random() * (this.params.adsr.attack * 0.3);
      const holdTime = this.arpRate / 1000 * 0.3;
      const decayTau = this.arpRate / 1000 * 0.4;

      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(peakLevel, now + attack);
      voice.gain.gain.setTargetAtTime(peakLevel * 0.5, now + attack + holdTime, decayTau);
    }

    // Occasionally trigger #11 color (20% chance)
    if (this.sharpElevenVoice && Math.random() < 0.2) {
      const colorPeak = this.params.sharpElevenIntensity * 0.15;
      const attack = 0.2 + Math.random() * 0.5;
      this.sharpElevenVoice.gain.gain.cancelScheduledValues(now);
      this.sharpElevenVoice.gain.gain.setValueAtTime(
        this.sharpElevenVoice.gain.gain.value, now,
      );
      this.sharpElevenVoice.gain.gain.linearRampToValueAtTime(colorPeak, now + attack);
      this.sharpElevenVoice.gain.gain.setTargetAtTime(
        colorPeak * 0.1, now + attack + 0.5, this.arpRate / 1000 * 0.5,
      );
    }
  }

  setArpRate(ms: number): void {
    this.arpRate = Math.max(300, Math.min(16000, ms));
  }

  setArpEnabled(enabled: boolean): void {
    if (enabled === this.arpEnabled) return;
    this.arpEnabled = enabled;
    if (!enabled) {
      if (this.arpTimerId) { clearTimeout(this.arpTimerId); this.arpTimerId = null; }
      // Settle all voices to steady pad
      if (this.ctx && this._running) {
        const now = this.ctx.currentTime;
        const level = this.params.adsr.sustain * 0.2;
        this.voices.forEach(v => {
          v.osc.frequency.setTargetAtTime(midiToFreq(v.baseMidi), now, 0.3);
          v.gain.gain.cancelScheduledValues(now);
          v.gain.gain.setTargetAtTime(level, now, 0.5);
        });
        if (this.sharpElevenVoice) {
          this.sharpElevenVoice.gain.gain.cancelScheduledValues(now);
          this.sharpElevenVoice.gain.gain.setTargetAtTime(
            this.params.sharpElevenIntensity * 0.1, now, 0.5,
          );
        }
      }
    } else if (this._running) {
      this.scheduleArpStep();
    }
  }

  stop(): void {
    if (!this.ctx) return;
    this._starting = false;
    window.__spaceWeatherStarting = false;
    if (this.arpTimerId) { clearTimeout(this.arpTimerId); this.arpTimerId = null; }

    const now = this.ctx.currentTime;
    [...this.voices, this.sharpElevenVoice].forEach(v => {
      if (!v) return;
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0, now, 0.1);
    });
    this.masterGain.gain.setTargetAtTime(0, now, 0.1);

    const ctx = this.ctx;
    this._running = false;
    this.ctx = null; // Immediately null to prevent re-entry
    if (window.__spaceWeatherEngine === this) {
      window.__spaceWeatherEngine = undefined;
    }

    setTimeout(() => {
      this.voices.forEach(v => { try { v.osc.stop(); } catch { /* */ } });
      if (this.sharpElevenVoice) try { this.sharpElevenVoice.osc.stop(); } catch { /* */ }
      try { this.lfo.stop(); } catch { /* */ }
      this.voices = [];
      this.sharpElevenVoice = null;
      ctx.close();
      this.ctx = null;
    }, 2000);
  }

  getRecorderStream(): MediaStream | null {
    return this.recorderDestination?.stream ?? null;
  }

  // ---- Parameter updates ----
  updateParams(params: SynthParams): void {
    this.params = { ...params };
    if (!this.ctx || !this._running) return;
    const now = this.ctx.currentTime;
    const t = 0.3;

    this.masterGain.gain.setTargetAtTime(params.masterVolume, now, t);
    this.filterNode.frequency.setTargetAtTime(params.filter.cutoff, now, t);
    this.filterNode.Q.setTargetAtTime(params.filter.resonance, now, t);
    this.delayNode.delayTime.setTargetAtTime(params.delay.time, now, t);
    this.delayFeedback.gain.setTargetAtTime(params.delay.feedback, now, t);
    this.delayMix.gain.setTargetAtTime(params.delay.mix, now, t);
    this.reverbMix.gain.setTargetAtTime(params.reverb.mix, now, t);
    this.reverbDry.gain.setTargetAtTime(1.0 - params.reverb.mix * 0.3, now, t);

    this.voices.forEach(v => {
      if (v.osc.type !== params.waveform) v.osc.type = params.waveform;
    });

    // Update base MIDI notes from chord editor
    params.voices.forEach((vc, i) => {
      if (this.voices[i]) {
        const midi = noteToMidi(vc.note, vc.octave);
        this.voices[i].baseMidi = midi;
        // If arp is off, also move the oscillator directly
        if (!this.arpEnabled) {
          this.voices[i].osc.frequency.setTargetAtTime(midiToFreq(midi), now, t);
        }
      }
    });
  }

  // ---- Data mapping ----
  applyDataMapping(
    stream: DataStream,
    rawValue: number,
    _allData: { value: number }[],
    sensitivity: number,
    frozen: boolean,
  ): { smoothedValue: number } {
    const smoothed = this.dataEma.update(rawValue);
    if (!this.ctx || !this._running || frozen) {
      return { smoothedValue: smoothed };
    }

    this.recentValues.push(rawValue);
    if (this.recentValues.length > 50) this.recentValues.shift();

    const now = this.ctx.currentTime;
    const ramp = 1.5;
    const s = sensitivity;

    switch (stream) {
      case 'solar-wind-speed': {
        const cutoff = mapRangeLog(smoothed, 250, 800, 400, 4000);
        const target = this.params.filter.cutoff + (cutoff - this.params.filter.cutoff) * s;
        this.filterNode.frequency.setTargetAtTime(target, now, ramp);
        const arpMs = mapRange(smoothed, 250, 800, 5000, 1500);
        this.setArpRate(arpMs);
        break;
      }
      case 'solar-wind-density': {
        const revMix = mapRange(smoothed, 1, 20, 0.15, 0.65) * s + this.params.reverb.mix * (1 - s);
        this.reverbMix.gain.setTargetAtTime(revMix, now, ramp);
        break;
      }
      case 'kp': {
        const lfoDepth = mapRange(smoothed, 0, 9, 30, 300) * s;
        this.lfoGain.gain.setTargetAtTime(lfoDepth, now, ramp);
        if (this.sharpElevenVoice) {
          const col = mapRange(smoothed, 0, 9, 0.02, 0.25) * s;
          this.sharpElevenVoice.gain.gain.setTargetAtTime(col, now, ramp);
        }
        const res = mapRange(smoothed, 0, 9, 0.5, 6) * s + this.params.filter.resonance * (1 - s);
        this.filterNode.Q.setTargetAtTime(res, now, ramp);
        break;
      }
      case 'xray': {
        const logFlux = Math.log10(Math.max(smoothed, 1e-9));
        const norm = mapRange(logFlux, -8, -4, 0, 1);
        const cutoff = mapRangeLog(norm, 0, 1, 600, 5000) * s + this.params.filter.cutoff * (1 - s);
        this.filterNode.frequency.setTargetAtTime(cutoff, now, ramp);
        const rev = mapRange(norm, 0, 1, 0.1, 0.6) * s + this.params.reverb.mix * (1 - s);
        this.reverbMix.gain.setTargetAtTime(rev, now, ramp);
        break;
      }
    }
    return { smoothedValue: smoothed };
  }

  resetDataSmoothing(): void {
    this.dataEma.reset();
    this.recentValues = [];
  }
}
