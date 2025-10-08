const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ msg: 'Email and password are required.' });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ msg: 'Admin not found.' });
    }

    if (!admin.isAdmin) {
      return res.status(403).json({ msg: 'Access denied. Not an admin.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ msg: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      {
        isAdmin: true,
        adminId: admin._id,
        email: admin.email
      },
      process.env.JWT_SECRET,
    );

    res.status(200).json({
      msg: 'Admin login successful.',
      token,
      admin: {
        id: admin._id,
        email: admin.email
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ msg: 'Server error. Please try again later.' });
  }
};

// controllers/adminController.js

exports.createSlot = async (req, res) => {
  try {
    const { matchType, entryFee, startTime } = req.body;

    if (!matchType || !entryFee || !startTime) {
      return res.status(400).json({ msg: 'Missing required fields' });
    }

    const maxByType = { Solo: 48, Duo: 24, Squad: 12 };
    const maxSlots = maxByType[matchType];

    const slot = await Slot.create({
      matchType,
      entryFee,
      startTime,
      maxSlots,
      remainingSlots: maxSlots
    });

    res.status(201).json({ msg: 'Slot created successfully', slot });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ isAdmin: false })
      .select('-password') // Exclude password from response
      .sort({ createdAt: -1 }); // Sort by newest first

    res.status(200).json({
      msg: 'Users fetched successfully',
      users,
      totalUsers: users.length
    });
  } catch (error) {
    res.status(500).json({ msg: 'Server error. Please try again later.' });
  }
};

// Create new user (admin only)
exports.createUser = async (req, res) => {
  try {
    const { name, email, phone, password, freeFireUsername, wallet, isAdmin } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password || !freeFireUsername) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name, email, phone, password, and Free Fire username are required' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { phone: phone },
        { freeFireUsername: freeFireUsername }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'User with this email, phone, or Free Fire username already exists' 
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate referral code
    const generateReferralCode = () => {
      const prefix = 'Alpha';
      const randomNum = Math.floor(Math.random() * 9000) + 1000; // 4-digit number
      return `${prefix}${randomNum}`;
    };

    let referralCode = generateReferralCode();
    
    // Ensure referral code is unique
    while (await User.findOne({ referCode: referralCode })) {
      referralCode = generateReferralCode();
    }

    // Create new user
    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password: hashedPassword,
      freeFireUsername: freeFireUsername.trim(),
      wallet: parseFloat(wallet) || 0,
      isAdmin: isAdmin || false,
      referCode: referralCode,
      isVerified: true, // Admin-created users are automatically verified
      createdAt: new Date()
    });

    await newUser.save();

    // Remove password from response
    const userResponse = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      freeFireUsername: newUser.freeFireUsername,
      wallet: newUser.wallet,
      isAdmin: newUser.isAdmin,
      referCode: newUser.referCode,
      isVerified: newUser.isVerified,
      createdAt: newUser.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userResponse
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error. Please try again later.',
      details: error.message 
    });
  }
};

// Delete user (admin only)
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID is required' 
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Prevent deletion of admin users
    if (user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Cannot delete admin users' 
      });
    }

    // Delete all related bookings first
    await Booking.deleteMany({ user: userId });

    // Delete all related transactions
    const Transaction = require('../models/Transaction');
    await Transaction.deleteMany({ userId: userId });

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'User and all related data deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error. Please try again later.',
      details: error.message 
    });
  }
};

// Get all slot bookings with user details
exports.getAllSlotBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('user', 'name email freeFireUsername phone')
      .populate('slot', 'slotType matchTitle tournamentName matchTime entryFee totalWinningPrice')
      .sort({ createdAt: -1 });

    // Filter out bookings where slot or user is null (deleted references)
    const validBookings = bookings.filter(booking => booking.slot && booking.user);

    // Group bookings by slot
    const slotBookings = {};
    validBookings.forEach(booking => {
      const slotId = booking.slot._id.toString();
      if (!slotBookings[slotId]) {
        slotBookings[slotId] = {
          slotInfo: booking.slot,
          bookings: []
        };
      }
      slotBookings[slotId].bookings.push({
        _id: booking._id,
        user: booking.user,
        selectedPositions: booking.selectedPositions,
        playerNames: booking.playerNames,
        totalAmount: booking.totalAmount,
        status: booking.status,
        createdAt: booking.createdAt
      });
    });

    res.status(200).json({
      msg: 'Slot bookings fetched successfully',
      slotBookings,
      totalBookings: validBookings.length
    });
  } catch (error) {
    console.error('Get slot bookings error:', error);
    res.status(500).json({ msg: 'Server error. Please try again later.' });
  }
};

