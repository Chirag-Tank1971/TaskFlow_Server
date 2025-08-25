const fs = require("fs"); // Import file system module for file handling
const csv = require("csv-parser"); // Import csv-parser to read CSV files
const Task = require("../models/Task"); // Import the Task model
const Agent = require("../models/Agent"); // Import the Agent model

/**
 * Handles CSV file upload, parses the data, validates it, and assigns tasks to agents in a round-robin manner.
 */
const uploadCSV = async (req, res) => {
  try {
    // Ensure a file is provided
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // Fetch available agents from the database
    const agents = await Agent.find();
    if (agents.length === 0) return res.status(400).json({ message: "No agents available" });

    const tasks = []; // Array to store parsed tasks
    let headersValid = false; // Flag to validate CSV headers

    // Create a readable stream for the uploaded CSV file and parse it
    const stream = fs.createReadStream(req.file.path).pipe(csv());

    // Validate CSV headers
    stream.on("headers", (headers) => {
      const normalizedHeaders = headers.map((header) => header.toLowerCase());
      const requiredHeaders = ["firstname", "phone", "notes"];

      headersValid = requiredHeaders.every((header) => normalizedHeaders.includes(header));

      if (!headersValid) {
        stream.destroy(); // Stop reading the file
        fs.unlinkSync(req.file.path); // Delete the file to clean up
        return res.status(400).json({ message: "Invalid CSV format. Required headers: FirstName, Phone, Notes" });
      }
    });

    // Process each row in the CSV file
    stream.on("data", (row) => {
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
      stream.on("error", reject);
    });

    // Assign tasks to agents in a round-robin manner
    const distributedTasks = tasks.map((task, index) => ({
      ...task,
      agent: agents[index % agents.length]._id, // Assign agents in a cyclic order
    }));

    // Bulk insert tasks into the database
    await Task.insertMany(distributedTasks);

    // Delete the uploaded file after processing
    fs.unlinkSync(req.file.path);

    // Send response with success message and created tasks
    res.json({ message: "File uploaded and tasks distributed successfully", tasks: distributedTasks });
  } catch (err) {
    console.error("CSV Upload Error:", err);
    
    // Cleanup file if an error occurs
    if (req.file) fs.unlinkSync(req.file.path);

    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { uploadCSV }; // Export function for route handling
