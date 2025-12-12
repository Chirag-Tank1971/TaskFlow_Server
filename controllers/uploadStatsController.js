const Upload = require("../models/Upload");
const Task = require("../models/Task");

/**
 * Get overall upload statistics
 * @route GET /api/upload/stats
 * @access Private
 */
const getUploadStats = async (req, res) => {
  try {
    // Get total uploads count
    const totalUploads = await Upload.countDocuments();

    // Get successful uploads count
    const successfulUploads = await Upload.countDocuments({ status: "success" });

    // Get failed uploads count
    const failedUploads = await Upload.countDocuments({ status: "failed" });

    // Get last upload date
    const lastUpload = await Upload.findOne()
      .sort({ createdAt: -1 })
      .select("createdAt");

    // Get total tasks created from all uploads
    const totalTasksCreated = await Upload.aggregate([
      {
        $match: { status: "success" },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$tasksCreated" },
        },
      },
    ]);

    const totalTasks = totalTasksCreated.length > 0 ? totalTasksCreated[0].total : 0;

    // Calculate success rate
    const successRate = totalUploads > 0 ? ((successfulUploads / totalUploads) * 100).toFixed(1) : 0;

    // Calculate average tasks per upload
    const avgTasksPerUpload =
      successfulUploads > 0 ? (totalTasks / successfulUploads).toFixed(1) : 0;

    res.json({
      totalUploads,
      successfulUploads,
      failedUploads,
      lastUploadDate: lastUpload ? lastUpload.createdAt : null,
      totalTasksCreated: totalTasks,
      successRate: parseFloat(successRate),
      avgTasksPerUpload: parseFloat(avgTasksPerUpload),
    });
  } catch (err) {
    console.error("Upload Stats Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get upload history (recent uploads)
 * @route GET /api/upload/history
 * @access Private
 * @query limit - Number of uploads to return (default: 20)
 */
const getUploadHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const limitValue = Math.min(limit, 50); // Cap at 50 for performance

    const uploads = await Upload.find()
      .sort({ createdAt: -1 })
      .limit(limitValue)
      .populate("uploadedBy", "name email")
      .select("filename fileSize status tasksCreated rowCount errorMessage createdAt processingTime")
      .lean();

    // Format the response
    const formattedUploads = uploads.map((upload) => ({
      id: upload._id,
      filename: upload.filename,
      fileSize: upload.fileSize,
      status: upload.status,
      tasksCreated: upload.tasksCreated,
      rowCount: upload.rowCount,
      errorMessage: upload.errorMessage,
      createdAt: upload.createdAt,
      processingTime: upload.processingTime,
      uploadedBy: upload.uploadedBy
        ? {
            name: upload.uploadedBy.name,
            email: upload.uploadedBy.email,
          }
        : null,
    }));

    res.json(formattedUploads);
  } catch (err) {
    console.error("Upload History Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get specific upload details by ID
 * @route GET /api/upload/:id
 * @access Private
 */
const getUploadDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Upload ID is required" });
    }

    const upload = await Upload.findById(id)
      .populate("uploadedBy", "name email")
      .populate("tasks", "firstName phone notes status agent")
      .lean();

    if (!upload) {
      return res.status(404).json({ message: "Upload not found" });
    }

    // Format the response
    const formattedUpload = {
      id: upload._id,
      filename: upload.filename,
      fileSize: upload.fileSize,
      mimeType: upload.mimeType,
      status: upload.status,
      tasksCreated: upload.tasksCreated,
      rowCount: upload.rowCount,
      errorMessage: upload.errorMessage,
      processingTime: upload.processingTime,
      createdAt: upload.createdAt,
      updatedAt: upload.updatedAt,
      uploadedBy: upload.uploadedBy
        ? {
            name: upload.uploadedBy.name,
            email: upload.uploadedBy.email,
          }
        : null,
      tasks: upload.tasks || [],
    };

    res.json(formattedUpload);
  } catch (err) {
    console.error("Upload Details Error:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ message: "Invalid upload ID" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getUploadStats,
  getUploadHistory,
  getUploadDetails,
};

