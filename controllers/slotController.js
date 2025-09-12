const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const GameType = require('../models/GameType');
const GameMode = require('../models/GameMode');
const { getFullImageUrl } = require('../utils/imageUrl');

const convertSlotToFullUrls = (slot) => {
  if (!slot) return null;
  
  const slotObj = slot.toObject ? slot.toObject() : slot;
  const { tournamentRules, ...rest } = slotObj;
  return {
    ...rest,
    bannerImage: getFullImageUrl(slotObj.bannerImage)
  };
};

const convertSlotsToFullUrls = (slots) => {
  if (!Array.isArray(slots)) return [];
  
  return slots.map(slot => convertSlotToFullUrls(slot));
};

const convertGameTypeToFullUrls = (gameType) => {
  if (!gameType) return null;
  
  const gameTypeObj = gameType.toObject ? gameType.toObject() : gameType;
  
  return {
    ...gameTypeObj,
    image: getFullImageUrl(gameTypeObj.image)
  };
};

const convertGameTypesToFullUrls = (gameTypes) => {
  if (!Array.isArray(gameTypes)) return [];
  
  return gameTypes.map(gameType => convertGameTypeToFullUrls(gameType));
};

const convertGameModeToFullUrls = (gameMode) => {
  if (!gameMode) return null;
  
  const gameModeObj = gameMode.toObject ? gameMode.toObject() : gameMode;
  
  return {
    ...gameModeObj,
    image: getFullImageUrl(gameModeObj.image)
  };
};

const convertGameModesToFullUrls = (gameModes) => {
  if (!Array.isArray(gameModes)) return [];
  
  return gameModes.map(gameMode => convertGameModeToFullUrls(gameMode));
};

