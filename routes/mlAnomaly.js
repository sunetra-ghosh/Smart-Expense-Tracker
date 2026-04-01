/**
 * ML Anomaly Detection Routes
 * Issue #878: Behavioral ML Anomaly Detection
 */

const express = require('express');
const router = express.Router();
const { auth, requireAdmin } = require('../middleware/auth');
const {
  batchMLAnalysis,
  getMLModelStatus,
  forceMLRetrain
} = require('../middleware/mlAnomalyDetection');

const MLPrediction = require('../models/MLPrediction');
const MLAnomalyModel = require('../models/MLAnomalyModel');
const mlAnomalyDetectionService = require('../services/mlAnomalyDetectionService');

/**
 * GET /api/ml-anomaly/status
 * Get current ML model status and performance
 */
router.get('/status', auth, requireAdmin, getMLModelStatus);

/**
 * POST /api/ml-anomaly/retrain
 * Force model retraining
 */
router.post('/retrain', auth, requireAdmin, forceMLRetrain);

/**
 * POST /api/ml-anomaly/batch-analyze
 * Batch anomaly analysis for multiple sessions
 */
router.post('/batch-analyze', auth, requireAdmin, batchMLAnalysis);

/**
 * GET /api/ml-anomaly/predictions/recent
 * Get recent predictions for current user
 */
router.get('/predictions/recent', auth, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const predictions = await MLPrediction.getRecentAnomalies(req.userId, hours);

    res.json({
      success: true,
      predictions: predictions.map(p => ({
        timestamp: p.timestamp,
        anomalyScore: p.compositeScore,
        confidence: p.confidence,
        explanation: p.getExplanationSummary(),
        actionTaken: p.actionTaken
      }))
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error getting recent predictions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve predictions'
    });
  }
});

/**
 * GET /api/ml-anomaly/predictions/:predictionId
 * Get detailed prediction information
 */
router.get('/predictions/:predictionId', auth, async (req, res) => {
  try {
    const prediction = await MLPrediction.findById(req.params.predictionId);

    if (!prediction) {
      return res.status(404).json({
        success: false,
        error: 'Prediction not found'
      });
    }

    // Verify user owns this prediction
    if (prediction.userId.toString() !== req.userId.toString() && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      prediction
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error getting prediction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve prediction'
    });
  }
});

/**
 * POST /api/ml-anomaly/predictions/:predictionId/feedback
 * Submit feedback on prediction (for model improvement)
 */
router.post('/predictions/:predictionId/feedback', auth, async (req, res) => {
  try {
    const prediction = await MLPrediction.findById(req.params.predictionId);

    if (!prediction) {
      return res.status(404).json({
        success: false,
        error: 'Prediction not found'
      });
    }

    // Verify user owns this prediction
    if (prediction.userId.toString() !== req.userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { isFalsePositive, isFalseNegative, notes } = req.body;

    await prediction.addFeedback({
      isFalsePositive,
      isFalseNegative,
      notes
    });

    res.json({
      success: true,
      message: 'Feedback submitted successfully'
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
});

/**
 * GET /api/ml-anomaly/statistics
 * Get anomaly statistics for current user
 */
router.get('/statistics', auth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const statistics = await MLPrediction.getAnomalyStatistics(req.userId, days);

    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error getting statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

/**
 * GET /api/ml-anomaly/models/history
 * Get model version history (admin only)
 */
router.get('/models/history', auth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const models = await MLAnomalyModel.getModelHistory(limit);

    res.json({
      success: true,
      models: models.map(m => m.getModelInfo())
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error getting model history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve model history'
    });
  }
});

/**
 * GET /api/ml-anomaly/models/active
 * Get currently active model information
 */
router.get('/models/active', auth, requireAdmin, async (req, res) => {
  try {
    const activeModel = await MLAnomalyModel.getActiveModel();

    if (!activeModel) {
      return res.status(404).json({
        success: false,
        error: 'No active model found'
      });
    }

    res.json({
      success: true,
      model: activeModel.getModelInfo()
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error getting active model:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve active model'
    });
  }
});

/**
 * GET /api/ml-anomaly/drift/status
 * Get drift detection status
 */
router.get('/drift/status', auth, requireAdmin, async (req, res) => {
  try {
    const driftMetrics = mlAnomalyDetectionService.driftDetector.calculateDrift();
    const driftStats = mlAnomalyDetectionService.driftDetector.getStatistics();

    res.json({
      success: true,
      drift: driftMetrics,
      statistics: driftStats
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error getting drift status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve drift status'
    });
  }
});

/**
 * GET /api/ml-anomaly/performance
 * Get detailed performance metrics
 */
router.get('/performance', auth, requireAdmin, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const performance = await mlAnomalyDetectionService.getModelPerformance(hours);
    const dbMetrics = await MLPrediction.getModelPerformanceMetrics(hours);

    res.json({
      success: true,
      performance,
      databaseMetrics: dbMetrics[0] || {}
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error getting performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance metrics'
    });
  }
});

/**
 * GET /api/ml-anomaly/false-positives
 * Get false positive reports (admin only)
 */
router.get('/false-positives', auth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const falsePositives = await MLPrediction.getFalsePositives(limit);

    res.json({
      success: true,
      falsePositives: falsePositives.map(fp => ({
        id: fp._id,
        timestamp: fp.timestamp,
        userId: fp.userId,
        anomalyScore: fp.compositeScore,
        explanation: fp.getExplanationSummary(),
        feedback: fp.userFeedback
      })),
      count: falsePositives.length
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error getting false positives:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve false positives'
    });
  }
});

/**
 * POST /api/ml-anomaly/initialize
 * Initialize/train models (admin only, one-time setup)
 */
router.post('/initialize', auth, requireAdmin, async (req, res) => {
  try {
    const initialized = await mlAnomalyDetectionService.initialize();

    // Check if models exist, if not trigger training
    const activeModel = await MLAnomalyModel.getActiveModel();
    
    if (!activeModel) {
      // Trigger background training
      mlAnomalyDetectionService.trainModels()
        .then(() => {
          console.log('[ML Anomaly] Initial training completed');
        })
        .catch(error => {
          console.error('[ML Anomaly] Initial training failed:', error);
        });

      return res.json({
        success: true,
        message: 'ML system initialized. Background training started.',
        training: true
      });
    }

    res.json({
      success: true,
      message: 'ML system initialized successfully',
      training: false,
      modelVersion: activeModel.version
    });
  } catch (error) {
    console.error('[ML Anomaly Routes] Error initializing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize ML system'
    });
  }
});

module.exports = router;
