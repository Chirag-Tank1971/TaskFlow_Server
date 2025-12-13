const { GoogleGenAI } = require("@google/genai");
const crypto = require("crypto");

// Category definitions
const CATEGORIES = ["Support", "Sales", "Technical", "Billing", "Urgent", "General"];

// In-memory cache for categorization results
// In production, consider using Redis for distributed caching
const categorizationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Rate limiting configuration
let requestCount = 0;
let rateLimitResetTime = Date.now() + 60000; // Reset every minute
const MAX_REQUESTS_PER_MINUTE = 5; // Gemini free tier limit (5 requests/minute)

// Model discovery and health monitoring
let workingModel = null; // Cached working model name
let modelDiscoveryAttempts = 0;
let lastModelDiscoveryTime = 0;
const MODEL_DISCOVERY_INTERVAL = 5 * 60 * 1000; // Re-check models every 5 minutes
const MAX_MODEL_DISCOVERY_ATTEMPTS = 3; // Max attempts per discovery session

// Health monitoring
const healthStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  cacheHits: 0,
  lastSuccessTime: null,
  lastFailureTime: null,
  consecutiveFailures: 0,
  isHealthy: true
};

// Model names to try (in order of preference)
// Updated to use latest models from @google/genai SDK
const MODEL_NAMES = [
  "gemini-2.5-flash",      // Latest fast model
  "gemini-1.5-flash",      // Previous fast model
  "gemini-1.5-pro",        // Previous pro model
  "gemini-pro"              // Legacy model
];

/**
 * Generate cache key from task notes
 */
const generateCacheKey = (notes) => {
  if (!notes || typeof notes !== "string") return null;
  // Normalize the notes (lowercase, trim) for better cache hits
  const normalized = notes.toLowerCase().trim();
  return crypto.createHash("md5").update(normalized).digest("hex");
};

/**
 * Check if cached result is still valid
 */
const isCacheValid = (cachedItem) => {
  if (!cachedItem) return false;
  return Date.now() - cachedItem.timestamp < CACHE_TTL;
};

/**
 * Reset rate limit counter if needed
 */
const checkRateLimit = () => {
  const now = Date.now();
  if (now > rateLimitResetTime) {
    requestCount = 0;
    rateLimitResetTime = now + 60000;
  }
  return requestCount < MAX_REQUESTS_PER_MINUTE;
};

/**
 * Increment rate limit counter
 */
const incrementRateLimit = () => {
  requestCount++;
};

/**
 * Initialize Gemini AI client
 * API key is automatically picked up from GEMINI_API_KEY environment variable
 */
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }
  // New API pattern: pass empty object, API key is read from env variable
  return new GoogleGenAI({});
};

/**
 * Test if a model is available and working
 * @param {string} modelName - The model name to test
 * @returns {Promise<boolean>} - True if model works, false otherwise
 * @throws {Error} - Throws rate limit errors (429) so discovery can handle them
 */
const testModel = async (modelName) => {
  try {
    const genAI = getGeminiClient();
    
    // Test with a simple prompt
    const testPrompt = "Respond with only: OK";
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Model test timeout")), 3000)
    );
    
    // New API pattern: use genAI.models.generateContent()
    const apiPromise = genAI.models.generateContent({
      model: modelName,
      contents: testPrompt
    });
    
    const response = await Promise.race([apiPromise, timeoutPromise]);
    
    // Check if response is valid
    if (response && (response.text || response.response)) {
      return true;
    }
    
    return false;
  } catch (error) {
    // Check for rate limit errors (429) - these should be re-thrown
    const isRateLimit = error.code === 429 || 
                       error.status === 429 ||
                       (error.error && error.error.code === 429) ||
                       error.message?.includes("429") || 
                       error.message?.includes("quota") ||
                       error.message?.includes("RESOURCE_EXHAUSTED");
    
    // Check for model not found errors (404)
    const isNotFound = error.code === 404 || 
                      error.status === 404 ||
                      (error.error && error.error.code === 404) ||
                      error.message?.includes("404") ||
                      error.message?.includes("not found");
    
    // Re-throw rate limit errors so discovery can handle them gracefully
    if (isRateLimit) {
      const rateLimitError = new Error("Rate limit exceeded during model test");
      rateLimitError.code = 429;
      rateLimitError.isRateLimit = true;
      throw rateLimitError;
    }
    
    // Log but don't throw for 404 or other errors - this is expected for unavailable models
    if (process.env.NODE_ENV !== "production") {
      if (isNotFound) {
        console.log(`[Categorization] Model ${modelName} not found (404) - skipping`);
      } else {
        console.log(`[Categorization] Model ${modelName} test failed: ${error.message?.substring(0, 100) || 'Unknown error'}`);
      }
    }
    
    return false;
  }
};