exports.createSlot = async (req, res) => {
  const {
    slotType,
    entryFee,
    matchTime,
    customStartInMinutes = 10,
    perKill,
    totalWinningPrice,
    maxBookings,
    remainingBookings,
    matchTitle,
    matchDescription = '',
    mapName = 'Bermuda',
    gameMode = 'Classic',
    tournamentName = '#ALPHALIONS',
    maxPlayers,
    registrationDeadline,
    rules = 'Standard Free Fire rules apply',
    prizeDistribution = 'Winner takes all',
    contactInfo = '',
    streamLink = '',
    discordLink = '',
    specialRules = '',
    banList = '',
    bannerImage = ''
  } = req.body;

  try {
    // Get valid slot types from the GameType collection
    const gameTypes = await GameType.find({ isActive: true });
    const validSlotTypes = gameTypes.map(type => type.gameType);
    
    // For backward compatibility, include these default types if they're not already in the database
    const defaultTypes = ['Solo', 'Duo', 'Squad', 'Clash Squad', 'Lone Wolf', 'Survival', 'Free Matches'];
    defaultTypes.forEach(type => {
      if (!validSlotTypes.includes(type)) {
        validSlotTypes.push(type);
      }
    });
    
    // Validate slot type against database values
    if (!validSlotTypes.includes(slotType)) {
      return res.status(400).json({ msg: `Invalid slot type. Must be one of: ${validSlotTypes.join(', ')}` });
    }
  } catch (error) {
    console.error('Error fetching valid game types:', error);
    // Fallback to hardcoded types if database query fails
    const fallbackTypes = ['Solo', 'Duo', 'Squad', 'Clash Squad', 'Lone Wolf', 'Survival', 'Free Matches'];
    if (!fallbackTypes.includes(slotType)) {
      return res.status(400).json({ msg: 'Invalid slot type. Must be Solo, Duo, Squad, Clash Squad, Lone Wolf, Survival, or Free Matches' });
    }
  }

  // Validate numeric values
  if (typeof perKill !== 'number' || perKill < 0) {
    return res.status(400).json({ msg: 'perKill must be a non-negative number' });
  }

  if (typeof totalWinningPrice !== 'number' || totalWinningPrice < 0) {
    return res.status(400).json({ msg: 'totalWinningPrice must be a non-negative number' });
  }

  try {
    // Continue with slot creation
    const slot = new Slot({
      // Basic slot information
      slotType: slotType,
      entryFee,
      matchTime,
      maxBookings: maxBookings || maxPlayers || 50,
      remainingBookings: remainingBookings || maxPlayers || 50,
      customStartInMinutes,
      perKill,
      totalWinningPrice,
      firstwin: req.body.firstwin || 0,
      secwin: req.body.secwin || 0,
      thirdwin: req.body.thirdwin || 0,
      // Enhanced match information (all optional)
      matchTitle: matchTitle ? matchTitle.trim() : '',
      matchDescription,
      mapName,
      gameMode,
      tournamentName,
      maxPlayers: maxPlayers || 0,
      registrationDeadline: registrationDeadline || new Date(),
      rules,
      prizeDistribution,
      contactInfo,
      streamLink,
      discordLink,
      specialRules,
      banList,
      bannerImage: bannerImage ? bannerImage.trim() : ''
    });

    await slot.save();
    
    // Convert slot to include full URLs before sending response
    const slotWithFullUrls = convertSlotToFullUrls(slot);
    res.status(201).json({ msg: 'Match created successfully', slot: slotWithFullUrls });
  } catch (err) {
    console.error('Match creation failed:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

exports.getSlots = async (req, res) => {
  try {
    const slots = await Slot.find().sort({ createdAt: -1 });
    
    // Convert slots to include full URLs
    const slotsWithFullUrls = convertSlotsToFullUrls(slots);
    
    res.status(200).json({
      success: true,
      slots: slotsWithFullUrls
    });
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching slots'
    });
  }
};

// Update an existing slot (match) - partial update
exports.updateSlot = async (req, res) => {
  try {
    const { id } = req.params;

    // Build update object only with provided fields
    const allowedFields = [
      'slotType', 'entryFee', 'matchTime', 'customStartInMinutes', 'perKill',
      'totalWinningPrice', 'maxBookings', 'remainingBookings', 'matchTitle',
      'matchDescription', 'mapName', 'gameMode', 'tournamentName', 'maxPlayers',
      'registrationDeadline', 'rules', 'prizeDistribution', 'contactInfo',
      'streamLink', 'discordLink', 'specialRules', 'banList', 'bannerImage',
      'firstwin', 'secwin', 'thirdwin', 'status'
    ];

    const updateData = {};
    for (const key of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updateData[key] = req.body[key];
      }
    }

    const updated = await Slot.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, msg: 'Slot not found' });
    }

    const slotWithFullUrls = convertSlotToFullUrls(updated);
    return res.status(200).json({ success: true, msg: 'Slot updated successfully', slot: slotWithFullUrls });
  } catch (error) {
    console.error('Update slot error:', error);
    return res.status(500).json({ success: false, msg: 'Server error while updating slot', error: error.message });
  }
};

exports.deleteSlot = async (req, res) => {
  try {
    const { id } = req.params;

    const slot = await Slot.findById(id);
    if (!slot) {
      return res.status(404).json({
        success: false,
        error: 'Slot not found'
      });
    }

    // Delete the slot
    await Slot.findByIdAndDelete(id);

    // Also delete all bookings related to this slot to prevent orphaned records
    await Booking.deleteMany({ slot: id });

    res.status(200).json({
      success: true,
      message: 'Slot and related bookings deleted successfully'
    });

  } catch (error) {
    console.error('Delete slot error:', error);
    res.status(500).json({
      success: false,
      error: 'Error deleting slot'
    });
  }
};

