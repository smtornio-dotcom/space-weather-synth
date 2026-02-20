import { DataPoint, DataStream, PlasmaPoint, KpPoint, XrayPoint } from '../types';

const BASE = 'http://localhost:3099/api';

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function fetchPlasma(range = '1-day'): Promise<PlasmaPoint[]> {
  return fetchJson<PlasmaPoint[]>(`${BASE}/solar-wind/plasma?range=${range}`);
}

export async function fetchKp(): Promise<KpPoint[]> {
  return fetchJson<KpPoint[]>(`${BASE}/kp`);
}

export async function fetchXray(range = '6-hour'): Promise<XrayPoint[]> {
  return fetchJson<XrayPoint[]>(`${BASE}/xray?range=${range}`);
}

export function extractStream(
  stream: DataStream,
  plasmaData: PlasmaPoint[],
  kpData: KpPoint[],
  xrayData: XrayPoint[],
): DataPoint[] {
  switch (stream) {
    case 'solar-wind-speed':
      return plasmaData
        .filter(d => d.speed !== null)
        .map(d => ({ t: d.t, value: d.speed! }));
    case 'solar-wind-density':
      return plasmaData
        .filter(d => d.density !== null)
        .map(d => ({ t: d.t, value: d.density! }));
    case 'kp':
      return kpData.map(d => ({ t: d.t, value: d.kp }));
    case 'xray':
      return xrayData.map(d => ({ t: d.t, value: d.flux }));
  }
}

// --- Demo data generators ---

function smoothNoise(len: number, scale: number, drift: number): number[] {
  const arr: number[] = [];
  let v = Math.random() * scale;
  for (let i = 0; i < len; i++) {
    v += (Math.random() - 0.5) * drift;
    v = Math.max(0, v);
    arr.push(v);
  }
  return arr;
}

export function generateDemoData(stream: DataStream, count = 200): DataPoint[] {
  const now = Date.now();
  const interval = 60_000; // 1 min per point

  switch (stream) {
    case 'solar-wind-speed': {
      const vals = smoothNoise(count, 400, 8);
      return vals.map((v, i) => ({
        t: new Date(now - (count - i) * interval).toISOString(),
        value: 250 + v,
      }));
    }
    case 'solar-wind-density': {
      const vals = smoothNoise(count, 5, 0.3);
      return vals.map((v, i) => ({
        t: new Date(now - (count - i) * interval).toISOString(),
        value: 1 + v,
      }));
    }
    case 'kp': {
      // Kp changes slowly, stepwise
      const pts: DataPoint[] = [];
      let kp = Math.floor(Math.random() * 4) + 1;
      for (let i = 0; i < count; i++) {
        if (Math.random() < 0.03) {
          kp = Math.max(0, Math.min(9, kp + (Math.random() < 0.5 ? 1 : -1)));
        }
        pts.push({
          t: new Date(now - (count - i) * interval * 30).toISOString(), // 30min intervals
          value: kp,
        });
      }
      return pts;
    }
    case 'xray': {
      // Mostly low with occasional spikes
      return Array.from({ length: count }, (_, i) => {
        let flux = 1e-7 + Math.random() * 5e-8;
        if (Math.random() < 0.02) {
          flux *= 10 + Math.random() * 90; // flare spike
        }
        return {
          t: new Date(now - (count - i) * interval).toISOString(),
          value: flux,
        };
      });
    }
  }
}
