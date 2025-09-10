const Winner = require('../models/Winner');

// Create Winner
exports.createWinner = async (req, res) => {
  try {
    // Ensure slotId is set
    let slotId = req.body.slotId || req.query.slotId || req.params.slotId;
  // log removed
    if (!slotId) {
      return res.status(400).json({ error: 'slotId is required for winner creation.' });
    }
    // Ensure userId is included if provided
    const winnerData = { ...req.body, slotId };
    if (req.body.userId) {
      winnerData.userId = req.body.userId;
    }
    const winner = await Winner.create(winnerData);
  // log removed
    res.status(201).json(winner);
  } catch (err) {
    console.error('[WINNER][CREATE][ERROR]', err);
    res.status(400).json({ error: err.message });
  }
};

// Get All Winners
exports.getWinners = async (req, res) => {
  try {
    const filter = {};
    if (req.query.slotId) {
      // Convert to ObjectId for correct matching
      const mongoose = require('mongoose');
      filter.slotId = new mongoose.Types.ObjectId(req.query.slotId);
    }
  // log removed
    // Sort by rank ascending (rank 1 at the top)
    const winners = await Winner.find(filter).sort({ rank: 1 });
    // Remove slotId from each winner object in the response
    const winnersWithoutSlot = winners.map(w => {
      const obj = w.toObject();
      delete obj.slotId;
      return obj;
    });
    res.json(winnersWithoutSlot);
  } catch (err) {
    console.error('[WINNER][QUERY][ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

// Get Winner by ID
exports.getWinner = async (req, res) => {
  try {
    const winner = await Winner.findById(req.params.id).populate('slotId');
    if (!winner) return res.status(404).json({ error: 'Not found' });
    res.json(winner);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Winner
exports.updateWinner = async (req, res) => {
  try {
    const winner = await Winner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!winner) return res.status(404).json({ error: 'Not found' });
    res.json(winner);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete Winner
exports.deleteWinner = async (req, res) => {
  try {
    const winner = await Winner.findByIdAndDelete(req.params.id);
    if (!winner) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
