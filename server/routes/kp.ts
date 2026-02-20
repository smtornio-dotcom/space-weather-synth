import { Router, Request, Response } from 'express';
import { getCache, setCache, dedup } from '../utils/cache.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const cacheKey = 'kp';
  const cached = getCache<unknown[]>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const data = await dedup(cacheKey, async () => {
      const url = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`NOAA returned ${resp.status}`);
      const raw: string[][] = await resp.json();
      // Header: ["time_tag","Kp","Kp_fraction","a_running","station_count"]
      return raw.slice(1).map(row => ({
        t: row[0],
        kp: row[1] !== null && row[1] !== '' ? parseFloat(row[1]) : null,
      })).filter(d => d.t && d.kp !== null);
    });

    setCache(cacheKey, data, 5 * 60_000); // 5 min TTL
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({
      error: `Failed to fetch Kp index: ${msg}`,
      suggestion: 'Try switching to Demo Mode.',
    });
  }
});

export default router;
