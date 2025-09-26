const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // or your preferred SMTP
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});
async function sendOTP(email, otp) {
  try {
    // Quick transporter check
    await transporter.verify();

    const mailOptions = {
      from: `"GameZone OTP" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'Your GameZone OTP',
      html: `<h2>Your OTP is: <b>${otp}</b></h2><p>This OTP will expire in 10 minutes.</p>`
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (err) {
    console.error('sendOTP error:', err?.message || err);
    throw err;
  }
}

module.exports = sendOTP;
