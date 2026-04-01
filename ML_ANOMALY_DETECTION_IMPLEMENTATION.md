# Behavioral Machine Learning Anomaly Detection

**Issue #878: ML-Based Behavioral Anomaly Detection Implementation**

---

## 🎯 Executive Summary

This implementation adds **unsupervised machine learning-based anomaly detection** to the ExpenseFlow security framework. Using Isolation Forests and Autoencoders, the system learns normal user behavior patterns and detects subtle anomalies not caught by traditional rule-based systems.

### Key Capabilities
- ✅ **Dual Model Ensemble** - Isolation Forest + Autoencoder for robust detection
- ✅ **Streaming Predictions** - Real-time per-request anomaly scoring
- ✅ **Batch Retraining** - Hourly drift detection + daily model updates
- ✅ **Feature Engineering** - 59 temporal, statistical, and graph-based features
- ✅ **Explainability** - SHAP-like feature attribution for each prediction
- ✅ **Drift Detection** - Automatic model retraining when distribution shift detected
- ✅ **Performance Tracking** - Comprehensive metrics and false positive monitoring

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│        Behavioral ML Anomaly Detection System               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 1. Request Interception                            │    │
│  │    - mlAnomalyCheck middleware                     │    │
│  │    - Collect request context                       │    │
│  └────────────────────────────────────────────────────┘    │
│                     ▼                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 2. Feature Engineering                             │    │
│  │    - Extract 59 features from behavioral signals   │    │
│  │    - Temporal: request patterns, time analysis     │    │
│  │    - Statistical: risk scores, distributions       │    │
│  │    - Sequence: action patterns, trends             │    │
│  │    - Context: endpoint sensitivity, timing         │    │
│  │    - Graph: session relationships, device data     │    │
│  └────────────────────────────────────────────────────┘    │
│                     ▼                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 3. Model Prediction (Ensemble)                     │    │
│  │    - Isolation Forest: 60% weight                  │    │
│  │    - Autoencoder: 40% weight                       │    │
│  │    - Composite anomaly score [0-1]                 │    │
│  └────────────────────────────────────────────────────┘    │
│                     ▼                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 4. Explainability Analysis                         │    │
│  │    - Feature contribution scores                   │    │
│  │    - Top 5 contributing factors                    │    │
│  │    - Human-readable explanation                    │    │
│  │    - Confidence assessment                         │    │
│  └────────────────────────────────────────────────────┘    │
│                     ▼                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 5. Action Decision                                 │    │
│  │    - Score ≥ 0.9: BLOCK (revoke session)          │    │
│  │    - Score ≥ 0.8: REQUIRE_2FA                     │    │
│  │    - Score ≥ 0.7: CHALLENGE                       │    │
│  │    - Score ≥ 0.65: MONITOR                        │    │
│  │    - Score < 0.65: ALLOW                          │    │
│  └────────────────────────────────────────────────────┘    │
│                     ▼                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 6. Drift Detection & Retraining                    │    │
│  │    - Hourly: Check distribution drift              │    │
│  │    - Daily: Forced model retraining                │    │
│  │    - On-Drift: Automatic retrain trigger           │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔧 Components

### 1. ML Anomaly Detection Service
**File**: `services/mlAnomalyDetectionService.js`

Core orchestrator managing model lifecycle and predictions.

**Key Methods**:
- `initialize()` - Load or train initial models
- `predictStreaming(sessionId, userId, context)` - Real-time prediction
- `predictBatch(sessionIds, userIds)` - Batch analysis
- `trainModels(forceRetrain)` - Train on historical data
- `checkDriftAndRetrain()` - Drift detection and auto-retrain
- `getModelPerformance(timeWindow)` - Performance metrics

### 2. Feature Engineering Pipeline
**File**: `utils/ml/featureEngineer.js`

Extracts 59 features across 5 categories:

#### Temporal Features (15)
- Request rates (short/medium/long windows)
- Rate acceleration
- Time since last activity
- Hour/day cyclical encoding
- Inter-arrival time statistics

#### Statistical Features (16)
- Signal type distribution
- Risk score statistics (mean, std, min, max, median)
- Anomaly frequency
- Severity distribution

#### Distribution Features (7)
- Endpoint/IP/UA/location diversity
- Behavioral entropy
- Request burst detection
- Time-of-day diversity

#### Sequence Features (10)
- N-gram patterns (bigrams, trigrams)
- Sequence regularity
- Risk trajectory trends
- Cyclic pattern detection
- State transition frequency
- Predictability score

#### Context Features (6)
- Endpoint sensitivity level
- HTTP method encoding
- Request size
- Session age
- Weekend/business hours flags