// Clean up orphaned bookings (bookings referencing deleted slots)
exports.cleanupOrphanedBookings = async (req, res) => {
  try {
    // Find all bookings
    const allBookings = await Booking.find();
    
    // Get all valid slot IDs
    const validSlots = await Slot.find().select('_id');
    const validSlotIds = validSlots.map(slot => slot._id.toString());
    
    // Find orphaned bookings (bookings that reference deleted slots)
    const orphanedBookings = allBookings.filter(booking => 
      !validSlotIds.includes(booking.slot.toString())
    );
    
    if (orphanedBookings.length > 0) {
      // Delete orphaned bookings
      const orphanedIds = orphanedBookings.map(booking => booking._id);
      await Booking.deleteMany({ _id: { $in: orphanedIds } });
      
      res.status(200).json({
        msg: `Cleaned up ${orphanedBookings.length} orphaned bookings`,
        deletedCount: orphanedBookings.length
      });
    } else {
      res.status(200).json({
        msg: 'No orphaned bookings found',
        deletedCount: 0
      });
    }
  } catch (error) {
    console.error('Cleanup orphaned bookings error:', error);
    res.status(500).json({ msg: 'Server error. Please try again later.' });
  }
};

// Distribute funds to NFT holders
exports.distributeFunds = async (req, res) => {
  try {
    const { totalAmount, distributions } = req.body;

    // Validate input
    if (!totalAmount || !distributions || !Array.isArray(distributions)) {
      return res.status(400).json({ 
        msg: 'Invalid input. totalAmount and distributions array are required.' 
      });
    }

    if (distributions.length === 0) {
      return res.status(400).json({ 
        msg: 'No distributions provided.' 
      });
    }

    // Validate that the sum of distributions equals total amount (with small tolerance for rounding)
    const sumOfDistributions = distributions.reduce((sum, dist) => sum + dist.amount, 0);
    const tolerance = 0.01; // Allow 1 paisa tolerance for rounding
    if (Math.abs(sumOfDistributions - totalAmount) > tolerance) {
      return res.status(400).json({ 
        msg: 'Sum of distributions does not match total amount.' 
      });
    }

    const results = [];
    const errors = [];

    // Process each distribution
    for (const distribution of distributions) {
      try {
        const { userId, amount } = distribution;

        if (!userId || !amount || amount <= 0) {
          errors.push({
            userId,
            error: 'Invalid userId or amount'
          });
          continue;
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
          errors.push({
            userId,
            error: 'User not found'
          });
          continue;
        }

        // Update user's wallet balance
        const currentBalance = user.wallet || 0;
        const newBalance = currentBalance + amount;

        await User.findByIdAndUpdate(userId, {
          wallet: newBalance
        });

        // Create a WIN transaction so it gets counted in totalEarnings
        const Transaction = require('../models/Transaction');
        await Transaction.create({
          userId: user._id,
          type: 'WIN',
          amount: amount,
          description: `NFT Holder Distribution - ${amount} distributed`,
          transactionId: `NFT_DIST_${user._id}_${Date.now()}`,
          status: 'SUCCESS',
          paymentMethod: 'SYSTEM',
          balanceAfter: newBalance,
          metadata: { 
            category: 'WIN',
            distributionType: 'NFT_HOLDER_DISTRIBUTION'
          }
        });

        results.push({
          userId,
          userName: user.name,
          userEmail: user.email,
          amount,
          previousBalance: currentBalance,
          newBalance: newBalance
        });

      } catch (error) {
        console.error(`Error processing distribution for user ${distribution.userId}:`, error);
        errors.push({
          userId: distribution.userId,
          error: error.message
        });
      }
    }

    // Return response
    if (errors.length > 0 && results.length === 0) {
      return res.status(500).json({
        msg: 'All distributions failed',
        errors
      });
    }

    res.status(200).json({
      msg: 'Funds distributed successfully',
      totalAmount,
      successfulDistributions: results.length,
      failedDistributions: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Distribute funds error:', error);
    res.status(500).json({ 
      msg: 'Server error. Please try again later.',
      error: error.message 
    });
  }
};

// Admin: add win money to a user (counts towards totalEarnings)
exports.updateUserWinMoney = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ success: false, error: 'userId and amount are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const amountToAdd = parseFloat(amount);
    if (isNaN(amountToAdd) || amountToAdd <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a positive number' });
    }

    // Update wallet balance
    user.wallet += amountToAdd;

    // Create WIN transaction so it's included in totalEarnings
    const Transaction = require('../models/Transaction');
    await Transaction.create({
      userId: user._id,
      type: 'WIN',
      amount: amountToAdd,
      description: `Admin added Gift money: ₹${amountToAdd}`,
      transactionId: `ADMIN_WIN_${user._id}_${Date.now()}`,
      status: 'SUCCESS',
      paymentMethod: 'SYSTEM',
      balanceAfter: user.wallet,
      metadata: { category: 'WIN', adminAdded: true, addedBy: req.user?.adminId }
    });

    await user.save();

    res.json({ success: true, message: 'Win money added successfully', newBalance: user.wallet });
  } catch (error) {
    console.error('Update user win money error:', error);
    res.status(500).json({ success: false, error: 'Failed to update user win money', details: error.message });
  }
};


