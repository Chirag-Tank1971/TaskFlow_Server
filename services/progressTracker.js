/**
 * Progress Tracking Service
 * Manages upload progress state for real-time updates via SSE
 * Production-ready with automatic cleanup and memory management
 */

// In-memory store for progress tracking
// In production with multiple servers, consider using Redis
const progressStore = new Map();

// Configuration
const PROGRESS_TTL = 10 * 60 * 1000; // 10 minutes - auto cleanup old progress
const CLEANUP_INTERVAL = 5 * 60 * 1000; // Cleanup every 5 minutes

/**
 * Generate unique job ID
 */
const generateJobId = () => {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Initialize progress for a new job
 * @param {string} jobId - Job identifier
 * @param {number} totalTasks - Total number of tasks to process
 * @returns {Object} Progress object
 */
const initializeProgress = (jobId, totalTasks) => {
  const progress = {
    jobId,
    status: 'initializing', // initializing, parsing, categorizing, saving, completed, failed
    currentStep: 'Initializing...',
    progress: 0,
    totalTasks,
    processedTasks: 0,
    categorizedTasks: 0,
    defaultTasks: 0,
    rateLimitHit: false,
    error: null,
    startTime: Date.now(),
    lastUpdate: Date.now(),
    createdAt: Date.now()
  };
  
  progressStore.set(jobId, progress);
  return progress;
};

/**
 * Update progress for a job
 * @param {string} jobId - Job identifier
 * @param {Object} updates - Progress updates
 */
const updateProgress = (jobId, updates) => {
  const progress = progressStore.get(jobId);
  if (!progress) {
    console.warn(`[ProgressTracker] Job ${jobId} not found`);
    return null;
  }
  
  // Merge updates
  Object.assign(progress, updates, {
    lastUpdate: Date.now(),
    progress: updates.processedTasks !== undefined 
      ? Math.min(100, Math.round((updates.processedTasks / progress.totalTasks) * 100))
      : progress.progress
  });
  
  return progress;
};

/**
 * Get progress for a job
 * @param {string} jobId - Job identifier
 * @returns {Object|null} Progress object or null if not found
 */
const getProgress = (jobId) => {
  return progressStore.get(jobId) || null;
};

/**
 * Mark job as completed
 * @param {string} jobId - Job identifier
 * @param {Object} finalData - Final completion data
 */
const completeProgress = (jobId, finalData = {}) => {
  const progress = progressStore.get(jobId);
  if (!progress) return null;
  
  Object.assign(progress, {
    status: 'completed',
    currentStep: 'Completed',
    progress: 100,
    ...finalData,
    lastUpdate: Date.now()
  });
  
  // Auto-cleanup after 1 minute
  setTimeout(() => {
    progressStore.delete(jobId);
  }, 60000);
  
  return progress;
};

/**
 * Mark job as failed
 * @param {string} jobId - Job identifier
 * @param {string} error - Error message
 */
const failProgress = (jobId, error) => {
  const progress = progressStore.get(jobId);
  if (!progress) return null;
  
  Object.assign(progress, {
    status: 'failed',
    currentStep: 'Failed',
    error: error || 'Unknown error',
    lastUpdate: Date.now()
  });
  
  // Auto-cleanup after 5 minutes
  setTimeout(() => {
    progressStore.delete(jobId);
  }, 5 * 60 * 1000);
  
  return progress;
};

/**
 * Cleanup old progress entries
 */
const cleanupOldProgress = () => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [jobId, progress] of progressStore.entries()) {
    // Remove if older than TTL and not active
    if (now - progress.lastUpdate > PROGRESS_TTL && 
        progress.status !== 'categorizing' && 
        progress.status !== 'saving') {
      progressStore.delete(jobId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[ProgressTracker] Cleaned up ${cleaned} old progress entries`);
  }
};

/**
 * Get all active jobs (for monitoring)
 */
const getActiveJobs = () => {
  return Array.from(progressStore.values()).filter(
    p => p.status === 'categorizing' || p.status === 'saving' || p.status === 'parsing'
  );
};

// Start cleanup interval
setInterval(cleanupOldProgress, CLEANUP_INTERVAL);

module.exports = {
  generateJobId,
  initializeProgress,
  updateProgress,
  getProgress,
  completeProgress,
  failProgress,
  getActiveJobs
};

