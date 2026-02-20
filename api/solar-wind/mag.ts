import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_RANGES = ['2-hour', '6-hour', '1-day'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const range = (req.query.range as string) || '1-day';
  if (!ALLOWED_RANGES.includes(range)) {
    return res.status(400).json({ error: `Invalid range. Allowed: ${ALLOWED_RANGES.join(', ')}` });
  }

  try {
    const url = `https://services.swpc.noaa.gov/products/solar-wind/mag-${range}.json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`NOAA returned ${resp.status}`);
    const raw: string[][] = await resp.json();

    const data = raw.slice(1).map(row => ({
      t: row[0],
      bt: row[1] !== null && row[1] !== '' ? parseFloat(row[1]) : null,
      bx: row[2] !== null && row[2] !== '' ? parseFloat(row[2]) : null,
      by: row[3] !== null && row[3] !== '' ? parseFloat(row[3]) : null,
      bz: row[4] !== null && row[4] !== '' ? parseFloat(row[4]) : null,
    })).filter(d => d.t);

    res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=30');
    return res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(502).json({
      error: `Failed to fetch magnetometer data: ${msg}`,
      suggestion: 'Try switching to Demo Mode.',
    });
  }
}