/**
 * Discover and cache a working model
 * @param {boolean} forceRefresh - Force re-discovery even if model is cached
 * @returns {Promise<string|null>} - Working model name or null if none found
 */
const discoverWorkingModel = async (forceRefresh = false) => {
  const now = Date.now();
  
  // Return cached model if still valid and not forcing refresh
  if (!forceRefresh && workingModel && (now - lastModelDiscoveryTime < MODEL_DISCOVERY_INTERVAL)) {
    return workingModel;
  }
  
  // Check if we should attempt discovery (avoid too many attempts)
  if (modelDiscoveryAttempts >= MAX_MODEL_DISCOVERY_ATTEMPTS && !forceRefresh) {
    console.warn(`[Categorization] Model discovery attempts exceeded, using cached model: ${workingModel || 'none'}`);
    return workingModel;
  }
  
  // Check rate limit before starting discovery (unless forcing refresh)
  if (!forceRefresh && !checkRateLimit()) {
    console.warn(`[Categorization] Rate limit active, skipping model discovery. Using cached model: ${workingModel || 'none'}`);
    return workingModel; // Return cached model if available, or null if none
  }
  
  console.log(`[Categorization] Starting model discovery...`);
  modelDiscoveryAttempts++;
  lastModelDiscoveryTime = now;
  
  // Try each model in order with proper rate limit handling
  for (let i = 0; i < MODEL_NAMES.length; i++) {
    const modelName = MODEL_NAMES[i];
    
    // Check rate limit before each test
    if (!checkRateLimit()) {
      console.warn(`[Categorization] Rate limit reached during discovery at model ${i + 1}/${MODEL_NAMES.length}. Stopping discovery.`);
      // If we have a cached model, return it; otherwise return null
      return workingModel || null;
    }
    
    try {
      const isWorking = await testModel(modelName);
      incrementRateLimit(); // Count the test request
      
      if (isWorking) {
        workingModel = modelName;
        modelDiscoveryAttempts = 0; // Reset on success
        console.log(`[Categorization] ✓ Discovered working model: ${modelName}`);
        healthStats.isHealthy = true;
        healthStats.consecutiveFailures = 0;
        return modelName;
      }
    } catch (error) {
      // Handle rate limit errors specifically
      if (error.isRateLimit || error.code === 429) {
        console.warn(`[Categorization] Rate limit hit during model test for ${modelName}. Stopping discovery.`);
        // Update rate limit state
        rateLimitResetTime = Date.now() + 60000; // Reset in 1 minute
        requestCount = MAX_REQUESTS_PER_MINUTE; // Mark as exhausted
        return workingModel || null; // Return cached model if available
      }
      
      // For other errors, continue to next model
      if (process.env.NODE_ENV !== "production") {
        console.log(`[Categorization] Model ${modelName} test error: ${error.message?.substring(0, 100) || 'Unknown error'}`);
      }
    }
    
    // Respect rate limits: wait 13 seconds between tests (to stay under 5/min)
    // Only wait if not the last model
    if (i < MODEL_NAMES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 13000));
    }
  }
  
  // No working model found
  console.error(`[Categorization] ✗ No working model found after testing ${MODEL_NAMES.length} models`);
  workingModel = null;
  healthStats.isHealthy = false;
  healthStats.consecutiveFailures++;
  
  return null;
};

/**
 * Get or discover a working model
 * @returns {Promise<string|null>} - Working model name or null
 */
const getWorkingModel = async () => {
  if (workingModel) {
    return workingModel;
  }
  
  // Attempt discovery
  return await discoverWorkingModel(false);
};

/**
 * Categorize a single task using Gemini API
 * @param {string} taskNotes - The task notes to categorize
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {Promise<{category: string, source: string, confidence: number|null}>}
 */
