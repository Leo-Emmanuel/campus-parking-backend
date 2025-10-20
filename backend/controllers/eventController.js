 // backend/controllers/eventController.js
// ============================================
const Event = require('../models/Event');

// @desc    Get all events
// @route   GET /api/events
// @access  Public
exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find({ isActive: true })
      .populate('allocatedZones.zone', 'name code')
      .populate('organizer', 'name email')
      .sort('eventDate');

    res.status(200).json({
      status: 'success',
      results: events.length,
      data: { events },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get event by ID
// @route   GET /api/events/:id
// @access  Public
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('allocatedZones.zone')
      .populate('organizer', 'name email');

    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { event },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create new event
// @route   POST /api/events
// @access  Private/Admin
exports.createEvent = async (req, res) => {
  try {
    const eventData = {
      ...req.body,
      organizer: req.user.id,
    };

    const event = await Event.create(eventData);

    res.status(201).json({
      status: 'success',
      data: { event },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update event
// @route   PUT /api/events/:id
// @access  Private/Admin
exports.updateEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { event },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Private/Admin
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);

    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Event deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Book event parking
// @route   POST /api/events/:id/book
// @access  Private
exports.bookEventParking = async (req, res) => {
  try {
    const { vehicleNumber, duration } = req.body;
    const eventId = req.params.id;

    const event = await Event.findById(eventId).populate('allocatedZones.zone');

    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found',
      });
    }

    if (event.bookedSlots >= event.totalAllocatedSlots) {
      return res.status(400).json({
        status: 'error',
        message: 'No available slots for this event',
      });
    }

    let selectedZone = null;
    for (const allocatedZone of event.allocatedZones) {
      const zone = await ParkingZone.findById(allocatedZone.zone);
      if (zone && zone.availableSlots > 0) {
        selectedZone = zone;
        break;
      }
    }

    if (!selectedZone) {
      return res.status(400).json({
        status: 'error',
        message: 'No available zones for this event',
      });
    }

    const booking = await Booking.create({
      user: req.user.id,
      zone: selectedZone._id,
      bookingDate: event.eventDate,
      startTime: event.startTime,
      duration: duration || 4,
      vehicleNumber,
      status: 'active',
    });

    selectedZone.availableSlots -= 1;
    await selectedZone.save();

    event.bookedSlots += 1;
    await event.save();

    await sendPushNotification(req.user.id, {
      title: 'Event Parking Confirmed',
      message: `Parking confirmed for ${event.name}`,
      data: { bookingId: booking._id.toString(), eventId: event._id.toString(), type: 'event' },
    });

    res.status(201).json({
      status: 'success',
      data: { booking, event },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

