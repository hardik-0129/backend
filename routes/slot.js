const express = require('express');
const router = express.Router();
// User Bookings API
const userBookingController = require('../controllers/userBookingController');

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { validateImage } = require('../utils/imageCompression');
const { 
  createSlot, 
  getSlots, 
  deleteSlot, 
  getSlotStats, 
  updateMatchStatus, 
  updateSlot,
  getMatchesByStatus, 
  autoUpdateMatchStatus,
  createGameType,
  getAllGameTypes,
  deleteGameType,
  updateGameType,
  getSlotsByCategory,
  getSlotsBySlotType,
  createGameMode,
  getAllGameModes,
  deleteGameMode,
  updateGameMode,
  createGameMap,
  getAllGameMaps,
  updateGameMap,
  deleteGameMap
} = require('../controllers/slotController');
const authentication = require('../middleware/adminAuth');

// GET /api/slots/user/:userId - Get all slots/bookings for a user
router.get('/slots/user/:userId', userBookingController.getUserBookings);

// Create uploads directory for game type images if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads/gametypes');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create uploads directory for game mode images if it doesn't exist
const gameModeUploadsDir = path.join(__dirname, '../uploads/gamemodes');
if (!fs.existsSync(gameModeUploadsDir)) {
  fs.mkdirSync(gameModeUploadsDir, { recursive: true });
}

// Configure multer for game type image uploads with memory storage for compression
const storage = multer.memoryStorage();

// Configure multer for game mode image uploads with memory storage for compression
const gameModeStorage = multer.memoryStorage();

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

const gameModeUpload = multer({ 
  storage: gameModeStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit (will be compressed to KB)
  }
});

// Compression middleware for game type images
const compressGameTypeImage = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    // Validate the image
    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        status: false,
        msg: validation.error
      });
    }

    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `gametype-${uniqueSuffix}.jpg`;
    const outputPath = path.join(uploadsDir, filename);

    // Compress the image
    const compressionResult = await sharp(req.file.buffer)
      .resize(400, 400, {
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
      return res.status(500).json({
        status: false,
        msg: 'Failed to compress image'
      });
    }

    // Get file info for logging
    const stats = fs.statSync(outputPath);
    const fileSizeKB = Math.round(stats.size / 1024);
    const fileSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
    const originalSizeKB = Math.round(req.file.size / 1024);
    const originalSizeMB = Math.round((req.file.size / (1024 * 1024)) * 100) / 100;
    const compressionRatio = Math.round(((originalSizeKB - fileSizeKB) / originalSizeKB) * 100);

    // Update req.file to match the compressed file
    req.file.filename = filename;
    req.file.path = outputPath;
    req.file.size = stats.size;

    next();
  } catch (error) {
    console.error('Game type image compression error:', error);
    return res.status(500).json({
      status: false,
      msg: 'Image compression failed'
    });
  }
};

// Compression middleware for game mode images
const compressGameModeImage = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    // Validate the image
    const validation = validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        status: false,
        msg: validation.error
      });
    }

    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `gamemode-${uniqueSuffix}.jpg`;
    const outputPath = path.join(gameModeUploadsDir, filename);

    // Compress the image
    const compressionResult = await sharp(req.file.buffer)
      .resize(400, 400, {
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
      return res.status(500).json({
        status: false,
        msg: 'Failed to compress image'
      });
    }

    // Get file info for logging
    const stats = fs.statSync(outputPath);
    const fileSizeKB = Math.round(stats.size / 1024);
    const fileSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
    const originalSizeKB = Math.round(req.file.size / 1024);
    const originalSizeMB = Math.round((req.file.size / (1024 * 1024)) * 100) / 100;
    const compressionRatio = Math.round(((originalSizeKB - fileSizeKB) / originalSizeKB) * 100);

    // Update req.file to match the compressed file
    req.file.filename = filename;
    req.file.path = outputPath;
    req.file.size = stats.size;

    next();
  } catch (error) {
    console.error('Game mode image compression error:', error);
    return res.status(500).json({
      status: false,
      msg: 'Image compression failed'
    });
  }
};

