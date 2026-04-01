/**
 * ML Anomaly Detection - Integration Examples
 * Issue #878: Behavioral Machine Learning Anomaly Detection
 * 
 * This file demonstrates various ways to integrate ML anomaly detection
 * into your ExpenseFlow application.
 */

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { mlAnomalyCheck, strictMLCheck } = require('../middleware/mlAnomalyDetection');
const mlAnomalyDetectionService = require('../services/mlAnomalyDetectionService');

// =============================================================================
// EXAMPLE 1: Standard Protection for All Routes
// =============================================================================

// Apply ML anomaly detection to all authenticated routes
// This is the most common usage pattern
router.use(auth);           // Authenticate first
router.use(mlAnomalyCheck); // Then check for anomalies

// Now all endpoints below are protected
router.get('/transactions', getTransactions);
router.post('/transactions', createTransaction);
router.put('/transactions/:id', updateTransaction);

// =============================================================================
// EXAMPLE 2: Selective Protection for High-Risk Endpoints
// =============================================================================

// Normal protection for regular endpoints
router.get('/profile', auth, mlAnomalyCheck, getUserProfile);

// Strict protection for sensitive operations
router.delete('/account', auth, strictMLCheck, deleteAccount);
router.post('/account/export-data', auth, strictMLCheck, exportAllData);
router.put('/account/email', auth, strictMLCheck, changeEmail);

// =============================================================================
// EXAMPLE 3: Custom Threshold Per Endpoint
// =============================================================================

const customMLCheck = (threshold = 0.65) => {
  return async (req, res, next) => {
    try {
      if (!req.sessionId || !req.userId) {
        return next();
      }

      const prediction = await mlAnomalyDetectionService.predictStreaming(
        req.sessionId,
        req.userId,
        {
          endpoint: req.path,
          method: req.method,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          endpointSensitivity: 'HIGH'
        }
      );

      // Custom threshold check
      if (prediction.isAnomaly && prediction.anomalyScore > threshold) {
        return res.status(403).json({
          success: false,
          error: 'Suspicious activity detected',
          requiresVerification: true
        });
      }

      req.mlPrediction = prediction;
      next();
    } catch (error) {
      console.error('[Custom ML Check] Error:', error);
      next();
    }
  };
};

// Use custom thresholds
router.post('/wire-transfer', auth, customMLCheck(0.80), wireTransfer);
router.post('/bulk-delete', auth, customMLCheck(0.75), bulkDelete);

// =============================================================================
// EXAMPLE 4: Manual Check with Custom Response
// =============================================================================

