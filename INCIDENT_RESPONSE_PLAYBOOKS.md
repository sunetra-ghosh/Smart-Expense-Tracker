# Autonomous Incident Response Playbooks Framework
**Issue #851: Autonomous Incident Response Playbooks**

## Overview

The Autonomous Incident Response Playbooks Framework provides a sophisticated, rule-driven orchestration system for automated security incident response with strong guardrails. It enables deterministic playbook execution, safe retries, human-approval checkpoints, and full execution tracing for comprehensive incident containment.

### Key Features

- **Rule-Driven Orchestration**: Define incident detection rules and automatic playbook triggers
- **Deterministic Execution**: Reproducible, stage-based action execution with idempotency guarantees
- **Staged Actions**: Multi-stage response escalation (initial, escalated, critical)
- **Approval Gates**: Policy-driven human-in-the-loop approval for sensitive actions
- **Compensation Actions**: Automatic rollback and undo for failed actions
- **Retry Safety**: Intelligent retry logic with exponential backoff and idempotency keys
- **Full Audit Trail**: Comprehensive execution traces and forensic investigation capabilities
- **Risk-Based Thresholds**: Automatic severity assessment and response scaling

## Architecture

### Core Components

#### 1. **Data Models**

```
IncidentPlaybook
  ├── rules: Array of detection rules
  ├── actions: Array of staged actions
  ├── policyGates: Array of approval policy gates
  └── metrics: Execution statistics and effectiveness

PlaybookExecution
  ├── actionExecutions: Individual action results
  ├── approvals: Approval status tracking
  ├── auditEvents: Detailed execution log
  ├── policyGates: Gate evaluation results
  └── compensation: Rollback/undo information

PlaybookActionAudit
  ├── Detailed action execution trace
  ├── Retry attempts and results
  ├── Approval workflow history
  └── Forensic evidence preservation

PlaybookApprovalPolicy
  ├── Policy gates with approval rules
  ├── Exception handling
  ├── Escalation paths
  └── Auto-approval conditions
```

#### 2. **Service Layer**

```
IncidentPlaybookEngineService
  ├── detectAndOrchestrate(): Detect incidents and trigger playbooks
  ├── executePlaybook(): Main orchestration loop
  ├── executeStage(): Multi-action stage execution
  └── executeAction(): Single action execution with retries

PlaybookExecutorService
  ├── executeAction(): Route to specific action handler
  ├── executeStepUpChallenge(): Multi-factor authentication
  ├── executeSelectiveTokenRevoke(): Revoke specific sessions
  ├── executeFullSessionKill(): Terminate all sessions
  ├── executeForcePasswordReset(): Force credential reset
  ├── executeUserNotification(): Alert user
  ├── executeAnalystEscalation(): Escalate to human
  ├── executeAccountSuspend(): Suspend account
  └── [Other action handlers]

PlaybookApprovalGateService
  ├── evaluatePolicyGates(): Check all gates
  ├── evaluateGate(): Single gate evaluation
  ├── requestApproval(): Request action approval
  ├── processApprovalDecision(): Handle approval votes
  └── setupEscalation(): Configure escalation timers

Specific Playbook Services
  ├── ImpossibleTravelPlaybookService
  ├── TwoFABypassPlaybookService
  ├── PrivilegeSensitiveActionPlaybookService
  └── MultiAccountCampaignPlaybookService
```

## Playbook Types

### 1. **Suspicious Login - Impossible Travel**

Detects when user logs in from geographically impossible locations within implausible timeframes.

**Detection Logic:**
- Calculates distance between last login location and current location
- Considers time elapsed since last login
- Compares against maximum possible travel speed (~900 km/h commercial flight)
- Triggers if `distance > max_possible_distance`

**Response Actions (Staged):**
```
Stage 1 (Initial):
  - Step-up authentication challenge
  - User notification with details
  - Session selective revocation (non-suspicious sessions kept)

Stage 2 (Escalated, if no response):
  - Full session termination
  - Force password reset
  - Analyst escalation

Stage 3 (Critical):
  - Account suspension
  - Device deregistration
  - Geographic lock
```

