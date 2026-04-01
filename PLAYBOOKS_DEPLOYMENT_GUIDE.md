# Autonomous Incident Response Playbooks - Deployment Guide

## Pre-Deployment Checklist

- [ ] Node.js 14+ installed
- [ ] MongoDB running and accessible
- [ ] Redis running (for distributed operations)
- [ ] All dependencies installed
- [ ] Environment variables configured
- [ ] Test suite passing
- [ ] Database backups created
- [ ] Rollback plan in place

## Installation Steps

### Step 1: Install Dependencies

If `geolib` is not already in package.json:

```bash
npm install geolib

# Verify installation
npm list geolib
```

### Step 2: Database Migrations

The new models will be auto-created by Mongoose. However, create indexes for performance:

```bash
# Connect to MongoDB
mongosh

# Run index creation (optional, done automatically on first insert)
db.incidentplaybooks.createIndex({ playbookType: 1, enabled: 1 })
db.incidentplaybooks.createIndex({ severity: 1, enabled: 1 })
db.playbookexecutions.createIndex({ playbookId: 1, startedAt: -1 })
db.playbookexecutions.createIndex({ userId: 1, startedAt: -1 })
db.playbookactionaudits.createIndex({ executionId: 1, actionId: 1 })
```

### Step 3: Verify Server Configuration

The route has been added to `server.js`:

```javascript
// server.js, line ~42
const incidentPlaybookRoutes = require('./routes/incidentPlaybooks');

// server.js, line ~375
app.use('/api/incident-playbooks', incidentPlaybookRoutes);
```

Verify it's there:

```bash
grep -n "incident-playbooks" server.js
# Should show both the require and app.use statements
```

### Step 4: Environment Variables

Add to your `.env` file:

```bash
# Optional: Configure playbook-specific settings
INCIDENT_PLAYBOOK_MAX_CONCURRENT=10
INCIDENT_PLAYBOOK_TIMEOUT_MS=300000
INCIDENT_PLAYBOOK_RETRY_BACKOFF_MS=1000

# Notification settings
NOTIFICATION_EMAIL_FROM=security-alerts@company.com
NOTIFICATION_SLACK_WEBHOOK=https://hooks.slack.com/services/...
NOTIFICATION_TEAMS_WEBHOOK=https://outlook.webhook.office.com/...

# Approval settings
APPROVAL_TIMEOUT_MS=3600000
ESCALATION_CHECK_INTERVAL_MS=300000

# Geo-location settings (for impossible travel detection)
GEO_LOCATION_API_KEY=your_key_here
```

### Step 5: Seed Initial Playbooks

Create a seed script (`scripts/seedPlaybooks.js`):

```javascript
const mongoose = require('mongoose');
const IncidentPlaybook = require('./models/IncidentPlaybook');
require('dotenv').config();

async function seedPlaybooks() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expense-flow');
    
    // Check if playbooks already exist
    const count = await IncidentPlaybook.countDocuments();
    if (count > 0) {
      console.log(`Found ${count} existing playbooks. Skipping seed.`);
      process.exit(0);
    }
    
    // Create default playbooks
    const playbooks = [
      {
        playbookId: 'playbook_impossible_travel',
        name: 'Impossible Travel Detection Response',
        playbookType: 'SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL',
        severity: 'HIGH',
        enabled: true,
        rules: [{
          ruleId: 'rule_impossible_travel',
          ruleType: 'SUSPICIOUS_LOGIN_IMPOSSIBLE_TRAVEL',
          conditions: { minSignificance: 70 }
        }],
        actions: [
          {
            actionId: 'action_challenge',
            actionType: 'STEP_UP_CHALLENGE',
            stage: 1,
            parameters: { challengeType: 'EMAIL_OTP', expirationMinutes: 15 },
            requiresApproval: false
          },
          {
            actionId: 'action_notify',
            actionType: 'USER_NOTIFICATION',
            stage: 1,
            parameters: { title: 'Unusual Login', sendEmail: true },
            requiresApproval: false
          }
        ]
      },
      {
        playbookId: 'playbook_2fa_bypass',
        name: '2FA Bypass Attempts Response',
        playbookType: 'REPEATED_2FA_BYPASS',
        severity: 'HIGH',
        enabled: true,
        rules: [{
          ruleId: 'rule_2fa_bypass',
          ruleType: 'REPEATED_2FA_BYPASS',
          conditions: { minAttempts: 5, timeWindowMinutes: 60 }
        }],
        actions: [
          {
            actionId: 'action_escalate',
            actionType: 'ANALYST_ESCALATION',
            stage: 1,
            requiresApproval: false
          }
        ]
      }
    ];
    
    for (const playbookData of playbooks) {
      const existing = await IncidentPlaybook.findOne({ 
        playbookId: playbookData.playbookId 
      });
      
      if (!existing) {
        const playbook = new IncidentPlaybook(playbookData);
        await playbook.save();
        console.log(`✅ Created playbook: ${playbookData.name}`);
      }
    }
    
    console.log('Seed complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seedPlaybooks();
```

