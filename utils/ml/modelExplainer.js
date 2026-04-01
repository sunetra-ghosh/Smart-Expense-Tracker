/**
 * Model Explainer - Feature Contribution Analysis
 * Issue #878: Behavioral ML Anomaly Detection
 * 
 * Provides explainability for ML anomaly predictions by showing
 * which features contributed most to the anomaly score
 */

class ModelExplainer {
  constructor() {
    this.baselineStats = {};
  }

  /**
   * Explain prediction by analyzing feature contributions
   */
  explain(features, scores, featureNames) {
    try {
      const { ifScore, aeScore, compositeScore } = scores;

      // Calculate feature importance using perturbation analysis
      const featureContributions = this.calculateFeatureContributions(
        features,
        featureNames
      );

      // Identify top contributing features
      const sortedContributions = featureContributions
        .map((contrib, idx) => ({
          feature: featureNames[idx] || `feature_${idx}`,
          contribution: contrib,
          value: features[idx],
          normalizedValue: this.normalizeForDisplay(features[idx])
        }))
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

      // Generate human-readable explanation
      const explanation = this.generateExplanation(
        sortedContributions.slice(0, 10),
        compositeScore,
        { ifScore, aeScore }
      );

      return {
        topFeatures: sortedContributions.slice(0, 10),
        explanation,
        modelAgreement: this.calculateModelAgreement(ifScore, aeScore),
        confidenceFactors: this.identifyConfidenceFactors(sortedContributions),
        summary: this.generateSummary(sortedContributions, compositeScore)
      };
    } catch (error) {
      console.error('[ModelExplainer] Error in explain:', error);
      return {
        topFeatures: [],
        explanation: 'Unable to generate explanation',
        modelAgreement: 0,
        confidenceFactors: [],
        summary: 'Error in explanation generation'
      };
    }
  }

  /**
   * Calculate feature contributions using deviation from baseline
   */
  calculateFeatureContributions(features, featureNames) {
    const contributions = features.map((value, idx) => {
      const featureName = featureNames[idx];
      const baseline = this.baselineStats[featureName];

      if (!baseline) {
        // If no baseline, use absolute value as contribution
        return Math.abs(value);
      }

      // Standardized deviation from baseline
      const deviation = baseline.std > 0 
        ? Math.abs(value - baseline.mean) / baseline.std 
        : Math.abs(value - baseline.mean);

      return deviation;
    });

    // Normalize contributions to sum to 1
    const total = contributions.reduce((a, b) => a + b, 0);
    return total > 0 
      ? contributions.map(c => c / total) 
      : contributions;
  }

  /**
   * Generate human-readable explanation
   */
  generateExplanation(topFeatures, compositeScore, modelScores) {
    const lines = [];

    // Overall assessment
    if (compositeScore >= 0.8) {
      lines.push('🚨 HIGH ANOMALY DETECTED - This behavior is highly unusual.');
    } else if (compositeScore >= 0.65) {
      lines.push('⚠️ MODERATE ANOMALY - This behavior deviates from normal patterns.');
    } else {
      lines.push('✓ Normal behavior detected.');
    }

    // Model agreement
    const agreement = this.calculateModelAgreement(modelScores.ifScore, modelScores.aeScore);
    if (agreement > 0.8) {
      lines.push(`Both detection models strongly agree (${(agreement * 100).toFixed(0)}% agreement).`);
    } else if (agreement < 0.5) {
      lines.push(`Detection models show disagreement (${(agreement * 100).toFixed(0)}% agreement) - lower confidence.`);
    }

    // Top contributing factors
    lines.push('\nKey factors:');
    topFeatures.slice(0, 5).forEach((feature, idx) => {
      const percentage = (feature.contribution * 100).toFixed(1);
      lines.push(`${idx + 1}. ${this.humanizeFeatureName(feature.feature)} (${percentage}% contribution)`);
      lines.push(`   Value: ${feature.normalizedValue}`);
    });

    return lines.join('\n');
  }

  /**
   * Calculate agreement between models
   */
  calculateModelAgreement(ifScore, aeScore) {
    // Agreement is higher when both scores are close
    return 1 - Math.abs(ifScore - aeScore);
  }

  /**
   * Identify factors affecting prediction confidence
   */
  identifyConfidenceFactors(contributions) {
    const factors = [];

    // Check if contribution is concentrated or distributed
    const topContribSum = contributions.slice(0, 3)
      .reduce((sum, f) => sum + f.contribution, 0);

    if (topContribSum > 0.7) {
      factors.push({
        factor: 'concentrated_anomaly',
        description: 'Anomaly is driven by a few specific behaviors',
        impact: 'increases_confidence'
      });
    } else {
      factors.push({
        factor: 'distributed_anomaly',
        description: 'Anomaly spans multiple behavioral aspects',
        impact: 'moderate_confidence'
      });
    }

    // Check for specific high-value features
    const criticalFeatures = contributions.filter(f => 
      f.feature.includes('risk') || 
      f.feature.includes('anomaly') ||
      f.feature.includes('critical')
    );

    if (criticalFeatures.length > 0 && criticalFeatures[0].contribution > 0.2) {
      factors.push({
        factor: 'critical_behavior_detected',
        description: 'High-risk behavioral patterns observed',
        impact: 'increases_confidence'
      });
    }

    return factors;
  }

