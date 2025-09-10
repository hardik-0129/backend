const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const userController = require('../controllers/userController');
const leaderboardController = require('../controllers/leaderboardController');
// Leaderboard API (weekly/monthly)
router.get('/leaderboard', leaderboardController.getLeaderboard);
const authentication = require('../middleware/adminAuth');

// Configure multer for profile photo uploads with memory storage for compression
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit (will be compressed to KB)
  },
  fileFilter: fileFilter
});

// Get user profile and stats (self or by userId)
router.get('/profile/:userId?', authentication, userController.getProfile);

// Get user referral history and statistics
router.get('/referral-stats', authentication, userController.getReferralStats);

// Update user profile (self or by userId) - supports form-data with optional profilePhoto
router.put('/profile', authentication, upload.single('profilePhoto'), userController.updateProfile);

// Reset password (profile section, by userId or self)
router.post('/reset-password/:userId?', authentication, userController.resetPassword);

// Save device token for push notifications
router.post('/device-token', authentication, userController.saveDeviceToken);

// Update profile photo (FormData with file upload)
router.post('/update-profile-photo', authentication, upload.single('profilePhoto'), userController.updateProfilePhoto);

module.exports = router;