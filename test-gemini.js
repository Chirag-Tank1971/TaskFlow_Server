/**
 * Test script to verify Gemini API key and model availability
 * Run with: node test-gemini.js
 */

const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const apiKey = process.env.GEMINI_API_KEY;

console.log("\n=== Gemini API Test ===\n");
console.log("API Key exists:", !!apiKey);
console.log("API Key length:", apiKey?.length || 0);
console.log("API Key preview:", apiKey ? `${apiKey.substring(0, 10)}...` : "N/A");

if (!apiKey) {
  console.error("\n❌ GEMINI_API_KEY not found in .env file");
  console.error("Please add your API key to the .env file:");
  console.error("GEMINI_API_KEY=your_api_key_here");
  console.error("\nGet your API key from: https://aistudio.google.com/apikey");
  process.exit(1);
}

// New API pattern: pass empty object, API key is read from env variable
const genAI = new GoogleGenAI({});

// Test models in order
const testModels = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro"
];

async function testModel(modelName) {
  try {
    console.log(`\nTesting model: ${modelName}...`);
    
    // New API pattern: use genAI.models.generateContent()
    const result = await Promise.race([
      genAI.models.generateContent({
        model: modelName,
        contents: "Say 'OK' if you can hear me"
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout after 5 seconds")), 5000)
      )
    ]);
    
    // New API: response.text is accessed directly
    const text = result.text.trim();
    
    console.log(`✅ ${modelName} works!`);
    console.log(`   Response: ${text}`);
    return true;
  } catch (error) {
    console.log(`❌ ${modelName} failed`);
    console.log(`   Error: ${error.message}`);
    if (error.message.includes("404") || error.message.includes("not found")) {
      console.log(`   → Model not available in this API version`);
    } else if (error.message.includes("401") || error.message.includes("403")) {
      console.log(`   → API key authentication failed`);
    } else if (error.message.includes("API key")) {
      console.log(`   → API key issue detected`);
    }
    return false;
  }
}

async function runTests() {
  console.log("\nTesting available models...\n");
  
  let workingModel = null;
  
  for (const modelName of testModels) {
    const works = await testModel(modelName);
    if (works && !workingModel) {
      workingModel = modelName;
    }
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log("\n=== Test Results ===\n");
  
  if (workingModel) {
    console.log(`✅ SUCCESS: Found working model: ${workingModel}`);
    console.log(`\nYour API key is valid and ready to use!`);
    console.log(`\nRecommended: Update MODEL_NAMES in categorizationService.js`);
    console.log(`to prioritize: ${workingModel}`);
  } else {
    console.log(`❌ FAILED: No working models found`);
    console.log(`\nPossible issues:`);
    console.log(`1. API key is invalid or expired`);
    console.log(`2. API key doesn't have access to Gemini models`);
    console.log(`3. Network connectivity issues`);
    console.log(`4. Models not available in your region`);
    console.log(`\nNext steps:`);
    console.log(`- Verify API key at: https://aistudio.google.com/apikey`);
    console.log(`- Check your .env file has the correct key`);
    console.log(`- Ensure network can reach generativelanguage.googleapis.com`);
  }
  
  console.log("\n");
}

runTests().catch(error => {
  console.error("\n❌ Test script error:", error);
  process.exit(1);
});

