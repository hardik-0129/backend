const Banner = require('../models/Banner');
const { convertBannerToFullUrls, convertBannersToFullUrls, getFullImageUrl } = require('../utils/imageUrl');
const { validateImage } = require('../utils/imageCompression');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Get active banner
exports.getBanner = async (req, res) => {
  try {
    // Get the active banner or create default if none exists
    let banner = await Banner.findOne({ isActive: true });
    
    if (!banner) {
      // Create default banner if none exists
      banner = new Banner({
        title: 'BOOK YOUR SPOT.\nDOMINATE THE ARENA.',
        description: 'Join daily Free Fire & Squad Tournaments.\nCompete, Win, Get Rewarded.',
        buttonText: 'VIEW TOURNAMENTS',
        backgroundImage: '/assets/banner/banner.jpg',
        isActive: true
      });
      await banner.save();
    }

    // Convert to full URLs before sending response
    const bannerWithFullUrls = convertBannerToFullUrls(banner);
    res.json(bannerWithFullUrls);
  } catch (error) {
    console.error('Error fetching banner:', error);
    res.status(500).json({ msg: 'Server error while fetching banner' });
  }
};

// Update banner (Admin only)
exports.updateBanner = async (req, res) => {
  try {
    const { title, description, buttonText, backgroundImage, bannerImages } = req.body;

    // Validate required fields
    if (!title || !description || !buttonText) {
      return res.status(400).json({ 
        msg: 'Missing required fields: title, description, buttonText' 
      });
    }

    // Find existing active banner or create new one
    let banner = await Banner.findOne({ isActive: true });
    
    if (banner) {
      // Update existing banner
      banner.title = title;
      banner.description = description;
      banner.buttonText = buttonText;
      if (backgroundImage) {
        banner.backgroundImage = backgroundImage;
      }
      if (bannerImages && Array.isArray(bannerImages)) {
        banner.bannerImages = bannerImages;
      }
      banner.updatedAt = Date.now();
    } else {
      // Create new banner
      banner = new Banner({
        title,
        description,
        buttonText,
        backgroundImage: backgroundImage || '/assets/banner/banner.jpg',
        bannerImages: bannerImages || [],
        isActive: true
      });
    }

    await banner.save();

    // Convert to full URLs before sending response
    const bannerWithFullUrls = convertBannerToFullUrls(banner);
    res.json({
      msg: 'Banner updated successfully',
      banner: bannerWithFullUrls
    });
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({ msg: 'Server error while updating banner' });
  }
};

// Upload banner image (Admin only)
exports.uploadBannerImage = async (req, res) => {
  try {
    if (req.file) {
    }
    
    if (!req.file) {
      return res.status(400).json({ msg: 'No image file uploaded' });
    }

    // Validate the image
    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({ msg: validation.error });
    }

    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalExt = path.extname(req.file.originalname);
    const filename = `banner-${uniqueSuffix}${originalExt}`;
    const outputPath = path.join(__dirname, '../uploads/banners', filename);

    // Compress the image
    const compressionResult = await sharp(req.file.buffer)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: 80,
        progressive: true,
        mozjpeg: true
      })
      .toFile(outputPath);

    if (!compressionResult) {
      return res.status(500).json({ msg: 'Failed to compress image' });
    }

    // Get file info
    const stats = fs.statSync(outputPath);
    const fileSizeKB = Math.round(stats.size / 1024);
    const fileSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
    const originalSizeKB = Math.round(req.file.size / 1024);
    const originalSizeMB = Math.round((req.file.size / (1024 * 1024)) * 100) / 100;
    const compressionRatio = Math.round(((originalSizeKB - fileSizeKB) / originalSizeKB) * 100);

    // Return the full URL for the uploaded image
    const imagePath = `/uploads/banners/${filename}`;
    const fullImageUrl = getFullImageUrl(imagePath);
    
    // Find the active banner or create one if none exists
    let banner = await Banner.findOne({ isActive: true });
    
    if (!banner) {
      // Create a new banner if none exists
      banner = new Banner({
        title: 'Default Banner',
        description: 'Default banner description',
        buttonText: 'VIEW TOURNAMENTS',
        bannerImages: [],
        isActive: true
      });
    }

    // Add new image to the bannerImages array
    banner.bannerImages.push(imagePath);
    banner.updatedAt = Date.now();
    
    await banner.save();

    // Convert to full URLs before sending response
    const bannerWithFullUrls = convertBannerToFullUrls(banner);
    
    res.json({
      msg: 'Image uploaded and compressed successfully',
      imagePath: fullImageUrl,
      relativePath: imagePath,
      banner: bannerWithFullUrls,
      totalBannerImages: banner.bannerImages.length,
      compression: {
        originalSize: {
          kb: originalSizeKB,
          mb: originalSizeMB
        },
        compressedSize: {
          kb: fileSizeKB,
          mb: fileSizeMB
        },
        compressionRatio: compressionRatio,
        spaceSaved: {
          kb: originalSizeKB - fileSizeKB,
          mb: Math.round(((originalSizeMB - fileSizeMB) * 100)) / 100
        },
        format: 'JPEG'
      }
    });
  } catch (error) {
    console.error('Error uploading banner image:', error);
    res.status(500).json({ msg: 'Server error while uploading image' });
  }
};

