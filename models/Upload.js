const mongoose = require("mongoose");

const uploadSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["processing", "success", "failed"],
      default: "processing",
      required: true,
    },
    tasksCreated: {
      type: Number,
      default: 0,
    },
    rowCount: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
    },
    processingTime: {
      type: Number, // in milliseconds
    },
    tasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Indexes for performance
uploadSchema.index({ uploadedBy: 1 });
uploadSchema.index({ createdAt: -1 });
uploadSchema.index({ status: 1 });
uploadSchema.index({ uploadedBy: 1, createdAt: -1 }); // Compound index for user-specific history queries

module.exports = mongoose.model("Upload", uploadSchema);

