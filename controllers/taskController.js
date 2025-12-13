const Task = require("../models/Task"); // Import the Task model
const Agent = require("../models/Agent"); // Import the Agent model (needed for agent existence check)
const mongoose = require("mongoose"); // For ObjectId validation

/**
 * Retrieves all tasks from the database.
 * Populates the 'agent' field to include the agent's name and email.
 */
const getTasks = async (req, res) => {
  try {
    // Support category filter
    const { category } = req.query;
    const query = category ? { category } : {};
    
    const tasks = await Task.find(query).populate("agent", "name email"); // Fetch tasks with agent details
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

    // Support category filter
    const { category } = req.query;
    const query = { agent: agentId };
    if (category) {
      query.category = category;
    }
    
    // Fetch tasks assigned to the given agent and populate agent details
    const tasks = await Task.find(query).populate("agent", "name email");

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

/**
 * Bulk delete tasks - Production ready with authorization and validation
 * Agents can only delete their own tasks
 */
const bulkDeleteTasks = async (req, res) => {
  try {
    const { taskIds } = req.body;

    // Input validation
    if (!taskIds || !Array.isArray(taskIds)) {
      return res.status(400).json({ 
        message: "taskIds must be an array" 
      });
    }

    if (taskIds.length === 0) {
      return res.status(400).json({ 
        message: "At least one task ID is required" 
      });
    }

    // Limit batch size for performance and security
    const MAX_BATCH_SIZE = 100;
    if (taskIds.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ 
        message: `Maximum ${MAX_BATCH_SIZE} tasks can be deleted at once` 
      });
    }

    // Validate all taskIds are valid ObjectIds
    const invalidIds = taskIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        message: "Invalid task ID format", 
        invalidIds 
      });
    }

    // Get agent ID from user (assuming email-based identification)
    const userEmail = req.user?.email;
    if (!userEmail || !userEmail.toLowerCase().endsWith("@agent.com")) {
      return res.status(403).json({ 
        message: "Only agents can perform bulk operations" 
      });
    }

    // Find agent by email
    const agent = await Agent.findOne({ 
      email: userEmail.toLowerCase().trim() 
    });

    if (!agent) {
      return res.status(404).json({ 
        message: "Agent not found" 
      });
    }

    // Find all tasks that belong to this agent
    const tasks = await Task.find({ 
      _id: { $in: taskIds },
      agent: agent._id 
    });

    if (tasks.length === 0) {
      return res.status(404).json({ 
        message: "No tasks found or you don't have permission to delete these tasks" 
      });
    }

    // Check if all requested tasks were found (authorization check)
    const foundTaskIds = tasks.map(t => t._id.toString());
    const notFoundIds = taskIds.filter(id => !foundTaskIds.includes(id));
    
    if (notFoundIds.length > 0) {
      return res.status(403).json({ 
        message: "Some tasks were not found or you don't have permission to delete them",
        notFoundIds,
        foundCount: foundTaskIds.length,
        requestedCount: taskIds.length
      });
    }

    // Delete all tasks
    const deleteResult = await Task.deleteMany({ 
      _id: { $in: taskIds },
      agent: agent._id 
    });

    res.status(200).json({
      message: `Successfully deleted ${deleteResult.deletedCount} task(s)`,
      deletedCount: deleteResult.deletedCount,
      deletedTaskIds: taskIds
    });
  } catch (error) {
    console.error("Bulk Delete Tasks Error:", error);
    
    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }

    res.status(500).json({ 
      message: "Server error during bulk delete operation" 
    });
  }
};

/**
 * Bulk update task status - Production ready with authorization and validation
 * Agents can only update their own tasks
 */
const bulkUpdateTaskStatus = async (req, res) => {
  try {
    const { taskIds, status } = req.body;

    // Input validation
    if (!taskIds || !Array.isArray(taskIds)) {
      return res.status(400).json({ 
        message: "taskIds must be an array" 
      });
    }

    if (taskIds.length === 0) {
      return res.status(400).json({ 
        message: "At least one task ID is required" 
      });
    }

    if (!status) {
      return res.status(400).json({ 
        message: "Status is required" 
      });
    }

    const validStatuses = ["pending", "in-progress", "completed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
      });
    }

    // Limit batch size for performance and security
    const MAX_BATCH_SIZE = 100;
    if (taskIds.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ 
        message: `Maximum ${MAX_BATCH_SIZE} tasks can be updated at once` 
      });
    }

    // Validate all taskIds are valid ObjectIds
    const invalidIds = taskIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        message: "Invalid task ID format", 
        invalidIds 
      });
    }

    // Get agent ID from user (assuming email-based identification)
    const userEmail = req.user?.email;
    if (!userEmail || !userEmail.toLowerCase().endsWith("@agent.com")) {
      return res.status(403).json({ 
        message: "Only agents can perform bulk operations" 
      });
    }

    // Find agent by email
    const agent = await Agent.findOne({ 
      email: userEmail.toLowerCase().trim() 
    });

    if (!agent) {
      return res.status(404).json({ 
        message: "Agent not found" 
      });
    }

    // Find all tasks that belong to this agent
    const tasks = await Task.find({ 
      _id: { $in: taskIds },
      agent: agent._id 
    });

    if (tasks.length === 0) {
      return res.status(404).json({ 
        message: "No tasks found or you don't have permission to update these tasks" 
      });
    }

    // Check if all requested tasks were found (authorization check)
    const foundTaskIds = tasks.map(t => t._id.toString());
    const notFoundIds = taskIds.filter(id => !foundTaskIds.includes(id));
    
    if (notFoundIds.length > 0) {
      return res.status(403).json({ 
        message: "Some tasks were not found or you don't have permission to update them",
        notFoundIds,
        foundCount: foundTaskIds.length,
        requestedCount: taskIds.length
      });
    }

    // Prepare bulk write operations
    const bulkOps = tasks.map(task => {
      const update = {
        $set: {
          status: status,
          updatedAt: new Date()
        }
      };

      // Handle completedDate based on status
      if (status === "completed") {
        // Only set completedDate if it's not already set
        if (!task.completedDate) {
          update.$set.completedDate = new Date();
        }
      } else {
        // If changing from completed to another status, clear completedDate
        if (task.status === "completed") {
          update.$set.completedDate = null;
        }
      }

      return {
        updateOne: {
          filter: { _id: task._id },
          update: update
        }
      };
    });

    // Execute bulk write
    const bulkResult = await Task.bulkWrite(bulkOps);

    // Fetch updated tasks for response
    const updatedTasks = await Task.find({ 
      _id: { $in: taskIds },
      agent: agent._id 
    }).populate("agent", "name email");

    res.status(200).json({
      message: `Successfully updated ${bulkResult.modifiedCount} task(s)`,
      updatedCount: bulkResult.modifiedCount,
      updatedTasks: updatedTasks
    });
  } catch (error) {
    console.error("Bulk Update Task Status Error:", error);
    
    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }

    res.status(500).json({ 
      message: "Server error during bulk update operation" 
    });
  }
};

module.exports = { 
  getTasks, 
  getTasksByAgent, 
  deleteTasks, 
  updateTasks,
  bulkDeleteTasks,
  bulkUpdateTaskStatus
}; // Export the functions for use in routes
