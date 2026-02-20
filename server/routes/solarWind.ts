import { Router, Request, Response } from 'express';
import { getCache, setCache, dedup } from '../utils/cache.js';

const router = Router();

const ALLOWED_RANGES = ['2-hour', '6-hour', '1-day'] as const;
type Range = (typeof ALLOWED_RANGES)[number];

function isValidRange(r: string): r is Range {
  return (ALLOWED_RANGES as readonly string[]).includes(r);
}

// --- Plasma ---
router.get('/plasma', async (req: Request, res: Response) => {
  const range = (req.query.range as string) || '1-day';
  if (!isValidRange(range)) {
    res.status(400).json({ error: `Invalid range. Allowed: ${ALLOWED_RANGES.join(', ')}` });
    return;
  }

  const cacheKey = `plasma-${range}`;
  const cached = getCache<unknown[]>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const data = await dedup(cacheKey, async () => {
      const url = `https://services.swpc.noaa.gov/products/solar-wind/plasma-${range}.json`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`NOAA returned ${resp.status}`);
      const raw: string[][] = await resp.json();
      // First row is header: ["time_tag","density","speed","temperature"]
      return raw.slice(1).map(row => ({
        t: row[0],
        density: row[1] !== null && row[1] !== '' ? parseFloat(row[1]) : null,
        speed: row[2] !== null && row[2] !== '' ? parseFloat(row[2]) : null,
        temperature: row[3] !== null && row[3] !== '' ? parseFloat(row[3]) : null,
      })).filter(d => d.t);
    });

    setCache(cacheKey, data, 45_000); // 45s TTL
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({
      error: `Failed to fetch solar wind plasma data: ${msg}`,
      suggestion: 'Try switching to Demo Mode in the UI.',
    });
  }
});

// --- Magnetometer ---
router.get('/mag', async (req: Request, res: Response) => {
  const range = (req.query.range as string) || '1-day';
  if (!isValidRange(range)) {
    res.status(400).json({ error: `Invalid range. Allowed: ${ALLOWED_RANGES.join(', ')}` });
    return;
  }

  const cacheKey = `mag-${range}`;
  const cached = getCache<unknown[]>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const data = await dedup(cacheKey, async () => {
      const url = `https://services.swpc.noaa.gov/products/solar-wind/mag-${range}.json`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`NOAA returned ${resp.status}`);
      const raw: string[][] = await resp.json();
      return raw.slice(1).map(row => ({
        t: row[0],
        bt: row[1] !== null && row[1] !== '' ? parseFloat(row[1]) : null,
        bx: row[2] !== null && row[2] !== '' ? parseFloat(row[2]) : null,
        by: row[3] !== null && row[3] !== '' ? parseFloat(row[3]) : null,
        bz: row[4] !== null && row[4] !== '' ? parseFloat(row[4]) : null,
      })).filter(d => d.t);
    });

    setCache(cacheKey, data, 45_000);
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({
      error: `Failed to fetch magnetometer data: ${msg}`,
      suggestion: 'Try switching to Demo Mode.',
    });
  }
});

export default router;
