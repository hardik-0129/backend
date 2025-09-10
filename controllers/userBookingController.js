// Get all bookings for a user by userId, with optional status filter
const Booking = require('../models/Booking');

exports.getUserBookings = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    // Build query: only return bookings that match BOTH userId and status if provided
    let query = {};
    if (status) {
      query = {
        $and: [
          { $or: [ { user: userId }, { userId: userId } ] },
        ]
      };
    } else {
      query = {
        $or: [ { user: userId }, { userId: userId } ]
      };
    }
    const bookings = await Booking.find(query)
      .populate('slot')
      .sort({ createdAt: -1 });
    let filtered = bookings;
    if (status) {
      // Support multiple statuses: ?status=confirmed,ongoing
      const statusList = status.split(',').map(s => s.trim().toLowerCase());
      bookings.forEach(b => {
        const slotStatus = b.slot && typeof b.slot.status === 'string' ? b.slot.status.trim().toLowerCase() : undefined;
      });
      filtered = bookings.filter(b => {
        const slotStatus = b.slot && typeof b.slot.status === 'string' ? b.slot.status.trim().toLowerCase() : undefined;
        return slotStatus && statusList.includes(slotStatus);
      });
    }
    res.status(200).json({ success: true, bookings: filtered });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
