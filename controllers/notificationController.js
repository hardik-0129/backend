
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
    const { deviceToken, title, body, data, icon, image, click_action } = req.body;
    if (!deviceToken || !title || !body) {
      return res.status(400).json({ status: false, msg: 'deviceToken, title, and body are required' });
    }
    const message = {
      token: deviceToken,
      notification: { title, body },
      data: data || {},
      webpush: {
        notification: {
          icon: icon || '/logo.svg',
          badge: '/logo.svg',
          image: image || undefined
        },
        fcmOptions: click_action ? { link: click_action } : undefined
      },
      android: {
        notification: {
          imageUrl: image || undefined
        }
      }
    };
    const response = await admin.messaging().send(message);
    res.json({ status: true, msg: 'Notification sent', response });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Failed to send notification', error: err.message });
  }
};

exports.sendSlotCredentials = async (req, res) => {
  try {
    const { slotId, id, password, title, icon, image } = req.body;

    if (!slotId || !id || !password) {
      return res.status(400).json({ status: false, msg: 'slotId, id, and password are required' });
    }
    // Upsert credentials in DB (update if exists, insert if not)
    await SlotCredentials.findOneAndUpdate(
      { slotId },
      { id, password, sentAt: new Date() },
      { upsert: true, new: true }
    );

    // Find all users with device tokens
    const users = await User.find({ deviceToken: { $ne: null } });
    let notified = 0;
    for (const user of users) {
      if (user.deviceToken) {
        // Handle both single token and array of tokens
        const tokens = Array.isArray(user.deviceToken) ? user.deviceToken : [user.deviceToken];
        for (const token of tokens) {
          if (token && token.trim()) { // Check if token exists and is not empty
            try {
              await admin.messaging().send({
                token: token,
                notification: {
                  title: title || 'Match Credentials',
                  body: `ID: ${id}, Password: ${password}`
                },
                data: { slotId: String(slotId), id, password },
                webpush: {
                  notification: {
                    icon: icon || '/logo.svg',
                    badge: '/logo.svg',
                    image: image || undefined
                  }
                },
                android: {
                  notification: { imageUrl: image || undefined }
                }
              });
              notified++;
            } catch (e) {
              console.log('Failed to send notification to token:', token, 'Error:', e.message);
              // log error but continue
            }
          }
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
    const { title, body, icon } = req.body;
    if (!title || !body) {
      return res.status(400).json({ status: false, msg: 'title and body are required' });
    }
    // Find all users with a deviceToken
    const users = await User.find({ deviceToken: { $ne: null } });
    let notified = 0;
    for (const user of users) {
      const tokens = Array.isArray(user.deviceToken) ? user.deviceToken : [user.deviceToken];
      for (const token of tokens) {
        try {
          await admin.messaging().send({
            token,
            notification: { title, body , icon},
            data: { type: 'announcement' }
          });
          notified++;
        } catch (e) {
        }
      }
    }
    res.json({ status: true, msg: `Announcement sent to ${notified} tokens.` });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Failed to send announcement', error: err.message });
  }
};