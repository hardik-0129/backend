const contactRoutes = require('./routes/contact');
const userRoutes = require('./routes/user');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const connectDB = require('./config/db');
const bookingRoutes = require('./routes/booking'); 
const adminRoutes = require('./routes/admin');
const slotRoutes = require('./routes/slot');
const bannerRoutes = require('./routes/banner');
const winnerRoutes = require('./routes/winner');
const notificationRoutes = require('./routes/notification');
const announcementRoutes = require('./routes/announcement');
const nftRoutes = require('./routes/nft');
const apkRoutes = require('./routes/apk');
const blogRoutes = require('./routes/blogRoutes');
const { startCronJobs } = require('./services/cronJobs');
const cronScheduler = require('./services/cronScheduler');

const app = express();

app.use(cors({
  origin: ['http://localhost:8080', 'http://192.168.1.5:8080', "https://esports.alphalions.io"],
  credentials: true
}));
// Increase body limits to accommodate larger payloads (metadata, base64, etc.)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

connectDB();
startCronJobs();
// Start NFT count update cron scheduler
cronScheduler.start();
app.use('/api', authRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/user', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/bookings',bookingRoutes );
app.use('/api/admin', adminRoutes);
app.use('/api/admin', slotRoutes);
app.use('/api/banner', bannerRoutes);
app.use('/api/v1', slotRoutes); 
app.use('/api/winners', winnerRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/announcement', announcementRoutes);
app.use('/api/nft', nftRoutes);
app.use('/api/apk', apkRoutes);
app.use('/api/admin/blogs', blogRoutes);
app.use('/uploads', express.static('uploads'));

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT);
const { initSocket } = require('./websocket');
initSocket(server);


