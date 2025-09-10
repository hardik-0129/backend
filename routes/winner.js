const express = require('express');
const router = express.Router();
const winnerController = require('../controllers/winnerController');

// Create Winner
router.post('/', winnerController.createWinner);
// Get All Winners
router.get('/', winnerController.getWinners);
// Get Winner by ID
router.get('/:id', winnerController.getWinner);
// Update Winner
router.put('/:id', winnerController.updateWinner);
// Delete Winner
router.delete('/:id', winnerController.deleteWinner);

module.exports = router;
