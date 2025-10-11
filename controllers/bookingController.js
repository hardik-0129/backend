const Booking = require("../models/Booking");
const User = require("../models/User");
const Slot = require("../models/Slot");

// Helper function to normalize slot type to match enum values
const normalizeSlotType = (slotType) => {
  if (!slotType) return "solo";

  const type = slotType.toLowerCase().trim();

  // Map various formats to standardized enum values
  const typeMap = {
    solo: "solo",
    duo: "duo",
    squad: "squad",
    "clash squad": "clash squad",
    "lone wolf": "lone wolf",
    survival: "survival",
    "free matches": "free matches",
    // Handle variations that shouldn't be slot types but might appear
    "full map": "squad", // Default to squad for full map
    fullmap: "squad",
    "full-map": "squad",
  };

  return typeMap[type] || type;
};

// Helper function to create transaction
const createTransaction = async (data) => {
  try {
    const Transaction = require('../models/Transaction');
    return await Transaction.create(data);
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
};

// Helper function to process referral bonus for first paid match
const processReferralFirstPaidBonus = async (user, slot) => {
  try {
    // Check if user was referred and hasn't received first paid match bonus yet
    if (user.referredBy && !user.referralFirstPaidCredited && slot.entryFee > 0) {
      // Find the referrer
      const referrer = await User.findOne({ referCode: user.referredBy });
      
      if (referrer && String(referrer._id) !== String(user._id)) {
        // Give 5 rupees to referrer
        referrer.wallet += 5;
        referrer.totalReferralEarnings += 5;
        // Count referral first-paid bonus as winnings for the referrer
        referrer.winAmount = (parseFloat(referrer.winAmount) || 0) + 5;
        await referrer.save();

        // Create transaction for referrer
        await createTransaction({
          userId: referrer._id,
          type: 'WIN',
          amount: 5,
          description: `Referral bonus: ${user.name} played first paid match`,
          transactionId: `REF_FIRSTPAID_${referrer._id}_${Date.now()}`,
          status: 'SUCCESS',
          paymentMethod: 'SYSTEM',
          balanceAfter: referrer.wallet,
          metadata: {
            referredUser: user._id,
            referredUserName: user.name,
            matchId: slot._id,
            bonusType: 'first_paid_match_referral',
            category: 'WIN'
          }
        });

        // Mark user as having received first paid match bonus
        user.referralFirstPaidCredited = true;
        await user.save();

        // Emit wallet update to referrer via socket.io
        try {
          const { emitWalletUpdate } = require('../websocket');
          emitWalletUpdate(referrer._id.toString(), referrer.wallet);
        } catch (e) {
          console.error('Socket emit error (referral bonus):', e);
        }
      }
    }
  } catch (error) {
    console.error('Error processing referral bonus:', error);
  }
};

exports.createBooking = async (req, res) => {
  try {
    const {
      slotId,
      selectedPositions,
      playerNames,
      totalAmount,
      slotType,
      playerIndex,
      userId,
    } = req.body;

    // --- Prevent double-booking: check if any requested positions are already booked ---
    // 1. Fetch all bookings for this slot
    const existingBookings = await Booking.find({ slot: slotId });
    // 2. Build a set of all already booked positions (team/position)
    const alreadyBooked = new Set();
    existingBookings.forEach(bk => {
      if (bk.selectedPositions) {
        const posObj = bk.selectedPositions instanceof Map ? Object.fromEntries(bk.selectedPositions) : bk.selectedPositions;
        Object.entries(posObj).forEach(([team, positions]) => {
          positions.forEach(pos => alreadyBooked.add(`${team}-${pos}`));
        });
      }
    });
    // 3. Check if any requested position is already booked
    let conflictPositions = [];
    Object.entries(selectedPositions).forEach(([team, positions]) => {
      positions.forEach(pos => {
        if (alreadyBooked.has(`${team}-${pos}`)) {
          conflictPositions.push(`${team}-${pos}`);
        }
      });
    });
    if (conflictPositions.length > 0) {
      return res.status(409).json({
        msg: `Some positions are already booked: ${conflictPositions.join(', ')}`
      });
    }

    // Validate required fields
    if (
      !slotId ||
      !selectedPositions ||
      !playerNames ||
      totalAmount === undefined ||
      totalAmount === null ||
      !userId
    ) {
      return res.status(400).json({
        msg: "Missing required fields: slotId, selectedPositions, playerNames, totalAmount, userId",
      });
    }

    // Find user - support different token payload shapes or fallback to body
    const userIdFromToken = (req.user && (req.user.userId || req.user.id)) || userId;
    const user = await User.findById(userIdFromToken);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Find slot
    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ msg: "Slot not found" });
    }

    // Check if slot has available bookings
    if (slot.remainingBookings <= 0) {
      return res.status(400).json({ msg: "Slot is full" });
    }

    // Validate total amount calculation
    const positionsCount = Object.values(selectedPositions).reduce(
      (total, positions) => total + positions.length,
      0
    );

    // Free match when entryFee is 0 (or less) OR explicitly flagged as "free matches"
    const isFreeMachatch = (Number(slot.entryFee) <= 0) || (String(slotType || '').toLowerCase() === "free matches");
    
    // Enforce: For FREE matches a user can book only ONE position total for the slot
    if (isFreeMachatch) {
      if (positionsCount !== 1) {
        return res.status(400).json({
          msg: 'Free match: only one position can be booked per user'
        });
      }
      const existingUserBookingForSlot = await Booking.findOne({ slot: slotId, user: user._id }).lean();
      if (existingUserBookingForSlot) {
        return res.status(400).json({
          msg: 'Free match: you have already booked a position for this match'
        });
      }
    }
    const expectedAmount = isFreeMachatch ? 0 : Number(slot.entryFee || 0) * positionsCount;

    if (Math.abs(totalAmount - expectedAmount) > 0.01) {
      return res.status(400).json({
        msg: `Amount mismatch. Expected: ${expectedAmount}, Received: ${totalAmount}`,
      });
    }

    // Two-tier balance checking: first check join money (wallet), then win money (winAmount)
    if (!isFreeMachatch) {
      const joinMoney = parseFloat(user.wallet) || 0;
      const winMoney = parseFloat(user.winAmount) || 0;
      const totalBalance = joinMoney + winMoney;
      
      if (totalBalance < totalAmount) {
        return res.status(400).json({
          msg: `Insufficient balance. Required: ${totalAmount}, Available: ${totalBalance} (Join: ${joinMoney}, Win: ${winMoney})`,
        });
      }
      
      // Deduct from join money first, then from win money if needed
      let remainingAmount = totalAmount;
      let newWallet = joinMoney;
      let newWinAmount = winMoney;
      
      if (joinMoney >= remainingAmount) {
        // Enough join money - deduct only from wallet
        newWallet = joinMoney - remainingAmount;
        remainingAmount = 0;
      } else {
        // Not enough join money - use all join money, then deduct from win money
        remainingAmount = remainingAmount - joinMoney;
        newWallet = 0;
        newWinAmount = winMoney - remainingAmount;
        remainingAmount = 0;
      }
      
      // Update user balances
      user.wallet = newWallet;
      user.winAmount = newWinAmount;
    }

    // Validate that all selected positions have player names
    const missingNames = [];
    Object.entries(selectedPositions).forEach(([team, positions]) => {
      positions.forEach((position) => {
        const key = `${team}-${position}`;
        if (!playerNames[key] || playerNames[key].trim() === "") {
          missingNames.push(key);
        }
      });
    });

    if (missingNames.length > 0) {
      return res.status(400).json({
        msg: `Missing player names for positions: ${missingNames.join(", ")}`,
      });
    }

    // Save user with updated balances (already updated in two-tier logic above)
    if (!isFreeMachatch && totalAmount > 0) {
      await user.save();
      
      // Create transaction record for match booking
      try {
        const Transaction = require('../models/Transaction');
        const transactionId = `BOOKING_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await Transaction.create({
          userId: user._id,
          type: 'BOOKING',
          amount: totalAmount,
          description: `Match booking - ${slot.matchTitle || slot.slotType} - ${positionsCount} position${positionsCount > 1 ? 's' : ''}`,
          transactionId: transactionId,
          status: 'SUCCESS',
          paymentMethod: 'WALLET',
          balanceAfter: user.wallet + user.winAmount, // Use total balance
          metadata: {
            slotId: slot._id.toString(),
            gameId: slot._id.toString(),
            referenceId: transactionId
          }
        });
      } catch (error) {
        console.error('Error creating booking transaction:', error);
        // Don't fail the booking if transaction creation fails
      }
      
      // Process referral bonus for first paid match
      await processReferralFirstPaidBonus(user, slot);
      
      // Emit wallet update via socket.io (send total balance)
      try {
        const { emitWalletUpdate } = require('../websocket');
        emitWalletUpdate(user._id.toString(), user.wallet + user.winAmount);
      } catch (e) {
        console.error('Socket emit error:', e);
      }
    }

    // Decrease remaining slot count by number of positions booked
    slot.remainingBookings -= positionsCount;
    await slot.save();

    // --- Check if user already has a booking for this slot ---
    let userBooking = await Booking.findOne({ slot: slotId, user: user._id });
    if (userBooking) {
      // For free matches, do not allow adding more positions once a booking exists
      if (isFreeMachatch) {
        return res.status(400).json({
          msg: 'Free match: only one position per user is allowed'
        });
      }
      // Merge new positions and player names into existing booking
      // selectedPositions and playerNames are Map or object
      let existingPositions = userBooking.selectedPositions instanceof Map ? Object.fromEntries(userBooking.selectedPositions) : (userBooking.selectedPositions || {});
      let existingPlayerNames = userBooking.playerNames instanceof Map ? Object.fromEntries(userBooking.playerNames) : (userBooking.playerNames || {});

      // Merge positions: for each team, merge arrays
      Object.entries(selectedPositions).forEach(([team, positions]) => {
        if (!existingPositions[team]) existingPositions[team] = [];
        // Only add positions that are not already present
        positions.forEach(pos => {
          if (!existingPositions[team].includes(pos)) {
            existingPositions[team].push(pos);
          }
        });
      });

      // Merge player names
      Object.entries(playerNames).forEach(([key, value]) => {
        existingPlayerNames[key] = value;
      });

      // Merge playerIndex
      let mergedPlayerIndex = Array.isArray(userBooking.playerIndex) ? [...userBooking.playerIndex] : [];
      if (Array.isArray(playerIndex)) {
        playerIndex.forEach(idx => {
          if (!mergedPlayerIndex.includes(idx)) mergedPlayerIndex.push(idx);
        });
      }

      // Update totalAmount
      userBooking.totalAmount += totalAmount;
      userBooking.selectedPositions = new Map(Object.entries(existingPositions));
      userBooking.playerNames = new Map(Object.entries(existingPlayerNames));
      userBooking.playerIndex = mergedPlayerIndex;
      await userBooking.save();

      // Create transaction record for additional positions booking
      if (!isFreeMachatch && totalAmount > 0) {
        try {
          const Transaction = require('../models/Transaction');
          const transactionId = `BOOKING_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          await Transaction.create({
            userId: user._id,
            type: 'BOOKING',
            amount: totalAmount,
            description: `Additional positions - ${slot.matchTitle || slot.slotType} - ${positionsCount} position${positionsCount > 1 ? 's' : ''}`,
            transactionId: transactionId,
            status: 'SUCCESS',
            paymentMethod: 'WALLET',
            balanceAfter: user.wallet,
            metadata: {
              slotId: slot._id.toString(),
              gameId: slot._id.toString(),
              referenceId: transactionId
            }
          });
        } catch (error) {
          console.error('Error creating additional booking transaction:', error);
        }
      }

      // Process referral bonus for first paid match (in case this is the first paid match)
      if (totalAmount > 0) {
        await processReferralFirstPaidBonus(user, slot);
      }

      await userBooking.populate(
        "slot",
        "slotType matchTime totalWinningPrice streamLink"
      );

      return res.status(200).json({
        msg: "Booking updated successfully (positions added)",
        booking: {
          ...userBooking.toObject(),
          selectedPositions: Object.fromEntries(userBooking.selectedPositions),
          playerNames: Object.fromEntries(userBooking.playerNames),
        },
        remainingBalance: user.wallet,
      });
    } else {
      // Create new booking as usual
      const booking = new Booking({
        user: user._id,
        userId: userId, // Add the userId field
        slot: slot._id,
        slotType: normalizeSlotType(slot.slotType),
        selectedPositions: new Map(Object.entries(selectedPositions)),
        playerNames: new Map(Object.entries(playerNames)),
        totalAmount,
        playerIndex: playerIndex || [], // Use provided playerIndex or default to empty array
        entryFee: slot.entryFee,
        status: "confirmed",
      });
      await booking.save();

      await booking.populate(
        "slot",
        "slotType matchTime totalWinningPrice streamLink"
      );

      return res.status(201).json({
        msg: "Booking created successfully",
        booking: {
          ...booking.toObject(),
          selectedPositions: Object.fromEntries(booking.selectedPositions),
          playerNames: Object.fromEntries(booking.playerNames),
        },
        remainingBalance: user.wallet,
      });
    }
  } catch (err) {
    console.error("Booking creation failed:", err);
    res.status(500).json({ error: err.message });
  }
};
// Get user's bookings
// exports.getBookings = async (req, res) => {
//   try {
//     const bookings = await Booking.find({ user: req.user.userId })
//       .populate(
//         "slot",
//         "slotType matchTime totalWinningPrice perKill matchTitle tournamentName mapName specialRules maxPlayers streamLink"
//       )
//       .sort({ createdAt: -1 });

