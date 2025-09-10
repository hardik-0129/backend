const mongoose = require('mongoose');

const slotCredentialsSchema = new mongoose.Schema({
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
  id: { type: String, required: true },
  password: { type: String, required: true },
  sentAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SlotCredentials', slotCredentialsSchema);
