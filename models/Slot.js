// models/Slot.js
const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  // Basic slot information
  slotType: {
    type: String,
    required: true
  },
  matchIndex: {
    type: Number,
    unique: true,
    sparse: true // Allow null values but enforce uniqueness when value exists
  },
  entryFee: {
    type: Number,
    required: true
  },
  matchTime: {
    type: Date,
    required: true
  },
  maxBookings: {
    type: Number,
    required: true
  },
  remainingBookings: {
    type: Number,
    required: true
  },
  customStartInMinutes: {
    type: Number,
    required: true
  },
  perKill: {
    type: Number,
    required: true
  },
  totalWinningPrice: {
    type: Number,
    required: true
  },
  firstwin: {
    type: Number,
    default: 0
  },
  secwin: {
    type: Number,
    default: 0
  },
  thirdwin: {
    type: Number,
    default: 0
  },
  
  matchTitle: {
    type: String,
    default: ''
  },
  matchDescription: {
    type: String,
    default: ''
  },
  mapName: {
    type: String,
    enum: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine'],
    default: 'Bermuda'
  },
  gameMode: {
    type: String,
    required: true
  },
  tournamentName: {
    type: String,
    default: '#ALPHALIONS'
  },
  maxPlayers: {
    type: Number,
    default: 0
  },
  registrationDeadline: {
    type: Date,
    default: Date.now
  },
  rules: {
    type: String,
    default: 'Standard Free Fire rules apply'
  },
  prizeDistribution: {
    type: String,
    default: 'Winner takes all'
  },
  contactInfo: {
    type: String,
    default: ''
  },
  streamLink: {
    type: String,
    default: ''
  },
  discordLink: {
    type: String,
    default: ''
  },
  specialRules: {
    type: String,
    default: ''
  },
  banList: {
    type: String,
    default: ''
  },
  bannerImage: {
    type: String,
    default: ''
  },
  
  // Detailed Tournament Rules (from image)
  tournamentRules: {
    // Basic Requirements
    minimumLevel: {
      type: Number,
      default: 40
    },
    onlyMobileAllowed: {
      type: Boolean,
      default: true
    },
    maxHeadshotRate: {
      type: Number,
      default: 70
    },
    
    // Prohibited Activities
    prohibitedActivities: [{
      type: String
    }],
    
    // Room Settings
    characterSkill: {
      type: String,
      enum: ['Yes', 'No'],
      default: 'Yes'
    },
    gunAttributes: {
      type: String,
      enum: ['Yes', 'No'],
      default: 'Yes'
    },
    airdropType: {
      type: String,
      enum: ['Yes', 'No'],
      default: 'Yes'
    },
    limitedAmmo: {
      type: String,
      enum: ['Yes', 'No'],
      default: 'Yes'
    },
    
    // Match Room Details
    roomIdPasswordTime: {
      type: Number,
      default: 15 // minutes before match
    },
    
    // Joining Instructions
    accountNameVerification: {
      type: Boolean,
      default: true
    },
    teamRegistrationRules: {
      type: String,
      default: 'If team members accidentally register in different teams, they will still play together'
    },
    
    // Gameplay Requirements
    mustRecordGameplay: {
      type: Boolean,
      default: true
    },
    screenRecordingRequired: {
      type: Boolean,
      default: true
    },
    recordFromJoining: {
      type: Boolean,
      default: true
    },
    
    // Penalties
    penaltySystem: {
      violatingRules: {
        type: String,
        default: 'Penalties'
      },
      noRewards: {
        type: Boolean,
        default: true
      },
      permanentBan: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // Match status
  status: {
    type: String,
    enum: ['upcoming', 'live', 'completed', 'cancelled'],
    default: 'upcoming'
  }
}, {
  timestamps: true
});

// Pre-save middleware to auto-increment matchIndex
slotSchema.pre('save', async function(next) {
  if (this.isNew && !this.matchIndex) {
    try {
      // Find the highest matchIndex and increment by 1
      const lastSlot = await mongoose.model('Slot').findOne({}).sort({ matchIndex: -1 }).exec();
      this.matchIndex = lastSlot && lastSlot.matchIndex ? lastSlot.matchIndex + 1 : 1;
      console.log('Auto-assigned matchIndex:', this.matchIndex);
    } catch (error) {
      console.error('Error auto-incrementing matchIndex:', error);
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('Slot', slotSchema);
