import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const url = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`NOAA returned ${resp.status}`);
    const raw: string[][] = await resp.json();

    const data = raw.slice(1).map(row => ({
      t: row[0],
      kp: row[1] !== null && row[1] !== '' ? parseFloat(row[1]) : null,
    })).filter(d => d.t && d.kp !== null);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(502).json({
      error: `Failed to fetch Kp index: ${msg}`,
      suggestion: 'Try switching to Demo Mode.',
    });
  }
}
