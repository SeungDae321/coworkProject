import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const api = axios.create({
  baseURL: 'https://api.pexels.com',
  timeout: 30000,
});

function headers() {
  if (!config.pexelsApiKey) {
    throw new Error('PEXELS_API_KEY가 설정되지 않았습니다.');
  }
  return {
    Authorization: config.pexelsApiKey,
    // Cloudflare(Pexels edge) may block requests without a User-Agent (error 1010)
    'User-Agent': 'ShortsAutomator/1.0',
    Accept: 'application/json',
  };
}

export async function searchPhotos(query, perPage = 5) {
  const { data } = await api.get('/v1/search', {
    headers: headers(),
    params: {
      query,
      per_page: perPage,
      orientation: 'portrait',
      locale: 'ko-KR',
    },
  });
  return data.photos || [];
}

export async function searchVideos(query, perPage = 3) {
  const { data } = await api.get('/videos/search', {
    headers: headers(),
    params: {
      query,
      per_page: perPage,
      orientation: 'portrait',
      locale: 'ko-KR',
    },
  });
  return data.videos || [];
}

export async function downloadFile(url, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    headers: {
      'User-Agent': 'ShortsAutomator/1.0',
      Accept: 'image/*,*/*',
    },
  });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  return outputPath;
}

async function downloadFirstUnusedPhoto(query, destDir, index, usedIds) {
  let photos = await searchPhotos(query, 8);
  if (!photos.length) {
    const { data } = await api.get('/v1/search', {
      headers: headers(),
      params: { query, per_page: 8 },
    });
    photos = data.photos || [];
  }

  for (const photo of photos) {
    const id = String(photo.id);
    if (usedIds.has(id)) continue;
    const url =
      photo.src?.large2x || photo.src?.large || photo.src?.original || photo.src?.medium;
    if (!url) continue;

    const ext = url.includes('.png') ? 'png' : 'jpg';
    const filePath = path.join(destDir, `scene_${index}.${ext}`);
    await downloadFile(url, filePath);
    usedIds.add(id);
    return {
      type: 'image',
      path: filePath,
      pexelsId: id,
      photographer: photo.photographer,
      query,
    };
  }
  return null;
}

/**
 * Fetch a mix of portrait images (and optional video stills) for background.
 */
export async function fetchBackgroundAssets(query, destDir, count = 4) {
  fs.mkdirSync(destDir, { recursive: true });
  const photos = await searchPhotos(query, count);
  const assets = [];

  for (let i = 0; i < photos.length; i += 1) {
    const photo = photos[i];
    const url =
      photo.src?.large2x || photo.src?.large || photo.src?.original || photo.src?.medium;
    if (!url) continue;
    const ext = url.includes('.png') ? 'png' : 'jpg';
    const filePath = path.join(destDir, `bg_${i}.${ext}`);
    await downloadFile(url, filePath);
    assets.push({
      type: 'image',
      path: filePath,
      pexelsId: String(photo.id),
      photographer: photo.photographer,
    });
  }

  if (assets.length === 0) {
    // fallback without orientation constraint
    const { data } = await api.get('/v1/search', {
      headers: headers(),
      params: { query, per_page: count },
    });
    for (let i = 0; i < (data.photos || []).length; i += 1) {
      const photo = data.photos[i];
      const url = photo.src?.large || photo.src?.original;
      if (!url) continue;
      const filePath = path.join(destDir, `bg_fb_${i}.jpg`);
      await downloadFile(url, filePath);
      assets.push({
        type: 'image',
        path: filePath,
        pexelsId: String(photo.id),
        photographer: photo.photographer,
      });
    }
  }

  if (assets.length === 0) {
    throw new Error('Pexels에서 배경 이미지를 찾지 못했습니다.');
  }

  return assets;
}

/**
 * Fetch one portrait image per script scene. Falls back per-scene, then bulk topic search.
 */
export async function fetchAssetsForScenes(scenes, destDir, fallbackQuery) {
  fs.mkdirSync(destDir, { recursive: true });
  const usedIds = new Set();
  const assets = [];
  const sceneMeta = [];
  let lastSuccessQuery = '';

  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const candidates = [
      scene.query,
      lastSuccessQuery,
      fallbackQuery,
    ].filter((q, idx, arr) => q && arr.indexOf(q) === idx);

    let asset = null;
    let usedQuery = scene.query;
    for (const q of candidates) {
      try {
        asset = await downloadFirstUnusedPhoto(q, destDir, i, usedIds);
        if (asset) {
          usedQuery = q;
          lastSuccessQuery = q;
          break;
        }
      } catch (err) {
        console.warn(`[pexels] scene ${i} query "${q}" failed:`, err.message);
      }
    }

    if (!asset) continue;

    assets.push(asset);
    sceneMeta.push({
      query: scene.query,
      caption: scene.caption || '',
      pexelsId: asset.pexelsId,
      resolvedQuery: usedQuery,
    });
  }

  if (assets.length === 0) {
    const fallback = await fetchBackgroundAssets(
      fallbackQuery || scenes[0]?.query || 'nature',
      destDir,
      Math.max(4, scenes.length || 4)
    );
    return {
      assets: fallback,
      scenes: fallback.map((a, i) => ({
        query: fallbackQuery || scenes[0]?.query || 'nature',
        caption: scenes[i]?.caption || '',
        pexelsId: a.pexelsId,
        resolvedQuery: fallbackQuery || scenes[0]?.query || 'nature',
      })),
    };
  }

  return { assets, scenes: sceneMeta };
}
