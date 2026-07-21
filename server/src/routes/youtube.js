import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authRequired } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  getAuthUrl,
  handleOAuthCallback,
  isYoutubeConfigured,
} from '../services/youtube.js';
import { User } from '../models/User.js';

const router = Router();

router.get('/status', authRequired, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    res.json({
      configured: isYoutubeConfigured(),
      connected: Boolean(user?.youtube?.connected),
      channelTitle: user?.youtube?.channelTitle || null,
      channelId: user?.youtube?.channelId || null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/oauth/start', authRequired, (req, res) => {
  if (!isYoutubeConfigured()) {
    return res.status(503).json({
      error: 'YouTube OAuth가 설정되지 않았습니다. .env를 확인하세요.',
    });
  }

  const state = jwt.sign(
    { sub: req.userId, purpose: 'youtube_oauth' },
    config.jwtSecret,
    { expiresIn: '10m' }
  );
  const url = getAuthUrl(state);
  res.json({ url });
});

router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(
        `${config.clientUrl}/settings?youtube=error&message=${encodeURIComponent(String(error))}`
      );
    }
    if (!code || !state) {
      return res.redirect(`${config.clientUrl}/settings?youtube=error`);
    }

    const payload = jwt.verify(String(state), config.jwtSecret);
    if (payload.purpose !== 'youtube_oauth') {
      throw new Error('Invalid OAuth state');
    }

    await handleOAuthCallback(String(code), payload.sub);
    return res.redirect(`${config.clientUrl}/settings?youtube=connected`);
  } catch (err) {
    console.error('YouTube OAuth callback error', err);
    return res.redirect(
      `${config.clientUrl}/settings?youtube=error&message=${encodeURIComponent(err.message || 'oauth_failed')}`
    );
  }
});

router.post('/disconnect', authRequired, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    user.youtube = {
      connected: false,
      channelId: undefined,
      channelTitle: undefined,
      accessTokenEnc: undefined,
      refreshTokenEnc: undefined,
      expiryDate: undefined,
    };
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