// Add tournament rules to a slot
exports.addTournamentRules = async (req, res) => {

  try {
    const { slotId } = req.params;
    // Only use fields provided in req.body, do not set defaults
    const tournamentRulesData = { ...req.body };

    // Use findByIdAndUpdate to avoid full document validation
    const updatedSlot = await Slot.findByIdAndUpdate(
      slotId,
      { $set: { tournamentRules: tournamentRulesData } },
      { 
        new: true, 
        runValidators: false // Skip validation to avoid issues with existing incomplete slots
      }
    );

    if (!updatedSlot) {
      return res.status(404).json({ msg: 'Slot not found' });
    }

    // Convert slot to include full URLs before sending response
    const slotWithFullUrls = convertSlotToFullUrls(updatedSlot);
    res.json({ msg: 'Tournament rules added successfully', slot: slotWithFullUrls });
  } catch (err) {
    console.error('Error adding tournament rules:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Update tournament rules
exports.updateTournamentRules = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { rules } = req.body;
    const slot = await Slot.findByIdAndUpdate(slotId, { rules }, { new: true });
    if (!slot) return res.status(404).json({ msg: "Slot not found" });
    res.json({ success: true, slot });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
};

// Get tournament rules
exports.getTournamentRules = async (req, res) => {
  try {
    const { slotId } = req.params;

    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ msg: 'Slot not found' });
    }

    res.json({ 
      tournamentRules: slot.tournamentRules || {},
      matchTitle: slot.matchTitle,
      slotType: slot.slotType,
      bannerImage: getFullImageUrl(slot.bannerImage)
    });
  } catch (err) {
    console.error('Error fetching tournament rules:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Get slot statistics including total bookings count
exports.getSlotStats = async (req, res) => {
  try {
    const { slotId } = req.params;
    const Booking = require('../models/Booking');

    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ msg: 'Slot not found' });
    }

    // Count total bookings for this slot from all users
    const totalBookings = await Booking.countDocuments({ slot: slotId });
    
    // Count total positions booked
    const bookings = await Booking.find({ slot: slotId }).select('selectedPositions');
    const totalPositionsBooked = bookings.reduce((total, booking) => {
      if (booking.selectedPositions) {
        const positions = booking.selectedPositions instanceof Map 
          ? Array.from(booking.selectedPositions.values()).flat()
          : Object.values(booking.selectedPositions).flat();
        return total + positions.length;
      }
      return total;
    }, 0);

    res.json({
      slot: {
        _id: slot._id,
        slotType: slot.slotType,
        maxBookings: slot.maxBookings,
        remainingBookings: slot.remainingBookings,
        maxPlayers: slot.maxPlayers || slot.maxBookings
      },
      stats: {
        totalBookings,
        totalPositionsBooked,
        availablePositions: (slot.maxPlayers || slot.maxBookings) - totalPositionsBooked
      }
    });
  } catch (err) {
    console.error('Error fetching slot stats:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Update match status manually
exports.updateMatchStatus = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['upcoming', 'live', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        msg: 'Invalid status. Must be one of: upcoming, live, completed, cancelled' 
      });
    }

    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ msg: 'Slot not found' });
    }

    // Update the status
    slot.status = status;
    await slot.save();

    res.status(200).json({ 
      msg: 'Match status updated successfully', 
      slot: {
        _id: slot._id,
        matchTitle: slot.matchTitle,
        status: slot.status,
        matchTime: slot.matchTime
      }
    });
  } catch (err) {
    console.error('Error updating match status:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Get matches by status
exports.getMatchesByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    
    // Validate status
    const validStatuses = ['upcoming', 'live', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        msg: 'Invalid status. Must be one of: upcoming, live, completed, cancelled' 
      });
    }

    const matches = await Slot.find({ status }).sort({ matchTime: 1 });
    
    // Convert matches to include full URLs
    const matchesWithFullUrls = convertSlotsToFullUrls(matches);
    res.status(200).json(matchesWithFullUrls);
  } catch (err) {
    console.error('Error fetching matches by status:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Auto-update match statuses (can be called manually)
exports.autoUpdateMatchStatus = async (req, res) => {
  try {
    const { manualStatusUpdate } = require('../services/cronJobs');
    await manualStatusUpdate();
    
    res.status(200).json({ 
      msg: 'Match statuses updated successfully' 
    });
  } catch (err) {
    console.error('Error auto-updating match statuses:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// Create new game type
exports.createGameType = async (req, res) => {
  try {
    // Get gameType and subCategory from request body
    const { gameType, subCategory } = req.body;
    
    // Check if required fields are provided
    if (!gameType) {
      return res.status(400).json({
        status: false,
        msg: 'Game type name is required'
      });
    }
    
    // Determine the image path - either from uploaded file or from request body
    let imagePath;
    if (req.file) {
      // If a file was uploaded, use the file path
      imagePath = `/uploads/gametypes/${req.file.filename}`;
    } else if (req.body.image) {
      // If no file was uploaded, check if an image path was provided in the request body
      imagePath = req.body.image;
    } else {
      // If no image was provided at all, use a default image path
      imagePath = '/uploads/gametypes/default-gametype.png';
    }
    
    // Parse subCategory - it might be a JSON string for multiple values
    let parsedSubCategory;
    if (subCategory) {
      try {
        // Try to parse as JSON (for multiple subcategories)
        parsedSubCategory = JSON.parse(subCategory);
      } catch (e) {
        // If parsing fails, treat as single subcategory
        parsedSubCategory = subCategory.trim();
      }
    }
    
    // Create new game type
    const newGameType = new GameType({
      gameType: gameType.trim(),
      subCategory: parsedSubCategory,
      image: imagePath
    });
    
    await newGameType.save();
    
    // Convert to full URLs before sending response
    const gameTypeWithFullUrl = convertGameTypeToFullUrls(newGameType);
    
    res.status(201).json({
      status: true,
      msg: 'Game type created successfully',
      gameType: gameTypeWithFullUrl
    });
  } catch (error) {
    console.error('Error creating game type:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while creating game type',
      error: error.message
    });
  }
};

// Get all game types
exports.getAllGameTypes = async (req, res) => {
  try {
    const gameTypes = await GameType.find({ isActive: true })
      .select('-subCategory') // Exclude subCategory field from response
      .sort({ createdAt: -1 });
    
    // Convert game types to include full URLs
    const gameTypesWithFullUrls = convertGameTypesToFullUrls(gameTypes);
    
    res.status(200).json({
      status: true,
      gameTypes: gameTypesWithFullUrls
    });
  } catch (error) {
    console.error('Error fetching game types:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while fetching game types',
      error: error.message
    });
  }
};

// Get all game types for dropdowns (simplified format)
exports.getGameTypesForDropdown = async (req, res) => {
  try {
    const gameTypes = await GameType.find({ isActive: true }).select('gameType').sort({ gameType: 1 });
    
    // Extract just the game type names for dropdown use
    const gameTypeNames = gameTypes.map(type => type.gameType);
    
    // Include default types if they don't exist in the database
    const defaultTypes = ['Solo', 'Duo', 'Squad', 'Clash Squad', 'Lone Wolf', 'Survival', 'Free Matches'];
    defaultTypes.forEach(type => {
      if (!gameTypeNames.includes(type)) {
        gameTypeNames.push(type);
      }
    });
    
    // Sort alphabetically for dropdown display
    gameTypeNames.sort();
    
    res.status(200).json({
      status: true,
      gameTypes: gameTypeNames
    });
  } catch (error) {
    console.error('Error fetching game types for dropdown:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while fetching game types',
      error: error.message
    });
  }
};

// Delete game type
exports.deleteGameType = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find game type
    const gameType = await GameType.findById(id);
    if (!gameType) {
      return res.status(404).json({
        status: false,
        msg: 'Game type not found'
      });
    }
    
    // Delete the game type
    await GameType.findByIdAndDelete(id);
    
    res.status(200).json({
      status: true,
      msg: 'Game type deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting game type:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while deleting game type',
      error: error.message
    });
  }
};

