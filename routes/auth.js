
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { validateImage } = require('../utils/imageCompression');
const User = require('../models/User');
const authController = require('../controllers/authController');
const sendOTP = require('../utils/sendOTP');
const userAuth = require('../middleware/adminAuth');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const authentication = require('../middleware/adminAuth');

// Helper function to create transaction (import from walletController)
const createTransaction = async (data) => {
  try {
    const Transaction = require('../models/Transaction');
    return await Transaction.create(data);
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
};

// Multer setup for form-data (optional profilePhoto upload)
const userUploadsDir = path.join(__dirname, '../uploads/users');
if (!fs.existsSync(userUploadsDir)) {
  fs.mkdirSync(userUploadsDir, { recursive: true });
}

// Use memory storage so we can compress before writing to disk
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Compression middleware to ensure <= 15KB on disk
const compressProfilePhoto = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({ status: false, message: validation.error });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // We'll save as JPEG to maximize compression compatibility
    const filename = `profile-${uniqueSuffix}.jpg`;
    const outputPath = path.join(userUploadsDir, filename);

    // Start with a reasonable size and quality; iterate until <= 15KB or min quality
    let width = 256; // small avatar size
    let quality = 80;
    let buffer = req.file.buffer;
    let out;
    for (let i = 0; i < 6; i++) {
      out = await sharp(buffer)
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, progressive: true, mozjpeg: true })
        .toBuffer();
      if (out.length <= 15 * 1024) break;
      // reduce further
      quality = Math.max(40, quality - 10);
      width = Math.max(128, Math.round(width * 0.85));
    }

    // Write compressed file to disk
    fs.writeFileSync(outputPath, out);

    // Update req.file to match compressed file
    req.file.filename = filename;
    req.file.path = outputPath;
    req.file.size = out.length;

    return next();
  } catch (error) {
    console.error('Profile photo compression error:', error);
    return res.status(500).json({ status: false, message: 'Image compression failed' });
  }
};

router.post('/register', upload.single('profilePhoto'), compressProfilePhoto, async (req, res) => {
  const { name, email, phone, password, freeFireUsername, referCode: inputReferCode, deviceToken } = req.body;
  const profilePhoto = req.file ? `/uploads/users/${req.file.filename}` : (req.body.profilePhoto || null);

  try {
    if (!name || !email || !phone || !password || !freeFireUsername || !deviceToken) {
      return res.status(400).json({ 
        status: false,
        message: 'All fields are required'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        message: 'Email already in use'
      });
    }

    // If refer code is provided, check if it exists in DB
    let referUser = null;
    if (inputReferCode) {
      referUser = await User.findOne({ referCode: inputReferCode });
      if (!referUser) {
        return res.status(400).json({
          status: false,
          message: 'Invalid referral code.'
        });
      }
    }

    // Generate unique refer code for new user
    const referCode = await User.generateReferCode();

    // If a referral code was used, store it in referredBy
    const user = new User({
      name,
      email,
      phone,
      password, // plain text – will be hashed in pre('save')
      freeFireUsername,
      referCode,
      referredBy: inputReferCode || null,
      deviceToken,
      profilePhoto
    });

    await user.save();

    // Give 5 rupees bonus to new user if they used a referral code
    if (inputReferCode && referUser) {
      user.wallet += 5;
      user.signupReferralBonusCredited = true;
      await user.save();

      // Increment referrer's referral count
      referUser.totalReferrals += 1;
      await referUser.save();

      // Create transaction for signup bonus
      await createTransaction({
        userId: user._id,
        type: 'CREDIT',
        amount: 5,
        description: `Signup bonus via referral code ${inputReferCode}`,
        transactionId: `REF_SIGNUP_${user._id}_${Date.now()}`,
        status: 'SUCCESS',
        paymentMethod: 'SYSTEM',
        balanceAfter: user.wallet,
        metadata: {
          referrerCode: inputReferCode,
          referrerId: referUser._id,
          bonusType: 'signup_referral'
        }
      });
    }

    res.status(201).json({
      status: true,
      message: 'User registered successfully',
      // userId: user._id,
      referCode: user.referCode,
      deviceToken: user.deviceToken
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      status: false,
      message: 'Server error occurred during registration. Please try again.' 
    });
  }
});

