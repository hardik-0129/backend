const nftService = require('../services/nftService');
const cronScheduler = require('../services/cronScheduler');
const axios = require('axios');
// Static Alpha Lion contract address
const CONTRACT_ADDRESS = '0x8420B95bEac664b6E8E89978C3fDCaA1A71c8350';

/**
 * Manually trigger NFT count update for all users
 * POST /api/nft/update-all
 */
exports.updateAllNFTCounts = async (req, res) => {
  try {
    console.log('Manual NFT count update requested');
    
    const result = await cronScheduler.triggerNFTUpdate();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'NFT count update completed successfully',
        data: {
          totalUsers: result.totalUsers,
          updatedUsers: result.updatedUsers,
          failedUsers: result.failedUsers,
          unchangedUsers: result.unchangedUsers,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'NFT count update failed',
        error: result.message
      });
    }

  } catch (error) {
    console.error('Error in updateAllNFTCounts:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * GET /api/nft/nfts?wallet=0x...&contract=0x...&page=1&limit=12
 * Fetch NFTs for a wallet from Dune Collectibles API, filter by contract,
 * resolve tokenURI metadata (image_url), and paginate.
 */
exports.getWalletNfts = async (req, res) => {
  const { wallet, page = 1, limit = 100 } = req.query;

  if (!wallet) {
    return res.status(400).json({ error: "Wallet parameter is required" });
  }

  // Validate pagination parameters
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 100)); // Max 100 items per page

  try {
    const APECHAIN_CHAIN_ID = 33139;
    const SIM_API_KEY = "sim_IFLLgN1GFiKDE8kFovObq6bCrvP81gQy";

    if (!SIM_API_KEY) {
      return res.status(500).json({ error: "SIM_API_KEY env not set" });
    }

    const chainQuery = APECHAIN_CHAIN_ID ? `?chain_ids=${encodeURIComponent(APECHAIN_CHAIN_ID)}` : '';
    const url = `https://api.sim.dune.com/v1/evm/collectibles/${wallet}${chainQuery}`;

    const response = await axios.get(url, { 
      headers: { "X-Sim-Api-Key": SIM_API_KEY },
      timeout: 30000,
      maxRedirects: 5
    });
    
    const allNfts = response.data.entries || [];
    
    const target = CONTRACT_ADDRESS.toLowerCase();
    const filteredNfts = allNfts.filter(
      (nft) => String(nft?.contract_address || '').toLowerCase() === target
    );

    // Best-effort image extraction from provided metadata
    const nftsWithMetadata = filteredNfts.map((nft) => {
      const rawImage = nft?.metadata?.image;
      const image_url = typeof rawImage === 'string'
        ? (rawImage.startsWith('ipfs://') ? rawImage.replace('ipfs://', 'https://ipfs.io/ipfs/') : rawImage)
        : null;
      return { ...nft, metadata: { ...(nft.metadata || {}), image_url } };
    });

    // Apply pagination
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedNfts = nftsWithMetadata.slice(startIndex, endIndex);
    const totalPages = Math.ceil(nftsWithMetadata.length / limitNum);

    res.json({ 
      wallet, 
      contract: CONTRACT_ADDRESS, 
      total: nftsWithMetadata.length, 
      nfts: paginatedNfts,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    });
  } catch (err) {
    // Send appropriate error response
    if (err.code === 'ECONNABORTED') {
      res.status(408).json({ error: "Request timeout", details: "The request took too long to complete" });
    } else if (err.code === 'ENOTFOUND') {
      res.status(503).json({ error: "Service unavailable", details: "Unable to reach the external API" });
    } else {
      res.status(500).json({ error: err.message, details: err.response?.data });
    }
  }
};
