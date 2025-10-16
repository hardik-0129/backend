const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authentication = require('../middleware/adminAuth');

router.post('/tranzupi/create-order', walletController.createTranzUPIOrder);

router.get("/payment/callback", (req, res) => {
  const orderId = req.query.orderId;
  const status = req.query.status;
  // Redirect user back into the app
  res.send(`
    <html>
      <head>
        <meta http-equiv="refresh" content="0;url=myapp://payment/result?orderId=${orderId}&status=${status}" />
      </head>
      <body>
        Redirecting to app...
      </body>
    </html>
  `);
});

router.post('/tranzupi/check-order-status', walletController.checkOrderStatus);
router.post('/tranzupi/webhook', walletController.tranzupiWebhook);
router.post('/add-winning', walletController.addWinningToWallet);
router.post('/add-join-money', authentication, walletController.addJoinMoneyToWallet);
router.get('/balance', authentication, walletController.getBalance);
router.post('/verify', authentication, walletController.verify);
router.post('/transactions', authentication, walletController.getTransactionHistory);
router.post('/referral-earnings', authentication, walletController.getReferralEarnings);
router.post('/tranzupi/withdraw', authentication, walletController.tranzupiWithdraw);
router.post('/tranzupi/callback', walletController.tranzupiCallback);
router.post('/tranzupi/withdrawal-callback', walletController.tranzupiWithdrawalCallback);
router.get('/admin/pending-withdrawals', authentication, walletController.getPendingWithdrawals);
router.get('/admin/approved-withdrawals', authentication, walletController.getApprovedWithdrawals);
router.get('/admin/rejected-withdrawals', authentication, walletController.getRejectedWithdrawals);
router.post('/admin/approve-withdrawal/:transactionId', authentication, walletController.approveWithdrawal);
router.post('/admin/reject-withdrawal/:transactionId', authentication, walletController.rejectWithdrawal);
router.get('/admin/all-transactions', authentication, walletController.getAllTransactions);
router.get('/admin/transaction-history', authentication, walletController.getTransactionHistoryAdmin);
router.delete('/admin/delete-transaction/:transactionId', authentication, walletController.deleteTransaction);

module.exports = router;
