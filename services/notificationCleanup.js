const Notification = require('../models/Notification');

/**
 * Keep only the latest N notifications per user, delete the rest.
 * Uses aggregation with $setWindowFields when available, falling back to per-user cleanup if needed.
 * @param {number} keepCount
 */
async function cleanupOldNotifications(keepCount = 10) {
  // Prefer server-side deleteMany using a list of _ids to remove
  // Approach: rank notifications per user by createdAt desc, delete rank > keepCount
  try {
    // MongoDB 5+ supports $setWindowFields
    const toDelete = await Notification.aggregate([
      { $sort: { userId: 1, createdAt: -1, _id: -1 } },
      {
        $setWindowFields: {
          partitionBy: '$userId',
          sortBy: { createdAt: -1, _id: -1 },
          output: {
            rowNumber: { $documentNumber: {} }
          }
        }
      },
      { $match: { rowNumber: { $gt: keepCount } } },
      { $project: { _id: 1 } }
    ]);

    if (toDelete.length > 0) {
      const ids = toDelete.map(d => d._id);
      await Notification.deleteMany({ _id: { $in: ids } });
    }

    return { success: true, deletedCount: toDelete.length };
  } catch (err) {
    // Fallback: per-user iterative cleanup (works on older MongoDB versions)
    let totalDeleted = 0;
    const users = await Notification.distinct('userId');
    for (const userId of users) {
      const list = await Notification.find({ userId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(keepCount)
        .select('_id')
        .lean();
      if (list.length) {
        const ids = list.map(n => n._id);
        const res = await Notification.deleteMany({ _id: { $in: ids } });
        totalDeleted += res.deletedCount || 0;
      }
    }
    return { success: true, deletedCount: totalDeleted, fallback: true };
  }
}

module.exports = { cleanupOldNotifications };