// Upload multiple banner images (Admin only)
exports.uploadMultipleBannerImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ msg: 'No image files uploaded' });
    }

    const compressionResults = [];
    const relativePaths = [];
    const fullImageUrls = [];
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;

    // Process each uploaded file
    for (const file of req.files) {
      // Validate the image
      const validation = validateImage(file);
      if (!validation.valid) {
        compressionResults.push({
          filename: file.originalname,
          success: false,
          error: validation.error
        });
        continue;
      }

      try {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalExt = path.extname(file.originalname);
        const filename = `banner-${uniqueSuffix}${originalExt}`;
        const outputPath = path.join(__dirname, '../uploads/banners', filename);

        // Compress the image
        const compressionResult = await sharp(file.buffer)
          .resize(1920, 1080, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({
            quality: 80,
            progressive: true,
            mozjpeg: true
          })
          .toFile(outputPath);

        if (compressionResult) {
          // Get file info
          const stats = fs.statSync(outputPath);
          const fileSizeKB = Math.round(stats.size / 1024);
          const fileSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
          const originalSizeKB = Math.round(file.size / 1024);
          const originalSizeMB = Math.round((file.size / (1024 * 1024)) * 100) / 100;
          const compressionRatio = Math.round(((originalSizeKB - fileSizeKB) / originalSizeKB) * 100);

          const imagePath = `/uploads/banners/${filename}`;
          const fullImageUrl = getFullImageUrl(imagePath);

          relativePaths.push(imagePath);
          fullImageUrls.push(fullImageUrl);
          totalOriginalSize += originalSizeKB;
          totalCompressedSize += fileSizeKB;

          compressionResults.push({
            filename: file.originalname,
            success: true,
            originalSize: {
              kb: originalSizeKB,
              mb: originalSizeMB
            },
            compressedSize: {
              kb: fileSizeKB,
              mb: fileSizeMB
            },
            compressionRatio: compressionRatio,
            spaceSaved: {
              kb: originalSizeKB - fileSizeKB,
              mb: Math.round(((originalSizeMB - fileSizeMB) * 100)) / 100
            }
          });
        } else {
          compressionResults.push({
            filename: file.originalname,
            success: false,
            error: 'Failed to compress image'
          });
        }
      } catch (error) {
        compressionResults.push({
          filename: file.originalname,
          success: false,
          error: error.message
        });
      }
    }

    if (relativePaths.length === 0) {
      return res.status(400).json({ 
        msg: 'No images were successfully processed',
        results: compressionResults
      });
    }
    
    // Find the active banner or create one if none exists
    let banner = await Banner.findOne({ isActive: true });
    
    if (!banner) {
      // Create a new banner if none exists
      banner = new Banner({
        title: 'Default Banner',
        description: 'Default banner description',
        buttonText: 'VIEW TOURNAMENTS',
        bannerImages: [],
        isActive: true
      });
    }

    // Add new images to the bannerImages array
    banner.bannerImages.push(...relativePaths);
    banner.updatedAt = Date.now();
    
    await banner.save();

    // Convert to full URLs before sending response
    const bannerWithFullUrls = convertBannerToFullUrls(banner);
    
    const overallCompressionRatio = Math.round(((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100);
    const totalOriginalSizeMB = Math.round((totalOriginalSize / 1024) * 100) / 100;
    const totalCompressedSizeMB = Math.round((totalCompressedSize / 1024) * 100) / 100;
  
    
    res.json({
      msg: `${relativePaths.length} images uploaded and compressed successfully`,
      imagePaths: fullImageUrls,
      relativePaths: relativePaths,
      totalUploaded: relativePaths.length,
      totalFailed: req.files.length - relativePaths.length,
      banner: bannerWithFullUrls,
      totalBannerImages: banner.bannerImages.length,
      compression: {
        totalOriginalSize: {
          kb: totalOriginalSize,
          mb: totalOriginalSizeMB
        },
        totalCompressedSize: {
          kb: totalCompressedSize,
          mb: totalCompressedSizeMB
        },
        overallCompressionRatio: overallCompressionRatio,
        totalSpaceSaved: {
          kb: totalOriginalSize - totalCompressedSize,
          mb: Math.round(((totalOriginalSizeMB - totalCompressedSizeMB) * 100)) / 100
        },
        format: 'JPEG'
      },
      results: compressionResults
    });
  } catch (error) {
    console.error('Error uploading multiple banner images:', error);
    res.status(500).json({ msg: 'Server error while uploading images' });
  }
};

// Add multiple images to banner (Admin only)
exports.addImagesToBanner = async (req, res) => {
  try {
    const { bannerId } = req.params;
    const { imagePaths } = req.body; // Array of relative image paths

    if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
      return res.status(400).json({ msg: 'No image paths provided' });
    }

    const banner = await Banner.findById(bannerId);
    if (!banner) {
      return res.status(404).json({ msg: 'Banner not found' });
    }

    // Add new images to the bannerImages array
    banner.bannerImages.push(...imagePaths);
    banner.updatedAt = Date.now();
    
    await banner.save();

    // Convert to full URLs before sending response
    const bannerWithFullUrls = convertBannerToFullUrls(banner);
    res.json({
      msg: `${imagePaths.length} images added to banner successfully`,
      banner: bannerWithFullUrls,
      addedImages: imagePaths.length
    });
  } catch (error) {
    console.error('Error adding images to banner:', error);
    res.status(500).json({ msg: 'Server error while adding images to banner' });
  }
};

