
const SlotCredentials = require('../models/SlotCredentials');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Slot = require('../models/Slot');
const Notification = require('../models/Notification');
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

    // Determine participants from bookings for this slot
    const bookings = await Booking.find({ slot: slotId }).lean();
    const participantUserIds = bookings.map(b => b.user).filter(Boolean);
    // Fetch users for device tokens
    const users = await User.find({ _id: { $in: participantUserIds } }).select('deviceToken').lean();

    // Fetch slot time for metadata
    const slot = await Slot.findById(slotId).lean();


    let notified = 0;
    for (const user of users) {
      const tokens = Array.isArray(user.deviceToken) ? user.deviceToken : (user.deviceToken ? [user.deviceToken] : []);
      for (const token of tokens) {
        if (token && String(token).trim()) {
          try {
            const deepLinkUrl = `myapp://openmatch/result?slotId=${slotId}&roomId=${id}&password=${password}`;

            await admin.messaging().send({
              token: token,
              // notification: {
              //   title: title || 'Match Credentials',
              //   body: `ID: ${id}, Password: ${password}`
              // },
              data: { slotId: String(slotId), id, password, deepLink: deepLinkUrl },
              webpush: {
                notification: {
                  icon: icon || '/logo.svg',
                  badge: '/logo.svg',
                  image: image || undefined,
                  title: title,
                  body: `ID: ${id}, Password: ${password}`
                },
                fcmOptions: { link: '/upcoming' }
              },
              android: {
                priority: 'high',
                data: {
                  type: 'match_credentials',
                  deepLink: deepLinkUrl,
                  screen: 'match_details',
                  slotId: String(slotId),
                  roomId: id,
                  password: password,
                  matchTitle: slot?.matchTitle || '',
                  matchIndex: slot?.matchIndex ? String(slot.matchIndex) : '',
                  matchTime: slot?.matchTime ? new Date(slot.matchTime).toISOString() : ''
                }
              },
              apns: {
                payload: {
                  aps: {
                    category: "MATCH_NOTIFICATION",
                    sound: "default"
                  }
                },
                headers: {
                  "apns-priority": "10"
                }
              }
            });
            notified++;
          } catch (e) {
            // continue
          }
        }
      }
    }

    // Save in-app notifications for each participant
    const computeSlotNumber = (booking) => {
      try {
        const keys = booking && booking.selectedPositions ? Array.from(Object.keys(booking.selectedPositions)) : [];
        return keys[0] || null;
      } catch {
        return null;
      }
    };
    const docs = bookings.map(b => ({
      userId: b.user,
      title: title || 'Match Credentials',
      type: 'match',
      metadata: {
        roomId: id || null,
        id: id || null,
        matchId: String(slotId),
        matchTitle: slot && slot.matchTitle ? slot.matchTitle : null,
        matchIndex: slot && slot.matchIndex ? String(slot.matchIndex) : null,
        matchDate: slot ? slot.matchTime : null,
        matchTime: slot ? new Date(slot.matchTime).toISOString() : null,
        matchPassword: password || null,
        slotNumber: computeSlotNumber(b)
      }
    }));
    if (docs.length > 0) {
      await Notification.insertMany(docs, { ordered: false });
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
            data: { 
              type: 'announcement',
              click_action: "OPEN_ANNOUNCEMENTS",
              screen: "announcements"
            },
            webpush: {
              fcmOptions: { link: '/upcoming' }
            },
            android: {
              data: {
                click_action: "OPEN_ANNOUNCEMENTS",
                screen: "announcements"
              }
            },
            apns: {
              payload: {
                aps: {
                  category: "ANNOUNCEMENT_NOTIFICATION",
                  sound: "default"
                }
              }
            }
          });
          notified++;
        } catch (e) {
        }
      }
    }
    // Persist in-app for each user so GET endpoints can return title/body
    const allUsers = await User.find({}).select('_id').lean();
    console.log('Creating announcement notifications for users:', allUsers.length);
    if (allUsers && allUsers.length) {
      const docs = allUsers.map(u => ({
        userId: u._id,
        title,
        type: 'announcement',
        metadata: { message: body }
      }));
      console.log('Creating notification docs:', docs.length, 'for users:', docs.map(d => d.userId));
      const result = await Notification.insertMany(docs, { ordered: false });
      console.log('Successfully created notifications:', result.length);
    }
    res.json({ status: true, msg: `Announcement sent to ${notified} tokens.` });
  } catch (err) {
    res.status(500).json({ status: false, msg: 'Failed to send announcement', error: err.message });
  }
};

// GET /api/notification - list notifications for current user
// exports.getMyNotifications = async (req, res) => {
//   try {
//     const userId = req.user.userId || req.user.id;
//     const list = await Notification.find({ userId }).sort({ createdAt: -1 }).lean();
//     return res.json({ status: true, notifications: list });
//   } catch (e) {
//     return res.status(500).json({ status: false, msg: 'Failed to fetch notifications' });
//   }
// };

