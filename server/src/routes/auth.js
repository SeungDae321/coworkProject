import { Router } from 'express';
import { User } from '../models/User.js';
import { authRequired, signToken } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password || password.length < 6) {
      return res.status(400).json({
        error: '이메일과 6자 이상 비밀번호가 필요합니다.',
      });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ email, passwordHash });
    const token = signToken(user._id.toString());

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        youtubeConnected: Boolean(user.youtube?.connected),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user || !(await user.comparePassword(password || ''))) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = signToken(user._id.toString());
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        youtubeConnected: Boolean(user.youtube?.connected),
        youtubeChannel: user.youtube?.channelTitle || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json({
      id: user._id,
      email: user.email,
      youtubeConnected: Boolean(user.youtube?.connected),
      youtubeChannel: user.youtube?.channelTitle || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
