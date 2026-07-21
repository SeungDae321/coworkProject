import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition ${
      isActive
        ? 'bg-violet-600 text-white'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="font-semibold tracking-tight text-white">
            Shorts Automator
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              새 작업
            </NavLink>
            <NavLink to="/projects" className={linkClass}>
              내 프로젝트
            </NavLink>
            <NavLink to="/settings" className={linkClass}>
              설정
            </NavLink>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-slate-400">{user?.email}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
