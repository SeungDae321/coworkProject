import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import youtubeRoutes from './routes/youtube.js';

const app = express();

app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'shorts-automator' });
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/youtube', youtubeRoutes);

app.get('/storage/videos/:filename', (req, res) => {
  const token =
    req.query.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  try {
    jwt.verify(String(token), config.jwtSecret);
  } catch {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }

  const filename = path.basename(req.params.filename);
  const filePath = path.join(config.storageRoot, 'videos', filename);
  return res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: '영상을 찾을 수 없습니다.' });
    }
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || '서버 오류가 발생했습니다.',
  });
});

async function start() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
