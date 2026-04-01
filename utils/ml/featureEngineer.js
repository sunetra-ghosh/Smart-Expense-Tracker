/**
 * Feature Engineering Pipeline
 * Issue #878: Behavioral ML Anomaly Detection
 * 
 * Extracts temporal, statistical, and graph-based features from behavioral signals
 */

const SessionBehaviorSignal = require('../../models/SessionBehaviorSignal');
const Session = require('../../models/Session');
const User = require('../../models/User');
const stats = require('simple-statistics');

class FeatureEngineer {
  constructor() {
    this.config = {
      temporalWindow: {
        short: 5 * 60 * 1000,    // 5 minutes
        medium: 30 * 60 * 1000,  // 30 minutes
        long: 2 * 60 * 60 * 1000 // 2 hours
      },
      featureNames: [],
      normalizationParams: {}
    };
  }

  /**
   * Extract features from behavioral signals
   */
  async extractFeatures(signals, sessionId, userId, requestContext = {}) {
    try {
      const features = [];
      const now = new Date();

      // Get historical signals for temporal features
      const historicalSignals = await this.getHistoricalSignals(sessionId, userId);

      // 1. Temporal Features
      const temporalFeatures = this.extractTemporalFeatures(signals, historicalSignals, now);
      features.push(...temporalFeatures);

      // 2. Statistical Features
      const statisticalFeatures = this.extractStatisticalFeatures(signals, historicalSignals);
      features.push(...statisticalFeatures);

      // 3. Signal Distribution Features
      const distributionFeatures = this.extractDistributionFeatures(signals, historicalSignals);
      features.push(...distributionFeatures);

      // 4. Sequence Pattern Features
      const sequenceFeatures = await this.extractSequenceFeatures(signals, sessionId);
      features.push(...sequenceFeatures);

      // 5. Context Features
      const contextFeatures = this.extractContextFeatures(requestContext);
      features.push(...contextFeatures);

      // 6. Graph-based Features
      const graphFeatures = await this.extractGraphFeatures(userId, sessionId);
      features.push(...graphFeatures);

      // Normalize features
      const normalizedFeatures = this.normalizeFeatures(features);

      return normalizedFeatures;
    } catch (error) {
      console.error('[FeatureEngineer] Error extracting features:', error);
      return [];
    }
  }

  /**
   * Extract features from pre-collected signals (for batch training)
   */
  async extractFeaturesFromSignals(signals) {
    try {
      if (!signals || signals.length === 0) return [];

      const sessionId = signals[0].sessionId;
      const userId = signals[0].userId;
      const now = signals[signals.length - 1].timestamp;

      const features = [];

      // Temporal features
      const temporalFeatures = this.extractTemporalFeatures(signals, signals, now);
      features.push(...temporalFeatures);

      // Statistical features
      const statisticalFeatures = this.extractStatisticalFeatures(signals, signals);
      features.push(...statisticalFeatures);

      // Distribution features
      const distributionFeatures = this.extractDistributionFeatures(signals, signals);
      features.push(...distributionFeatures);

      // Sequence features
      const sequenceFeatures = await this.extractSequenceFeatures(signals, sessionId);
      features.push(...sequenceFeatures);

      // Graph features
      const graphFeatures = await this.extractGraphFeatures(userId, sessionId);
      features.push(...graphFeatures);

      return this.normalizeFeatures(features);
    } catch (error) {
      console.error('[FeatureEngineer] Error in extractFeaturesFromSignals:', error);
      return [];
    }
  }

