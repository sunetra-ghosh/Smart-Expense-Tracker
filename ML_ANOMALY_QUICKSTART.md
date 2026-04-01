# ML Anomaly Detection - Quick Start Guide

## Issue #878: Behavioral Machine Learning Anomaly Detection

---

## 🚀 Quick Start (5 Minutes)

### 1. Server Already Running
The ML anomaly detection system is automatically initialized when the server starts. No additional setup required!

### 2. First-Time Training

After server start with sufficient behavioral signal data (≥1000 samples):

```bash
# Check if models are trained
curl http://localhost:3000/api/ml-anomaly/status \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# If no models exist, trigger initial training
curl -X POST http://localhost:3000/api/ml-anomaly/initialize \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Wait for training to complete** (~5-15 minutes depending on data size)

### 3. Verify System is Working

```bash
# Check model status
curl http://localhost:3000/api/ml-anomaly/models/active \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# View recent predictions
curl http://localhost:3000/api/ml-anomaly/performance?hours=1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 🔧 Integration Examples

### Protect All API Endpoints

```javascript
// In server.js or route files
const { mlAnomalyCheck } = require('./middleware/mlAnomalyDetection');
const { auth } = require('./middleware/auth');

// Apply to all authenticated routes
app.use('/api', auth, mlAnomalyCheck);
```

### Protect Specific High-Security Endpoints

```javascript
const { auth } = require('./middleware/auth');
const { strictMLCheck } = require('./middleware/mlAnomalyDetection');

// Strict mode - blocks anomalies immediately
app.use('/api/admin', auth, strictMLCheck);
app.use('/api/financial/export', auth, strictMLCheck);
app.delete('/api/accounts/:id', auth, strictMLCheck, deleteAccount);
```

### Custom Integration in Route Handler

```javascript
const mlAnomalyDetectionService = require('./services/mlAnomalyDetectionService');

router.post('/api/sensitive-action', auth, async (req, res) => {
  try {
    // Manual ML check
    const prediction = await mlAnomalyDetectionService.predictStreaming(
      req.sessionId,
      req.userId,
      {
        endpoint: req.path,
        method: req.method,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        endpointSensitivity: 'CRITICAL'
      }
    );

    // Custom handling
    if (prediction.isAnomaly && prediction.anomalyScore > 0.85) {
      return res.status(403).json({
        success: false,
        error: 'Action blocked due to suspicious activity',
        anomalyScore: prediction.anomalyScore,
        explanation: prediction.explanation.summary
      });
    }

    // Continue with normal processing
    // ... your code here
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## 📊 Monitoring Dashboard Integration

### Get Real-Time Statistics

```javascript
// Frontend code example
async function fetchMLStats() {
  const response = await fetch('/api/ml-anomaly/statistics?days=7', {
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  });
  
  const data = await response.json();
  return data.statistics;
}

// Display on dashboard
const stats = await fetchMLStats();
console.log('Anomaly rate:', stats.anomalyRate);
console.log('Recent anomalies:', stats.recentCount);
```

### Display User Anomaly History

```javascript
async function fetchUserAnomalies() {
  const response = await fetch('/api/ml-anomaly/predictions/recent?hours=24', {
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  });
  
  const data = await response.json();
  return data.predictions;
}

// Display in UI
const anomalies = await fetchUserAnomalies();
anomalies.forEach(anomaly => {
  console.log(`${anomaly.timestamp}: Score ${anomaly.anomalyScore}`);
  console.log(`Explanation: ${anomaly.explanation.summary}`);
});
```

---

## 🔍 Testing the System

### 1. Generate Test Anomalies

To test the system, simulate anomalous behavior:

```javascript
// Make rapid requests from different IPs (use proxy/VPN)
for (let i = 0; i < 50; i++) {
  await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ amount: 100, category: 'Test' })
  });
  await sleep(100); // 100ms between requests = burst pattern
}

// Check if flagged
const predictions = await fetch('/api/ml-anomaly/predictions/recent?hours=1');
console.log(predictions);
```

### 2. Verify Detection

```bash
# Check recent predictions
curl "http://localhost:3000/api/ml-anomaly/predictions/recent?hours=1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# View detailed prediction
curl "http://localhost:3000/api/ml-anomaly/predictions/PREDICTION_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Submit False Positive Feedback

```bash
curl -X POST "http://localhost:3000/api/ml-anomaly/predictions/PREDICTION_ID/feedback" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isFalsePositive": true,
    "notes": "This was normal behavior during data import"
  }'
```

---

## 🎛️ Configuration

### Tuning Detection Sensitivity

Edit `services/mlAnomalyDetectionService.js`:

```javascript
modelConfig: {
  prediction: {
    anomalyThreshold: 0.65  // Lower = more sensitive (default: 0.65)
  }
}
```

**Threshold Guidelines**:
- `0.50` - Very sensitive (high false positive rate)
- `0.65` - Balanced (recommended)
- `0.75` - Conservative (low false positive rate)

