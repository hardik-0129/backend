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
      await Slot.findByIdAndUpdate(match._id, { status: 'live' });
      console.log(`Match ${match._id} status updated to 'live' at ${now}`);
    }

    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const matchesToComplete = await Slot.find({
      status: 'live',
      matchTime: { $lte: thirtyMinutesAgo }
    });

    for (const match of matchesToComplete) {
      await Slot.findByIdAndUpdate(match._id, { status: 'completed' });
      console.log(`Match ${match._id} status updated to 'completed' at ${now}`);
    }

    console.log(`Status update completed at ${now}. Updated ${matchesToGoLive.length} to live, ${matchesToComplete.length} to completed.`);
    
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
        await Slot.findByIdAndUpdate(match._id, { status: 'completed' });
        console.log(`Cleaned up match ${match._id} - moved to completed`);
      }
      
    } catch (error) {
      console.error('Error in cleanup cron job:', error);
    }
  });
  
  console.log('Cleanup cron job started - Will run every 5 minutes');
};

const manualStatusUpdate = async () => {
  await updateMatchStatuses();
};

module.exports = {
  startCronJobs,
  updateMatchStatuses,
  manualStatusUpdate
};
