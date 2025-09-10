const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authentication = require('../middleware/adminAuth');

router.post('/send', authentication, notificationController.sendNotification);
router.post('/send-slot-credentials', authentication, notificationController.sendSlotCredentials);
router.post('/announcement', authentication, notificationController.sendAnnouncement);

module.exports = router;
