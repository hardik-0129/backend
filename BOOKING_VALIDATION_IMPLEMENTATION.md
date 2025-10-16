# Booking Validation Implementation

## Overview
Implemented new functionality for the booking API that enforces a rule: **Users must play at least one paid match before they can join free matches**.

## Changes Made

### 1. Added Helper Function (`hasUserPlayedPaidMatch`)
**File:** `controllers/bookingController.js`
**Lines:** 40-55

```javascript
const hasUserPlayedPaidMatch = async (userId) => {
  try {
    // Check if user has any completed bookings for paid matches (entryFee > 0)
    const paidMatchBookings = await Booking.find({
      user: userId,
      entryFee: { $gt: 0 },
      status: { $in: ['confirmed', 'completed'] }
    }).populate('slot', 'entryFee');
    
    return paidMatchBookings.length > 0;
  } catch (error) {
    console.error('Error checking paid match history:', error);
    return false; // Default to false to be safe
  }
};
```

### 2. Updated Create Booking Function
**File:** `controllers/bookingController.js`
**Lines:** 191-199

Added validation in the `createBooking` function that checks if a user is trying to join a free match without having played any paid matches:

```javascript
// Check if user is trying to join a free match without having played any paid matches
if (isFreeMachatch) {
  const hasPlayedPaidMatch = await hasUserPlayedPaidMatch(user._id);
  if (!hasPlayedPaidMatch) {
    return res.status(400).json({
      msg: "You must play at least one paid match before joining free matches. Please join a paid match first and then you can participate in free matches."
    });
  }
}
```

### 3. Added Update Booking Function
**File:** `controllers/bookingController.js`
**Lines:** 787-968

Created a new `updateBooking` function that includes the same validation logic for updating existing bookings.

### 4. Added Update Booking Route
**File:** `routes/booking.js`
**Line:** 11

```javascript
router.put('/update/:bookingId', authentication, updateBooking);
```

## API Endpoints

### 1. Create Booking (Updated)
- **Method:** POST
- **Endpoint:** `/api/bookings/create`
- **Validation:** Now checks if user has played paid matches before allowing free match bookings

### 2. Update Booking (New)
- **Method:** PUT
- **Endpoint:** `/api/bookings/update/:bookingId`
- **Validation:** Same paid match requirement validation as create booking

## Error Messages

When a user tries to join a free match without having played any paid matches, they will receive:

```json
{
  "msg": "You must play at least one paid match before joining free matches. Please join a paid match first and then you can participate in free matches."
}
```

## How It Works

1. **Free Match Detection:** The system identifies free matches by checking if `entryFee <= 0` or if `slotType` is "free matches"

2. **Paid Match History Check:** When a user tries to book a free match, the system:
   - Queries the database for any existing bookings by the user
   - Filters for bookings with `entryFee > 0` and status `confirmed` or `completed`
   - If no paid match bookings are found, blocks the free match booking

3. **Error Response:** If the user hasn't played any paid matches, they receive a clear error message explaining the requirement

## Database Schema Requirements

The implementation relies on existing database fields:
- `Booking.entryFee` - to distinguish paid vs free matches
- `Booking.status` - to check if matches are confirmed/completed
- `Booking.user` - to identify user's match history

## Testing

A test script has been created at `test-booking-validation.js` to verify the functionality works correctly.

## Benefits

1. **Enforces Business Rule:** Ensures users experience paid matches before accessing free content
2. **Clear Error Messages:** Users understand exactly what they need to do
3. **Backward Compatible:** Existing functionality remains unchanged
4. **Flexible:** Works with both create and update booking operations
5. **Robust:** Includes proper error handling and fallback behavior

## Usage Examples

### Successful Free Match Booking (User has played paid matches)
```javascript
// User has previously booked paid matches
// Now they can book free matches
POST /api/bookings/create
{
  "slotId": "free_match_slot_id",
  "selectedPositions": {"Team 1": ["A"]},
  "playerNames": {"Team 1-A": "Player Name"},
  "totalAmount": 0
}
// Returns: Success response
```

### Blocked Free Match Booking (User hasn't played paid matches)
```javascript
// User has never booked paid matches
// Tries to book free match
POST /api/bookings/create
{
  "slotId": "free_match_slot_id",
  "selectedPositions": {"Team 1": ["A"]},
  "playerNames": {"Team 1-A": "Player Name"},
  "totalAmount": 0
}
// Returns: 400 error with requirement message
```

This implementation successfully addresses the requirement that users must play paid matches before joining free matches, with clear error messaging and robust validation.