Run the seed script:

```bash
node scripts/seedPlaybooks.js
```

### Step 6: Test the Installation

```bash
# Start the server
npm start

# In another terminal, test the API
curl http://localhost:3000/api/incident-playbooks

# Should return: { success: true, count: 0, data: [] }
```

## Configuration Guide

### Setting Up Approval Policies

```javascript
// POST /api/incident-playbooks/policies

const policyConfig = {
  name: "CRITICAL_INCIDENT_APPROVAL",
  description: "Requires approval for all critical incidents",
  scope: "ALL_PLAYBOOKS",
  policyGates: [
    {
      gateName: "Session_Termination_Approval",
      requiresApproval: true,
      requiredApprovers: 2,
      approvalRoles: [
        { role: "SECURITY_ADMIN" },
        { role: "INCIDENT_COMMANDER" }
      ],
      approvalTimeoutMs: 3600000,
      triggers: {
        riskLevels: ["CRITICAL"],
        actionTypes: ["FULL_SESSION_KILL", "ACCOUNT_SUSPEND"]
      },
      escalationPath: [
        {
          escalationLevel: 1,
          delayMs: 1800000,
          escalateTo: "cto_user_id"
        }
      ]
    }
  ]
};

const response = await fetch('/api/incident-playbooks/policies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(policyConfig)
});
```

### Configuring Notification Channels

The system supports multiple notification channels. Configure in notification service:

```javascript
// services/notificationService.js modifications
const notificationChannels = {
  EMAIL: {
    enabled: !!process.env.SMTP_HOST,
    from: process.env.NOTIFICATION_EMAIL_FROM
  },
  SLACK: {
    enabled: !!process.env.SLACK_WEBHOOK,
    webhook: process.env.NOTIFICATION_SLACK_WEBHOOK
  },
  TEAMS: {
    enabled: !!process.env.TEAMS_WEBHOOK,
    webhook: process.env.NOTIFICATION_TEAMS_WEBHOOK
  },
  IN_APP: {
    enabled: true  // Always enabled
  }
};
```

### Setting Rate Limits

Add to server.js or middleware configuration:

```javascript
// Rate limit for playbook endpoints
const playbookLimiter = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                    // 100 requests per window
  message: 'Too many playbook requests'
});

app.use('/api/incident-playbooks', playbookLimiter);
```

## Monitoring Setup

### Key Metrics to Track

1. **Execution Metrics**
   ```javascript
   // Query in monitoring dashboard
   GET /api/incident-playbooks/metrics
   ```

2. **Failed Executions**
   ```javascript
   GET /api/incident-playbooks/executions?status=FAILED&limit=50
   ```

3. **Pending Approvals**
   ```javascript
   GET /api/incident-playbooks/approvals
   ```

4. **Audit Trail**
   ```javascript
   GET /api/incident-playbooks/audits?status=FAILED&limit=50
   ```

### Logging Configuration

Add to application logs:

```javascript
// Monitor playbook execution
logger.info(`Playbook ${execution.playbookName} started`, {
  executionId: execution.executionId,
  userId: execution.userId,
  riskLevel: execution.riskLevel
});

// Alert on failures
if (execution.status === 'FAILED') {
  logger.error(`Playbook execution failed: ${execution.executionId}`, {
    error: execution.error,
    actionsFailed: execution.failedActions
  });
  
  // Send alert to ops team
  alertService.sendAlert({
    severity: 'HIGH',
    message: `Playbook execution failed: ${execution.playbookName}`,
    executionId: execution.executionId
  });
}
```

### Alerting Rules

Set up alerts in your monitoring system (DataDog, New Relic, etc.):

```
# Alert if execution success rate < 90% in 1 hour
alert: PlaybookExecutionSuccessRate < 0.90
  for: 1h

# Alert if approval timeout > 10 minutes
alert: PlaybookApprovalTimeoutRate > 0.1
  for: 15m

# Alert if compensation failures > 0
alert: PlaybookCompensationFailures > 0
  for: 5m
```

## Testing Before Production

### 1. Unit Tests

```bash
npm test tests/playbookTests.js
```

### 2. Integration Test

Create `scripts/integrationTest.js`:

