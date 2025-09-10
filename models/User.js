const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  freeFireUsername: { type: String, required: true },
  wallet: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isAdmin: { type: Boolean, default: false },
  referCode: { type: String, unique: true, sparse: true },
  referredBy: { type: String, default: null },
  signupReferralBonusCredited: { type: Boolean, default: false },
  referralFirstPaidCredited: { type: Boolean, default: false },
  totalReferralEarnings: { type: Number, default: 0 },
  totalReferrals: { type: Number, default: 0 },
  otp: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  otpVerified: { type: Boolean, default: false },
  deviceToken: { type: String, default: null },
  profilePhoto: { type: String, default: null }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});


// Static method to generate unique refer code: Alpha + 4-digit
userSchema.statics.generateReferCode = async function () {
  const prefix = 'Alpha';
  let code;
  let exists = true;
  while (exists) {
    code = prefix + Math.floor(1000 + Math.random() * 9000);
    exists = await this.exists({ referCode: code });
  }
  return code;
};

const User = mongoose.model('User', userSchema);
module.exports = User;

