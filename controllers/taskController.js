const Task = require("../models/Task"); // Import the Task model
const Agent = require("../models/Agent"); // Import the Agent model (needed for agent existence check)

/**
 * Retrieves all tasks from the database.
 * Populates the 'agent' field to include the agent's name and email.
 */
const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find().populate("agent", "name email"); // Fetch tasks with agent details
    res.json(tasks); // Send the retrieved tasks as a JSON response
  } catch (err) {
    console.error("Fetch Tasks Error:", err);
    res.status(500).json({ message: "Server error" }); // Handle server errors
  }
};

/**
 * Retrieves tasks assigned to a specific agent.
 * Validates whether the agent exists before querying for tasks.
 */
const getTasksByAgent = async (req, res) => {
  try {
    const { agentId } = req.params; // Extract agent ID from request parameters
    
    // Check if the agent exists in the database
    const agentExists = await Agent.findById(agentId);
    if (!agentExists) {
      // Return empty array instead of 404 - allows frontend to handle gracefully
      return res.json([]);
    }

    // Fetch tasks assigned to the given agent and populate agent details
    const tasks = await Task.find({ agent: agentId }).populate("agent", "name email");

    // Return tasks (empty array if none found) - this is normal, not an error
    res.json(tasks || []);
  } catch (err) {
    console.error("Fetch Tasks Error:", err);
    
    // Handle invalid ObjectId format
    if (err.name === "CastError") {
      return res.json([]); // Return empty array for invalid IDs
    }
    
    res.status(500).json({ message: "Server error" });
  }
};

const deleteTasks = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      return res.status(400).json({ message: "Task ID is required" });
    }
    
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    await task.deleteOne(); // Using deleteOne() for consistency
    
    res.json({ message: "Task deleted successfully", task });
  } catch (error) {
    console.error("Delete Tasks Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update task status - Production ready with save() method
 * Automatically updates updatedAt timestamp and handles completedDate
 */
const updateTasks = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;
    
    // Input validation
    if (!taskId) {
      return res.status(400).json({ message: "Task ID is required" });
    }
    
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    
    const validStatuses = ["pending", "in-progress", "completed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
      });
    }
    
    // Find the task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    // Store previous status for logic
    const previousStatus = task.status;
    
    // Update status
    task.status = status;
    
    // Handle completedDate based on status change
    if (status === "completed") {
      // Only set completedDate if it's not already set (prevents overwriting)
      if (!task.completedDate) {
        task.completedDate = new Date();
      }
    } else {
      // If changing from completed to another status, clear completedDate
      if (previousStatus === "completed") {
        task.completedDate = null;
      }
    }
    
    // Save the task - this automatically updates updatedAt ✅
    await task.save();
    
    // Populate agent info before sending response
    await task.populate("agent", "name email");
    
    res.status(200).json({
      message: "Task updated successfully",
      task
    });
  } catch (error) {
    console.error("Update Tasks Error:", error);
    
    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getTasks, getTasksByAgent, deleteTasks, updateTasks }; // Export the functions for use in routes
