const Task = require("../models/Task");
const Agent = require("../models/Agent");

/**
 * Get overall statistics
 * Returns total tasks, completed, pending, in-progress, and completion rate
 */
const getOverallStats = async (req, res) => {
  try {
    const totalTasks = await Task.countDocuments();
    const completedTasks = await Task.countDocuments({ status: "completed" });
    const pendingTasks = await Task.countDocuments({ status: "pending" });
    const inProgressTasks = await Task.countDocuments({ status: "in-progress" });
    
    const completionRate = totalTasks > 0 
      ? parseFloat(((completedTasks / totalTasks) * 100).toFixed(2)) 
      : 0;
    
    res.json({
      totalTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      completionRate
    });
  } catch (err) {
    console.error("Analytics Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get task distribution by agent
 * Returns tasks count by status for each agent
 */
const getTasksByAgent = async (req, res) => {
  try {
    const distribution = await Task.aggregate([
      {
        $group: {
          _id: "$agent",
          totalTasks: { $sum: 1 },
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
        $lookup: {
          from: "agents",
          localField: "_id",
          foreignField: "_id",
          as: "agentInfo"
        }
      },
      {
        $unwind: "$agentInfo"
      },
      {
        $project: {
          agentName: "$agentInfo.name",
          agentEmail: "$agentInfo.email",
          totalTasks: 1,
          completed: 1,
          pending: 1,
          inProgress: 1
        }
      },
      {
        $sort: { totalTasks: -1 }
      }
    ]);

    res.json(distribution);
  } catch (err) {
    console.error("Analytics Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get task status trends over time (last 30 days)
 * Returns daily task counts by status
 */
const getTaskTrends = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trends = await Task.aggregate([
      {
        $match: {
          $or: [
            { createdAt: { $gte: thirtyDaysAgo } },
            { date: { $gte: thirtyDaysAgo } }
          ]
        }
      },
      {
        $group: {
          _id: {
            date: { 
              $dateToString: { 
                format: "%Y-%m-%d", 
                date: { $ifNull: ["$createdAt", "$date"] }
              } 
            },
            status: "$status"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          pending: {
            $sum: { $cond: [{ $eq: ["$_id.status", "pending"] }, "$count", 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ["$_id.status", "in-progress"] }, "$count", 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$_id.status", "completed"] }, "$count", 0] }
          }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          date: "$_id",
          pending: 1,
          inProgress: 1,
          completed: 1
        }
      }
    ]);

    res.json(trends);
  } catch (err) {
    console.error("Analytics Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get agent performance metrics
 * Returns completion rates and average completion time for each agent
 */
const getAgentPerformance = async (req, res) => {
  try {
    const performance = await Task.aggregate([
      {
        $group: {
          _id: "$agent",
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          // Calculate average completion time in hours
          avgCompletionTime: {
            $avg: {
              $cond: [
                { 
                  $and: [
                    { $eq: ["$status", "completed"] },
                    { $ne: ["$completedDate", null] },
                    { $ne: ["$createdAt", null] }
                  ]
                },
                { 
                  $divide: [
                    { $subtract: ["$completedDate", "$createdAt"] },
                    1000 * 60 * 60  // Convert milliseconds to hours
                  ]
                },
                null
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: "agents",
          localField: "_id",
          foreignField: "_id",
          as: "agentInfo"
        }
      },
      {
        $unwind: "$agentInfo"
      },
      {
        $project: {
          agentName: "$agentInfo.name",
          agentEmail: "$agentInfo.email",
          totalTasks: 1,
          completedTasks: 1,
          completionRate: {
            $cond: [
              { $gt: ["$totalTasks", 0] },
              {
                $multiply: [
                  { $divide: ["$completedTasks", "$totalTasks"] },
                  100
                ]
              },
              0
            ]
          },
          avgCompletionTimeHours: {
            $cond: [
              { $ne: ["$avgCompletionTime", null] },
              { $round: ["$avgCompletionTime", 2] },
              null
            ]
          }
        }
      },
      {
        $sort: { completionRate: -1 }
      }
    ]);

    res.json(performance);
  } catch (err) {
    console.error("Analytics Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get recent activity (last 10 tasks)
 * Returns most recently created tasks with agent details
 */
const getRecentActivity = async (req, res) => {
  try {
    const recentTasks = await Task.find()
      .populate("agent", "name email")
      .sort({ createdAt: -1 })
      .limit(10)
      .select("firstName phone notes status createdAt completedDate agent");

    res.json(recentTasks);
  } catch (err) {
    console.error("Analytics Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getOverallStats,
  getTasksByAgent,
  getTaskTrends,
  getAgentPerformance,
  getRecentActivity
};