**Example:**
```javascript
{
  userId: "user123",
  newLocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC
  lastLocation: { latitude: 35.6762, longitude: 139.6503 }, // Tokyo
  timeDiffHours: 2,
  improbability: 98.5 // %
}
```

### 2. **Repeated 2FA Bypass Attempts**

Detects multiple failed two-factor authentication attempts indicating credential compromise or brute force.

**Detection Logic:**
- Counts failed 2FA attempts within time window (default: 60 minutes)
- Severity scales with attempt count
- Threshold: 5+ attempts triggers MEDIUM risk

**Response Actions (Staged):**
```
Stage 1 (Initial):
  - Require step-up challenge (different MFA method)
  - Send security alert to user
  - Analyst notification

Stage 2 (Escalated, 7+ attempts):
  - Revoke all authentication tokens
  - Force password reset
  - Require additional verification

Stage 3 (Critical, 10+ attempts):
  - Account suspension
  - All session termination
  - Emergency analyst escalation
```

### 3. **Unusual Privilege-Sensitive Actions**

Detects atypical privilege-sensitive operations like:
- Admin panel access
- Bulk data export
- Permission escalation
- Role changes
- User deletion
- API key creation

**Detection Logic:**
- Compares against user's historical action patterns
- Flags if action is rare or new for user
- Risk scores based on action type severity

**Response Actions (Staged):**
```
Stage 1 (Initial):
  - Always requires approval
  - Send detailed notification to user
  - Analyst alert

Stage 2 (If HIGH risk):
  - Require step-up challenge before action proceeds
  - Enhanced logging enabled
  - Audit trail marked for forensic review

Stage 3 (If approval denied):
  - Action blocked
  - Incident escalation
  - Investigation initiation
```

### 4. **Multi-Account Campaign Indicators**

Detects coordinated attack campaigns across multiple accounts from same source.

**Detection Logic:**
- Scans for incident clusters (60-minute window)
- Groups by origin: IP address, device fingerprint, etc.
- Triggers if 3+ accounts hit from same source
- Always CRITICAL severity

**Response Actions (Immediate & Coordinated):**
```
Stage 1 (Immediate):
  - Full session kill on all affected accounts
  - Block source IP address globally
  - Enable geographic lock on all affected users
  - Force password reset on all accounts

Stage 2 (Enhanced Protection):
  - Require step-up challenge for all affected users
  - Mandatory 2FA re-registration
  - Device deregistration across all accounts

Stage 3 (Escalation):
  - Threat intelligence submission
  - Law enforcement notification (if applicable)
  - Extended monitoring period
```

## Staged Action System

Actions are organized into stages to support escalating response:

```javascript
Stage 1: Initial Response
  - Non-disruptive actions (notifications, challenges)
  - Minimal false-positive impact
  - Example: step-up challenge, notification

Stage 2: Escalated Response
  - More aggressive controls (token revocation, reset)
  - Applied if Stage 1 insufficient or timeout
  - Example: selective token revocation, password reset

Stage 3: Critical Response
  - Maximum impact actions (suspension, termination)
  - Applied for confirmed threats or high severity
  - Example: account suspension, hard lockdown
```

### Stage 1 Actions

**STEP_UP_CHALLENGE**
- Requires additional authentication
- Methods: EMAIL_OTP, SMS_OTP, SECURITY_QUESTIONS
- Timeout: 15 minutes (configurable)

**USER_NOTIFICATION**
- Alerts user of suspicious activity
- Includes action details and recommendations
- Channels: In-app, email, SMS

**ANALYST_ESCALATION**
- Routes to available security analyst
- Includes execution context
- Supports manual override

### Stage 2 Actions

**SELECTIVE_TOKEN_REVOKE**
- Revokes tokens from suspicious sessions only
- Preserves legitimate sessions
- Selectors: SUSPICIOUS_GEO, SPECIFIC_DEVICE, EXCEPT_CURRENT

**FORCE_PASSWORD_RESET**
- Requires user to change password
- 24-hour expiration on reset token
- Logout all existing sessions

### Stage 3 Actions

**FULL_SESSION_KILL**
- Terminates all active sessions immediately
- Clears all authentication tokens
- Forces re-authentication

**ACCOUNT_SUSPEND**
- Disables account access completely
- Revokes all tokens and sessions
- Prevents login attempts

