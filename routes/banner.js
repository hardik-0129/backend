const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bannerController = require('../controllers/bannerController');
const authentication = require('../middleware/adminAuth');
const { validateImage } = require('../utils/imageCompression');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads/banners');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for banner image uploads with memory storage for compression
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Allow only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit (will be compressed to KB)
  }
});

// Public route - Get active banner
router.get('/', bannerController.getBanner);

// Admin routes - Require admin authentication
router.get('/admin/banners', bannerController.getAllBanners);
router.put('/admin/update', authentication, bannerController.updateBanner);
router.post('/admin/upload-image', authentication, upload.single('banner'), bannerController.uploadBannerImage);
router.post('/admin/upload-multiple', authentication, upload.array('bannerImages', 10), bannerController.uploadMultipleBannerImages);
router.post('/admin/:bannerId/add-images', authentication, bannerController.addImagesToBanner);
router.delete('/admin/:bannerId/remove-image', authentication, bannerController.removeImageFromBanner);
router.put('/admin/:bannerId/images', authentication, bannerController.updateBannerImages);
router.put('/admin/:bannerId/activate', authentication, bannerController.setActiveBanner);
router.delete('/admin/:bannerId', authentication, bannerController.deleteBanner);

// Test compression endpoint
router.post('/test-compression', authentication, upload.single('testImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No image file uploaded' });
    }

    console.log('=== COMPRESSION TEST ===');
    console.log('Original file:', {
      name: req.file.originalname,
      size: req.file.size,
      sizeKB: Math.round(req.file.size / 1024),
      sizeMB: Math.round((req.file.size / (1024 * 1024)) * 100) / 100,
      mimetype: req.file.mimetype
    });

    // Test compression
    const sharp = require('sharp');
    const path = require('path');
    const fs = require('fs');

    const filename = `test-${Date.now()}.jpg`;
    const outputPath = path.join(__dirname, '../uploads/banners', filename);

    const result = await sharp(req.file.buffer)
      .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true, mozjpeg: true })
      .toFile(outputPath);

    const stats = fs.statSync(outputPath);
    const compressedSizeKB = Math.round(stats.size / 1024);
    const compressedSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
    const originalSizeKB = Math.round(req.file.size / 1024);
    const originalSizeMB = Math.round((req.file.size / (1024 * 1024)) * 100) / 100;
    const compressionRatio = Math.round(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100);

    console.log('Compressed file:', {
      size: stats.size,
      sizeKB: compressedSizeKB,
      sizeMB: compressedSizeMB,
      compressionRatio: compressionRatio
    });

    // Clean up test file
    fs.unlinkSync(outputPath);

    res.json({
      msg: 'Compression test completed',
      original: {
        size: req.file.size,
        sizeKB: originalSizeKB,
        sizeMB: originalSizeMB
      },
      compressed: {
        size: stats.size,
        sizeKB: compressedSizeKB,
        sizeMB: compressedSizeMB
      },
      compressionRatio: compressionRatio,
      spaceSaved: {
        kb: originalSizeKB - compressedSizeKB,
        mb: Math.round(((originalSizeMB - compressedSizeMB) * 100)) / 100
      }
    });
  } catch (error) {
    console.error('Compression test error:', error);
    res.status(500).json({ msg: 'Compression test failed', error: error.message });
  }
});

module.exports = router;
