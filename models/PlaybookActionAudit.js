const mongoose = require('mongoose');

/**
 * Playbook Action Audit Model
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Detailed audit trail for every action executed by playbooks
 * Provides forensic analysis and compliance reporting capabilities
 */

const playbookActionAuditSchema = new mongoose.Schema({
  auditId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  executionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlaybookExecution',
    required: true,
    index: true
  },
  
  playbookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IncidentPlaybook',
    required: true,
    index: true
  },
  
  playbookName: String,
  
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SecurityIncident',
    index: true
  },
  
  // Action identification
  actionId: {
    type: String,
    required: true,
    index: true
  },
  
  actionType: {
    type: String,
    required: true,
    index: true
  },
  
  actionDescription: String,
  
  stage: Number,
  
  // User affected
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  targetUserEmail: String,
  
  // Orchestration executors
  executedBy: {
    type: String,
    enum: ['SYSTEM', 'HUMAN_ANALYST', 'AUTOMATED_ORCHESTRATION'],
    default: 'SYSTEM'
  },
  
  executorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Action lifecycle timeline
  requestedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  approvalRequestedAt: Date,
  
  approvedAt: Date,
  
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  approvalComments: String,
  
  startedAt: Date,
  
  completedAt: Date,
  
  duration: Number,  // milliseconds
  
  // Approval details
  approvalRequired: {
    type: Boolean,
    default: false
  },
  
  approvalRoles: [String],
  
  approvalStatus: {
    type: String,
    enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'DENIED', 'ESCALATED'],
    default: 'NOT_REQUIRED'
  },
  
  approvalDenialReason: String,
  
  // Execution status
  status: {
    type: String,
    enum: ['PENDING', 'EXECUTING', 'SUCCESS', 'FAILED', 'RETRYING', 'COMPENSATING', 'COMPENSATED', 'SKIPPED'],
    default: 'PENDING',
    index: true
  },
  
  // Input parameters (what was passed to the action)
  inputParameters: {
    type: mongoose.Schema.Types.Mixed,
    description: 'Parameters passed to action (sanitized for sensitive data)'
  },
  
  // Action result
  result: {
    type: mongoose.Schema.Types.Mixed,
    description: 'Result returned by action'
  },
  
  // Error information
  error: {
    message: String,
    code: String,
    stack: String,
    type: String,
    timestamp: Date
  },
  
  // Retry information
  retries: [{
    attemptNumber: Number,
    status: String,
    startedAt: Date,
    completedAt: Date,
    duration: Number,
    result: mongoose.Schema.Types.Mixed,
    error: {
      message: String,
      code: String
    },
    backoffDelayMs: Number,
    reason: String
  }],
  
  totalRetries: Number,
  maxRetries: Number,
  retryPolicy: mongoose.Schema.Types.Mixed,
  
  // Idempotency
  idempotencyKey: String,
  isIdempotentRetry: {
    type: Boolean,
    default: false
  },
  
  isDuplicate: {
    type: Boolean,
    default: false
  },
  
  duplicateOfAuditId: String,
  
  // Compensation action
  compensation: {
    required: Boolean,
    actionType: String,
    
    startedAt: Date,
    completedAt: Date,
    duration: Number,
    
    status: {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING', 'EXECUTING', 'SUCCESS', 'FAILED'],
      default: 'NOT_REQUIRED'
    },
    
    result: mongoose.Schema.Types.Mixed,
    error: {
      message: String,
      code: String
    }
  },
  
  // Side effects and external integrations
  sideEffects: [{
    systemName: String,
    operation: String,
    targetId: String,
    status: String,
    result: mongoose.Schema.Types.Mixed,
    error: String,
    timestamp: Date
  }],
  
  // Conditional execution
  conditionEvaluated: Boolean,
  conditionResult: Boolean,
  conditionExpression: String,
  
  // Context at execution time
  executionContext: {
    userState: mongoose.Schema.Types.Mixed,
    sessionState: mongoose.Schema.Types.Mixed,
    riskLevel: String,
    confidenceScore: Number
  },
  
  // Guardrails check
  guardrails: [{
    guardrailName: String,
    status: {
      type: String,
      enum: ['PASSED', 'FAILED', 'WARNING'],
      default: 'PASSED'
    },
    details: String
  }],
  
  // Impact assessment
  impact: {
    accountsAffected: [mongoose.Schema.Types.ObjectId],
    sessionsModified: Number,
    tokensRevoked: Number,
    notificationsSent: Number,
    auditEntriesCreated: Number
  },
  
  // Rollback information
  isRolledBack: {
    type: Boolean,
    default: false
  },
  
  rollbackInitiatedAt: Date,
  
  rollbackReason: String,
  
  rollbackInitiatedBy: mongoose.Schema.Types.ObjectId,
  
  // Audit metadata
  sourceSystem: {
    type: String,
    enum: ['INCIDENT_RESPONSE_ENGINE', 'MANUAL_TRIGGER', 'API', 'ALERT_SYSTEM'],
    default: 'INCIDENT_RESPONSE_ENGINE'
  },
  
  sourceIPAddress: String,
  
  userAgent: String,
  
  // Distributed tracing
  traceId: String,
  spanId: String,
  parentSpanId: String,
  
  // Correlation IDs
  correlationIds: [String],
  
  // Tags and metadata
  tags: [String],
  metadata: mongoose.Schema.Types.Mixed,
  
  // Compliance fields
  complianceRelevant: Boolean,
  complianceFrameworks: [String],
  
  // Evidence preservation
  evidencePreserved: Boolean,
  evidenceLocation: String,
  
  // Comments and notes
  notes: String,
  reviewedBy: mongoose.Schema.Types.ObjectId,
  reviewedAt: Date,
  
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

