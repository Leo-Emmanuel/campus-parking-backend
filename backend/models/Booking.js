 // backend/models/Booking.js
const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingZone',
    required: true,
  },
  zoneName: {
    type: String,
    required: true,
  },
  qrCode: {
    type: String,
    required: true,
    unique: true,
  },
  date: {
    type: Date,
    required: true,
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  duration: {
    type: Number, // in hours
    required: true,
  },
  vehicleNumber: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'checked-in', 'checked-out', 'completed', 'cancelled', 'expired'],
    default: 'pending',
  },
  checkInTime: {
    type: Date,
  },
  checkOutTime: {
    type: Date,
  },
  totalAmount: {
    type: Number,
    default: 0,
  },
  violations: [{
    type: {
      type: String,
      enum: ['overstay', 'unauthorized', 'no-checkout', 'other'],
    },
    description: String,
    timestamp: Date,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Auto-generate QR code before saving
bookingSchema.pre('save', function (next) {
  if (!this.qrCode) {
    this.qrCode = `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
