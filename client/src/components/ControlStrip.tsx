import React from 'react';
import { SynthParams, Waveform } from '../types';

interface Props {
  params: SynthParams;
  onChange: (params: SynthParams) => void;
  audioRunning: boolean;
  onStartAudio: () => void;
  onStopAudio: () => void;
}

const WAVEFORMS: Waveform[] = ['sine', 'triangle', 'sawtooth', 'square'];

const Knob: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 0.01, unit = '', onChange }) => (
  <div className="knob">
    <label>{label}</label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
    />
    <span className="knob-value">
      {value < 0.01 && value > 0 ? value.toExponential(1) : value.toFixed(2)}{unit}
    </span>
  </div>
);

export const ControlStrip: React.FC<Props> = ({
  params,
  onChange,
  audioRunning,
  onStartAudio,
  onStopAudio,
}) => {
  const update = (partial: Partial<SynthParams>) => {
    onChange({ ...params, ...partial });
  };

  return (
    <div className="control-strip">
      {/* Audio Start/Stop */}
      <div className="control-group audio-toggle">
        <button
          className={`btn ${audioRunning ? 'btn-stop' : 'btn-start'}`}
          onClick={audioRunning ? onStopAudio : onStartAudio}
        >
          {audioRunning ? 'Stop Audio' : 'Start Audio'}
        </button>
      </div>

      {/* Master */}
      <div className="control-group">
        <h4>Master</h4>
        <Knob
          label="Volume"
          value={params.masterVolume}
          min={0} max={1}
          onChange={v => update({ masterVolume: v })}
        />
        <Knob
          label="Sensitivity"
          value={params.sensitivity}
          min={0} max={1}
          onChange={v => update({ sensitivity: v })}
        />
      </div>

      {/* Waveform */}
      <div className="control-group">
        <h4>Waveform</h4>
        <div className="wave-select">
          {WAVEFORMS.map(w => (
            <button
              key={w}
              className={`btn-wave ${params.waveform === w ? 'active' : ''}`}
              onClick={() => update({ waveform: w })}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* ADSR */}
      <div className="control-group">
        <h4>ADSR</h4>
        <Knob label="Attack" value={params.adsr.attack} min={0.1} max={10} step={0.1}
          unit="s" onChange={v => update({ adsr: { ...params.adsr, attack: v } })} />
        <Knob label="Decay" value={params.adsr.decay} min={0.1} max={10} step={0.1}
          unit="s" onChange={v => update({ adsr: { ...params.adsr, decay: v } })} />
        <Knob label="Sustain" value={params.adsr.sustain} min={0} max={1}
          onChange={v => update({ adsr: { ...params.adsr, sustain: v } })} />
        <Knob label="Release" value={params.adsr.release} min={0.1} max={15} step={0.1}
          unit="s" onChange={v => update({ adsr: { ...params.adsr, release: v } })} />
      </div>

      {/* Delay */}
      <div className="control-group">
        <h4>Delay</h4>
        <Knob label="Mix" value={params.delay.mix} min={0} max={0.8}
          onChange={v => update({ delay: { ...params.delay, mix: v } })} />
        <Knob label="Time" value={params.delay.time} min={0.05} max={1.5} step={0.01}
          unit="s" onChange={v => update({ delay: { ...params.delay, time: v } })} />
        <Knob label="Feedback" value={params.delay.feedback} min={0} max={0.7}
          onChange={v => update({ delay: { ...params.delay, feedback: v } })} />
      </div>

      {/* Reverb */}
      <div className="control-group">
        <h4>Reverb</h4>
        <Knob label="Mix" value={params.reverb.mix} min={0} max={0.9}
          onChange={v => update({ reverb: { ...params.reverb, mix: v } })} />
        <Knob label="Decay" value={params.reverb.decay} min={0.5} max={8} step={0.1}
          unit="s" onChange={v => update({ reverb: { ...params.reverb, decay: v } })} />
      </div>

      {/* Filter */}
      <div className="control-group">
        <h4>Filter</h4>
        <Knob label="Cutoff" value={params.filter.cutoff} min={100} max={8000} step={10}
          unit="Hz" onChange={v => update({ filter: { ...params.filter, cutoff: v } })} />
        <Knob label="Resonance" value={params.filter.resonance} min={0.1} max={15} step={0.1}
          onChange={v => update({ filter: { ...params.filter, resonance: v } })} />
      </div>

      {/* #11 Color */}
      <div className="control-group">
        <h4>#11 Color</h4>
        <Knob label="Intensity" value={params.sharpElevenIntensity} min={0} max={1}
          onChange={v => update({ sharpElevenIntensity: v })} />
      </div>

      {/* Arpeggiator */}
      <div className="control-group">
        <h4>Arpeggiator</h4>
        <label className="toggle-label" style={{ marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={params.arpEnabled}
            onChange={e => update({ arpEnabled: e.target.checked })}
          />
          <span>{params.arpEnabled ? 'On' : 'Off'}</span>
        </label>
        <Knob label="Rate" value={params.arpRate / 1000} min={0.5} max={12} step={0.1}
          unit="s" onChange={v => update({ arpRate: v * 1000 })} />
      </div>
    </div>
  );
};