//     // Convert Map objects to regular objects for JSON response
//     const formattedBookings = bookings.map((booking) => {
//       const bookingObj = booking.toObject();

//       let selectedPositions = {};
//       let playerNames = {};

//       // Handle selectedPositions Map safely
//       if (booking.selectedPositions) {
//         if (booking.selectedPositions instanceof Map) {
//           selectedPositions = Object.fromEntries(booking.selectedPositions);
//         } else if (typeof booking.selectedPositions === "object") {
//           selectedPositions = booking.selectedPositions;
//         }
//       }

//       // Handle playerNames Map safely
//       if (booking.playerNames) {
//         if (booking.playerNames instanceof Map) {
//           playerNames = Object.fromEntries(booking.playerNames);
//         } else if (typeof booking.playerNames === "object") {
//           playerNames = booking.playerNames;
//         }
//       }

//       return {
//         ...bookingObj,
//         selectedPositions,
//         playerNames,
//       };
//     });

//     res.json({ bookings: formattedBookings });
//   } catch (err) {
//     console.error("Error fetching bookings:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// Get user bookings with user details
exports.getMyBookingsWithUser = async (req, res) => {
  try {
    const userId = req.user.userId;

    const bookings = await Booking.find({ user: userId })
      .populate(
        "slot",
        "slotType matchTime totalWinningPrice perKill matchTitle tournamentName mapName specialRules maxPlayers streamLink"
      )
      .sort({ createdAt: -1 });

    const user = await User.findById(userId).select("username email wallet");

    // Convert Map objects to regular objects for JSON response
    const formattedBookings = bookings.map((booking) => {
      const bookingObj = booking.toObject();

      let selectedPositions = {};
      let playerNames = {};

      // Handle selectedPositions Map safely
      if (booking.selectedPositions) {
        if (booking.selectedPositions instanceof Map) {
          selectedPositions = Object.fromEntries(booking.selectedPositions);
        } else if (typeof booking.selectedPositions === "object") {
          selectedPositions = booking.selectedPositions;
        }
      }

      // Handle playerNames Map safely
      if (booking.playerNames) {
        if (booking.playerNames instanceof Map) {
          playerNames = Object.fromEntries(booking.playerNames);
        } else if (typeof booking.playerNames === "object") {
          playerNames = booking.playerNames;
        }
      }

      return {
        ...bookingObj,
        selectedPositions,
        playerNames,
      };
    });

    res.status(200).json({
      user,
      bookings: formattedBookings,
    });
  } catch (err) {
    console.error("Error fetching user bookings:", err);
    res.status(500).json({ error: err.message });
  }
};