**DEVICE_DEREGISTER**
- Removes trusted device status
- Requires re-registration
- Prevents device-based auth

## Approval Gate System

Policy gates provide human-in-the-loop control for sensitive actions.

### Policy Gate Types

```javascript
const PolicityGate = {
  name: "Privilege_Escalation_Gate",
  
  // Required approvals
  requiredApprovers: 2,
  approvalRoles: [
    { role: "SECURITY_ADMIN", userIds: [...] },
    { role: "INCIDENT_COMMANDER" }
  ],
  
  // Approval timeout and escalation
  approvalTimeoutMs: 3600000, // 1 hour
  escalationPath: [
    { escalationLevel: 1, delayMs: 600000, escalateTo: "cto_user_id" },
    { escalationLevel: 2, delayMs: 1800000, escalateTo: "security_director_id" }
  ],
  
  // Conditions triggering gate
  triggers: {
    riskLevels: ['HIGH', 'CRITICAL'],
    actionTypes: ['ACCOUNT_SUSPEND', 'PERMISSION_ESCALATION'],
    conditions: { /* custom logic */ }
  },
  
  // Auto-approval conditions
  autoApprove: [
    { condition: "incident.severity === 'CRITICAL'", apply: true }
  ],
  
  // Exception handling
  exemptions: [
    { role: "SECURITY_ADMIN", validUntil: "2026-12-31" }
  ]
}
```

### Approval Workflow

```
1. Action requested → Check approval requirement
   ├ No approval needed → Execute immediately
   └ Approval needed → Continue

2. Get approvers → Find users/roles for approval
   ├ No approvers available → Deny action
   └ Approvers found → Request approval

3. Send notifications → Notify all approvers
   ├ Via email, Slack, in-app
   └ Include execution context

4. Approval collection → Wait for votes
   ├ Deny received → Deny action (any deny blocks)
   ├ Enough approvals → Approve action
   ├ Timeout reached → Escalate to next level
   └ Escalation max reached → Deny or allow per policy

5. Proceed or deny → Execute action or skip
```

## Retry Safety & Idempotency

All actions support safe retries through:

### Idempotency Keys
```javascript
const idempotencyKey = `${action.actionId}_${action.createdAt.getTime()}`;
// Prevents duplicate execution of same action
// Check if action already succeeded before retrying
```

### Retry Configuration
```javascript
{
  retryConfig: {
    maxRetries: 3,
    backoffMs: 1000,
    backoffMultiplier: 2  // Exponential backoff
  }
}
// Attempt 1: immediate
// Attempt 2: wait 1s
// Attempt 3: wait 2s
// Attempt 4: wait 4s
```

### Compensation Actions
```javascript
{
  actionType: "SELECTIVE_TOKEN_REVOKE",
  compensatingAction: {
    actionType: "RESTORE_TOKENS",
    parameters: { /* restore original state */ }
  }
}
// If action fails after retries, execute compensation
// Restores system to pre-action state
```

## Execution Tracing

All executions produce comprehensive audit trails:

### Execution Lifecycle States
```
INITIATED
  ↓
RUNNING
  ├─ Stage 1 (executing actions in parallel)
  ├─ Stage 2 (executing next phase)
  └─ Stage 3 (executing final response)
  ↓
PARTIALLY_COMPLETED (some actions failed)
COMPLETED (all actions succeeded)
FAILED (critical failure)
ROLLED_BACK (compensation executed)
```

### Audit Trail Components

