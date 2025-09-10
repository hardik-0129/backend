const mongoose = require('mongoose');

const WinnerSchema = new mongoose.Schema({
  playerName: { type: String, required: true },
  gameName: { type: String, required: true },
  rank: { type: Number, required: true },
  winningPrice: { type: Number, required: true },
  kills: { type: Number, required: true },
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Winner', WinnerSchema);
