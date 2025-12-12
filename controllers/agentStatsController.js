const Task = require("../models/Task");
const Agent = require("../models/Agent");

/**
 * Get agent statistics
 * @route GET /api/agent/stats/:agentId
 * @access Private
 */
const getAgentStats = async (req, res) => {
  try {
    const { agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({ message: "Agent ID is required" });
    }

    // Verify agent exists
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    // Get all tasks for this agent
    const tasks = await Task.find({ agent: agentId }).lean();

    // Calculate statistics
    const totalTasks = tasks.length;
    const pendingTasks = tasks.filter((t) => t.status === "pending").length;
    const inProgressTasks = tasks.filter((t) => t.status === "in-progress").length;
    const completedTasks = tasks.filter((t) => t.status === "completed").length;

    // Calculate completion rate
    const completionRate =
      totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's tasks (assigned today)
    const todayTasks = tasks.filter((task) => {
      const taskDate = new Date(task.createdAt);
      return taskDate >= today && taskDate < tomorrow;
    }).length;

    // Tasks completed today
    const todayCompleted = tasks.filter((task) => {
      if (task.status === "completed" && task.completedDate) {
        const completedDate = new Date(task.completedDate);
        return completedDate >= today && completedDate < tomorrow;
      }
      return false;
    }).length;

    // Calculate average completion time (in hours)
    const completedTasksWithTime = tasks.filter(
      (t) => t.status === "completed" && t.completedDate && t.createdAt
    );

    let avgCompletionTime = 0;
    if (completedTasksWithTime.length > 0) {
      const totalTime = completedTasksWithTime.reduce((sum, task) => {
        const timeDiff = new Date(task.completedDate) - new Date(task.createdAt);
        return sum + timeDiff;
      }, 0);
      avgCompletionTime = (totalTime / completedTasksWithTime.length) / (1000 * 60 * 60); // Convert to hours
    }

    // Calculate days active (from agent createdAt)
    let daysActive = 0;
    if (agent.createdAt) {
      const joinDate = new Date(agent.createdAt);
      const todayDate = new Date();
      daysActive = Math.floor((todayDate - joinDate) / (1000 * 60 * 60 * 24));
    }

    res.json({
      totalTasks,
      pendingTasks,
      inProgressTasks,
      completedTasks,
      completionRate: parseFloat(completionRate),
      todayTasks,
      todayCompleted,
      avgCompletionTime: parseFloat(avgCompletionTime.toFixed(2)),
      daysActive,
      agent: {
        name: agent.name,
        email: agent.email,
        status: agent.status,
        createdAt: agent.createdAt,
      },
    });
  } catch (err) {
    console.error("Agent Stats Error:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ message: "Invalid agent ID" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get agent performance metrics
 * @route GET /api/agent/performance/:agentId
 * @access Private
 */
const getAgentPerformance = async (req, res) => {
  try {
    const { agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({ message: "Agent ID is required" });
    }

    // Verify agent exists
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    // Get all tasks for this agent
    const tasks = await Task.find({ agent: agentId }).lean();

    // Get last 7 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Weekly completion trend (last 7 days)
    const weeklyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayTasks = tasks.filter((task) => {
        if (task.status === "completed" && task.completedDate) {
          const completedDate = new Date(task.completedDate);
          return completedDate >= date && completedDate < nextDate;
        }
        return false;
      }).length;

      weeklyTrend.push({
        date: date.toISOString().split("T")[0],
        count: dayTasks,
      });
    }

    // Calculate performance score (0-100)
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === "completed").length;
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Average completion time factor (lower is better, max 48 hours = 100 points)
    const completedTasksWithTime = tasks.filter(
      (t) => t.status === "completed" && t.completedDate && t.createdAt
    );
    let avgCompletionTime = 0;
    if (completedTasksWithTime.length > 0) {
      const totalTime = completedTasksWithTime.reduce((sum, task) => {
        const timeDiff = new Date(task.completedDate) - new Date(task.createdAt);
        return sum + timeDiff;
      }, 0);
      avgCompletionTime = totalTime / completedTasksWithTime.length / (1000 * 60 * 60); // Hours
    }
    const timeScore = avgCompletionTime > 0 ? Math.max(0, 100 - (avgCompletionTime / 48) * 100) : 50;

    // Performance score (weighted: 70% completion rate, 30% time score)
    const performanceScore = (completionRate * 0.7) + (timeScore * 0.3);

    // Best day performance
    const dailyCompletions = {};
    tasks.forEach((task) => {
      if (task.status === "completed" && task.completedDate) {
        const date = new Date(task.completedDate).toISOString().split("T")[0];
        dailyCompletions[date] = (dailyCompletions[date] || 0) + 1;
      }
    });

    const bestDay = Object.entries(dailyCompletions).reduce(
      (max, [date, count]) => (count > max.count ? { date, count } : max),
      { date: null, count: 0 }
    );

    res.json({
      weeklyTrend,
      performanceScore: parseFloat(performanceScore.toFixed(1)),
      completionRate: parseFloat(completionRate.toFixed(1)),
      avgCompletionTime: parseFloat(avgCompletionTime.toFixed(2)),
      bestDay: bestDay.date ? { date: bestDay.date, count: bestDay.count } : null,
    });
  } catch (err) {
    console.error("Agent Performance Error:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ message: "Invalid agent ID" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get agent activity feed
 * @route GET /api/agent/activity/:agentId
 * @access Private
 * @query limit - Number of activities to return (default: 20)
 */
const getAgentActivity = async (req, res) => {
  try {
    const { agentId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const limitValue = Math.min(limit, 50); // Cap at 50

    if (!agentId) {
      return res.status(400).json({ message: "Agent ID is required" });
    }

    // Verify agent exists
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    // Get all tasks for this agent, sorted by updatedAt
    const tasks = await Task.find({ agent: agentId })
      .sort({ updatedAt: -1 })
      .limit(limitValue)
      .lean();

    // Format activity feed
    const activities = tasks.map((task) => {
      const activity = {
        id: task._id,
        type: "task",
        taskId: task._id,
        taskNotes: task.notes,
        taskFirstName: task.firstName,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedDate: task.completedDate,
      };

      // Determine activity type
      if (task.status === "completed" && task.completedDate) {
        activity.activityType = "completed";
        activity.timestamp = task.completedDate;
        activity.message = `Completed task: ${task.notes || task.firstName}`;
      } else if (task.status === "in-progress") {
        activity.activityType = "in-progress";
        activity.timestamp = task.updatedAt;
        activity.message = `Started working on: ${task.notes || task.firstName}`;
      } else {
        activity.activityType = "assigned";
        activity.timestamp = task.createdAt;
        activity.message = `New task assigned: ${task.notes || task.firstName}`;
      }

      return activity;
    });

    // Sort by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(activities.slice(0, limitValue));
  } catch (err) {
    console.error("Agent Activity Error:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ message: "Invalid agent ID" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAgentStats,
  getAgentPerformance,
  getAgentActivity,
};

