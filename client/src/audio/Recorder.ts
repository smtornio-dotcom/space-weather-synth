import { encodeWav } from './wavEncode';
import { Take } from '../types';

/**
 * Records audio from the AudioEngine's master output via an AudioWorkletNode.
 * Falls back to ScriptProcessorNode if AudioWorklet is unavailable.
 */
export class Recorder {
  private ctx: AudioContext;
  private sourceNode: AudioNode;
  private workletNode: AudioWorkletNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private buffers: Float32Array[][] = []; // [frameIndex][channelIndex]
  private recording = false;
  private startTime = 0;
  private workletReady = false;

  constructor(ctx: AudioContext, sourceNode: AudioNode) {
    this.ctx = ctx;
    this.sourceNode = sourceNode;
  }

  async init(): Promise<void> {
    try {
      await this.ctx.audioWorklet.addModule('/recorder-worklet.js');
      this.workletNode = new AudioWorkletNode(this.ctx, 'recorder-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 2,
      });
      this.workletNode.port.onmessage = (e) => {
        if (this.recording && e.data.channelData) {
          this.buffers.push(e.data.channelData);
        }
      };
      // Connect: source -> worklet -> (pass through to nowhere, we just tap)
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.ctx.destination); // need to connect output for process() to fire
      // Actually we don't want double output - disconnect from destination
      // The worklet still needs an output connection to keep processing
      // Connect to a silent gain instead
      const silentGain = this.ctx.createGain();
      silentGain.gain.value = 0;
      this.workletNode.disconnect();
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(silentGain);
      silentGain.connect(this.ctx.destination);

      this.workletReady = true;
    } catch {
      // Fallback to ScriptProcessorNode
      console.warn('AudioWorklet not available, falling back to ScriptProcessorNode');
      this.scriptNode = this.ctx.createScriptProcessor(4096, 2, 2);
      this.scriptNode.onaudioprocess = (e) => {
        if (!this.recording) return;
        const left = new Float32Array(e.inputBuffer.getChannelData(0));
        const right = new Float32Array(e.inputBuffer.getChannelData(1));
        this.buffers.push([left, right]);
      };
      this.sourceNode.connect(this.scriptNode);
      // Connect to a silent gain to keep it running
      const silentGain = this.ctx.createGain();
      silentGain.gain.value = 0;
      this.scriptNode.connect(silentGain);
      silentGain.connect(this.ctx.destination);
    }
  }

  startRecording(): void {
    this.buffers = [];
    this.recording = true;
    this.startTime = Date.now();
    if (this.workletReady && this.workletNode) {
      this.workletNode.port.postMessage({ command: 'start' });
    }
  }

  stopRecording(): Take | null {
    if (!this.recording) return null;
    this.recording = false;
    if (this.workletReady && this.workletNode) {
      this.workletNode.port.postMessage({ command: 'stop' });
    }

    const duration = (Date.now() - this.startTime) / 1000;

    if (this.buffers.length === 0) return null;

    // Determine channel count
    const numChannels = this.buffers[0].length || 2;
    const totalSamples = this.buffers.reduce((sum, frame) => sum + frame[0].length, 0);

    // Merge buffers per channel
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const merged = new Float32Array(totalSamples);
      let offset = 0;
      for (const frame of this.buffers) {
        if (frame[ch]) {
          merged.set(frame[ch], offset);
          offset += frame[ch].length;
        }
      }
      channelData.push(merged);
    }

    // Encode WAV
    const blob = encodeWav(channelData, this.ctx.sampleRate);

    const take: Take = {
      id: `take-${Date.now()}`,
      name: `Take ${new Date().toLocaleTimeString()}`,
      blob,
      duration,
    };

    this.buffers = [];
    return take;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  dispose(): void {
    this.recording = false;
    if (this.workletNode) {
      try { this.workletNode.disconnect(); } catch { /* */ }
    }
    if (this.scriptNode) {
      try { this.scriptNode.disconnect(); } catch { /* */ }
    }
  }
}
