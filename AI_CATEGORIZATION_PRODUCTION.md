# AI Categorization - Production-Ready Implementation

## ✅ Production Features Implemented

### 1. **Model Discovery & Caching**
- **Automatic model discovery** at server startup
- **Cached working model** to avoid repeated API calls
- **Automatic re-discovery** if current model fails
- **Periodic validation** (every 5 minutes)
- **Fallback mechanism** if no models work

### 2. **Graceful Degradation**
- System continues working even if AI fails
- Falls back to "General" category automatically
- No user-facing errors
- Service remains available during API outages

### 3. **Health Monitoring**
- Real-time health statistics
- Success/failure rate tracking
- Cache hit rate monitoring
- Consecutive failure tracking
- Health status endpoint: `GET /api/categorization/health`

### 4. **Error Handling & Retry Logic**
- **Exponential backoff** for retries
- **Smart retry** (only for recoverable errors)
- **Model re-discovery** on "not found" errors
- **Timeout protection** (5 seconds per request)
- **Rate limit handling**

### 5. **Performance Optimizations**
- **Aggressive caching** (24-hour TTL)
- **Batch processing** with rate limit respect
- **Request staggering** (200ms between requests)
- **Cache size management** (auto-cleanup at 1000 entries)

### 6. **Production Logging**
- Detailed logging for debugging
- Production-safe (no sensitive data)
- Error tracking with context
- Performance metrics

---

## 🔧 Configuration

### Environment Variables

```env
# Required
GEMINI_API_KEY=your_api_key_here

# Optional
ENABLE_AI_CATEGORIZATION=true  # Set to "false" to disable AI
NODE_ENV=production            # Controls logging verbosity
```

### Model Priority Order

The service tries models in this order:
1. `gemini-pro` (most stable)
2. `gemini-1.5-pro`
3. `gemini-1.5-flash`
4. `gemini-1.5-flash-latest`

---

## 📊 Health Monitoring

### Health Check Endpoint

```bash
GET /api/categorization/health
Authorization: Bearer <token>
```

**Response:**
```json
{
  "service": "AI Categorization",
  "status": "healthy",
  "health": {
    "totalRequests": 150,
    "successfulRequests": 145,
    "failedRequests": 5,
    "cacheHits": 50,
    "successRate": "96.67%",
    "cacheHitRate": "33.33%",
    "workingModel": "gemini-pro",
    "isHealthy": true,
    "consecutiveFailures": 0,
    "lastSuccessTime": "2024-01-15T10:30:00.000Z",
    "lastFailureTime": "2024-01-15T10:25:00.000Z"
  },
  "cache": {
    "size": 120,
    "maxSize": 1000,
    "ttl": 86400000
  },
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

### Force Model Re-discovery

```bash
POST /api/categorization/rediscover
Authorization: Bearer <admin_token>
```

Useful when:
- API key permissions change
- Models become unavailable
- Troubleshooting categorization issues

---

## 🚀 How It Works

### Startup Sequence

1. **Server starts** → Waits 2 seconds
2. **Model discovery** → Tests each model sequentially
3. **Caches working model** → Uses it for all requests
4. **Ready to serve** → Accepts categorization requests

### Request Flow

```
User Request
    ↓
Check Cache → Hit? → Return cached result
    ↓ Miss
Check Rate Limit → Exceeded? → Return default
    ↓ OK
Get Working Model → None? → Return default
    ↓ Found
Call Gemini API → Success? → Cache & return
    ↓ Error
