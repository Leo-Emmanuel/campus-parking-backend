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
  eventDate: {
    type: Date,
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    required: true,
  },
  allocatedZones: [{
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingZone',
    },
    allocatedSlots: Number,
  }],
  totalAllocatedSlots: {
    type: Number,
    required: true,
  },
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