// Update game type
exports.updateGameType = async (req, res) => {
  try {
    const { id } = req.params;
    const { gameType: newGameTypeName, subCategory } = req.body;
          
    
    // Find game type
    const existingGameType = await GameType.findById(id);
    if (!existingGameType) {
      return res.status(404).json({
        status: false,
        msg: 'Game type not found'
      });
    }
    
    // Check if at least one field is provided for update
    if (!newGameTypeName && !subCategory && !req.file && !req.body.image) {
      return res.status(400).json({
        status: false,
        msg: 'No update data provided'
      });
    }
    
    // Update object
    const updateData = {};
    
    // Update name if provided
    if (newGameTypeName) {
      updateData.gameType = newGameTypeName.trim();
    }
    
    // Update subCategory if provided
    if (subCategory) {
      try {
        // Try to parse as JSON (for multiple subcategories)
        updateData.subCategory = JSON.parse(subCategory);
      } catch (e) {
        // If parsing fails, treat as single subcategory
        updateData.subCategory = subCategory.trim();
      }
    }
    
    // Update image if a new file was uploaded or image path was provided
    if (req.file) {
      // If a file was uploaded, use the file path
      updateData.image = `/uploads/gametypes/${req.file.filename}`;
    } else if (req.body.image) {
      // If no file was uploaded, check if an image path was provided in the request body
      updateData.image = req.body.image;
    }
    
    // Update the game type
    const updatedGameType = await GameType.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true } // Return the updated document
    );
    
    // Convert to full URLs before sending response
    const gameTypeWithFullUrl = convertGameTypeToFullUrls(updatedGameType);
    
    res.status(200).json({
      status: true,
      msg: 'Game type updated successfully',
      gameType: gameTypeWithFullUrl
    });
  } catch (error) {
    console.error('Error updating game type:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while updating game type',
      error: error.message
    });
  }
};

