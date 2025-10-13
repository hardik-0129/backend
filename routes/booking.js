const express = require('express');
const router = express.Router();
const { createBooking, getMyBookingsWithUser, getSlotBookings, updateWinnerStats, getUserSlotBooking } = require('../controllers/bookingController');
const authentication = require('../middleware/adminAuth');

router.post('/create', authentication, createBooking);
router.get('/slot/:slotId', getSlotBookings);
router.get('/:id', authentication, getMyBookingsWithUser);
router.put('/winner/:bookingId', authentication, updateWinnerStats);
router.post('/user-booking', authentication, getUserSlotBooking);

module.exports = router;