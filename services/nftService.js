const User = require('../models/User');
const axios = require('axios');

class NFTService {
  constructor() {
    // Configuration for Magic Eden API via r.jina.ai proxy
    this.apiConfig = {
      timeout: 15000 // Increased timeout for Magic Eden API
    };
  }

  /**
   * Fetch NFT count for a specific wallet address using blockchain RPC calls (same as frontend)
   * @param {string} walletAddress - The wallet address to check
   * @returns {Promise<number>} - The number of NFTs owned
   */
  async fetchNFTCount(walletAddress) {
    try {
      if (!walletAddress || !this.isValidWalletAddress(walletAddress)) {
        console.log(`Invalid wallet address: ${walletAddress}`);
        return 0;
      }

      // Use the same blockchain RPC approach as the frontend
      const CONTRACT_ADDRESS = '0x8420B95bEac664b6E8E89978C3fDCaA1A71c8350';
      const RPC_URLS = [
        'https://apechain.drpc.org',
        'https://33139.rpc.thirdweb.com',
        'https://rpc.apechain.com'
      ];

      console.log(`Fetching Alpha Lion NFT count for ${walletAddress} from blockchain...`);
      
      // Get the balance using the same method as frontend
      const balanceHex = await this.ethCall(CONTRACT_ADDRESS, this.encodeBalanceOf(walletAddress));
      const nftCount = parseInt(this.hexToUintString(balanceHex));

      console.log(`Fetched Alpha Lion NFT count for ${walletAddress}: ${nftCount}`);
      return nftCount;

    } catch (error) {
      console.error(`Error fetching NFT count for ${walletAddress}:`, error.message);
      
      // Return 0 on error to avoid breaking the update process
      return 0;
    }
  }

  /**
   * Convert hex string to uint string (same as frontend)
   */
  hexToUintString(hex) {
    try {
      const s = (hex && hex !== '0x') ? hex : '0x0';
      return BigInt(s).toString();
    } catch {
      const clean = (hex || '0x0').replace(/^0x/, '');
      return String(parseInt(clean || '0', 16) || 0);
    }
  }

  /**
   * Encode balanceOf function call (same as frontend)
   */
  encodeBalanceOf(addr) {
    const selector = '0x70a08231';
    const padded = addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    return selector + padded;
  }

