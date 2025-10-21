 // backend/models/Event.js
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
  },
  date: {
    type: Date,
    required: true,
  },
  allocatedSlots: {
    type: Number,
    required: true,
    min: 1,
  },
  zone: {
    type: String,
    trim: true,
  },
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingZone',
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  allocatedZones: [{
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingZone',
    },
    allocatedSlots: Number,
  }],
  bookedSlots: {
    type: Number,
    default: 0,
  },
  eventType: {
    type: String,
    enum: ['conference', 'sports', 'cultural', 'seminar', 'other'],
    default: 'other',
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  specialInstructions: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Event', eventSchema);
