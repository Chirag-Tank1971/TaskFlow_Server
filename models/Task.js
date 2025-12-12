const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  firstName: String,
  phone: String,
  notes: String,
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
  date: { type: Date, default: Date.now }, // Keep for backward compatibility
  status: { 
    type: String, 
    enum: ["pending", "in-progress", "completed"], 
    default: "pending" 
  },
  completedDate: { 
    type: Date,
    default: null  // Will be set when status changes to "completed"
  }
}, {
  timestamps: true  // Automatically adds createdAt and updatedAt
});

// Indexes for better query performance
taskSchema.index({ agent: 1, status: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ completedDate: -1 });
taskSchema.index({ updatedAt: -1 });

module.exports = mongoose.model("Task", taskSchema);