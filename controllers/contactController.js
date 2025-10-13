// GET /api/contact
exports.getAllContacts = async (req, res) => {
  try {
    const contacts = await ContactUs.find().sort({ createdAt: -1 });
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch contacts.', error: error.message });
  }
};
const ContactUs = require('../models/ContactUs');
const nodemailer = require('nodemailer');

// Configure mail transporter from environment
let mailTransporter = null;
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_PORT || '').trim() === '465',
      auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
    });
  }
} catch (e) {
  mailTransporter = null;
}

// POST /api/contact
exports.createContact = async (req, res) => {
  try {
    const contactData = { ...req.body };
    if (req.body.userId) {
      contactData.userId = req.body.userId;
    }
    console.log('[ContactEmail] inbound contact', {
      name: contactData.fullName,
      email: contactData.email,
      mobile: contactData.mobile,
      queryType: contactData.queryType,
      hasMessage: Boolean(contactData.message)
    });
    const contact = new ContactUs(contactData);
    await contact.save();
    console.log('[ContactEmail] contact saved', { id: contact._id, at: contact.createdAt });

    // Attempt to email admin with the contact details (non-blocking if config missing)
    (async () => {
      try {
        if (!mailTransporter) {
          console.warn('[ContactEmail] transporter not initialized - attempting lazy init');
          try {
            const smtpHost = process.env.SMTP_HOST;
            const smtpPort = Number(process.env.SMTP_PORT || 587);
            const smtpUser = process.env.SMTP_EMAIL || process.env.SMTP_USER;
            const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
            const secureFlag = (String(process.env.SMTP_SECURE || '').toLowerCase() === 'true') || String(smtpPort) === '465';
            if (smtpHost && smtpUser && smtpPass) {
              console.log('[ContactEmail] Lazy SMTP init', { host: smtpHost, port: smtpPort, secure: secureFlag });
              mailTransporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: secureFlag, auth: { user: smtpUser, pass: smtpPass } });
              await mailTransporter.verify().then(() => console.log('[ContactEmail] Lazy verify success')).catch(err => console.error('[ContactEmail] Lazy verify failed:', err?.message || err));
            } else {
              console.warn('[ContactEmail] Missing SMTP envs for lazy init', { hasHost: !!smtpHost, hasUser: !!smtpUser, hasPass: !!smtpPass });
            }
          } catch (e) {
            console.error('[ContactEmail] Lazy init error:', e?.message || e);
          }
        }
        if (!mailTransporter) { console.warn('[ContactEmail] transporter still not initialized'); return; }
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_EMAIL || process.env.SMTP_USER;
        if (!adminEmail) { console.warn('[ContactEmail] admin email not configured'); return; }
        const subject = `New Contact Message from ${contact.fullName}`;
        const lines = [
          `Name: ${contact.fullName}`,
          `Email: ${contact.email}`,
          `Mobile: ${contact.mobile}`,
          contact.gameName ? `Game: ${contact.gameName}` : null,
          contact.gameUsername ? `Game Username: ${contact.gameUsername}` : null,
          contact.gameUID ? `Game UID: ${contact.gameUID}` : null,
          contact.queryType ? `Query Type: ${contact.queryType}` : null,
          `Message: ${contact.message}`,
          contact.createdAt ? `Submitted: ${new Date(contact.createdAt).toISOString()}` : null,
          contact.userId ? `UserId: ${contact.userId}` : null,
        ].filter(Boolean).join('\n');
        console.log('[ContactEmail] sending', { to: adminEmail, from: process.env.MAIL_FROM || process.env.SMTP_EMAIL || process.env.SMTP_USER, subject });
        const result = await mailTransporter.sendMail({
          from: process.env.MAIL_FROM || process.env.SMTP_EMAIL || process.env.SMTP_USER,
          to: adminEmail,
          subject,
          text: lines,
          html: `<pre style="white-space:pre-wrap;font-family:menlo,consolas,monospace;">${lines.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`
        });
        console.log('[ContactEmail] sendMail ok', { messageId: result?.messageId, accepted: result?.accepted, rejected: result?.rejected });
      } catch (err) {
        console.error('[ContactEmail] sendMail error:', err?.message || err);
      }
    })();

    res.status(201).json({ success: true, message: 'Contact submitted successfully.' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Failed to submit contact.', error: error.message });
  }
};
