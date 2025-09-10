
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

    console.log('Profile photo compressed:', {
      originalBytes: req.file.buffer ? req.file.buffer.length : 'unknown',
      finalBytes: out.length,
      finalKB: Math.round(out.length / 1024),
      savedKB: req.file.buffer ? Math.max(0, Math.round((req.file.buffer.length - out.length) / 1024)) : 'n/a'
    });

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
  console.log(req.body);
  console.log('Login attempt:', email, deviceToken);

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
      user.deviceToken = deviceToken;
      await user.save();
    }
    const token = jwt.sign({ userId: user._id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    });

    res.json({
      status: true,
      message: 'Login successful',
      token,

    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      status: false,
      message: 'Server error occurred during login. Please try again.' 
    });
  }
});

router.get('/users', authentication, authentication.authorizationRole('admin'), authController.getAllUsers);

router.get('/user', authentication, authController.getUserByQuery);

router.post('/forgot-password', authController.forgotPasswordRequest);
router.post('/reset-password-otp', authController.forgotPasswordReset);
router.post('/verify', authController.verifyOTP);

module.exports = router;
