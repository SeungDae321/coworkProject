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
  const { timeoutMs = 15000, body, headers: extraHeaders, signal, ...rest } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...(extraHeaders || {}),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(path, {
      ...rest,
      method: options.method || (body ? 'POST' : 'GET'),
      headers,
      signal: signal || controller.signal,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || '요청에 실패했습니다.');
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function videoUrlWithToken(videoUrl) {
  if (!videoUrl) return '';
  const token = getToken();
  const sep = videoUrl.includes('?') ? '&' : '?';
  return `${videoUrl}${sep}token=${encodeURIComponent(token || '')}`;
}
