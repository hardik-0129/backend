const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // or your preferred SMTP
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});
async function sendOTP(email, otp, options = {}) {
  try {
    // Quick transporter check
    await transporter.verify();
    
    // Set default values for variables
    const expiry_minutes = options.expiry_minutes || 5;
    let request_device = options.request_device || 'Unknown Device';
    const request_ip = options.request_ip || 'Unknown IP';
    const support_email = options.support_email || process.env.SUPPORT_EMAIL || 'support@alphalions.io';
    
    // Clean up request_device by removing unwanted parts
    request_device = request_device.replace(/Mozilla\/5\.0\s*/, '');
    request_device = request_device.replace(/AppleWebKit\/537\.36 \(KHTML, like Gecko\)\s*/, '');
    request_device = request_device.replace(/Safari\/537\.36\s*/, ''); // Remove Safari/537.36
    request_device = request_device.replace(/\s+/g, ' ').trim(); // Clean up extra spaces
    
    // Clean up IP address by removing ::ffff: prefix
    let clean_request_ip = request_ip.replace(/^::ffff:/, '');

    const mailOptions = {
      from: `"Esports Alphalions" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'Your Esports Alphalions verification code (OTP)',
      html: `<body style="margin:0;padding:0;background:#f4f6f8;font-family:system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 18px rgba(16,24,40,0.06);">
          <tr>
            <td style="padding:20px 24px 8px;">
              <a href="https://esports.alphalions.io/" style="text-decoration:none;color:inherit;">
                <img src="logo.png" alt="Esports Alphalions" width="140" style="display:block;border:0;outline:none;text-decoration:none;">
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 24px 8px;">
              <h1 style="margin:0;font-size:20px;line-height:1.2;color:#0f1724;">Your verification code</h1>
              <p style="margin:8px 0 18px;color:#475569;font-size:15px;line-height:1.4;">
                Enter the code below to complete signing in to your Esports Alphalions account.
              </p>

              <div style="text-align:center;margin:24px 0;">
                <div style="background:#f8fafc;border:1px solid #e6eef6;border-radius:8px;padding:18px 20px;font-size:26px;letter-spacing:6px;font-weight:600;display:inline-block;margin-bottom:16px;">
                  ${otp}
                </div>
                
                <div style="text-align:center;">
                  <p style="margin:0;color:#64748b;font-size:13px;">
                    This code is valid for <strong>${expiry_minutes} minutes</strong>.
                  </p>
                  <p style="margin:8px 0 0;color:#475569;font-size:13px;">
                    If you didn't request this, ignore this message or contact us.
                  </p>
                </div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #eef2f7;">
              <p style="margin:0;color:#94a3b8;font-size:13px;">
                Request from: ${request_device} · ${clean_request_ip}<br>
                Need help? Contact <a href="mailto:${support_email}" style="color:#0ea5a4;text-decoration:none">${support_email}</a>.
              </p>
              <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px;">Esports Alphalions • <a href="https://esports.alphalions.io/" style="color:#9ca3af;text-decoration:none">esports.alphalions.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>`
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (err) {
    console.error('sendOTP error:', err?.message || err);
    throw err;
  }
}

module.exports = sendOTP;