// Legacy booking function (keeping for backward compatibility)
// exports.bookSlot = async (req, res) => {
//   try {
//     const { slotId, slotType, fullName, playerNames } = req.body;

//     const user = await User.findById(req.user.userId);
//     if (!user) return res.status(404).json({ msg: 'User not found' });

//     const slot = await Slot.findById(slotId);
//     if (!slot) return res.status(404).json({ msg: 'Slot not found' });

//     // Check wallet balance
//     if (user.wallet < slot.entryFee) {
//       return res.status(400).json({ msg: 'Insufficient wallet balance' });
//     }

//     // Deduct wallet
//     user.wallet -= slot.entryFee;
//     await user.save();

//     // Create legacy booking format
//     const selectedPositions = new Map([['Team 1', ['A']]]);
//     const playerNamesMap = new Map([[`Team 1-A`, fullName]]);

//     const booking = new Booking({
//       user: user._id,
//       slot: slot._id,
//       slotType: slot.slotType.toLowerCase(),
//       selectedPositions,
//       playerNames: playerNamesMap,
//       totalAmount: slot.entryFee,
//       entryFee: slot.entryFee
//     });

//     await booking.save();

//     res.status(201).json({ msg: 'Slot booked successfully', booking });

//   } catch (err) {
//     console.error('Legacy booking failed:', err);
//     res.status(500).json({ error: err.message });
//   }
// };

