 // backend/controllers/zoneController.js
// ============================================
const ParkingZone = require('../models/ParkingZone');

// @desc    Get all parking zones
// @route   GET /api/zones
// @access  Public
exports.getAllZones = async (req, res) => {
  try {
    const zones = await ParkingZone.find({ isActive: true });
    res.status(200).json({
      status: 'success',
      results: zones.length,
      data: { zones },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Get zone by ID
// @route   GET /api/zones/:id
// @access  Public
exports.getZoneById = async (req, res) => {
  try {
    const zone = await ParkingZone.findById(req.params.id);
    if (!zone) {
      return res.status(404).json({
        status: 'error',
        message: 'Zone not found',
      });
    }
    res.status(200).json({
      status: 'success',
      data: { zone },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Create new parking zone
// @route   POST /api/zones
// @access  Private/Admin
exports.createZone = async (req, res) => {
  try {
    const zone = await ParkingZone.create({
      ...req.body,
      availableSlots: req.body.totalSlots,
    });
    res.status(201).json({
      status: 'success',
      data: { zone },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Update parking zone
// @route   PUT /api/zones/:id
// @access  Private/Admin
exports.updateZone = async (req, res) => {
  try {
    const zone = await ParkingZone.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!zone) {
      return res.status(404).json({
        status: 'error',
        message: 'Zone not found',
      });
    }
    res.status(200).json({
      status: 'success',
      data: { zone },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Delete parking zone
// @route   DELETE /api/zones/:id
// @access  Private/Admin
exports.deleteZone = async (req, res) => {
  try {
    const zone = await ParkingZone.findByIdAndDelete(req.params.id);
    if (!zone) {
      return res.status(404).json({
        status: 'error',
        message: 'Zone not found',
      });
    }
    res.status(200).json({
      status: 'success',
      message: 'Zone deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// @desc    Check zone availability
// @route   GET /api/zones/:id/availability
// @access  Public
exports.checkAvailability = async (req, res) => {
  try {
    const zone = await ParkingZone.findById(req.params.id);
    if (!zone) {
      return res.status(404).json({
        status: 'error',
        message: 'Zone not found',
      });
    }

    const occupancyRate = ((zone.totalSlots - zone.availableSlots) / zone.totalSlots * 100).toFixed(2);

    res.status(200).json({
      status: 'success',
      data: {
        zoneId: zone._id,
        zoneName: zone.name,
        totalSlots: zone.totalSlots,
        availableSlots: zone.availableSlots,
        occupiedSlots: zone.totalSlots - zone.availableSlots,
        occupancyRate: occupancyRate + '%',
        isAvailable: zone.availableSlots > 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};
