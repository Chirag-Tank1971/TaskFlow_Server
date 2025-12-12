const fs = require("fs"); // Import file system module for file handling
const csv = require("csv-parser"); // Import csv-parser to read CSV files
const Task = require("../models/Task"); // Import the Task model
const Agent = require("../models/Agent"); // Import the Agent model
const Upload = require("../models/Upload"); // Import the Upload model
const User = require("../models/User"); // Import the User model

/**
 * Handles CSV file upload, parses the data, validates it, and assigns tasks to agents in a round-robin manner.
 * Tracks upload details in the Upload model for analytics and history.
 */
const uploadCSV = async (req, res) => {
  const startTime = Date.now(); // Track processing start time
  let uploadRecord = null; // Store upload record for updates

  try {
    // Ensure a file is provided
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Get user from request (set by auth middleware)
    if (!req.user || !req.user.email) {
      // Cleanup file if authentication fails
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(401).json({ message: "Authentication required" });
    }

    // Normalize email for consistent lookup (production-ready)
    const normalizedEmail = req.user.email.toLowerCase().trim();

    // Find user by email to get user ID
    // Try exact match first (faster), then case-insensitive if needed
    // Only admin users (not agents) can upload CSV files
    let user = await User.findOne({ email: normalizedEmail });
    
    // If not found with exact match, try case-insensitive search (for legacy data)
    if (!user) {
      // Escape special regex characters for security
      const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      user = await User.findOne({ 
        email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') }
      });
    }

    if (!user) {
      // Cleanup file if user not found
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ 
        message: "User not found. Please ensure you are logged in as an admin user." 
      });
    }

    // Additional check: Verify this is not an agent trying to upload
    // Agents have emails ending with @agent.com
    if (normalizedEmail.endsWith("@agent.com")) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ 
        message: "Access denied. Only admin users can upload CSV files." 
      });
    }

    // Fetch available agents from the database
    const agents = await Agent.find();
    if (agents.length === 0) {
      // Cleanup file if no agents
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "No agents available" });
    }

    // Create upload record with initial status
    uploadRecord = new Upload({
      filename: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: user._id,
      status: "processing",
      rowCount: 0,
      tasksCreated: 0,
    });
    await uploadRecord.save();

    const tasks = []; // Array to store parsed tasks
    let headersValid = false; // Flag to validate CSV headers
    let validationError = null; // Store validation error

    // Create a readable stream for the uploaded CSV file and parse it
    const stream = fs.createReadStream(req.file.path).pipe(csv());

    // Validate CSV headers
    stream.on("headers", (headers) => {
      const normalizedHeaders = headers.map((header) => header.toLowerCase());
      const requiredHeaders = ["firstname", "phone", "notes"];

      headersValid = requiredHeaders.every((header) => normalizedHeaders.includes(header));

      if (!headersValid) {
        validationError = "Invalid CSV format. Required headers: FirstName, Phone, Notes";
        stream.destroy(); // Stop reading the file
      }
    });

    // Process each row in the CSV file
    stream.on("data", (row) => {
      if (validationError) return; // Skip processing if validation failed

      const normalizedRow = {};

      // Normalize keys to lowercase to ensure case insensitivity
      for (const key in row) {
        normalizedRow[key.toLowerCase()] = row[key];
      }

      // Push the task to the array
      tasks.push({
        firstName: normalizedRow["firstname"],
        phone: normalizedRow["phone"],
        notes: normalizedRow["notes"],
      });
    });

    // Wait for the stream to finish processing all rows
    await new Promise((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", (err) => {
        validationError = err.message || "Error reading CSV file";
        reject(err);
      });
    });

    // Handle validation errors
    if (validationError || !headersValid) {
      const processingTime = Date.now() - startTime;
      
      // Update upload record with failure
      if (uploadRecord) {
        uploadRecord.status = "failed";
        uploadRecord.errorMessage = validationError || "Invalid CSV format";
        uploadRecord.processingTime = processingTime;
        await uploadRecord.save();
      }

      // Cleanup file
      if (req.file) fs.unlinkSync(req.file.path);

      return res.status(400).json({
        message: validationError || "Invalid CSV format. Required headers: FirstName, Phone, Notes",
      });
    }

    // Update row count
    uploadRecord.rowCount = tasks.length;
    await uploadRecord.save();

    // Assign tasks to agents in a round-robin manner
    const distributedTasks = tasks.map((task, index) => ({
      ...task,
      agent: agents[index % agents.length]._id, // Assign agents in a cyclic order
    }));

    // Bulk insert tasks into the database
    const createdTasks = await Task.insertMany(distributedTasks);

    // Extract task IDs for upload record
    const taskIds = createdTasks.map((task) => task._id);

    // Calculate processing time
    const processingTime = Date.now() - startTime;

    // Update upload record with success
    uploadRecord.status = "success";
    uploadRecord.tasksCreated = createdTasks.length;
    uploadRecord.processingTime = processingTime;
    uploadRecord.tasks = taskIds; // Store task IDs
    await uploadRecord.save();

    // Delete the uploaded file after processing
    fs.unlinkSync(req.file.path);

    // Send response with success message and upload details
    res.json({
      message: "File uploaded and tasks distributed successfully",
      upload: {
        id: uploadRecord._id,
        filename: uploadRecord.filename,
        tasksCreated: uploadRecord.tasksCreated,
        rowCount: uploadRecord.rowCount,
        processingTime: uploadRecord.processingTime,
        status: uploadRecord.status,
      },
      tasks: distributedTasks,
    });
  } catch (err) {
    console.error("CSV Upload Error:", err);

    // Update upload record with error if it exists
    if (uploadRecord) {
      try {
        const processingTime = Date.now() - startTime;
        uploadRecord.status = "failed";
        uploadRecord.errorMessage = err.message || "Server error during processing";
        uploadRecord.processingTime = processingTime;
        await uploadRecord.save();
      } catch (updateErr) {
        console.error("Error updating upload record:", updateErr);
      }
    }

    // Cleanup file if an error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error("Error deleting file:", unlinkErr);
      }
    }

    res.status(500).json({
      message: err.message || "Server error",
    });
  }
};

module.exports = { uploadCSV }; // Export function for route handling
