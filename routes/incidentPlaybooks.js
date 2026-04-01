const express = require('express');
const router = express.Router();
const { validateDataTypes } = require('../middleware/sanitizer');
const { requireAuth, requireRole } = require('../middleware/auth');
const IncidentPlaybook = require('../models/IncidentPlaybook');
const PlaybookExecution = require('../models/PlaybookExecution');
const PlaybookApprovalPolicy = require('../models/PlaybookApprovalPolicy');
const PlaybookActionAudit = require('../models/PlaybookActionAudit');
const incidentPlaybookEngineService = require('../services/playbooks/incidentPlaybookEngineService');
const playbookApprovalGateService = require('../services/playbooks/playbookApprovalGateService');
const { v4: uuidv4 } = require('uuid');

/**
 * Incident Playbook Routes
 * Issue #851: Autonomous Incident Response Playbooks
 */

/**
 * ===== PLAYBOOK MANAGEMENT =====
 */

/**
 * GET /api/playbooks - List all playbooks
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { type, enabled, severity } = req.query;
    
    const filter = {};
    if (type) filter.playbookType = type;
    if (enabled !== undefined) filter.enabled = enabled === 'true';
    if (severity) filter.severity = severity;
    
    const playbooks = await IncidentPlaybook.find(filter)
      .select('-changeLog')
      .sort({ severity: -1, name: 1 });
    
    res.json({
      success: true,
      count: playbooks.length,
      data: playbooks
    });
  } catch (error) {
    console.error('Error listing playbooks:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/playbooks/:playbookId - Get playbook details
 */
