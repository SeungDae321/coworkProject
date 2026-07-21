import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function SettingsPage() {
  const { refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api('/api/youtube/status');
    setStatus(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    const yt = searchParams.get('youtube');
    if (yt === 'connected') {
      setMessage('YouTube 계정이 연결되었습니다.');
      refreshUser().catch(() => {});
    } else if (yt === 'error') {
      setError(searchParams.get('message') || 'YouTube 연결에 실패했습니다.');
    }
  }, [searchParams, refreshUser]);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/youtube/oauth/start');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api('/api/youtube/disconnect', { method: 'POST' });
      await load();
      await refreshUser();
      setMessage('YouTube 연결이 해제되었습니다.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold text-white mb-6">설정</h1>

      {message && (
        <div className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-medium text-white">YouTube 연결</h2>
        <p className="text-sm text-slate-400">
          Shorts 업로드를 위해 Google OAuth로 본인 채널을 연결합니다.
        </p>

        {status && (
          <dl className="text-sm space-y-2">
            <div className="flex gap-2">
              <dt className="text-slate-400 w-32">OAuth 설정</dt>
              <dd>{status.configured ? '구성됨' : '미구성 (.env 필요)'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400 w-32">연결 상태</dt>
              <dd>{status.connected ? '연결됨' : '미연결'}</dd>
            </div>
            {status.channelTitle && (
              <div className="flex gap-2">
                <dt className="text-slate-400 w-32">채널</dt>
                <dd>{status.channelTitle}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          {!status?.connected ? (
            <button
              type="button"
              disabled={busy || status?.configured === false}
              onClick={connect}
              className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 px-5 py-2.5 font-medium"
            >
              YouTube 연결하기
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={disconnect}
              className="rounded-xl border border-slate-600 hover:bg-slate-800 px-5 py-2.5"
            >
              연결 해제
            </button>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-2 text-sm text-slate-400">
        <h2 className="text-lg font-medium text-white mb-2">참고</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>OpenAI / Pexels API 키는 서버 `.env`에만 저장합니다.</li>
          <li>영상 합성에는 로컬 FFmpeg가 필요합니다.</li>
          <li>업로드 기본값은 private이며, YouTube 정책을 준수하세요.</li>
          <li>배경 이미지는 Pexels 라이선스 범위 내에서 사용됩니다.</li>
        </ul>
      </section>
    </Layout>
  );
}