// ✅ Login Route
router.post('/login', async (req, res) => {
  const { email, password, deviceToken } = req.body;

  if (!email || !password)
    return res.status(400).json({ 
      status: false,
      message: 'Email and password are required' 
    });

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ 
        status: false,
        message: 'Invalid email' 
      });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ 
        status: false,
        message: 'Invalid password' 
      });

      if (deviceToken) {
        // only add if not already present
        if (!user.deviceToken.includes(deviceToken)) {
          user.deviceToken.push(deviceToken);
          await user.save();
        }
      }
    if (user.twoFactorEnabled && user.twoFactorType === 'email') {
      // Send OTP and ask client to verify
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 60 * 1000);
      user.otp = otp;
      user.otpExpires = expires;
      await user.save();
      await sendOTP(email, otp);
      return res.json({ status: true, message: 'OTP sent to email', otpRequired: true, method: 'email' });
    } else if (user.totpEnabled && user.twoFactorType === 'totp' && user.totpSecret) {
      // Challenge with TOTP
      return res.json({ status: true, otpRequired: true, method: 'totp' });
    } else {
      const token = jwt.sign({ userId: user._id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, {});
      return res.json({ status: true, message: 'Login successful', token });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      status: false,
      message: 'Server error occurred during login. Please try again.' 
    });
  }
});

// OTP Login: verify
router.post('/login/verify-otp', async (req, res) => {
  try {
    const { email, otp, deviceToken } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ status: false, message: 'Email and OTP are required' });
    }
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ status: false, message: 'User not found' });
    if (!user.otp || !user.otpExpires || user.otp !== otp || new Date() > new Date(user.otpExpires)) {
      return res.status(401).json({ status: false, message: 'Invalid or expired OTP' });
    }
    user.otp = null;
    user.otpExpires = null;
    if (deviceToken) {
      if (!user.deviceToken.includes(deviceToken)) {
        user.deviceToken.push(deviceToken);
      }
    }
    await user.save();
    const token = jwt.sign({ userId: user._id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, {});
    return res.json({ status: true, message: 'Login successful', token });
  } catch (e) {
    console.error('login/verify-otp error:', e);
    return res.status(500).json({ status: false, message: 'Failed to verify OTP' });
  }
});

// TOTP: init (generate secret + QR)
router.post('/2fa/totp/init', userAuth, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || String(userId) !== String(req.user.userId)) {
      return res.status(403).json({ status: false, message: 'Not authorized' });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: false, message: 'User not found' });

    const label = `${process.env.TOTP_ISSUER || 'GameZone'}:${user.email}`;
    const secret = speakeasy.generateSecret({ name: label, length: 20, issuer: process.env.TOTP_ISSUER || 'GameZone' });

    user.totpSecret = secret.base32;
    user.twoFactorType = 'totp';
    await user.save();

    const otpauthUrl = secret.otpauth_url;
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return res.json({ status: true, secretBase32: secret.base32, otpauthUrl, qrDataUrl });
  } catch (e) {
    console.error('totp init error:', e);
    return res.status(500).json({ status: false, message: 'Failed to init TOTP' });
  }
});

// TOTP: verify & activate
router.post('/2fa/totp/verify', userAuth, async (req, res) => {
  try {
    let { userId, token } = req.body;
    if (!userId || String(userId) !== String(req.user.userId)) {
      return res.status(403).json({ status: false, message: 'Not authorized' });
    }
    const user = await User.findById(userId);
    if (!user || !user.totpSecret) return res.status(400).json({ status: false, message: 'No TOTP setup found' });

    token = String(token || '').replace(/\s+/g, '');
    const verified = speakeasy.totp.verify({ secret: String(user.totpSecret), encoding: 'base32', token, window: 2, digits: 6 });
    if (!verified) return res.status(401).json({ status: false, message: 'Invalid token' });

    user.totpEnabled = true;
    user.twoFactorType = 'totp';
    // Ensure only one factor active at a time
    user.twoFactorEnabled = false;
    user.totpVerified = true;
    await user.save();
    return res.json({ status: true, message: 'TOTP enabled' });
  } catch (e) {
    console.error('totp verify error:', e);
    return res.status(500).json({ status: false, message: 'Failed to verify TOTP' });
  }
});

