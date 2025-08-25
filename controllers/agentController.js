const bcrypt = require("bcryptjs"); // Import bcrypt for password hashing
const Agent = require("../models/Agent"); // Import the Agent model
const Task = require("../models/Task"); //  Import Task model


// Function to add a new agent
const addAgent = async (req, res) => {
  try {
    const { name, email, mobile, password , status } = req.body; // Extract agent details from request body
    // Check if an agent with the same email already exists
    let user =  await Agent.findOne({ email })
    if (user) {
      return res.status(400).json({ message: "Agent already exists" });
      
    }

    // Hash the agent's password before saving to the database
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new agent instance with the provided details
    const agent = new Agent({ name, email, mobile, password: hashedPassword , status });

    await agent.save(); // Save the agent to the database

    res.status(201).json({ message: "Agent added successfully" }); // Respond with success message
  } catch (err) {
    console.error("Agent Creation Error:", err);
    res.status(500).json({ message: "Server error" }); // Handle server errors
  }
};

const updateAgent = async (req,res) => {
   try {
    const { agent } = req.body; 
    try {
      let user =  await Agent.findByIdAndUpdate(agent.id,{
        name:agent.name,
        email:agent.email,
        mobile:agent.mobile,
        status:agent.status
      },
      {new:true} 
        
  )     
      res.json(user)
    } catch (error) {
        console.error("Something Went Wrong" , error)
        res.status(500).json({ message: "Server error" });
    }
   } catch (error) {
    console.error("Agent Not Found" , error)
    res.status(500).json({ message: "Server error" });
   }
}

// Function to fetch all agents
const getAgents = async (req, res) => {
  try {
    const agents = await Agent.find(); // Retrieve all agents from the database
    res.json(agents); // Send the agents as a response
  } catch (err) {
    console.error("Fetch Agents Error:", err);
    res.status(500).json({ message: "Server error" }); // Handle server errors
  }
};

// Function to delete an agent
const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params; // Extract agent ID from request parameters

    // Find the agent by ID
    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    // Delete all tasks associated with the agent (Make sure Task model is imported)
    await Task.deleteMany({ agent: id });

    // Delete the agent from the database
    await Agent.findByIdAndDelete(id);

    res.json({ message: "Agent and associated tasks deleted successfully" }); // Respond with success message
  } catch (err) {
    console.error("Delete Agent Error:", err);
    res.status(500).json({ message: "Server error" }); // Handle server errors
  }
};

module.exports = { addAgent, getAgents, deleteAgent, updateAgent }; // Export the functions for use in routes