const categorizeTask = async (taskNotes, useCache = true) => {
  healthStats.totalRequests++;
  
  // Input validation
  if (!taskNotes || typeof taskNotes !== "string" || taskNotes.trim().length === 0) {
    return {
      category: "General",
      source: "default",
      confidence: null
    };
  }

  const trimmedNotes = taskNotes.trim();

  // Check cache first
  if (useCache) {
    const cacheKey = generateCacheKey(trimmedNotes);
    if (cacheKey) {
      const cached = categorizationCache.get(cacheKey);
      if (isCacheValid(cached)) {
        healthStats.cacheHits++;
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Categorization] Cache hit for task notes`);
        }
        return {
          category: cached.category,
          source: "ai",
          confidence: cached.confidence
        };
      }
    }
  }

  // Check if AI categorization is enabled
  const aiEnabled = process.env.ENABLE_AI_CATEGORIZATION !== "false";
  if (!aiEnabled) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Categorization] AI disabled, using default category`);
    }
    return {
      category: "General",
      source: "default",
      confidence: null
    };
  }

  // Check rate limit
  if (!checkRateLimit()) {
    healthStats.failedRequests++;
    healthStats.lastFailureTime = Date.now();
    console.warn(`[Categorization] Rate limit exceeded, using default category`);
    return {
      category: "General",
      source: "default",
      confidence: null
    };
  }

  try {
    // Get or discover working model
    const modelName = await getWorkingModel();
    
    if (!modelName) {
      // No working model found - graceful degradation
      healthStats.failedRequests++;
      healthStats.lastFailureTime = Date.now();
      healthStats.consecutiveFailures++;
      console.warn(`[Categorization] No working model available, using default category`);
      return {
        category: "General",
        source: "default",
        confidence: null
      };
    }

    // Initialize Gemini client
    const genAI = getGeminiClient();
    
    // Create prompt for categorization
    const prompt = `Analyze this task note and categorize it into EXACTLY ONE of these categories: Support, Sales, Technical, Billing, Urgent, or General.

Task note: "${trimmedNotes}"

Rules:
- "Support" = Customer support, help requests, service issues
- "Sales" = Sales inquiries, leads, purchase questions, product inquiries
- "Technical" = Technical issues, bugs, system problems, IT support
- "Billing" = Payment issues, invoices, refunds, billing questions
- "Urgent" = Time-sensitive, critical, emergency situations
- "General" = Everything else, unclear, or doesn't fit other categories

Respond with ONLY the category name, nothing else. No explanations, no additional text.`;

    incrementRateLimit();

    // Call Gemini API with timeout and retry logic
    let lastError = null;
    const maxRetries = 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Categorization timeout")), 5000)
        );

        // New API pattern: use genAI.models.generateContent()
        const apiPromise = genAI.models.generateContent({
          model: modelName,
          contents: prompt
        });
        
        const response = await Promise.race([apiPromise, timeoutPromise]);
        
        // New API: response.text is accessed directly as a property
        const text = (response.text || '').trim();

        // Validate and normalize category
        let category = "General";
        const normalizedText = text.toLowerCase().trim();
        
        for (const cat of CATEGORIES) {
          if (normalizedText.includes(cat.toLowerCase())) {
            category = cat;
            break;
          }
        }

        // If no match found, use General
        if (!CATEGORIES.includes(category)) {
          category = "General";
        }

        // Cache the result
        const cacheKey = generateCacheKey(trimmedNotes);
        if (cacheKey) {
          categorizationCache.set(cacheKey, {
            category,
            confidence: null, // Gemini doesn't provide confidence scores
            timestamp: Date.now()
          });

          // Clean old cache entries periodically (keep cache size manageable)
          if (categorizationCache.size > 1000) {
            const entries = Array.from(categorizationCache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            // Remove oldest 200 entries
            for (let i = 0; i < 200; i++) {
              categorizationCache.delete(entries[i][0]);
            }
          }
        }

        // Success - update health stats
        healthStats.successfulRequests++;
        healthStats.lastSuccessTime = Date.now();
        healthStats.consecutiveFailures = 0;
        healthStats.isHealthy = true;
        
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Categorization] Successfully categorized as: ${category} (model: ${modelName})`);
        }
        
        return {
          category,
          source: "ai",
          confidence: null
        };
        
      } catch (err) {
        lastError = err;
        
        // Check if it's a rate limit error (429)
        const isRateLimit = err.status === 429 || 
                           err.code === 429 || 
                           (err.message && err.message.includes("429")) ||
                           (err.message && err.message.includes("quota")) ||
                           (err.message && err.message.includes("RESOURCE_EXHAUSTED")) ||
                           (err.error && (
                             err.error.code === 429 ||
                             err.error.status === 429 ||
                             err.error.message?.includes("429") ||
                             err.error.message?.includes("quota") ||
                             err.error.message?.includes("RESOURCE_EXHAUSTED")
                           ));
        
        if (isRateLimit) {
          // Create rate limit error to be caught by outer catch
          const rateLimitError = new Error("Rate limit exceeded");
          rateLimitError.isRateLimit = true;
          rateLimitError.originalError = err;
          throw rateLimitError;
        }
        
        // If it's a model not found error, try to discover a new model
        if (err.message && err.message.includes("not found")) {
          console.warn(`[Categorization] Model ${modelName} no longer available, re-discovering...`);
          workingModel = null; // Clear cached model
          const newModel = await discoverWorkingModel(true);
          if (newModel && attempt < maxRetries) {
            // Retry with new model
            continue;
          }
        }
        
        // For other errors, wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 3000); // Max 3 seconds
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // All retries exhausted
        throw err;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error("Unknown categorization error");

  } catch (error) {
    // Update health stats
    healthStats.failedRequests++;
    healthStats.lastFailureTime = Date.now();
    healthStats.consecutiveFailures++;
    
    // Check if it's a rate limit error
    const isRateLimit = error.status === 429 || 
                       error.code === 429 || 
                       (error.message && error.message.includes("429")) ||
                       (error.message && error.message.includes("quota")) ||
                       (error.message && error.message.includes("RESOURCE_EXHAUSTED")) ||
                       (error.originalError && (
                         error.originalError.status === 429 ||
                         error.originalError.code === 429 ||
                         error.originalError.message?.includes("429") ||
                         error.originalError.message?.includes("quota") ||
                         error.originalError.message?.includes("RESOURCE_EXHAUSTED")
                       ));
    
    if (isRateLimit) {
      // Throw a specific rate limit error that can be caught
      const rateLimitError = new Error("Rate limit exceeded");
      rateLimitError.isRateLimit = true;
      rateLimitError.originalError = error.originalError || error;
      throw rateLimitError;
    }
    
    // If too many consecutive failures, mark as unhealthy
    if (healthStats.consecutiveFailures >= 5) {
      healthStats.isHealthy = false;
      // Try to discover a new model
      workingModel = null;
      await discoverWorkingModel(true);
    }
    
    console.error(`[Categorization] Error categorizing task: ${error.message}`);
    
    // For non-rate-limit errors, return default category gracefully
    return {
      category: "General",
      source: "default",
      confidence: null
    };
  }
};

/**
 * Separate tasks into cached and uncached
 * @param {Array<{notes: string}>} tasks - Array of tasks
 * @returns {Promise<{cachedResults: Array, uncachedTasks: Array}>}
 */
const separateCachedTasks = async (tasks) => {
  const cachedResults = [];
  const uncachedTasks = [];
  
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const notes = task.notes || "";
    const cacheKey = generateCacheKey(notes);
    
    if (cacheKey) {
      const cached = categorizationCache.get(cacheKey);
      if (isCacheValid(cached)) {
        healthStats.cacheHits++;
        cachedResults.push({
          index: i,
          result: {
            category: cached.category,
            source: "ai",
            confidence: cached.confidence
          }
        });
        continue;
      }
    }
    
    uncachedTasks.push({
      index: i,
      task: task
    });
  }
  
  return { cachedResults, uncachedTasks };
};

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 0.75 words)
 * @param {string} text - Text to estimate
 * @returns {number} - Estimated token count
 */
const estimateTokens = (text) => {
  if (!text || typeof text !== "string") return 0;
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words / 0.75);
};

/**
 * Create optimal chunks from tasks
 * @param {Array<{index: number, task: Object}>} tasks - Array of tasks with indices
 * @param {Object} config - Chunking configuration
 * @returns {Array<Array<{index: number, task: Object}>>} - Array of chunks
 */
const createOptimalChunks = (tasks, config = {}) => {
  const {
    maxChunkSize = 15,
    maxTokens = 2000,
    minChunkSize = 5
  } = config;
  
  if (tasks.length === 0) return [];
  
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;
  
  // Base prompt tokens (overhead)
  const basePromptTokens = 200;
  
  for (const item of tasks) {
    const taskNotes = item.task.notes || "";
    const taskTokens = estimateTokens(taskNotes);
    const taskNumberTokens = 10; // For numbering in prompt
    const totalTaskTokens = taskTokens + taskNumberTokens;
    
    // Check if adding this task would exceed limits
    const wouldExceedSize = currentChunk.length >= maxChunkSize;
    const wouldExceedTokens = (currentTokens + totalTaskTokens + basePromptTokens) > maxTokens;
    
    if (wouldExceedSize || wouldExceedTokens) {
      // Start new chunk if current chunk meets minimum size
      if (currentChunk.length >= minChunkSize) {
        chunks.push(currentChunk);
        currentChunk = [item];
        currentTokens = totalTaskTokens;
      } else {
        // Add to current chunk even if it exceeds (better than tiny chunks)
        currentChunk.push(item);
        currentTokens += totalTaskTokens;
      }
    } else {
      currentChunk.push(item);
      currentTokens += totalTaskTokens;
    }
  }
  
  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
};

/**
 * Build batch prompt for chunk categorization
 * @param {Array<{index: number, task: Object}>} chunk - Chunk of tasks
 * @returns {string} - Formatted prompt
 */
const buildBatchPrompt = (chunk) => {
  const taskList = chunk.map((item, idx) => {
    const taskNumber = idx + 1;
    const notes = (item.task.notes || "").trim();
    return `${taskNumber}. "${notes}"`;
  }).join('\n');
  
  return `Analyze these tasks and categorize each into EXACTLY ONE category: Support, Sales, Technical, Billing, Urgent, or General.

