import mongoose from 'mongoose';

export const JOB_TYPES = {
  RENDER: 'render',
  UPLOAD: 'upload',
};

export const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
};

const jobSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(JOB_TYPES),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.QUEUED,
    },
    progress: { type: Number, default: 0 },
    message: String,
    error: String,
  },
  { timestamps: true }
);

export const Job = mongoose.model('Job', jobSchema);
