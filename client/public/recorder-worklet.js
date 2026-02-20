/**
 * AudioWorkletProcessor that captures PCM frames and posts them to the main thread.
 */
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._recording = false;
    this.port.onmessage = (e) => {
      if (e.data.command === 'start') {
        this._recording = true;
      } else if (e.data.command === 'stop') {
        this._recording = false;
      }
    };
  }

  process(inputs) {
    if (!this._recording) return true;
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Copy channel data (stereo or mono)
    const channelData = [];
    for (let ch = 0; ch < input.length; ch++) {
      channelData.push(new Float32Array(input[ch]));
    }
    this.port.postMessage({ channelData });
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