// GET /api/admin/slots - Get all slots
router.get('/slots', getSlots);

// GET /api/admin/slots/stats/:slotId - Get slot statistics
router.get('/slots/stats/:slotId', getSlotStats);

// GET /api/admin/slots/status/:status - Get matches by status
router.get('/slots/status/:status', getMatchesByStatus);

// POST /api/admin/slots - Create new slot
router.post('/slots', authentication, createSlot);

// PUT /api/admin/slots/:slotId/status - Update match status
router.put('/slots/:slotId/status', authentication, updateMatchStatus);

// PUT /api/admin/slots/:id - Update a slot
router.put('/slots/:id', authentication, updateSlot);

// POST /api/admin/slots/auto-update - Auto-update match statuses
router.post('/slots/auto-update', authentication, autoUpdateMatchStatus);

// DELETE /api/admin/slots/:id - Delete a slot
router.delete('/slots/:id', authentication, deleteSlot);

// Game Type Routes
// GET /api/admin/gametypes - Get all game types
router.get('/gametypes', getAllGameTypes);

// POST /api/admin/gametypes - Create new game type
router.post('/gametypes', authentication, upload.single('image'), compressGameTypeImage, (req, res, next) => {
  // Validate that gameType is provided
  if (!req.body.gameType) {
    return res.status(400).json({
      status: false,
      msg: 'Game type name is required'
    });
  }
  
  
  // Continue to the controller
  next();
}, createGameType);

// DELETE /api/admin/gametypes/:id - Delete a game type
router.delete('/gametypes/:id', authentication, deleteGameType);

// PUT /api/admin/gametypes/:id - Update a game type
router.put('/gametypes/:id', authentication, upload.single('image'), compressGameTypeImage, (req, res, next) => {
  // Validate that gameType is provided
  if (!req.body.gameType) {
    return res.status(400).json({
      status: false,
      msg: 'Game type name is required'
    });
  }
  
  
  // Continue to the controller
  next();
}, updateGameType);

// GET /api/admin/slots/category/:category - Get slots by game type category
router.get('/slots/category/:category', getSlotsByCategory);

// GET /api/admin/slots/slottype/:slotType - Get slots by specific slotType name
router.post('/slots/slottype/', getSlotsBySlotType);

// Game Mode Routes

// GET /api/admin/gamemodes - Get all game modes
router.get('/gamemodes', getAllGameModes);

// POST /api/admin/gamemodes - Create new game mode
router.post('/gamemodes', authentication, gameModeUpload.single('image'), compressGameModeImage, (req, res, next) => {
  // Validate that gameMode is provided
  if (!req.body.gameMode) {
    return res.status(400).json({
      status: false,
      msg: 'Game mode name is required'
    });
  }
  
  // Continue to the controller
  next();
}, createGameMode);

// DELETE /api/admin/gamemodes/:id - Delete a game mode
router.delete('/gamemodes/:id', authentication, deleteGameMode);

// PUT /api/admin/gamemodes/:id - Update a game mode
router.put('/gamemodes/:id', authentication, gameModeUpload.single('image'), compressGameModeImage, (req, res, next) => {
  // Validate that gameMode is provided
  if (!req.body.gameMode) {
    return res.status(400).json({
      status: false,
      msg: 'Game mode name is required'
    });
  }
  
  // Continue to the controller
  next();
}, updateGameMode);

// Game Map Routes
router.get('/gamemaps', getAllGameMaps);
router.post('/gamemaps', authentication, (req, res, next) => {
  if (!req.body.gameMap) {
    return res.status(400).json({ status: false, msg: 'Game map name is required' });
  }
  next();
}, createGameMap);
router.put('/gamemaps/:id', authentication, (req, res, next) => {
  if (!req.body.gameMap) {
    return res.status(400).json({ status: false, msg: 'Game map name is required' });
  }
  next();
}, updateGameMap);
router.delete('/gamemaps/:id', authentication, deleteGameMap);

module.exports = router;
