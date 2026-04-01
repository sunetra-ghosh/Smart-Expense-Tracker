const PlaybookApprovalPolicy = require('../../models/PlaybookApprovalPolicy');
const PlaybookExecution = require('../../models/PlaybookExecution');
const User = require('../../models/User');
const notificationService = require('../notificationService');
const emailService = require('../emailService');
const crypto = require('crypto');

/**
 * Playbook Approval Gate Service
 * Issue #851: Autonomous Incident Response Playbooks
 * 
 * Manages policy gates and approval workflows
 * Ensures human-in-the-loop control for sensitive security actions
 */

class PlaybookApprovalGateService {
  /**
   * Evaluate all policy gates for playbook
   */
  async evaluatePolicyGates(playbook, incident, execution) {
    try {
      if (!playbook.policyGates || playbook.policyGates.length === 0) {
        return [];
      }
      
      const applicablePolicies = await this.findApplicablePolicies(
        playbook,
        incident,
        execution
      );
      
      const gateResults = [];
      
      for (const policy of applicablePolicies) {
        for (const gate of policy.getApplicableGates({
          riskLevel: incident.severity,
          actionType: playbook.playbookType
        })) {
          const gateResult = await this.evaluateGate(
            gate,
            policy,
            incident,
            execution
          );
          
          gateResults.push(gateResult);
          
          // Stop if gate failed and not allowing partial execution
          if (gateResult.status === 'FAILED' && !gate.allowPartialExecution) {
            break;
          }
        }
      }
      
      return gateResults;
      
    } catch (error) {
      console.error('Policy gate evaluation error:', error);
      throw error;
    }
  }

  /**
   * Evaluate individual gate
   */
  async evaluateGate(gate, policy, incident, execution) {
    const gateResult = {
      gateName: gate.gateName,
      status: 'PASSED',
      evaluationTime: new Date(),
      reason: null,
      gatePolicy: policy.policyId
    };
    
    try {
      // Check if approval required
      if (gate.requiresApproval) {
        // Check for exceptions
        const hasException = policy.hasExceptionFor(
          incident.targetUser,
          incident.severity
        );
        
        if (hasException) {
          gateResult.status = 'PASSED';
          gateResult.reason = 'Exception granted';
          return gateResult;
        }
        
        // Check auto-approval conditions
        const autoApproved = this.checkAutoApproval(
          gate,
          policy,
          incident,
          execution
        );
        
        if (autoApproved) {
          gateResult.status = 'PASSED';
          gateResult.reason = 'Auto-approved based on conditions';
          return gateResult;
        }
        
        // Request approval
        const approval = await this.requestApprovalFromGate(
          gate,
          policy,
          incident,
          execution
        );
        
        if (approval.status === 'DENIED') {
          gateResult.status = 'FAILED';
          gateResult.reason = `Approval denied: ${approval.reason}`;
          return gateResult;
        }
        
        if (approval.status === 'PENDING') {
          if (!gate.allowPartialExecution) {
            gateResult.status = 'APPROVAL_PENDING';
            gateResult.reason = 'Awaiting approval';
            return gateResult;
          }
        }
      }
      
      // Check other gate conditions
      if (gate.triggers && gate.triggers.conditions) {
        const conditionsMet = this.evaluateConditions(
          gate.triggers.conditions,
          incident,
          execution
        );
        
        if (!conditionsMet) {
          gateResult.status = 'FAILED';
          gateResult.reason = 'Gate conditions not met';
          return gateResult;
        }
      }
      
      return gateResult;
      
    } catch (error) {
      console.error(`Gate evaluation error for ${gate.gateName}:`, error);
      
      // Handle fallback behavior
      if (policy.fallbackBehavior === 'DENY_ACTION') {
        gateResult.status = 'FAILED';
        gateResult.reason = `System error: ${error.message}`;
      } else if (policy.fallbackBehavior === 'ALLOW_ACTION') {
        gateResult.status = 'PASSED';
        gateResult.reason = 'Allowed due to system error (fallback)';
      } else {
        gateResult.status = 'ESCALATION_REQUIRED';
        gateResult.reason = `System error requiring escalation: ${error.message}`;
      }
      
      return gateResult;
    }
  }

