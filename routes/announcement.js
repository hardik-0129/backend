const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const authentication = require('../middleware/adminAuth');

// Public routes (no authentication required)
router.get('/active', announcementController.getActiveAnnouncements);
router.get('/public', announcementController.getPublicAnnouncements);

// Admin routes (authentication required)
router.post('/create', authentication, announcementController.createAnnouncement);
router.get('/admin', authentication, announcementController.getAllAnnouncements);
router.get('/admin/:id', authentication, announcementController.getAnnouncementById);
router.put('/admin/:id', authentication, announcementController.updateAnnouncement);
router.delete('/admin/:id', authentication, announcementController.deleteAnnouncement);
router.patch('/admin/:id/toggle', authentication, announcementController.toggleAnnouncement);

module.exports = router;
