const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authentication = require('../middleware/adminAuth');

router.post('/send', authentication, notificationController.sendNotification);
router.post('/send-slot-credentials', authentication, notificationController.sendSlotCredentials);
router.post('/announcement', authentication, notificationController.sendAnnouncement);

// In-app notifications endpoints
// router.get('/', authentication, notificationController.getMyNotifications);
// router.get('/announcements', authentication, notificationController.getMyAnnouncementNotifications);
router.get('/by-bookings', authentication, notificationController.getNotificationsForMyBookings);
router.get('/debug-announcements', authentication, notificationController.debugAnnouncements);
router.patch('/:id/read', authentication, notificationController.markOneRead);
router.patch('/read-all', authentication, notificationController.markAllRead);
router.delete('/:id', authentication, notificationController.deleteNotification);

module.exports = router;
