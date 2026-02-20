import { DataPoint } from '../types';

export class EMA {
  private alpha: number;
  private value: number | null = null;

  constructor(alpha = 0.15) {
    this.alpha = alpha;
  }

  update(raw: number): number {
    if (this.value === null) {
      this.value = raw;
    } else {
      this.value = this.alpha * raw + (1 - this.alpha) * this.value;
    }
    return this.value;
  }

  get current(): number {
    return this.value ?? 0;
  }

  reset() {
    this.value = null;
  }
}

export function computeDelta(data: DataPoint[], windowSize = 5): number {
  if (data.length < 2) return 0;
  const recent = data.slice(-windowSize);
  if (recent.length < 2) return 0;
  return recent[recent.length - 1].value - recent[0].value;
}

export function computeVolatility(data: DataPoint[], windowSize = 20): number {
  if (data.length < 2) return 0;
  const recent = data.slice(-windowSize);
  const deltas: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    deltas.push(recent[i].value - recent[i - 1].value);
  }
  if (deltas.length === 0) return 0;
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / deltas.length;
  return Math.sqrt(variance);
}

// Map a value from one range to another (clamped)
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
  return outMin + t * (outMax - outMin);
}

// Log-scale mapping for filter cutoff
export function mapRangeLog(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
  const logMin = Math.log(outMin);
  const logMax = Math.log(outMax);
  return Math.exp(logMin + t * (logMax - logMin));
}
