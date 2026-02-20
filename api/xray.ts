import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_RANGES = ['6-hour', '1-day'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const range = (req.query.range as string) || '6-hour';
  if (!ALLOWED_RANGES.includes(range)) {
    return res.status(400).json({ error: `Invalid range. Allowed: ${ALLOWED_RANGES.join(', ')}` });
  }

  try {
    const url = `https://services.swpc.noaa.gov/json/goes/primary/xrays-${range}.json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`NOAA returned ${resp.status}`);
    const raw: Array<Record<string, unknown>> = await resp.json();

    const data = raw.map(row => ({
      t: row.time_tag as string,
      flux: typeof row.flux === 'number' ? row.flux : null,
      observed_flux: typeof row.observed_flux === 'number' ? row.observed_flux : null,
    })).filter(d => d.t && d.flux !== null);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(502).json({
      error: `Failed to fetch X-ray flux: ${msg}`,
      suggestion: 'Try switching to Demo Mode.',
    });
  }
}
