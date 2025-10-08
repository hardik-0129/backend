const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['announcement', 'match'], required: true },
  isRead: { type: Boolean, default: false, index: true },
  metadata: {
    id: { type: String, default: null },
    roomId: { type: String, default: null },
    matchId: { type: String, default: null },
    matchTitle: { type: String, default: null },
    matchIndex: { type: String, default: null },
    matchDate: { type: Date, default: null },
    matchTime: { type: String, default: null },
    matchPassword: { type: String, default: null },
    slotNumber: { type: String, default: null },
    message: { type: String, default: null }
  }
}, { timestamps: true });

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);


