const express = require("express");
const { getTasks, getTasksByAgent, deleteTasks, updateTasks } = require("../controllers/taskController"); // Import task controllers
const authenticate = require("../middleware/authMiddleware"); // Import authentication middleware

const router = express.Router(); // Create an Express router instance

/**
 * @route   GET /api/tasks
 * @desc    Fetch all tasks with agent details
 * @access  Private (requires authentication)
 */
router.get("/", authenticate, getTasks);

/**
 * @route   GET /api/tasks/:agentId
 * @desc    Fetch tasks assigned to a specific agent
 * @access  Private (requires authentication)
 */
router.get("/:agentId", authenticate, getTasksByAgent);
router.delete("/:taskId", authenticate , deleteTasks);
router.post("/:taskId", authenticate , updateTasks);

module.exports = router; // Export the router for use in the main app
