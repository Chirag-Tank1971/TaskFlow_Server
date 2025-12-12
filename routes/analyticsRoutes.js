const express = require("express");
const {
  getOverallStats,
  getTasksByAgent,
  getTaskTrends,
  getAgentPerformance,
  getRecentActivity
} = require("../controllers/analyticsController");
const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @route   GET /api/analytics/stats
 * @desc    Get overall statistics
 * @access  Private (requires authentication)
 */
router.get("/stats", authenticate, getOverallStats);

/**
 * @route   GET /api/analytics/distribution
 * @desc    Get task distribution by agent
 * @access  Private (requires authentication)
 */
router.get("/distribution", authenticate, getTasksByAgent);

/**
 * @route   GET /api/analytics/trends
 * @desc    Get task trends over last 30 days
 * @access  Private (requires authentication)
 */
router.get("/trends", authenticate, getTaskTrends);

/**
 * @route   GET /api/analytics/performance
 * @desc    Get agent performance metrics
 * @access  Private (requires authentication)
 */
router.get("/performance", authenticate, getAgentPerformance);

/**
 * @route   GET /api/analytics/recent
 * @desc    Get recent activity (last 10 tasks)
 * @access  Private (requires authentication)
 */
router.get("/recent", authenticate, getRecentActivity);

module.exports = router;

