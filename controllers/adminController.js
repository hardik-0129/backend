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


