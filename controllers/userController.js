
const User = require('../models/User');
const Booking = require('../models/Booking');
const Winner = require('../models/Winner');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { validateImage } = require('../utils/imageCompression');
const { getFullImageUrl } = require('../utils/imageUrl');

// GET /api/user/profile or /api/user/profile/:userId
exports.getProfile = async (req, res) => {
  try {
  const userId = req.query.userId || req.params.userId || req.user?.userId || req.user?._id;
  const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Total matches played
    const totalMatches = await Booking.countDocuments({ user: userId });
    // Total win money
    const totalWinMoney = await Winner.aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: null, total: { $sum: '$winningPrice' } } }
    ]);
    // Total kills
    const totalKillsAgg = await Winner.aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: null, total: { $sum: '$kills' } } }
    ]);
    const totalKill = totalKillsAgg[0]?.total || 0;

    res.json({
      user: {
        ...user.toObject(),
        profilePhoto: getFullImageUrl(user.profilePhoto),
        referCode: user.referCode // ensure referCode is always present
      },
      totalMatches,
      totalBalance: user.wallet,
      totalWinMoney: totalWinMoney[0]?.total || 0,
      totalKill,
      referralStats: {
        totalReferralEarnings: user.totalReferralEarnings || 0,
        totalReferrals: user.totalReferrals || 0,
        referredBy: user.referredBy || null
      }
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// PUT /api/user/profile or /api/user/profile/:userId
exports.updateProfile = async (req, res) => {
  try {
    // Support both JSON and multipart/form-data (profile image optional)
    const { userId, name, email, phone, freeFireUsername } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: false, error: 'User not found' });

    let updatedFields = {};
    if (name) { user.name = name; updatedFields.name = name; }
    // if (email) { user.email = email; updatedFields.email = email; }
    if (phone) { user.phone = phone; updatedFields.phone = phone; }
    if (freeFireUsername) { user.freeFireUsername = freeFireUsername; updatedFields.freeFireUsername = freeFireUsername; }
    // If file uploaded via multipart, compress and save; else allow profilePhoto path from body
    if (req.file) {
      // Validate
      const validation = validateImage(req.file);
      if (!validation.valid) {
        return res.status(400).json({ status: false, msg: validation.error });
      }
      // Ensure folder exists
      const uploadsDir = path.join(__dirname, '../uploads/profile-photos');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      // Generate filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = `profile-${userId}-${uniqueSuffix}.jpg`;
      const outputPath = path.join(uploadsDir, filename);
      // Compress (target small size but decent quality)
      const buffer = await sharp(req.file.buffer)
        .resize(400, 400, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 80, progressive: true, mozjpeg: true })
        .toBuffer();
      fs.writeFileSync(outputPath, buffer);
      user.profilePhoto = `/uploads/profile-photos/${filename}`;
      updatedFields.profilePhoto = user.profilePhoto;
    } else if (req.body.profilePhoto) {
      user.profilePhoto = req.body.profilePhoto;
      updatedFields.profilePhoto = req.body.profilePhoto;
    }
    
    await user.save();
    if (Object.keys(updatedFields).length > 0) {
      // Build user object with only updated fields and required meta fields
      const userObj = {
        _id: user._id,
        ...updatedFields,
        // Always return full URL for profile photo in response
        profilePhoto: getFullImageUrl(user.profilePhoto),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        __v: user.__v
      };
      res.json({ status: true, msg: 'Profile updated', user: userObj });
    } else {
      res.json({ status: false });
    }
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
};

// POST /api/user/reset-password or /api/user/reset-password/:userId
exports.resetPassword = async (req, res) => {
  try {
    const userId = req.params.userId || req.user?.userId || req.user?._id;
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ msg: 'Old password and new password are required.' });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    // Compare old password
    const bcrypt = require('bcryptjs');
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(200).json({ msg: 'Old password is incorrect.' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ msg: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// POST /api/user/device-token
exports.saveDeviceToken = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const { deviceToken } = req.body;
    if (!deviceToken) {
      return res.status(400).json({ status: false, msg: 'Device token is required' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, msg: 'User not found' });
    }
    user.deviceToken = deviceToken;
    await user.save();
    res.json({ status: true, msg: 'Device token saved successfully' });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Server error', error: err.message });
  }
};

