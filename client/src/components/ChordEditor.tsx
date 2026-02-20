import React from 'react';
import { VoiceConfig, NOTE_NAMES, DEFAULT_VOICES, SynthParams } from '../types';

interface Props {
  params: SynthParams;
  onChange: (params: SynthParams) => void;
}

const OCTAVES = [2, 3, 4, 5, 6];

export const ChordEditor: React.FC<Props> = ({ params, onChange }) => {
  const updateVoice = (index: number, partial: Partial<VoiceConfig>) => {
    const newVoices = params.voices.map((v, i) =>
      i === index ? { ...v, ...partial } : v,
    );
    onChange({ ...params, voices: newVoices });
  };

  const resetChord = () => {
    onChange({
      ...params,
      voices: [...DEFAULT_VOICES],
      sharpElevenIntensity: 0.15,
    });
  };

  return (
    <div className="control-group chord-editor">
      <h4>Chord (4 Voices)</h4>
      <div className="chord-voices">
        {params.voices.map((voice, i) => (
          <div key={i} className="voice-row">
            <span className="voice-label">V{i + 1}</span>
            <select
              value={voice.note}
              onChange={e => updateVoice(i, { note: e.target.value })}
            >
              {NOTE_NAMES.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select
              value={voice.octave}
              onChange={e => updateVoice(i, { octave: parseInt(e.target.value) })}
            >
              {OCTAVES.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button className="btn btn-reset" onClick={resetChord}>
        Reset to C#maj7 (+#11 color)
      </button>
    </div>
  );
};