#### Graph Features (6)
- Session count (24h)
- Concurrent sessions
- Average session duration
- Session switching rate
- Device diversity
- IP diversity (7 days)

### 3. Isolation Forest
**File**: `utils/ml/isolationForest.js`

Implementation of the Isolation Forest algorithm for anomaly detection.

**Configuration**:
- Trees: 100
- Sample size: 256
- Max depth: 12
- Contamination: 5%

**How it works**:
- Builds ensemble of Random Trees
- Anomalies isolated faster (shorter path length)
- Returns normalized anomaly score [0-1]

### 4. Autoencoder
**File**: `utils/ml/autoencoder.js`

Neural network-based reconstruction error for anomaly detection.

**Architecture**:
- Input layer: 59 dimensions (features)
- Encoding layer: 16 dimensions (compressed representation)
- Output layer: 59 dimensions (reconstruction)

**Training**:
- Epochs: 50
- Batch size: 32
- Learning rate: 0.001
- Validation split: 20%

**Anomaly Detection**:
- High reconstruction error = anomaly
- Normalized to [0-1] range

### 5. Model Explainer
**File**: `utils/ml/modelExplainer.js`

Provides interpretability for ML predictions.

**Features**:
- Feature contribution analysis
- Top 10 influential features
- Human-readable explanations
- Model agreement scoring
- Confidence factor identification

**Output Example**:
```
🚨 HIGH ANOMALY DETECTED - This behavior is highly unusual.
Both detection models strongly agree (92% agreement).

Key factors:
1. recent request rate (23.4% contribution)
   Value: 8.234
2. session switching rate (18.7% contribution)
   Value: 5.120
3. IP address diversity (15.3% contribution)
   Value: 3.000
```

### 6. Drift Detector
**File**: `utils/ml/driftDetector.js`

Monitors data distribution changes to trigger retraining.

**Metrics**:
- **PSI (Population Stability Index)**: Distribution shift detection
- **KS Statistic**: Kolmogorov-Smirnov test for distribution difference
- **Distribution Drift**: Feature-level statistical comparison
- **Score Drift**: Change in prediction distribution

**Thresholds**:
- Drift score > 15% triggers automatic retraining
- Confidence levels: HIGH/MEDIUM/LOW based on data volume

### 7. Middleware Integration
**File**: `middleware/mlAnomalyDetection.js`

Express middleware for request-level anomaly detection.

**Modes**:
- `mlAnomalyCheck`: Standard mode with graduated responses
- `strictMLCheck`: High-security mode (block anomalies > 0.7)

**Actions**:
- `ALLOW`: Normal operation
- `MONITOR`: Enhanced logging
- `CHALLENGE`: Require additional verification
- `REQUIRE_2FA`: Mandate 2FA verification
- `BLOCK`: Revoke session immediately

---

## 🚀 Setup & Configuration

### 1. Initialize the System

```javascript
// In server.js or startup script
const mlAnomalyDetectionService = require('./services/mlAnomalyDetectionService');

// Initialize ML system on startup
await mlAnomalyDetectionService.initialize();
```

### 2. Apply Middleware

```javascript
const { mlAnomalyCheck, strictMLCheck } = require('./middleware/mlAnomalyDetection');

// Standard protection for all authenticated routes
app.use('/api', auth, mlAnomalyCheck);

// Strict mode for high-security endpoints
app.use('/api/admin', auth, strictMLCheck);
app.use('/api/financial/export', auth, strictMLCheck);
```

### 3. Add API Routes

```javascript
const mlAnomalyRoutes = require('./routes/mlAnomaly');
app.use('/api/ml-anomaly', mlAnomalyRoutes);
```

---

## 📡 API Endpoints

### Admin Endpoints

#### GET /api/ml-anomaly/status
Get current ML model status and performance.

**Response**:
```json
{
  "success": true,
  "performance": {
    "totalPredictions": 15234,
    "anomalyCount": 342,
    "averageAnomalyScore": 0.234,
    "averageConfidence": 0.876,
    "driftMetrics": { "isDrifting": false, "driftScore": 0.08 }
  },
  "isRetraining": false,
  "lastRetrainingTime": "2026-03-01T08:00:00Z"
}
```

#### POST /api/ml-anomaly/retrain
Force immediate model retraining.

#### GET /api/ml-anomaly/models/history
View model version history.

#### GET /api/ml-anomaly/drift/status
Get drift detection status.

#### GET /api/ml-anomaly/performance
Detailed performance metrics.

#### GET /api/ml-anomaly/false-positives
Review false positive reports.

### User Endpoints

#### GET /api/ml-anomaly/predictions/recent
Get recent anomaly predictions for current user.

**Query Parameters**:
- `hours` (default: 24) - Time window in hours

