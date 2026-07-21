const TOKEN_KEY = 'shorts_auth_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || '요청에 실패했습니다.');
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function videoUrlWithToken(videoUrl) {
  if (!videoUrl) return '';
  const token = getToken();
  const sep = videoUrl.includes('?') ? '&' : '?';
  return `${videoUrl}${sep}token=${encodeURIComponent(token || '')}`;
}
