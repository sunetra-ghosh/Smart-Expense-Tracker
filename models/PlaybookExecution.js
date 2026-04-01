const mongoose = require('mongoose');

/**
 * Playbook Execution Model
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Tracks detailed execution traces of playbook runs
 * Provides deterministic execution history and debugging capabilities
 */

const actionExecutionSchema = new mongoose.Schema({
  actionId: String,
  actionType: String,
  stage: Number,
  
  // Execution lifecycle
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'EXECUTING', 'SUCCESS', 'FAILED', 'COMPENSATED', 'SKIPPED'],
    default: 'PENDING'
  },
  
  // Approval information
  approval: {
    required: Boolean,
    requestedAt: Date,
    approvedAt: Date,
    approvedBy: mongoose.Schema.Types.ObjectId,
    approvalComment: String,
    deniedReason: String
  },
  
  // Execution details
  startedAt: Date,
  completedAt: Date,
  duration: Number,  // milliseconds
  
  // Results and errors
  result: mongoose.Schema.Types.Mixed,
  error: {
    message: String,
    stack: String,
    code: String
  },
  
  // Retry information
  retryCount: {
    type: Number,
    default: 0
  },
  retryDetails: [{
    attemptNumber: Number,
    startedAt: Date,
    completedAt: Date,
    error: String,
    backoffDelayMs: Number
  }],
  
  // Idempotency tracking
  idempotencyKey: String,
  isIdempotentRetry: {
    type: Boolean,
    default: false
  },
  
  // Compensation action
  compensation: {
    required: Boolean,
    startedAt: Date,
    completedAt: Date,
    status: String,
    result: mongoose.Schema.Types.Mixed,
    error: String
  },
  
  // Context at execution time
  inputParameters: mongoose.Schema.Types.Mixed,
  
  // Audit and tracing
  executedBy: String,  // 'SYSTEM' or user ID
  traceId: String
}, { _id: true, timestamps: false });

