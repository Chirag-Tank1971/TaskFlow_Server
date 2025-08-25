const express = require("express");
const { addAgent, getAgents, deleteAgent, updateAgent } = require("../controllers/agentController");
const authenticate = require("../middleware/authMiddleware"); // Import authentication middleware

const router = express.Router(); // Create an Express router instance

/**
 * @route   POST /api/agents
 * @desc    Add a new agent
 * @access  Private (Requires authentication)
 */
router.post("/agents", authenticate, addAgent);
router.post("/agents/update", authenticate, updateAgent);


/**
 * @route   GET /api/agents
 * @desc    Retrieve all agents
 * @access  Private (Requires authentication)
 */
router.get("/agents", authenticate, getAgents);

/**
 * @route   DELETE /api/agents/:id
 * @desc    Delete an agent by ID
 * @access  Private (Requires authentication)
 */
router.delete("/agents/:id", authenticate, deleteAgent);

module.exports = router; // Export the router for use in the main app
