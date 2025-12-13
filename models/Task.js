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
  },
  // AI Categorization fields
  category: {
    type: String,
    enum: ["Support", "Sales", "Technical", "Billing", "Urgent", "General"],
    default: "General",
    required: true
  },
  categorySource: {
    type: String,
    enum: ["ai", "manual", "default"],
    default: "default"
  },
  categorizedAt: {
    type: Date,
    default: null
  },
  categoryConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: null
  }
}, {
  timestamps: true  // Automatically adds createdAt and updatedAt
});

// Indexes for better query performance
taskSchema.index({ agent: 1, status: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ completedDate: -1 });
taskSchema.index({ updatedAt: -1 });
// Category indexes for filtering and analytics
taskSchema.index({ category: 1 });
taskSchema.index({ category: 1, status: 1 });
taskSchema.index({ agent: 1, category: 1 });
taskSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model("Task", taskSchema);