// TOTP: disable
router.put('/2fa/totp/disable', userAuth, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || String(userId) !== String(req.user.userId)) {
      return res.status(403).json({ status: false, message: 'Not authorized' });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: false, message: 'User not found' });
    user.totpEnabled = false; // keep secret so user can enable later without re-setup
    if (user.twoFactorType === 'totp') user.twoFactorType = 'none';
    await user.save();
    return res.json({ status: true, message: 'TOTP disabled' });
  } catch (e) {
    console.error('totp disable error:', e);
    return res.status(500).json({ status: false, message: 'Failed to disable TOTP' });
  }
});

// TOTP: enable (without re-setup, requires existing secret)
router.put('/2fa/totp/enable', userAuth, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || String(userId) !== String(req.user.userId)) {
      return res.status(403).json({ status: false, message: 'Not authorized' });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: false, message: 'User not found' });
    if (!user.totpSecret) return res.status(400).json({ status: false, message: 'No TOTP setup found. Please setup first.' });
    user.totpEnabled = true;
    user.twoFactorType = 'totp';
    user.twoFactorEnabled = false; // disable email OTP when enabling totp
    await user.save();
    return res.json({ status: true, message: 'TOTP enabled' });
  } catch (e) {
    console.error('totp enable error:', e);
    return res.status(500).json({ status: false, message: 'Failed to enable TOTP' });
  }
});

// Login: verify TOTP and issue token
router.post('/login/totp-verify', async (req, res) => {
  try {
    let { email, token, deviceToken } = req.body;
    if (!email || !token) return res.status(400).json({ status: false, message: 'Email and token required' });
    const user = await User.findOne({ email });
    if (!user || !user.totpEnabled || !user.totpSecret) return res.status(200).json({ status: false, message: 'TOTP not enabled' });
    token = String(token || '').replace(/\s+/g, '');
    const ok = speakeasy.totp.verify({ secret: String(user.totpSecret), encoding: 'base32', token, window: 2, digits: 6 });
    if (!ok) return res.status(200).json({ status: false, message: 'Invalid token' });
    if (deviceToken && !user.deviceToken.includes(deviceToken)) {
      user.deviceToken.push(deviceToken);
      await user.save();
    }
    const jwtToken = jwt.sign({ userId: user._id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, {});
    return res.json({ status: true, message: 'Login successful', token: jwtToken });
  } catch (e) {
    console.error('login totp verify error:', e);
    return res.status(200).json({ status: false, message: 'Failed to verify TOTP' });
  }
});

// Toggle two-factor auth for current user (profile)
router.put('/twofactor', userAuth, async (req, res) => {
  try {
    const { enabled, userId } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ status: false, message: 'enabled must be boolean' });
    }
    // Ensure the caller is updating their own setting
    if (!userId || String(userId) !== String(req.user.userId)) {
      return res.status(403).json({ status: false, message: 'Not authorized to update this user' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ status: false, message: 'User not found' });
    user.twoFactorEnabled = enabled;
    if (enabled) {
      // Enabling email OTP disables TOTP
      user.twoFactorType = 'email';
      user.totpEnabled = false;
    } else {
      // If TOTP not enabled, fall back to none
      if (!user.totpEnabled) user.twoFactorType = 'none';
    }
    await user.save();
    return res.json({ status: true, message: `Two-factor ${enabled ? 'enabled' : 'disabled'}`, twoFactorEnabled: user.twoFactorEnabled });
  } catch (e) {
    console.error('toggle twofactor error:', e);
    return res.status(500).json({ status: false, message: 'Failed to update two-factor setting' });
  }
});

router.get('/users', authentication, authentication.authorizationRole('admin'), authController.getAllUsers);

router.get('/user', authentication, authController.getUserByQuery);

router.post('/forgot-password', authController.forgotPasswordRequest);
router.post('/reset-password-otp', authController.forgotPasswordReset);
router.post('/verify', authController.verifyOTP);

module.exports = router;
