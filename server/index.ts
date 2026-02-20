import express from 'express';
import cors from 'cors';
import solarWindRouter from './routes/solarWind.js';
import kpRouter from './routes/kp.js';
import xrayRouter from './routes/xray.js';

const PORT = parseInt(process.env.PORT || '3099', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Routes
app.use('/api/solar-wind', solarWindRouter);
app.use('/api/kp', kpRouter);
app.use('/api/xray', xrayRouter);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Space Weather proxy listening on http://localhost:${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});