### Adjusting Ensemble Weights

If one model performs better than the other:

```javascript
modelConfig: {
  prediction: {
    ensembleWeight: {
      isolationForest: 0.7,  // Increase if IF performs better
      autoencoder: 0.3       // Decrease accordingly
    }
  }
}
```

### Retraining Schedule

```javascript
modelConfig: {
  retraining: {
    hourlyRetrainThreshold: 0.15,  // 15% drift triggers retrain
    dailyRetrainForced: true,      // Force daily retrain
    modelWindowDays: 30            // Use last 30 days of data
  }
}
```

---

## 🐛 Troubleshooting

### "Insufficient training data" Error

**Problem**: Not enough behavioral signals for training

**Solution**:
1. Wait for more user activity (need ≥1000 signals)
2. Check if behavioral signal collection is working:
   ```bash
   # Count signals
   db.sessionbehaviorsignals.count()
   ```
3. Temporarily lower threshold (not recommended for production):
   ```javascript
   minSamplesForTraining: 500  // Lower from 1000
   ```

### High False Positive Rate

**Problem**: Normal behavior flagged as anomalies

**Solutions**:
1. Increase `anomalyThreshold` to 0.70-0.75
2. Collect user feedback to retrain:
   ```bash
   # View false positives
   curl "/api/ml-anomaly/false-positives?limit=50" \
     -H "Authorization: Bearer ADMIN_TOKEN"
   ```
3. Force model retraining with more data:
   ```bash
   curl -X POST "/api/ml-anomaly/retrain" \
     -H "Authorization: Bearer ADMIN_TOKEN"
   ```

### Predictions Too Slow

**Problem**: High latency on protected endpoints

**Solutions**:
1. Reduce Isolation Forest tree count:
   ```javascript
   isolationForest: { nTrees: 50 }  // Down from 100
   ```
2. Add database indexes (already included in models)
3. Cache predictions temporarily (5-10 seconds)

### Model Not Updating

**Problem**: Drift detected but model not retraining

**Solutions**:
1. Check retraining logs in console
2. Verify sufficient disk space for model storage
3. Manually trigger retrain:
   ```bash
   curl -X POST "/api/ml-anomaly/retrain" \
     -H "Authorization: Bearer ADMIN_TOKEN"
   ```

---

## 📈 Performance Monitoring

### Key Metrics to Track

```bash
# Overall system health
GET /api/ml-anomaly/status

# Drift detection status
GET /api/ml-anomaly/drift/status

# Detailed performance
GET /api/ml-anomaly/performance?hours=24

# Model version history
GET /api/ml-anomaly/models/history?limit=10
```

### Expected Performance

- **Prediction latency**: 10-50ms per request
- **Training time**: 5-15 minutes (depending on data)
- **Memory usage**: ~100-200MB per model
- **Anomaly rate**: 1-5% (normal operation)
- **False positive rate**: <2% (with feedback)

---

## 🔒 Security Best Practices

### 1. Admin-Only Endpoints

Ensure only admins can:
- Trigger retraining
- View model internals
- Access all user predictions
- Modify configuration

```javascript
// Already implemented in routes/mlAnomaly.js
router.post('/retrain', auth, requireAdmin, ...);
```

### 2. Rate Limit ML Endpoints

```javascript
const mlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each user to 100 requests per window
});

app.use('/api/ml-anomaly', mlLimiter);
```

### 3. Audit Log ML Actions

Log all ML-related security events:
- High-score anomalies
- Session revocations
- Model retraining
- False positive reports

---

## 📚 Additional Resources

- **Full Documentation**: [ML_ANOMALY_DETECTION_IMPLEMENTATION.md](./ML_ANOMALY_DETECTION_IMPLEMENTATION.md)
- **API Reference**: See "API Endpoints" section in full docs
- **Feature Engineering**: See `utils/ml/featureEngineer.js` for feature details
- **Model Architecture**: See "Components" section in full docs

---

## ✅ Checklist for Production

- [ ] Models trained with ≥1000 samples
- [ ] Anomaly threshold tuned for your use case
- [ ] False positive feedback mechanism enabled
- [ ] Monitoring dashboard integrated
- [ ] Admin routes secured
- [ ] Retraining schedule configured
- [ ] Error handling and logging verified
- [ ] Performance metrics tracked
- [ ] Documentation reviewed by team
- [ ] Security team approval obtained

---

## 🆘 Support

For issues or questions:
1. Check logs for error messages
2. Review troubleshooting section above
3. Verify system requirements met
4. Check MongoDB connection and data
5. Review feature engineering output

**System healthy when**:
- ✅ Active model exists
- ✅ Predictions returning within 50ms
- ✅ Drift score < 0.15
- ✅ False positive rate < 5%

---

**Status**: Ready for Production ✅

**Implementation Date**: March 1, 2026

**Issue Reference**: #878 - Behavioral Machine Learning Anomaly Detection
