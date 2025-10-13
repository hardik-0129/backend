// Leaderboard API for weekly/monthly top winners by balance
const User = require('../models/User');
const Winner = require('../models/Winner');

// GET /api/user/leaderboard?filter=weekly|monthly
// exports.getLeaderboard = async (req, res) => {
//   try {
//     const filter = req.query.filter || 'weekly';
//     let startDate;
//     const now = new Date();
//     if (filter === 'monthly') {
//       startDate = new Date(now.getFullYear(), now.getMonth(), 1); 
//     } else {
//       // Default to weekly: last 7 days
//       startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
//     }

//     // Aggregate total winningPrice per user in the period
//     const winners = await Winner.aggregate([
//       { $match: { createdAt: { $gte: startDate } } },
//       { $group: { _id: '$userId', totalWin: { $sum: '$winningPrice' } } },
//       { $match: { totalWin: { $gt: 0 } } }, // Filter out users with 0 total wins
//       { $sort: { totalWin: -1 } }
//     ]);

//     // Get user details and wallet for leaderboard
//     const userIds = winners.map(w => w._id);
//     const users = await User.find({ _id: { $in: userIds } })
//       .select('name freeFireUsername wallet');
//     const userMap = {};
//     users.forEach(u => { userMap[u._id] = u; });

//     const leaderboard = winners.map(w => ({
//       userId: w._id,
//       name: userMap[w._id]?.name || '',
//       freeFireUsername: userMap[w._id]?.freeFireUsername || '',
//       wallet: userMap[w._id]?.wallet || 0,
//       totalWin: w.totalWin
//     }));

//     res.json({ success: true, leaderboard });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// };
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

    // Aggregate per-user wins with transaction history and totalWin
    const winners = await Winner.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      // Normalize amount to support either winningPrice or winAmount fields
      { $project: {
          userId: 1,
          playerName: 1,
          gameName: 1,
          rank: 1,
          createdAt: 1,
          // Cast to number to ensure accurate summation even if stored as string
          amount: {
            $convert: {
              input: { $ifNull: ['$winningPrice', '$winAmount'] },
              to: 'double',
              onError: 0,
              onNull: 0
            }
          }
        }
      },
      // Exclude documents without a userId or with non-positive amounts
      { $match: { userId: { $ne: null }, amount: { $gt: 0 } } },
      { $group: {
          _id: '$userId',
          totalWin: { $sum: '$amount' },
          transactions: { $push: {
            amount: '$amount',
            playerName: '$playerName',
            gameName: '$gameName',
            rank: '$rank',
            createdAt: '$createdAt'
          } }
        }
      }
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
      totalWin: w.totalWin,
      // transactions: w.transactions || []
    }));

    // ✅ Sort by totalWin (desc) and then by name (asc)
    leaderboard.sort((a, b) => {
      if (b.totalWin !== a.totalWin) return b.totalWin - a.totalWin;
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
