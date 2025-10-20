 // backend/models/ParkingZone.js
const mongoose = require('mongoose');

const parkingZoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  type: {
    type: String,
    enum: ['student', 'staff', 'visitor', 'general', 'event'],
    default: 'general',
  },
  totalSlots: {
    type: Number,
    required: true,
    min: 1,
  },
  availableSlots: {
    type: Number,
    required: true,
  },
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
  },
  pricePerHour: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  amenities: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ParkingZone', parkingZoneSchema);
