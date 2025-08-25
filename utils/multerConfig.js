const multer = require("multer");

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: "uploads/", // Save files to the "uploads" directory
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`), // Rename file with a timestamp
});

// Multer upload configuration with file type filtering
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["text/csv", "application/vnd.ms-excel"]; // Allowed file MIME types
    cb(null, allowedTypes.includes(file.mimetype)); // Accept or reject file based on type
  },
});

module.exports = upload; // Export the configured upload middleware