**PlaybookExecution Document:**
```javascript
{
  executionId: "exec_uuid",
  playbookId: "playbook_uuid",
  incidentId: "incident_id",
  userId: "target_user_id",
  
  status: "COMPLETED",
  startedAt: Date,
  completedAt: Date,
  totalDuration: 45000, // ms
  
  actionExecutions: [
    {
      actionId: "action_1",
      actionType: "FULL_SESSION_KILL",
      status: "SUCCESS",
      startedAt: Date,
      completedAt: Date,
      duration: 2100,
      result: { revokedCount: 5 },
      retryCount: 0,
      idempotencyKey: "key_123"
    },
    ...
  ],
  
  approvals: [
    {
      approvalId: "approval_uuid",
      actionId: "action_2",
      status: "APPROVED",
      requestedAt: Date,
      approvals: [{approvedBy: "admin_id", approvedAt: Date}]
    }
  ],
  
  policyGates: [
    {
      gateName: "Critical_Action_Gate",
      status: "PASSED",
      evaluationTime: Date
    }
  ],
  
  auditEvents: [
    { timestamp: Date, event: "PLAYBOOK_INITIATED", actor: "SYSTEM" },
    { timestamp: Date, event: "STAGE_1_COMPLETED", actor: "SYSTEM" },
    { timestamp: Date, event: "APPROVAL_REQUESTED", actor: "SYSTEM" },
    { timestamp: Date, event: "APPROVAL_GRANTED", actor: "admin_user_id" },
    { timestamp: Date, event: "ACTION_EXECUTED", actor: "SYSTEM" },
    { timestamp: Date, event: "PLAYBOOK_COMPLETED", actor: "SYSTEM" }
  ],
  
  metrics: {
    actionCount: 3,
    successfulActions: 3,
    failedActions: 0
  }
}
```

**PlaybookActionAudit Document:**
```javascript
{
  auditId: "audit_uuid",
  executionId: "exec_id",
  actionId: "action_1",
  actionType: "FULL_SESSION_KILL",
  
  status: "SUCCESS",
  requestedAt: Date,
  startedAt: Date,
  completedAt: Date,
  duration: 2100,
  
  inputParameters: { /* action config */ },
  result: { revokedCount: 5 },
  
  retries: [
    {
      attemptNumber: 1,
      startedAt: Date,
      error: "Session timeout",
      backoffDelayMs: 1000
    }
  ],
  
  compensation: {
    required: false,
    status: "NOT_REQUIRED"
  },
  
  sideEffects: [
    {
      systemName: "session-cache",
      operation: "invalidate",
      status: "SUCCESS"
    }
  ],
  
  traceId: "trace_uuid",
  correlationIds: ["correlation_id_1"]
}
```

## API Endpoints

### Playbook Management

**GET /api/incident-playbooks**
- List all playbooks
- Query: type, enabled, severity
- Response: Array of playbook definitions

**GET /api/incident-playbooks/:playbookId**
- Get playbook details with all rules and actions
- Response: Complete playbook configuration

**POST /api/incident-playbooks**
- Create new playbook (SECURITY_ADMIN only)
- Body: name, description, playbookType, severity, rules, actions, policyGates
- Response: Created playbook with versioning

**PUT /api/incident-playbooks/:playbookId**
- Update playbook with version tracking
- Body: Any playbook fields to update
- Response: Updated playbook with changelog

**DELETE /api/incident-playbooks/:playbookId**
- Delete playbook (SECURITY_ADMIN only)
- Response: Deletion confirmation

### Execution Management

**GET /api/incident-playbooks/executions**
- List all playbook executions
- Query: status, riskLevel, userId, limit, skip
- Response: Paginated executions with summaries

**GET /api/incident-playbooks/executions/:executionId**
- Get full execution details and trace
- Response: Complete execution object with nested actions and events

**POST /api/incident-playbooks/executions/trigger**
- Manually trigger playbook execution (SECURITY_ADMIN/INCIDENT_COMMANDER)
- Body: playbookId, userId, triggerEvent, context
- Response: PlaybookExecution object

**POST /api/incident-playbooks/executions/:executionId/retry**
- Retry failed execution (SECURITY_ADMIN only)
- Response: New execution object

### Approval Management

**GET /api/incident-playbooks/approvals**
- List pending approvals
- Response: Array of pending approval requests

**POST /api/incident-playbooks/approvals/:approvalId/approve**
- Grant approval (authenticated user)
- Body: comment (optional)
- Response: Updated approval

**POST /api/incident-playbooks/approvals/:approvalId/deny**
- Deny approval
- Body: reason
- Response: Updated approval with denial reason

### Audit & Tracing

**GET /api/incident-playbooks/audits**
- List action audit trails (SECURITY_ADMIN/COMPLIANCE_OFFICER)
- Query: executionId, actionType, status, limit, skip
- Response: Paginated audit records

**GET /api/incident-playbooks/audits/:auditId**
- Get detailed action audit
- Response: Complete audit record with forensic data

