import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Stepper from '../components/Stepper';
import ProgressBar from '../components/ProgressBar';
import { api, videoUrlWithToken } from '../api/client';

export default function WizardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [project, setProject] = useState(null);
  const [scriptText, setScriptText] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const step = useMemo(() => {
    if (!project) return 1;
    if (project.youtubeUrl || project.status === 'uploaded' || project.status === 'uploading') return 4;
    if (
      project.status === 'rendering' ||
      project.status === 'video_ready' ||
      project.status === 'failed' ||
      project.videoUrl
    ) {
      return 3;
    }
    if (project.status === 'script_pending' || project.status === 'script_approved' || project.script?.draft) {
      return 2;
    }
    return 1;
  }, [project]);

  async function loadProject(projectId) {
    const data = await api(`/api/projects/${projectId}`);
    setProject(data);
    setScriptText(data.script?.final || data.script?.draft || '');
    setPrivacy(data.uploadPrivacy || 'private');
    return data;
  }

  useEffect(() => {
    if (!id) return;
    loadProject(id).catch((err) => setError(err.message));
  }, [id]);

  // Poll while rendering / uploading
  useEffect(() => {
    if (!project?.id) return;
    const shouldPoll =
      project.status === 'rendering' ||
      project.status === 'uploading' ||
      project.job?.status === 'queued' ||
      project.job?.status === 'running';

    if (!shouldPoll) return undefined;

    const timer = setInterval(() => {
      loadProject(project.id).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [project?.id, project?.status, project?.job?.status]);

  async function createAndSearch(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const created = await api('/api/projects', {
        method: 'POST',
        body: { keyword },
      });
      const withTopics = await api(`/api/projects/${created.id}/topics`, {
        method: 'POST',
      });
      setProject(withTopics);
      navigate(`/projects/${created.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function selectTopic(index) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/projects/${project.id}/topic`, {
        method: 'PATCH',
        body: { index },
      });
      const withScript = await api(`/api/projects/${project.id}/script`, {
        method: 'POST',
      });
      setProject(withScript);
      setScriptText(withScript.script?.final || '');
      setInfo('스크립트가 생성되었습니다. 수정 후 승인하세요.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function approveScript() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/projects/${project.id}/script`, {
        method: 'PATCH',
        body: { script: scriptText, approve: true },
      });
      const rendered = await api(`/api/projects/${project.id}/render`, {
        method: 'POST',
      });
      setProject({ ...rendered.project, job: rendered.job });
      setInfo('영상 제작을 시작했습니다.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remake() {
    setBusy(true);
    setError('');
    try {
      const data = await api(`/api/projects/${project.id}/remake`, { method: 'POST' });
      setProject({ ...data.project, job: data.job });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function approveAndGoUpload() {
    setProject((p) => ({ ...p, status: 'video_ready' }));
    // move UI to upload step by setting a soft flag via youtubeUrl absence but we use step 4 manually
    setInfo('영상을 승인했습니다. 업로드 단계로 진행하세요.');
    // Force step 4 by temporarily marking a local field
    setProject((p) => ({ ...p, _forceUpload: true }));
  }

  const displayStep = project?._forceUpload || project?.youtubeUrl || project?.status === 'uploaded' || project?.status === 'uploading'
    ? 4
    : step;

  async function startUpload() {
    setBusy(true);
    setError('');
    try {
      const data = await api(`/api/projects/${project.id}/upload`, {
        method: 'POST',
        body: { privacyStatus: privacy },
      });
      setProject({ ...data.project, job: data.job, _forceUpload: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-semibold text-white mb-2">쇼츠 자동 제작</h1>
      <p className="text-slate-400 mb-6 text-sm">
        키워드 입력 → 주제 선택 → 스크립트 승인 → 영상 제작 → YouTube 업로드
      </p>

      <Stepper step={displayStep} />

      {error && (
        <div className="mb-4 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {info}
        </div>
      )}

      {/* Step 1: keyword + topics */}
      {displayStep === 1 && (
        <section className="space-y-6">
          {!project?.candidates?.length && (
            <form onSubmit={createAndSearch} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <label className="block space-y-2">
                <span className="font-medium text-white">주제 / 키워드</span>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="예: 건강한 아침 루틴, 재테크 팁..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-violet-500"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 px-5 py-2.5 font-medium"
              >
                {busy ? '검색 중...' : '관련 주제 추천받기'}
              </button>
            </form>
          )}

          {project?.candidates?.length > 0 && (
            <div className="space-y-4">
              {project.correctedKeyword &&
                project.correctedKeyword !== project.keyword && (
                  <p className="text-sm text-amber-200 bg-amber-950/30 border border-amber-800 rounded-xl px-4 py-2">
                    오타 보정: <span className="line-through opacity-70">{project.keyword}</span>
                    {' → '}
                    <strong>{project.correctedKeyword}</strong>
                  </p>
                )}
              <h2 className="text-lg font-medium text-white">추천 주제 5개 (하나만 선택)</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {project.candidates.map((c, index) => (
                  <button
                    key={`${c.title}-${index}`}
                    type="button"
                    disabled={busy}
                    onClick={() => selectTopic(index)}
                    className="text-left rounded-2xl border border-slate-800 bg-slate-900 p-4 hover:border-violet-500 transition disabled:opacity-60"
                  >
                    <h3 className="font-medium text-white mb-1">{c.title}</h3>
                    <p className="text-sm text-slate-400">{c.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Step 2: script */}
      {displayStep === 2 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-medium text-white">스크립트 검토</h2>
            <p className="text-sm text-slate-400 mt-1">
              선택 주제: {project?.selectedTopic?.title}
            </p>
          </div>
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            rows={14}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-violet-500 leading-relaxed"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !scriptText.trim()}
              onClick={approveScript}
              className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 px-5 py-2.5 font-medium"
            >
              {busy ? '처리 중...' : '승인하고 영상 제작'}
            </button>
          </div>
        </section>
      )}

      {/* Step 3: video review */}
      {displayStep === 3 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <h2 className="text-lg font-medium text-white">영상 미리보기</h2>

          {(project?.status === 'rendering' ||
            project?.job?.status === 'queued' ||
            project?.job?.status === 'running') && (
            <ProgressBar
              value={project?.job?.progress || 10}
              message={project?.job?.message || '영상 제작 중...'}
            />
          )}

          {project?.status === 'failed' && (
            <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              실패: {project.lastError || project.job?.error || '알 수 없는 오류'}
            </div>
          )}

          {project?.videoUrl && project?.status !== 'rendering' && (
            <div className="flex justify-center">
              <video
                key={project.videoUrl}
                controls
                className="w-full max-w-xs rounded-xl border border-slate-700 bg-black aspect-[9/16]"
                src={videoUrlWithToken(project.videoUrl)}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {(project?.status === 'video_ready' || project?.videoUrl) &&
              project?.status !== 'rendering' && (
                <button
                  type="button"
                  onClick={approveAndGoUpload}
                  className="rounded-xl bg-violet-600 hover:bg-violet-500 px-5 py-2.5 font-medium"
                >
                  영상 승인 (업로드로)
                </button>
              )}
            <button
              type="button"
              disabled={busy || project?.status === 'rendering'}
              onClick={remake}
              className="rounded-xl border border-slate-600 hover:bg-slate-800 disabled:opacity-60 px-5 py-2.5"
            >
              다시 만들기
            </button>
          </div>
          {project?.remakeCount > 0 && (
            <p className="text-xs text-slate-500">재생성 횟수: {project.remakeCount}</p>
          )}
        </section>
      )}

      {/* Step 4: upload */}
      {displayStep === 4 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <h2 className="text-lg font-medium text-white">YouTube 업로드</h2>
          <p className="text-sm text-slate-400">
            업로드 전 설정에서 YouTube 계정을 연결해주세요. 기본 공개 범위는 private 입니다.
          </p>

          {project?.videoUrl && (
            <div className="flex justify-center">
              <video
                controls
                className="w-full max-w-xs rounded-xl border border-slate-700 bg-black aspect-[9/16]"
                src={videoUrlWithToken(project.videoUrl)}
              />
            </div>
          )}

          <label className="block space-y-2 max-w-xs">
            <span className="text-sm text-slate-300">공개 설정</span>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2"
            >
              <option value="private">비공개 (private)</option>
              <option value="unlisted">일부 공개 (unlisted)</option>
              <option value="public">공개 (public)</option>
            </select>
          </label>

          {(project?.status === 'uploading' ||
            (project?.job?.type === 'upload' &&
              (project?.job?.status === 'queued' || project?.job?.status === 'running'))) && (
            <ProgressBar
              value={project?.job?.progress || 10}
              message={project?.job?.message || '업로드 중...'}
            />
          )}

          {project?.youtubeUrl && (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm">
              업로드 완료!{' '}
              <a
                href={project.youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-violet-300 underline"
              >
                {project.youtubeUrl}
              </a>
            </div>
          )}

          {!project?.youtubeUrl && (
            <button
              type="button"
              disabled={busy || project?.status === 'uploading'}
              onClick={startUpload}
              className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 px-5 py-2.5 font-medium"
            >
              {busy ? '요청 중...' : 'YouTube에 업로드'}
            </button>
          )}
        </section>
      )}
    </Layout>
  );
}