// Get slots by game type category
exports.getSlotsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    
    let slotTypes = [];
    
    // Map category to corresponding slot types
    switch(category) {
      case 'full-map':
      case 'full map':
        slotTypes = ['Solo', 'Duo', 'Squad', 'solo', 'duo', 'squad'];
        break;
      case 'clash-squad':
      case 'clash squad':
        slotTypes = ['Clash Squad', 'clash squad'];
        break;
      case 'lone-wolf':
      case 'lone wolf':
        slotTypes = ['Lone Wolf', 'lone wolf'];
        break;
      case 'survival':
        slotTypes = ['Survival', 'survival'];
        break;
      case 'free-matches':
      case 'free matches':
        slotTypes = ['Free Matches', 'free matches'];
        break;
      default:
        return res.status(400).json({
          status: false,
          msg: 'Invalid category. Must be one of: full-map, clash-squad, lone-wolf, survival, free-matches'
        });
    }
    
    // Query slots by the defined slot types and upcoming/live status for active matches
    const slots = await Slot.find({
      slotType: { $in: slotTypes },
      status: { $in: ['upcoming', 'live'] }
    }).sort({ matchTime: 1 });
    
    // Convert slots to include full URLs
    const slotsWithFullUrls = convertSlotsToFullUrls(slots);
    
    res.status(200).json({
      status: true,
      category,
      slotTypes,
      count: slots.length,
      slots: slotsWithFullUrls
    });
  } catch (error) {
    console.error('Error fetching slots by category:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while fetching slots by category',
      error: error.message
    });
  }
};

// Get slots by specific slotType name
exports.getSlotsBySlotType = async (req, res) => {
  try {
    const { id , status} = req.body;

    if (!id) {
      return res.status(400).json({
        status: false,
        msg: 'SlotType parameter is required'
      });
    }

    const slotType = await GameType.findById(id);
    if (!slotType) {
      return res.status(404).json({
        status: false,
        msg: 'Slot type not found'
      });
    }

    // Query slots by the specific slotType name (case-insensitive)
    const slots = await Slot.find({
      slotType: { $regex: new RegExp(slotType.gameType, 'i') },
      status: { $in: [status] }
    }).sort({ matchTime: 1 });
    
    // Convert slots to include full URLs
    const slotsWithFullUrls = convertSlotsToFullUrls(slots);
    
    res.status(200).json({
      status: true,

      count: slots.length,
      slots: slotsWithFullUrls
    });
  } catch (error) {
    console.error('Error fetching slots by slotType:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while fetching slots by slotType',
      error: error.message
    });
  }
};

