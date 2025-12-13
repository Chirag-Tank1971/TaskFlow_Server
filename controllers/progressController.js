/**
 * Progress Controller - Progress tracking endpoints
 * Production-ready with authentication and error handling
 */

const { getProgress } = require("../services/progressTracker");

/**
 * Get upload progress (JSON endpoint for polling)
 * @route GET /api/upload/progress/:jobId
 * @access Private (authenticated via middleware)
 */
const getUploadProgress = async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const progress = getProgress(jobId);
    
    if (!progress) {
      return res.status(404).json({ 
        message: "Job not found or expired",
        status: "not_found"
      });
    }

    // Return progress as JSON
    res.json(progress);
  } catch (error) {
    console.error("Progress Controller Error:", error);
    res.status(500).json({ 
      message: "Error retrieving progress",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = { getUploadProgress };

