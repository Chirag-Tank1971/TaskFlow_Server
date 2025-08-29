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
    console.log(agentId)
    // Check if the agent exists in the database
    
    const agentExists = await Agent.findById(agentId);
    if (!agentExists) {
      console.log("Agent not found")
      return res.status(404).json({ message: "Agent not found" });
    }

    // Fetch tasks assigned to the given agent and populate agent details
    const tasks = await Task.find({ agent: agentId }).populate("agent", "name email");

    // If no tasks found, return a message
    if (!tasks.length) {
      console.log("No tasks found for this agent")
      return res.status(404).json({ message: "No tasks found for this agent" });
    }

    res.json(tasks); // Send the retrieved tasks as a JSON response
  } catch (err) {
    console.error("Fetch Tasks Error:", err);
    res.status(500).json({ message: "Server error" }); // Handle server errors
  }
};

const deleteTasks = async(req,res) => {
   try {
      const {taskId} = req.params
      try {
          const deleteTask = await Task.findByIdAndDelete({_id:taskId})
          res.json(deleteTask)
      } catch (error) {
        console.error("Delete Tasks Error:", error);
        res.status(500).json({ message: "Server error" });
      }
   } catch (error) {
    console.error("Fetch Tasks Error:", error);
    res.status(500).json({ message: "Server error" });
   }
}

const updateTasks =async (req,res) => {
    try {
      const {taskId} = req.params
      const {status} = req.body
      try {
          const updatedTask = await Task.findOneAndUpdate(
            {_id:taskId} ,
            {status},
            {new:true}
          )
          res.status(200).json(updatedTask)
      } catch (error) {
        console.error("Update Tasks Error:", error);
        res.status(500).json({ message: "Server error" });
      }
   }catch(error){
    console.error("Update Tasks Error:", error);
      res.status(500).json({ message: "Server error" });
   }
}

module.exports = { getTasks, getTasksByAgent, deleteTasks, updateTasks }; // Export the functions for use in routes
