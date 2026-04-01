const geolib = require('geolib');
const SecurityIncident = require('../../models/SecurityIncident');
const Session = require('../../models/Session');
const User = require('../../models/User');
const incidentPlaybookEngineService = require('./incidentPlaybookEngineService');

/**
 * Impossible Travel Playbook Service
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Detects and responds to impossible travel scenarios
 * Triggers when user logs in from geographically distant locations within impossible timeframe
 */

class ImpossibleTravelPlaybookService {
  /**
   * Detect impossible travel
   */
  async detectImpossibleTravel(userId, currentLocation, currentTimestamp) {
    try {
      const user = await User.findById(userId);
      if (!user) return null;
      
      // Get recent sessions
      const recentSessions = await Session.find({
        user: userId,
        createdAt: {
          $gte: new Date(currentTimestamp.getTime() - 48 * 60 * 60 * 1000)  // Last 48 hours
        }
      }).sort({ createdAt: -1 }).limit(10);
      
      if (recentSessions.length < 2) return null;
      
      // Check for impossible travel
      const lastSession = recentSessions[1];
      if (!lastSession.location || !lastSession.location.latitude || !lastSession.location.longitude) {
        return null;
      }
      
      const lastLocation = {
        latitude: lastSession.location.latitude,
        longitude: lastSession.location.longitude
      };
      
      const currentGeo = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude
      };
      
      // Calculate distance between locations
      const distanceKm = geolib.getDistance(lastLocation, currentGeo) / 1000;
      const timeDiffHours = (currentTimestamp.getTime() - lastSession.createdAt.getTime()) / (60 * 60 * 1000);
      
      // Average commercial flight speed is roughly 900 km/h
      const maxPossibleDistanceKm = 900 * timeDiffHours;
      
      // If distance > max possible distance, it's impossible travel
      if (distanceKm > maxPossibleDistanceKm) {
        return {
          detected: true,
          improbabil:ty: Math.min(100, (distanceKm / maxPossibleDistanceKm) * 100),
          lastLocation,
          currentLocation: currentGeo,
          distanceKm,
          timeDiffHours,
          lastSessionId: lastSession._id,
          currentSessionId: null  // Will be set by caller
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('Impossible travel detection error:', error);
      return null;
    }
  }

  /**
   * Trigger impossible travel playbook
   */
  async triggerPlaybook(userId, impossibleTravelData) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');
      
      // Create incident
      const incident = new SecurityIncident({
        incidentId: `impossible_travel_${Date.now()}`,
        title: 'Suspected Impossible Travel',
        description: `User logged in from ${impossibleTravelData.distanceKm.toFixed(0)}km away in ${impossibleTravelData.timeDiffHours.toFixed(1)} hours`,
        incidentType: 'SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL',
        severity: this.calculateSeverity(impossibleTravelData.improbability),
        targetUser: userId,
        targetUserEmail: user.email,
        detectedAt: new Date(),
        context: impossibleTravelData,
        status: 'DETECTED'
      });
      
      await incident.save();
      
      // Trigger playbook through orchestration engine
      const execution = await incidentPlaybookEngineService.detectAndOrchestrate({
        incidentId: incident._id,
        incidentType: 'SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL',
        userId,
        severity: incident.severity,
        confidenceScore: Math.min(100, impossibleTravelData.improbability),
        triggerEvent: 'Impossible Travel Detection',
        description: incident.description,
        suspiciousGeoLocation: impossibleTravelData.currentLocation
      });
      
      return { incident, execution };
      
    } catch (error) {
      console.error('Playbook trigger error:', error);
      throw error;
    }
  }

  /**
   * Calculate severity based on improbability
   */
  calculateSeverity(improbability) {
    if (improbability >= 80) return 'CRITICAL';
    if (improbability >= 60) return 'HIGH';
    if (improbability >= 40) return 'MEDIUM';
    return 'LOW';
  }
}

/**
 * Two-FA Bypass Playbook Service
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Detects repeated 2FA bypass attempts and triggers containment
 */

