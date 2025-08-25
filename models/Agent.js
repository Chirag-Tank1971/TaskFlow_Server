const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  mobile: { type: String, required: true },
  password: { type: String, required: true },
  status:String,
});

module.exports = mongoose.model("Agent", agentSchema);