// Indexes for performance
playbookActionAuditSchema.index({ executionId: 1, actionId: 1 });
playbookActionAuditSchema.index({ targetUserId: 1, createdAt: -1 });
playbookActionAuditSchema.index({ status: 1, createdAt: -1 });
playbookActionAuditSchema.index({ playbookId: 1, createdAt: -1 });
playbookActionAuditSchema.index({ traceId: 1 });
playbookActionAuditSchema.index({ approvalStatus: 1, createdAt: -1 });
playbookActionAuditSchema.index({ incidentId: 1 });
playbookActionAuditSchema.index({ complianceRelevant: 1, createdAt: -1 });

// Methods
playbookActionAuditSchema.methods.calculateDuration = function() {
  if (this.completedAt && this.startedAt) {
    return this.completedAt - this.startedAt;
  }
  if (this.startedAt) {
    return Date.now() - this.startedAt;
  }
  return 0;
};

playbookActionAuditSchema.methods.isSuccessful = function() {
  return this.status === 'SUCCESS';
};

playbookActionAuditSchema.methods.isFailed = function() {
  return this.status === 'FAILED';
};

playbookActionAuditSchema.methods.getPenaltyCalculation = function() {
  let penalty = 0;
  
  // Count failed attempts
  if (this.error) penalty += 10;
  
  // Count retries
  penalty += (this.totalRetries || 0) * 2;
  
  // Failed compensation
  if (this.compensation && this.compensation.status === 'FAILED') {
    penalty += 20;
  }
  
  // Timeout
  if (this.duration > 60000) penalty += 5;  // Over 1 minute
  
  return penalty;
};

playbookActionAuditSchema.methods.markCompensated = function() {
  this.compensation.status = 'SUCCESS';
  this.compensation.completedAt = new Date();
  this.status = 'COMPENSATED';
};

playbookActionAuditSchema.methods.getForensicSummary = function() {
  return {
    auditId: this.auditId,
    actionId: this.actionId,
    actionType: this.actionType,
    status: this.status,
    executedBy: this.executedBy,
    targetUserId: this.targetUserId,
    requestedAt: this.requestedAt,
    startedAt: this.startedAt,
    completedAt: this.completedAt,
    duration: this.calculateDuration(),
    traceId: this.traceId,
    hasError: !!this.error,
    isCompensated: this.status === 'COMPENSATED',
    retryCount: this.totalRetries || 0
  };
};

module.exports = mongoose.model('PlaybookActionAudit', playbookActionAuditSchema);
