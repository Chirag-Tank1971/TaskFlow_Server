const express = require("express");
const { login , signup, logout} = require("../controllers/authController"); // Import the login controller

const router = express.Router(); // Create an Express router instance

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return a JWT token
 * @access  Public
 */
router.post("/login", login);
router.post("/signup" , signup);
router.get("/logout" , logout)

module.exports = router; // Export the router for use in the main app
