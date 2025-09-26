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
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorType: { type: String, enum: ['none', 'email', 'totp'], default: 'none' },
  totpEnabled: { type: Boolean, default: false },
  totpSecret: { type: String, default: null },
  totpVerified: { type: Boolean, default: false },
  otp: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  otpVerified: { type: Boolean, default: false },
  deviceToken: { type: [String] , default: [] },
  profilePhoto: { type: String, default: null },
  alphaRole: {
    roleName: { type: String, default: null },
    nftCount: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    verificationDate: { type: Date, default: null },
    walletAddress: { type: String, default: null }
  }
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

// Static method to calculate alpha role based on NFT count
userSchema.statics.calculateAlphaRole = function (nftCount) {
  if (nftCount >= 25) {
    return {
      roleName: 'King of the Jungle',
      description: '25 NFTs or above',
      minNfts: 25
    };
  } else if (nftCount >= 10) {
    return {
      roleName: 'Pride Alpha',
      description: '10 NFTs or above',
      minNfts: 10
    };
  } else if (nftCount >= 5) {
    return {
      roleName: 'Mane Commander',
      description: '5 NFTs or above',
      minNfts: 5
    };
  } else if (nftCount >= 1) {
    return {
      roleName: 'Lone Cub',
      description: '1 NFT',
      minNfts: 1
    };
  } else {
    return {
      roleName: null,
      description: 'No NFTs',
      minNfts: 0
    };
  }
};

const User = mongoose.model('User', userSchema);
module.exports = User;

