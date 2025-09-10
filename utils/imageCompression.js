const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Compress and optimize image for banner uploads
 * @param {string} inputPath - Path to the original image
 * @param {string} outputPath - Path where compressed image will be saved
 * @param {Object} options - Compression options
 * @returns {Promise<Object>} - Compression result with file info
 */
const compressImage = async (inputPath, outputPath, options = {}) => {
  try {
    const {
      maxWidth = 1920,        // Maximum width for banner images
      maxHeight = 1080,       // Maximum height for banner images
      quality = 80,           // JPEG quality (1-100)
      format = 'jpeg',        // Output format
      progressive = true      // Progressive JPEG
    } = options;

    // Get original file info
    const originalStats = fs.statSync(inputPath);
    const originalSizeKB = Math.round(originalStats.size / 1024);

    // Compress the image
    await sharp(inputPath)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',        // Maintain aspect ratio
        withoutEnlargement: true  // Don't enlarge smaller images
      })
      .jpeg({
        quality: quality,
        progressive: progressive,
        mozjpeg: true         // Use mozjpeg encoder for better compression
      })
      .toFile(outputPath);

    // Get compressed file info
    const compressedStats = fs.statSync(outputPath);
    const compressedSizeKB = Math.round(compressedStats.size / 1024);
    const compressionRatio = Math.round(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100);

    return {
      success: true,
      originalSize: originalSizeKB,
      compressedSize: compressedSizeKB,
      compressionRatio: compressionRatio,
      outputPath: outputPath,
      format: format
    };

  } catch (error) {
    console.error('Image compression error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Compress multiple images
 * @param {Array} files - Array of file objects from multer
 * @param {string} outputDir - Directory to save compressed images
 * @param {Object} options - Compression options
 * @returns {Promise<Array>} - Array of compression results
 */
const compressMultipleImages = async (files, outputDir, options = {}) => {
  const results = [];
  
  for (const file of files) {
    const originalPath = file.path;
    const originalName = path.parse(file.filename).name;
    const compressedFilename = `${originalName}-compressed.jpg`;
    const outputPath = path.join(outputDir, compressedFilename);

    try {
      const result = await compressImage(originalPath, outputPath, options);
      
      if (result.success) {
        // Delete original file and rename compressed file
        fs.unlinkSync(originalPath);
        const finalPath = path.join(outputDir, file.filename);
        fs.renameSync(outputPath, finalPath);
        
        results.push({
          ...result,
          originalFilename: file.filename,
          finalPath: finalPath
        });
      } else {
        results.push({
          success: false,
          originalFilename: file.filename,
          error: result.error
        });
      }
    } catch (error) {
      results.push({
        success: false,
        originalFilename: file.filename,
        error: error.message
      });
    }
  }

  return results;
};

/**
 * Get image metadata
 * @param {string} imagePath - Path to the image
 * @returns {Promise<Object>} - Image metadata
 */
const getImageMetadata = async (imagePath) => {
  try {
    const metadata = await sharp(imagePath).metadata();
    const stats = fs.statSync(imagePath);
    
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: Math.round(stats.size / 1024), // Size in KB
      hasAlpha: metadata.hasAlpha
    };
  } catch (error) {
    console.error('Error getting image metadata:', error);
    return null;
  }
};

/**
 * Validate image file
 * @param {Object} file - File object from multer
 * @returns {Object} - Validation result
 */
const validateImage = (file) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!allowedTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size too large. Maximum size is 10MB.'
    };
  }

  return { valid: true };
};

module.exports = {
  compressImage,
  compressMultipleImages,
  getImageMetadata,
  validateImage
};
