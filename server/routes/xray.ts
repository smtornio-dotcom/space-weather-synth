import { Router, Request, Response } from 'express';
import { getCache, setCache, dedup } from '../utils/cache.js';

const router = Router();

const ALLOWED_RANGES = ['6-hour', '1-day'] as const;

router.get('/', async (req: Request, res: Response) => {
  const range = (req.query.range as string) || '6-hour';
  if (!(ALLOWED_RANGES as readonly string[]).includes(range)) {
    res.status(400).json({ error: `Invalid range. Allowed: ${ALLOWED_RANGES.join(', ')}` });
    return;
  }

  const cacheKey = `xray-${range}`;
  const cached = getCache<unknown[]>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const data = await dedup(cacheKey, async () => {
      const url = `https://services.swpc.noaa.gov/json/goes/primary/xrays-${range}.json`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`NOAA returned ${resp.status}`);
      const raw: Array<Record<string, unknown>> = await resp.json();
      return raw.map(row => ({
        t: row.time_tag as string,
        flux: typeof row.flux === 'number' ? row.flux : null,
        observed_flux: typeof row.observed_flux === 'number' ? row.observed_flux : null,
      })).filter(d => d.t && d.flux !== null);
    });

    setCache(cacheKey, data, 60_000); // 60s TTL
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({
      error: `Failed to fetch X-ray flux: ${msg}`,
      suggestion: 'Try switching to Demo Mode.',
    });
  }
});

export default router;
