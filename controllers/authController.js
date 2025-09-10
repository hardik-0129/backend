const User = require('../models/User');
const sendOTP = require('../utils/sendOTP');
const { getFullImageUrl } = require('../utils/imageUrl');

// Forgot Password: Request OTP
// Also used for registration verification
exports.forgotPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ status: false, msg: 'Email is required.' });
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ status: false, msg: 'User not found.' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await user.save();
    await sendOTP(email, otp);
    res.json({ status: true, msg: 'OTP sent to your email.' });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Server error', error: err.message });
  }
};

// Forgot Password: Reset with OTP (only if OTP is verified)
exports.forgotPasswordReset = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ status: false, msg: 'All fields are required.' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ status: false, msg: 'User not found.' });
    if (!user.otpVerified) {
      return res.status(400).json({ status: false, msg: 'OTP not verified.' });
    }
    user.password = newPassword;
    user.otp = null;
    user.otpExpires = null;
    user.otpVerified = false;
    await user.save();
    res.json({ status: true, msg: 'Password reset successful.' });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Server error', error: err.message });
  }
};

// General OTP verification (for both registration and forgot password)
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ status: false, msg: 'User not found' });
    if (!user.otp || user.otp !== otp || !user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ status: false, msg: 'Invalid or expired OTP' });
    }
    // If user is not verified (registration), mark as verified
    if (user.isVerified === false) {
      user.isVerified = true;
    }
    // For forgot password, set otpVerified flag
    user.otpVerified = true;
    await user.save();
    res.json({ status: true, msg: 'OTP verified successfully.' });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Server error', error: err.message });
  }
};


// General OTP verification (for both registration and forgot password)
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ status: false, msg: 'User not found' });
    if (!user.otp || user.otp !== otp || !user.otpExpires || user.otpExpires < new Date()) {
      return res.status(200).json({ status: false, msg: 'Invalid or expired OTP' });
    }
    // If user is not verified (registration), mark as verified
    if (user.isVerified === false) {
      user.isVerified = true;
    }
    // For forgot password, set otpVerified flag
    user.otpVerified = true;
    await user.save();
    res.json({ status: true, msg: 'OTP verified successfully.' });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Server error', error: err.message });
  }
};


exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password'); // hide password

    const usersWithFullUrls = users.map(u => ({
      ...u.toObject(),
      profilePhoto: getFullImageUrl(u.profilePhoto)
    }));

    res.status(200).json({ users: usersWithFullUrls });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'User not found'
      });
    }
    res.json({
      status: true,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        wallet: user.wallet,
        freeFireUsername: user.freeFireUsername,
        isAdmin: user.isAdmin,
        profilePhoto: getFullImageUrl(user.profilePhoto)
      }
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        status: false,
        message: 'Invalid user ID format'
      });
    }
    res.status(500).json({
      status: false,
      message: 'Server error occurred while fetching user.'
    });
  }
};

// Handler for query parameter-based user lookup
exports.getUserByQuery = async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({
        status: false,
        message: 'User ID is required as a query parameter'
      });
    }
    
    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'User not found'
      });
    }
    
    res.json({
      status: true,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        wallet: user.wallet,
        freeFireUsername: user.freeFireUsername,
        isAdmin: user.isAdmin,
        referCode: user.referCode,
        profilePhoto: getFullImageUrl(user.profilePhoto)
      }
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        status: false,
        message: 'Invalid user ID format'
      });
    }
    res.status(500).json({
      status: false,
      message: 'Server error occurred while fetching user.'
    });
  }
};
