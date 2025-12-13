const Task = require("../models/Task");
const { 
  categorizeTask, 
  categorizeTasksBatch, 
  getHealthStats,
  getCacheStats,
  discoverWorkingModel,
  CATEGORIES 
} = require("../services/categorizationService");

/**
 * Manually categorize a single task
 */
const categorizeSingleTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { category, notes } = req.body;

    if (!taskId) {
      return res.status(400).json({ message: "Task ID is required" });
    }

    // Find the task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    let result;

    // If category is provided manually, use it
    if (category) {
      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({ 
          message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` 
        });
      }
      
      task.category = category;
      task.categorySource = "manual";
      task.categorizedAt = new Date();
      task.categoryConfidence = null;
      result = { category, source: "manual" };
    } 
    // If notes are provided, use AI to categorize
    else if (notes || task.notes) {
      const notesToCategorize = notes || task.notes;
      const categorizationResult = await categorizeTask(notesToCategorize);
      
      task.category = categorizationResult.category;
      task.categorySource = categorizationResult.source;
      task.categorizedAt = categorizationResult.source === "ai" ? new Date() : null;
      task.categoryConfidence = categorizationResult.confidence;
      result = categorizationResult;
    } 
    else {
      return res.status(400).json({ 
        message: "Either category or notes must be provided" 
      });
    }

    await task.save();
    await task.populate("agent", "name email");

    res.json({
      message: "Task categorized successfully",
      task,
      categorization: result
    });
  } catch (error) {
    console.error("Categorization Error:", error);
    res.status(500).json({ 
      message: "Server error during categorization",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Categorize multiple tasks in bulk
 */
const categorizeBulkTasks = async (req, res) => {
  try {
    const { taskIds, category } = req.body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ 
        message: "taskIds array is required" 
      });
    }

    // If category is provided, apply it to all tasks
    if (category) {
      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({ 
          message: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` 
        });
      }

      const result = await Task.updateMany(
        { _id: { $in: taskIds } },
        {
          $set: {
            category,
            categorySource: "manual",
            categorizedAt: new Date(),
            categoryConfidence: null
          }
        }
      );

      return res.json({
        message: `Successfully categorized ${result.modifiedCount} tasks`,
        modifiedCount: result.modifiedCount
      });
    }

    // Otherwise, use AI to categorize each task
    const tasks = await Task.find({ _id: { $in: taskIds } });
    if (tasks.length === 0) {
      return res.status(404).json({ message: "No tasks found" });
    }

    // Prepare tasks for batch categorization
    const tasksToCategorize = tasks.map(task => ({
      id: task._id,
      notes: task.notes || ""
    }));

    // Categorize in batch
    const categorizationResults = await categorizeTasksBatch(
      tasksToCategorize.map(t => ({ notes: t.notes }))
    );

    // Update tasks with categorization results
    const updatePromises = tasks.map(async (task, index) => {
      const result = categorizationResults[index];
      if (result) {
        task.category = result.category;
        task.categorySource = result.source;
        task.categorizedAt = result.source === "ai" ? new Date() : null;
        task.categoryConfidence = result.confidence;
        await task.save();
      }
    });

    await Promise.all(updatePromises);

    res.json({
      message: `Successfully categorized ${tasks.length} tasks`,
      categorized: tasks.length,
      results: categorizationResults
    });
  } catch (error) {
    console.error("Bulk Categorization Error:", error);
    res.status(500).json({ 
      message: "Server error during bulk categorization",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Get category statistics
 */
const getCategoryStats = async (req, res) => {
  try {
    const { agentId } = req.query;

    const matchStage = agentId ? { agent: agentId } : {};

    const stats = await Task.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          count: 1,
          completed: 1,
          pending: 1,
          inProgress: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      stats,
      categories: CATEGORIES
    });
  } catch (error) {
    console.error("Category Stats Error:", error);
    res.status(500).json({ 
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Get available categories
 */
const getCategories = async (req, res) => {
  res.json({
    categories: CATEGORIES
  });
};

/**
 * Get AI categorization service health status
 */
const getHealthStatus = async (req, res) => {
  try {
    const healthStats = getHealthStats();
    const cacheStats = getCacheStats();
    
    res.json({
      service: "AI Categorization",
      status: healthStats.isHealthy ? "healthy" : "degraded",
      health: healthStats,
      cache: cacheStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Health Check Error:", error);
    res.status(500).json({ 
      message: "Error retrieving health status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Force model re-discovery (admin only)
 */
const rediscoverModel = async (req, res) => {
  try {
    const model = await discoverWorkingModel(true);
    
    res.json({
      message: model ? "Model re-discovery successful" : "No working model found",
      workingModel: model || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Model Re-discovery Error:", error);
    res.status(500).json({ 
      message: "Error during model re-discovery",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  categorizeSingleTask,
  categorizeBulkTasks,
  getCategoryStats,
  getCategories,
  getHealthStatus,
  rediscoverModel
};