Tasks:
${taskList}

Rules:
- "Support" = Customer support, help requests, service issues
- "Sales" = Sales inquiries, leads, purchase questions, product inquiries
- "Technical" = Technical issues, bugs, system problems, IT support
- "Billing" = Payment issues, invoices, refunds, billing questions
- "Urgent" = Time-sensitive, critical, emergency situations
- "General" = Everything else, unclear, or doesn't fit other categories

Respond with ONLY a valid JSON array in this exact format:
[
  {"taskNumber": 1, "category": "Support"},
  {"taskNumber": 2, "category": "Sales"},
  ...
]

Do not include any other text, explanations, markdown formatting, or code blocks. Only the JSON array.`;
};

/**
 * Parse batch response from LLM
 * @param {string} responseText - Raw response text
 * @param {number} expectedCount - Expected number of results
 * @returns {Array<{taskNumber: number, category: string}>|null} - Parsed results or null
 */
const parseBatchResponse = (responseText, expectedCount) => {
  if (!responseText || typeof responseText !== "string") {
    return null;
  }
  
  try {
    // Clean response text
    let jsonText = responseText.trim();
    
    // Remove markdown code blocks if present
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    jsonText = jsonText.replace(/^\[/, '[').replace(/\]$/, ']');
    
    // Try to extract JSON array
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonText);
    
    // Validate it's an array
    if (!Array.isArray(parsed)) {
      console.warn(`[Categorization] Batch response is not an array: ${typeof parsed}`);
      return null;
    }
    
    // Validate count (allow some flexibility)
    if (parsed.length !== expectedCount && parsed.length < expectedCount * 0.8) {
      console.warn(`[Categorization] Batch response count mismatch: expected ${expectedCount}, got ${parsed.length}`);
      // Still return partial results
    }
    
    // Validate structure
    const validResults = parsed.filter(item => 
      item && 
      typeof item === 'object' && 
      typeof item.taskNumber === 'number' && 
      typeof item.category === 'string'
    );
    
    if (validResults.length === 0) {
      return null;
    }
    
    return validResults;
  } catch (error) {
    console.error(`[Categorization] Failed to parse batch response: ${error.message}`);
    return null;
  }
};

/**
 * Validate and normalize category
 * @param {string} category - Category from LLM
 * @returns {string} - Valid category
 */
const validateCategory = (category) => {
  if (!category || typeof category !== "string") {
    return "General";
  }
  
  const normalized = category.trim();
  const normalizedLower = normalized.toLowerCase();
  
  // Direct match
  for (const cat of CATEGORIES) {
    if (normalizedLower === cat.toLowerCase()) {
      return cat;
    }
  }
  
  // Partial match
  for (const cat of CATEGORIES) {
    if (normalizedLower.includes(cat.toLowerCase()) || cat.toLowerCase().includes(normalizedLower)) {
      return cat;
    }
  }
  
  return "General";
};

/**
 * Categorize a chunk of tasks in a single batch request
 * @param {Array<{index: number, task: Object}>} chunk - Chunk of tasks
 * @returns {Promise<Array<{index: number, result: Object}>>} - Categorized results
 */
const categorizeChunkBatch = async (chunk) => {
  if (!chunk || chunk.length === 0) {
    return [];
  }
  
  const modelName = await getWorkingModel();
  if (!modelName) {
    throw new Error("No working model available");
  }
  
  // Check rate limit
  if (!checkRateLimit()) {
    throw new Error("Rate limit exceeded");
  }
  
  const genAI = getGeminiClient();
  const prompt = buildBatchPrompt(chunk);
  
  incrementRateLimit();
  
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Batch categorization timeout")), 10000)
  );
  
  const apiPromise = genAI.models.generateContent({
    model: modelName,
    contents: prompt
  });
  
  const response = await Promise.race([apiPromise, timeoutPromise]);
  const text = (response.text || '').trim();
  
  // Parse response
  const parsedResults = parseBatchResponse(text, chunk.length);
  
  if (!parsedResults || parsedResults.length === 0) {
    throw new Error("Failed to parse batch response");
  }
  
  // Map parsed results to chunk indices
  const results = [];
  const parsedMap = new Map();
  
  // Create map of taskNumber -> category
  for (const item of parsedResults) {
    parsedMap.set(item.taskNumber, validateCategory(item.category));
  }
  
  // Map to original chunk indices
  for (let i = 0; i < chunk.length; i++) {
    const item = chunk[i];
    const taskNumber = i + 1;
    const category = parsedMap.get(taskNumber) || "General";
    
    // Cache the result
    const notes = item.task.notes || "";
    const cacheKey = generateCacheKey(notes);
    if (cacheKey) {
      categorizationCache.set(cacheKey, {
        category,
        confidence: null,
        timestamp: Date.now()
      });
    }
    
    results.push({
      index: item.index,
      result: {
        category,
        source: "ai",
        confidence: null
      }
    });
  }
  
  // Update health stats
  healthStats.successfulRequests += chunk.length;
  healthStats.lastSuccessTime = Date.now();
  healthStats.consecutiveFailures = 0;
  healthStats.isHealthy = true;
  
  return results;
};

/**
 * Categorize a chunk of tasks individually (fallback)
 * @param {Array<{index: number, task: Object}>} chunk - Chunk of tasks
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Array<{index: number, result: Object}>>} - Categorized results
 */
const categorizeChunkIndividually = async (chunk, progressCallback = null) => {
  const results = [];
  
  for (let i = 0; i < chunk.length; i++) {
    const item = chunk[i];
    
    try {
      const result = await categorizeTask(item.task.notes || "", true);
      results.push({
        index: item.index,
        result
      });
      
      // Update progress
      if (progressCallback) {
        progressCallback({
          step: 'categorizing',
          currentStep: `Processing task ${i + 1}/${chunk.length} individually...`,
          processedTasks: results.length,
          totalTasks: chunk.length
        });
      }
      
      // Small delay between individual requests
      if (i < chunk.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      // Use default category on error
      results.push({
        index: item.index,
        result: {
          category: "General",
          source: "default",
          confidence: null
        }
      });
    }
  }
  
  return results;
};

/**
 * Combine cached and batch results in correct order
 * @param {Array} cachedResults - Cached results with indices
 * @param {Array} batchResults - Batch results with indices
 * @param {Array} originalTasks - Original tasks array
 * @returns {Array} - Combined results in original order
 */
const combineResults = (cachedResults, batchResults, originalTasks) => {
  // Create map of index -> result
  const resultMap = new Map();
  
  // Add cached results
  for (const item of cachedResults) {
    resultMap.set(item.index, item.result);
  }
  
  // Add batch results
  for (const item of batchResults) {
    resultMap.set(item.index, item.result);
  }
  
  // Build final array in original order
  const results = [];
  let categorizedCount = 0;
  let defaultCount = 0;
  
  for (let i = 0; i < originalTasks.length; i++) {
    const result = resultMap.get(i) || {
      category: "General",
      source: "default",
      confidence: null
    };
    
    results.push(result);
    
    if (result.source === "ai") {
      categorizedCount++;
    } else {
      defaultCount++;
    }
  }
  
  return {
    results,
    categorizedCount,
    defaultCount
  };
};

/**
 * Categorize multiple tasks in batch (Smart Chunked Batching)
 * @param {Array<{notes: string}>} tasks - Array of tasks with notes
 * @param {Function} progressCallback - Optional callback for progress updates (progress, processed, total, step)
 * @returns {Promise<{results: Array, rateLimitHit: boolean, categorizedCount: number, defaultCount: number}>}
 */
const categorizeTasksBatch = async (tasks, progressCallback = null) => {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { results: [], rateLimitHit: false, categorizedCount: 0, defaultCount: 0 };
  }

  // Check if AI categorization is enabled
  const aiEnabled = process.env.ENABLE_AI_CATEGORIZATION !== "false";
  if (!aiEnabled) {
    const defaultResults = tasks.map(() => ({
      category: "General",
      source: "default",
      confidence: null
    }));
    return {
      results: defaultResults,
      rateLimitHit: false,
      categorizedCount: 0,
      defaultCount: tasks.length
    };
  }

  let rateLimitHit = false;
  
  try {
    // Step 1: Separate cached vs uncached tasks
    const { cachedResults, uncachedTasks } = await separateCachedTasks(tasks);
    
    console.log(`[Categorization] Found ${cachedResults.length} cached, ${uncachedTasks.length} uncached tasks`);
    
    // Update progress: cache check complete
    if (progressCallback) {
      progressCallback({
        step: 'categorizing',
        currentStep: `Found ${cachedResults.length} cached, categorizing ${uncachedTasks.length} new tasks...`,
        processedTasks: cachedResults.length,
        totalTasks: tasks.length,
        categorizedTasks: cachedResults.length
      });
    }
    
    // If all tasks are cached, return immediately
    if (uncachedTasks.length === 0) {
      const combined = combineResults(cachedResults, [], tasks);
      return {
        results: combined.results,
        rateLimitHit: false,
        categorizedCount: combined.categorizedCount,
        defaultCount: combined.defaultCount
      };
    }
    
    // Step 2: Create optimal chunks
    const chunks = createOptimalChunks(uncachedTasks, {
      maxChunkSize: 15,
      maxTokens: 2000,
      minChunkSize: 5
    });
    
    console.log(`[Categorization] Processing ${uncachedTasks.length} tasks in ${chunks.length} chunks`);
    
    // Step 3: Process chunks with fallback
    const batchResults = [];
    const DELAY_BETWEEN_CHUNKS = 13000; // 13 seconds between chunks (to stay under 5/min)
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNumber = i + 1;
      
      // Check rate limit before processing chunk
      if (!checkRateLimit()) {
        rateLimitHit = true;
        console.warn(`[Categorization] Rate limit reached at chunk ${chunkNumber}/${chunks.length}`);
        
        if (progressCallback) {
          progressCallback({
            step: 'categorizing',
            currentStep: 'Rate limit reached. Setting remaining tasks to default...',
            processedTasks: cachedResults.length + batchResults.length,
            totalTasks: tasks.length,
            rateLimitHit: true
          });
        }
        
        // Set remaining chunks to default
        for (let j = i; j < chunks.length; j++) {
          const remainingChunk = chunks[j];
          for (const item of remainingChunk) {
            batchResults.push({
              index: item.index,
              result: {
                category: "General",
                source: "default",
                confidence: null
              }
            });
          }
        }
        break;
      }
      
      // Update progress: starting chunk
      if (progressCallback) {
        progressCallback({
          step: 'categorizing',
          currentStep: `Processing chunk ${chunkNumber}/${chunks.length} (${chunk.length} tasks)...`,
          processedTasks: cachedResults.length + batchResults.length,
          totalTasks: tasks.length,
          categorizedTasks: cachedResults.length + batchResults.filter(r => r.result.source === 'ai').length
        });
      }
      
      try {
        // Try batch categorization
        const chunkResults = await categorizeChunkBatch(chunk);
        batchResults.push(...chunkResults);
        
        console.log(`[Categorization] ✓ Chunk ${chunkNumber}/${chunks.length} categorized successfully`);
        
        // Update progress: chunk complete
        if (progressCallback) {
          progressCallback({
            step: 'categorizing',
            currentStep: `Chunk ${chunkNumber}/${chunks.length} complete`,
            processedTasks: cachedResults.length + batchResults.length,
            totalTasks: tasks.length,
            categorizedTasks: cachedResults.length + batchResults.filter(r => r.result.source === 'ai').length
          });
        }
        
      } catch (error) {
        // Check if it's a rate limit error
        const isRateLimit = error.isRateLimit || 
                           error.message?.includes("Rate limit") || 
                           error.message?.includes("quota") ||
                           error.message?.includes("429") ||
                           error.message?.includes("RESOURCE_EXHAUSTED");
        
        if (isRateLimit) {
          rateLimitHit = true;
          console.warn(`[Categorization] Rate limit hit during chunk ${chunkNumber}, setting remaining to default`);
          
          // Set remaining chunks to default
          for (let j = i; j < chunks.length; j++) {
            const remainingChunk = chunks[j];
            for (const item of remainingChunk) {
              batchResults.push({
                index: item.index,
                result: {
                  category: "General",
                  source: "default",
                  confidence: null
                }
              });
            }
          }
          break;
        }
        
        // Fallback: process chunk individually
        console.warn(`[Categorization] Chunk ${chunkNumber} batch failed, using individual: ${error.message}`);
        
        try {
          const individualResults = await categorizeChunkIndividually(chunk, progressCallback);
          batchResults.push(...individualResults);
        } catch (individualError) {
          // Even individual failed, use defaults
          console.error(`[Categorization] Individual categorization also failed for chunk ${chunkNumber}`);
          for (const item of chunk) {
            batchResults.push({
              index: item.index,
              result: {
                category: "General",
                source: "default",
                confidence: null
              }
            });
          }
        }
      }
      
      // Rate limit: wait 13 seconds before next chunk
      if (i < chunks.length - 1 && !rateLimitHit) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
      }
    }
    
    // Step 4: Combine results
    const combined = combineResults(cachedResults, batchResults, tasks);
    
    console.log(`[Categorization] ✓ Completed: ${combined.categorizedCount} categorized, ${combined.defaultCount} defaulted`);
    
    return {
      results: combined.results,
      rateLimitHit,
      categorizedCount: combined.categorizedCount,
      defaultCount: combined.defaultCount
    };
    
  } catch (error) {
    console.error(`[Categorization] Batch categorization error: ${error.message}`);
    
    // Fallback: return all defaults
    const defaultResults = tasks.map(() => ({
      category: "General",
      source: "default",
      confidence: null
    }));
    
    return {
      results: defaultResults,
      rateLimitHit: false,
      categorizedCount: 0,
      defaultCount: tasks.length
    };
  }
};

/**
 * Clear the categorization cache (useful for testing or cache invalidation)
 */
const clearCache = () => {
  categorizationCache.clear();
  console.log("[Categorization] Cache cleared");
};

/**
 * Get cache statistics (for monitoring)
 */
const getCacheStats = () => {
  return {
    size: categorizationCache.size,
    maxSize: 1000,
    ttl: CACHE_TTL
  };
};

/**
 * Get health statistics (for monitoring)
 */
const getHealthStats = () => {
  const successRate = healthStats.totalRequests > 0 
    ? ((healthStats.successfulRequests / healthStats.totalRequests) * 100).toFixed(2)
    : 0;
  
  return {
    ...healthStats,
    successRate: `${successRate}%`,
    workingModel: workingModel || "none",
    cacheHitRate: healthStats.totalRequests > 0
      ? ((healthStats.cacheHits / healthStats.totalRequests) * 100).toFixed(2) + "%"
      : "0%"
  };
};

/**
 * Initialize model discovery on module load (non-blocking)
 * NOTE: This is now LAZY - discovery only happens when first categorization is needed
 * This prevents rate limit issues at server startup
 */
const initializeModelDiscovery = async () => {
  // Lazy initialization: Don't discover at startup
  // Discovery will happen automatically when categorizeTask is first called
  // This prevents hitting rate limits during server startup
  console.log(`[Categorization] Service initialized. Model discovery will happen on first categorization request.`);
};

// Auto-initialize on module load (but don't discover models yet)
if (process.env.ENABLE_AI_CATEGORIZATION !== "false") {
  initializeModelDiscovery();
}

module.exports = {
  categorizeTask,
  categorizeTasksBatch,
  clearCache,
  getCacheStats,
  getHealthStats,
  discoverWorkingModel,
  initializeModelDiscovery,
  CATEGORIES
};
