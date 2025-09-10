const mongoose = require('mongoose');

const gameModeSchema = new mongoose.Schema({
  gameMode: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  image: {
    type: String,
    required: false,
    default: '/assets/images/category.png'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GameMode', gameModeSchema);
