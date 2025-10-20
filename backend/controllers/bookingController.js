// backend/controllers/bookingController.js
const Booking = require('../models/Booking');
const ParkingZone = require('../models/ParkingZone');
const { sendPushNotification } = require('../utils/pushNotification');
const { generateQR } = require('../utils/qrGenerator');

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
  try {
    const { zoneId, bookingDate, startTime, duration, vehicleNumber } = req.body;

    // Check zone availability
    const zone = await ParkingZone.findById(zoneId);
    if (!zone) {
      return res.status(404).json({
        status: 'error',
        message: 'Parking zone not found',
      });
    }

    if (zone.availableSlots <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No available slots in this zone',
      });
    }

    // Create booking
    const booking = await Booking.create({
      user: req.user.id,
      zone: zoneId,
      bookingDate,
      startTime,
      duration,
      vehicleNumber,
      totalAmount: zone.pricePerHour * duration,
      status: 'active',
    });

    // Update zone availability
    zone.availableSlots -= 1;
    await zone.save();

    // Generate QR code
    const qrCodeData = await generateQR(booking.qrCode);

    // Send push notification
    await sendPushNotification(req.user.id, {
      title: 'Booking Confirmed',
      message: `Your parking slot in ${zone.name} has been confirmed`,
      data: { bookingId: booking._id },
    });

    res.status(201).json({
      status: 'success',
      data: {
        booking,
        qrCode: qrCodeData,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get user's bookings
// @route   GET /api/bookings/my-bookings
// @access  Private
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .populate('zone', 'name code type')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      data: { bookings },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private
exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('zone')
      .populate('user', 'name email');

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { booking },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found',
      });
    }

    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to cancel this booking',
      });
    }

    booking.status = 'cancelled';
    await booking.save();

    // Update zone availability
    const zone = await ParkingZone.findById(booking.zone);
    zone.availableSlots += 1;
    await zone.save();

    // Send notification
    await sendPushNotification(booking.user, {
      title: 'Booking Cancelled',
      message: 'Your parking booking has been cancelled',
      data: { bookingId: booking._id },
    });

    res.status(200).json({
      status: 'success',
      data: { booking },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Check-in booking
// @route   PUT /api/bookings/:id/check-in
// @access  Private
exports.checkIn = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found',
      });
    }

    booking.status = 'checked-in';
    booking.checkInTime = new Date();
    await booking.save();

    res.status(200).json({
      status: 'success',
      data: { booking },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Check-out booking
// @route   PUT /api/bookings/:id/check-out
// @access  Private
exports.checkOut = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found',
      });
    }

    booking.status = 'completed';
    booking.checkOutTime = new Date();
    await booking.save();

    // Update zone availability
    const zone = await ParkingZone.findById(booking.zone);
    zone.availableSlots += 1;
    await zone.save();

    res.status(200).json({
      status: 'success',
      data: { booking },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get booking by QR code
// @route   GET /api/bookings/qr/:qrCode
// @access  Public
exports.getBookingByQR = async (req, res) => {
  try {
    const booking = await Booking.findOne({ qrCode: req.params.qrCode })
      .populate('zone')
      .populate('user', 'name email vehicleNumber');

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { booking },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get all bookings (Admin)
// @route   GET /api/bookings
// @access  Private/Admin
exports.getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('zone', 'name code')
      .populate('user', 'name email')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      data: { bookings },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
}; 
