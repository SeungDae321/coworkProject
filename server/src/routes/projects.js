import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { Project, PROJECT_STATUS } from '../models/Project.js';
import { correctAndSuggestTopics, generateScript } from '../services/openai.js';
import { enqueueJob, getLatestJob } from '../workers/jobQueue.js';
import { JOB_TYPES } from '../models/Job.js';

const router = Router();

router.use(authRequired);

function serializeProject(project) {
  return {
    id: project._id,
    keyword: project.keyword,
    correctedKeyword: project.correctedKeyword,
    candidates: project.candidates,
    selectedTopic: project.selectedTopic,
    script: project.script,
    status: project.status,
    videoUrl: project.videoUrl,
    remakeCount: project.remakeCount,
    youtubeVideoId: project.youtubeVideoId,
    youtubeUrl: project.youtubeUrl,
    uploadPrivacy: project.uploadPrivacy,
    lastError: project.lastError,
    mediaMeta: project.mediaMeta
      ? {
          durationSec: project.mediaMeta.durationSec,
          pexelsIds: project.mediaMeta.pexelsIds,
        }
      : null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const projects = await Project.find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json(projects.map(serializeProject));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const keyword = (req.body?.keyword || '').trim();
    if (!keyword) {
      return res.status(400).json({ error: '주제를 입력해주세요.' });
    }

    const project = await Project.create({
      userId: req.userId,
      keyword,
      status: PROJECT_STATUS.DRAFT,
    });

    res.status(201).json(serializeProject(project));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const job = await getLatestJob(project._id);
    res.json({
      ...serializeProject(project),
      job: job
        ? {
            id: job._id,
            type: job.type,
            status: job.status,
            progress: job.progress,
            message: job.message,
            error: job.error,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/topics', async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    project.status = PROJECT_STATUS.TOPIC_SEARCH;
    await project.save();

    const result = await correctAndSuggestTopics(project.keyword);
    project.correctedKeyword = result.correctedKeyword;
    project.candidates = result.candidates;
    project.status = PROJECT_STATUS.TOPIC_SEARCH;
    await project.save();

    res.json(serializeProject(project));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/topic', async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const { title, description, index } = req.body || {};
    let selected = null;

    if (typeof index === 'number' && project.candidates[index]) {
      selected = project.candidates[index];
    } else if (title) {
      selected = { title, description: description || '' };
    }

    if (!selected?.title) {
      return res.status(400).json({ error: '주제를 선택해주세요.' });
    }

    project.selectedTopic = selected;
    project.status = PROJECT_STATUS.TOPIC_SELECTED;
    await project.save();

    res.json(serializeProject(project));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/script', async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    if (!project.selectedTopic?.title) {
      return res.status(400).json({ error: '먼저 주제를 선택해주세요.' });
    }

    const result = await generateScript(project.selectedTopic);
    project.script = {
      draft: result.script,
      final: result.script,
      approved: false,
    };
    project.status = PROJECT_STATUS.SCRIPT_PENDING;
    await project.save();

    res.json({
      ...serializeProject(project),
      estimatedSeconds: result.estimatedSeconds,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/script', async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const { script, approve } = req.body || {};
    if (typeof script === 'string') {
      project.script.final = script.trim();
      if (!project.script.draft) project.script.draft = script.trim();
    }

    if (approve) {
      if (!project.script.final) {
        return res.status(400).json({ error: '스크립트가 비어 있습니다.' });
      }
      project.script.approved = true;
      project.status = PROJECT_STATUS.SCRIPT_APPROVED;
    }

    await project.save();
    res.json(serializeProject(project));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/render', async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    if (!project.script?.approved && !project.script?.final) {
      return res.status(400).json({ error: '스크립트를 먼저 승인해주세요.' });
    }

    project.script.approved = true;
    project.status = PROJECT_STATUS.RENDERING;
    await project.save();

    const job = await enqueueJob({
      projectId: project._id,
      userId: req.userId,
      type: JOB_TYPES.RENDER,
    });

    res.status(202).json({
      project: serializeProject(project),
      job: {
        id: job._id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        message: job.message,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/remake', async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    project.remakeCount = (project.remakeCount || 0) + 1;
    project.videoPath = undefined;
    project.videoUrl = undefined;
    project.youtubeVideoId = undefined;
    project.youtubeUrl = undefined;
    project.status = PROJECT_STATUS.RENDERING;
    await project.save();

    const job = await enqueueJob({
      projectId: project._id,
      userId: req.userId,
      type: JOB_TYPES.RENDER,
    });

    res.status(202).json({
      project: serializeProject(project),
      job: {
        id: job._id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        message: job.message,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/upload', async (req, res, next) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    if (!project.videoPath) {
      return res.status(400).json({ error: '업로드할 영상이 없습니다.' });
    }

    if (req.body?.privacyStatus) {
      project.uploadPrivacy = req.body.privacyStatus;
      await project.save();
    }

    const job = await enqueueJob({
      projectId: project._id,
      userId: req.userId,
      type: JOB_TYPES.UPLOAD,
    });

    res.status(202).json({
      project: serializeProject(project),
      job: {
        id: job._id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        message: job.message,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