// Remove image from banner (Admin only)
exports.removeImageFromBanner = async (req, res) => {
  try {
    const { bannerId } = req.params;
    const { imagePath } = req.body;

    if (!imagePath) {
      return res.status(400).json({ msg: 'Image path is required' });
    }

    const banner = await Banner.findById(bannerId);
    if (!banner) {
      return res.status(404).json({ msg: 'Banner not found' });
    }

    // Remove the image from bannerImages array
    const initialLength = banner.bannerImages.length;
    banner.bannerImages = banner.bannerImages.filter(img => img !== imagePath);
    
    if (banner.bannerImages.length === initialLength) {
      return res.status(404).json({ msg: 'Image not found in banner images' });
    }

    banner.updatedAt = Date.now();
    await banner.save();

    // Convert to full URLs before sending response
    const bannerWithFullUrls = convertBannerToFullUrls(banner);
    res.json({
      msg: 'Image removed from banner successfully',
      banner: bannerWithFullUrls
    });
  } catch (error) {
    console.error('Error removing image from banner:', error);
    res.status(500).json({ msg: 'Server error while removing image from banner' });
  }
};

// Update banner images array (Admin only)
exports.updateBannerImages = async (req, res) => {
  try {
    const { bannerId } = req.params;
    const { bannerImages } = req.body;

    if (!bannerImages || !Array.isArray(bannerImages)) {
      return res.status(400).json({ msg: 'Banner images must be an array' });
    }

    const banner = await Banner.findById(bannerId);
    if (!banner) {
      return res.status(404).json({ msg: 'Banner not found' });
    }

    banner.bannerImages = bannerImages;
    banner.updatedAt = Date.now();
    await banner.save();

    // Convert to full URLs before sending response
    const bannerWithFullUrls = convertBannerToFullUrls(banner);
    res.json({
      msg: 'Banner images updated successfully',
      banner: bannerWithFullUrls
    });
  } catch (error) {
    console.error('Error updating banner images:', error);
    res.status(500).json({ msg: 'Server error while updating banner images' });
  }
};

// Get all banners (Admin only)
exports.getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find().sort({ createdAt: -1 });
    
    // Convert all banners to include full URLs
    const bannersWithFullUrls = convertBannersToFullUrls(banners);
    res.json(bannersWithFullUrls);
  } catch (error) {
    console.error('Error fetching all banners:', error);
    res.status(500).json({ msg: 'Server error while fetching banners' });
  }
};

// Set active banner (Admin only)
exports.setActiveBanner = async (req, res) => {
  try {
    const { bannerId } = req.params;

    // Deactivate all banners
    await Banner.updateMany({}, { isActive: false });

    // Activate the selected banner
    const banner = await Banner.findByIdAndUpdate(
      bannerId,
      { isActive: true, updatedAt: Date.now() },
      { new: true }
    );

    if (!banner) {
      return res.status(404).json({ msg: 'Banner not found' });
    }

    // Convert to full URLs before sending response
    const bannerWithFullUrls = convertBannerToFullUrls(banner);
    res.json({
      msg: 'Banner activated successfully',
      banner: bannerWithFullUrls
    });
  } catch (error) {
    console.error('Error setting active banner:', error);
    res.status(500).json({ msg: 'Server error while setting active banner' });
  }
};

// Delete banner (Admin only)
exports.deleteBanner = async (req, res) => {
  try {
    const { bannerId } = req.params;

    const banner = await Banner.findById(bannerId);
    if (!banner) {
      return res.status(404).json({ msg: 'Banner not found' });
    }

    // Don't allow deletion of active banner
    if (banner.isActive) {
      return res.status(400).json({ 
        msg: 'Cannot delete active banner. Please activate another banner first.' 
      });
    }

    await Banner.findByIdAndDelete(bannerId);

    res.json({ msg: 'Banner deleted successfully' });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ msg: 'Server error while deleting banner' });
  }
};
