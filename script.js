const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const agentRoutes = require("./routes/agentRoutes");
const taskRoutes = require("./routes/taskRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const cookieParser = require("cookie-parser");

const allowedOrigins = [
  "http://localhost:3000", 
  "https://task-flow-client.vercel.app" 
];

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ 
    origin: "http://localhost:3000",
    credentials: true 
}));
app.use(cookieParser());

// Connect to MongoDB
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/", agentRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/upload", uploadRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

