const mongoose = require('mongoose');

/**
 * Playbook Approval Policy Model
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Defines policy gates and approval requirements for security actions
 * Ensures human-in-the-loop control for sensitive operations
 */

const approvalRoleSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['SECURITY_ADMIN', 'INCIDENT_COMMANDER', 'ANALYST', 'COMPLIANCE_OFFICER', 'CUSTOM'],
    required: true
  },
  
  userIds: [mongoose.Schema.Types.ObjectId],
  
  // Fallback approvers if primary unavailable
  fallbackUsers: [mongoose.Schema.Types.ObjectId],
  
  priority: {
    type: Number,
    default: 0
  }
}, { _id: true });

const playbookApprovalPolicySchema = new mongoose.Schema({
  policyId: {
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
  
  // Policy scope
  scope: {
    type: String,
    enum: ['ALL_PLAYBOOKS', 'SPECIFIC_PLAYBOOKS', 'RISK_LEVEL_BASED', 'ACTION_TYPE_BASED'],
    default: 'SPECIFIC_PLAYBOOKS'
  },
  
  // Applicable playbooks
  applicablePlaybookIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'IncidentPlaybook',
    default: []
  },
  
  // Applicable risk levels
  applicableRiskLevels: [{
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  }],
  
  // Applicable action types
  applicableActionTypes: [String],
  
  // Main policy gates
  policyGates: [{
    gateName: {
      type: String,
      required: true
    },
    
    description: String,
    
    // Triggers for this gate
    triggers: {
      riskLevels: [String],
      actionTypes: [String],
      conditions: mongoose.Schema.Types.Mixed
    },
    
    // Approval requirements
    requiresApproval: {
      type: Boolean,
      default: false
    },
    
    // Number of approvers required
    requiredApprovers: {
      type: Number,
      default: 1,
      min: 1
    },
    
    // Approval roles and users
    approvalRoles: [approvalRoleSchema],
    
    // Approval timeout
    approvalTimeoutMs: {
      type: Number,
      default: 3600000  // 1 hour
    },
    
    // Escalation path if approval timeout
    escalationPath: [{
      escalationLevel: Number,
      delayMs: Number,
      escalateTo: mongoose.Schema.Types.ObjectId
    }],
    
    // Whether action is allowed while pending approval
    allowPartialExecution: {
      type: Boolean,
      default: false
    },
    
    // Auto-deny conditions
    autoDeny: {
      undefinedRiskContext: Boolean,
      missingSecurityContext: Boolean,
      systemFailure: Boolean
    },
    
    // Notification settings
    notifyApprovers: {
      type: Boolean,
      default: true
    },
    
    notificationChannels: [{
      type: String,
      enum: ['EMAIL', 'SLACK', 'TEAMS', 'IN_SYSTEM', 'SMS']
    }],
    
    // Gate enabled/disabled
    enabled: {
      type: Boolean,
      default: true
    }
  }],
  
  // Policy gates ordering
  gateExecutionOrder: [String],
  
  // Exception handling
  exceptions: [{
    exceptionId: String,
    description: String,
    
    // When exception applies
    conditions: mongoose.Schema.Types.Mixed,
    
    // Users/roles exempt from gate
    exemptUsers: [mongoose.Schema.Types.ObjectId],
    exemptRoles: [String],
    
    // Alternative approval requirements
    alternativeApprovalRoles: [approvalRoleSchema],
    
    // Valid until
    validUntil: Date,
    
    // Created by
    createdBy: mongoose.Schema.Types.ObjectId,
    
    enabled: {
      type: Boolean,
      default: true
    }
  }],
  
  // Auto-approval conditions
  autoApprovalConditions: [{
    condition: String,  // Evaluated condition
    autoApprove: {
      type: Boolean,
      default: true
    }
  }],
  
  // Fallback behavior if system issues
  fallbackBehavior: {
    type: String,
    enum: ['DENY_ACTION', 'ALLOW_ACTION', 'ESCALATE_TO_HUMAN'],
    default: 'ESCALATE_TO_HUMAN'
  },
  
  // Audit and analytics
  auditLevel: {
    type: String,
    enum: ['MINIMAL', 'STANDARD', 'DETAILED', 'FORENSIC'],
    default: 'STANDARD'
  },
  
  // Metrics
  metrics: {
    totalApprovalRequests: {
      type: Number,
      default: 0
    },
    approvedCount: {
      type: Number,
      default: 0
    },
    deniedCount: {
      type: Number,
      default: 0
    },
    averageApprovalTimeMs: Number,
    escalationCount: {
      type: Number,
      default: 0
    }
  },
  
  // Policy metadata
  priority: {
    type: Number,
    default: 0,
    description: 'Higher priority policies evaluated first'
  },
  
  isDefault: {
    type: Boolean,
    default: false
  },
  
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  
  version: {
    type: Number,
    default: 1
  },
  
  // Ownership and audit
  createdBy: mongoose.Schema.Types.ObjectId,
  lastModifiedBy: mongoose.Schema.Types.ObjectId,
  
  changeLog: [{
    timestamp: Date,
    changedBy: mongoose.Schema.Types.ObjectId,
    changes: String,
    version: Number
  }],
  
  tags: [String],
  documentation: String,
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
playbookApprovalPolicySchema.index({ scope: 1, enabled: 1 });
playbookApprovalPolicySchema.index({ priority: -1, enabled: 1 });
playbookApprovalPolicySchema.index({ applicablePlaybookIds: 1 });

// Methods
playbookApprovalPolicySchema.methods.appliesToPlaybook = function(playbookId) {
  if (this.scope === 'ALL_PLAYBOOKS') {
    return true;
  }
  if (this.scope === 'SPECIFIC_PLAYBOOKS') {
    return this.applicablePlaybookIds.some(id => id.toString() === playbookId.toString());
  }
  return false;
};

playbookApprovalPolicySchema.methods.appliesToRiskLevel = function(riskLevel) {
  if (this.scope === 'RISK_LEVEL_BASED') {
    return this.applicableRiskLevels.includes(riskLevel);
  }
  return false;
};

playbookApprovalPolicySchema.methods.appliesToActionType = function(actionType) {
  if (this.scope === 'ACTION_TYPE_BASED') {
    return this.applicableActionTypes.includes(actionType);
  }
  return false;
};

playbookApprovalPolicySchema.methods.getApplicableGates = function(context) {
  return this.policyGates.filter(gate => {
    if (!gate.enabled) return false;
    
    const riskMatch = gate.triggers.riskLevels.length === 0 || 
                    gate.triggers.riskLevels.includes(context.riskLevel);
    const actionMatch = gate.triggers.actionTypes.length === 0 || 
                      gate.triggers.actionTypes.includes(context.actionType);
    
    return riskMatch && actionMatch;
  });
};

playbookApprovalPolicySchema.methods.hasExceptionFor = function(userId, riskLevel) {
  return this.exceptions.some(exc => {
    if (!exc.enabled) return false;
    return exc.exemptUsers.some(uid => uid.toString() === userId.toString());
  });
};

module.exports = mongoose.model('PlaybookApprovalPolicy', playbookApprovalPolicySchema);
