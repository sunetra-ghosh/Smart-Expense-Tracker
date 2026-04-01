/**
 * Drift Detector - Model Performance Monitoring
 * Issue #878: Behavioral ML Anomaly Detection
 * 
 * Detects distribution drift in incoming data to trigger model retraining
 */

const stats = require('simple-statistics');

class DriftDetector {
  constructor(config = {}) {
    this.windowSize = config.windowSize || 1000;
    this.driftThreshold = config.driftThreshold || 0.15; // 15% drift triggers retraining
    this.referenceWindow = [];
    this.currentWindow = [];
    this.driftHistory = [];
    
    // Statistical tests
    this.useKSTest = config.useKSTest !== false;
    this.usePSI = config.usePSI !== false;
  }

  /**
   * Add new data point to current window
   */
  addDataPoint(features, score) {
    this.currentWindow.push({ features, score, timestamp: Date.now() });

    // Keep window size limited
    if (this.currentWindow.length > this.windowSize) {
      this.currentWindow.shift();
    }

    // If no reference window, initialize it
    if (this.referenceWindow.length === 0 && this.currentWindow.length >= this.windowSize) {
      this.referenceWindow = [...this.currentWindow];
      this.currentWindow = [];
    }
  }

  /**
   * Calculate drift metrics
   */
  calculateDrift() {
    if (this.referenceWindow.length < 100 || this.currentWindow.length < 100) {
      return {
        isDrifting: false,
        driftScore: 0,
        confidence: 'LOW',
        details: 'Insufficient data for drift detection'
      };
    }

    try {
      // Calculate multiple drift metrics
      const psiDrift = this.calculatePSI();
      const ksDrift = this.useKSTest ? this.calculateKSStatistic() : 0;
      const distributionDrift = this.calculateDistributionDrift();
      const scoreDrift = this.calculateScoreDrift();

      // Composite drift score (weighted average)
      const driftScore = (
        psiDrift * 0.35 +
        ksDrift * 0.25 +
        distributionDrift * 0.25 +
        scoreDrift * 0.15
      );

      const isDrifting = driftScore > this.driftThreshold;

      // Calculate confidence based on data size
      const confidence = this.currentWindow.length >= this.windowSize ? 'HIGH' :
                        this.currentWindow.length >= this.windowSize / 2 ? 'MEDIUM' : 'LOW';

      const result = {
        isDrifting,
        driftScore,
        confidence,
        details: {
          psi: psiDrift,
          ks: ksDrift,
          distribution: distributionDrift,
          score: scoreDrift
        },
        timestamp: Date.now()
      };

      // Log drift history
      this.driftHistory.push(result);
      if (this.driftHistory.length > 100) {
        this.driftHistory.shift();
      }

      return result;
    } catch (error) {
      console.error('[DriftDetector] Error calculating drift:', error);
      return {
        isDrifting: false,
        driftScore: 0,
        confidence: 'LOW',
        details: error.message
      };
    }
  }

  /**
   * Population Stability Index (PSI) - measures distribution shift
   */
  calculatePSI() {
    try {
      // Extract scores
      const refScores = this.referenceWindow.map(d => d.score);
      const currScores = this.currentWindow.map(d => d.score);

      // Create bins
      const bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
      const refCounts = this.binData(refScores, bins);
      const currCounts = this.binData(currScores, bins);

      // Calculate PSI
      let psi = 0;
      for (let i = 0; i < bins.length - 1; i++) {
        const refPct = refCounts[i] / refScores.length;
        const currPct = currCounts[i] / currScores.length;

        if (refPct > 0 && currPct > 0) {
          psi += (currPct - refPct) * Math.log(currPct / refPct);
        }
      }

      // Normalize PSI to [0, 1] range
      // PSI > 0.25 typically indicates significant drift
      return Math.min(1, psi / 0.25);
    } catch (error) {
      console.error('[DriftDetector] Error in PSI calculation:', error);
      return 0;
    }
  }

  /**
   * Kolmogorov-Smirnov statistic - distribution difference
   */
  calculateKSStatistic() {
    try {
      const refScores = this.referenceWindow.map(d => d.score).sort((a, b) => a - b);
      const currScores = this.currentWindow.map(d => d.score).sort((a, b) => a - b);

      // Calculate empirical CDFs and max difference
      let maxDiff = 0;
      let refIdx = 0;
      let currIdx = 0;

      while (refIdx < refScores.length || currIdx < currScores.length) {
        const refCDF = refIdx / refScores.length;
        const currCDF = currIdx / currScores.length;
        const diff = Math.abs(refCDF - currCDF);

        if (diff > maxDiff) {
          maxDiff = diff;
        }

        if (refIdx >= refScores.length) {
          currIdx++;
        } else if (currIdx >= currScores.length) {
          refIdx++;
        } else if (refScores[refIdx] < currScores[currIdx]) {
          refIdx++;
        } else {
          currIdx++;
        }
      }

      return maxDiff; // Already in [0, 1] range
    } catch (error) {
      console.error('[DriftDetector] Error in KS calculation:', error);
      return 0;
    }
  }

