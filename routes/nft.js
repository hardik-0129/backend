const express = require('express');
const router = express.Router();
const nftController = require('../controllers/nftController');
const adminController = require('../controllers/adminController');
const authentication = require('../middleware/adminAuth');

// All NFT routes require authentication
router.use(authentication);

// Manual NFT count update for all users
router.post('/update-all', nftController.updateAllNFTCounts);

// Wallet NFTs (Dune -> filter -> metadata -> paginate)
router.get('/nfts', nftController.getWalletNfts);

// Distribute funds to NFT holders
router.post('/distribute-funds', adminController.distributeFunds);

module.exports = router;
