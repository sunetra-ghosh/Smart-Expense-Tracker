/**
 * ML Prediction Schema
 * Issue #878: Behavioral ML Anomaly Detection
 * 
 * Stores ML anomaly detection predictions and explanations
 */

const mongoose = require('mongoose');

const mlPredictionSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Feature vector used for prediction
  features: [{
    type: Number
  }],
  
  // Model scores
  isolationForestScore: {
    type: Number,
    required: true
  },
  
  autoencoderScore: {
    type: Number,
    required: true
  },
  
  compositeScore: {
    type: Number,
    required: true,
    index: true
  },
  
  // Prediction result
  isAnomaly: {
    type: Boolean,
    required: true,
    index: true
  },
  
  confidence: {
    type: Number,
    required: true
  },
  
  // Explainability data
  explanation: {
    topFeatures: [{
      feature: String,
      contribution: Number,
      value: Number,
      normalizedValue: String
    }],
    explanation: String,
    modelAgreement: Number,
    confidenceFactors: [{
      factor: String,
      description: String,
      impact: String
    }],
    summary: String
  },
  
  // Request context
  requestContext: {
    endpoint: String,
    method: String,
    ipAddress: String,
    userAgent: String,
    location: {
      lat: Number,
      lon: Number
    },
    endpointSensitivity: String
  },
  
  // Model version information
  modelVersion: {
    isolationForest: String,
    autoencoder: String
  },
  
  // Recommended action
  recommendedAction: {
    type: String,
    enum: ['ALLOW', 'MONITOR', 'CHALLENGE', 'REQUIRE_2FA', 'BLOCK'],
    default: 'ALLOW'
  },
  
  // Action taken
  actionTaken: {
    type: String,
    enum: ['ALLOW', 'MONITOR', 'CHALLENGE', 'REQUIRE_2FA', 'BLOCK', 'NONE'],
    default: 'NONE'
  },
  
  // User feedback (for model improvement)
  userFeedback: {
    isFalsePositive: Boolean,
    isFalseNegative: Boolean,
    notes: String,
    submittedAt: Date
  },
  
  // Processing details
  processingTime: Number, // milliseconds
  fallback: Boolean, // true if fallback prediction used
  error: String
  
}, {
  timestamps: true
});

// Indexes
mlPredictionSchema.index({ timestamp: -1, isAnomaly: 1 });
mlPredictionSchema.index({ userId: 1, timestamp: -1 });
mlPredictionSchema.index({ sessionId: 1, timestamp: -1 });
mlPredictionSchema.index({ compositeScore: -1 });
mlPredictionSchema.index({ 'userFeedback.isFalsePositive': 1 });

// Compound indexes for analytics
mlPredictionSchema.index({ 
  userId: 1, 
  timestamp: -1, 
  isAnomaly: 1 
});

mlPredictionSchema.index({
  isAnomaly: 1,
  timestamp: -1,
  compositeScore: -1
});

// Methods
mlPredictionSchema.methods.addFeedback = function(feedback) {
  this.userFeedback = {
    ...feedback,
    submittedAt: new Date()
  };
  return this.save();
};

mlPredictionSchema.methods.getExplanationSummary = function() {
  if (!this.explanation) return 'No explanation available';
  
  return {
    summary: this.explanation.summary,
    topFeatures: this.explanation.topFeatures.slice(0, 3),
    confidence: this.confidence,
    modelAgreement: this.explanation.modelAgreement
  };
};

// Statics
mlPredictionSchema.statics.getRecentAnomalies = function(userId, hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    userId,
    timestamp: { $gte: cutoff },
    isAnomaly: true
  }).sort({ timestamp: -1 });
};

mlPredictionSchema.statics.getAnomalyStatistics = function(userId, days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        timestamp: { $gte: cutoff }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
        },
        totalPredictions: { $sum: 1 },
        anomalyCount: {
          $sum: { $cond: ['$isAnomaly', 1, 0] }
        },
        avgAnomalyScore: { $avg: '$compositeScore' },
        maxAnomalyScore: { $max: '$compositeScore' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

mlPredictionSchema.statics.getFalsePositives = function(limit = 100) {
  return this.find({
    'userFeedback.isFalsePositive': true
  }).sort({ timestamp: -1 }).limit(limit);
};

mlPredictionSchema.statics.getModelPerformanceMetrics = function(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: cutoff }
      }
    },
    {
      $group: {
        _id: null,
        totalPredictions: { $sum: 1 },
        anomalyCount: { $sum: { $cond: ['$isAnomaly', 1, 0] } },
        avgCompositeScore: { $avg: '$compositeScore' },
        avgConfidence: { $avg: '$confidence' },
        avgProcessingTime: { $avg: '$processingTime' },
        falsePositiveCount: {
          $sum: { $cond: ['$userFeedback.isFalsePositive', 1, 0] }
        }
      }
    }
  ]);
};

const MLPrediction = mongoose.model('MLPrediction', mlPredictionSchema);

module.exports = MLPrediction;
