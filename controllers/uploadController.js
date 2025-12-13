const fs = require("fs"); // Import file system module for file handling
const csv = require("csv-parser"); // Import csv-parser to read CSV files
const Task = require("../models/Task"); // Import the Task model
const Agent = require("../models/Agent"); // Import the Agent model
const Upload = require("../models/Upload"); // Import the Upload model
const User = require("../models/User"); // Import the User model
const { categorizeTasksBatch } = require("../services/categorizationService"); // Import categorization service
const {
  generateJobId,
  initializeProgress,
  updateProgress,
  completeProgress,
  failProgress
} = require("../services/progressTracker"); // Import progress tracker

/**
 * Background processing function for CSV upload
 * Processes file, categorizes tasks, and saves to database
 */
const processUpload = async (jobId, filePath, filename, fileSize, mimeType, userId, agents) => {
  const startTime = Date.now();
  let uploadRecord = null;

  try {
    // Update progress: parsing CSV
    updateProgress(jobId, {
      status: 'parsing',
      currentStep: 'Parsing CSV file...',
      progress: 5
    });

    const tasks = [];
    let headersValid = false;
    let validationError = null;

    // Create a readable stream for the uploaded CSV file and parse it
    const stream = fs.createReadStream(filePath).pipe(csv());

    // Validate CSV headers
    stream.on("headers", (headers) => {
      const normalizedHeaders = headers.map((header) => header.toLowerCase());
      const requiredHeaders = ["firstname", "phone", "notes"];

      headersValid = requiredHeaders.every((header) => normalizedHeaders.includes(header));

      if (!headersValid) {
        validationError = "Invalid CSV format. Required headers: FirstName, Phone, Notes";
        stream.destroy();
      }
    });

    // Process each row in the CSV file
    stream.on("data", (row) => {
      if (validationError) return;

      const normalizedRow = {};
      for (const key in row) {
        normalizedRow[key.toLowerCase()] = row[key];
      }

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
      
      // Create upload record with failure
      uploadRecord = new Upload({
        filename,
        fileSize,
        mimeType,
        uploadedBy: userId,
        status: "failed",
        errorMessage: validationError || "Invalid CSV format",
        rowCount: 0,
        tasksCreated: 0,
        processingTime,
      });
      await uploadRecord.save();

      // Cleanup file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      failProgress(jobId, validationError || "Invalid CSV format");
      return;
    }

    // Create upload record
    uploadRecord = new Upload({
      filename,
      fileSize,
      mimeType,
      uploadedBy: userId,
      status: "processing",
      rowCount: tasks.length,
      tasksCreated: 0,
    });
    await uploadRecord.save();

    // Update progress: CSV parsed, starting categorization
    updateProgress(jobId, {
      status: 'categorizing',
      currentStep: `Starting categorization for ${tasks.length} tasks...`,
      progress: 20,
      totalTasks: tasks.length,
      processedTasks: 0
    });

    // Categorize tasks using AI with progress callback
    let categorizedTasks = tasks;
    let rateLimitHit = false;
    let categorizedCount = 0;
    let defaultCount = 0;
    
    try {
      console.log(`[Upload] Starting categorization for ${tasks.length} tasks`);
      
      // Progress callback for real-time updates
      // Use closure to track counts
      let currentCategorizedCount = 0;
      let currentDefaultCount = 0;
      
      const progressCallback = (progressData) => {
        // Update local counts if provided
        if (progressData.categorizedTasks !== undefined) {
          currentCategorizedCount = progressData.categorizedTasks;
        }
        if (progressData.defaultTasks !== undefined) {
          currentDefaultCount = progressData.defaultTasks;
        }
        
        updateProgress(jobId, {
          status: progressData.step || 'categorizing',
          currentStep: progressData.currentStep || 'Categorizing tasks...',
          progress: Math.min(90, 20 + Math.round((progressData.processedTasks / tasks.length) * 70)),
          processedTasks: progressData.processedTasks || 0,
          categorizedTasks: currentCategorizedCount,
          defaultTasks: currentDefaultCount,
          rateLimitHit: progressData.rateLimitHit || false
        });
      };
      
      const categorizationResponse = await categorizeTasksBatch(tasks, progressCallback);
      
      // Extract results and metadata
      const categorizationResults = categorizationResponse.results || [];
      rateLimitHit = categorizationResponse.rateLimitHit || false;
      categorizedCount = categorizationResponse.categorizedCount || 0;
      defaultCount = categorizationResponse.defaultCount || 0;
      
      // Merge categorization results with tasks
      categorizedTasks = tasks.map((task, index) => ({
        ...task,
        category: categorizationResults[index]?.category || "General",
        categorySource: categorizationResults[index]?.source || "default",
        categorizedAt: categorizationResults[index]?.source === "ai" ? new Date() : null,
        categoryConfidence: categorizationResults[index]?.confidence || null
      }));
      
      console.log(`[Upload] Successfully categorized ${categorizedCount} tasks, ${defaultCount} set to default`);
      
      if (rateLimitHit) {
        console.warn(`[Upload] Rate limit hit during categorization. ${defaultCount} tasks set to default category.`);
      }
    } catch (error) {
      console.error(`[Upload] Categorization error (using defaults):`, error.message);
      categorizedTasks = tasks.map(task => ({
        ...task,
        category: "General",
        categorySource: "default",
        categorizedAt: null,
        categoryConfidence: null
      }));
      defaultCount = tasks.length;
    }

    // Update progress: saving tasks
    updateProgress(jobId, {
      status: 'saving',
      currentStep: 'Saving tasks to database...',
      progress: 95,
      processedTasks: tasks.length
    });

    // Assign tasks to agents in a round-robin manner
    const distributedTasks = categorizedTasks.map((task, index) => ({
      ...task,
      agent: agents[index % agents.length]._id,
    }));

    // Bulk insert tasks into the database
    const createdTasks = await Task.insertMany(distributedTasks);
    const taskIds = createdTasks.map((task) => task._id);
    const processingTime = Date.now() - startTime;

    // Update upload record with success
    uploadRecord.status = "success";
    uploadRecord.tasksCreated = createdTasks.length;
    uploadRecord.processingTime = processingTime;
    uploadRecord.tasks = taskIds;
    await uploadRecord.save();

    // Delete the uploaded file after processing
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Mark progress as completed
    completeProgress(jobId, {
      processedTasks: tasks.length,
      categorizedTasks: categorizedCount,
      defaultTasks: defaultCount,
      rateLimitHit,
      uploadId: uploadRecord._id.toString()
    });

  } catch (err) {
    console.error("CSV Upload Processing Error:", err);

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
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkErr) {
        console.error("Error deleting file:", unlinkErr);
      }
    }

    failProgress(jobId, err.message || "Server error during processing");
  }
};

/**
 * Handles CSV file upload, returns jobId immediately and processes in background
 * Tracks upload details in the Upload model for analytics and history.
 */
const uploadCSV = async (req, res) => {
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
    let user = await User.findOne({ email: normalizedEmail });
    
    // If not found with exact match, try case-insensitive search (for legacy data)
    if (!user) {
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

    // Generate job ID for progress tracking
    const jobId = generateJobId();
    
    // Initialize progress (estimate total tasks - will be updated after parsing)
    // We'll estimate based on file size (rough estimate: ~100 bytes per row)
    const estimatedTasks = Math.max(1, Math.floor(req.file.size / 100));
    initializeProgress(jobId, estimatedTasks);

    // Start background processing (non-blocking)
    processUpload(
      jobId,
      req.file.path,
      req.file.originalname,
      req.file.size,
      req.file.mimetype,
      user._id,
      agents
    ).catch(err => {
      console.error(`[Upload] Background processing error for job ${jobId}:`, err);
    });

    // Return jobId immediately for progress tracking
    res.json({
      message: "File upload started. Processing in background...",
      jobId: jobId,
      status: "processing"
    });

  } catch (err) {
    console.error("CSV Upload Error:", err);

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
