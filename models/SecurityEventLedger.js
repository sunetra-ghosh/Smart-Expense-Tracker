const mongoose = require('mongoose');

/**
 * Security Event Ledger Schema
 * Issue #850: Tamper-Evident Security Event Ledger
 * 
 * Append-only ledger with cryptographic hash chaining
 * Records high-value security actions with tamper detection
 */

const securityEventLedgerSchema = new mongoose.Schema({
  // Sequence number (monotonically increasing)
  sequenceNumber: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  
  // Event metadata
  eventType: {
    type: String,
    required: true,
    enum: [
      '2FA_ENABLED',
      '2FA_DISABLED',
      '2FA_METHOD_ADDED',
      '2FA_METHOD_REMOVED',
      'PASSWORD_RESET',
      'PASSWORD_CHANGED',
      'TOKEN_REVOKED',
      'TOKEN_GENERATED',
      'DEVICE_TRUSTED',
      'DEVICE_UNTRUSTED',
      'SESSION_FORCE_LOGOUT',
      'SESSION_REVOKED',
      'ACCOUNT_LOCKED',
      'ACCOUNT_UNLOCKED',
      'SECURITY_SETTINGS_CHANGED',
      'ROLE_CHANGED',
      'PERMISSION_GRANTED',
      'PERMISSION_REVOKED'
    ],
    index: true
  },
  
  // Event timestamp (immutable)
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
    index: true
  },
  
  // Actor information
  actor: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true
    },
    ipAddress: {
      type: String,
      required: true
    },
    userAgent: String,
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session'
    }
  },
  
  // Target information (who/what was affected)
  target: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String,
    resourceType: String, // 'USER', 'DEVICE', 'TOKEN', 'SESSION'
    resourceId: String
  },
  
  // Event payload (immutable data)
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Cryptographic hash chain
  crypto: {
    // Current entry hash: SHA-256(sequenceNumber + timestamp + eventType + payload + previousHash)
    currentHash: {
      type: String,
      required: true,
      immutable: true,
      index: true
    },
    
    // Previous entry hash (for chain verification)
    previousHash: {
      type: String,
      required: true,
      immutable: true
    },
    
    // Signature of current hash (optional: signed with server private key)
    signature: {
      type: String,
      immutable: true
    },
    
    // Algorithm used
    algorithm: {
      type: String,
      default: 'SHA256',
      immutable: true
    }
  },
  
  // Checkpoint reference (for faster verification)
  checkpointId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LedgerCheckpoint',
    index: true
  },
  
  // Ledger rotation/archival
  rotationPeriod: {
    type: String,
    default: 'current' // 'current', 'archived-2024-Q1', etc.
  },
  
  // Metadata
  metadata: {
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM'
    },
    isComplianceRelevant: {
      type: Boolean,
      default: true
    },
    retentionYears: {
      type: Number,
      default: 7 // Compliance requirement
    },
    tags: [String]
  },
  
  // Write protection
  isImmutable: {
    type: Boolean,
    default: true,
    immutable: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }, // No updates allowed
  collection: 'security_event_ledger'
});

// Indexes for efficient queries
securityEventLedgerSchema.index({ sequenceNumber: 1 });
securityEventLedgerSchema.index({ 'crypto.currentHash': 1 });
securityEventLedgerSchema.index({ timestamp: -1 });
securityEventLedgerSchema.index({ eventType: 1, timestamp: -1 });
securityEventLedgerSchema.index({ 'actor.userId': 1, timestamp: -1 });
securityEventLedgerSchema.index({ 'target.userId': 1, timestamp: -1 });
securityEventLedgerSchema.index({ checkpointId: 1 });
securityEventLedgerSchema.index({ rotationPeriod: 1, sequenceNumber: 1 });

// Prevent updates and deletes
securityEventLedgerSchema.pre('findOneAndUpdate', function(next) {
  next(new Error('Security Event Ledger is append-only. Updates are not allowed.'));
});

securityEventLedgerSchema.pre('updateOne', function(next) {
  next(new Error('Security Event Ledger is append-only. Updates are not allowed.'));
});

securityEventLedgerSchema.pre('findOneAndDelete', function(next) {
  next(new Error('Security Event Ledger entries cannot be deleted. Use archival instead.'));
});

securityEventLedgerSchema.pre('deleteOne', function(next) {
  next(new Error('Security Event Ledger entries cannot be deleted. Use archival instead.'));
});

// Static method to get the latest entry
securityEventLedgerSchema.statics.getLatestEntry = async function() {
  return this.findOne().sort({ sequenceNumber: -1 }).exec();
};

// Static method to get entry by sequence number
securityEventLedgerSchema.statics.getBySequenceNumber = async function(seqNum) {
  return this.findOne({ sequenceNumber: seqNum }).exec();
};

// Static method to get entries in range
securityEventLedgerSchema.statics.getRange = async function(startSeq, endSeq) {
  return this.find({
    sequenceNumber: { $gte: startSeq, $lte: endSeq }
  }).sort({ sequenceNumber: 1 }).exec();
};

// Static method to get next sequence number
securityEventLedgerSchema.statics.getNextSequenceNumber = async function() {
  const latest = await this.getLatestEntry();
  return latest ? latest.sequenceNumber + 1 : 1;
};

const SecurityEventLedger = mongoose.model('SecurityEventLedger', securityEventLedgerSchema);

module.exports = SecurityEventLedger;
