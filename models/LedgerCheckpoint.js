const mongoose = require('mongoose');

/**
 * Ledger Checkpoint Schema
 * Issue #850: Tamper-Evident Security Event Ledger
 * 
 * Periodic anchors for efficient integrity verification
 * Contains aggregated hash of ledger segments
 */

const ledgerCheckpointSchema = new mongoose.Schema({
  // Checkpoint identifier
  checkpointNumber: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  
  // Timestamp of checkpoint creation
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true
  },
  
  // Range covered by this checkpoint
  range: {
    startSequence: {
      type: Number,
      required: true,
      immutable: true
    },
    endSequence: {
      type: Number,
      required: true,
      immutable: true
    },
    entryCount: {
      type: Number,
      required: true
    }
  },
  
  // Merkle tree root for the range
  merkleRoot: {
    type: String,
    required: true,
    immutable: true
  },
  
  // Aggregated hash: SHA-256(all entry hashes in range)
  aggregatedHash: {
    type: String,
    required: true,
    immutable: true
  },
  
  // First and last entry hashes (for quick verification)
  boundaryHashes: {
    firstEntryHash: {
      type: String,
      required: true
    },
    lastEntryHash: {
      type: String,
      required: true
    }
  },
  
  // Link to previous checkpoint
  previousCheckpointId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LedgerCheckpoint'
  },
  
  previousCheckpointHash: {
    type: String
  },
  
  // Checkpoint signature (signed by server)
  signature: {
    algorithm: {
      type: String,
      default: 'RSA-SHA256'
    },
    value: {
      type: String,
      required: true
    },
    publicKeyFingerprint: String
  },
  
  // External anchoring (optional: blockchain, timestamp service)
  externalAnchor: {
    enabled: {
      type: Boolean,
      default: false
    },
    service: String, // 'blockchain', 'timestamp-authority'
    transactionId: String,
    blockHeight: Number,
    timestampToken: String,
    anchoredAt: Date
  },
  
  // Verification status
  verificationStatus: {
    lastVerified: Date,
    isValid: {
      type: Boolean,
      default: true
    },
    verificationCount: {
      type: Number,
      default: 0
    }
  },
  
  // Rotation period
  rotationPeriod: {
    type: String,
    default: 'current'
  },
  
  // Metadata
  metadata: {
    createdBy: String,
    reason: String, // 'scheduled', 'manual', 'rotation', 'compliance'
    notes: String
  }
}, {
  timestamps: true,
  collection: 'ledger_checkpoints'
});

// Indexes
ledgerCheckpointSchema.index({ checkpointNumber: 1 });
ledgerCheckpointSchema.index({ timestamp: -1 });
ledgerCheckpointSchema.index({ 'range.startSequence': 1, 'range.endSequence': 1 });
ledgerCheckpointSchema.index({ rotationPeriod: 1, checkpointNumber: 1 });

// Prevent updates to immutable fields
ledgerCheckpointSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.$set) {
    const immutableFields = ['checkpointNumber', 'timestamp', 'range', 'merkleRoot', 'aggregatedHash'];
    for (const field of immutableFields) {
      if (update.$set[field] !== undefined) {
        return next(new Error(`Cannot update immutable field: ${field}`));
      }
    }
  }
  next();
});

// Static methods
ledgerCheckpointSchema.statics.getLatestCheckpoint = async function() {
  return this.findOne().sort({ checkpointNumber: -1 }).exec();
};

ledgerCheckpointSchema.statics.getCheckpointForSequence = async function(sequenceNumber) {
  return this.findOne({
    'range.startSequence': { $lte: sequenceNumber },
    'range.endSequence': { $gte: sequenceNumber }
  }).exec();
};

ledgerCheckpointSchema.statics.getNextCheckpointNumber = async function() {
  const latest = await this.getLatestCheckpoint();
  return latest ? latest.checkpointNumber + 1 : 1;
};

const LedgerCheckpoint = mongoose.model('LedgerCheckpoint', ledgerCheckpointSchema);

module.exports = LedgerCheckpoint;