  /**
   * Temporal Features - Time-based patterns
   */
  extractTemporalFeatures(currentSignals, historicalSignals, now) {
    const features = [];

    try {
      // Request rate in different time windows
      const shortWindow = this.countSignalsInWindow(historicalSignals, now, this.config.temporalWindow.short);
      const mediumWindow = this.countSignalsInWindow(historicalSignals, now, this.config.temporalWindow.medium);
      const longWindow = this.countSignalsInWindow(historicalSignals, now, this.config.temporalWindow.long);

      features.push(shortWindow);
      features.push(mediumWindow);
      features.push(longWindow);

      // Request rate acceleration
      features.push(shortWindow - mediumWindow);
      features.push(mediumWindow - longWindow);

      // Time since last signal
      if (historicalSignals.length > 1) {
        const lastSignal = historicalSignals[historicalSignals.length - 1];
        const timeSinceLast = now - new Date(lastSignal.timestamp);
        features.push(timeSinceLast / 1000); // in seconds
      } else {
        features.push(0);
      }

      // Time of day features (cyclical encoding)
      const hour = now.getHours();
      const hourSin = Math.sin(2 * Math.PI * hour / 24);
      const hourCos = Math.cos(2 * Math.PI * hour / 24);
      features.push(hourSin);
      features.push(hourCos);

      // Day of week features (cyclical encoding)
      const day = now.getDay();
      const daySin = Math.sin(2 * Math.PI * day / 7);
      const dayCos = Math.cos(2 * Math.PI * day / 7);
      features.push(daySin);
      features.push(dayCos);

      // Inter-arrival time statistics
      const interArrivalTimes = this.calculateInterArrivalTimes(historicalSignals);
      if (interArrivalTimes.length > 0) {
        features.push(stats.mean(interArrivalTimes));
        features.push(stats.standardDeviation(interArrivalTimes));
        features.push(stats.min(interArrivalTimes));
        features.push(stats.max(interArrivalTimes));
      } else {
        features.push(0, 0, 0, 0);
      }
    } catch (error) {
      console.error('[FeatureEngineer] Error in temporal features:', error);
    }

    return features;
  }

  /**
   * Statistical Features - Aggregate statistics
   */
  extractStatisticalFeatures(currentSignals, historicalSignals) {
    const features = [];

    try {
      // Signal type distribution
      const signalTypes = this.countSignalTypes(historicalSignals);
      features.push(signalTypes.endpointSensitivity || 0);
      features.push(signalTypes.requestCadence || 0);
      features.push(signalTypes.geoContext || 0);
      features.push(signalTypes.userAgent || 0);
      features.push(signalTypes.privilegeTransition || 0);

      // Risk score statistics
      const riskScores = historicalSignals.map(s => s.riskImpact || 0);
      if (riskScores.length > 0) {
        features.push(stats.mean(riskScores));
        features.push(stats.standardDeviation(riskScores));
        features.push(stats.min(riskScores));
        features.push(stats.max(riskScores));
        features.push(stats.median(riskScores));
      } else {
        features.push(0, 0, 0, 0, 0);
      }

      // Anomaly flag frequency
      const anomalyCount = historicalSignals.filter(s => s.isAnomaly).length;
      const anomalyRate = historicalSignals.length > 0 ? anomalyCount / historicalSignals.length : 0;
      features.push(anomalyRate);
      features.push(anomalyCount);

      // Severity distribution
      const severities = {
        LOW: historicalSignals.filter(s => s.severity === 'LOW').length,
        MODERATE: historicalSignals.filter(s => s.severity === 'MODERATE').length,
        HIGH: historicalSignals.filter(s => s.severity === 'HIGH').length,
        CRITICAL: historicalSignals.filter(s => s.severity === 'CRITICAL').length
      };
      features.push(severities.LOW);
      features.push(severities.MODERATE);
      features.push(severities.HIGH);
      features.push(severities.CRITICAL);
    } catch (error) {
      console.error('[FeatureEngineer] Error in statistical features:', error);
    }

    return features;
  }

