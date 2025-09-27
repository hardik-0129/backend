require('dotenv').config();
const connectDB = require('../config/db');
const Banner = require('../models/Banner');

const DEFAULT_TITLE = 'BOOK YOUR SPOT.\nDOMINATE THE ARENA.';
const DEFAULT_DESC = 'Join daily Free Fire & Squad Tournaments.\nCompete, Win, Get Rewarded.';
const DEFAULT_BTN = 'VIEW TOURNAMENTS';

async function run() {
  try {
    await connectDB();

    const result = await Banner.updateMany(
      {
        $or: [
          { title: DEFAULT_TITLE },
          { description: DEFAULT_DESC },
          { buttonText: DEFAULT_BTN }
        ]
      },
      {
        $set: {
          title: '',
          description: '',
          buttonText: ''
        }
      }
    );
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();