// Get all bookings for a specific slot
exports.getSlotBookings = async (req, res) => {
  try {
    const { slotId } = req.params;
  // log removed

    // Find all bookings for this slot (using 'slot' field, not 'slotId')
    // Populate user so frontend can access phone, name, etc.
    const bookings = await Booking.find({ slot: slotId })
      .select("selectedPositions playerNames createdAt playerIndex user")
      .populate('user', 'name email phone freeFireUsername')
      .lean();

  // log removed

    // Convert Map objects to regular objects for JSON response
    const formattedBookings = bookings.map((booking) => {
      let selectedPositions = {};
      let playerNames = {};

      // Handle selectedPositions Map - properly convert to object
      if (booking.selectedPositions) {
        if (booking.selectedPositions instanceof Map) {
          selectedPositions = Object.fromEntries(booking.selectedPositions);
        } else if (typeof booking.selectedPositions === "object") {
          // MongoDB .lean() returns Map as plain object
          selectedPositions = booking.selectedPositions;
        }
      }

      // Handle playerNames Map - properly convert to object
      if (booking.playerNames) {
        if (booking.playerNames instanceof Map) {
          playerNames = Object.fromEntries(booking.playerNames);
        } else if (typeof booking.playerNames === "object") {
          // MongoDB .lean() returns Map as plain object
          playerNames = booking.playerNames;
        }
      }

      return {
        ...booking,
        selectedPositions,
        playerNames,
      };
    });

    // Collect all playerIndex arrays from bookings
    const allPlayerIndexes = [
      ...new Set(
        bookings
          .map((b) => (Array.isArray(b.playerIndex) ? b.playerIndex : []))
          .flat()
      ),
    ];

    // Return a proper API response with status, msg, playersindex, and data
    res.status(200).json({
      status: true,
      msg: "Slot bookings fetched successfully",
      playersindex: allPlayerIndexes,
      data: formattedBookings,
    });
  } catch (err) {
    console.error("Error fetching slot bookings:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateWinnerStats = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { kills, position, winnings } = req.body;

    if (!bookingId) {
      return res.status(400).json({ msg: "Booking ID is required" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ msg: "Booking not found" });
    }

    // Update or create the gameStats field
    booking.gameStats = {
      kills: kills ?? booking.gameStats?.kills ?? 0,
      position: position ?? booking.gameStats?.position ?? 0,
      winnings: winnings ?? booking.gameStats?.winnings ?? 0,
    };

    await booking.save();

    res.json({ success: true, msg: "Winner stats updated", booking });
  } catch (err) {
    console.error("Error updating winner stats:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

exports.getWinnersBySlot = async (req, res) => {
  try {
    const { slotId } = req.params;
    const bookings = await Booking.find({ slot: slotId })
      .populate('user', 'name email freeFireUsername')
      .lean();

    res.json({
      success: true,
      winners: bookings.map(b => ({
        _id: b._id,
        user: b.user,
        playerNames: b.playerNames,
        kills: b.gameStats?.kills || 0,
        position: b.gameStats?.position || 0,
        winnings: b.gameStats?.winnings || 0,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: "Failed to fetch winners", error: err.message });
  }
};