#### GET /api/ml-anomaly/predictions/:predictionId
Get detailed prediction information.

#### POST /api/ml-anomaly/predictions/:predictionId/feedback
Submit feedback on prediction accuracy.

**Request Body**:
```json
{
  "isFalsePositive": true,
  "notes": "This was normal behavior from my home location"
}
```

#### GET /api/ml-anomaly/statistics
Get anomaly statistics over time.

---

## 🔄 Training & Retraining

### Initial Training

```bash
# After system deployment, trigger initial training
curl -X POST http://localhost:5000/api/ml-anomaly/initialize \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Requirements**:
- Minimum 1,000 behavioral signal samples
- Signals from last 30 days
- Diverse user activity patterns

**Duration**: 5-15 minutes depending on data volume

### Automatic Retraining

The system automatically retrains in two scenarios:

1. **Hourly Drift Check**
   - Calculates drift score every hour
   - Triggers retrain if drift > 15%

2. **Daily Forced Retrain**
   - Scheduled at midnight
   - Ensures models stay current
   - Uses rolling 30-day window

### Manual Retraining

```bash
curl -X POST http://localhost:5000/api/ml-anomaly/retrain \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 📊 Feature Contribution Analysis

Each prediction includes explainability showing which features contributed most to the anomaly score:

```json
{
  "topFeatures": [
    {
      "feature": "recent_request_rate",
      "contribution": 0.234,
      "value": 8.234,
      "normalizedValue": "8.234"
    },
    {
      "feature": "session_switch_rate",
      "contribution": 0.187,
      "value": 5.120,
      "normalizedValue": "5.120"
    }
  ],
  "explanation": "HIGH anomaly driven by recent request rate",
  "modelAgreement": 0.92,
  "confidence": 0.88
}
```

---

## 🎯 Performance Metrics

### Model Performance

```bash
GET /api/ml-anomaly/performance?hours=24
```

**Metrics Tracked**:
- Total predictions
- Anomaly detection rate
- Average anomaly score
- Average confidence
- Processing time (ms)
- False positive rate
- Model agreement score

### Drift Monitoring

```bash
GET /api/ml-anomaly/drift/status
```

**Drift Metrics**:
- PSI score
- KS statistic
- Distribution drift
- Score drift
- Trend analysis (increasing/decreasing/stable)

---

## 🔐 Security Considerations

### Graduated Response System

The ML system integrates with existing security layers:

1. **Score 0.90+** (Critical)
   - Immediate session revocation
   - Block request
   - Trigger security incident
   - Notify security team

2. **Score 0.80-0.89** (High)
   - Require 2FA verification
   - Enhanced monitoring
   - Log security event

3. **Score 0.70-0.79** (Moderate)
   - Issue challenge (email/SMS)
   - Continue with monitoring
   - Log event

4. **Score 0.65-0.69** (Low)
   - Monitor only
   - No user friction
   - Statistical logging

5. **Score < 0.65** (Normal)
   - Allow normally
   - Standard logging

### False Positive Management

Users can report false positives:

```bash
POST /api/ml-anomaly/predictions/:id/feedback
{
  "isFalsePositive": true,
  "notes": "Working from new office location"
}
```

Feedback is tracked and used to:
- Adjust detection thresholds
- Improve feature engineering
- Retrain with labeled data

---

## 🧪 Testing

### 1. Verify Initialization

```javascript
const mlService = require('./services/mlAnomalyDetectionService');
const initialized = await mlService.initialize();
console.log('ML System Initialized:', initialized);
```

### 2. Test Streaming Prediction

```javascript
const prediction = await mlService.predictStreaming(
  sessionId,
  userId,
  {
    endpoint: '/api/transactions',
    method: 'POST',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...'
  }
);

console.log('Anomaly Score:', prediction.anomalyScore);
console.log('Action:', prediction.action);
```

### 3. Check Model Performance

```bash
curl http://localhost:5000/api/ml-anomaly/status \
  -H "Authorization: Bearer TOKEN"
```

---

## 📈 Monitoring Dashboard Integration

### Key Metrics to Display

1. **Real-time Anomaly Rate**
   - Last hour/day/week
   - Trend visualization

2. **Model Health**
   - Current drift score
   - Last training date
   - Active model version

3. **User Anomaly Profile**
   - Personal anomaly history
   - Risk score trend
   - Recent alerts

4. **Detection Quality**
   - False positive rate
   - User feedback statistics
   - Model agreement scores

---

## 🔧 Configuration Options

### Model Configuration

