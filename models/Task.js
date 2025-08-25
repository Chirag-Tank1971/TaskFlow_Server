const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  firstName: String,
  phone: String,
  notes: String,
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
  date: { type: Date, default: Date.now },
  status: { type: String, enum: ["pending", "in-progress", "completed"], default: "pending" },
});

module.exports = mongoose.model("Task", taskSchema);