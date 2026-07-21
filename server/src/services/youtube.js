import { google } from 'googleapis';
import fs from 'fs';
import { config } from '../config.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { User } from '../models/User.js';

export function createOAuthClient() {
  return new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    config.youtube.redirectUri
  );
}

export function getAuthUrl(state) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    state,
  });
}

export async function handleOAuthCallback(code, userId) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const youtube = google.youtube({ version: 'v3', auth: client });
  const channels = await youtube.channels.list({
    part: ['snippet'],
    mine: true,
  });

  const channel = channels.data.items?.[0];
  const user = await User.findById(userId);
  if (!user) throw new Error('사용자를 찾을 수 없습니다.');

  user.youtube = {
    connected: true,
    channelId: channel?.id || '',
    channelTitle: channel?.snippet?.title || '',
    accessTokenEnc: encrypt(tokens.access_token || ''),
    refreshTokenEnc: tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : user.youtube?.refreshTokenEnc || '',
    expiryDate: tokens.expiry_date || Date.now() + 3600_000,
  };

  await user.save();
  return user.youtube;
}

async function getAuthedClientForUser(user) {
  if (!user?.youtube?.connected) {
    throw new Error('YouTube 계정이 연결되어 있지 않습니다.');
  }
  const client = createOAuthClient();
  client.setCredentials({
    access_token: decrypt(user.youtube.accessTokenEnc),
    refresh_token: decrypt(user.youtube.refreshTokenEnc),
    expiry_date: user.youtube.expiryDate,
  });

  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      user.youtube.accessTokenEnc = encrypt(tokens.access_token);
    }
    if (tokens.refresh_token) {
      user.youtube.refreshTokenEnc = encrypt(tokens.refresh_token);
    }
    if (tokens.expiry_date) {
      user.youtube.expiryDate = tokens.expiry_date;
    }
    await user.save();
  });

  return client;
}

export async function uploadShortsVideo({
  user,
  filePath,
  title,
  description,
  tags = [],
  privacyStatus = 'private',
}) {
  if (!fs.existsSync(filePath)) {
    throw new Error('업로드할 영상 파일이 없습니다.');
  }

  const auth = await getAuthedClientForUser(user);
  const youtube = google.youtube({ version: 'v3', auth });

  const shortTitle = title.length > 90 ? `${title.slice(0, 87)}...` : title;
  const bodyDescription = `${description}\n\n#Shorts`;

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: shortTitle,
        description: bodyDescription,
        tags: [...tags, 'Shorts', '쇼츠'].slice(0, 10),
        categoryId: '22',
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(filePath),
    },
  });

  const videoId = res.data.id;
  return {
    videoId,
    url: `https://youtube.com/shorts/${videoId}`,
  };
}

export function isYoutubeConfigured() {
  return Boolean(config.youtube.clientId && config.youtube.clientSecret);
}
