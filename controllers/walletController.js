
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const crypto = require('crypto');
const axios = require('axios');
const fetch = require('node-fetch');

// TranzUPI Configuration
const TRANZUPI_CONFIG = {
  base_url: process.env.TRANZUPI_BASE_URL || 'https://api.tranzupi.com/v1',
  api_key: process.env.TRANZUPI_API_KEY,
  merchant_id: process.env.TRANZUPI_MERCHANT_ID,
  secret_key: process.env.TRANZUPI_SECRET_KEY
};

// Check TranzUPI Order Status
exports.checkOrderStatus = async (req, res) => {
  try {
    const { order_id, userId } = req.body;
    const user_token = process.env.TRANZUPI_API_KEY;
    if (!user_token || !order_id) {
      return res.status(400).json({ message: 'user_token (from env) and order_id are required' });
    }

    const apiUrl = 'https://tranzupi.com/api/check-order-status';
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('user_token', user_token);
    formData.append('order_id', order_id);

    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (data.status === 'COMPLETED') {
      
      let user = null;
      if (userId) {
        user = await User.findById(userId);
      }
      if (user) {

        // Only credit if not already credited for this order
        const existing = await Transaction.findOne({ transactionId: order_id, userId: user._id });
        if (!existing) {
          user.wallet += parseFloat(data.result.amount);
          await user.save();
          await createTransaction({
            userId: user._id,
            type: 'CREDIT',
            amount: parseFloat(data.result.amount),
            description: `TranzUPI payment - Order: ${order_id}`,
            transactionId: order_id,
            status: 'SUCCESS',
            paymentMethod: 'TRANZUPI',
            balanceAfter: user.wallet + user.winAmount, // Use total balance
            metadata: { order_id }
          });

          // Emit wallet update via websocket
          try {
            const { emitWalletUpdate } = require('../websocket');
            emitWalletUpdate(user._id.toString(), user.wallet + user.winAmount); // Emit total balance
          } catch (e) { console.error('Socket emit error:', e); }
        }
      }
      return res.json({ success: true, result: data.result });
    } else {
      return res.status(400).json({ success: false, message: data.message });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.tranzupiWebhook = async (req, res) => {
  try {
    console.log(req.body);
    const body = req.body || {};
    const orderId = body.order_id || body.orderId || body.transaction_id || body.txn_id;
    const amount = parseFloat(body.amount || body.txn_amount || 0);
    const remark1 = body.remark1 || body.meta || '';
console.log(orderId, amount, remark1);
    if (!orderId || !amount) {
      return res.status(400).json({ success: false, error: 'order_id/transaction_id and amount are required' });
    }

    // Idempotency check
    const existing = await Transaction.findOne({ transactionId: orderId });
    if (existing) {
      return res.json({ success: true, message: 'Already processed' });
    }

    // Resolve user
    let user = null;
    if (remark1) {
      try { user = await User.findById(remark1); } catch (_) {}
    }
    if (!user && typeof orderId === 'string' && orderId.includes('_')) {
      const parts = orderId.split('_');
      if (parts.length >= 3) {
        const idPart = parts[1];
        try {
          user = await User.findOne({ _id: { $regex: new RegExp(idPart + '$') } });
        } catch (_) {}
      }
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found for this payment' });
    }

    // Credit wallet
    user.wallet += amount;
    await user.save();

    await createTransaction({
      userId: user._id,
      type: 'CREDIT',
      amount: amount,
      description: `TranzUPI payment - Order: ${orderId}`,
      transactionId: orderId,
      status: 'SUCCESS',
      paymentMethod: 'TRANZUPI',
      balanceAfter: user.wallet,
      metadata: { orderId, remark1 }
    });

    // Emit wallet update via websocket
    try {
      const { emitWalletUpdate } = require('../websocket');
      emitWalletUpdate(user._id.toString(), user.wallet + user.winAmount); // Emit total balance
    } catch (e) { console.error('Socket emit error:', e); }

    return res.json({ success: true });

  } catch (err) {
    console.error('TranzUPI Webhook Error:', err);
    return res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
};

// Helper function to create transaction record
const createTransaction = async (data) => {
  try {
    const transaction = new Transaction({
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      description: data.description,
      transactionId: data.transactionId,
      status: data.status || 'SUCCESS',
      paymentMethod: data.paymentMethod || 'SYSTEM',
      balanceAfter: data.balanceAfter,
      metadata: data.metadata || {}
    });
    
    await transaction.save();
    return transaction;
  } catch (error) {
    console.error('Error creating transaction record:', error);
    // Don't throw error to avoid breaking the main operation
    return null;
  }
};


exports.verify = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      amount
    } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment information'
      });
    }

    // Verify the payment signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }

    // Update user's wallet
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify order exists and is valid
    try {
      const order = await razorpay.orders.fetch(razorpay_order_id);
      if (order.status !== 'paid') {
        return res.status(400).json({
          success: false,
          error: 'Order is not paid'
        });
      }
    } catch (err) {
      console.error('Error fetching order:', err);
      return res.status(400).json({
        success: false,
        error: 'Invalid order'
      });
    }

    // Add the funds to wallet
    const previousBalance = user.wallet;
    user.wallet += parseFloat(amount);
    // Track cumulative winnings
    user.winAmount = (parseFloat(user.winAmount) || 0) + parseFloat(amount);
    await user.save();

    // Create transaction record
    await createTransaction({
      userId: user._id,
      type: 'CREDIT',
      amount: parseFloat(amount),
      description: `Razorpay payment - Order: ${razorpay_order_id}`,
      transactionId: razorpay_payment_id,
      status: 'SUCCESS',
      paymentMethod: 'RAZORPAY',
      balanceAfter: user.wallet,
      metadata: {
        orderId: razorpay_order_id,
        signature: razorpay_signature
      }
    });

    res.status(200).json({
      success: true,
      message: 'Payment verified and funds added successfully',
      wallet: user.wallet
    });

  } catch (err) {
    console.error('Verify Payment Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getBalance = async (req, res) => {

  try {
    const { id } = req.query;
    if (!id) {
      return res.status(401).json({
        status: false,
        message: 'Please provide a user ID'
        });
      }


    const user = await User.findById(id).select('wallet winAmount');
    if (!user) {
      return res.status(404).json({ 
        status: false,
        message: 'User not found' 
      });
    }


    // Total winnings from Winner collection
    const winAgg = await require('../models/Winner').aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: null, total: { $sum: '$winningPrice' } } }
    ]);
    const totalWinsFromWinners = winAgg[0]?.total || 0;

    // Include winning credits recorded in Transactions as well
    const winAggTx = await Transaction.aggregate([
      { $match: {
          userId: user._id,
          status: { $in: ['SUCCESS', 'ADMIN_APPROVED'] },
          $or: [
            { type: 'WIN' },
            { type: 'CREDIT', description: { $regex: /(winning|win\s+credited)/i } },
            { type: 'CREDIT', 'metadata.category': 'WIN' }
          ]
        }
      },
      { $group: { _id: null, total: { $sum: { $convert: { input: '$amount', to: 'double', onError: 0, onNull: 0 } } } } }
    ]);
    const totalWinsFromTx = winAggTx[0]?.total || 0;
    const totalWins = (totalWinsFromWinners || 0) + (totalWinsFromTx || 0);

    // Total payouts: sum of all successful DEBIT/WITHDRAW
    const payoutsAgg = await Transaction.aggregate([
      { $match: { userId: user._id, type: { $in: ['DEBIT', 'WITHDRAW'] }, status: { $in: ['SUCCESS', 'ADMIN_APPROVED'] } } },
      { $group: { _id: null, total: { $sum: { $convert: { input: '$amount', to: 'double', onError: 0, onNull: 0 } } } } }
    ]);
    const totalPayouts = payoutsAgg[0]?.total || 0;

    // Withdrawable earnings = winnings - payouts (cannot be negative)
    const withdrawableEarnings = Math.max(0, (totalWins || 0) - (totalPayouts || 0));

    // Subtract PENDING withdrawals (hold) to show reduced earnings while pending
    const pendingAgg = await Transaction.aggregate([
      { $match: { userId: user._id, type: 'WITHDRAW', status: 'PENDING_ADMIN_APPROVAL' } },
      { $group: { _id: null, total: { $sum: { $convert: { input: '$amount', to: 'double', onError: 0, onNull: 0 } } } } }
    ]);
    const pendingWithdrawals = pendingAgg[0]?.total || 0;
    const earningsAfterHold = Math.max(0, withdrawableEarnings - pendingWithdrawals);
    const balanceWithoutHolds = Math.max(0, (parseFloat(user.wallet) || 0) - (parseFloat(pendingWithdrawals) || 0));

    const winAmt = parseFloat(user.winAmount) || 0;
    const wallet = parseFloat(user.wallet) || 0;
    const totalBalance = wallet + winAmt;
    res.json({ 
      status: true,
      joinAmount :wallet, // join money
      winAmount: winAmt, // winnings
      totalBalance, // wallet + winAmount
      totalPayouts
    });
  } catch (err) {
    console.error('Get Balance Error:', err);
    if (err.kind === 'ObjectId') {
      return res.status(400).json({
        status: false,
        message: 'Invalid user ID format'
      });
    }
    res.status(500).json({ 
      status: false,
      message: 'Failed to fetch wallet balance',
      error: err.message 
    });
  }
};

