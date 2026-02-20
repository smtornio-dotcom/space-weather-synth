// --- Data types ---
export interface PlasmaPoint {
  t: string;
  density: number | null;
  speed: number | null;
  temperature: number | null;
}

export interface KpPoint {
  t: string;
  kp: number;
}

export interface XrayPoint {
  t: string;
  flux: number;
  observed_flux?: number | null;
}

export type DataStream = 'solar-wind-speed' | 'solar-wind-density' | 'kp' | 'xray';

export interface DataPoint {
  t: string;
  value: number;
}

// --- Audio types ---
export type Waveform = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface VoiceConfig {
  note: string; // e.g. "C#"
  octave: number;
}

export interface ADSRConfig {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface DelayConfig {
  mix: number;
  time: number;
  feedback: number;
}

export interface ReverbConfig {
  mix: number;
  decay: number;
}

export interface FilterConfig {
  cutoff: number;
  resonance: number;
}

export interface SynthParams {
  masterVolume: number;
  waveform: Waveform;
  adsr: ADSRConfig;
  delay: DelayConfig;
  reverb: ReverbConfig;
  filter: FilterConfig;
  sensitivity: number;
  voices: VoiceConfig[];
  sharpElevenIntensity: number;
  arpEnabled: boolean;
  arpRate: number; // ms per step
}

export interface Take {
  id: string;
  name: string;
  blob: Blob;
  duration: number;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function noteToMidi(note: string, octave: number): number {
  const idx = NOTE_NAMES.indexOf(note as typeof NOTE_NAMES[number]);
  if (idx === -1) return 60;
  return (octave + 1) * 12 + idx;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const DEFAULT_VOICES: VoiceConfig[] = [
  { note: 'C#', octave: 3 },
  { note: 'G#', octave: 3 },
  { note: 'C', octave: 4 },   // enharmonic B#3 = C4
  { note: 'F', octave: 4 },   // enharmonic E#4 = F4
];

export const DEFAULT_SYNTH_PARAMS: SynthParams = {
  masterVolume: 0.5,
  waveform: 'triangle',
  adsr: { attack: 3.0, decay: 2.0, sustain: 0.6, release: 4.0 },
  delay: { mix: 0.2, time: 0.5, feedback: 0.2 },
  reverb: { mix: 0.35, decay: 4.0 },
  filter: { cutoff: 2000, resonance: 1.5 },
  sensitivity: 0.5,
  voices: [...DEFAULT_VOICES],
  sharpElevenIntensity: 0.15,
  arpEnabled: true,
  arpRate: 4000,
};

export const STREAM_LABELS: Record<DataStream, string> = {
  'solar-wind-speed': 'Solar Wind Speed (km/s)',
  'solar-wind-density': 'Solar Wind Density (p/cm\u00B3)',
  'kp': 'Kp Index (0\u20139)',
  'xray': 'GOES X-ray Flux (W/m\u00B2)',
};

export const STREAM_UNITS: Record<DataStream, string> = {
  'solar-wind-speed': 'km/s',
  'solar-wind-density': 'p/cm\u00B3',
  'kp': '',
  'xray': 'W/m\u00B2',
};