  /**
   * Make Ethereum RPC call (same as frontend)
   */
  async ethCall(to, data) {
    const body = { 
      jsonrpc: '2.0', 
      id: Date.now(), 
      method: 'eth_call', 
      params: [{ to, data }, 'latest'] 
    };
    
    let lastErr;
    for (const url of this.getRpcUrls()) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        
        const response = await axios.post(url, body, {
          headers: { 'content-type': 'application/json' },
          timeout: this.apiConfig.timeout,
          signal: controller.signal
        });
        
        clearTimeout(timer);
        
        if (response.data?.result) {
          return response.data.result;
        }
        if (response.data?.error) {
          lastErr = new Error(response.data.error.message || 'RPC error');
          continue;
        }
        lastErr = new Error('Empty RPC response');
      } catch (e) {
        lastErr = e;
        continue;
      }
    }
    throw lastErr || new Error('All RPCs failed');
  }

  /**
   * Get RPC URLs (same as frontend)
   */
  getRpcUrls() {
    return [
      'https://apechain.drpc.org',
      'https://33139.rpc.thirdweb.com',
      'https://rpc.apechain.com'
    ];
  }

  /**
   * Update NFT count for a single user
   * @param {Object} user - The user object
   * @returns {Promise<Object>} - Update result
   */
  async updateUserNFTCount(user) {
    try {
      const walletAddress = user.alphaRole?.walletAddress;
      
      if (!walletAddress) {
        console.log(`No wallet address found for user ${user._id}`);
        return {
          userId: user._id,
          success: false,
          message: 'No wallet address found',
          nftCount: 0
        };
      }

      const newNFTCount = await this.fetchNFTCount(walletAddress);
      const oldNFTCount = user.alphaRole?.nftCount || 0;

      // Check if the new count seems reasonable compared to the old count
      let finalNFTCount = newNFTCount;
      
      // Validate the new count is reasonable for Alpha Lion NFTs
      if (newNFTCount > 1000) {
        console.log(`Warning: New NFT count (${newNFTCount}) is unreasonably high for Alpha Lion collection. Keeping old count (${oldNFTCount}).`);
        finalNFTCount = oldNFTCount;
      }
      // If old count is unreasonably high (likely from parsing error), always use new count
      else if (oldNFTCount > 1000) {
        console.log(`Warning: Old NFT count (${oldNFTCount}) is unreasonably high, likely from parsing error. Using new blockchain count (${newNFTCount}).`);
        finalNFTCount = newNFTCount;
      }
      // If new count is significantly lower than old count, it might be a parsing error
      // Keep the old count if new count is less than 50% of old count and old count is reasonable
      else if (oldNFTCount > 10 && oldNFTCount <= 1000 && newNFTCount < (oldNFTCount * 0.5)) {
        console.log(`Warning: New NFT count (${newNFTCount}) is significantly lower than old count (${oldNFTCount}). Keeping old count.`);
        finalNFTCount = oldNFTCount;
      }

      // Only update if the count has changed
      if (finalNFTCount !== oldNFTCount) {
        // Calculate new alpha role
        const calculatedRole = User.calculateAlphaRole(finalNFTCount);

        // Update user's alpha role
        user.alphaRole = {
          ...user.alphaRole,
          roleName: calculatedRole.roleName,
          nftCount: finalNFTCount,
          isVerified: true,
          verificationDate: new Date()
        };

        await user.save();

        console.log(`Updated NFT count for user ${user._id}: ${oldNFTCount} -> ${finalNFTCount}`);
        
        return {
          userId: user._id,
          success: true,
          message: 'NFT count updated successfully',
          oldNFTCount,
          newNFTCount: finalNFTCount,
          roleName: calculatedRole.roleName
        };
      } else {
        console.log(`NFT count unchanged for user ${user._id}: ${oldNFTCount}`);
        return {
          userId: user._id,
          success: true,
          message: 'NFT count unchanged',
          nftCount: oldNFTCount
        };
      }

    } catch (error) {
      console.error(`Error updating NFT count for user ${user._id}:`, error.message);
      return {
        userId: user._id,
        success: false,
        message: error.message,
        nftCount: 0
      };
    }
  }

  /**
   * Update NFT counts for all users with wallet addresses
   * @returns {Promise<Object>} - Summary of update results
   */
  async updateAllUsersNFTCount() {
    try {
      console.log('Starting NFT count update for all users...');
      
      // Find all users with wallet addresses
      const users = await User.find({
        'alphaRole.walletAddress': { $exists: true, $ne: null, $ne: '' }
      });

      if (users.length === 0) {
        console.log('No users with wallet addresses found');
        return {
          success: true,
          message: 'No users with wallet addresses found',
          totalUsers: 0,
          updatedUsers: 0,
          failedUsers: 0,
          results: []
        };
      }

      console.log(`Found ${users.length} users with wallet addresses`);

      const results = [];
      let updatedUsers = 0;
      let failedUsers = 0;

      // Process users in batches to avoid overwhelming the API
      const batchSize = 5; // Adjust based on your API rate limits
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        
        // Process batch concurrently
        const batchPromises = batch.map(user => this.updateUserNFTCount(user));
        const batchResults = await Promise.all(batchPromises);
        
        results.push(...batchResults);
        
        // Count results
        batchResults.forEach(result => {
          if (result.success && result.newNFTCount !== undefined) {
            updatedUsers++;
          } else if (!result.success) {
            failedUsers++;
          }
        });

        // Add delay between batches to respect API rate limits
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      const summary = {
        success: true,
        message: 'NFT count update completed',
        totalUsers: users.length,
        updatedUsers,
        failedUsers,
        unchangedUsers: users.length - updatedUsers - failedUsers,
        results
      };

      console.log('NFT count update completed:', summary);
      return summary;

    } catch (error) {
      console.error('Error updating NFT counts for all users:', error.message);
      return {
        success: false,
        message: error.message,
        totalUsers: 0,
        updatedUsers: 0,
        failedUsers: 0,
        results: []
      };
    }
  }

  /**
   * Validate wallet address format
   * @param {string} address - Wallet address to validate
   * @returns {boolean} - Whether the address is valid
   */
  isValidWalletAddress(address) {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Get NFT count update statistics
   * @returns {Promise<Object>} - Statistics about NFT counts
   */
  async getNFTStatistics() {
    try {
      const stats = await User.aggregate([
        {
          $match: {
            'alphaRole.walletAddress': { $exists: true, $ne: null, $ne: '' }
          }
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalNFTs: { $sum: '$alphaRole.nftCount' },
            averageNFTs: { $avg: '$alphaRole.nftCount' },
            maxNFTs: { $max: '$alphaRole.nftCount' },
            minNFTs: { $min: '$alphaRole.nftCount' }
          }
        }
      ]);

      const roleStats = await User.aggregate([
        {
          $match: {
            'alphaRole.walletAddress': { $exists: true, $ne: null, $ne: '' },
            'alphaRole.roleName': { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$alphaRole.roleName',
            count: { $sum: 1 },
            totalNFTs: { $sum: '$alphaRole.nftCount' }
          }
        },
        {
          $sort: { totalNFTs: -1 }
        }
      ]);

      return {
        success: true,
        overall: stats[0] || {
          totalUsers: 0,
          totalNFTs: 0,
          averageNFTs: 0,
          maxNFTs: 0,
          minNFTs: 0
        },
        roleDistribution: roleStats
      };

    } catch (error) {
      console.error('Error getting NFT statistics:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new NFTService();
