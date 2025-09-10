
const SlotCredentials = require('../models/SlotCredentials');
const Booking = require('../models/Booking');
const User = require('../models/User');
// POST /api/notification/send-slot-credentials

// backend/controllers/notificationController.js
const admin = require('firebase-admin');
const path = require('path');
// Initialize firebase-admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require(path.join(__dirname, '../config/serviceAccountKey.json'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// POST /api/notification/send
exports.sendNotification = async (req, res) => {
  try {
    const { deviceToken, title, body, data } = req.body;
    if (!deviceToken || !title || !body) {
      return res.status(400).json({ status: false, msg: 'deviceToken, title, and body are required' });
    }
    const message = {
      token: deviceToken,
      notification: { title, body },
      data: data || {},
    };
    const response = await admin.messaging().send(message);
    res.json({ status: true, msg: 'Notification sent', response });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Failed to send notification', error: err.message });
  }
};

exports.sendSlotCredentials = async (req, res) => {
  try {
    const { slotId, id, password, title } = req.body;
    console.log(`Sending slot credentials for Slot ID: ${slotId}, ID: ${id}`);

    if (!slotId || !id || !password) {
      return res.status(400).json({ status: false, msg: 'slotId, id, and password are required' });
    }
    // Upsert credentials in DB (update if exists, insert if not)
    await SlotCredentials.findOneAndUpdate(
      { slotId },
      { id, password, sentAt: new Date() },
      { upsert: true, new: true }
    );

    // Find all users booked in this slot
    const bookings = await Booking.find({ slot: slotId }).populate('user');
    let notified = 0;
    for (const booking of bookings) {
        console.log(`Notifying user for Booking ID: ${booking._id}`);
      const user = await User.findById(booking.userId);
      console.log(`User found: ${user ? user.email : 'Unknown'}`);

      console.log(`User Device Token: ${user.deviceToken}`);
      if (user && user.deviceToken) {
        try {
          await admin.messaging().send({
            token: user.deviceToken,
            notification: {
              title: title || 'Match Credentials',
              body: `ID: ${id}, Password: ${password}`
            },
            data: { slotId: String(slotId), id, password }
          });
          notified++;
        } catch (e) {
          // log error but continue
        }
      }
    }
    res.json({ status: true, msg: `Credentials sent to ${notified} users and saved.` });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Failed to send slot credentials', error: err.message });
  }
};

// Send announcement notification to all users with a deviceToken
exports.sendAnnouncement = async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.status(400).json({ status: false, msg: 'title and body are required' });
    }
    // Find all users with a deviceToken
    const users = await User.find({ deviceToken: { $ne: null } });
    let notified = 0;
    for (const user of users) {
      try {
        await admin.messaging().send({
          token: user.deviceToken,
          notification: { title, body },
          data: { type: 'announcement' }
        });
        notified++;
      } catch (e) {
        // log error but continue
      }
    }
    res.json({ status: true, msg: `Announcement sent to ${notified} users.` });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Failed to send announcement', error: err.message });
  }
};