  /**
   * Distribution Features - Pattern analysis
   */
  extractDistributionFeatures(currentSignals, historicalSignals) {
    const features = [];

    try {
      // Endpoint diversity
      const endpoints = new Set(historicalSignals.map(s => s.metadata?.endpoint).filter(Boolean));
      features.push(endpoints.size);

      // IP address diversity
      const ipAddresses = new Set(historicalSignals.map(s => s.metadata?.ipAddress).filter(Boolean));
      features.push(ipAddresses.size);

      // User agent diversity
      const userAgents = new Set(historicalSignals.map(s => s.metadata?.userAgent).filter(Boolean));
      features.push(userAgents.size);

      // Location diversity
      const locations = new Set(historicalSignals.map(s => 
        s.metadata?.location ? `${s.metadata.location.lat},${s.metadata.location.lon}` : null
      ).filter(Boolean));
      features.push(locations.size);

      // Signal entropy (randomness measure)
      const signalEntropy = this.calculateEntropy(historicalSignals.map(s => s.signalType));
      features.push(signalEntropy);

      // Request burst detection
      const burstCount = this.detectBursts(historicalSignals);
      features.push(burstCount);

      // Time of day diversity (how many different hours)
      const hours = new Set(historicalSignals.map(s => new Date(s.timestamp).getHours()));
      features.push(hours.size);
    } catch (error) {
      console.error('[FeatureEngineer] Error in distribution features:', error);
    }

    return features;
  }

  /**
   * Sequence Pattern Features - Temporal patterns
   */
  async extractSequenceFeatures(signals, sessionId) {
    const features = [];

    try {
      if (signals.length < 2) {
        return Array(10).fill(0); // Return zero features if insufficient data
      }

      // N-gram patterns (sequences of signal types)
      const bigrams = this.extractNGrams(signals.map(s => s.signalType), 2);
      const trirams = this.extractNGrams(signals.map(s => s.signalType), 3);
      
      features.push(Object.keys(bigrams).length);
      features.push(Object.keys(trirams).length);

      // Most common sequence
      const mostCommonBigram = Object.values(bigrams).reduce((a, b) => Math.max(a, b), 0);
      features.push(mostCommonBigram);

      // Sequence regularity (inverse of variance in sequences)
      const sequenceRegularity = this.calculateSequenceRegularity(signals);
      features.push(sequenceRegularity);

      // Trend analysis (is risk increasing or decreasing)
      const riskTrend = this.calculateTrend(signals.map(s => s.riskImpact || 0));
      features.push(riskTrend);

      // Cyclic pattern detection
      const cyclicScore = this.detectCyclicPattern(signals);
      features.push(cyclicScore);

      // State transitions (how often signal type changes)
      const transitions = this.countStateTransitions(signals.map(s => s.signalType));
      features.push(transitions);

      // Predictability score
      const predictability = this.calculatePredictability(signals);
      features.push(predictability);

      // Unusual sequence detection
      const unusualSequences = this.detectUnusualSequences(signals);
      features.push(unusualSequences);

      // Session age at signal time
      const sessionAge = signals.length > 0 ? 
        (new Date(signals[signals.length - 1].timestamp) - new Date(signals[0].timestamp)) / 1000 : 0;
      features.push(sessionAge);
    } catch (error) {
      console.error('[FeatureEngineer] Error in sequence features:', error);
      return Array(10).fill(0);
    }

    return features;
  }

  /**
   * Context Features - Request context information
   */
  extractContextFeatures(requestContext) {
    const features = [];

    try {
      // Endpoint sensitivity (categorical encoding)
      const sensitivityMap = { 'LOW': 0, 'MODERATE': 0.33, 'HIGH': 0.67, 'CRITICAL': 1 };
      features.push(sensitivityMap[requestContext.endpointSensitivity] || 0);

      // HTTP method encoding
      const methodMap = { 'GET': 0, 'POST': 0.33, 'PUT': 0.67, 'DELETE': 1, 'PATCH': 0.5 };
      features.push(methodMap[requestContext.method] || 0);

      // Request size (normalized)
      features.push(Math.log(requestContext.contentLength || 1));

      // Time since session start
      features.push(requestContext.sessionAge || 0);

      // Is weekend
      features.push(requestContext.isWeekend ? 1 : 0);

      // Is business hours
      features.push(requestContext.isBusinessHours ? 1 : 0);
    } catch (error) {
      console.error('[FeatureEngineer] Error in context features:', error);
      return Array(6).fill(0);
    }

    return features;
  }

