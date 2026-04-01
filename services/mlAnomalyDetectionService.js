/**
 * ML-Based Behavioral Anomaly Detection Service
 * Issue #878: Behavioral Machine Learning Anomaly Detection
 * 
 * Implements unsupervised ML models (Isolation Forest & Autoencoder) for 
 * detecting behavioral anomalies not caught by rule-based systems.
 * Supports streaming predictions and batch retraining with drift detection.
 */

const mongoose = require('mongoose');
const IsolationForest = require('../utils/ml/isolationForest');
const Autoencoder = require('../utils/ml/autoencoder');
const FeatureEngineer = require('../utils/ml/featureEngineer');
const ModelExplainer = require('../utils/ml/modelExplainer');
const DriftDetector = require('../utils/ml/driftDetector');

const MLAnomalyModel = require('../models/MLAnomalyModel');
const MLPrediction = require('../models/MLPrediction');
const BehaviorSignalAnalysisEngine = require('./behaviorSignalAnalysisEngine');
const SessionBehaviorSignal = require('../models/SessionBehaviorSignal');

class MLAnomalyDetectionService {
  constructor() {
    this.isolationForest = null;
    this.autoencoder = null;
    this.featureEngineer = new FeatureEngineer();
    this.modelExplainer = new ModelExplainer();
    this.driftDetector = new DriftDetector();
    this.modelConfig = {
      isolationForest: {
        nTrees: 100,
        sampleSize: 256,
        maxTreeDepth: 12,
        contamination: 0.05
      },
      autoencoder: {
        inputDim: null, // Set dynamically based on features
        encodingDim: 16,
        learningRate: 0.001,
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2
      },
      retraining: {
        minSamplesForTraining: 1000,
        hourlyRetrainThreshold: 0.15, // Retrain if drift > 15%
        dailyRetrainForced: true,
        modelWindowDays: 30 // Use last 30 days of data
      },
      prediction: {
        ensembleWeight: {
          isolationForest: 0.6,
          autoencoder: 0.4
        },
        anomalyThreshold: 0.65 // Composite score > 0.65 = anomaly
      }
    };
    this.isRetraining = false;
    this.lastRetrainingTime = null;
  }

  /**
   * Initialize ML models - load from storage or train new
   */
  async initialize() {
    try {
      console.log('[ML Anomaly] Initializing ML anomaly detection service...');
      
      // Try to load existing models
      const existingModels = await MLAnomalyModel.find({ 
        isActive: true 
      }).sort({ version: -1 }).limit(1);

      if (existingModels.length > 0) {
        await this.loadModels(existingModels[0]);
        console.log('[ML Anomaly] Loaded existing models, version:', existingModels[0].version);
      } else {
        console.log('[ML Anomaly] No existing models found. Will train on first batch.');
      }

      // Schedule periodic retraining
      this.scheduleRetraining();
      
      return true;
    } catch (error) {
      console.error('[ML Anomaly] Error initializing:', error);
      throw error;
    }
  }

  /**
   * Streaming prediction - predict anomaly for single request
   */
  async predictStreaming(sessionId, userId, requestContext = {}) {
    try {
      // If models not trained yet, use fallback
      if (!this.isolationForest || !this.autoencoder) {
        return this.fallbackPrediction(sessionId, userId);
      }

      // Collect behavioral signals
      const behaviorEngine = new BehaviorSignalAnalysisEngine();
      const signals = await behaviorEngine.collectSignals(sessionId, userId, requestContext);

      // Extract features
      const features = await this.featureEngineer.extractFeatures(
        signals,
        sessionId,
        userId,
        requestContext
      );

      if (!features || features.length === 0) {
        return this.fallbackPrediction(sessionId, userId);
      }

      // Get predictions from both models
      const ifScore = this.isolationForest.predict(features);
      const aeScore = this.autoencoder.predict(features);

      // Ensemble prediction
      const compositeScore = this.computeEnsembleScore(ifScore, aeScore);
      const isAnomaly = compositeScore > this.modelConfig.prediction.anomalyThreshold;

      // Get feature contributions for explainability
      const explanation = this.modelExplainer.explain(
        features,
        { ifScore, aeScore, compositeScore },
        this.featureEngineer.getFeatureNames()
      );

      // Log prediction
      await this.logPrediction(sessionId, userId, {
        features,
        scores: { ifScore, aeScore, compositeScore },
        isAnomaly,
        explanation,
        requestContext
      });

      // Feed to drift detector
      this.driftDetector.addDataPoint(features, compositeScore);

      return {
        isAnomaly,
        anomalyScore: compositeScore,
        confidence: this.computeConfidence(ifScore, aeScore),
        explanation: explanation.topFeatures.slice(0, 5), // Top 5 contributing features
        modelVersions: {
          isolationForest: this.isolationForest.getVersion(),
          autoencoder: this.autoencoder.getVersion()
        },
        action: this.getRecommendedAction(compositeScore, isAnomaly)
      };
    } catch (error) {
      console.error('[ML Anomaly] Error in streaming prediction:', error);
      return this.fallbackPrediction(sessionId, userId, error);
    }
  }

