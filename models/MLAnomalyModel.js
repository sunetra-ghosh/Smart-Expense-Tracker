/**
 * ML Anomaly Model Schema
 * Issue #878: Behavioral ML Anomaly Detection
 * 
 * Stores trained ML model parameters and metadata
 */

const mongoose = require('mongoose');

const mlAnomalyModelSchema = new mongoose.Schema({
  version: {
    type: Number,
    required: true,
    index: true
  },
  
  // Isolation Forest parameters
  isolationForestParams: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Autoencoder parameters
  autoencoderParams: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Feature engineering configuration
  featureConfig: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Training metrics
  trainingMetrics: {
    trainingSize: Number,
    trainingDate: Date,
    dataWindowDays: Number,
    trainingDuration: Number, // in seconds
    isolationForestMetrics: {
      nTrees: Number,
      sampleSize: Number
    },
    autoencoderMetrics: {
      finalLoss: Number,
      finalValLoss: Number,
      epochs: Number
    }
  },
  
  // Performance metrics on validation set
  validationMetrics: {
    anomalyDetectionRate: Number,
    falsePositiveRate: Number,
    accuracy: Number,
    precision: Number,
    recall: Number,
    f1Score: Number
  },
  
  // Model status
  isActive: {
    type: Boolean,
    default: false,
    index: true
  },
  
  deactivatedAt: Date,
  
  // Drift detection state
  driftDetectorState: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Notes and metadata
  notes: String,
  trainedBy: String,
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
mlAnomalyModelSchema.index({ version: -1, isActive: 1 });
mlAnomalyModelSchema.index({ createdAt: -1 });

// Methods
mlAnomalyModelSchema.methods.deactivate = function() {
  this.isActive = false;
  this.deactivatedAt = new Date();
  return this.save();
};

mlAnomalyModelSchema.methods.getModelInfo = function() {
  return {
    version: this.version,
    isActive: this.isActive,
    trainingDate: this.trainingMetrics.trainingDate,
    trainingSize: this.trainingMetrics.trainingSize,
    validationMetrics: this.validationMetrics
  };
};

// Statics
mlAnomalyModelSchema.statics.getActiveModel = function() {
  return this.findOne({ isActive: true }).sort({ version: -1 });
};

mlAnomalyModelSchema.statics.getModelHistory = function(limit = 10) {
  return this.find().sort({ version: -1 }).limit(limit);
};

const MLAnomalyModel = mongoose.model('MLAnomalyModel', mlAnomalyModelSchema);

module.exports = MLAnomalyModel;