// // GET /api/notification/announcements - only announcement notifications for current user
// exports.getMyAnnouncementNotifications = async (req, res) => {
//   try {
//     const userId = req.user.userId || req.user.id;
//     const list = await Notification.find({ userId, type: 'announcement' })
//       .sort({ createdAt: -1 })
//       .lean();
//     return res.json({ status: true, notifications: list });
//   } catch (e) {
//     return res.status(500).json({ status: false, msg: 'Failed to fetch announcements' });
//   }
// };


// GET /api/notification/by-bookings - notifications for slots the user has booked
exports.getNotificationsForMyBookings = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    // find user's bookings and collect slot ids
    const myBookings = await Booking.find({ user: userId }).select('slot').lean();
    if (!myBookings || myBookings.length === 0) {
      return res.json({ status: true, notifications: [] });
    }
    const slotIds = myBookings.map(b => String(b.slot));
    // Fetch user's match notifications for booked slots
    const matchList = await Notification.find({
      userId,
      'metadata.matchId': { $in: slotIds }
    }).lean();
    // Fetch announcements for this specific user only
    const announcements = await Notification.find({ userId, type: 'announcement' }).lean();
    // Merge and sort by createdAt desc, de-duplicate by _id just in case
    const merged = [...matchList, ...announcements];
    const map = new Map();
    for (const n of merged) map.set(String(n._id), n);
    const list = Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json({ status: true, notifications: list });
  } catch (e) {
    return res.status(500).json({ status: false, msg: 'Failed to fetch notifications' });
  }
};

// PATCH /api/notification/:id/read - mark single
exports.markOneRead = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { id } = req.params;
    
    // console.log('Mark as read request:', { userId, id });
    
    // First, find the notification to check its type
    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ status: false, msg: 'Notification not found' });
    }
    
    // console.log('Found notification:', { 
    //   _id: notification._id, 
    //   type: notification.type, 
    //   userId: notification.userId,
    //   isRead: notification.isRead 
    // });
    
    // For announcement notifications, ensure user ownership (each user has their own record)
    // For match notifications, update the existing record
    if (notification.type === 'announcement') {
      // For announcements, ensure this user owns this specific notification record
      const updated = await Notification.findOneAndUpdate(
        { _id: id, userId }, 
        { $set: { isRead: true } }, 
        { new: true }
      );
      if (!updated) return res.status(404).json({ status: false, msg: 'Notification not found or you do not have permission' });
      return res.json({ status: true, notification: updated });
    } else {
      // For match notifications, ensure user ownership
      const updated = await Notification.findOneAndUpdate(
        { _id: id, userId }, 
        { $set: { isRead: true } }, 
        { new: true }
      );
      if (!updated) return res.status(404).json({ status: false, msg: 'Notification not found or you do not have permission' });
    return res.json({ status: true, notification: updated });
    }
  } catch (e) {
    console.error('Mark as read error:', e);
    return res.status(500).json({ status: false, msg: 'Failed to mark as read' });
  }
};

// GET /api/notification/debug-announcements - debug announcement notifications
exports.debugAnnouncements = async (req, res) => {
  // try {
  //   const userId = req.user.userId || req.user.id;
  //   console.log('Debug announcements for user:', userId);
    
  //   // Get all announcement notifications for this user
  //   const userAnnouncements = await Notification.find({ userId, type: 'announcement' }).lean();
    
  //   // Get all announcement notifications globally
  //   const allAnnouncements = await Notification.find({ type: 'announcement' }).lean();
    
  //   return res.json({ 
  //     status: true, 
  //     msg: 'Announcement debug info',
  //     userId: userId,
  //     userAnnouncements: userAnnouncements.length,
  //     allAnnouncements: allAnnouncements.length,
  //     userAnnouncementDetails: userAnnouncements.map(n => ({
  //       _id: n._id,
  //       userId: n.userId,
  //       title: n.title,
  //       isRead: n.isRead,
  //       createdAt: n.createdAt
  //     })),
  //     allAnnouncementDetails: allAnnouncements.map(n => ({
  //       _id: n._id,
  //       userId: n.userId,
  //       title: n.title,
  //       isRead: n.isRead,
  //       createdAt: n.createdAt
  //     }))
  //   });
  // } catch (e) {
  //   console.error('Debug announcements error:', e);
  //   return res.status(500).json({ status: false, msg: 'Failed to debug announcements', error: e.message });
  // }
};

// PATCH /api/notification/read-all - mark all
exports.markAllRead = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const result = await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
    return res.json({ status: true, modifiedCount: result.modifiedCount || 0 });
  } catch (e) {
    return res.status(500).json({ status: false, msg: 'Failed to mark all as read' });
  }
};

// DELETE /api/notification/:id - delete single notification
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { id } = req.params;
    const deleted = await Notification.findOneAndDelete({ _id: id, userId });
    if (!deleted) return res.status(404).json({ status: false, msg: 'Notification not found' });
    return res.json({ status: true, msg: 'Notification deleted successfully' });
  } catch (e) {
    return res.status(500).json({ status: false, msg: 'Failed to delete notification' });
  }
};