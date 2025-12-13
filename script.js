const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const agentRoutes = require("./routes/agentRoutes");
const agentStatsRoutes = require("./routes/agentStatsRoutes");
const taskRoutes = require("./routes/taskRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const categorizationRoutes = require("./routes/categorizationRoutes");
const cookieParser = require("cookie-parser");

// CORS Configuration - Production-ready with environment variables
const getAllowedOrigins = () => {
  // Get allowed origins from environment variable
  const envOrigins = process.env.ALLOWED_ORIGINS;
  
  if (envOrigins) {
    // Split by comma and trim whitespace
    return envOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
  }
  
  // Default origins for development
  return [
    "http://localhost:3000",
    "http://localhost:3001", // In case you run on different port
  ];
};

const allowedOrigins = getAllowedOrigins();

// Validate origin format (basic security check)
const isValidOrigin = (origin) => {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    // Only allow http/https protocols
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

// Check if origin matches Vercel preview pattern
const isVercelPreview = (origin) => {
  try {
    const url = new URL(origin);
    // Vercel preview URLs: *.vercel.app
    return url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

// Check if origin matches allowed list or patterns
const matchesAllowedOrigin = (origin) => {
  // Exact match
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  
  // Vercel preview URLs (allow all *.vercel.app)
  if (isVercelPreview(origin)) {
    return true;
  }
  
  // Check for wildcard patterns in allowedOrigins (e.g., "*.example.com")
  for (const allowed of allowedOrigins) {
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\./g, '\\.').replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(origin)) {
        return true;
      }
    }
  }
  
  return false;
};

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// Production-ready CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    // But only in development mode - be more strict in production
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        // In production, you might want to block requests without origin
        // Uncomment the line below if you want strict origin checking
        // return callback(new Error("No origin header"), false);
        return callback(null, true); // Allow for now, adjust based on your needs
      }
      return callback(null, true);
    }
    
    // Validate origin format
    if (!isValidOrigin(origin)) {
      return callback(new Error("Invalid origin format"), false);
    }
    
    // Check if origin matches allowed list or patterns (including Vercel preview URLs)
    if (matchesAllowedOrigin(origin)) {
      return callback(null, true);
    }
    
    // Log blocked origins in development for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[CORS] Blocked origin: ${origin}`);
      console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
    }
    
    // In production, don't expose allowed origins in error message
    callback(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours - cache preflight requests
}));

// CORS Error Handler Middleware
app.use((err, req, res, next) => {
  if (err.message === "Not allowed by CORS" || err.message === "Invalid origin format") {
    return res.status(403).json({
      success: false,
      message: "CORS policy violation: Origin not allowed",
      // Only expose details in development
      ...(process.env.NODE_ENV !== 'production' && { 
        origin: req.headers.origin,
        allowedOrigins: allowedOrigins 
      })
    });
  }
  next(err);
});
// Connect to MongoDB
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/", agentRoutes);
app.use("/api/agent", agentStatsRoutes); // Agent-specific stats routes
app.use("/api/tasks", taskRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/categorization", categorizationRoutes); // AI categorization routes

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));






