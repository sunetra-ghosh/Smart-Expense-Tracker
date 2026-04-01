const mongoose = require('mongoose');

/**
 * Integrity Report Schema
 * Issue #850: Tamper-Evident Security Event Ledger
 * 
 * Stores results of forensic verification scans
 * Provides signed reports for compliance and incident response
 */

const integrityReportSchema = new mongoose.Schema({
  // Report identifier
  reportId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Report type
  reportType: {
    type: String,
    enum: ['FULL_CHAIN_VERIFICATION', 'RANGE_VERIFICATION', 'CHECKPOINT_VERIFICATION', 'RESTORE_VERIFICATION'],
    required: true
  },
  
  // Verification scope
  scope: {
    startSequence: {
      type: Number,
      required: true
    },
    endSequence: {
      type: Number,
      required: true
    },
    entryCount: Number,
    startTimestamp: Date,
    endTimestamp: Date
  },
  
  // Verification results
  results: {
    status: {
      type: String,
      enum: ['VALID', 'INVALID', 'PARTIAL', 'FAILED'],
      required: true
    },
    
    // Overall integrity
    isChainValid: {
      type: Boolean,
      required: true
    },
    
    // Detailed findings
    findings: [{
      severity: {
        type: String,
        enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL']
      },
      category: {
        type: String,
        enum: ['HASH_MISMATCH', 'SEQUENCE_GAP', 'TIMESTAMP_ANOMALY', 'CHECKPOINT_INVALID', 'SIGNATURE_INVALID', 'MISSING_ENTRY']
      },
      sequenceNumber: Number,
      description: String,
      detectedAt: Date
    }],
    
    // Verification statistics
    stats: {
      totalEntries: Number,
      validEntries: Number,
      invalidEntries: Number,
      missingEntries: Number,
      checkpointsVerified: Number,
      verificationDuration: Number // milliseconds
    }
  },
  
  // Hash chain integrity
  chainIntegrity: {
    consecutiveHashesValid: Boolean,
    firstInvalidSequence: Number,
    hashBreaks: [{
      sequenceNumber: Number,
      expectedHash: String,
      actualHash: String,
      timestamp: Date
    }]
  },
  
  // Checkpoint integrity
  checkpointIntegrity: {
    checkpointsValid: Boolean,
    invalidCheckpoints: [{
      checkpointNumber: Number,
      reason: String,
      expectedHash: String,
      actualHash: String
    }]
  },
  
  // Signature verification
  signatureVerification: {
    signaturesValid: Boolean,
    invalidSignatures: [{
      sequenceNumber: Number,
      reason: String
    }]
  },
  
  // Report metadata
  metadata: {
    generatedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    generatedBy: {
      userId: mongoose.Schema.Types.ObjectId,
      username: String,
      automated: {
        type: Boolean,
        default: false
      }
    },
    verificationAlgorithm: {
      type: String,
      default: 'SHA256'
    },
    executionTime: Number, // milliseconds
    reason: String, // 'scheduled', 'manual', 'incident', 'compliance', 'restore'
  },
  
  // Report signature (signed by verification service)
  reportSignature: {
    algorithm: {
      type: String,
      default: 'RSA-SHA256'
    },
    value: String,
    publicKeyFingerprint: String,
    signedAt: Date
  },
  
  // Compliance tags
  compliance: {
    isComplianceReport: {
      type: Boolean,
      default: false
    },
    frameworks: [String], // 'SOC2', 'ISO27001', 'GDPR', 'HIPAA'
    auditReference: String,
    expiresAt: Date
  },
  
  // Remediation actions (if integrity issues found)
  remediation: {
    required: {
      type: Boolean,
      default: false
    },
    actions: [{
      action: String,
      status: {
        type: String,
        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED']
      },
      assignedTo: String,
      completedAt: Date
    }],
    incidentId: String
  }
}, {
  timestamps: true,
  collection: 'integrity_reports'
});

// Indexes
integrityReportSchema.index({ reportId: 1 });
integrityReportSchema.index({ 'metadata.generatedAt': -1 });
integrityReportSchema.index({ reportType: 1, 'metadata.generatedAt': -1 });
integrityReportSchema.index({ 'results.status': 1 });
integrityReportSchema.index({ 'compliance.isComplianceReport': 1, 'metadata.generatedAt': -1 });
integrityReportSchema.index({ 'scope.startSequence': 1, 'scope.endSequence': 1 });

// Static methods
integrityReportSchema.statics.getLatestReport = async function(reportType = null) {
  const query = reportType ? { reportType } : {};
  return this.findOne(query).sort({ 'metadata.generatedAt': -1 }).exec();
};

integrityReportSchema.statics.getFailedReports = async function() {
  return this.find({
    'results.isChainValid': false
  }).sort({ 'metadata.generatedAt': -1 }).exec();
};

integrityReportSchema.statics.getComplianceReports = async function(startDate, endDate) {
  return this.find({
    'compliance.isComplianceReport': true,
    'metadata.generatedAt': { $gte: startDate, $lte: endDate }
  }).sort({ 'metadata.generatedAt': -1 }).exec();
};

const IntegrityReport = mongoose.model('IntegrityReport', integrityReportSchema);

module.exports = IntegrityReport;