```javascript
const { v4: uuidv4 } = require('uuid');

async function runIntegrationTest() {
  console.log('Testing Incident Playbook Framework...\n');
  
  try {
    // 1. Create test playbook
    const playbook = await createTestPlaybook();
    console.log('✅ Playbook created:', playbook._id);
    
    // 2. Create approval policy
    const policy = await createTestPolicy();
    console.log('✅ Approval policy created:', policy._id);
    
    // 3. Trigger playbook
    const execution = await triggerPlaybook(playbook._id, 'test_user_id');
    console.log('✅ Execution started:', execution.executionId);
    
    // 4. Wait and check status
    await sleep(2000);
    const status = await getExecutionStatus(execution.executionId);
    console.log('✅ Execution status:', status);
    
    // 5. Get audit trail
    const audits = await getAuditTrail(execution.executionId);
    console.log(`✅ Generated ${audits.length} audit records`);
    
    console.log('\n✅ All integration tests passed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
}

runIntegrationTest();
```

Run it:

```bash
node scripts/integrationTest.js
```

### 3. Load Testing

Use Artillery or k6:

```bash
# Test playbook creation load
artillery quick --count 100 --num 10 \
  POST http://localhost:3000/api/incident-playbooks

# Test execution trigger load
artillery quick --count 50 --num 5 \
  POST http://localhost:3000/api/incident-playbooks/executions/trigger
```

## Rollback Plan

If deployment issues occur:

### Immediate Rollback (< 5 minutes)

```bash
# 1. Disable incident playbook routes in server.js
# Comment out the require and app.use lines

# 2. Restart application
npm restart

# 3. Verify old endpoints still work
curl http://localhost:3000/api/auth
```

### Database Rollback (if needed)

```bash
# Drop new collections if corrupted
mongosh
```

```javascript
use expense-flow
db.incidentplaybooks.drop()
db.playbookexecutions.drop()
db.playbookapprovalpolices.drop()
db.playbookactionaudits.drop()
```

### Full Revert

```bash
# 1. Revert code changes
git revert <commit-hash>

# 2. Reinstall dependencies (if removed)
npm install

# 3. Restart
npm start
```

## Post-Deployment

### Immediate (30 minutes)

- [ ] Verify all 4 endpoints responding
- [ ] Check database connectivity
- [ ] Verify notification channels working
- [ ] Monitor error logs (should be none)

### Short-term (1 hour)

- [ ] Create at least one test playbook
- [ ] Trigger a test execution
- [ ] Verify approval workflow
- [ ] Review audit trail

### Medium-term (1 day)

- [ ] Collect baseline metrics
- [ ] Train security team on usage
- [ ] Review playbook effectiveness
- [ ] Tune notification settings

### Long-term (1 week)

- [ ] Measure MTTC improvement
- [ ] Identify false positive incidents
- [ ] Adjust playbook thresholds
- [ ] Document lessons learned

## Troubleshooting Deployment

### Issue: Models not found
**Solution**: Ensure models are required in services:
```javascript
const IncidentPlaybook = require('../models/IncidentPlaybook');
```

### Issue: Routes returning 404
**Solution**: Check routing configuration in server.js:
```javascript
// Verify this line exists
app.use('/api/incident-playbooks', incidentPlaybookRoutes);
```

### Issue: Database connection errors
**Solution**: Check MongoDB is running and connection string configured:
```bash
mongosh mongodb://localhost:27017/expense-flow
```

### Issue: Approval notifications not sent
**Solution**: Verify notification service is configured:
```javascript
// Check services/notificationService.js has email/Slack configured
```

### Issue: Execution never completes
**Solution**: Check max execution timeout setting:
```javascript
// Default 5 minutes - increase if needed
maxExecutionTimeMs: 600000  // 10 minutes
```

## Support & Monitoring

### Key Contacts
- **Security Team**: security-team@company.com
- **On-Call**: #security-incidents Slack channel
- **Documentation**: See INCIDENT_RESPONSE_PLAYBOOKS.md

### Logging Locations
- Application: `/var/log/expense-flow/app.log`
- Errors: `/var/log/expense-flow/error.log`
- Database: MongoDB server logs

### Health Check Endpoint

Add to your monitoring:
```javascript
// GET /health/incident-playbooks
{
  status: "healthy",
  models: {
    incidentPlaybook: true,
    playbookExecution: true,
    playbookApprovalsPolicy: true,
    playbookActionAudit: true
  },
  executions: {
    active: 5,
    pending_approvals: 3
  }
}
```

---

**Deployment Estimated Time**: 15-30 minutes  
**Rollback Time**: < 5 minutes  
**Testing Time**: 1-2 hours  
**Full Setup Time**: 4-8 hours

For detailed documentation, see [INCIDENT_RESPONSE_PLAYBOOKS.md](INCIDENT_RESPONSE_PLAYBOOKS.md)
