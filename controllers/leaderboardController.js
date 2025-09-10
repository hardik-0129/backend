// Leaderboard API for weekly/monthly top winners by balance
const User = require('../models/User');
const Winner = require('../models/Winner');

// GET /api/user/leaderboard?filter=weekly|monthly
exports.getLeaderboard = async (req, res) => {
  try {
    const filter = req.query.filter || 'weekly';
    let startDate;
    const now = new Date();
    if (filter === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1); 
    } else {
      // Default to weekly: last 7 days
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    }

    // Aggregate total winningPrice per user in the period
    const winners = await Winner.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$userId', totalWin: { $sum: '$winningPrice' } } },
      { $sort: { totalWin: -1 } },
      { $limit: 20 }
    ]);

    // Get user details and wallet for leaderboard
    const userIds = winners.map(w => w._id);
    const users = await User.find({ _id: { $in: userIds } })
      .select('name freeFireUsername wallet');
    const userMap = {};
    users.forEach(u => { userMap[u._id] = u; });

    const leaderboard = winners.map(w => ({
      userId: w._id,
      name: userMap[w._id]?.name || '',
      freeFireUsername: userMap[w._id]?.freeFireUsername || '',
      wallet: userMap[w._id]?.wallet || 0,
      totalWin: w.totalWin
    }));

    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