// Create a new game mode
exports.createGameMode = async (req, res) => {
  try {
    const { gameMode } = req.body;
    
    if (!gameMode) {
      return res.status(400).json({
        status: false,
        msg: 'Game mode name is required'
      });
    }
    
    // Check if game mode already exists
    const existingGameMode = await GameMode.findOne({ 
      gameMode: { $regex: new RegExp('^' + gameMode + '$', 'i') } 
    });
    
    if (existingGameMode) {
      return res.status(400).json({
        status: false,
        msg: 'Game mode already exists'
      });
    }
    
    // Create new game mode - image is optional
    const newGameMode = new GameMode({
      gameMode: gameMode,
      image: req.file ? `/uploads/gamemodes/${req.file.filename}` : '/assets/images/category.png'
    });
    
    await newGameMode.save();
    
    // Convert to include full URLs
    const gameModeWithFullUrl = convertGameModeToFullUrls(newGameMode);
    
    res.status(201).json({
      status: true,
      msg: 'Game mode created successfully',
      gameMode: gameModeWithFullUrl
    });
    
  } catch (error) {
    console.error('Error creating game mode:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while creating game mode',
      error: error.message
    });
  }
};

// Get all game modes
exports.getAllGameModes = async (req, res) => {
  try {
    const gameModes = await GameMode.find({ isActive: true }).sort({ createdAt: -1 });
    
    // Convert game modes to include full URLs
    const gameModesWithFullUrls = convertGameModesToFullUrls(gameModes);
    
    res.status(200).json(gameModesWithFullUrls);
  } catch (error) {
    console.error('Error fetching game modes:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while fetching game modes',
      error: error.message
    });
  }
};

// Delete a game mode
exports.deleteGameMode = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        status: false,
        msg: 'Game mode ID is required'
      });
    }
    
    const gameMode = await GameMode.findById(id);
    
    if (!gameMode) {
      return res.status(404).json({
        status: false,
        msg: 'Game mode not found'
      });
    }
    
    // Soft delete by setting isActive to false
    await GameMode.findByIdAndUpdate(id, { isActive: false });
    
    res.status(200).json({
      status: true,
      msg: 'Game mode deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting game mode:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while deleting game mode',
      error: error.message
    });
  }
};

// Update a game mode
exports.updateGameMode = async (req, res) => {
  try {
    const { id } = req.params;
    const { gameMode } = req.body;
    
    if (!id) {
      return res.status(400).json({
        status: false,
        msg: 'Game mode ID is required'
      });
    }
    
    if (!gameMode) {
      return res.status(400).json({
        status: false,
        msg: 'Game mode name is required'
      });
    }
    
    // Find the existing game mode
    const existingGameMode = await GameMode.findById(id);
    
    if (!existingGameMode) {
      return res.status(404).json({
        status: false,
        msg: 'Game mode not found'
      });
    }
    
    // Check if another game mode with the same name exists (excluding current one)
    const duplicateGameMode = await GameMode.findOne({
      gameMode: { $regex: new RegExp('^' + gameMode + '$', 'i') },
      _id: { $ne: id },
      isActive: true
    });
    
    if (duplicateGameMode) {
      return res.status(400).json({
        status: false,
        msg: 'Another game mode with this name already exists'
      });
    }
    
    // Prepare update object
    const updateData = {
      gameMode: gameMode
    };
    
    // If new image is uploaded, update the image path
    if (req.file) {
      updateData.image = `/uploads/gamemodes/${req.file.filename}`;
    }
    // Update the game mode
    const updatedGameMode = await GameMode.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedGameMode) {
      return res.status(404).json({
        status: false,
        msg: 'Game mode not found'
      });
    }
    
    // Convert to include full URLs
    const gameModeWithFullUrl = convertGameModeToFullUrls(updatedGameMode);
    
    res.status(200).json({
      status: true,
      msg: 'Game mode updated successfully',
      gameMode: gameModeWithFullUrl
    });
    
  } catch (error) {
    console.error('Error updating game mode:', error);
    res.status(500).json({
      status: false,
      msg: 'Server error while updating game mode',
      error: error.message
    });
  }
};
