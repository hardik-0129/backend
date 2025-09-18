const mongoose = require('mongoose');

const gameMapSchema = new mongoose.Schema({
  gameMap: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GameMap', gameMapSchema);


