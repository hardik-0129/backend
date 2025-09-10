require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  const existingAdmin = await Admin.findOne({ email: 'admin@example.com' });
  if (existingAdmin) {
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash('admin123', 10);

  const newAdmin = new Admin({
    email: 'admin@example.com',
    password: hashedPassword,
    isAdmin: true
  });

  await newAdmin.save();
  process.exit(0);
})
.catch(err => {
  process.stderr.write(`Error connecting to MongoDB: ${err.message}\n`);
  process.exit(1);
});
