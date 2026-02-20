import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SpaceWeatherPanel } from './components/SpaceWeatherPanel';
import { ControlStrip } from './components/ControlStrip';
import { ChordEditor } from './components/ChordEditor';
import { RecorderPanel } from './components/RecorderPanel';
import { AudioEngine } from './audio/AudioEngine';
import { Recorder } from './audio/Recorder';
import {
  fetchPlasma,
  fetchKp,
  fetchXray,
  extractStream,
  generateDemoData,
} from './api/noaa';
import {
  DataStream,
  DataPoint,
  SynthParams,
  Take,
  PlasmaPoint,
  KpPoint,
  XrayPoint,
  DEFAULT_SYNTH_PARAMS,
} from './types';

const POLL_INTERVAL = 30_000;

// Single global engine — survives HMR and React re-renders
function getEngine(): AudioEngine {
  if (!window.__spaceWeatherEngine) {
    window.__spaceWeatherEngine = new AudioEngine();
  }
  return window.__spaceWeatherEngine;
}

export default function App() {
  const [stream, setStream] = useState<DataStream>('solar-wind-speed');
  const [liveMode, setLiveMode] = useState(true);
  const [freezeMapping, setFreezeMapping] = useState(false);
  const [data, setData] = useState<DataPoint[]>([]);
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [smoothedValue, setSmoothedValue] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  const [synthParams, setSynthParams] = useState<SynthParams>({ ...DEFAULT_SYNTH_PARAMS });
  const [audioRunning, setAudioRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [takes, setTakes] = useState<Take[]>([]);

  // Use refs for audio objects to avoid re-render dependencies
  const engineRef = useRef<AudioEngine>(getEngine());
  const recorderRef = useRef<Recorder | null>(null);
  const synthParamsRef = useRef(synthParams);
  synthParamsRef.current = synthParams; // Always keep ref in sync

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const plasmaRef = useRef<PlasmaPoint[]>([]);
  const kpRef = useRef<KpPoint[]>([]);
  const xrayRef = useRef<XrayPoint[]>([]);

  // Cleanup on unmount / page navigation
  useEffect(() => {
    const cleanup = () => {
      if (window.__spaceWeatherEngine) {
        window.__spaceWeatherEngine.stop();
      }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, []);

  // --- Fetch data ---
  const fetchLiveData = useCallback(async () => {
    try {
      const [plasma, kp, xray] = await Promise.all([
        fetchPlasma('2-hour'),
        fetchKp(),
        fetchXray('6-hour'),
      ]);
      plasmaRef.current = plasma;
      kpRef.current = kp;
      xrayRef.current = xray;
      return true;
    } catch (err) {
      console.warn('Failed to fetch live data:', err);
      return false;
    }
  }, []);

  const updateDisplayData = useCallback(() => {
    if (liveMode) {
      const pts = extractStream(stream, plasmaRef.current, kpRef.current, xrayRef.current);
      setData(pts);
      if (pts.length > 0) {
        const last = pts[pts.length - 1];
        setCurrentValue(last.value);
        setLastUpdate(last.t);
      }
    }
  }, [stream, liveMode]);

  // Live mode polling
  useEffect(() => {
    if (!liveMode) return;
    const poll = async () => {
      const ok = await fetchLiveData();
      if (ok) updateDisplayData();
      else setLiveMode(false);
    };
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [liveMode, fetchLiveData, updateDisplayData]);

  // Demo mode
  useEffect(() => {
    if (liveMode) {
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      return;
    }
    let demoData = generateDemoData(stream, 200);
    setData(demoData);
    setCurrentValue(demoData[demoData.length - 1]?.value ?? null);
    setLastUpdate(demoData[demoData.length - 1]?.t ?? null);

    demoIntervalRef.current = setInterval(() => {
      const last = demoData[demoData.length - 1];
      let newVal = last.value + (Math.random() - 0.5) * 0.05 * last.value;
      newVal = Math.max(0.00001, newVal);
      if (stream === 'xray' && Math.random() < 0.01) newVal *= 5 + Math.random() * 20;
      const newPoint: DataPoint = { t: new Date().toISOString(), value: newVal };
      demoData = [...demoData.slice(1), newPoint];
      setData(demoData);
      setCurrentValue(newVal);
      setLastUpdate(newPoint.t);
    }, 2000);

    return () => { if (demoIntervalRef.current) clearInterval(demoIntervalRef.current); };
  }, [liveMode, stream]);

  // Update display on stream change
  useEffect(() => {
    if (liveMode) updateDisplayData();
  }, [stream, liveMode, updateDisplayData]);

  // Apply data mapping to audio
  useEffect(() => {
    if (!audioRunning || currentValue === null) return;
    const result = engineRef.current.applyDataMapping(
      stream, currentValue, data, synthParamsRef.current.sensitivity, freezeMapping,
    );
    setSmoothedValue(result.smoothedValue);
  }, [currentValue, stream, audioRunning, data, freezeMapping]);

  // Push synth param changes to engine (NOT start/stop — just live updates)
  useEffect(() => {
    if (!audioRunning) return;
    engineRef.current.updateParams(synthParams);
    engineRef.current.setArpEnabled(synthParams.arpEnabled);
    engineRef.current.setArpRate(synthParams.arpRate);
  }, [synthParams, audioRunning]);

  // --- Start Audio (stable callback — reads params from ref) ---
  const startingRef = useRef(false);
  const handleStartAudio = useCallback(async () => {
    if (startingRef.current) return; // React-level guard
    startingRef.current = true;
    try {
      const engine = engineRef.current;
      if (engine.isRunning) return;
      await engine.start(synthParamsRef.current);
      setAudioRunning(true);
      // Set up recorder
      if (engine.audioContext && engine.masterOutputNode) {
        const rec = new Recorder(engine.audioContext, engine.masterOutputNode);
        await rec.init();
        recorderRef.current = rec;
      }
    } finally {
      startingRef.current = false;
    }
  }, []); // No deps — reads from refs

  // --- Stop Audio ---
  const handleStopAudio = useCallback(() => {
    recorderRef.current?.dispose();
    recorderRef.current = null;
    engineRef.current.stop();
    setAudioRunning(false);
    setRecording(false);
    // Fresh engine for next start
    const fresh = new AudioEngine();
    window.__spaceWeatherEngine = fresh;
    engineRef.current = fresh;
  }, []);

  const handleStartRecording = useCallback(() => {
    recorderRef.current?.startRecording();
    setRecording(true);
  }, []);

  const handleStopRecording = useCallback(() => {
    const take = recorderRef.current?.stopRecording();
    if (take) setTakes(prev => [...prev, take]);
    setRecording(false);
  }, []);

  const handleStreamChange = useCallback((s: DataStream) => {
    setStream(s);
    engineRef.current.resetDataSmoothing();
    setSmoothedValue(null);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Space Weather Synth</h1>
        <p className="subtitle">
          Ambient synthesis driven by real-time solar &amp; space weather data.
          Data from NOAA SWPC (public domain). Not affiliated with or endorsed by NOAA.
        </p>
      </header>

      <div className="main-layout">
        <div className="top-panel">
          <SpaceWeatherPanel
            data={data}
            stream={stream}
            onStreamChange={handleStreamChange}
            liveMode={liveMode}
            onLiveModeChange={setLiveMode}
            freezeMapping={freezeMapping}
            onFreezeMappingChange={setFreezeMapping}
            currentValue={currentValue}
            smoothedValue={smoothedValue}
            lastUpdate={lastUpdate}
          />
        </div>

        <div className="bottom-panel">
          <ControlStrip
            params={synthParams}
            onChange={setSynthParams}
            audioRunning={audioRunning}
            onStartAudio={handleStartAudio}
            onStopAudio={handleStopAudio}
          />
          <div className="bottom-right">
            <ChordEditor params={synthParams} onChange={setSynthParams} />
            <RecorderPanel
              recording={recording}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
              takes={takes}
              audioRunning={audioRunning}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