  /**
   * Feature distribution drift - compare feature statistics
   */
  calculateDistributionDrift() {
    try {
      if (this.referenceWindow.length === 0 || this.currentWindow.length === 0) {
        return 0;
      }

      const numFeatures = this.referenceWindow[0].features.length;
      let totalDrift = 0;

      for (let i = 0; i < numFeatures; i++) {
        const refFeatures = this.referenceWindow.map(d => d.features[i]);
        const currFeatures = this.currentWindow.map(d => d.features[i]);

        // Compare means and standard deviations
        const refMean = stats.mean(refFeatures);
        const currMean = stats.mean(currFeatures);
        const refStd = stats.standardDeviation(refFeatures);
        const currStd = stats.standardDeviation(currFeatures);

        // Normalized difference
        const meanDiff = refStd > 0 ? Math.abs(currMean - refMean) / refStd : 0;
        const stdDiff = refStd > 0 ? Math.abs(currStd - refStd) / refStd : 0;

        totalDrift += meanDrift + stdDiff;
      }

      // Average drift per feature, normalized
      const avgDrift = totalDrift / (numFeatures * 2);
      return Math.min(1, avgDrift);
    } catch (error) {
      console.error('[DriftDetector] Error in distribution drift:', error);
      return 0;
    }
  }

  /**
   * Score drift - change in prediction distribution
   */
  calculateScoreDrift() {
    try {
      const refScores = this.referenceWindow.map(d => d.score);
      const currScores = this.currentWindow.map(d => d.score);

      const refMean = stats.mean(refScores);
      const currMean = stats.mean(currScores);
      const refStd = stats.standardDeviation(refScores);

      // Standardized mean difference
      const drift = refStd > 0 ? Math.abs(currMean - refMean) / refStd : 0;

      return Math.min(1, drift / 2); // Normalize to [0, 1]
    } catch (error) {
      console.error('[DriftDetector] Error in score drift:', error);
      return 0;
    }
  }

  /**
   * Bin data into histogram buckets
   */
  binData(data, bins) {
    const counts = Array(bins.length - 1).fill(0);
    
    data.forEach(value => {
      for (let i = 0; i < bins.length - 1; i++) {
        if (value >= bins[i] && value < bins[i + 1]) {
          counts[i]++;
          break;
        }
      }
    });

    return counts;
  }

  /**
   * Get drift trends over time
   */
  getDriftTrends() {
    if (this.driftHistory.length < 2) {
      return {
        trend: 'STABLE',
        recentDrift: 0,
        avgDrift: 0
      };
    }

    const recentDrift = this.driftHistory.slice(-5).map(h => h.driftScore);
    const avgDrift = stats.mean(recentDrift);
    
    // Calculate trend (increasing/decreasing)
    const trend = this.calculateTrend(recentDrift);

    return {
      trend: trend > 0.05 ? 'INCREASING' : trend < -0.05 ? 'DECREASING' : 'STABLE',
      recentDrift: recentDrift[recentDrift.length - 1],
      avgDrift,
      slope: trend
    };
  }

  calculateTrend(values) {
    if (values.length < 2) return 0;
    
    const indices = values.map((_, i) => i);
    const n = values.length;
    
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumXX = indices.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Reset detector (after retraining)
   */
  reset() {
    this.referenceWindow = [...this.currentWindow];
    this.currentWindow = [];
    this.driftHistory = [];
    console.log('[DriftDetector] Drift detector reset with new reference window');
  }

  /**
   * Get current statistics
   */
  getStatistics() {
    return {
      referenceWindowSize: this.referenceWindow.length,
      currentWindowSize: this.currentWindow.length,
      driftHistoryLength: this.driftHistory.length,
      latestDrift: this.driftHistory.length > 0 
        ? this.driftHistory[this.driftHistory.length - 1]
        : null,
      trends: this.getDriftTrends()
    };
  }

  /**
   * Serialize for storage
   */
  serialize() {
    return {
      windowSize: this.windowSize,
      driftThreshold: this.driftThreshold,
      referenceWindow: this.referenceWindow,
      currentWindow: this.currentWindow,
      driftHistory: this.driftHistory
    };
  }

  /**
   * Deserialize from storage
   */
  deserialize(data) {
    this.windowSize = data.windowSize || this.windowSize;
    this.driftThreshold = data.driftThreshold || this.driftThreshold;
    this.referenceWindow = data.referenceWindow || [];
    this.currentWindow = data.currentWindow || [];
    this.driftHistory = data.driftHistory || [];
  }
}

module.exports = DriftDetector;
