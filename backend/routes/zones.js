// backend/routes/zones.js
const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zoneController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', zoneController.getAllZones);
router.get('/:id', zoneController.getZoneById);
router.post('/', protect, authorize('admin'), zoneController.createZone);
router.put('/:id', protect, authorize('admin'), zoneController.updateZone);
router.delete('/:id', protect, authorize('admin'), zoneController.deleteZone);
router.get('/:id/availability', zoneController.checkAvailability);

module.exports = router; 
