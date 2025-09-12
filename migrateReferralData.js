const mongoose = require('mongoose');
const User = require('./models/User');
const Transaction = require('./models/Transaction');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your_database_name', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function migrateReferralData() {
  try {
    
    // Get all users who have referredBy field
    const usersWithReferrals = await User.find({ referredBy: { $exists: true, $ne: null } });
    
    for (const user of usersWithReferrals) {
      // Find referrer
      const referrer = await User.findOne({ referCode: user.referredBy });
      if (referrer) {
        // Update referrer's totalReferrals count
        referrer.totalReferrals += 1;
        await referrer.save();
      }
    }
    
    // Get all referral transactions and update user totals
    const referralTransactions = await Transaction.find({
      'metadata.bonusType': { $in: ['signup_referral', 'first_paid_match_referral'] }
    });
    
    
    for (const transaction of referralTransactions) {
      const user = await User.findById(transaction.userId);
      if (user) {
        // Update totalReferralEarnings
        user.totalReferralEarnings = (user.totalReferralEarnings || 0) + transaction.amount;
        await user.save();
      }
    }
      
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateReferralData();
}

module.exports = migrateReferralData;
