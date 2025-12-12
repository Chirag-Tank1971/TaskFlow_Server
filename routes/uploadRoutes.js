const express = require("express");
const { uploadCSV } = require("../controllers/uploadController"); // Import CSV upload controller
const {
  getUploadStats,
  getUploadHistory,
  getUploadDetails,
} = require("../controllers/uploadStatsController"); // Import upload stats controller
const authenticate = require("../middleware/authMiddleware"); // Import authentication middleware
const upload = require("../utils/multerConfig"); // Import multer configuration for file uploads

const router = express.Router(); // Create an Express router instance

/**
 * @route   POST /api/upload
 * @desc    Upload a CSV file and distribute tasks among agents
 * @access  Private (requires authentication)
 * @param   file - CSV file containing task data
 */
router.post("/", authenticate, upload.single("file"), uploadCSV);

/**
 * @route   GET /api/upload/stats
 * @desc    Get overall upload statistics
 * @access  Private (requires authentication)
 */
router.get("/stats", authenticate, getUploadStats);

/**
 * @route   GET /api/upload/history
 * @desc    Get upload history (recent uploads)
 * @access  Private (requires authentication)
 */
router.get("/history", authenticate, getUploadHistory);

/**
 * @route   GET /api/upload/:id
 * @desc    Get specific upload details by ID
 * @access  Private (requires authentication)
 */
router.get("/:id", authenticate, getUploadDetails);

module.exports = router; // Export the router for use in the main app
