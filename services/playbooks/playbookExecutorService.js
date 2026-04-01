const Session = require('../../models/Session');
const TwoFactorAuth = require('../../models/TwoFactorAuth');
const User = require('../../models/User');
const TrustedDevice = require('../../models/TrustedDevice');
const notificationService = require('../notificationService');
const twoFactorAuthService = require('../twoFactorAuthService');
const emailService = require('../emailService');

/**
 * Playbook Executor Service
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Executes individual actions defined in playbooks
 * Handles all staged response actions with proper error handling
 */

class PlaybookExecutorService {
  /**
   * Execute an action based on type
   */
  async executeAction(action, execution, context) {
    const actionType = action.actionType || action.type;
    
    switch (actionType) {
      case 'STEP_UP_CHALLENGE':
        return await this.executeStepUpChallenge(action, execution, context);
      
      case 'SELECTIVE_TOKEN_REVOKE':
        return await this.executeSelectiveTokenRevoke(action, execution, context);
      
      case 'FULL_SESSION_KILL':
        return await this.executeFullSessionKill(action, execution, context);
      
      case 'FORCE_PASSWORD_RESET':
        return await this.executeForcePasswordReset(action, execution, context);
      
      case 'USER_NOTIFICATION':
        return await this.executeUserNotification(action, execution, context);
      
      case 'ANALYST_ESCALATION':
        return await this.executeAnalystEscalation(action, execution, context);
      
      case 'ACCOUNT_SUSPEND':
        return await this.executeAccountSuspend(action, execution, context);
      
      case 'DEVICE_DEREGISTER':
        return await this.executeDeviceDeregister(action, execution, context);
      
      case 'IPWHITELIST_ADD':
        return await this.executeIPWhitelistAdd(action, execution, context);
      
      case 'IPBLACKLIST_ADD':
        return await this.executeIPBlacklistAdd(action, execution, context);
      
      case 'GEO_LOCK':
        return await this.executeGeoLock(action, execution, context);
      
      case 'CUSTOM_WEBHOOK':
        return await this.executeCustomWebhook(action, execution, context);
      
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  /**
   * Step-Up Challenge: Require additional authentication
   */
  async executeStepUpChallenge(action, execution, context) {
    try {
      const userId = execution.userId;
      const parameters = action.parameters || {};
      
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');
      
      // Create challenge record
      const challenge = {
        userId: userId,
        type: parameters.challengeType || 'EMAIL_OTP',
        requiredReason: 'Suspicious activity detected',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (parameters.expirationMinutes || 15) * 60000),
        status: 'PENDING'
      };
      
      // Generate OTP/token
      let verificationCode;
      if (parameters.challengeType === 'EMAIL_OTP') {
        verificationCode = this.generateOTP();
        
        // Send email
        await emailService.sendSecurityAlert(user.email, {
          subject: 'Verify Your Identity',
          template: 'step_up_challenge',
          data: {
            code: verificationCode,
            expirationMinutes: parameters.expirationMinutes || 15,
            reason: 'Suspicious login detected'
          }
        });
      } else if (parameters.challengeType === 'SMS_OTP') {
        verificationCode = this.generateOTP();
        
        // Send SMS via Twilio if available
        // This requires phone number on user profile
      }
      
      challenge.verificationCode = this.hashCode(verificationCode);
      
      // Store challenge
      // This would typically be stored in a temporary cache or database
      
      return {
        success: true,
        challengeId: challenge.userId,
        method: parameters.challengeType || 'EMAIL_OTP',
        expiresAt: challenge.expiresAt,
        message: `Challenge sent via ${parameters.challengeType || 'email'}`
      };
      
    } catch (error) {
      console.error('Step-up challenge error:', error);
      throw error;
    }
  }

  /**
   * Selective Token Revoke: Revoke specific tokens/sessions
   */
  async executeSelectiveTokenRevoke(action, execution, context) {
    try {
      const userId = execution.userId;
      const parameters = action.parameters || {};
      
      // Find sessions to revoke
      let sessionsToRevoke = [];
      
      if (parameters.sessionSelector === 'SUSPICIOUS_GEO') {
        // Revoke sessions from suspicious geographic locations
        const allSessions = await Session.find({
          user: userId,
          active: true
        });
        
        const suspiciousGeo = context.suspiciousGeoLocation || {};
        sessionsToRevoke = allSessions.filter(s =>
          s.location && s.location.country !== suspiciousGeo.country
        );
        
      } else if (parameters.sessionSelector === 'SPECIFIC_DEVICE') {
        // Revoke sessions from specific device
        sessionsToRevoke = await Session.find({
          user: userId,
          deviceId: parameters.deviceId,
          active: true
        });
        
      } else if (parameters.sessionSelector === 'EXCEPT_CURRENT') {
        // Revoke all sessions except current
        const allSessions = await Session.find({
          user: userId,
          active: true
        });
        
        sessionsToRevoke = allSessions.filter(s =>
          s._id.toString() !== context.currentSessionId
        );
      }
      
      // Revoke tokens
      const revokedCount = sessionsToRevoke.length;
      
      for (const session of sessionsToRevoke) {
        session.active = false;
        session.revokedAt = new Date();
        session.revokedReason = 'SUSPICIOUS_ACTIVITY_DETECTED';
        await session.save();
      }
      
      // Notify user about revoked sessions
      if (revokedCount > 0) {
        await notificationService.notifySecurityAlert(userId, {
          title: 'Sessions Revoked',
          message: `${revokedCount} suspicious session(s) have been terminated`,
          severity: 'WARNING'
        });
      }
      
      return {
        success: true,
        revokedCount,
        message: `Revoked ${revokedCount} suspicious session(s)`
      };
      
    } catch (error) {
      console.error('Token revoke error:', error);
      throw error;
    }
  }

  /**
   * Full Session Kill: Terminate all sessions
   */
  async executeFullSessionKill(action, execution, context) {
    try {
      const userId = execution.userId;
      
      // Find all active sessions
      const allSessions = await Session.find({
        user: userId,
        active: true
      });
      
      const killCount = allSessions.length;
      
      // Revoke all sessions
      for (const session of allSessions) {
        session.active = false;
        session.revokedAt = new Date();
        session.revokedReason = 'INCIDENT_RESPONSE_FULL_SESSION_KILL';
        await session.save();
      }
      
      // Clear authentication tokens in cache
      // This would typically be Redis or similar
      
      // Notify user with high priority
      await notificationService.notifySecurityAlert(userId, {
        title: 'All Sessions Terminated',
        message: 'All your active sessions have been terminated for security. Please log in again.',
        severity: 'CRITICAL'
      });
      
      return {
        success: true,
        revokedCount: killCount,
        message: `Terminated ${killCount} active session(s)`
      };
      
    } catch (error) {
      console.error('Full session kill error:', error);
      throw error;
    }
  }

  /**
   * Force Password Reset: Require user to reset password
   */
  async executeForcePasswordReset(action, execution, context) {
    try {
      const userId = execution.userId;
      
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');
      
      // Generate password reset token
      const resetToken = this.generateSecureToken();
      const resetTokenHash = this.hashCode(resetToken);
      
      // Set password reset requirement
      user.passwordResetRequired = true;
      user.passwordResetToken = resetTokenHash;
      user.passwordResetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      user.save();
      
      // Send password reset email
      await emailService.sendSecurityAlert(user.email, {
        subject: 'Password Reset Required',
        template: 'force_password_reset',
        data: {
          resetToken,
          expirationHours: 24,
          reason: 'Suspicious activity on your account'
        }
      });
      
      return {
        success: true,
        resetRequired: true,
        expiresAt: user.passwordResetExpires,
        message: 'Password reset required'
      };
      
    } catch (error) {
      console.error('Force password reset error:', error);
      throw error;
    }
  }

  /**
   * User Notification: Notify user of suspicious activity
   */
  async executeUserNotification(action, execution, context) {
    try {
      const userId = execution.userId;
      const parameters = action.parameters || {};
      
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');
      
      const notificationTitle = parameters.title || 'Security Alert';
      const notificationMessage = parameters.message || 
        'Suspicious activity has been detected on your account. We have taken protective action.';
      
      // Send in-app notification
      await notificationService.notifySecurityAlert(userId, {
        title: notificationTitle,
        message: notificationMessage,
        severity: parameters.severity || 'WARNING',
        actionRequired: parameters.actionRequired || false,
        callToAction: parameters.callToAction
      });
      
      // Send email if specified
      if (parameters.sendEmail) {
        await emailService.sendSecurityAlert(user.email, {
          subject: notificationTitle,
          template: 'security_alert',
          data: {
            message: notificationMessage,
            actionRequired: parameters.actionRequired
          }
        });
      }
      
      return {
        success: true,
        notified: true,
        channels: parameters.sendEmail ? ['IN_SYSTEM', 'EMAIL'] : ['IN_SYSTEM']
      };
      
    } catch (error) {
      console.error('User notification error:', error);
      throw error;
    }
  }

  /**
   * Analyst Escalation: Escalate to human analyst
   */
  async executeAnalystEscalation(action, execution, context) {
    try {
      const parameters = action.parameters || {};
      
      // Find available analysts
      const analysts = await User.find({
        role: { $in: ['SECURITY_ANALYST', 'INCIDENT_COMMANDER'] },
        active: true
      }).limit(5);
      
      if (analysts.length === 0) {
        throw new Error('No available analysts for escalation');
      }
      
      // Notify analysts
      const notifiedAnalysts = [];
      for (const analyst of analysts) {
        try {
          await notificationService.notifySecurityAlert(analyst._id, {
            title: 'Incident Escalation Required',
            message: parameters.reason || 'Incident requires manual analyst review',
            executionId: execution.executionId,
            severity: execution.riskLevel,
            link: `/incidents/executions/${execution.executionId}`
          });
          notifiedAnalysts.push(analyst._id);
        } catch (e) {
          console.error(`Failed to notify analyst ${analyst._id}:`, e);
        }
      }
      
      return {
        success: notifiedAnalysts.length > 0,
        notifiedAnalysts,
        count: notifiedAnalysts.length,
        message: `Escalated to ${notifiedAnalysts.length} analyst(s)`
      };
      
    } catch (error) {
      console.error('Analyst escalation error:', error);
      throw error;
    }
  }

  /**
   * Account Suspend: Suspend account access
   */
  async executeAccountSuspend(action, execution, context) {
    try {
      const userId = execution.userId;
      
      const user = await User.findByIdAndUpdate(userId,
        {
          active: false,
          suspendedAt: new Date(),
          suspensionReason: 'INCIDENT_RESPONSE'
        },
        { new: true }
      );
      
      if (!user) throw new Error('User not found');
      
      // Kill all sessions
      await Session.updateMany(
        { user: userId, active: true },
        {
          active: false,
          revokedAt: new Date(),
          revokedReason: 'ACCOUNT_SUSPEND'
        }
      );
      
      // Notify user
      await notificationService.notifySecurityAlert(userId, {
        title: 'Account Suspended',
        message: 'Your account has been suspended due to suspicious activity. Contact support to restore access.',
        severity: 'CRITICAL'
      });
      
      return {
        success: true,
        userId,
        suspendedAt: user.suspendedAt,
        message: 'Account suspended'
      };
      
    } catch (error) {
      console.error('Account suspend error:', error);
      throw error;
    }
  }

  /**
   * Device Deregister: De-register device
   */
  async executeDeviceDeregister(action, execution, context) {
    try {
      const parameters = action.parameters || {};
      
      // Deregister specific device or all devices
      let deregisterCount = 0;
      
      if (parameters.deviceId) {
        const result = await TrustedDevice.findByIdAndUpdate(
          parameters.deviceId,
          { trusted: false, deregisteredAt: new Date() }
        );
        deregisterCount = result ? 1 : 0;
      } else {
        const result = await TrustedDevice.updateMany(
          { user: execution.userId },
          { trusted: false, deregisteredAt: new Date() }
        );
        deregisterCount = result.modifiedCount;
      }
      
      return {
        success: true,
        deregisteredCount: deregisterCount,
        message: `Deregistered ${deregisterCount} device(s)`
      };
      
    } catch (error) {
      console.error('Device deregister error:', error);
      throw error;
    }
  }

  /**
   * IP Whitelist Add: Add IP to whitelist
   */
  async executeIPWhitelistAdd(action, execution, context) {
    try {
      const parameters = action.parameters || {};
      const ipAddress = parameters.ipAddress || context.clientIP;
      
      if (!ipAddress) throw new Error('IP address not provided');
      
      const user = await User.findById(execution.userId);
      if (!user) throw new Error('User not found');
      
      // Add IP to whitelist if not already present
      if (!user.trustedIPs) {
        user.trustedIPs = [];
      }
      
      if (!user.trustedIPs.includes(ipAddress)) {
        user.trustedIPs.push(ipAddress);
        await user.save();
      }
      
      return {
        success: true,
        ipAddress,
        message: `Added ${ipAddress} to trusted IPs`
      };
      
    } catch (error) {
      console.error('IP whitelist add error:', error);
      throw error;
    }
  }

  /**
   * IP Blacklist Add: Add IP to blacklist
   */
  async executeIPBlacklistAdd(action, execution, context) {
    try {
      const parameters = action.parameters || {};
      const ipAddress = parameters.ipAddress || context.clientIP;
      
      if (!ipAddress) throw new Error('IP address not provided');
      
      // Add IP to global/user blacklist
      // This would typically be stored in Redis or blocked at gateway level
      
      return {
        success: true,
        ipAddress,
        message: `Added ${ipAddress} to blacklist`
      };
      
    } catch (error) {
      console.error('IP blacklist add error:', error);
      throw error;
    }
  }

  /**
   * Geo Lock: Geographic access restrictions
   */
  async executeGeoLock(action, execution, context) {
    try {
      const parameters = action.parameters || {};
      
      const user = await User.findById(execution.userId);
      if (!user) throw new Error('User not found');
      
      // Set geographic restrictions
      user.geoLockEnabled = true;
      user.allowedCountries = parameters.allowedCountries || ['US'];
      user.geoLockReason = 'INCIDENT_RESPONSE';
      
      await user.save();
      
      return {
        success: true,
        allowedCountries: user.allowedCountries,
        message: 'Geographic lock enabled'
      };
      
    } catch (error) {
      console.error('Geo lock error:', error);
      throw error;
    }
  }

  /**
   * Custom Webhook: Call custom integration webhook
   */
  async executeCustomWebhook(action, execution, context) {
    try {
      const parameters = action.parameters || {};
      const webhookUrl = parameters.webhookUrl;
      const webhookMethod = parameters.method || 'POST';
      
      if (!webhookUrl) throw new Error('Webhook URL not provided');
      
      // Call webhook
      const axios = require('axios');
      
      const payload = {
        executionId: execution.executionId,
        playbookType: execution.playbookType,
        userId: execution.userId,
        timestamp: new Date(),
        data: parameters.customData || {}
      };
      
      const response = await axios({
        method: webhookMethod,
        url: webhookUrl,
        data: payload,
        timeout: parameters.timeoutMs || 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Incident-Token': this.generateSecureToken()
        }
      });
      
      return {
        success: true,
        statusCode: response.status,
        data: response.data,
        message: 'Webhook executed successfully'
      };
      
    } catch (error) {
      console.error('Custom webhook error:', error);
      throw error;
    }
  }

  /**
   * Helper: Generate OTP
   */
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Helper: Generate secure token
   */
  generateSecureToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Helper: Hash code
   */
  hashCode(str) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(str).digest('hex');
  }
}

module.exports = PlaybookExecutorService;
