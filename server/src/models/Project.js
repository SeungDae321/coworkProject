import mongoose from 'mongoose';

export const PROJECT_STATUS = {
  DRAFT: 'draft',
  TOPIC_SEARCH: 'topic_search',
  TOPIC_SELECTED: 'topic_selected',
  SCRIPT_PENDING: 'script_pending',
  SCRIPT_APPROVED: 'script_approved',
  RENDERING: 'rendering',
  VIDEO_READY: 'video_ready',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  FAILED: 'failed',
};

const candidateSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    keyword: { type: String, required: true },
    correctedKeyword: String,
    candidates: [candidateSchema],
    selectedTopic: {
      title: String,
      description: String,
    },
    script: {
      draft: String,
      final: String,
      approved: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: Object.values(PROJECT_STATUS),
      default: PROJECT_STATUS.DRAFT,
    },
    videoPath: String,
    videoUrl: String,
    thumbnailPath: String,
    remakeCount: { type: Number, default: 0 },
    youtubeVideoId: String,
    youtubeUrl: String,
    uploadPrivacy: {
      type: String,
      enum: ['private', 'unlisted', 'public'],
      default: 'private',
    },
    lastError: String,
    mediaMeta: {
      pexelsIds: [String],
      audioPath: String,
      durationSec: Number,
      scenes: [
        {
          query: String,
          caption: String,
          pexelsId: String,
        },
      ],
    },
  },
  { timestamps: true }
);

export const Project = mongoose.model('Project', projectSchema);
