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

// POST /api/contact
exports.createContact = async (req, res) => {
  try {
    const contactData = { ...req.body };
    if (req.body.userId) {
      contactData.userId = req.body.userId;
    }
    const contact = new ContactUs(contactData);
    await contact.save();
    res.status(201).json({ success: true, message: 'Contact submitted successfully.' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Failed to submit contact.', error: error.message });
  }
};