// Get Transaction History
exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        error: 'User not authenticated' 
      });
    }
    const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 }).lean();

    // Also fetch booking history for this user so the client can show match joins
    // We return bookings separately to avoid breaking existing consumers that
    // expect Transaction fields like balanceAfter.
    const bookings = await Booking.find({ user: userId })
      .populate('slot', 'matchTitle slotType totalWinningPrice perKill matchTime tournamentName')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      transactions,
      bookings
    });
  } catch (err) {
    console.error('Get Transaction History Error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch transaction history',
      details: err.message 
    });
  }
};


// TranzUPI Withdrawal Function
exports.tranzupiWithdraw = async (req, res) => {
  try {

    const { amount, upi_id, userId } = req.body;

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid amount is required.' 
      });
    }

    // Minimum withdrawal amount validation
    if (parseFloat(amount) < 10) {
      return res.status(400).json({ 
        success: false,
        error: 'Minimum withdrawal amount is ₹10.' 
      });
    }

    if (!upi_id || !userId) {
      return res.status(400).json({ 
        success: false,
        error: 'UPI ID and userId are required.' 
      });
    }

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ 
        success: false,
        error: 'User not authenticated' 
      });
    }

    // Allow admin to withdraw for any userId, normal users only for themselves
    let targetUserId = req.user && req.user.role === 'admin' && userId ? userId : req.user.userId;
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Calculate withdrawable earnings (winnings only - previous payouts)
    let earningBalance = 0;
    try {
      const winAgg = await require('../models/Winner').aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: null, total: { $sum: '$winningPrice' } } }
      ]);
      const totalWinsFromWinners = winAgg[0]?.total || 0;

      const winAggTx = await Transaction.aggregate([
        { $match: {
            userId: user._id,
            status: { $in: ['SUCCESS', 'ADMIN_APPROVED'] },
            $or: [
              { type: 'WIN' },
              { type: 'CREDIT', description: { $regex: /(winning|win\s+credited)/i } },
              { type: 'CREDIT', 'metadata.category': 'WIN' }
            ]
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const totalWinsFromTx = winAggTx[0]?.total || 0;

      const payoutsAgg = await Transaction.aggregate([
        { $match: { userId: user._id, type: { $in: ['DEBIT', 'WITHDRAW'] }, status: { $in: ['SUCCESS', 'ADMIN_APPROVED'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const totalPayouts = payoutsAgg[0]?.total || 0;
      console.log("totalWinsFromWinners",totalWinsFromWinners);
      console.log("totalWinsFromTx",totalWinsFromTx);
      console.log("totalPayouts",totalPayouts);
      earningBalance = Math.max(0, (totalWinsFromWinners + totalWinsFromTx) - totalPayouts);
      console.log("earningBalance",earningBalance);
    } catch (_) {
      earningBalance = 0;
    }
    console.log(typeof earningBalance,typeof amount);
    console.log(earningBalance,amount);
    console.log(parseFloat(amount) > earningBalance);
    
    // Enforce winAmount-only withdrawal based on User model
    const currentWinAmount = parseFloat(user.winAmount) || 0;
    if (parseFloat(amount) > currentWinAmount) {
      return res.status(400).json({ 
        success: false,
        error: 'Insufficient win amount to withdraw.'
      });
    }

    // Do NOT enforce overall wallet (join money) for withdrawals.
    // Withdrawals should be from winAmount only.

    // Check if TranzUPI is properly configured
    if (!TRANZUPI_CONFIG.api_key || !TRANZUPI_CONFIG.merchant_id || !TRANZUPI_CONFIG.secret_key) {
      return res.status(500).json({ 
        success: false,
        error: 'TranzUPI configuration incomplete. Please contact administrator.',
        details: 'Missing API credentials in environment variables'
      });
    }

    // Generate unique transaction ID
    const transactionId = `WITHDRAW_${user._id.toString().slice(-8)}_${Date.now()}`;

    // Create a pending withdrawal transaction that requires admin approval
    const withdrawalTransaction = await createTransaction({
      userId: user._id,
      type: 'WITHDRAW',
      amount: parseFloat(amount),
      description: `Withdrawal request to ${upi_id} - Pending admin approval`,
      transactionId: transactionId,
      status: 'PENDING_ADMIN_APPROVAL',
      paymentMethod: 'TRANZUPI',
      balanceAfter: user.wallet, // Balance not changed yet
      metadata: {
        upiId: upi_id,
        beneficiaryUserId: userId,
        requiresAdminApproval: true,
        winDeductedOnRequest: true
      }
    });

    // Immediately deduct from user's winnings (earnings) ONLY for pending request
    try {
      const currentWin = parseFloat(user.winAmount) || 0;
      const amt = parseFloat(amount);
      user.winAmount = Math.max(0, currentWin - amt);
      await user.save();
    } catch (_) {}

    // Check if we're in test/development mode (mock withdrawal for admin approval testing)
    if (TRANZUPI_CONFIG.base_url.includes('tranzupi.com/api/create-order') || !TRANZUPI_CONFIG.api_key.startsWith('live_')) {
      return res.json({
        success: true,
        message: 'Withdrawal request submitted successfully. It will be processed after admin approval.',
        transaction_id: transactionId,
        amount: parseFloat(amount),
        status: 'PENDING_ADMIN_APPROVAL',
        requires_approval: true
      });
    }

    // Prepare TranzUPI withdrawal request (for production)
    const withdrawalData = {
      merchant_id: TRANZUPI_CONFIG.merchant_id,
      amount: parseFloat(amount),
      currency: 'INR',
      transaction_id: transactionId,
      beneficiary_userId: userId,
      beneficiary_upi: upi_id,
      customer_name: user.name,
      customer_email: user.email,
      customer_phone: user.phone,
      description: 'Wallet withdrawal',
      callback_url: `${process.env.BASE_URL}/api/wallet/tranzupi/withdrawal-callback`,
      timestamp: Date.now()
    };

    // Generate signature
    const signatureString = `${withdrawalData.merchant_id}|${withdrawalData.amount}|${withdrawalData.currency}|${withdrawalData.transaction_id}|${withdrawalData.timestamp}|${TRANZUPI_CONFIG.secret_key}`;
    const signature = crypto.createHash('sha256').update(signatureString).digest('hex');

    withdrawalData.signature = signature;

    // Create withdrawal request to TranzUPI
    const response = await axios.post(`${TRANZUPI_CONFIG.base_url}/payout/create`, withdrawalData, {
      headers: {
        'Authorization': `Bearer ${TRANZUPI_CONFIG.api_key}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    if (response.data.success) {
      // Wallet not deducted on request; earnings already reduced above
      return res.json({
        success: true,
        message: 'Withdrawal request submitted successfully. It will be processed after admin approval.',
        transaction_id: transactionId,
        amount: parseFloat(amount),
        status: 'PENDING_ADMIN_APPROVAL',
        requires_approval: true
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to create withdrawal',
        details: response.data.message
      });
    }
  } catch (err) {
    console.error('TranzUPI Withdrawal Error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process withdrawal',
      details: err.response?.data?.message || err.message 
    });
  }
};

// TranzUPI Create Order API integration
class CreateOrderAPI {
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
    }
    async createOrder(customerMobile, userToken, amount, orderId, redirectUrl, remark1, remark2) {
        const payload = new URLSearchParams();
        payload.append('customer_mobile', customerMobile);
        payload.append('user_token', userToken);
        payload.append('amount', amount);
        payload.append('order_id', orderId);
        payload.append('redirect_url', redirectUrl);
        payload.append('remark1', remark1);
        payload.append('remark2', remark2);
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: payload
            });
            const data = await response.json();
            if (response.ok && data.status === true) {
                return data;
            } else {
                throw new Error(data.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Error creating TranzUPI order:', error);
            throw error;
        }
    }
}

// Express handler to create a TranzUPI order
exports.createTranzUPIOrder = async (req, res) => {
  try {
    const { customerMobile, amount, orderId, redirectUrl, remark1, remark2 } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 10) {
      return res.status(400).json({ success: false, error: 'Minimum add amount is ₹10' });
    }
    const userToken = process.env.TRANZUPI_API_KEY;
    const api = new CreateOrderAPI('https://tranzupi.com/api/create-order');

    const order = await api.createOrder(customerMobile, userToken, amt, orderId, redirectUrl, remark1, remark2);
    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// TranzUPI Payment Callback (for add money)
exports.tranzupiCallback = async (req, res) => {
  try {
    const { transaction_id, status, amount, signature } = req.body;

    // For testing with mock payments
    if (signature === 'mock_signature_for_testing') {
      if (status === 'success') {
        // Extract user ID from transaction ID
        const userIdPart = transaction_id.split('_')[1];
        const user = await User.findOne({ 
          _id: { $regex: new RegExp(userIdPart + '$') }
        });

        if (user) {
          // Use existing add-funds logic instead of direct wallet update
          user.wallet += parseFloat(amount);
          await user.save();
        }
      }
      return res.json({ success: true });
    }

    // Verify signature for production
    const signatureString = `${transaction_id}|${status}|${amount}|${TRANZUPI_CONFIG.secret_key}`;
    const expectedSignature = crypto.createHash('sha256').update(signatureString).digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid signature' 
      });
    }

    if (status === 'success') {
      // Extract user ID from transaction ID
      const userIdPart = transaction_id.split('_')[1];
      const user = await User.findOne({ 
        _id: { $regex: new RegExp(userIdPart + '$') }
      });

      if (user) {
        // Add funds to wallet
        user.wallet += parseFloat(amount);
        await user.save();

        // Create transaction record
        await createTransaction({
          userId: user._id,
          type: 'CREDIT',
          amount: parseFloat(amount),
          description: `TranzUPI payment - Transaction: ${transaction_id}`,
          transactionId: transaction_id,
          status: 'SUCCESS',
          paymentMethod: 'TRANZUPI',
          balanceAfter: user.wallet + user.winAmount, // Use total balance
          metadata: { transaction_id }
        });

        // Emit wallet update via websocket
        try {
          const { emitWalletUpdate } = require('../websocket');
          emitWalletUpdate(user._id.toString(), user.wallet + user.winAmount); // Emit total balance
        } catch (e) {
          console.error('Socket emit error:', e);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('TranzUPI Callback Error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Callback processing failed' 
    });
  }
};

// Get all pending withdrawal requests (Admin only)
exports.getPendingWithdrawals = async (req, res) => {
  try {
    const pendingWithdrawals = await Transaction.find({
      type: 'WITHDRAW',
      status: 'PENDING_ADMIN_APPROVAL'
    })
    .populate('userId', 'name email phone freeFireUsername referredBy')
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      withdrawals: pendingWithdrawals
    });

  } catch (err) {
    console.error('Get Pending Withdrawals Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending withdrawals',
      details: err.message
    });
  }
};

// Get approved withdrawals (Admin only)
exports.getApprovedWithdrawals = async (req, res) => {
  try {
    const approved = await Transaction.find({
      type: 'WITHDRAW',
      status: 'ADMIN_APPROVED'
    })
    .populate('userId', 'name email phone freeFireUsername referredBy')
    .sort({ createdAt: -1 });

    res.status(200).json({ success: true, withdrawals: approved });
  } catch (err) {
    console.error('Get Approved Withdrawals Error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch approved withdrawals', details: err.message });
  }
};

// Get rejected withdrawals (Admin only)
exports.getRejectedWithdrawals = async (req, res) => {
  try {
    const rejected = await Transaction.find({
      type: 'WITHDRAW',
      status: 'ADMIN_REJECTED'
    })
    .populate('userId', 'name email phone freeFireUsername referredBy')
    .sort({ createdAt: -1 });

    res.status(200).json({ success: true, withdrawals: rejected });
  } catch (err) {
    console.error('Get Rejected Withdrawals Error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch rejected withdrawals', details: err.message });
  }
};

// Approve withdrawal request (Admin only)
exports.approveWithdrawal = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const adminId = req.user.adminId; // Admin ID from admin auth middleware

    const transaction = await Transaction.findOne({
      transactionId: transactionId,
      type: 'WITHDRAW',
      status: 'PENDING_ADMIN_APPROVAL'
    }).populate('userId');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found or already processed'
      });
    }

    const user = transaction.userId;

    // Calculate earning balance (winning money only)
    // let earningBalance = 0;
    // try {
      // const winAgg = await require('../models/Winner').aggregate([
      //   { $match: { userId: user._id } },
      //   { $group: { _id: null, total: { $sum: '$winningPrice' } } }
      // ]);
      // const totalWinsFromWinners = winAgg[0]?.total || 0;

      // Include winning credits recorded in Transactions as well
      // const winAggTx = await Transaction.aggregate([
      //   { $match: {
      //       userId: user._id,
      //       status: { $in: ['SUCCESS', 'ADMIN_APPROVED'] },
      //       $or: [
      //         { type: 'WIN' },
      //         { type: 'CREDIT', description: { $regex: /(winning|win\s+credited)/i } },
      //         { type: 'CREDIT', 'metadata.category': 'WIN' }
      //       ]
      //     }
      //   },
      //   { $group: { _id: null, total: { $sum: '$amount' } } }
      // ]);
      // const totalWinsFromTx = winAggTx[0]?.total || 0;
      // const totalWins = (totalWinsFromWinners || 0) + (totalWinsFromTx || 0);

      // Total payouts: sum of all successful DEBIT/WITHDRAW
      // const payoutsAgg = await Transaction.aggregate([
      //   { $match: { userId: user._id, type: { $in: ['DEBIT', 'WITHDRAW'] }, status: { $in: ['SUCCESS', 'ADMIN_APPROVED'] } } },
      //   { $group: { _id: null, total: { $sum: '$amount' } } }
      // ]);
      // const totalPayouts = payoutsAgg[0]?.total || 0;

      // // Earning balance = total winnings - payouts (cannot be negative)
      // earningBalance = Math.max(0, (totalWins || 0) - (totalPayouts || 0));
    // } catch (e) {
    //   earningBalance = 0;
    // }

    // // Check if user has sufficient earning balance for withdrawal
    // if (parseFloat(transaction.amount) > earningBalance) {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'Insufficient earnings balance to approve this withdrawal. User can withdraw only from winnings.'
    //   });
    // }

    // Check if user has sufficient total wallet balance
    // if (user.winAmount < transaction.amount) {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'User has insufficient balance for this withdrawal'
    //   });
    // }

    // Wallet deduction should have happened on request; do NOT deduct again here.
    // Only finalize status to approved; no second debit.
    // await user.save();

    // Referral commission logic: 5% to referrer if user registered with a referral code
    if (user.referredBy) {
      const referrer = await User.findOne({ referCode: user.referredBy });
      if (referrer && String(referrer._id) !== String(user._id)) {
        let commission = Math.round(parseFloat(transaction.amount) * 0.05);
        if (commission < 1) commission = 1;
        referrer.wallet += commission;
        // Count referral commissions as part of overall winnings
        referrer.winAmount = (parseFloat(referrer.winAmount) || 0) + commission;
        await referrer.save();
        await Transaction.create({
          userId: referrer._id,
          type: 'CREDIT',
          amount: commission,
          description: `Referral commission: 5% of withdrawal ₹${transaction.amount} by user ${user._id}`,
          transactionId: `REF_WITHDRAW_${referrer._id}_${Date.now()}`,
          status: 'SUCCESS',
          paymentMethod: 'SYSTEM',
          balanceAfter: referrer.wallet,
          metadata: { referredUser: user._id, withdrawalAmount: transaction.amount }
        });
      }
    }

    // Update transaction status

    transaction.status = 'ADMIN_APPROVED';
    transaction.adminApproval.approvedBy = adminId;
    transaction.adminApproval.approvedAt = new Date();
    transaction.balanceAfter = user.wallet;
    transaction.description = `Withdrawal approved by admin - ${transaction.metadata.upiId}`;
    await transaction.save();

    // Emit wallet update to user via socket.io
    try {
      const { emitWalletUpdate } = require('../websocket');
      emitWalletUpdate(user._id.toString(), user.wallet);
    } catch (e) {
      console.error('Socket emit error (walletUpdate after admin approval):', e);
    }

    // In production, here you would integrate with actual TranzUPI API to process the withdrawal
    // For now, we'll mark it as successful

    res.status(200).json({
      success: true,
      message: 'Withdrawal approved and processed successfully',
      transaction: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        upiId: transaction.metadata.upiId,
        beneficiaryName: transaction.metadata.beneficiaryName,
        userBalance: user.wallet
      }
    });

  } catch (err) {
    console.error('Approve Withdrawal Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to approve withdrawal',
      details: err.message
    });
  }
};

// Reject withdrawal request (Admin only)
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.user.adminId; // Admin ID from admin auth middleware

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }

    const transaction = await Transaction.findOne({
      transactionId: transactionId,
      type: 'WITHDRAW',
      status: 'PENDING_ADMIN_APPROVAL'
    }).populate('userId');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found or already processed'
      });
    }

    // Restore user's balances because we deducted them on request
    try {
      const user = transaction.userId;
      const amt = parseFloat(transaction.amount || 0);
      // Restore only winAmount (do not modify join money)
      user.winAmount = (parseFloat(user.winAmount) || 0) + amt;
      await user.save();
      // Notify client of wallet change (total balance = wallet + winAmount)
      try {
        const { emitWalletUpdate } = require('../websocket');
        emitWalletUpdate(user._id.toString(), user.wallet + user.winAmount);
      } catch (e2) {
        console.error('Socket emit error (walletUpdate after rejection):', e2);
      }
    } catch (e) {
      console.error('Restore winAmount on reject failed:', e);
    }

    // Update transaction status
    transaction.status = 'ADMIN_REJECTED';
    transaction.adminApproval.rejectionReason = rejectionReason;
    transaction.adminApproval.rejectedAt = new Date();
    transaction.description = `Withdrawal rejected by admin - Reason: ${rejectionReason}`;
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Withdrawal rejected successfully',
      transaction: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        rejectionReason: rejectionReason,
        userEmail: transaction.userId.email
      }
    });

  } catch (err) {
    console.error('Reject Withdrawal Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to reject withdrawal',
      details: err.message
    });
  }
};

// TranzUPI Withdrawal Callback
exports.tranzupiWithdrawalCallback = async (req, res) => {
  try {
    const { transaction_id, status, amount, signature } = req.body;

    // Verify signature
    const signatureString = `${transaction_id}|${status}|${amount}|${TRANZUPI_CONFIG.secret_key}`;
    const expectedSignature = crypto.createHash('sha256').update(signatureString).digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid signature' 
      });
    }

    // Extract user ID from transaction ID
    const userIdPart = transaction_id.split('_')[1];
    const user = await User.findOne({ 
      _id: { $regex: new RegExp(userIdPart + '$') }
    });

    if (user && status === 'failed') {
      // If withdrawal failed, refund to winAmount only (do not touch join money)
      user.winAmount = (parseFloat(user.winAmount) || 0) + parseFloat(amount);
      await user.save();
    }

    res.json({ success: true });
  } catch (err) {
    console.error('TranzUPI Withdrawal Callback Error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Withdrawal callback processing failed' 
    });
  }
};

// Add winning amount to user wallet and create a transaction
exports.addWinningToWallet = async (req, res) => {
  try {
  const { userId, amount, matchId, winnerId } = req.body;
    if (!userId || !amount) {
      return res.status(400).json({ success: false, error: 'userId and amount are required' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    // Only add to winAmount (winnings), NOT to wallet (join money)
    user.winAmount = (parseFloat(user.winAmount) || 0) + parseFloat(amount);
    await user.save();
    // Create transaction record for winner
    await Transaction.create({
      userId: user._id,
      type: 'WIN',
      amount: amount,
      description: `Winning credited for match ${matchId || ''}`.trim(),
      transactionId: `WIN_${user._id}_${Date.now()}`,
      status: 'SUCCESS',
      paymentMethod: 'SYSTEM',
      balanceAfter: user.wallet + user.winAmount, // Use total balance
      metadata: { matchId, winnerId }
    });

    // Referral reward logic: 5% to referrer if user registered with referCode
    if (user.referCode) {
      // Find the user who owns this referCode
      const referrer = await User.findOne({ referCode: user.referCode });
      // Only reward if referrer exists and is not the same as the winner
      if (referrer && String(referrer._id) !== String(user._id)) {
        const reward = Math.floor((parseFloat(amount) * 0.05));
        if (reward > 0) {
          // Only add to winAmount (winnings), NOT to wallet (join money)
          referrer.winAmount = (parseFloat(referrer.winAmount) || 0) + reward;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'CREDIT',
            amount: reward,
            description: `Referral reward: 5% of ${amount} from user ${user._id}`,
            transactionId: `REF_${referrer._id}_${Date.now()}`,
            status: 'SUCCESS',
            paymentMethod: 'SYSTEM',
            balanceAfter: referrer.wallet + referrer.winAmount, // Use total balance
            metadata: { referredUser: user._id, matchId, winnerId }
          });
        }
      }
    }

    res.json({ success: true, msg: 'Winning amount added to winAmount', totalBalance: user.wallet + user.winAmount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.addJoinMoneyToWallet = async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    if (!userId || !amount) {
      return res.status(400).json({ success: false, error: 'userId and amount are required' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Only add to wallet (join money), NOT to winAmount
    user.wallet = (parseFloat(user.wallet) || 0) + parseFloat(amount);
    await user.save();
    
    // Create transaction record
    await Transaction.create({
      userId: user._id,
      type: 'CREDIT',
      amount: amount,
      description: description || 'Admin credit: Join Money',
      transactionId: `ADMIN_JOIN_${user._id}_${Date.now()}`,
      status: 'SUCCESS',
      paymentMethod: 'ADMIN',
      balanceAfter: user.wallet + user.winAmount, // Use total balance
      metadata: { adminAction: true }
    });

    res.json({ success: true, msg: 'Join money added to wallet', totalBalance: user.wallet + user.winAmount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get referral commission (referral win money) transactions for a user
exports.getReferralEarnings = async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }
    // Find all referral transactions (commission, reward, and signup bonus)
    const query = {
      userId,
      $or: [
        { description: { $regex: /Referral (commission|reward|bonus)/i } },
        { description: { $regex: /Signup bonus/i } },
        { 'metadata.bonusType': { $in: ['signup_referral', 'first_paid_match_referral'] } }
      ]
    };
        
    const referralTxns = await Transaction.find(query).sort({ createdAt: -1 }).lean();
    
    res.status(200).json({
      success: true,
      referralEarnings: referralTxns
    });
  } catch (err) {
    console.error('Get Referral Earnings Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch referral earnings',
      details: err.message
    });
  }
};

// Get all transactions for admin panel
exports.getAllTransactions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      status = 'all', 
      type = 'all',
      dateFilter = 'all',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { transactionId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filter
    if (status !== 'all') {
      query.status = status;
    }
    
    // Type filter
    if (type !== 'all') {
      query.type = type;
    }
    
    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        query.createdAt = { $gte: startDate };
      }
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get transactions with user details
    const transactions = await Transaction.find(query)
      .populate('userId', 'name email phone freeFireUsername')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalTransactions = await Transaction.countDocuments(query);

    // Calculate summary statistics
    const summaryStats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalDeposits: {
            $sum: {
              $cond: [
                { $in: ['$type', ['CREDIT', 'DEPOSIT']] },
                '$amount',
                0
              ]
            }
          },
          totalWithdrawals: {
            $sum: {
              $cond: [
                { $in: ['$type', ['DEBIT', 'WITHDRAW']] },
                '$amount',
                0
              ]
            }
          },
          pendingTransactions: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'PENDING_ADMIN_APPROVAL'] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const stats = summaryStats[0] || {
      totalTransactions: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      pendingTransactions: 0
    };

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalTransactions / parseInt(limit)),
        totalTransactions,
        hasNextPage: skip + parseInt(limit) < totalTransactions,
        hasPrevPage: parseInt(page) > 1
      },
      stats
    });

  } catch (err) {
    console.error('Get All Transactions Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch all transactions',
      details: err.message
    });
  }
};

// Get transaction history for admin panel with enhanced features
exports.getTransactionHistoryAdmin = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      status = 'all', 
      type = 'all',
      dateFilter = 'all',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      userId = null
    } = req.query;

    // Build query
    let query = {};
    
    // User filter (if specific user requested)
    if (userId) {
      query.userId = userId;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { transactionId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filter
    if (status !== 'all') {
      query.status = status;
    }
    
    // Type filter
    if (type !== 'all') {
      query.type = type;
    }
    
    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        query.createdAt = { $gte: startDate };
      }
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get transactions with user details
    const transactions = await Transaction.find(query)
      .populate('userId', 'name email phone freeFireUsername wallet')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalTransactions = await Transaction.countDocuments(query);

    // Calculate detailed statistics
    const summaryStats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalDeposits: {
            $sum: {
              $cond: [
                { $in: ['$type', ['CREDIT', 'DEPOSIT']] },
                '$amount',
                0
              ]
            }
          },
          totalWithdrawals: {
            $sum: {
              $cond: [
                { $in: ['$type', ['DEBIT', 'WITHDRAW']] },
                '$amount',
                0
              ]
            }
          },
          totalMatchEntries: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'MATCH_ENTRY'] },
                '$amount',
                0
              ]
            }
          },
          totalPrizes: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'WIN'] },
                '$amount',
                0
              ]
            }
          },
          pendingTransactions: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'PENDING_ADMIN_APPROVAL'] },
                1,
                0
              ]
            }
          },
          completedTransactions: {
            $sum: {
              $cond: [
                { $in: ['$status', ['SUCCESS', 'ADMIN_APPROVED']] },
                1,
                0
              ]
            }
          },
          failedTransactions: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'FAILED'] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const stats = summaryStats[0] || {
      totalTransactions: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalMatchEntries: 0,
      totalPrizes: 0,
      pendingTransactions: 0,
      completedTransactions: 0,
      failedTransactions: 0
    };

    // Get recent activity (last 10 transactions)
    const recentActivity = await Transaction.find({})
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalTransactions / parseInt(limit)),
        totalTransactions,
        hasNextPage: skip + parseInt(limit) < totalTransactions,
        hasPrevPage: parseInt(page) > 1
      },
      stats,
      recentActivity
    });

  } catch (err) {
    console.error('Get Transaction History Admin Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction history',
      details: err.message
    });
  }
};