  /**
   * Batch prediction - evaluate multiple sessions
   */
  async predictBatch(sessionIds, userIds) {
    try {
      const predictions = [];

      for (let i = 0; i < sessionIds.length; i++) {
        const prediction = await this.predictStreaming(sessionIds[i], userIds[i]);
        predictions.push({
          sessionId: sessionIds[i],
          userId: userIds[i],
          ...prediction
        });
      }

      return predictions;
    } catch (error) {
      console.error('[ML Anomaly] Error in batch prediction:', error);
      throw error;
    }
  }

  /**
   * Train models on historical data
   */
  async trainModels(forceRetrain = false) {
    if (this.isRetraining && !forceRetrain) {
      console.log('[ML Anomaly] Model retraining already in progress');
      return false;
    }

    try {
      this.isRetraining = true;
      console.log('[ML Anomaly] Starting model training...');

      // Fetch historical behavioral signals
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - this.modelConfig.retraining.modelWindowDays);

      const historicalSignals = await SessionBehaviorSignal.find({
        timestamp: { $gte: windowStart }
      }).limit(50000); // Limit for memory management

      if (historicalSignals.length < this.modelConfig.retraining.minSamplesForTraining) {
        console.log(`[ML Anomaly] Insufficient training data: ${historicalSignals.length} samples`);
        this.isRetraining = false;
        return false;
      }

      console.log(`[ML Anomaly] Training on ${historicalSignals.length} samples`);

      // Group signals by session for feature engineering
      const sessionGroups = this.groupSignalsBySession(historicalSignals);
      
      // Extract features for all sessions
      const trainingData = [];
      for (const [sessionId, signals] of Object.entries(sessionGroups)) {
        const features = await this.featureEngineer.extractFeaturesFromSignals(signals);
        if (features && features.length > 0) {
          trainingData.push(features);
        }
      }

      if (trainingData.length < this.modelConfig.retraining.minSamplesForTraining) {
        console.log('[ML Anomaly] Insufficient feature vectors for training');
        this.isRetraining = false;
        return false;
      }

      // Set autoencoder input dimension
      this.modelConfig.autoencoder.inputDim = trainingData[0].length;

      // Train Isolation Forest
      console.log('[ML Anomaly] Training Isolation Forest...');
      this.isolationForest = new IsolationForest(this.modelConfig.isolationForest);
      await this.isolationForest.train(trainingData);

      // Train Autoencoder
      console.log('[ML Anomaly] Training Autoencoder...');
      this.autoencoder = new Autoencoder(this.modelConfig.autoencoder);
      await this.autoencoder.train(trainingData);

      // Save models to database
      await this.saveModels(trainingData.length);

      // Reset drift detector with new baseline
      this.driftDetector.reset();

      this.lastRetrainingTime = new Date();
      this.isRetraining = false;

      console.log('[ML Anomaly] Model training completed successfully');
      return true;
    } catch (error) {
      console.error('[ML Anomaly] Error training models:', error);
      this.isRetraining = false;
      throw error;
    }
  }

  /**
   * Check for drift and retrain if necessary
   */
  async checkDriftAndRetrain() {
    try {
      const driftMetrics = this.driftDetector.calculateDrift();

      if (driftMetrics.isDrifting) {
        console.log(`[ML Anomaly] Drift detected: ${driftMetrics.driftScore.toFixed(3)}`);
        console.log('[ML Anomaly] Triggering model retraining...');
        
        await this.trainModels(true);
        
        return {
          driftDetected: true,
          driftScore: driftMetrics.driftScore,
          retrained: true
        };
      }

      return {
        driftDetected: false,
        driftScore: driftMetrics.driftScore,
        retrained: false
      };
    } catch (error) {
      console.error('[ML Anomaly] Error checking drift:', error);
      return { driftDetected: false, error: error.message };
    }
  }

  /**
   * Get model performance metrics
   */
  async getModelPerformance(timeWindow = 24) {
    try {
      const windowStart = new Date();
      windowStart.setHours(windowStart.getHours() - timeWindow);

      const predictions = await MLPrediction.find({
        timestamp: { $gte: windowStart }
      });

      const metrics = {
        totalPredictions: predictions.length,
        anomalyCount: predictions.filter(p => p.isAnomaly).length,
        averageAnomalyScore: 0,
        averageConfidence: 0,
        modelPerformance: {
          isolationForest: this.isolationForest?.getPerformanceMetrics() || {},
          autoencoder: this.autoencoder?.getPerformanceMetrics() || {}
        },
        driftMetrics: this.driftDetector.calculateDrift()
      };

      if (predictions.length > 0) {
        metrics.averageAnomalyScore = predictions.reduce(
          (sum, p) => sum + p.compositeScore, 0
        ) / predictions.length;
        metrics.averageConfidence = predictions.reduce(
          (sum, p) => sum + p.confidence, 0
        ) / predictions.length;
      }

      return metrics;
    } catch (error) {
      console.error('[ML Anomaly] Error getting model performance:', error);
      throw error;
    }
  }

  /**
   * Force model retraining
   */
  async forceRetrain() {
    console.log('[ML Anomaly] Force retraining requested');
    return await this.trainModels(true);
  }

  // ==================== Helper Methods ====================

  computeEnsembleScore(ifScore, aeScore) {
    const weights = this.modelConfig.prediction.ensembleWeight;
    return (ifScore * weights.isolationForest) + (aeScore * weights.autoencoder);
  }

  computeConfidence(ifScore, aeScore) {
    // Confidence is higher when both models agree
    const agreement = 1 - Math.abs(ifScore - aeScore);
    return Math.min(agreement * 1.2, 1.0);
  }

  getRecommendedAction(score, isAnomaly) {
    if (!isAnomaly) return 'ALLOW';
    
    if (score >= 0.9) return 'BLOCK';
    if (score >= 0.8) return 'REQUIRE_2FA';
    if (score >= 0.7) return 'CHALLENGE';
    return 'MONITOR';
  }

  fallbackPrediction(sessionId, userId, error = null) {
    return {
      isAnomaly: false,
      anomalyScore: 0,
      confidence: 0,
      explanation: [],
      modelVersions: { isolationForest: null, autoencoder: null },
      action: 'ALLOW',
      fallback: true,
      error: error?.message
    };
  }

  groupSignalsBySession(signals) {
    const groups = {};
    signals.forEach(signal => {
      const sessionId = signal.sessionId.toString();
      if (!groups[sessionId]) {
        groups[sessionId] = [];
      }
      groups[sessionId].push(signal);
    });
    return groups;
  }

  async logPrediction(sessionId, userId, predictionData) {
    try {
      const prediction = new MLPrediction({
        sessionId,
        userId,
        timestamp: new Date(),
        features: predictionData.features,
        isolationForestScore: predictionData.scores.ifScore,
        autoencoderScore: predictionData.scores.aeScore,
        compositeScore: predictionData.scores.compositeScore,
        isAnomaly: predictionData.isAnomaly,
        confidence: this.computeConfidence(
          predictionData.scores.ifScore,
          predictionData.scores.aeScore
        ),
        explanation: predictionData.explanation,
        requestContext: predictionData.requestContext,
        modelVersion: {
          isolationForest: this.isolationForest?.getVersion(),
          autoencoder: this.autoencoder?.getVersion()
        }
      });

      await prediction.save();
    } catch (error) {
      console.error('[ML Anomaly] Error logging prediction:', error);
    }
  }

  async saveModels(trainingSize) {
    try {
      // Deactivate old models
      await MLAnomalyModel.updateMany(
        { isActive: true },
        { isActive: false }
      );

      // Get new version number
      const latestModel = await MLAnomalyModel.findOne().sort({ version: -1 });
      const newVersion = latestModel ? latestModel.version + 1 : 1;

      // Save new model
      const modelRecord = new MLAnomalyModel({
        version: newVersion,
        isolationForestParams: this.isolationForest.serialize(),
        autoencoderParams: this.autoencoder.serialize(),
        featureConfig: this.featureEngineer.getConfig(),
        trainingMetrics: {
          trainingSize,
          trainingDate: new Date(),
          dataWindowDays: this.modelConfig.retraining.modelWindowDays
        },
        isActive: true
      });

      await modelRecord.save();
      console.log(`[ML Anomaly] Saved model version ${newVersion}`);
    } catch (error) {
      console.error('[ML Anomaly] Error saving models:', error);
      throw error;
    }
  }

  async loadModels(modelRecord) {
    try {
      // Load Isolation Forest
      this.isolationForest = new IsolationForest(this.modelConfig.isolationForest);
      this.isolationForest.deserialize(modelRecord.isolationForestParams);

      // Load Autoencoder
      this.autoencoder = new Autoencoder(this.modelConfig.autoencoder);
      this.autoencoder.deserialize(modelRecord.autoencoderParams);

      // Load feature engineer config
      this.featureEngineer.loadConfig(modelRecord.featureConfig);

      this.lastRetrainingTime = modelRecord.trainingMetrics.trainingDate;
    } catch (error) {
      console.error('[ML Anomaly] Error loading models:', error);
      throw error;
    }
  }

  scheduleRetraining() {
    // Hourly drift check
    setInterval(async () => {
      await this.checkDriftAndRetrain();
    }, 60 * 60 * 1000); // 1 hour

    // Daily forced retraining
    if (this.modelConfig.retraining.dailyRetrainForced) {
      setInterval(async () => {
        console.log('[ML Anomaly] Daily retraining scheduled');
        await this.trainModels(true);
      }, 24 * 60 * 60 * 1000); // 24 hours
    }
  }
}

// Singleton instance
const mlAnomalyDetectionService = new MLAnomalyDetectionService();

module.exports = mlAnomalyDetectionService;
