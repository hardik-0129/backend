const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    default: 'BOOK YOUR SPOT.\nDOMINATE THE ARENA.'
  },
  description: {
    type: String,
    required: true,
    default: 'Join daily Free Fire & Squad Tournaments.\nCompete, Win, Get Rewarded.'
  },
  buttonText: {
    type: String,
    required: true,
    default: 'VIEW TOURNAMENTS'
  },
  backgroundImage: {
    type: String,
    required: true,
    default: '/assets/banner/banner.jpg'
  },
  bannerImages: [{
    type: String,
    required: false
  }],
  imageGallery: [{
    url: {
      type: String,
      required: true
    },
    alt: {
      type: String,
      default: 'Banner Image'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
bannerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Banner', bannerSchema);