### Policy Management

**GET /api/incident-playbooks/policies**
- List approval policies (SECURITY_ADMIN)
- Response: Array of active policies

**POST /api/incident-playbooks/policies**
- Create approval policy (SECURITY_ADMIN)
- Body: name, scope, applicablePlaybookIds, policyGates
- Response: Created policy

### Metrics & Reporting

**GET /api/incident-playbooks/metrics**
- Get playbook effectiveness metrics (SECURITY_ADMIN)
- Response: Metrics per playbook (success rate, avg duration, incidents contained)

## Example Usage

### Creating an Impossible Travel Playbook

```javascript
// 1. Define the playbook
const playbookConfig = {
  name: "Impossible Travel Response",
  playbookType: "SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL",
  severity: "HIGH",
  
  rules: [{
    ruleId: "impossible_travel_rule",
    ruleType: "SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL",
    conditions: {
      minImprobabilityScore: 70,
      minDistanceKm: 500,
      maxTimeDiffHours: 4
    },
    thresholds: {
      lowRisk: { improbability: 60 },
      mediumRisk: { improbability: 75 },
      highRisk: { improbability: 90 }
    },
    timeWindowMs: 3600000
  }],
  
  actions: [
    // Stage 1
    {
      actionId: "action_challenge",
      actionType: "STEP_UP_CHALLENGE",
      stage: 1,
      parameters: {
        challengeType: "EMAIL_OTP",
        expirationMinutes: 15
      },
      requiresApproval: false
    },
    {
      actionId: "action_notify",
      actionType: "USER_NOTIFICATION",
      stage: 1,
      parameters: {
        title: "Unusual Login Detected",
        message: "A login from a distant location was detected",
        severity: "WARNING",
        sendEmail: true
      },
      requiresApproval: false
    },
    
    // Stage 2 (if no step-up completion)
    {
      actionId: "action_revoke",
      actionType: "SELECTIVE_TOKEN_REVOKE",
      stage: 2,
      parameters: {
        sessionSelector: "SUSPICIOUS_GEO"
      },
      requiresApproval: false,
      condition: "context.stepUpChallengeStatus !== 'PASSED'"
    },
    {
      actionId: "action_reset",
      actionType: "FORCE_PASSWORD_RESET",
      stage: 2,
      requiresApproval: true,
      approvalRoles: ["SECURITY_ANALYST"]
    },
    
    // Stage 3 (if severity is CRITICAL)
    {
      actionId: "action_kill_sessions",
      actionType: "FULL_SESSION_KILL",
      stage: 3,
      requiresApproval: true,
      approvalRoles: ["SECURITY_ADMIN", "INCIDENT_COMMANDER"],
      condition: "context.severity === 'CRITICAL'"
    }
  ],
  
  policyGates: [{
    gateName: "Password_Reset_Gate",
    requiresApproval: true,
    requiredApprovers: 1,
    approvalRoles: [{ role: "SECURITY_ANALYST" }],
    approvalTimeoutMs: 3600000,
    escalationPath: [{
      escalationLevel: 1,
      delayMs: 1800000,
      escalateTo: "incident_commander_id"
    }]
  }]
};

// 2. Create the playbook
const response = await fetch('/api/incident-playbooks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(playbookConfig)
});
const { data: playbook } = await response.json();

// 3. Trigger when impossible travel detected
const detectionResponse = await fetch('/api/incident-playbooks/executions/trigger', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    playbookId: playbook._id,
    userId: suspiciousUserIdId,
    triggerEvent: "Impossible Travel Detection",
    context: {
      severity: "HIGH",
      confidenceScore: 85,
      improbability: 92.5,
      lastLocation: { latitude: 35.6762, longitude: 139.6503 },
      currentLocation: { latitude: 40.7128, longitude: -74.0060 }
    }
  })
});
const { data: execution } = await detectionResponse.json();

// 4. Monitor execution
const statusResponse = await fetch(
  `/api/incident-playbooks/executions/${execution.executionId}`
);
const executionDetails = await statusResponse.json();

// 5. Handle approvals as needed
const pendingApprovals = await fetch('/api/incident-playbooks/approvals');
const approvals = await pendingApprovals.json();

// 6. Approve action
if (approvals.data.length > 0) {
  const approval = approvals.data[0];
  await fetch(
    `/api/incident-playbooks/approvals/${approval.approvalId}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: "Approved - confirmed impossible travel" })
    }
  );
}

