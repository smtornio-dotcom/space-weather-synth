import React from 'react';
import { Take } from '../types';

interface Props {
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
  takes: Take[];
  audioRunning: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const RecorderPanel: React.FC<Props> = ({
  recording,
  onStart,
  onStop,
  takes,
  audioRunning,
}) => {
  const downloadTake = (take: Take) => {
    const url = URL.createObjectURL(take.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${take.name.replace(/[^a-zA-Z0-9]/g, '_')}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="control-group recorder-panel">
      <h4>Recording</h4>
      <div className="recorder-controls">
        {recording ? (
          <button className="btn btn-stop" onClick={onStop}>
            <span className="rec-dot recording" /> Stop Recording
          </button>
        ) : (
          <button
            className="btn btn-start"
            onClick={onStart}
            disabled={!audioRunning}
            title={!audioRunning ? 'Start audio first' : ''}
          >
            <span className="rec-dot" /> Start Recording
          </button>
        )}
      </div>
      {takes.length > 0 && (
        <div className="takes-list">
          {takes.map(take => (
            <div key={take.id} className="take-row">
              <span className="take-name">{take.name}</span>
              <span className="take-info">
                {formatDuration(take.duration)} &middot; {formatSize(take.blob.size)}
              </span>
              <button className="btn btn-sm" onClick={() => downloadTake(take)}>
                Download .wav
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