// GET /api/user/referral-stats
exports.getReferralStats = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ status: false, msg: 'User not found' });
    }

    // Get referral transactions
    const Transaction = require('../models/Transaction');
    const referralTransactions = await Transaction.find({
      userId: userId,
      'metadata.bonusType': { $in: ['signup_referral', 'first_paid_match_referral'] }
    }).sort({ createdAt: -1 }).limit(20);

    // Get referred users list
    const referredUsers = await User.find({ referredBy: user.referCode })
      .select('name email freeFireUsername createdAt')
      .sort({ createdAt: -1 });

    res.json({
      status: true,
      referralStats: {
        referCode: user.referCode,
        totalReferralEarnings: user.totalReferralEarnings || 0,
        totalReferrals: user.totalReferrals || 0,
        referredBy: user.referredBy || null
      },
      referralTransactions: referralTransactions,
      referredUsers: referredUsers
    });
  } catch (err) {
    console.error('Error getting referral stats:', err);
    res.status(500).json({ status: false, msg: 'Server error', error: err.message });
  }
};

// POST /api/user/update-profile-photo (FormData with file upload)
exports.updateProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    
    console.log('Profile photo upload request received');
    console.log('User ID:', userId);
    console.log('File received:', req.file);
    
    if (!req.file) {
      console.log('No file received in request');
      return res.status(400).json({
        status: false,
        message: 'No profile photo uploaded'
      });
    }

    // Validate the image
    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        status: false,
        message: validation.error
      });
    }
    
    // Get user to check for old photo
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'User not found'
      });
    }
    
    // Delete old profile photo if it exists and is not the default
    if (user.profilePhoto && user.profilePhoto !== '/assets/vector/profile-user.png') {
      const oldFilePath = path.join(process.cwd(), user.profilePhoto);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalExt = path.extname(req.file.originalname);
    const filename = `profile-${userId}-${uniqueSuffix}.jpg`; // Always save as JPG for compression
    const outputPath = path.join(__dirname, '../uploads/profile-photos', filename);

    // Compress the profile photo
    const compressionResult = await sharp(req.file.buffer)
      .resize(400, 400, {
        fit: 'cover', // Crop to square for profile photos
        position: 'center'
      })
      .jpeg({
        quality: 85,
        progressive: true,
        mozjpeg: true
      })
      .toFile(outputPath);

    if (!compressionResult) {
      return res.status(500).json({
        status: false,
        message: 'Failed to compress profile photo'
      });
    }

    // Get file info for logging
    const stats = fs.statSync(outputPath);
    const fileSizeKB = Math.round(stats.size / 1024);
    const fileSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
    const originalSizeKB = Math.round(req.file.size / 1024);
    const originalSizeMB = Math.round((req.file.size / (1024 * 1024)) * 100) / 100;
    const compressionRatio = Math.round(((originalSizeKB - fileSizeKB) / originalSizeKB) * 100);

    // Log compression details
    console.log('=== PROFILE PHOTO COMPRESSION ===');
    console.log(`User ID: ${userId}`);
    console.log(`Original File: ${req.file.originalname}`);
    console.log(`Original Size: ${originalSizeKB} KB (${originalSizeMB} MB)`);
    console.log(`Compressed Size: ${fileSizeKB} KB (${fileSizeMB} MB)`);
    console.log(`Compression Ratio: ${compressionRatio}% reduction`);
    console.log(`Space Saved: ${originalSizeKB - fileSizeKB} KB (${Math.round(((originalSizeMB - fileSizeMB) * 100)) / 100} MB)`);
    console.log('================================');
    
    // Update user profile photo in database
    user.profilePhoto = `/uploads/profile-photos/${filename}`;
    await user.save();
    
    console.log('Profile photo updated successfully:', user.profilePhoto);
    
    return res.json({
      status: true,
      message: 'Profile photo updated and compressed successfully',
      profilePhoto: getFullImageUrl(user.profilePhoto)
    });
    
  } catch (error) {
    console.error('Error updating profile photo:', error);
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};