  /**
   * Graph-based Features - Relationship patterns
   */
  async extractGraphFeatures(userId, sessionId) {
    const features = [];

    try {
      // Session count for user (last 24 hours)
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentSessions = await Session.countDocuments({
        userId,
        createdAt: { $gte: dayAgo }
      });
      features.push(recentSessions);

      // Concurrent session count
      const concurrentSessions = await Session.countDocuments({
        userId,
        isActive: true
      });
      features.push(concurrentSessions);

      // Average session duration (historical)
      const historicalSessions = await Session.find({ userId }).limit(100);
      const avgDuration = historicalSessions.length > 0 ?
        historicalSessions.reduce((sum, s) => sum + (s.lastActivity - s.createdAt), 0) / historicalSessions.length / 1000 : 0;
      features.push(avgDuration);

      // Session switching rate (rapid changes)
      const sessionSwitches = await this.calculateSessionSwitchRate(userId);
      features.push(sessionSwitches);

      // Device diversity
      const devices = await Session.distinct('deviceFingerprint', { userId });
      features.push(devices.length);

      // IP diversity (last week)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const ips = await Session.distinct('ipAddress', { 
        userId,
        createdAt: { $gte: weekAgo }
      });
      features.push(ips.length);
    } catch (error) {
      console.error('[FeatureEngineer] Error in graph features:', error);
      return Array(6).fill(0);
    }

    return features;
  }

  // ==================== Helper Methods ====================

  async getHistoricalSignals(sessionId, userId) {
    try {
      const signals = await SessionBehaviorSignal.find({
        $or: [{ sessionId }, { userId }]
      })
      .sort({ timestamp: -1 })
      .limit(200);

      return signals;
    } catch (error) {
      console.error('[FeatureEngineer] Error fetching historical signals:', error);
      return [];
    }
  }

  countSignalsInWindow(signals, now, windowMs) {
    const windowStart = new Date(now - windowMs);
    return signals.filter(s => new Date(s.timestamp) >= windowStart).length;
  }

  calculateInterArrivalTimes(signals) {
    const times = [];
    for (let i = 1; i < signals.length; i++) {
      const diff = new Date(signals[i].timestamp) - new Date(signals[i - 1].timestamp);
      times.push(diff / 1000); // in seconds
    }
    return times;
  }

  countSignalTypes(signals) {
    const counts = {};
    signals.forEach(s => {
      counts[s.signalType] = (counts[s.signalType] || 0) + 1;
    });
    return counts;
  }

  calculateEntropy(values) {
    const counts = {};
    values.forEach(v => {
      counts[v] = (counts[v] || 0) + 1;
    });

    const total = values.length;
    let entropy = 0;

    Object.values(counts).forEach(count => {
      const p = count / total;
      entropy -= p * Math.log2(p);
    });

    return entropy;
  }

  detectBursts(signals, burstThreshold = 10, windowMs = 60000) {
    let burstCount = 0;
    for (let i = 0; i < signals.length; i++) {
      const windowStart = new Date(signals[i].timestamp);
      const windowEnd = new Date(windowStart.getTime() + windowMs);
      
      const signalsInWindow = signals.filter(s => {
        const t = new Date(s.timestamp);
        return t >= windowStart && t < windowEnd;
      });

      if (signalsInWindow.length >= burstThreshold) {
        burstCount++;
        i += signalsInWindow.length; // Skip past this burst
      }
    }
    return burstCount;
  }

  extractNGrams(sequence, n) {
    const ngrams = {};
    for (let i = 0; i <= sequence.length - n; i++) {
      const ngram = sequence.slice(i, i + n).join('->');
      ngrams[ngram] = (ngrams[ngram] || 0) + 1;
    }
    return ngrams;
  }

  calculateSequenceRegularity(signals) {
    if (signals.length < 2) return 0;
    
    const intervals = this.calculateInterArrivalTimes(signals);
    if (intervals.length === 0) return 0;
    
    const variance = stats.variance(intervals);
    const mean = stats.mean(intervals);
    
    return mean > 0 ? 1 / (1 + variance / mean) : 0;
  }

  calculateTrend(values) {
    if (values.length < 2) return 0;
    
    const indices = values.map((_, i) => i);
    const regression = stats.linearRegression([indices, values]);
    
    return regression.m; // slope
  }

  detectCyclicPattern(signals) {
    // Simple autocorrelation at lag 1
    if (signals.length < 2) return 0;
    
    const values = signals.map(s => s.riskImpact || 0);
    const mean = stats.mean(values);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < values.length - 1; i++) {
      numerator += (values[i] - mean) * (values[i + 1] - mean);
    }
    
    for (let i = 0; i < values.length; i++) {
      denominator += Math.pow(values[i] - mean, 2);
    }
    
    return denominator > 0 ? numerator / denominator : 0;
  }

  countStateTransitions(sequence) {
    let transitions = 0;
    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] !== sequence[i - 1]) {
        transitions++;
      }
    }
    return transitions;
  }

  calculatePredictability(signals) {
    // Based on regularity and low entropy
    if (signals.length < 2) return 0;
    
    const regularity = this.calculateSequenceRegularity(signals);
    const entropy = this.calculateEntropy(signals.map(s => s.signalType));
    const maxEntropy = Math.log2(10); // Assume max 10 signal types
    
    return (regularity + (1 - entropy / maxEntropy)) / 2;
  }

  detectUnusualSequences(signals) {
    // Count sequences that don't fit common patterns
    // For now, count rapid severity escalations
    let unusualCount = 0;
    const severityOrder = { 'LOW': 0, 'MODERATE': 1, 'HIGH': 2, 'CRITICAL': 3 };
    
    for (let i = 1; i < signals.length; i++) {
      const prevSev = severityOrder[signals[i - 1].severity] || 0;
      const currSev = severityOrder[signals[i].severity] || 0;
      
      if (currSev - prevSev >= 2) {
        unusualCount++;
      }
    }
    
    return unusualCount;
  }

  async calculateSessionSwitchRate(userId) {
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const signals = await SessionBehaviorSignal.find({
        userId,
        timestamp: { $gte: tenMinAgo }
      }).sort({ timestamp: 1 });

      const uniqueSessions = new Set(signals.map(s => s.sessionId.toString()));
      return uniqueSessions.size;
    } catch (error) {
      return 0;
    }
  }

  normalizeFeatures(features) {
    // Min-max normalization to [0, 1] range
    return features.map((f, i) => {
      if (typeof f !== 'number' || isNaN(f)) return 0;
      
      // Apply log transformation for very large values
      if (Math.abs(f) > 1000) {
        f = Math.sign(f) * Math.log(Math.abs(f) + 1);
      }
      
      // Clip extreme values
      return Math.max(-10, Math.min(10, f));
    });
  }

  getFeatureNames() {
    return [
      // Temporal (15)
      'request_rate_short', 'request_rate_medium', 'request_rate_long',
      'rate_accel_short', 'rate_accel_medium', 'time_since_last',
      'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
      'inter_arrival_mean', 'inter_arrival_std', 'inter_arrival_min', 'inter_arrival_max',
      
      // Statistical (15)
      'signal_endpoint', 'signal_cadence', 'signal_geo', 'signal_ua', 'signal_priv',
      'risk_mean', 'risk_std', 'risk_min', 'risk_max', 'risk_median',
      'anomaly_rate', 'anomaly_count',
      'severity_low', 'severity_moderate', 'severity_high', 'severity_critical',
      
      // Distribution (7)
      'endpoint_diversity', 'ip_diversity', 'ua_diversity', 'location_diversity',
      'signal_entropy', 'burst_count', 'hour_diversity',
      
      // Sequence (10)
      'bigram_count', 'trigram_count', 'most_common_bigram', 'sequence_regularity',
      'risk_trend', 'cyclic_score', 'state_transitions', 'predictability',
      'unusual_sequences', 'session_age',
      
      // Context (6)
      'endpoint_sensitivity', 'http_method', 'request_size', 'time_since_session_start',
      'is_weekend', 'is_business_hours',
      
      // Graph (6)
      'recent_sessions', 'concurrent_sessions', 'avg_session_duration',
      'session_switch_rate', 'device_diversity', 'ip_diversity_week'
    ];
  }

  getConfig() {
    return this.config;
  }

  loadConfig(config) {
    this.config = { ...this.config, ...config };
  }
}

module.exports = FeatureEngineer;
