import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shorts-automator',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:8000',
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  pexelsApiKey: process.env.PEXELS_API_KEY || '',
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    redirectUri:
      process.env.YOUTUBE_REDIRECT_URI ||
      'http://localhost:4000/api/youtube/oauth/callback',
  },
  storageRoot: path.resolve(__dirname, '../storage'),
};
