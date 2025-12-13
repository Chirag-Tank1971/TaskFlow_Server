/**
 * Authorization middleware to check user roles
 * @param {string[]} allowedRoles - Array of allowed roles (e.g., ["admin"])
 * @returns {Function} Express middleware function
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    // Ensure user is authenticated (should be set by authMiddleware)
    if (!req.user || !req.user.email) {
      return res.status(401).json({ 
        message: "Authentication required" 
      });
    }

    const userEmail = req.user.email.toLowerCase().trim();
    
    // Determine user role based on email pattern
    // Agents have emails ending with @agent.com
    // Admins have any other email format
    const isAgent = userEmail.endsWith("@agent.com");
    const userRole = isAgent ? "agent" : "admin";

    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}` 
      });
    }

    // Attach role to request for use in controllers
    req.user.role = userRole;
    
    // Proceed to next middleware or route handler
    next();
  };
};

module.exports = authorize;

