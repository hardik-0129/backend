const mongoose = require('mongoose');

const gameTypeSchema = new mongoose.Schema({
  gameType: {
    type: String,
    required: true,
    trim: true
  },
  image: {
    type: String,
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GameType', gameTypeSchema);
