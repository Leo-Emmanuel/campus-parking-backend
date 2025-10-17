// backend/routes/events.js
const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', eventController.getAllEvents);
router.get('/:id', eventController.getEventById);
router.post('/', protect, authorize('admin'), eventController.createEvent);
router.put('/:id', protect, authorize('admin'), eventController.updateEvent);
router.delete('/:id', protect, authorize('admin'), eventController.deleteEvent);
router.post('/:id/book', protect, eventController.bookEventParking);

module.exports = router;
 
