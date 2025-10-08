const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  content: { 
    type: String, 
    required: true 
  }, // HTML content
  type: { 
    type: String, 
    enum: ['html', 'text'], 
    default: 'html',
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true,
    index: true 
  },
  priority: { 
    type: Number, 
    default: 0,
    index: true 
  }, // Higher number = higher priority
  startDate: { 
    type: Date, 
    default: Date.now 
  },
  endDate: { 
    type: Date, 
    default: null 
  },
  targetAudience: { 
    type: String, 
    enum: ['all', 'logged_in', 'guests'], 
    default: 'all' 
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  }
}, { 
  timestamps: true 
});

// Index for efficient queries
announcementSchema.index({ isActive: 1, priority: -1, createdAt: -1 });
announcementSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
