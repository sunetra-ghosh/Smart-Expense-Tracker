# Incident Response Playbooks - Quick Reference Guide

## Quick Links

- **Full Documentation**: [INCIDENT_RESPONSE_PLAYBOOKS.md](INCIDENT_RESPONSE_PLAYBOOKS.md)
- **Implementation Details**: [ISSUE_851_IMPLEMENTATION_SUMMARY.md](ISSUE_851_IMPLEMENTATION_SUMMARY.md)
- **Tests**: [tests/playbookTests.js](tests/playbookTests.js)

## File Structure

```
.
├── models/
│   ├── IncidentPlaybook.js           # Playbook definitions
│   ├── PlaybookExecution.js          # Execution tracking
│   ├── PlaybookApprovalPolicy.js     # Approval rules
│   └── PlaybookActionAudit.js        # Detailed audit logs
│
├── services/playbooks/
│   ├── incidentPlaybookEngineService.js      # Core orchestrator
│   ├── playbookExecutorService.js            # Action handlers
│   ├── playbookApprovalGateService.js        # Approval workflow
│   └── specificPlaybooksService.js           # Scenario-specific logic
│
├── routes/
│   └── incidentPlaybooks.js          # API endpoints
│
└── tests/
    └── playbookTests.js              # Test suite
```

## Core Concepts at a Glance

### Playbook States
```
INITIATED → RUNNING → PARTIALLY_COMPLETED/COMPLETED/FAILED → ROLLED_BACK
```

### Action States
```
PENDING → EXECUTING → SUCCESS/FAILED → COMPENSATED
```

### Stages
- **Stage 1**: Initial response (notifications, challenges)
- **Stage 2**: Escalated response (revocation, resets)
- **Stage 3**: Critical response (suspension, termination)

### Approval States
```
NOT_REQUIRED → PENDING → APPROVED/DENIED → EXECUTED
```

## Common Tasks

### Create a Playbook

```javascript
// POST /api/incident-playbooks
const playbook = {
  name: "My Playbook",
  playbookType: "SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL",
  severity: "HIGH",
  rules: [{
    ruleId: "rule_1",
    ruleType: "SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL",
    conditions: { /* rules */ }
  }],
  actions: [
    { actionId: "a1", actionType: "STEP_UP_CHALLENGE", stage: 1, ... },
    { actionId: "a2", actionType: "SELECTIVE_TOKEN_REVOKE", stage: 2, ... }
  ],
  policyGates: [{ /* gates */ }]
};

const response = await fetch('/api/incident-playbooks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(playbook)
});
```

### Trigger a Playbook

```javascript
// POST /api/incident-playbooks/executions/trigger
const execution = await fetch('/api/incident-playbooks/executions/trigger', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    playbookId: "playbook_id",
    userId: "target_user_id",
    triggerEvent: "Event Name",
    context: { /* incident data */ }
  })
});
```

### Monitor Execution

```javascript
// GET /api/incident-playbooks/executions/:executionId
const execution = await fetch(
  '/api/incident-playbooks/executions/exec_uuid'
).then(r => r.json());

console.log(execution.data.status);           // COMPLETED
console.log(execution.data.actionExecutions); // []
console.log(execution.data.auditEvents);      // []
```

### Approve Action

```javascript
// POST /api/incident-playbooks/approvals/:approvalId/approve
await fetch('/api/incident-playbooks/approvals/approval_uuid/approve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ comment: "Approved" })
});
```

### Review Audit Trail

```javascript
// GET /api/incident-playbooks/audits?executionId=exec_uuid
const audits = await fetch(
  '/api/incident-playbooks/audits?executionId=exec_uuid'
).then(r => r.json());

audits.data.forEach(audit => {
  console.log(`${audit.actionType}: ${audit.status}`);
});
```

## Action Types Quick Reference

