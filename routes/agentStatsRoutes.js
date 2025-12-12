const express = require("express");
const {
  getAgentStats,
  getAgentPerformance,
  getAgentActivity,
} = require("../controllers/agentStatsController");
const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

// All routes require authentication
router.get("/stats/:agentId", authenticate, getAgentStats);
router.get("/performance/:agentId", authenticate, getAgentPerformance);
router.get("/activity/:agentId", authenticate, getAgentActivity);

module.exports = router;

