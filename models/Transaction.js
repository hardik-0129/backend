const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['CREDIT', 'DEBIT', 'WIN', 'LOSS', 'REFUND', 'WITHDRAW', 'DEPOSIT'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  transactionId: {
    type: String,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'PENDING_ADMIN_APPROVAL', 'ADMIN_APPROVED', 'ADMIN_REJECTED'],
    default: 'SUCCESS'
  },
  adminApproval: {
    required: {
      type: Boolean,
      default: false
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    approvedAt: Date,
    rejectionReason: String,
    rejectedAt: Date
  },
  paymentMethod: {
    type: String,
    enum: ['RAZORPAY', 'TRANZUPI', 'WALLET', 'SYSTEM'],
    default: 'SYSTEM'
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  metadata: {
    upiId: String,
    orderId: String,
    gameId: String,
    slotId: String,
    referenceId: String
  }
}, {
  timestamps: true
});

// Index for better query performance
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ type: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
