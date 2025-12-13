/**
 * Migration script to add category fields to existing tasks
 * Run this once after deploying the categorization feature
 * 
 * Usage: node scripts/migrateCategories.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Task = require("../models/Task");

const migrateCategories = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("MongoDB Connected");

    // Find all tasks without category field or with null category
    const tasksToUpdate = await Task.find({
      $or: [
        { category: { $exists: false } },
        { category: null },
        { category: "" }
      ]
    });

    console.log(`Found ${tasksToUpdate.length} tasks to migrate`);

    if (tasksToUpdate.length === 0) {
      console.log("No tasks need migration. All tasks already have categories.");
      process.exit(0);
    }

    // Update all tasks with default category
    const result = await Task.updateMany(
      {
        $or: [
          { category: { $exists: false } },
          { category: null },
          { category: "" }
        ]
      },
      {
        $set: {
          category: "General",
          categorySource: "default",
          categorizedAt: null,
          categoryConfidence: null
        }
      }
    );

    console.log(`✅ Successfully migrated ${result.modifiedCount} tasks`);
    console.log(`   - Set category to "General"`);
    console.log(`   - Set categorySource to "default"`);

    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
};

// Run migration
migrateCategories();

