import React, { useEffect, useRef, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { DataPoint, DataStream, STREAM_LABELS, STREAM_UNITS } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
);

interface Props {
  data: DataPoint[];
  stream: DataStream;
  onStreamChange: (s: DataStream) => void;
  liveMode: boolean;
  onLiveModeChange: (live: boolean) => void;
  freezeMapping: boolean;
  onFreezeMappingChange: (f: boolean) => void;
  currentValue: number | null;
  smoothedValue: number | null;
  lastUpdate: string | null;
}

const STREAMS: DataStream[] = ['solar-wind-speed', 'solar-wind-density', 'kp', 'xray'];

export const SpaceWeatherPanel: React.FC<Props> = ({
  data,
  stream,
  onStreamChange,
  liveMode,
  onLiveModeChange,
  freezeMapping,
  onFreezeMappingChange,
  currentValue,
  smoothedValue,
  lastUpdate,
}) => {
  const chartRef = useRef<ChartJS<'line'>>(null);

  const isLog = stream === 'xray';

  const chartData = useMemo(() => {
    const labels = data.map(d => {
      try {
        const date = new Date(d.t);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return d.t;
      }
    });

    return {
      labels,
      datasets: [
        {
          label: STREAM_LABELS[stream],
          data: data.map(d => d.value),
          borderColor: '#6ee7b7',
          backgroundColor: 'rgba(110, 231, 183, 0.08)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [data, stream]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      title: { display: false },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        display: true,
        ticks: {
          color: '#9ca3af',
          maxTicksLimit: 10,
          font: { size: 10 },
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        type: (isLog ? 'logarithmic' : 'linear') as 'linear' | 'logarithmic',
        display: true,
        ticks: {
          color: '#9ca3af',
          font: { size: 10 },
          callback: (val: string | number) => {
            if (isLog && typeof val === 'number') return val.toExponential(1);
            return val;
          },
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  }), [isLog]);

  const formatValue = (v: number | null): string => {
    if (v === null) return '--';
    if (stream === 'xray') return v.toExponential(2);
    if (stream === 'kp') return v.toFixed(1);
    return v.toFixed(1);
  };

  return (
    <div className="panel space-panel">
      <div className="panel-header">
        <h2>Space Weather</h2>
        <div className="panel-controls">
          <select
            value={stream}
            onChange={e => onStreamChange(e.target.value as DataStream)}
          >
            {STREAMS.map(s => (
              <option key={s} value={s}>{STREAM_LABELS[s]}</option>
            ))}
          </select>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={liveMode}
              onChange={e => onLiveModeChange(e.target.checked)}
            />
            <span>{liveMode ? 'Live' : 'Demo'}</span>
          </label>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={freezeMapping}
              onChange={e => onFreezeMappingChange(e.target.checked)}
            />
            <span>Freeze Mapping</span>
          </label>
        </div>
      </div>

      <div className="chart-container">
        <Line ref={chartRef} data={chartData} options={chartOptions} />
      </div>

      <div className="stats-row">
        <div className="stat">
          <span className="stat-label">Current</span>
          <span className="stat-value">{formatValue(currentValue)} {STREAM_UNITS[stream]}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Smoothed</span>
          <span className="stat-value">{formatValue(smoothedValue)} {STREAM_UNITS[stream]}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Last Update</span>
          <span className="stat-value">
            {lastUpdate
              ? new Date(lastUpdate).toLocaleTimeString()
              : '--'}
          </span>
        </div>
      </div>
    </div>
  );
};