// 7. Review audit trail
const audit = await fetch(
  `/api/incident-playbooks/audits?executionId=${execution.executionId}`
);
const auditData = await audit.json();
```

## Best Practices

### 1. **Playbook Design**
- Start with Stage 1 actions that are minimally disruptive
- Only escalate to Stage 2/3 if initial response insufficient
- Always include user notification
- Require approval for account/password changes

### 2. **Rule Configuration**
- Set conservative thresholds to minimize false positives
- Use time windows appropriate to attack patterns
- Combine multiple signals for higher confidence
- Test rules on historical incidents

### 3. **Approval Policies**
- Require 2+ approvers for CRITICAL actions
- Set reasonable timeout (1-2 hours)
- Configure escalation to ensure decisions made
- Document exception criteria

### 4. **Monitoring & Tuning**
- Monitor execution success rates
- Track false positive rates
- Measure mean time to contain (MTTC)
- Adjust thresholds based on effectiveness metrics

### 5. **Compensation Strategies**
- Always define compensating actions for critical operations
- Test compensation paths in staging
- Document manual intervention procedures
- Monitor compensation failures closely

## Deterministic Execution Guarantees

The framework ensures:

1. **Reproducibility**: Same inputs always produce same execution path
2. **Idempotency**: Retrying safe actions doesn't cause duplicates
3. **Atomicity**: Actions either fully succeed or are compensated
4. **Traceability**: Every decision and action is logged
5. **Safety**: Guardrails prevent catastrophic failures

## Metrics & Effectiveness

Platform tracks:

- **Execution Metrics**
  - Total playbook executions
  - Success rate (successful / total)
  - Average execution time
  - Incidents contained

- **Action Metrics**
  - Per-action success rates
  - Retry frequency and patterns
  - Approval rates and times
  - Compensation invocations

- **Security Metrics**
  - Mean Time To Contain (MTTC)
  - False positive rate
  - User impact (sessions revoked, resets required)
  - Analyst escalation rate

## Troubleshooting

### Execution Failures
1. Check audit trail in PlaybookExecution.auditEvents
2. Review action-level logs in PlaybookActionAudit
3. Check error messages and stack traces
4. Verify network connectivity to external systems
5. Review approval process if action stuck

### Approval Timeouts
1. Check if approvers are active/available
2. Verify approval notifications sent successfully
3. Check escalation chain configuration
4. Review approval policy conditions
5. Consider adjusting timeout duration

### Compensation Failures
1. Check compensating action configuration
2. Verify system state before compensation
3. Review error logs in compensation.error
4. Manual state remediation may be required
5. Escalate to analyst for investigation

## Integration Points

Playbooks integrate with:

- **Session Management**: Session termination and token revocation
- **User Management**: Account suspension and password resets
- **Authentication**: Step-up challenges and 2FA
- **Notifications**: Email, SMS, in-app alerts
- **Audit Trail**: All actions logged to ImmutableAuditLog
- **Webhooks**: Custom integrations via webhook actions
- **Security Monitoring**: Detection feeds trigger playbooks
- **Threat Intelligence**: Campaign detection across accounts

## Security Considerations

1. **Approval Bypass Prevention**: Require multiple approvals for critical actions
2. **Compensation Safety**: Test undo operations before deployment
3. **Exception Auditing**: Track all policy exceptions
4. **Failed Action Escalation**: Automatic escalation on critical failures
5. **Rate Limiting**: Prevent playbook cascade attacks
6. **Encryption**: Sensitive data encrypted in audit logs

---

**Acceptance Criteria met:**
- ✅ Deterministic playbook execution with documented flow
- ✅ Safe retries with idempotency and exponential backoff
- ✅ Human-approval checkpoints with configurable policy gates
- ✅ Reduced MTTC through automated staged response
- ✅ Full execution traces with forensic investigation capability
- ✅ Four playbook types for common high-risk scenarios
- ✅ Compensating actions for downstream failures
- ✅ Staged response actions from initial to critical