class TwoFABypassPlaybookService {
  /**
   * Detect 2FA bypass attempts
   */
  async detectTwoFABypass(userId, timeWindowMinutes = 60) {
    try {
      const user = await User.findById(userId);
      if (!user) return null;
      
      const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
      
      // Count failed 2FA attempts
      const failedAttempts = await this.countFailedAttempts(userId, cutoffTime);
      
      // Threshold for concern
      const BYPASS_THRESHOLD = 5;
      
      if (failedAttempts.count >= BYPASS_THRESHOLD) {
        return {
          detected: true,
          attemptCount: failedAttempts.count,
          timeWindowMinutes,
          severity: this.calculateBypassSeverity(failedAttempts.count),
          recentAttempts: failedAttempts.attempts
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('2FA bypass detection error:', error);
      return null;
    }
  }

  /**
   * Count failed 2FA attempts
   */
  async countFailedAttempts(userId, since) {
    // This would query your 2FA attempt logs/audit trail
    // For now returning placeholder
    return {
      count: 0,
      attempts: []
    };
  }

  /**
   * Trigger 2FA bypass playbook
   */
  async triggerPlaybook(userId, bypassData) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');
      
      // Create incident
      const incident = new SecurityIncident({
        incidentId: `2fa_bypass_${Date.now()}`,
        title: 'Repeated 2FA Bypass Attempts',
        description: `${bypassData.attemptCount} failed 2FA attempts in ${bypassData.timeWindowMinutes} minutes`,
        incidentType: 'REPEATED_2FA_BYPASS',
        severity: bypassData.severity,
        targetUser: userId,
        targetUserEmail: user.email,
        detectedAt: new Date(),
        context: bypassData,
        status: 'DETECTED'
      });
      
      await incident.save();
      
      // Trigger stronger playbook due to repeated bypass
      const execution = await incidentPlaybookEngineService.detectAndOrchestrate({
        incidentId: incident._id,
        incidentType: 'REPEATED_2FA_BYPASS',
        userId,
        severity: incident.severity,
        confidenceScore: 90,
        triggerEvent: '2FA Bypass Detection',
        description: incident.description,
        bypassAttempts: bypassData.attemptCount
      });
      
      return { incident, execution };
      
    } catch (error) {
      console.error('2FA bypass playbook trigger error:', error);
      throw error;
    }
  }

  /**
   * Calculate severity for bypass attempts
   */
  calculateBypassSeverity(attemptCount) {
    if (attemptCount >= 10) return 'CRITICAL';
    if (attemptCount >= 7) return 'HIGH';
    if (attemptCount >= 5) return 'MEDIUM';
    return 'LOW';
  }
}

/**
 * Privilege-Sensitive Action Playbook Service
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Detects unusual privilege-sensitive actions
 * Actions like admin panel access, bulk exports, permission changes
 */

class PrivilegeSensitiveActionPlaybookService {
  /**
   * Detect unusual privilege-sensitive action
   */
  async detectUnusualPrivilegeAction(userId, action, userProfile) {
    try {
      const actionPatterns = {
        'ADMIN_PANEL_ACCESS': {
          severity: 'HIGH',
          requiresApproval: true,
          riskScore: 80
        },
        'BULK_DATA_EXPORT': {
          severity: 'HIGH',
          requiresApproval: true,
          riskScore: 75
        },
        'PERMISSION_ESCALATION': {
          severity: 'CRITICAL',
          requiresApproval: true,
          riskScore: 95
        },
        'ROLE_CHANGE': {
          severity: 'HIGH',
          requiresApproval: true,
          riskScore: 85
        },
        'USER_DELETE': {
          severity: 'CRITICAL',
          requiresApproval: true,
          riskScore: 90
        },
        'API_KEY_CREATION': {
          severity: 'MEDIUM',
          requiresApproval: true,
          riskScore: 70
        }
      };
      
      const actionConfig = actionPatterns[action];
      if (!actionConfig) return null;
      
      // Check if action is unusual for this user
      const isUnusual = await this.isUnusualForUser(userId, action);
      
      if (isUnusual) {
        return {
          detected: true,
          action,
          isUnusual,
          severity: actionConfig.severity,
          riskScore: actionConfig.riskScore
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('Privilege action detection error:', error);
      return null;
    }
  }

  /**
   * Check if action is unusual for user
   */
  async isUnusualForUser(userId, action) {
    // Query user's historical actions
    // If this is first time or rare occurrence, return true
    
    // This would be implemented with action logs
    return false;  // Placeholder
  }

  /**
   * Trigger privilege action playbook
   */
  async triggerPlaybook(userId, actionData) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');
      
      const incident = new SecurityIncident({
        incidentId: `privilege_action_${Date.now()}`,
        title: `Unusual Privilege-Sensitive Action: ${actionData.action}`,
        description: `User attempted privilege-sensitive action: ${actionData.action}`,
        incidentType: 'UNUSUAL_PRIVILEGE_ACTION',
        severity: actionData.severity,
        targetUser: userId,
        targetUserEmail: user.email,
        detectedAt: new Date(),
        context: actionData,
        status: 'DETECTED'
      });
      
      await incident.save();
      
      // Trigger stronger response for critical actions
      const execution = await incidentPlaybookEngineService.detectAndOrchestrate({
        incidentId: incident._id,
        incidentType: 'UNUSUAL_PRIVILEGE_ACTION',
        userId,
        severity: incident.severity,
        confidenceScore: actionData.riskScore,
        triggerEvent: 'Privilege Action Detection',
        description: incident.description,
        privilegeAction: actionData.action
      });
      
      return { incident, execution };
      
    } catch (error) {
      console.error('Privilege action playbook trigger error:', error);
      throw error;
    }
  }
}

