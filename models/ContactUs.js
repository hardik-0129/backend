const mongoose = require('mongoose');

const contactUsSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  mobile: { type: String, required: true },
  gameName: { type: String },
  gameUsername: { type: String },
  gameUID: { type: String },
  queryType: { type: String },
  message: { type: String, required: true },
  userId: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ContactUs', contactUsSchema);
