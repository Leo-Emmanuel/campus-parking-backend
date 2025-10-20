// backend/routes/bookings.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, bookingController.createBooking);
router.get('/my-bookings', protect, bookingController.getMyBookings);
router.get('/:id', protect, bookingController.getBookingById);
router.put('/:id/cancel', protect, bookingController.cancelBooking);
router.put('/:id/check-in', protect, bookingController.checkIn);
router.put('/:id/check-out', protect, bookingController.checkOut);
router.get('/qr/:qrCode', bookingController.getBookingByQR);
router.get('/', protect, authorize('admin'), bookingController.getAllBookings);

module.exports = router;