router.get('/:playbookId', requireAuth, async (req, res) => {
  try {
    const playbook = await IncidentPlaybook.findById(req.params.playbookId);
    
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found' });
    }
    
    res.json({
      success: true,
      data: playbook
    });
  } catch (error) {
    console.error('Error fetching playbook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/playbooks - Create new playbook
 */
router.post('/', requireAuth, requireRole(['SECURITY_ADMIN']), async (req, res) => {
  try {
    const {
      name,
      description,
      playbookType,
      severity,
      rules,
      actions,
      policyGates,
      enabled
    } = req.body;
    
    // Validate required fields
    if (!name || !playbookType || !severity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const playbook = new IncidentPlaybook({
      playbookId: `playbook_${uuidv4()}`,
      name,
      description,
      playbookType,
      severity,
      rules: rules || [],
      actions: actions || [],
      policyGates: policyGates || [],
      enabled: enabled !== false,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id,
      changeLog: [{
        timestamp: new Date(),
        changedBy: req.user._id,
        changes: 'Playbook created',
        version: 1
      }]
    });
    
    await playbook.save();
    
    res.status(201).json({
      success: true,
      message: 'Playbook created',
      data: playbook
    });
  } catch (error) {
    console.error('Error creating playbook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/playbooks/:playbookId - Update playbook
 */
router.put('/:playbookId', requireAuth, requireRole(['SECURITY_ADMIN']), async (req, res) => {
  try {
    const playbook = await IncidentPlaybook.findById(req.params.playbookId);
    
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found' });
    }
    
    const { name, description, severity, rules, actions, policyGates, enabled } = req.body;
    
    // Track changes
    let changes = [];
    if (name && name !== playbook.name) changes.push(`Name: ${playbook.name} → ${name}`);
    if (severity && severity !== playbook.severity) changes.push(`Severity: ${playbook.severity} → ${severity}`);
    if (enabled !== undefined && enabled !== playbook.enabled) changes.push(`Enabled: ${playbook.enabled} → ${enabled}`);
    
    // Update fields
    if (name) playbook.name = name;
    if (description) playbook.description = description;
    if (severity) playbook.severity = severity;
    if (rules) playbook.rules = rules;
    if (actions) playbook.actions = actions;
    if (policyGates) playbook.policyGates = policyGates;
    if (enabled !== undefined) playbook.enabled = enabled;
    
    playbook.lastModifiedBy = req.user._id;
    playbook.version += 1;
    playbook.changeLog.push({
      timestamp: new Date(),
      changedBy: req.user._id,
      changes: changes.join('; '),
      version: playbook.version
    });
    
    await playbook.save();
    
    res.json({
      success: true,
      message: 'Playbook updated',
      data: playbook
    });
  } catch (error) {
    console.error('Error updating playbook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/playbooks/:playbookId - Delete playbook
 */
router.delete('/:playbookId', requireAuth, requireRole(['SECURITY_ADMIN']), async (req, res) => {
  try {
    const playbook = await IncidentPlaybook.findByIdAndDelete(req.params.playbookId);
    
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found' });
    }
    
    res.json({
      success: true,
      message: 'Playbook deleted',
      data: playbook
    });
  } catch (error) {
    console.error('Error deleting playbook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ===== EXECUTION MANAGEMENT =====
 */

/**
 * GET /api/executions - List playbook executions
 */
router.get('/executions', requireAuth, requireRole(['SECURITY_ADMIN', 'SECURITY_ANALYST']), async (req, res) => {
  try {
    const { status, riskLevel, userId, limit = 50, skip = 0 } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (riskLevel) filter.riskLevel = riskLevel;
    if (userId) filter.userId = userId;
    
    const executions = await PlaybookExecution.find(filter)
      .populate('playbookId', 'name playbookType')
      .populate('userId', 'name email')
      .sort({ startedAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));
    
    const total = await PlaybookExecution.countDocuments(filter);
    
    res.json({
      success: true,
      count: executions.length,
      total,
      data: executions
    });
  } catch (error) {
    console.error('Error listing executions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/executions/:executionId - Get execution details
 */
router.get('/executions/:executionId', requireAuth, async (req, res) => {
  try {
    const execution = await PlaybookExecution.findOne({ executionId: req.params.executionId })
      .populate('playbookId')
      .populate('userId', 'name email');
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    console.error('Error fetching execution:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/executions/trigger - Manually trigger playbook
 */
router.post('/executions/trigger', requireAuth, requireRole(['SECURITY_ADMIN', 'INCIDENT_COMMANDER']), async (req, res) => {
  try {
    const { playbookId, userId, triggerEvent, context } = req.body;
    
    if (!playbookId || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const playbook = await IncidentPlaybook.findById(playbookId);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found' });
    }
    
    // Trigger execution
    const execution = await incidentPlaybookEngineService.executePlaybook(
      playbook,
      { _id: userId, targetUser: userId, severity: context?.severity || 'MEDIUM' },
      { triggerEvent, ...context }
    );
    
    res.status(201).json({
      success: true,
      message: 'Playbook execution triggered',
      data: execution
    });
  } catch (error) {
    console.error('Error triggering playbook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/executions/:executionId/retry - Retry execution
 */
router.post('/executions/:executionId/retry', requireAuth, requireRole(['SECURITY_ADMIN']), async (req, res) => {
  try {
    const execution = await PlaybookExecution.findOne({ executionId: req.params.executionId });
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    if (execution.status === 'RUNNING') {
      return res.status(400).json({ error: 'Cannot retry running execution' });
    }
    
    // Create new execution based on original
    const playbook = await IncidentPlaybook.findById(execution.playbookId);
    if (!playbook) {
      return res.status(404).json({ error: 'Playbook not found' });
    }
    
    const newExecution = await incidentPlaybookEngineService.executePlaybook(
      playbook,
      { _id: execution.userId, targetUser: execution.userId },
      execution.triggerContext
    );
    
    res.json({
      success: true,
      message: 'Execution retried',
      data: newExecution
    });
  } catch (error) {
    console.error('Error retrying execution:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ===== APPROVAL MANAGEMENT =====
 */

/**
 * GET /api/approvals - List pending approvals
 */
router.get('/approvals', requireAuth, async (req, res) => {
  try {
    const executions = await PlaybookExecution.find({
      'approvals.status': 'PENDING'
    }).populate('userId', 'name email');
    
    const approvals = [];
    for (const execution of executions) {
      for (const approval of execution.approvals) {
        if (approval.status === 'PENDING') {
          approvals.push({
            approvalId: approval.approvalId,
            executionId: execution.executionId,
            actionId: approval.actionId,
            actionType: approval.actionType,
            requiredApprovers: approval.requiredApprovers,
            requestedAt: approval.requestedAt,
            expiresAt: approval.expiresAt,
            approvers: approval.approvers.length
          });
        }
      }
    }
    
    res.json({
      success: true,
      count: approvals.length,
      data: approvals
    });
  } catch (error) {
    console.error('Error listing approvals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/approvals/:approvalId/approve - Approve action
 */
router.post('/approvals/:approvalId/approve', requireAuth, async (req, res) => {
  try {
    const { comment } = req.body;
    
    const approval = await playbookApprovalGateService.processApprovalDecision(
      req.params.approvalId,
      req.user._id,
      'APPROVE',
      comment
    );
    
    res.json({
      success: true,
      message: 'Approval granted',
      data: approval
    });
  } catch (error) {
    console.error('Error approving action:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/approvals/:approvalId/deny - Deny action
 */
router.post('/approvals/:approvalId/deny', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const approval = await playbookApprovalGateService.processApprovalDecision(
      req.params.approvalId,
      req.user._id,
      'DENY',
      reason
    );
    
    res.json({
      success: true,
      message: 'Approval denied',
      data: approval
    });
  } catch (error) {
    console.error('Error denying action:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ===== AUDIT AND TRACING =====
 */

/**
 * GET /api/audits - List action audits
 */
router.get('/audits', requireAuth, requireRole(['SECURITY_ADMIN', 'COMPLIANCE_OFFICER']), async (req, res) => {
  try {
    const { executionId, actionType, status, limit = 50, skip = 0 } = req.query;
    
    const filter = {};
    if (executionId) filter.executionId = executionId;
    if (actionType) filter.actionType = actionType;
    if (status) filter.status = status;
    
    const audits = await PlaybookActionAudit.find(filter)
      .sort({ requestedAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));
    
    const total = await PlaybookActionAudit.countDocuments(filter);
    
    res.json({
      success: true,
      count: audits.length,
      total,
      data: audits
    });
  } catch (error) {
    console.error('Error listing audits:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audits/:auditId - Get audit details
 */
router.get('/audits/:auditId', requireAuth, async (req, res) => {
  try {
    const audit = await PlaybookActionAudit.findById(req.params.auditId);
    
    if (!audit) {
      return res.status(404).json({ error: 'Audit not found' });
    }
    
    res.json({
      success: true,
      data: audit
    });
  } catch (error) {
    console.error('Error fetching audit:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ===== POLICIES =====
 */

/**
 * GET /api/policies - List approval policies
 */
router.get('/policies', requireAuth, requireRole(['SECURITY_ADMIN']), async (req, res) => {
  try {
    const policies = await PlaybookApprovalPolicy.find({ enabled: true })
      .sort({ priority: -1 });
    
    res.json({
      success: true,
      count: policies.length,
      data: policies
    });
  } catch (error) {
    console.error('Error listing policies:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/policies - Create approval policy
 */
router.post('/policies', requireAuth, requireRole(['SECURITY_ADMIN']), async (req, res) => {
  try {
    const {
      name,
      description,
      scope,
      applicablePlaybookIds,
      policyGates,
      enabled
    } = req.body;
    
    if (!name || !scope) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const policy = new PlaybookApprovalPolicy({
      policyId: `policy_${uuidv4()}`,
      name,
      description,
      scope,
      applicablePlaybookIds: applicablePlaybookIds || [],
      policyGates: policyGates || [],
      enabled: enabled !== false,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });
    
    await policy.save();
    
    res.status(201).json({
      success: true,
      message: 'Policy created',
      data: policy
    });
  } catch (error) {
    console.error('Error creating policy:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ===== METRICS AND REPORTING =====
 */

/**
 * GET /api/metrics - Get playbook metrics
 */
router.get('/metrics', requireAuth, requireRole(['SECURITY_ADMIN']), async (req, res) => {
  try {
    const playbooks = await IncidentPlaybook.find({ enabled: true });
    
    const metrics = playbooks.map(pb => ({
      playbookId: pb.playbookId,
      name: pb.name,
      type: pb.playbookType,
      totalExecutions: pb.metrics.totalExecutions,
      successfulExecutions: pb.metrics.successfulExecutions,
      failedExecutions: pb.metrics.failedExecutions,
      successRate: pb.metrics.totalExecutions > 0 
        ? (pb.metrics.successfulExecutions / pb.metrics.totalExecutions * 100).toFixed(2)
        : 0,
      averageExecutionTimeMs: pb.metrics.averageExecutionTimeMs,
      incidentsContained: pb.metrics.incidentsContained,
      lastExecutedAt: pb.metrics.lastExecutedAt
    }));
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
