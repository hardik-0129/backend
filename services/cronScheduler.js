const cron = require('node-cron');
const nftService = require('./nftService');

class CronScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Start all scheduled cron jobs
   */
  start() {
    if (this.isRunning) {
      console.log('Cron scheduler is already running');
      return;
    }

    console.log('Starting cron scheduler...');
    this.isRunning = true;

    // Schedule NFT count update every 24 hours at 2:00 AM
    this.scheduleNFTUpdate();
    
    // You can add more cron jobs here
    // this.scheduleOtherJobs();

    console.log('Cron scheduler started successfully');
  }

  /**
   * Stop all scheduled cron jobs
   */
  stop() {
    if (!this.isRunning) {
      console.log('Cron scheduler is not running');
      return;
    }

    console.log('Stopping cron scheduler...');
    
    this.jobs.forEach((job, name) => {
      job.destroy();
      console.log(`Stopped cron job: ${name}`);
    });
    
    this.jobs.clear();
    this.isRunning = false;
    console.log('Cron scheduler stopped successfully');
  }

  /**
   * Schedule NFT count update job
   */
  scheduleNFTUpdate() {
    // Run every day at 2:00 AM
    // Format: second minute hour day month dayOfWeek
    const cronExpression = '0 0 2 * * *'; // Every day at 2:00 AM
    
    const job = cron.schedule(cronExpression, async () => {
      console.log('Starting scheduled NFT count update...');
      const startTime = new Date();
      
      try {
        const result = await nftService.updateAllUsersNFTCount();
        const endTime = new Date();
        const duration = endTime - startTime;
        
        console.log(`Scheduled NFT count update completed in ${duration}ms:`, {
          success: result.success,
          totalUsers: result.totalUsers,
          updatedUsers: result.updatedUsers,
          failedUsers: result.failedUsers,
          unchangedUsers: result.unchangedUsers
        });

        // Log any errors for failed updates
        if (result.failedUsers > 0) {
          const failedResults = result.results.filter(r => !r.success);
          console.error('Failed NFT count updates:', failedResults);
        }

      } catch (error) {
        console.error('Error in scheduled NFT count update:', error.message);
      }
    }, {
      scheduled: false, // Don't start immediately
      timezone: "UTC" // You can change this to your preferred timezone
    });

    this.jobs.set('nftUpdate', job);
    job.start();
    
    console.log('NFT count update job scheduled to run daily at 2:00 AM UTC');
  }

  /**
   * Manually trigger NFT count update
   */
  async triggerNFTUpdate() {
    console.log('Manually triggering NFT count update...');
    const startTime = new Date();
    
    try {
      const result = await nftService.updateAllUsersNFTCount();
      const endTime = new Date();
      const duration = endTime - startTime;
      
      console.log(`Manual NFT count update completed in ${duration}ms:`, {
        success: result.success,
        totalUsers: result.totalUsers,
        updatedUsers: result.updatedUsers,
        failedUsers: result.failedUsers,
        unchangedUsers: result.unchangedUsers
      });

      return result;

    } catch (error) {
      console.error('Error in manual NFT count update:', error.message);
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
   * Get status of all cron jobs
   */
  getStatus() {
    const status = {
      isRunning: this.isRunning,
      jobs: {}
    };

    this.jobs.forEach((job, name) => {
      status.jobs[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    });

    return status;
  }

  /**
   * Get next execution time for a specific job
   */
  getNextExecution(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      return null;
    }

    // This is a simplified version - you might need to implement
    // more sophisticated next execution time calculation
    return 'Next execution time calculation not implemented';
  }
}

// Create singleton instance
const cronScheduler = new CronScheduler();

module.exports = cronScheduler;
