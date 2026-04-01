/**
 * ML Anomaly Detection Middleware
 * Issue #878: Behavioral ML Anomaly Detection
 * 
 * Integrates ML-based anomaly detection into request flow
 */

const mlAnomalyDetectionService = require('../services/mlAnomalyDetectionService');
const SecurityEvent = require('../models/SecurityEvent');
const Session = require('../models/Session');

/**
 * Middleware for streaming ML anomaly prediction
 */
const mlAnomalyCheck = async (req, res, next) => {
  try {
    // Skip if no session/user context
    if (!req.sessionId || !req.userId) {
      return next();
    }

    const startTime = Date.now();

    // Build request context
    const requestContext = {
      endpoint: req.path,
      method: req.method,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      contentLength: req.headers['content-length'],
      endpointSensitivity: req.endpointSensitivity || 'MODERATE',
      sessionAge: req.sessionAge || 0,
      isWeekend: [0, 6].includes(new Date().getDay()),
      isBusinessHours: isBusinessHours(),
      location: req.geoLocation // Requires geoip middleware
    };

    // Get ML prediction
    const prediction = await mlAnomalyDetectionService.predictStreaming(
      req.sessionId,
      req.userId,
      requestContext
    );

    // Attach prediction to request for logging
    req.mlPrediction = {
      ...prediction,
      processingTime: Date.now() - startTime
    };

    // Handle anomaly based on score and confidence
    if (prediction.isAnomaly) {
      await handleAnomaly(req, res, prediction);
    }

    next();
  } catch (error) {
    console.error('[ML Anomaly Middleware] Error:', error);
    // Don't block request on ML error - log and continue
    req.mlPrediction = {
      error: error.message,
      fallback: true
    };
    next();
  }
};

/**
 * Handle detected anomaly
 */
async function handleAnomaly(req, res, prediction) {
  const { anomalyScore, confidence, action, explanation } = prediction;

  // Log security event
  await SecurityEvent.create({
    userId: req.userId,
    sessionId: req.sessionId,
    eventType: 'ML_ANOMALY_DETECTED',
    severity: getSeverity(anomalyScore),
    description: `ML anomaly detected: ${explanation.summary || 'Unusual behavioral pattern'}`,
    metadata: {
      anomalyScore,
      confidence,
      recommendedAction: action,
      topFeatures: explanation.topFeatures?.slice(0, 3),
      endpoint: req.path,
      method: req.method
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Take action based on recommendation and confidence
  if (confidence > 0.8) {
    switch (action) {
      case 'BLOCK':
        // Revoke session and block request
        await Session.findByIdAndUpdate(req.sessionId, {
          isActive: false,
          revokedAt: new Date(),
          revocationReason: 'ML_ANOMALY_HIGH_RISK'
        });
        
        return res.status(403).json({
          success: false,
          error: 'Session terminated due to suspicious activity',
          requiresReauthentication: true
        });

      case 'REQUIRE_2FA':
        // Mark session for 2FA verification
        req.requires2FA = true;
        req.reason = 'ML_ANOMALY_DETECTED';
        break;

      case 'CHALLENGE':
        // Set challenge flag for challenge middleware
        req.requiresChallenge = true;
        req.challengeReason = 'ML_ANOMALY';
        break;

      case 'MONITOR':
        // Enhanced monitoring mode
        req.enhancedMonitoring = true;
        break;

      default:
        // ALLOW - log only
        break;
    }
  } else {
    // Low confidence - monitor only
    req.enhancedMonitoring = true;
  }
}

/**
 * Strict mode ML check - for high-security endpoints
 */
const strictMLCheck = async (req, res, next) => {
  try {
    if (!req.sessionId || !req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const requestContext = {
      endpoint: req.path,
      method: req.method,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      endpointSensitivity: 'CRITICAL',
      sessionAge: req.sessionAge || 0,
      isWeekend: [0, 6].includes(new Date().getDay()),
      isBusinessHours: isBusinessHours()
    };

    const prediction = await mlAnomalyDetectionService.predictStreaming(
      req.sessionId,
      req.userId,
      requestContext
    );

    req.mlPrediction = prediction;

    // Strict mode: block any anomaly with high score
    if (prediction.isAnomaly && prediction.anomalyScore > 0.7) {
      await SecurityEvent.create({
        userId: req.userId,
        sessionId: req.sessionId,
        eventType: 'ML_ANOMALY_BLOCKED',
        severity: 'CRITICAL',
        description: 'High-security endpoint access blocked by ML anomaly detection',
        metadata: {
          anomalyScore: prediction.anomalyScore,
          confidence: prediction.confidence,
          endpoint: req.path
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(403).json({
        success: false,
        error: 'Access denied due to anomalous behavior',
        reason: 'ML_ANOMALY_STRICT_MODE'
      });
    }

    next();
  } catch (error) {
    console.error('[ML Anomaly Strict Middleware] Error:', error);
    // In strict mode, deny on error
    return res.status(503).json({
      success: false,
      error: 'Security check temporarily unavailable'
    });
  }
};

/**
 * Batch prediction endpoint - for analysis
 */
const batchMLAnalysis = async (req, res) => {
  try {
    const { sessionIds, userIds } = req.body;

    if (!sessionIds || !userIds || sessionIds.length !== userIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: sessionIds and userIds arrays required'
      });
    }

    const predictions = await mlAnomalyDetectionService.predictBatch(sessionIds, userIds);

    res.json({
      success: true,
      predictions,
      count: predictions.length
    });
  } catch (error) {
    console.error('[Batch ML Analysis] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Batch analysis failed'
    });
  }
};

/**
 * Model management endpoints
 */
const getMLModelStatus = async (req, res) => {
  try {
    const performance = await mlAnomalyDetectionService.getModelPerformance(24);
    
    res.json({
      success: true,
      performance,
      isRetraining: mlAnomalyDetectionService.isRetraining,
      lastRetrainingTime: mlAnomalyDetectionService.lastRetrainingTime
    });
  } catch (error) {
    console.error('[ML Model Status] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get model status'
    });
  }
};

const forceMLRetrain = async (req, res) => {
  try {
    // Check admin authorization
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Trigger asynchronous retraining
    mlAnomalyDetectionService.forceRetrain()
      .then(() => {
        console.log('[ML Retrain] Force retrain completed');
      })
      .catch(error => {
        console.error('[ML Retrain] Error:', error);
      });

    res.json({
      success: true,
      message: 'Model retraining initiated'
    });
  } catch (error) {
    console.error('[Force ML Retrain] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate retraining'
    });
  }
};

/**
 * Helper functions
 */
function getSeverity(anomalyScore) {
  if (anomalyScore >= 0.9) return 'CRITICAL';
  if (anomalyScore >= 0.8) return 'HIGH';
  if (anomalyScore >= 0.7) return 'MODERATE';
  return 'LOW';
}

function isBusinessHours() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  // Monday-Friday, 9 AM - 5 PM
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

module.exports = {
  mlAnomalyCheck,
  strictMLCheck,
  batchMLAnalysis,
  getMLModelStatus,
  forceMLRetrain
};