router.post('/payment', auth, async (req, res) => {
  try {
    const { amount, recipient } = req.body;

    // Perform ML check
    const prediction = await mlAnomalyDetectionService.predictStreaming(
      req.sessionId,
      req.userId,
      {
        endpoint: '/api/payment',
        method: 'POST',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        endpointSensitivity: 'CRITICAL',
        contentLength: JSON.stringify(req.body).length
      }
    );

    // Log the prediction
    console.log(`[Payment] Anomaly score: ${prediction.anomalyScore}`);

    // High-value transactions get extra scrutiny
    if (amount > 5000 && prediction.isAnomaly) {
      // Require additional verification
      return res.status(403).json({
        success: false,
        error: 'Additional verification required for this transaction',
        requiresChallenge: true,
        challengeReason: 'HIGH_VALUE_ANOMALY',
        anomalyDetails: {
          score: prediction.anomalyScore,
          topFactors: prediction.explanation.topFeatures.slice(0, 3)
        }
      });
    }

    // Process payment normally
    const result = await processPayment(req.userId, amount, recipient);
    
    res.json({
      success: true,
      payment: result,
      securityCheck: {
        passed: true,
        anomalyScore: prediction.anomalyScore
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// EXAMPLE 5: Conditional Protection Based on User Role
// =============================================================================

const adaptiveMLCheck = async (req, res, next) => {
  try {
    // Skip ML check for admins (optional - for performance)
    if (req.user && req.user.role === 'admin') {
      return next();
    }

    // More lenient for trusted users
    const userTrustLevel = await getUserTrustLevel(req.userId);
    const threshold = userTrustLevel === 'HIGH' ? 0.80 : 0.65;

    const prediction = await mlAnomalyDetectionService.predictStreaming(
      req.sessionId,
      req.userId,
      {
        endpoint: req.path,
        method: req.method,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    if (prediction.isAnomaly && prediction.anomalyScore > threshold) {
      return res.status(403).json({
        success: false,
        error: 'Security check failed',
        userTrustLevel,
        threshold
      });
    }

    next();
  } catch (error) {
    console.error('[Adaptive ML Check] Error:', error);
    next();
  }
};

router.post('/sensitive-action', auth, adaptiveMLCheck, performAction);

// =============================================================================
// EXAMPLE 6: Batch Analysis for Admin Review
// =============================================================================

router.get('/admin/suspicious-sessions', auth, requireAdmin, async (req, res) => {
  try {
    const { hours = 24 } = req.query;

    // Get all sessions with anomalies in the last N hours
    const MLPrediction = require('../models/MLPrediction');
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const suspiciousSessions = await MLPrediction.aggregate([
      {
        $match: {
          timestamp: { $gte: cutoff },
          isAnomaly: true,
          compositeScore: { $gte: 0.7 }
        }
      },
      {
        $group: {
          _id: '$sessionId',
          userId: { $first: '$userId' },
          anomalyCount: { $sum: 1 },
          maxScore: { $max: '$compositeScore' },
          avgScore: { $avg: '$compositeScore' },
          topFeatures: { $first: '$explanation.topFeatures' }
        }
      },
      {
        $sort: { maxScore: -1 }
      },
      {
        $limit: 50
      }
    ]);

    res.json({
      success: true,
      suspiciousSessions,
      count: suspiciousSessions.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// EXAMPLE 7: Real-time Monitoring Dashboard Data
// =============================================================================

router.get('/dashboard/ml-stats', auth, async (req, res) => {
  try {
    // Get recent prediction statistics
    const performance = await mlAnomalyDetectionService.getModelPerformance(24);
    
    // Get user-specific anomaly stats
    const MLPrediction = require('../models/MLPrediction');
    const userStats = await MLPrediction.getAnomalyStatistics(req.userId, 7);

    // Get drift status
    const driftMetrics = mlAnomalyDetectionService.driftDetector.calculateDrift();

    res.json({
      success: true,
      metrics: {
        // Overall system health
        system: {
          totalPredictions: performance.totalPredictions,
          anomalyRate: (performance.anomalyCount / performance.totalPredictions * 100).toFixed(2),
          averageScore: performance.averageAnomalyScore.toFixed(3),
          isHealthy: !driftMetrics.isDrifting
        },
        // User-specific stats
        user: {
          weeklyStats: userStats,
          recentAnomalies: performance.anomalyCount
        },
        // Model health
        model: {
          driftScore: driftMetrics.driftScore.toFixed(3),
          isDrifting: driftMetrics.isDrifting,
          lastRetrain: mlAnomalyDetectionService.lastRetrainingTime,
          isRetraining: mlAnomalyDetectionService.isRetraining
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// EXAMPLE 8: User Notification on Anomaly
// =============================================================================

const notifyUserOnAnomaly = async (req, res, next) => {
  try {
    const prediction = req.mlPrediction;

    if (prediction && prediction.isAnomaly && prediction.anomalyScore > 0.75) {
      // Send notification to user
      const notificationService = require('../services/notificationService');
      
      await notificationService.create({
        userId: req.userId,
        type: 'SECURITY_ALERT',
        title: 'Unusual Activity Detected',
        message: `We detected unusual activity on your account. If this wasn't you, please secure your account immediately.`,
        severity: 'HIGH',
        metadata: {
          anomalyScore: prediction.anomalyScore,
          timestamp: new Date(),
          action: prediction.action
        }
      });
    }

    next();
  } catch (error) {
    console.error('[Anomaly Notification] Error:', error);
    next();
  }
};

router.use(auth);
router.use(mlAnomalyCheck);
router.use(notifyUserOnAnomaly); // Add notification middleware

// =============================================================================
// EXAMPLE 9: Challenge-Response Integration
// =============================================================================

router.post('/critical-action', auth, async (req, res) => {
  try {
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

    // If anomaly detected, require challenge completion
    if (prediction.isAnomaly && prediction.anomalyScore > 0.70) {
      // Check if challenge already completed
      if (!req.body.challengeToken) {
        // Issue challenge
        const ChallengeService = require('../services/challengeOrchestrationService');
        const challenge = await ChallengeService.issueChallenge(
          req.userId,
          req.sessionId,
          'ML_ANOMALY'
        );

        return res.status(403).json({
          success: false,
          requiresChallenge: true,
          challengeId: challenge._id,
          challengeType: challenge.challengeType,
          message: 'Please complete verification to proceed'
        });
      }

      // Verify challenge token
      const ChallengeService = require('../services/challengeOrchestrationService');
      const verified = await ChallengeService.verifyChallenge(
        req.body.challengeToken
      );

      if (!verified) {
        return res.status(403).json({
          success: false,
          error: 'Invalid verification token'
        });
      }
    }

    // Process the critical action
    const result = await performCriticalAction(req.user, req.body);
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// EXAMPLE 10: Feedback Collection UI Integration
// =============================================================================

router.get('/my-security-alerts', auth, async (req, res) => {
  try {
    const MLPrediction = require('../models/MLPrediction');
    
    // Get user's recent anomalies
    const alerts = await MLPrediction.find({
      userId: req.userId,
      isAnomaly: true,
      timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    })
    .sort({ timestamp: -1 })
    .limit(50);

    // Format for display
    const formattedAlerts = alerts.map(alert => ({
      id: alert._id,
      timestamp: alert.timestamp,
      score: alert.compositeScore,
      explanation: alert.explanation.summary,
      topFactors: alert.explanation.topFeatures.slice(0, 3),
      actionTaken: alert.actionTaken,
      canProvideFeedback: !alert.userFeedback,
      feedback: alert.userFeedback
    }));

    res.json({
      success: true,
      alerts: formattedAlerts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

async function getUserTrustLevel(userId) {
  // Implement your trust level logic
  // Could be based on account age, verification status, activity history, etc.
  return 'MEDIUM';
}

async function processPayment(userId, amount, recipient) {
  // Payment processing logic
  return { id: 'payment_123', status: 'completed' };
}

async function performCriticalAction(user, data) {
  // Critical action logic
  return { status: 'success' };
}

async function getTransactions(req, res) {
  res.json({ success: true, transactions: [] });
}

async function createTransaction(req, res) {
  res.json({ success: true, transaction: {} });
}

async function updateTransaction(req, res) {
  res.json({ success: true, transaction: {} });
}

async function getUserProfile(req, res) {
  res.json({ success: true, profile: {} });
}

async function deleteAccount(req, res) {
  res.json({ success: true });
}

async function exportAllData(req, res) {
  res.json({ success: true, data: {} });
}

async function changeEmail(req, res) {
  res.json({ success: true });
}

async function wireTransfer(req, res) {
  res.json({ success: true });
}

async function bulkDelete(req, res) {
  res.json({ success: true });
}

async function performAction(req, res) {
  res.json({ success: true });
}

const requireAdmin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({ success: false, error: 'Admin access required' });
  }
};

module.exports = router;
