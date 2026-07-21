import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';

const statusLabel = {
  draft: '초안',
  topic_search: '주제 추천',
  topic_selected: '주제 선택됨',
  script_pending: '스크립트 대기',
  script_approved: '스크립트 승인',
  rendering: '영상 제작 중',
  video_ready: '영상 완료',
  uploading: '업로드 중',
  uploaded: '업로드 완료',
  failed: '실패',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/projects')
      .then(setProjects)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">내 프로젝트</h1>
        <Link
          to="/"
          className="rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium"
        >
          새 작업
        </Link>
      </div>

      {loading && <p className="text-slate-400">불러오는 중...</p>}
      {error && <p className="text-red-300">{error}</p>}

      {!loading && projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">
          아직 프로젝트가 없습니다. 새 작업을 시작해보세요.
        </div>
      )}

      <ul className="space-y-3">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              to={`/projects/${p.id}`}
              className="block rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-violet-600 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium text-white">
                    {p.selectedTopic?.title || p.correctedKeyword || p.keyword}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">키워드: {p.keyword}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                  {statusLabel[p.status] || p.status}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Layout>
  );
}
