const mongoose = require("mongoose"); // Import Mongoose for MongoDB connection

// Function to connect to MongoDB
const connectDB = async () => {
  try {
    // Attempt to connect to MongoDB using the provided connection string from environment variables
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true, // Ensures compatibility with the latest MongoDB drivers
      useUnifiedTopology: true, // Enables the new connection management engine
    });

    console.log("MongoDB Connected"); // Log a success message when connected
  } catch (err) {
    console.error("MongoDB Connection Error:", err); // Log any connection errors

    process.exit(1); // Exit the application if the connection fails
  }
};

module.exports = connectDB; // Export the function for use in other parts of the application
