const jwt = require("jsonwebtoken"); // Import the jsonwebtoken package

/**
 * Middleware to authenticate users using JWT.
 * This function checks if the request contains a valid token in the Authorization header.
 */
const authenticate = (req, res, next) => {
  // Retrieve the Authorization header
  const authHeader = req.header("Authorization");

  // Check if the token exists and follows the expected "Bearer <token>" format
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access Denied: Invalid Token Format" });
  }

  // Extract the token by removing the "Bearer " prefix
  const token = authHeader.split(" ")[1];

  try {
    // Verify the token using the secret key
    const verified = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the decoded user data to the request object for further use in protected routes
    req.user = verified;

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    // Handle invalid or expired token errors
    res.status(401).json({ message: "Invalid or Expired Token" });
  }
};

module.exports = authenticate; // Export the middleware for use in routes
