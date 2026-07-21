import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white mb-1">Shorts Automator</h1>
        <p className="text-slate-400 text-sm mb-6">
          주제 입력부터 YouTube Shorts 업로드까지 한 번에
        </p>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-800/60 p-1">
          <button
            type="button"
            className={`rounded-lg py-2 text-sm ${mode === 'login' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
            onClick={() => setMode('login')}
          >
            로그인
          </button>
          <button
            type="button"
            className={`rounded-lg py-2 text-sm ${mode === 'register' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
            onClick={() => setMode('register')}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm text-slate-300">이메일</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-violet-500"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-slate-300">비밀번호</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-violet-500"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-sm px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 py-2.5 font-medium"
          >
            {busy ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>

        </div>
    </div>
  );
}