| Action | Stage | Impact | Approval |
|--------|-------|--------|----------|
| STEP_UP_CHALLENGE | 1 | Low | Optional |
| USER_NOTIFICATION | 1 | Low | No |
| ANALYST_ESCALATION | 1 | Low | No |
| SELECTIVE_TOKEN_REVOKE | 2 | Medium | No |
| FORCE_PASSWORD_RESET | 2 | Medium | Usually |
| FULL_SESSION_KILL | 3 | High | Yes |
| ACCOUNT_SUSPEND | 3 | Critical | Yes |
| DEVICE_DEREGISTER | 2-3 | Medium | No |
| IPBLACKLIST_ADD | 1-2 | Medium | No |
| GEO_LOCK | 2 | High | Yes |
| CUSTOM_WEBHOOK | Any | Variable | Optional |

## Playbook Types

```
SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL
  Detection: Login from geographically impossible location
  Severity: HIGH
  First Action: Step-up challenge, selective revocation

REPEATED_2FA_BYPASS
  Detection: 5+ failed 2FA attempts in 60 mins
  Severity: MEDIUM→CRITICAL (scales with attempts)
  First Action: Step-up challenge, escalated notification

UNUSUAL_PRIVILEGE_ACTION
  Detection: Rare/unusual privilege operation
  Severity: HIGH→CRITICAL (by action type)
  First Action: Always requires approval before execution

MULTI_ACCOUNT_CAMPAIGN
  Detection: 3+ accounts hit from same source in 60 mins
  Severity: CRITICAL
  First Action: Full session kill + IP blacklist
```

## Policy Gate Template

```javascript
{
  gateName: "Gate_Name",
  requiresApproval: true,
  requiredApprovers: 2,
  approvalRoles: [
    { role: "SECURITY_ADMIN" },
    { role: "INCIDENT_COMMANDER" }
  ],
  approvalTimeoutMs: 3600000,  // 1 hour
  escalationPath: [{
    escalationLevel: 1,
    delayMs: 1800000,  // 30 mins
    escalateTo: "user_id"
  }],
  triggers: {
    riskLevels: ["HIGH", "CRITICAL"],
    actionTypes: ["FULL_SESSION_KILL"],
    conditions: { /* optional custom logic */ }
  },
  autoApprovalConditions: [{
    condition: "incident.severity === 'CRITICAL'",
    autoApprove: true
  }]
}
```

## Approval Workflow

```
1. Action requires approval?
   ├─ NO → Execute immediately
   └─ YES → Continue to step 2

2. Check exemptions/exceptions
   ├─ Exception found → Skip approval
   └─ No exception → Continue to step 3

3. Check auto-approval conditions
   ├─ Condition met → Auto-approve
   └─ No condition met → Continue to step 4

4. Find approvers for action
   ├─ None available → Deny action
   └─ Found → Continue to step 5

5. Send approval request notifications
   ├─ EMAIL → if configured
   ├─ SLACK → if configured
   └─ IN-APP → always

6. Wait for approval decisions
   ├─ Any DENY received → Deny action
   ├─ Enough APPROVEs → Approve action
   ├─ Timeout reached → Escalate to next level
   └─ Max escalations reached → Apply fallback policy

7. Execute or skip based on decision
```

## Retry Logic

```javascript
// Default retry configuration
{
  maxRetries: 3,
  backoffMs: 1000,
  backoffMultiplier: 2
}

// Attempt timeline
Attempt 1: Immediate
Attempt 2: Wait 1 second, retry
Attempt 3: Wait 2 seconds, retry
Attempt 4: Wait 4 seconds, retry
If all fail → Trigger compensation
```

## Compensation (Rollback)

```javascript
// Action with compensation
{
  actionId: "a1",
  actionType: "FORCE_PASSWORD_RESET",
  stage: 2,
  compensatingAction: {
    actionType: "RESET_COMPENSATION",
    parameters: {
      resetToken: "original_token",
      expirationTime: "previous_expiration"
    }
  }
}

// If action fails after retries:
// → Execute compensatingAction
// → Restore previous state
// → Log in audit trail
```

## Error Scenarios & Recovery

### Execution Fails Mid-Way
1. Check `PlaybookExecution.auditEvents` for what happened
2. Review `PlaybookActionAudit` for detailed action error
3. Compensation actions execute automatically
4. Manual remediation if compensation also fails
5. Escalate to analyst

