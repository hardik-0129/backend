const cron = require('node-cron');
const Slot = require('../models/Slot');
const updateMatchStatuses = async () => {
  try {
    const now = new Date();
    
    const matchesToGoLive = await Slot.find({
      status: 'upcoming',
      matchTime: { $lte: now }
    });

    for (const match of matchesToGoLive) {
      // Re-check latest status; if cancelled, do not change
      const fresh = await Slot.findById(match._id).select('status isCancelledPermanently');
      if (fresh && (fresh.status === 'cancelled' || fresh.isCancelledPermanently)) continue;
      await Slot.findByIdAndUpdate(match._id, { status: 'live' });
    }

    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const matchesToComplete = await Slot.find({
      status: 'live',
      matchTime: { $lte: thirtyMinutesAgo }
    });

    for (const match of matchesToComplete) {
      const fresh2 = await Slot.findById(match._id).select('status isCancelledPermanently');
      if (fresh2 && (fresh2.status === 'cancelled' || fresh2.isCancelledPermanently)) continue;
      await Slot.findByIdAndUpdate(match._id, { status: 'completed' });
    }
    
  } catch (error) {
    console.error('Error updating match statuses:', error);
  }
};

const startCronJobs = () => {
  cron.schedule('* * * * *', updateMatchStatuses);
  
  cron.schedule('*/5 * * * *', async () => {
    try {
      const inconsistentMatches = await Slot.find({
        status: 'upcoming',
        matchTime: { $lt: new Date(Date.now() - 60 * 60 * 1000) } // 1 hour ago
      });
      
      for (const match of inconsistentMatches) {
        const fresh3 = await Slot.findById(match._id).select('status');
        if (fresh3 && fresh3.status === 'cancelled') continue;
        await Slot.findByIdAndUpdate(match._id, { status: 'completed' });
      }
      
    } catch (error) {
      console.error('Error in cleanup cron job:', error);
    }
  });
};


module.exports = {
  startCronJobs,
  updateMatchStatuses,
};
