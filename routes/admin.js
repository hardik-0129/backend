const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const slotController = require('../controllers/slotController');
const authentication = require('../middleware/adminAuth');

// router.post('/login',adminController.adminLogin);

// Get all users
router.get('/users', authentication, adminController.getAllUsers);

// Get all slot bookings
router.get('/slot-bookings', authentication, adminController.getAllSlotBookings);

// Clean up orphaned bookings
router.delete('/cleanup-bookings', authentication, adminController.cleanupOrphanedBookings);

// Tournament rules management
// router.post('/slots/:slotId/tournament-rules', authentication, slotController.addTournamentRules);
router.put('/slots/:slotId/tournament-rules', authentication, slotController.updateTournamentRules);
router.get('/slots/:slotId/tournament-rules', authentication, slotController.getTournamentRules);

// Slot management routes

module.exports = router;

