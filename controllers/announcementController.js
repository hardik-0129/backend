const Announcement = require('../models/Announcement');

// GET /api/announcement/active - Get active announcements for display
exports.getActiveAnnouncements = async (req, res) => {
  try {
    const now = new Date();
    const announcements = await Announcement.find({
      isActive: true,
      startDate: { $lte: now },
      $or: [
        { endDate: null },
        { endDate: { $gte: now } }
      ]
    })
    .sort({ priority: -1, createdAt: -1 })
    .select('title content type priority targetAudience')
    .lean();

    return res.json({ 
      status: true, 
      announcements,
      count: announcements.length 
    });
  } catch (error) {
    return res.status(500).json({ 
      status: false, 
      msg: 'Failed to fetch announcements',
      error: error.message 
    });
  }
};

// GET /api/announcement/public - Get public announcements (for non-logged in users)
exports.getPublicAnnouncements = async (req, res) => {
  try {
    const now = new Date();
    const announcements = await Announcement.find({
      isActive: true,
      targetAudience: { $in: ['all', 'guests'] },
      startDate: { $lte: now },
      $or: [
        { endDate: null },
        { endDate: { $gte: now } }
      ]
    })
    .sort({ priority: -1, createdAt: -1 })
    .select('title content type priority')
    .lean();

    return res.json({ 
      status: true, 
      announcements,
      count: announcements.length 
    });
  } catch (error) {
    return res.status(500).json({ 
      status: false, 
      msg: 'Failed to fetch public announcements',
      error: error.message 
    });
  }
};

// POST /api/announcement/create - Create new announcement (Admin only)
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const createdBy = req.user.userId || req.user.id;

    if (!title || !content) {
      return res.status(400).json({ 
        status: false, 
        msg: 'Title and content are required' 
      });
    }

    const announcement = new Announcement({
      title,
      content,
      type: type || 'html',
      priority: 1, // Default priority
      startDate: new Date(), // Start immediately
      endDate: null, // No end date
      targetAudience: 'all', // Show to all users
      createdBy
    });

    await announcement.save();

    return res.json({ 
      status: true, 
      msg: 'Announcement created successfully',
      announcement 
    });
  } catch (error) {
    return res.status(500).json({ 
      status: false, 
      msg: 'Failed to create announcement',
      error: error.message 
    });
  }
};

// GET /api/announcement/admin - Get all announcements (Admin only)
exports.getAllAnnouncements = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (type) filter.type = type;

    const announcements = await Announcement.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Announcement.countDocuments(filter);

    return res.json({ 
      status: true, 
      announcements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      status: false, 
      msg: 'Failed to fetch announcements',
      error: error.message 
    });
  }
};

// GET /api/announcement/admin/:id - Get announcement by ID (Admin only)
exports.getAnnouncementById = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id)
      .populate('createdBy', 'name email');

    if (!announcement) {
      return res.status(404).json({ 
        status: false, 
        msg: 'Announcement not found' 
      });
    }

    return res.json({ 
      status: true, 
      announcement 
    });
  } catch (error) {
    return res.status(500).json({ 
      status: false, 
      msg: 'Failed to fetch announcement',
      error: error.message 
    });
  }
};

// PUT /api/announcement/admin/:id - Update announcement (Admin only)
exports.updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, isActive } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (type !== undefined) updateData.type = type;
    if (isActive !== undefined) updateData.isActive = isActive;

    const announcement = await Announcement.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    ).populate('createdBy', 'name email');

    if (!announcement) {
      return res.status(404).json({ 
        status: false, 
        msg: 'Announcement not found' 
      });
    }

    return res.json({ 
      status: true, 
      msg: 'Announcement updated successfully',
      announcement 
    });
  } catch (error) {
    return res.status(500).json({ 
      status: false, 
      msg: 'Failed to update announcement',
      error: error.message 
    });
  }
};

// DELETE /api/announcement/admin/:id - Delete announcement (Admin only)
exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findByIdAndDelete(id);

    if (!announcement) {
      return res.status(404).json({ 
        status: false, 
        msg: 'Announcement not found' 
      });
    }

    return res.json({ 
      status: true, 
      msg: 'Announcement deleted successfully' 
    });
  } catch (error) {
    return res.status(500).json({ 
      status: false, 
      msg: 'Failed to delete announcement',
      error: error.message 
    });
  }
};

// PATCH /api/announcement/admin/:id/toggle - Toggle announcement status (Admin only)
exports.toggleAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);

    if (!announcement) {
      return res.status(404).json({ 
        status: false, 
        msg: 'Announcement not found' 
      });
    }

    announcement.isActive = !announcement.isActive;
    await announcement.save();

    return res.json({ 
      status: true, 
      msg: `Announcement ${announcement.isActive ? 'activated' : 'deactivated'} successfully`,
      announcement 
    });
  } catch (error) {
    return res.status(500).json({ 
      status: false, 
      msg: 'Failed to toggle announcement',
      error: error.message 
    });
  }
};