  /**
   * Request approval from gate
   */
  async requestApprovalFromGate(gate, policy, incident, execution) {
    try {
      // Get approvers from approval roles
      const approvers = await this.getApproversForGate(gate);
      
      if (approvers.length === 0) {
        return {
          status: 'DENIED',
          reason: 'No approvers available'
        };
      }
      
      const approval = {
        approvalId: `approval_${crypto.randomBytes(8).toString('hex')}`,
        gateId: gate.gateName,
        requiredApprovers: gate.requiredApprovers || 1,
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + (gate.approvalTimeoutMs || 3600000)),
        approvers: approvers.map(a => a._id),
        status: 'PENDING',
        approvals: [],
        denials: []
      };
      
      // Store approval request
      execution.approvals = execution.approvals || [];
      execution.approvals.push(approval);
      
      // Notify approvers
      await this.notifyApprovers(approvers, gate, incident, execution, approval);
      
      // Setup escalation timers
      if (gate.escalationPath && gate.escalationPath.length > 0) {
        await this.setupEscalation(gate, approval, incident, execution);
      }
      
      return approval;
      
    } catch (error) {
      console.error('Error requesting approval:', error);
      throw error;
    }
  }

  /**
   * Request approval for action
   */
  async requestApproval(action, incident, execution) {
    try {
      if (!action.requiresApproval) {
        return { status: 'NOT_REQUIRED' };
      }
      
      // Get approvers from action roles
      const approvers = await this.getApproversForAction(action);
      
      if (approvers.length === 0) {
        return {
          status: 'DENIED',
          reason: 'No approvers available'
        };
      }
      
      const approval = {
        approvalId: `approval_${crypto.randomBytes(8).toString('hex')}`,
        actionId: action.actionId,
        actionType: action.actionType,
        requiredApprovers: action.approvalRoles?.length || 1,
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),  // 1 hour timeout
        approvers: approvers.map(a => a._id),
        status: 'PENDING',
        approvals: [],
        denials: []
      };
      
      // Store in execution
      if (!execution.approvals) {
        execution.approvals = [];
      }
      execution.approvals.push(approval);
      
      // Notify approvers
      for (const approver of approvers) {
        try {
          await notificationService.notifySecurityAlert(approver._id, {
            title: 'Action Approval Required',
            message: `Approval required for action: ${action.actionType}`,
            approvalId: approval.approvalId,
            actionType: action.actionType,
            link: `/incidents/approvals/${approval.approvalId}`
          });
          
          if (approver.email) {
            await emailService.sendSecurityAlert(approver.email, {
              subject: 'Security Action Requires Your Approval',
              template: 'approval_request',
              data: {
                actionType: action.actionType,
                reason: 'Incident response automated action',
                approvalLink: `/incidents/approvals/${approval.approvalId}`
              }
            });
          }
        } catch (e) {
          console.error(`Failed to notify approver ${approver._id}:`, e);
        }
      }
      
      return approval;
      
    } catch (error) {
      console.error('Error requesting approval:', error);
      throw error;
    }
  }

  /**
   * Process approval decision
   */
  async processApprovalDecision(approvalId, userId, decision, comment) {
    try {
      const execution = await PlaybookExecution.findOne({
        'approvals.approvalId': approvalId
      });
      
      if (!execution) {
        throw new Error('Approval not found');
      }
      
      const approval = execution.approvals.find(a => a.approvalId === approvalId);
      if (!approval) {
        throw new Error('Approval not found in execution');
      }
      
      // Verify user is approver
      if (!approval.approvers.includes(userId)) {
        throw new Error('User is not authorized to approve this');
      }
      
      // Check if already decided
      const alreadyDecided = approval.approvals.some(a => a.approvedBy.toString() === userId.toString()) ||
                            approval.denials.some(d => d.deniedBy.toString() === userId.toString());
      
      if (alreadyDecided) {
        throw new Error('This user has already voted on this approval');
      }
      
      if (decision === 'APPROVE') {
        approval.approvals.push({
          approvedBy: userId,
          approvedAt: new Date(),
          comment
        });
      } else {
        approval.denials.push({
          deniedBy: userId,
          deniedAt: new Date(),
          reason: comment
        });
      }
      
      // Check if approval is complete
      const requiredApprovals = approval.requiredApprovers || 1;
      const approvalsReceived = approval.approvals.length;
      const denials = approval.denials.length;
      
      if (denials > 0) {
        // Any denial means rejection
        approval.status = 'DENIED';
      } else if (approvalsReceived >= requiredApprovals) {
        // Enough approvals
        approval.status = 'APPROVED';
      }
      
      await execution.save();
      
      // Add audit event
      execution.addAuditEvent('APPROVAL_DECISION', {
        approvalId,
        decision,
        decidedBy: userId,
        status: approval.status
      });
      
      return approval;
      
    } catch (error) {
      console.error('Error processing approval decision:', error);
      throw error;
    }
  }

  /**
   * Check auto-approval conditions
   */
  checkAutoApproval(gate, policy, incident, execution) {
    if (!policy.autoApprovalConditions || policy.autoApprovalConditions.length === 0) {
      return false;
    }
    
    for (const autoApprovalCond of policy.autoApprovalConditions) {
      try {
        // Evaluate condition
        const func = new Function('incident', 'execution', `return ${autoApprovalCond.condition}`);
        const result = func(incident, execution);
        
        if (result && autoApprovalCond.autoApprove) {
          return true;
        }
      } catch (error) {
        console.warn(`Auto-approval condition evaluation failed: ${error.message}`);
      }
    }
    
    return false;
  }

  /**
   * Evaluate gate conditions
   */
  evaluateConditions(conditions, incident, execution) {
    try {
      // Simple condition evaluation
      if (!conditions) return true;
      
      // Can be expanded for complex condition logic
      return true;
      
    } catch (error) {
      console.warn('Condition evaluation failed:', error);
      return false;
    }
  }

  /**
   * Find applicable policies for playbook
   */
  async findApplicablePolicies(playbook, incident, execution) {
    const policies = await PlaybookApprovalPolicy.find({
      enabled: true
    }).sort({ priority: -1 });
    
    return policies.filter(policy => {
      return policy.appliesToPlaybook(playbook._id) ||
             policy.appliesToRiskLevel(incident.severity) ||
             policy.scope === 'ALL_PLAYBOOKS';
    });
  }

  /**
   * Get approvers from gate
   */
  async getApproversForGate(gate) {
    const approvers = [];
    
    for (const approvalRole of gate.approvalRoles || []) {
      let users;
      
      if (approvalRole.userIds && approvalRole.userIds.length > 0) {
        users = await User.find({ _id: { $in: approvalRole.userIds }, active: true });
      } else {
        users = await User.find({ role: approvalRole.role, active: true });
      }
      
      approvers.push(...users);
    }
    
    return [...new Set(approvers.map(a => a._id))].slice(0, 5)
      .map(id => approvers.find(a => a._id === id));
  }

  /**
   * Get approvers for action
   */
  async getApproversForAction(action) {
    const approvers = [];
    
    for (const role of action.approvalRoles || []) {
      const users = await User.find({ role, active: true });
      approvers.push(...users);
    }
    
    return [...new Set(approvers.map(a => a._id))].slice(0, 5)
      .map(id => approvers.find(a => a._id === id));
  }

  /**
   * Notify approvers
   */
  async notifyApprovers(approvers, gate, incident, execution, approval) {
    for (const approver of approvers) {
      try {
        await notificationService.notifySecurityAlert(approver._id, {
          title: 'Playbook Approval Required',
          message: `Policy gate "${gate.gateName}" requires your approval for incident response`,
          approvalId: approval.approvalId,
          severity: incident.severity,
          expiresAt: approval.expiresAt,
          link: `/incidents/approvals/${approval.approvalId}`
        });
        
        if (approver.email && gate.notificationChannels?.includes('EMAIL')) {
          await emailService.sendSecurityAlert(approver.email, {
            subject: `Approval Required: ${gate.gateName}`,
            template: 'approval_request',
            data: {
              gateName: gate.gateName,
              incidentType: incident.incidentType,
              severity: incident.severity,
              approvalLink: `/incidents/approvals/${approval.approvalId}`,
              expiresAt: approval.expiresAt
            }
          });
        }
      } catch (error) {
        console.error(`Failed to notify approver ${approver._id}:`, error);
      }
    }
  }

  /**
   * Setup escalation for approval timeout
   */
  async setupEscalation(gate, approval, incident, execution) {
    if (!gate.escalationPath || gate.escalationPath.length === 0) {
      return;
    }
    
    // Schedule escalation checks
    for (const escalation of gate.escalationPath) {
      setTimeout(async () => {
        try {
          // Check if approval still pending
          const exec = await PlaybookExecution.findById(execution._id);
          const pendingApproval = exec?.approvals?.find(a => a.approvalId === approval.approvalId);
          
          if (pendingApproval && pendingApproval.status === 'PENDING') {
            // Escalate to next level
            const escalateToUser = await User.findById(escalation.escalateTo);
            if (escalateToUser) {
              await notificationService.notifySecurityAlert(escalateToUser._id, {
                title: 'Escalated Approval Required',
                message: 'Previous approval request has timed out. Immediate action required.',
                approvalId: approval.approvalId,
                severity: 'CRITICAL'
              });
            }
          }
        } catch (error) {
          console.error('Escalation error:', error);
        }
      }, escalation.delayMs);
    }
  }
}

module.exports = PlaybookApprovalGateService;