const playbookExecutionSchema = new mongoose.Schema({
  executionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  playbookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IncidentPlaybook',
    required: true,
    index: true
  },
  
  playbookName: String,
  playbookType: String,
  
  // Triggered by incident
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SecurityIncident',
    index: true
  },
  
  // User affected
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  // Overall execution status
  status: {
    type: String,
    enum: ['INITIATED', 'RUNNING', 'PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED', 'ROLLED_BACK'],
    default: 'INITIATED',
    index: true
  },
  
  // Execution timeline
  startedAt: {
    type: Date,
    required: true,
    index: true
  },
  
  completedAt: Date,
  totalDuration: Number,  // milliseconds
  
  // Trigger context
  triggerEvent: {
    type: String,
    description: 'Event that triggered the playbook'
  },
  
  triggerContext: {
    type: mongoose.Schema.Types.Mixed,
    description: 'Context of the triggering event'
  },
  
  // Risk assessment
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true
  },
  
  // Confidence score (0-100)
  confidenceScore: Number,
  
  // Policy gates evaluation
  policyGates: [{
    gateName: String,
    status: {
      type: String,
      enum: ['PASSED', 'FAILED', 'APPROVAL_PENDING'],
      default: 'PASSED'
    },
    evaluationTime: Date,
    reason: String
  }],
  
  // Manual approvals required
  approvals: [{
    approvalId: String,
    actionId: String,
    actionType: String,
    approvalRole: String,
    requiredApprovers: Number,
    approvals: [{
      approvedBy: mongoose.Schema.Types.ObjectId,
      approvedAt: Date,
      comment: String
    }],
    denials: [{
      deniedBy: mongoose.Schema.Types.ObjectId,
      deniedAt: Date,
      reason: String
    }],
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'DENIED']
    }
  }],
  
  // Staged action execution
  stages: [{
    stageNumber: Number,
    status: String,
    startedAt: Date,
    completedAt: Date
  }],
  
  // Individual action executions
  actionExecutions: [actionExecutionSchema],
  
  // Compensation actions
  compensation: {
    required: Boolean,
    startedAt: Date,
    completedAt: Date,
    status: String,
    failures: [{
      actionId: String,
      error: String
    }]
  },
  
  // Detailed audit trail
  auditEvents: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    event: String,
    details: mongoose.Schema.Types.Mixed,
    actor: String  // 'SYSTEM' or user ID
  }],
  
  // Issues and warnings
  warnings: [{
    timestamp: Date,
    message: String,
    actionId: String
  }],
  
  // Communication and notifications
  notificationsSent: [{
    notificationType: String,
    recipientId: mongoose.Schema.Types.ObjectId,
    sentAt: Date,
    status: String
  }],
  
  // External system integrations
  externalIntegrations: [{
    systemName: String,
    operation: String,
    status: String,
    response: mongoose.Schema.Types.Mixed
  }],
  
  // Metrics
  actionCount: Number,
  successfulActions: Number,
  failedActions: Number,
  skippedActions: Number,
  
  // Full context snapshot for debugging
  contextSnapshot: {
    userState: mongoose.Schema.Types.Mixed,
    sessionState: mongoose.Schema.Types.Mixed,
    systemState: mongoose.Schema.Types.Mixed
  },
  
  // Manual overrides
  overrides: [{
    action: String,
    overriddenBy: mongoose.Schema.Types.ObjectId,
    reason: String,
    timestamp: Date
  }],
  
  // Resolution information
  resolution: {
    timestamp: Date,
    resolvedBy: mongoose.Schema.Types.ObjectId,
    notes: String,
    effectiveness: String  // 'EFFECTIVE', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE'
  },
  
  // Trace ID for distributed tracing
  traceId: String,
  parentExecutionId: String,
  
  // Tags for filtering and analysis
  tags: [String],
  
  // Issues/escalations
  escalations: [{
    escalatedAt: Date,
    escalatedTo: mongoose.Schema.Types.ObjectId,
    reason: String,
    status: String
  }],
  
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
playbookExecutionSchema.index({ playbookId: 1, startedAt: -1 });
playbookExecutionSchema.index({ userId: 1, startedAt: -1 });
playbookExecutionSchema.index({ status: 1, startedAt: -1 });
playbookExecutionSchema.index({ riskLevel: 1, startedAt: -1 });
playbookExecutionSchema.index({ traceId: 1 });
playbookExecutionSchema.index({ 'policyGates.status': 1 });
playbookExecutionSchema.index({ incidentId: 1 });

// Methods
playbookExecutionSchema.methods.getActionExecution = function(actionId) {
  return this.actionExecutions.find(ae => ae.actionId === actionId);
};

playbookExecutionSchema.methods.addAuditEvent = function(event, details, actor = 'SYSTEM') {
  this.auditEvents.push({
    timestamp: new Date(),
    event,
    details,
    actor
  });
};

playbookExecutionSchema.methods.calculateDuration = function() {
  if (this.completedAt) {
    return this.completedAt - this.startedAt;
  }
  return Date.now() - this.startedAt;
};

playbookExecutionSchema.methods.isCompleted = function() {
  return ['COMPLETED', 'FAILED', 'ROLLED_BACK'].includes(this.status);
};

playbookExecutionSchema.methods.hasFailures = function() {
  return this.actionExecutions.some(ae => ae.status === 'FAILED');
};

playbookExecutionSchema.methods.getExecutionSummary = function() {
  return {
    executionId: this.executionId,
    playbookName: this.playbookName,
    status: this.status,
    totalDuration: this.totalDuration,
    actionCount: this.actionCount,
    successfulActions: this.successfulActions,
    failedActions: this.failedActions,
    riskLevel: this.riskLevel,
    startedAt: this.startedAt,
    completedAt: this.completedAt
  };
};

module.exports = mongoose.model('PlaybookExecution', playbookExecutionSchema);
