const mongoose = require('mongoose');

/**
 * Incident Playbook Model
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Defines rule-driven playbooks for automated security response with guardrails
 * Supports staged actions, policy gates, and compensation strategies
 */

const playbookActionSchema = new mongoose.Schema({
  actionId: {
    type: String,
    required: true
  },
  
  actionType: {
    type: String,
    enum: [
      'STEP_UP_CHALLENGE',        // Require additional authentication
      'SELECTIVE_TOKEN_REVOKE',   // Revoke specific tokens/sessions
      'FULL_SESSION_KILL',        // Kill all sessions
      'FORCE_PASSWORD_RESET',     // Force user to reset password
      'USER_NOTIFICATION',        // Notify user of suspicious activity
      'ANALYST_ESCALATION',       // Escalate to human analyst
      'ACCOUNT_SUSPEND',          // Suspend account access
      'DEVICE_DEREGISTER',        // De-register device
      'IPWHITELIST_ADD',          // Add IP to whitelist
      'IPBLACKLIST_ADD',          // Add IP to blacklist
      'GEO_LOCK',                 // Geographic access restrictions
      'CUSTOM_WEBHOOK'            // Custom integration webhook
    ],
    required: true
  },
  
  stage: {
    type: Number,
    required: true,
    min: 1,
    description: '1 = initial response, 2 = escalated, 3 = maximum'
  },
  
  // Action parameters and configuration
  parameters: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Approval requirements
  requiresApproval: {
    type: Boolean,
    default: false
  },
  
  approvalRoles: [{
    type: String,
    enum: ['SECURITY_ADMIN', 'INCIDENT_COMMANDER', 'ANALYST', 'COMPLIANCE_OFFICER']
  }],
  
  // Retry configuration
  retryConfig: {
    maxRetries: {
      type: Number,
      default: 3
    },
    backoffMs: {
      type: Number,
      default: 1000
    },
    backoffMultiplier: {
      type: Number,
      default: 2
    }
  },
  
  // Idempotency configuration
  idempotencyKey: {
    type: String,
    description: 'Key for ensuring idempotency of action'
  },
  
  // Compensating action (undo action if something fails)
  compensatingAction: {
    actionType: String,
    parameters: mongoose.Schema.Types.Mixed
  },
  
  // Timeout configuration
  timeoutMs: {
    type: Number,
    default: 30000
  },
  
  // Condition under which action executes
  condition: {
    type: String,
    description: 'JavaScript condition evaluated at runtime'
  },
  
  description: String,
  enabled: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const playbookRuleSchema = new mongoose.Schema({
  ruleId: {
    type: String,
    required: true
  },
  
  ruleType: {
    type: String,
    enum: [
      'SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL',
      'REPEATED_2FA_BYPASS',
      'UNUSUAL_PRIVILEGE_ACTION',
      'MULTI_ACCOUNT_CAMPAIGN'
    ],
    required: true
  },
  
  // Condition evaluation (pattern matching)
  conditions: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    description: 'Rule conditions: login patterns, frequency thresholds, etc.'
  },
  
  // Severity thresholds
  thresholds: {
    lowRisk: mongoose.Schema.Types.Mixed,
    mediumRisk: mongoose.Schema.Types.Mixed,
    highRisk: mongoose.Schema.Types.Mixed
  },
  
  // Time window for rules
  timeWindowMs: {
    type: Number,
    default: 3600000  // 1 hour
  },
  
  enabled: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const incidentPlaybookSchema = new mongoose.Schema({
  playbookId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  name: {
    type: String,
    required: true
  },
  
  description: String,
  
  // Playbook type/classification
  playbookType: {
    type: String,
    enum: [
      'SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL',
      'REPEATED_2FA_BYPASS',
      'UNUSUAL_PRIVILEGE_ACTION',
      'MULTI_ACCOUNT_CAMPAIGN',
      'ACCOUNT_TAKEOVER',
      'DATA_EXFILTRATION',
      'CREDENTIAL_STUFFING',
      'CUSTOM'
    ],
    required: true,
    index: true
  },
  
  // Detection rules
  rules: [playbookRuleSchema],
  
  // Orchestrated actions with stages
  actions: [playbookActionSchema],
  
  // Policy gates that block execution
  policyGates: [{
    gateName: String,
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    },
    requiresManualApproval: Boolean,
    approvalTimeout: Number,  // milliseconds
    escalationPath: [String]  // User IDs or roles
  }],
  
  // Severity level of this playbook
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true
  },
  
  // Enable/disable playbook
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Version tracking
  version: {
    type: Number,
    default: 1
  },
  
  // Ownership and audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Timeline configuration
  maxExecutionTimeMs: {
    type: Number,
    default: 300000  // 5 minutes
  },
  
  // Whether playbook can be executed concurrently
  allowConcurrentExecution: {
    type: Boolean,
    default: false
  },
  
  // Documentation and change tracking
  changeLog: [{
    timestamp: Date,
    changedBy: mongoose.Schema.Types.ObjectId,
    changes: String,
    version: Number
  }],
  
  // Metrics and effectiveness
  metrics: {
    totalExecutions: {
      type: Number,
      default: 0
    },
    successfulExecutions: {
      type: Number,
      default: 0
    },
    failedExecutions: {
      type: Number,
      default: 0
    },
    averageExecutionTimeMs: {
      type: Number,
      default: 0
    },
    lastExecutedAt: Date,
    incidentsContained: {
      type: Number,
      default: 0
    }
  },
  
  // Metadata
  tags: [String],
  documentation: String,
  exampleScenarios: [String],
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Indexes for performance
incidentPlaybookSchema.index({ playbookType: 1, enabled: 1 });
incidentPlaybookSchema.index({ severity: 1, enabled: 1 });
incidentPlaybookSchema.index({ 'metrics.lastExecutedAt': -1 });

// Methods
incidentPlaybookSchema.methods.getAvailableActions = function() {
  return this.actions.filter(action => action.enabled);
};

incidentPlaybookSchema.methods.getActionsByStage = function(stage) {
  return this.actions.filter(action => action.stage === stage && action.enabled);
};

incidentPlaybookSchema.methods.hasPolicyGates = function() {
  return this.policyGates && this.policyGates.length > 0;
};

incidentPlaybookSchema.methods.canExecute = function() {
  return this.enabled && this.actions.length > 0 && this.rules.length > 0;
};

incidentPlaybookSchema.methods.incrementMetrics = function(success, executionTimeMs) {
  this.metrics.totalExecutions += 1;
  if (success) {
    this.metrics.successfulExecutions += 1;
  } else {
    this.metrics.failedExecutions += 1;
  }
  
  // Update average execution time (exponential moving average)
  const alpha = 0.3;
  this.metrics.averageExecutionTimeMs = 
    alpha * executionTimeMs + (1 - alpha) * (this.metrics.averageExecutionTimeMs || executionTimeMs);
  
  this.metrics.lastExecutedAt = new Date();
};

module.exports = mongoose.model('IncidentPlaybook', incidentPlaybookSchema);