  /**
   * Generate concise summary
   */
  generateSummary(contributions, compositeScore) {
    const topFeature = contributions[0];
    const anomalyLevel = compositeScore >= 0.8 ? 'high' : 
                        compositeScore >= 0.65 ? 'moderate' : 'low';

    return `${anomalyLevel.toUpperCase()} anomaly (score: ${compositeScore.toFixed(3)}) ` +
           `primarily driven by ${this.humanizeFeatureName(topFeature.feature)}`;
  }

  /**
   * Convert feature names to human-readable format
   */
  humanizeFeatureName(featureName) {
    const humanNames = {
      // Temporal
      'request_rate_short': 'recent request rate',
      'request_rate_medium': 'medium-term request rate',
      'request_rate_long': 'long-term request rate',
      'rate_accel_short': 'request rate acceleration',
      'time_since_last': 'time since last activity',
      'inter_arrival_mean': 'average time between requests',
      'inter_arrival_std': 'request timing variability',
      
      // Statistical
      'risk_mean': 'average risk score',
      'risk_std': 'risk score variability',
      'anomaly_rate': 'anomalous behavior frequency',
      'anomaly_count': 'number of anomalies',
      
      // Distribution
      'endpoint_diversity': 'variety of accessed endpoints',
      'ip_diversity': 'number of IP addresses used',
      'ua_diversity': 'device/browser changes',
      'location_diversity': 'geographic location changes',
      'signal_entropy': 'behavioral unpredictability',
      'burst_count': 'number of request bursts',
      
      // Sequence
      'bigram_count': 'unique action sequences',
      'sequence_regularity': 'behavioral consistency',
      'risk_trend': 'risk trajectory',
      'cyclic_score': 'pattern repetition',
      'unusual_sequences': 'unexpected action patterns',
      
      // Context
      'endpoint_sensitivity': 'sensitivity of accessed resource',
      'http_method': 'type of request',
      
      // Graph
      'recent_sessions': 'number of recent sessions',
      'concurrent_sessions': 'simultaneous active sessions',
      'session_switch_rate': 'frequency of session switching',
      'device_diversity': 'number of different devices'
    };

    return humanNames[featureName] || featureName.replace(/_/g, ' ');
  }

  /**
   * Normalize feature value for display
   */
  normalizeForDisplay(value) {
    if (typeof value !== 'number') return 'N/A';
    
    if (Math.abs(value) < 0.01) {
      return value.toExponential(2);
    } else if (Math.abs(value) > 1000) {
      return value.toExponential(2);
    } else {
      return value.toFixed(3);
    }
  }

  /**
   * Update baseline statistics for features
   */
  updateBaseline(featureName, values) {
    if (values.length === 0) return;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    this.baselineStats[featureName] = { mean, std, count: values.length };
  }

  /**
   * Batch update baselines from training data
   */
  updateBaselinesFromTraining(trainingData, featureNames) {
    try {
      featureNames.forEach((name, idx) => {
        const values = trainingData.map(sample => sample[idx]).filter(v => v !== undefined);
        this.updateBaseline(name, values);
      });

      console.log(`[ModelExplainer] Updated baselines for ${featureNames.length} features`);
    } catch (error) {
      console.error('[ModelExplainer] Error updating baselines:', error);
    }
  }

  /**
   * Generate SHAP-like feature importance
   * Simplified version - calculates marginal contribution
   */
  calculateSHAPValues(features, model, featureNames) {
    const shapValues = [];

    // Baseline prediction (all features at mean)
    const baselinePrediction = this.getBaselinePrediction(model);

    // Calculate marginal contribution of each feature
    features.forEach((value, idx) => {
      // Create modified feature vector with this feature removed (set to mean)
      const modifiedFeatures = [...features];
      const baseline = this.baselineStats[featureNames[idx]];
      modifiedFeatures[idx] = baseline ? baseline.mean : 0;

      // Calculate marginal contribution
      // Note: This is a simplified approach; true SHAP would require model-specific implementation
      const marginalContribution = Math.abs(value - (baseline ? baseline.mean : 0));
      
      shapValues.push({
        feature: featureNames[idx],
        value: value,
        shapValue: marginalContribution,
        impact: value > (baseline ? baseline.mean : 0) ? 'positive' : 'negative'
      });
    });

    return shapValues.sort((a, b) => Math.abs(b.shapValue) - Math.abs(a.shapValue));
  }

  getBaselinePrediction(model) {
    // Return expected baseline - for anomaly detection, this should be ~0.5
    return 0.5;
  }

  /**
   * Export explainer state
   */
  serialize() {
    return {
      baselineStats: this.baselineStats
    };
  }

  /**
   * Load explainer state
   */
  deserialize(data) {
    this.baselineStats = data.baselineStats || {};
  }
}

module.exports = ModelExplainer;
