import path from 'path';
import fs from 'fs';
import { Job, JOB_STATUS, JOB_TYPES } from '../models/Job.js';
import { Project, PROJECT_STATUS } from '../models/Project.js';
import { User } from '../models/User.js';
import { config } from '../config.js';
import { generateTtsFallback, extractSceneSearchQueries } from '../services/openai.js';
import { fetchAssetsForScenes } from '../services/pexels.js';
import { composeShortsVideo, ensureFfmpegAvailable } from '../services/ffmpeg.js';
import { uploadShortsVideo } from '../services/youtube.js';

const queue = [];
let processing = false;

async function updateJob(jobId, patch) {
  return Job.findByIdAndUpdate(jobId, patch, { new: true });
}

async function processRenderJob(job) {
  const project = await Project.findById(job.projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  await updateJob(job._id, {
    status: JOB_STATUS.RUNNING,
    progress: 5,
    message: '렌더 준비 중...',
  });
  project.status = PROJECT_STATUS.RENDERING;
  project.lastError = undefined;
  await project.save();

  await ensureFfmpegAvailable();

  const script =
    project.script.final || project.script.draft || '';
  if (!script) throw new Error('승인된 스크립트가 없습니다.');

  const workDir = path.join(config.storageRoot, 'temp', String(project._id));
  const imagesDir = path.join(workDir, 'images');
  const audioPath = path.join(config.storageRoot, 'audio', `${project._id}.mp3`);
  const outputPath = path.join(
    config.storageRoot,
    'videos',
    `${project._id}_${Date.now()}.mp4`
  );

  fs.mkdirSync(workDir, { recursive: true });

  const fallbackQuery =
    project.selectedTopic?.title ||
    project.correctedKeyword ||
    project.keyword;

  await updateJob(job._id, {
    progress: 15,
    message: '스크립트 장면 키워드 추출 중...',
  });
  const scenes = await extractSceneSearchQueries(
    script,
    project.selectedTopic?.title || fallbackQuery
  );

  await updateJob(job._id, {
    progress: 25,
    message: '장면별 배경 이미지 다운로드 중...',
  });
  const { assets, scenes: sceneMeta } = await fetchAssetsForScenes(
    scenes,
    imagesDir,
    fallbackQuery
  );

  await updateJob(job._id, { progress: 45, message: 'TTS 음성 생성 중...' });
  await generateTtsFallback(script, audioPath);

  await updateJob(job._id, { progress: 65, message: '영상 합성 중 (FFmpeg)...' });
  const { duration } = await composeShortsVideo({
    imagePaths: assets.map((a) => a.path),
    audioPath,
    script,
    outputPath,
    workDir,
  });

  project.videoPath = outputPath;
  project.videoUrl = `/storage/videos/${path.basename(outputPath)}`;
  project.mediaMeta = {
    pexelsIds: assets.map((a) => a.pexelsId),
    audioPath,
    durationSec: duration,
    scenes: sceneMeta.map((s) => ({
      query: s.query,
      caption: s.caption,
      pexelsId: s.pexelsId,
    })),
  };
  project.status = PROJECT_STATUS.VIDEO_READY;
  await project.save();

  await updateJob(job._id, {
    status: JOB_STATUS.SUCCEEDED,
    progress: 100,
    message: '영상 제작 완료',
  });
}

async function processUploadJob(job) {
  const project = await Project.findById(job.projectId);
  const user = await User.findById(job.userId);
  if (!project || !user) throw new Error('프로젝트 또는 사용자를 찾을 수 없습니다.');
  if (!project.videoPath) throw new Error('업로드할 영상이 없습니다.');

  await updateJob(job._id, {
    status: JOB_STATUS.RUNNING,
    progress: 10,
    message: 'YouTube 업로드 중...',
  });
  project.status = PROJECT_STATUS.UPLOADING;
  await project.save();

  const title = project.selectedTopic?.title || project.correctedKeyword || 'Shorts';
  const description =
    project.script.final ||
    project.script.draft ||
    project.selectedTopic?.description ||
    '';

  const result = await uploadShortsVideo({
    user,
    filePath: project.videoPath,
    title,
    description: description.slice(0, 4000),
    tags: [project.correctedKeyword, project.keyword].filter(Boolean),
    privacyStatus: project.uploadPrivacy || 'private',
  });

  project.youtubeVideoId = result.videoId;
  project.youtubeUrl = result.url;
  project.status = PROJECT_STATUS.UPLOADED;
  await project.save();

  await updateJob(job._id, {
    status: JOB_STATUS.SUCCEEDED,
    progress: 100,
    message: '업로드 완료',
  });
}

async function runNext() {
  if (processing || queue.length === 0) return;
  processing = true;
  const jobId = queue.shift();

  try {
    const job = await Job.findById(jobId);
    if (!job || job.status !== JOB_STATUS.QUEUED) {
      processing = false;
      runNext();
      return;
    }

    if (job.type === JOB_TYPES.RENDER) {
      await processRenderJob(job);
    } else if (job.type === JOB_TYPES.UPLOAD) {
      await processUploadJob(job);
    }
  } catch (err) {
    console.error('[job] failed', jobId, err);
    const job = await Job.findById(jobId);
    if (job) {
      await updateJob(jobId, {
        status: JOB_STATUS.FAILED,
        error: err.message || String(err),
        message: '작업 실패',
      });
      await Project.findByIdAndUpdate(job.projectId, {
        status: PROJECT_STATUS.FAILED,
        lastError: err.message || String(err),
      });
    }
  } finally {
    processing = false;
    runNext();
  }
}

export async function enqueueJob({ projectId, userId, type }) {
  const job = await Job.create({
    projectId,
    userId,
    type,
    status: JOB_STATUS.QUEUED,
    progress: 0,
    message: '대기 중',
  });
  queue.push(job._id.toString());
  setImmediate(runNext);
  return job;
}

export async function getLatestJob(projectId, type) {
  const query = { projectId };
  if (type) query.type = type;
  return Job.findOne(query).sort({ createdAt: -1 });
}
