require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (err) {
    process.stderr.write(`MongoDB connection error: ${err.message}\n`);
    process.exit(1);
  }
};

module.exports = connectDB;