```javascript
// In mlAnomalyDetectionService.js
modelConfig: {
  isolationForest: {
    nTrees: 100,              // Number of trees
    sampleSize: 256,          // Samples per tree
    maxTreeDepth: 12,         // Max tree depth
    contamination: 0.05       // Expected anomaly rate
  },
  autoencoder: {
    encodingDim: 16,          // Compressed dimension
    learningRate: 0.001,      // Training rate
    epochs: 50,               // Training iterations
    batchSize: 32            // Batch size
  },
  retraining: {
    minSamplesForTraining: 1000,
    hourlyRetrainThreshold: 0.15,
    dailyRetrainForced: true,
    modelWindowDays: 30
  },
  prediction: {
    ensembleWeight: {
      isolationForest: 0.6,
      autoencoder: 0.4
    },
    anomalyThreshold: 0.65
  }
}
```

---

## 🐛 Troubleshooting

### Models Not Training

**Symptoms**: "Insufficient training data" error

**Solutions**:
1. Ensure ≥1,000 behavioral signals exist
2. Wait for more user activity
3. Lower `minSamplesForTraining` (not recommended)

### High False Positive Rate

**Symptoms**: Many normal actions flagged as anomalies

**Solutions**:
1. Increase `anomalyThreshold` (e.g., 0.70)
2. Adjust ensemble weights
3. Review and improve feature engineering
4. Retrain with more diverse data

### Drift Not Detected

**Symptoms**: Models become stale

**Solutions**:
1. Lower `hourlyRetrainThreshold` (e.g., 0.10)
2. Verify drift detector is collecting data
3. Force manual retraining
4. Check drift statistics endpoint

### Slow Predictions

**Symptoms**: High latency on requests

**Solutions**:
1. Reduce number of Isolation Forest trees
2. Optimize feature extraction queries
3. Add database indexes
4. Consider async prediction with caching

---

## 📝 Database Models

### MLAnomalyModel
Stores trained model parameters and metadata.

**Key Fields**:
- `version` - Model version number
- `isolationForestParams` - Serialized IF model
- `autoencoderParams` - Serialized AE model
- `featureConfig` - Feature engineering config
- `trainingMetrics` - Training performance
- `isActive` - Currently active model

### MLPrediction
Stores individual predictions and explanations.

**Key Fields**:
- `sessionId` - Associated session
- `userId` - User being evaluated
- `compositeScore` - Final anomaly score
- `isAnomaly` - Boolean: is this anomalous?
- `explanation` - Feature contributions
- `userFeedback` - False positive reports

---

## 🎓 Best Practices

1. **Monitor Drift Regularly**
   - Check drift status daily
   - Review retraining logs
   - Verify model versions

2. **Collect User Feedback**
   - Make feedback easy to submit
   - Review false positives weekly
   - Use feedback to improve models

3. **Tune Thresholds**
   - Start conservative (higher thresholds)
   - Gradually adjust based on false positive rate
   - Different thresholds for different endpoints

4. **Feature Engineering**
   - Review top contributing features
   - Add domain-specific features
   - Remove low-value features

5. **Ensemble Weights**
   - Adjust based on model agreement
   - Higher weight to more stable model
   - Re-evaluate after major changes

---

## 🚀 Future Enhancements

1. **Deep Learning Models**
   - LSTM for sequence modeling
   - Attention mechanisms
   - Transfer learning

2. **Active Learning**
   - Use feedback to label data
   - Semi-supervised training
   - Continuous improvement loop

3. **Multi-User Modeling**
   - User-specific baselines
   - Peer group comparisons
   - Collaborative filtering

4. **Real-time Feature Updates**
   - Streaming feature computation
   - Incremental model updates
   - Online learning

---

## 📚 References

- **Isolation Forest**: Liu, F. T., Ting, K. M., & Zhou, Z. H. (2008). Isolation forest. ICDM.
- **Autoencoders**: Goodfellow, I., Bengio, Y., & Courville, A. (2016). Deep Learning.
- **Drift Detection**: Gama, J., et al. (2014). A survey on concept drift adaptation.

---

## ✅ Implementation Checklist

- [x] ML Anomaly Detection Service
- [x] Feature Engineering Pipeline (59 features)
- [x] Isolation Forest Implementation
- [x] Autoencoder Implementation
- [x] Model Explainer (SHAP-like)
- [x] Drift Detector (PSI, KS, Distribution)
- [x] Streaming Prediction Middleware
- [x] Batch Retraining System
- [x] MongoDB Models (MLAnomalyModel, MLPrediction)
- [x] API Routes (Admin + User endpoints)
- [x] Performance Tracking
- [x] Documentation

---

**Status**: ✅ **IMPLEMENTATION COMPLETE**

**Issue #878**: Behavioral Machine Learning Anomaly Detection - Fully Implemented

All components operational and ready for deployment.
