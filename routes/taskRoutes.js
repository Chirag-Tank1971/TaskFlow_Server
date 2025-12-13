const express = require("express");
const { 
  getTasks, 
  getTasksByAgent, 
  deleteTasks, 
  updateTasks,
  bulkDeleteTasks,
  bulkUpdateTaskStatus
} = require("../controllers/taskController"); // Import task controllers
const authenticate = require("../middleware/authMiddleware"); // Import authentication middleware

const router = express.Router(); // Create an Express router instance

/**
 * @route   GET /api/tasks
 * @desc    Fetch all tasks with agent details
 * @access  Private (requires authentication)
 */
router.get("/", authenticate, getTasks);

/**
 * @route   DELETE /api/tasks/bulk
 * @desc    Delete multiple tasks (bulk operation)
 * @access  Private (requires authentication, agents only)
 */
router.delete("/bulk", authenticate, bulkDeleteTasks);

/**
 * @route   POST /api/tasks/bulk/status
 * @desc    Update status for multiple tasks (bulk operation)
 * @access  Private (requires authentication, agents only)
 */
router.post("/bulk/status", authenticate, bulkUpdateTaskStatus);

/**
 * @route   GET /api/tasks/:agentId
 * @desc    Fetch tasks assigned to a specific agent
 * @access  Private (requires authentication)
 */
router.get("/:agentId", authenticate, getTasksByAgent);

/**
 * @route   DELETE /api/tasks/:taskId
 * @desc    Delete a single task
 * @access  Private (requires authentication)
 */
router.delete("/:taskId", authenticate, deleteTasks);

/**
 * @route   POST /api/tasks/:taskId
 * @desc    Update a single task status
 * @access  Private (requires authentication)
 */
router.post("/:taskId", authenticate, updateTasks);

module.exports = router; // Export the router for use in the main app
