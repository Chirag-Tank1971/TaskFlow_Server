const express = require("express");
const { uploadCSV } = require("../controllers/uploadController"); // Import CSV upload controller
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

module.exports = router; // Export the router for use in the main app
