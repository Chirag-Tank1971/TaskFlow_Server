const express = require("express");
const {
  categorizeSingleTask,
  categorizeBulkTasks,
  getCategoryStats,
  getCategories,
  getHealthStatus,
  rediscoverModel
} = require("../controllers/categorizationController");
const authenticate = require("../middleware/authMiddleware");
const authorize = require("../middleware/authorize");

const router = express.Router();

// All routes require authentication
router.post("/task/:taskId", authenticate, categorizeSingleTask);
router.post("/bulk", authenticate, categorizeBulkTasks);
router.get("/stats", authenticate, getCategoryStats);
router.get("/categories", authenticate, getCategories);
router.get("/health", authenticate, getHealthStatus);
router.post("/rediscover", authenticate, authorize(["admin"]), rediscoverModel);

module.exports = router;

