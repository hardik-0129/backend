const nodemailer = require('nodemailer');
const path = require('path');

// Build a transporter compatible with Hostinger/Titan or any generic SMTP
// Required envs:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, [optional] SMTP_SECURE=true|false
const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com';
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  requireTLS: !smtpSecure, // for 587 STARTTLS
  auth: {
    user: process.env.SMTP_USER || process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
  },
  authMethod: process.env.SMTP_AUTH_METHOD || undefined,
});
async function sendOTP(email, otp, options = {}) {
  try {
    // Log SMTP config (mask sensitive)
    const maskedUser = (process.env.SMTP_USER || process.env.SMTP_EMAIL || '').replace(/(^.).+(@.*$)/, '$1***$2');
    // console.log('[sendOTP] SMTP config:', {
    //   host: smtpHost,
    //   port: smtpPort,
    //   secure: smtpSecure,
    //   user: maskedUser
    // });

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
      from: `"(OTP) Alpha lions" <${process.env.SMTP_USER || process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'Your Esports Alphalions verification code (OTP)',
      html: `<body style="margin:0;padding:0;background:#f4f6f8;font-family:system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#000;border-radius:8px;overflow:hidden;box-shadow:0 4px 18px rgba(16,24,40,0.06);">
          <tr>
            <td style="padding:20px 24px 8px;text-align:center;" align="center">
              <a href="https://esports.alphalions.io/" style="text-decoration:none;">
                <img src="cid:logo" alt="Esports Alphalions" width="140" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;">
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 24px 8px;">
              <h1 style="margin:0;font-size:20px;line-height:1.2;color:#fff;">Your verification code</h1>
              <p style="margin:8px 0 18px;font-size:15px;line-height:1.4;color:#fff;">
                Enter the code below to complete signing in to your Esports Alphalions account.
              </p>

              <div style="text-align:center;margin:24px 0;">
                <div style="background:#f8fafc;border:1px solid #e6eef6;border-radius:8px;padding:18px 20px;font-size:26px;letter-spacing:6px;font-weight:600;display:inline-block;margin-bottom:16px;">
                  ${otp}
                </div>
                
                <div style="text-align:center;">
                  <p style="margin:0;color:#64748b;font-size:13px;color:#fff;">
                    This code is valid for <strong>${expiry_minutes} minutes</strong>.
                  </p>
                  <p style="margin:8px 0 0;color:#475569;font-size:13px;color:#fff;">
                    If you didn't request this, ignore this message or contact us.
                  </p>
                </div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #eef2f7;">
              <p style="margin:0;color:#94a3b8;font-size:13px;color:#fff;">
                Request from: ${request_device} · ${clean_request_ip}<br>
                Need help? Contact <a href="mailto:${support_email}" style="color:#f97316;text-decoration:none">${support_email}</a>.
              </p>
              <p style="margin:12px 0 0;color:#cbd5e1;font-size:12px;">Esports Alphalions • <a href="https://esports.alphalions.io/" style="color:#9ca3af;text-decoration:none">esports.alphalions.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>`,
      attachments: [
        {
          filename: 'logo.png',
          path: path.join(__dirname, 'logo.png'),
          cid: 'logo'
        }
      ]
    };

    const safeOtp = String(otp || '').replace(/.(?=.{2}$)/g, '*');
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (err) {
    console.error('[sendOTP] Error:', {
      message: err?.message,
      code: err?.code,
      response: err?.response,
      responseCode: err?.responseCode,
      command: err?.command,
      stack: err?.stack
    });
    throw err;
  }
}

module.exports = sendOTP;