/**
 * Multi-Account Campaign Playbook Service
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Detects coordinated attack campaigns across multiple accounts
 */

class MultiAccountCampaignPlaybookService {
  /**
   * Detect multi-account campaign
   */
  async detectMultiAccountCampaign(timeWindowMinutes = 60) {
    try {
      const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
      
      // Look for clusters of suspicious incidents
      const incidents = await SecurityIncident.find({
        detectedAt: { $gte: cutoffTime },
        status: 'DETECTED'
      });
      
      // Group by origin (IP, device fingerprint, etc.)
      const campaignClusters = this.clusterIncidents(incidents);
      
      // If multiple accounts hit from same source - likely campaign
      for (const cluster of campaignClusters) {
        if (cluster.affectedUsers.size >= 3) {
          return {
            detected: true,
            campaignId: `campaign_${Date.now()}`,
            affectedAccountCount: cluster.affectedUsers.size,
            affectedUsers: Array.from(cluster.affectedUsers),
            commonSource: cluster.source,
            incidentCount: cluster.incidents.length,
            severity: 'CRITICAL'
          };
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('Multi-account campaign detection error:', error);
      return null;
    }
  }

  /**
   * Cluster incidents by origin
   */
  clusterIncidents(incidents) {
    const clusters = new Map();
    
    for (const incident of incidents) {
      const source = incident.context?.clientIP || 'UNKNOWN';
      
      if (!clusters.has(source)) {
        clusters.set(source, {
          source,
          affectedUsers: new Set(),
          incidents: []
        });
      }
      
      const cluster = clusters.get(source);
      cluster.affectedUsers.add(incident.targetUser.toString());
      cluster.incidents.push(incident);
    }
    
    return Array.from(clusters.values());
  }

  /**
   * Trigger multi-account campaign playbook
   */
  async triggerPlaybook(campaignData) {
    try {
      // Create campaign incident
      const incident = new SecurityIncident({
        incidentId: campaignData.campaignId,
        title: `Multi-Account Attack Campaign Detected`,
        description: `Coordinated attack affecting ${campaignData.affectedAccountCount} accounts from source ${campaignData.commonSource}`,
        incidentType: 'MULTI_ACCOUNT_CAMPAIGN',
        severity: 'CRITICAL',
        targetUser: null,  // Multiple users
        detectedAt: new Date(),
        context: campaignData,
        status: 'DETECTED',
        affectedUsers: campaignData.affectedUsers
      });
      
      await incident.save();
      
      // Trigger strongest response - contains entire campaign
      const execution = await incidentPlaybookEngineService.detectAndOrchestrate({
        incidentId: incident._id,
        incidentType: 'MULTI_ACCOUNT_CAMPAIGN',
        severity: 'CRITICAL',
        confidenceScore: 95,
        triggerEvent: 'Multi-Account Campaign Detection',
        description: incident.description,
        affectedUsers: campaignData.affectedUsers,
        campaignSource: campaignData.commonSource
      });
      
      return { incident, execution };
      
    } catch (error) {
      console.error('Campaign playbook trigger error:', error);
      throw error;
    }
  }
}

module.exports = {
  ImpossibleTravelPlaybookService: new ImpossibleTravelPlaybookService(),
  TwoFABypassPlaybookService: new TwoFABypassPlaybookService(),
  PrivilegeSensitiveActionPlaybookService: new PrivilegeSensitiveActionPlaybookService(),
  MultiAccountCampaignPlaybookService: new MultiAccountCampaignPlaybookService()
};
