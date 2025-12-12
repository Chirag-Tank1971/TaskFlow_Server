const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true, // Remove whitespace
    },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true, // Normalize email
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Available", "Not-Available", "Decommissioned"],
      default: "Available",
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Indexes for performance
// Note: email index is automatically created by unique: true, so we don't need explicit index
agentSchema.index({ status: 1 }); // For filtering by status
agentSchema.index({ createdAt: -1 }); // For sorting by join date
agentSchema.index({ updatedAt: -1 }); // For tracking updates

module.exports = mongoose.model("Agent", agentSchema);