Retry (max 2x) → Still error? → Return default
```

### Model Re-discovery Triggers

- **Automatic**: Every 5 minutes
- **On error**: When model returns "not found"
- **Manual**: Via `/api/categorization/rediscover` endpoint
- **After failures**: After 5 consecutive failures

---

## 📈 Performance Metrics

### Rate Limiting
- **Max requests**: 15 per minute (Gemini free tier)
- **Batch size**: 5 tasks per batch
- **Request delay**: 200ms between requests
- **Batch delay**: 1 second between batches

### Caching
- **TTL**: 24 hours
- **Max size**: 1000 entries
- **Cleanup**: Removes oldest 200 when full
- **Hit rate**: Typically 30-50% in production

### Timeouts
- **API call**: 5 seconds
- **Model test**: 3 seconds
- **Graceful**: Returns default on timeout

---

## 🛡️ Error Handling

### Error Types & Responses

| Error Type | Action | User Impact |
|------------|--------|-------------|
| Model not found | Re-discover model | None (uses default) |
| Rate limit | Wait & retry | None (uses default) |
| Timeout | Return default | None (uses default) |
| API key invalid | Log error | None (uses default) |
| Network error | Retry with backoff | None (uses default) |

### Graceful Degradation

**All errors result in:**
- ✅ Task gets "General" category
- ✅ Task is saved successfully
- ✅ No user-facing error
- ✅ System continues working
- ✅ Error logged for monitoring

---

## 🔍 Monitoring & Debugging

### Log Messages

**Success:**
```
[Categorization] ✓ Discovered working model: gemini-pro
[Categorization] Successfully categorized as: Support (model: gemini-pro)
[Categorization] Cache hit for task notes
```

**Warnings:**
```
[Categorization] Rate limit exceeded, using default category
[Categorization] Model gemini-pro not available, trying next...
[Categorization] No working model available, using default category
```

**Errors:**
```
[Categorization] ✗ No working model found after testing 4 models
[Categorization] Error categorizing task: [error message]
```

### Health Indicators

- **Healthy**: `isHealthy: true`, `consecutiveFailures: 0`
- **Degraded**: `isHealthy: false`, `consecutiveFailures: 1-4`
- **Unhealthy**: `isHealthy: false`, `consecutiveFailures: >= 5`

---

## 🧪 Testing

### Manual Testing

1. **Check health status:**
   ```bash
   curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/categorization/health
   ```

2. **Force model re-discovery:**
   ```bash
   curl -X POST -H "Authorization: Bearer <admin_token>" \
     http://localhost:5000/api/categorization/rediscover
   ```

3. **Upload CSV** and verify categorization works

4. **Check logs** for model discovery messages

### Expected Behavior

- ✅ Server starts → Model discovered within 2-5 seconds
- ✅ Upload CSV → Tasks categorized automatically
- ✅ Check health → Shows working model and stats
- ✅ AI fails → Tasks still saved with "General" category
- ✅ No user errors → System always works

---

## 🎯 Production Checklist

- [x] Model discovery at startup
- [x] Graceful degradation
- [x] Health monitoring
- [x] Error handling with retries
- [x] Rate limiting
- [x] Caching strategy
- [x] Timeout protection
- [x] Production logging
- [x] Health check endpoint
- [x] Manual re-discovery endpoint

---

## 📝 Notes

### API Key Requirements

- Must have access to Gemini API
- Free tier: 15 requests/minute
- Get key from: https://aistudio.google.com/apikey

### Model Availability

- Models may vary by region
- Some models may require paid tier
- Service automatically finds available model

### Cost Optimization

- Caching reduces API calls by 30-50%
- Batch processing respects rate limits
- Feature can be disabled via env variable

---

## 🚨 Troubleshooting

### Issue: No working model found

**Solution:**
1. Check API key is valid
2. Verify API key has Gemini access
3. Check network connectivity
4. Try manual re-discovery endpoint
5. Check server logs for details

### Issue: High failure rate

**Solution:**
1. Check rate limits (15/min)
2. Verify API key quota
3. Check health endpoint
4. Review error logs
5. Consider upgrading API tier

### Issue: Slow categorization

**Solution:**
1. Check cache hit rate (should be 30%+)
2. Verify batch processing is working
3. Check network latency
4. Review rate limit delays

---

## ✅ Success Criteria

- ✅ System works even if AI fails
- ✅ No user-facing errors
- ✅ Automatic model discovery
- ✅ Health monitoring available
- ✅ Production-ready logging
- ✅ Cost-efficient (caching + rate limiting)

---

**Status**: ✅ Production Ready
**Last Updated**: 2024-01-15
**Version**: 2.0.0