### Approval Timeout
1. Approvals escalate to next level in escalation path
2. If max escalation reached, apply fallback policy:
   - DENY_ACTION: Action doesn't execute
   - ALLOW_ACTION: Action executes without approval
   - ESCALATE_TO_HUMAN: Route to manual analyst

### External System Unavailable
1. Action fails after retries
2. Compensation attempts
3. Error recorded in audit
4. Analyst escalation triggered
5. Manual intervention may be needed

## Debugging Tips

### Check Execution Status
```javascript
GET /api/incident-playbooks/executions/:executionId

// Review status field and stages
{
  status: "COMPLETED",           // Overall status
  stages: [{ status: "SUCCESS" }],
  actionExecutions: [
    { 
      status: "SUCCESS",
      duration: 1000,
      result: { /* ... */ }
    }
  ]
}
```

### Review What Happened
```javascript
GET /api/incident-playbooks/executions/:executionId

// Check auditEvents
execution.data.auditEvents
  // Array of {timestamp, event, actor, details}
  // Shows decision points and actions taken
```

### Check Approval Status
```javascript
GET /api/incident-playbooks/approvals

// Lists pending approvals
// Shows who needs to approve what
```

### Forensic Analysis
```javascript
GET /api/incident-playbooks/audits?executionId=:id

// Detailed per-action audit trail
// Retry attempts, errors, compensation results
// Use for compliance/investigation
```

## Performance Tuning

**Batch Size for Approvals**: Default 5 at a time
**Stage Execution**: Parallel within stage, sequential between stages
**Retry Timeout**: Individual action timeout is 30 seconds (configurable)
**Total Execution Timeout**: Default 5 minutes

## Monitoring & Alerts

Key metrics to monitor:
- **Execution Success Rate**: Should be >95%
- **Mean Approval Time**: Should be <15 minutes
- **Mean Execution Time**: Should scale with action count
- **Compensation Rate**: Should be <5%
- **False Positive Rate**: Track impact on users

Set alerts for:
- ❌ Execution failures
- ❌ Approval timeouts
- ❌ Compensation failures
- ❌ Analyst escalations exceed threshold

## Permission Matrix

| Action | SECURITY_ADMIN | INCIDENT_COMMANDER | ANALYST | USER |
|--------|----------------|--------------------|---------|------|
| View playbooks | ✅ | ✅ | ✅ | ❌ |
| Create playbook | ✅ | ❌ | ❌ | ❌ |
| Trigger playbook | ✅ | ✅ | ❌ | ❌ |
| Approve action | ✅ | ✅ | ✅ | ❌ |
| Retry execution | ✅ | ❌ | ❌ | ❌ |
| View audit trail | ✅ | ✅ | ✅ | ❌ |
| Create policy | ✅ | ❌ | ❌ | ❌ |

## Integration Examples

### Integration with Detection System
```javascript
// When detecting impossible travel
const {
  ImpossibleTravelPlaybookService
} = require('services/playbooks/specificPlaybooksService');

const result = await ImpossibleTravelPlaybookService
  .triggerPlaybook(userId, impossibleTravelData);

// Returns { incident, execution }
```

### Custom Action via Webhook
```javascript
{
  actionId: "notify_siem",
  actionType: "CUSTOM_WEBHOOK",
  stage: 1,
  parameters: {
    webhookUrl: "https://siem.company.com/api/incidents",
    method: "POST",
    customData: {
      incidentId: "{incident_id}",
      severity: "{severity}"
    }
  }
}
```

## Troubleshooting Checklist

- [ ] Is the playbook enabled?
- [ ] Do rules match the incident?
- [ ] Are actions valid action types?
- [ ] Are approval roles configured correctly?
- [ ] Is approver user active?
- [ ] Check notification channel configuration
- [ ] Verify database connectivity
- [ ] Check service logs for errors
- [ ] Review audit trail for decision points
- [ ] Test in staging first

---

For complete documentation, see [INCIDENT_RESPONSE_PLAYBOOKS.md](INCIDENT_RESPONSE_PLAYBOOKS.md)
