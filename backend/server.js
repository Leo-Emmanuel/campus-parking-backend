// Technologies: Node.js + Express + MongoDB + JWT + WebSocket


const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const PDFDocument = require('pdfkit');
const cron = require('node-cron');
const { Expo } = require('expo-server-sdk');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(cors());

// Trust proxy for rate limiting in production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ===== CONFIGURATION =====

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus-parking';
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 5000;

// Validate required environment variables
if (!JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is required');
  process.exit(1);
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later' }
});

app.use('/api/', limiter);

// ===== ROUTE IMPORTS =====
const adminRoutes = require('./routes/adminRoutes');
// Note: Other routes (auth, zones, bookings, events, notifications) are defined inline below
// The modular route files exist but are not used in favor of inline definitions with WebSocket support

// ===== ROUTE MOUNTING =====
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Campus Parking API is running',
    websocket: wss.clients.size > 0 ? 'active' : 'no clients',
    connectedClients: wss.clients.size,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ===== MONGODB CONNECTION =====

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// ===== PUSH NOTIFICATION SETUP =====

const expo = new Expo();

// Helper function to send push notifications
async function sendPushNotification(pushToken, title, body, data = {}) {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`Push token ${pushToken} is not a valid Expo push token`);
    return;
  }

  const messages = [{
    to: pushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  }];

  try {
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending push notification chunk:', error);
      }
    }
    
    console.log('Push notification sent successfully:', tickets);
    return tickets;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

// ===== WEBSOCKET SETUP =====

const wss = new WebSocket.Server({ 
  server,
  clientTracking: true,
  perMessageDeflate: false
});

const clients = new Set();

// WebSocket connection cleanup interval
setInterval(() => {
  clients.forEach(client => {
    if (client.readyState !== WebSocket.OPEN) {
      clients.delete(client);
    }
  });
}, 30000); // Clean up every 30 seconds

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected. Total clients:', clients.size + 1);
  clients.add(ws);

  // Set connection timeout
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('WebSocket message received:', data);
      
      if (data.type === 'subscribe') {
        console.log('Client subscribed to channel:', data.channel);
        ws.channel = data.channel;
      }
    } catch (error) {
      console.error('WebSocket message parse error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected. Total clients:', clients.size - 1);
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });

  // Send welcome message
  try {
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established',
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Failed to send welcome message:', error);
  }
});

// WebSocket heartbeat to detect broken connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      clients.delete(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Broadcast function with error handling
function broadcast(data) {
  const message = JSON.stringify(data);
  let sentCount = 0;
  const deadClients = [];
  
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        sentCount++;
      } catch (error) {
        console.error('Broadcast error to client:', error.message);
        deadClients.push(client);
      }
    } else {
      deadClients.push(client);
    }
  });
  
  // Clean up dead clients
  deadClients.forEach(client => clients.delete(client));
  
  console.log(`Broadcast sent to ${sentCount} clients:`, data.type);
}

// Helper to get current zone availability
async function getZoneAvailability(zoneId, session = null) {
  const query = Zone.findById(zoneId);
  const zone = session ? await query.session(session) : await query;
  
  if (!zone) return null;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const countQuery = Booking.countDocuments({
    zoneId,
    status: 'active',
    date: { $gte: startOfDay, $lte: endOfDay },
  });

  const activeBookings = session ? 
    await countQuery.session(session) : 
    await countQuery;

  return {
    id: zone._id,
    name: zone.name,
    total: zone.totalSlots,
    available: Math.max(0, zone.totalSlots - activeBookings),
    type: zone.type,
  };
}

// ===== MODELS =====
// Import models from separate files to avoid redefinition
const User = require('./models/User');
const Zone = require('./models/ParkingZone');
const Booking = require('./models/Booking');
const Notification = require('./models/Notification');
const Event = require('./models/Event');

// ===== MIDDLEWARE =====

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: 'Validation failed',
      errors: errors.array() 
    });
  }
  next();
};

// ===== HELPER FUNCTIONS =====

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  return 'Just now';
}

// Generate unique QR code
function generateQRCode() {
  return `QR-${uuidv4().split('-')[0].toUpperCase()}`;
}

// ===== VALIDATION RULES =====

const signupValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email format'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['student', 'staff', 'admin', 'visitor']).withMessage('Invalid role'),
  body('phone').optional().matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
  body('vehicleNumber').optional().trim().isLength({ max: 20 })
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  body('role').isIn(['student', 'staff', 'admin', 'visitor'])
];

const bookingValidation = [
  body('userId').isMongoId(),
  body('zoneId').isMongoId(),
  body('zoneName').trim().notEmpty(),
  body('date').isISO8601(),
  body('duration').isInt({ min: 1, max: 24 }),
  body('vehicleNumber').optional().trim().isLength({ max: 20 })
];

// ===== AUTH ROUTES =====

app.post('/api/auth/signup', signupValidation, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password, role, phone, vehicleNumber } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      phone,
      vehicleNumber,
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role }, 
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await Notification.create({
      userId: user._id,
      title: 'Welcome to Campus Parking!',
      message: 'Your account has been created successfully',
      type: 'success',
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        vehicleNumber: user.vehicleNumber,
      },
      token,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Server error during signup' });
  }
});

app.post('/api/auth/login', loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Explicitly select password field since it's set to select: false in the model
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.role !== role) {
      return res.status(400).json({ success: false, message: 'Invalid role selected' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role }, 
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        vehicleNumber: user.vehicleNumber,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ===== PARKING ZONE ROUTES =====

app.get('/api/zones', async (req, res) => {
  try {
    const zones = await Zone.find();
    
    const zonesWithAvailability = await Promise.all(
      zones.map(async (zone) => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const activeBookings = await Booking.countDocuments({
          zoneId: zone._id,
          status: 'active',
          date: { $gte: startOfDay, $lte: endOfDay },
        });

        // Calculate total event slot allocations for this zone
        const eventAllocations = await Event.aggregate([
          { 
            $match: { 
              zoneId: zone._id,
              date: { $gte: startOfDay }
            } 
          },
          { 
            $group: { 
              _id: null, 
              total: { $sum: '$allocatedSlots' } 
            } 
          }
        ]);
        const totalEventSlots = eventAllocations.length > 0 ? eventAllocations[0].total : 0;

        return {
          id: zone._id,
          name: zone.name,
          code: zone.code,
          total: zone.totalSlots,
          available: Math.max(0, zone.totalSlots - activeBookings - totalEventSlots),
          type: zone.type,
          location: zone.location?.address || zone.location,
        };
      })
    );

    res.json(zonesWithAvailability);
  } catch (error) {
    console.error('Get zones error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching zones' });
  }
});

app.get('/api/zones/:zoneId/availability', async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { date } = req.query;

    if (!mongoose.Types.ObjectId.isValid(zoneId)) {
      return res.status(400).json({ success: false, message: 'Invalid zone ID' });
    }

    const zone = await Zone.findById(zoneId);
    if (!zone) {
      return res.status(404).json({ success: false, message: 'Zone not found' });
    }

    const bookingDate = new Date(date);
    if (isNaN(bookingDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }

    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);

    const activeBookings = await Booking.countDocuments({
      zoneId,
      status: 'active',
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    const available = Math.max(0, zone.totalSlots - activeBookings);

    res.json({
      success: true,
      zone: {
        id: zone._id,
        name: zone.name,
        total: zone.totalSlots,
        available,
        booked: activeBookings,
      },
    });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({ success: false, message: 'Server error checking availability' });
  }
});

app.post('/api/zones', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    // Prepare zone data with required fields
    const zoneData = {
      ...req.body,
      totalSlots: req.body.total || req.body.totalSlots,
      availableSlots: req.body.total || req.body.totalSlots,
    };

    // Auto-generate code if not provided
    if (!zoneData.code) {
      const prefix = (zoneData.type || 'general').substring(0, 3).toUpperCase();
      const timestamp = Date.now().toString().slice(-4);
      zoneData.code = `${prefix}-${timestamp}`;
    }

    const zone = new Zone(zoneData);
    await zone.save();

    broadcast({
      type: 'zone_created',
      zone: {
        id: zone._id,
        name: zone.name,
        total: zone.totalSlots,
        available: zone.totalSlots,
        type: zone.type,
        location: zone.location,
      }
    });

    res.json({ success: true, zone });
  } catch (error) {
    console.error('Create zone error:', error);
    res.status(500).json({ success: false, message: 'Server error creating zone' });
  }
});

app.patch('/api/zones/:zoneId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.zoneId)) {
      return res.status(400).json({ success: false, message: 'Invalid zone ID' });
    }

    const currentZone = await Zone.findById(req.params.zoneId);
    if (!currentZone) {
      return res.status(404).json({ success: false, message: 'Zone not found' });
    }

    // Map 'total' to 'totalSlots' if provided
    const updateData = { ...req.body };
    if (updateData.total !== undefined) {
      updateData.totalSlots = updateData.total;
      delete updateData.total;
    }

    // If totalSlots is being updated, recalculate availableSlots based on current bookings
    if (updateData.totalSlots !== undefined && updateData.totalSlots !== currentZone.totalSlots) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const activeBookings = await Booking.countDocuments({
        zoneId: req.params.zoneId,
        status: 'active',
        date: { $gte: startOfDay, $lte: endOfDay },
      });

      updateData.availableSlots = Math.max(0, updateData.totalSlots - activeBookings);
    }

    const zone = await Zone.findByIdAndUpdate(
      req.params.zoneId,
      updateData,
      { new: true, runValidators: true }
    );

    const zoneData = await getZoneAvailability(zone._id);
    broadcast({
      type: 'zone_update',
      zoneId: zone._id,
      available: zoneData.available
    });

    res.json({ success: true, zone });
  } catch (error) {
    console.error('Update zone error:', error);
    res.status(500).json({ success: false, message: 'Server error updating zone' });
  }
});

app.delete('/api/zones/:zoneId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.zoneId)) {
      return res.status(400).json({ success: false, message: 'Invalid zone ID' });
    }

    const activeBookings = await Booking.countDocuments({
      zoneId: req.params.zoneId,
      status: 'active',
    });

    if (activeBookings > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete zone with active bookings',
      });
    }

    await Zone.findByIdAndDelete(req.params.zoneId);
    
    broadcast({
      type: 'zone_deleted',
      zoneId: req.params.zoneId
    });

    res.json({ success: true, message: 'Zone deleted successfully' });
  } catch (error) {
    console.error('Delete zone error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting zone' });
  }
});

// ===== BOOKING ROUTES (WITH TRANSACTION) =====

app.get('/api/bookings/user/:userId', authenticateToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const bookings = await Booking.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .populate('zoneId', 'name')
      .limit(100);

    const formattedBookings = bookings.map((booking) => ({
      id: booking._id,
      zone: booking.zoneName,
      date: booking.date.toISOString().split('T')[0],
      time: booking.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      status: booking.status,
      qrCode: booking.qrCode,
      duration: booking.duration,
    }));

    res.json(formattedBookings);
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching bookings' });
  }
});

app.post('/api/bookings', authenticateToken, bookingValidation, handleValidationErrors, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { userId, zoneId, zoneName, date, duration, vehicleNumber } = req.body;

    // Verify user owns this booking
    if (req.user.id !== userId) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const zone = await Zone.findById(zoneId).session(session);
    if (!zone) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Zone not found' });
    }

    // Role-based zone access control
    const userRole = req.user.role;
    const zoneType = zone.type;
    
    const accessRules = {
      student: ['student', 'general'],
      staff: ['staff', 'student', 'general'],
      visitor: ['visitor', 'general'],
      admin: ['student', 'staff', 'visitor', 'general', 'event']
    };

    const allowedZones = accessRules[userRole] || ['general'];
    
    if (!allowedZones.includes(zoneType)) {
      await session.abortTransaction();
      return res.status(403).json({ 
        success: false, 
        message: `${userRole.charAt(0).toUpperCase() + userRole.slice(1)}s are not allowed to book ${zoneType} parking zones` 
      });
    }

    const bookingDate = new Date(date);
    const startOfDay = new Date(bookingDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Check for existing booking by this user for same zone and date
    const existingBooking = await Booking.findOne({
      userId,
      zoneId,
      status: 'active',
      date: { $gte: startOfDay, $lte: endOfDay },
    }).session(session);

    if (existingBooking) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'You already have an active booking for this zone on this date' 
      });
    }

    const activeBookings = await Booking.countDocuments({
      zoneId,
      status: 'active',
      date: { $gte: startOfDay, $lte: endOfDay },
    }).session(session);

    if (activeBookings >= zone.totalSlots) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'No slots available for this date' });
    }

    const qrCode = generateQRCode();

    // Calculate start and end times
    const startTime = new Date(bookingDate);
    startTime.setHours(8, 0, 0, 0); // Default start time 8:00 AM
    
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + duration);

    const booking = new Booking({
      userId,
      zoneId,
      zoneName,
      date: bookingDate,
      startTime: startTime,
      endTime: endTime,
      duration,
      vehicleNumber,
      qrCode,
      status: 'active',
    });

    await booking.save({ session });

    await Notification.create([{
      userId,
      title: 'Booking Confirmed',
      message: `Your parking slot at ${zoneName} has been confirmed for ${date}`,
      type: 'success',
    }], { session });

    await session.commitTransaction();

    const newAvailable = Math.max(0, zone.totalSlots - (activeBookings + 1));

    broadcast({
      type: 'zone_update',
      zoneId: zoneId,
      available: newAvailable
    });

    broadcast({
      type: 'booking_created',
      userId: userId,
      zoneName: zoneName,
      timestamp: new Date()
    });

    // Send push notification
    try {
      const user = await User.findById(userId);
      if (user && user.pushToken) {
        await sendPushNotification(
          user.pushToken,
          'Booking Confirmed! 🎉',
          `Your parking slot at ${zoneName} has been confirmed for ${date}`,
          { screen: 'bookings' }
        );
      }
    } catch (pushError) {
      console.error('Error sending push notification:', pushError);
      // Don't fail the booking if push notification fails
    }

    res.json({
      success: true,
      booking: {
        id: booking._id,
        zone: zoneName,
        date: date,
        qrCode: qrCode,
        status: 'active',
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, message: 'Server error creating booking' });
  } finally {
    session.endSession();
  }
});

app.delete('/api/bookings/:bookingId', authenticateToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.bookingId)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Booking already cancelled' });
    }

    const zoneId = booking.zoneId;
    const zoneName = booking.zoneName;

    booking.status = 'cancelled';
    await booking.save();

    await Notification.create({
      userId: booking.userId,
      title: 'Booking Cancelled',
      message: `Your parking slot at ${booking.zoneName} has been cancelled`,
      type: 'warning',
    });

    const zoneData = await getZoneAvailability(zoneId);

    broadcast({
      type: 'zone_update',
      zoneId: zoneId,
      available: zoneData.available
    });

    broadcast({
      type: 'booking_cancelled',
      userId: booking.userId.toString(),
      zoneName: zoneName,
      timestamp: new Date()
    });

    res.json({ success: true, message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ success: false, message: 'Server error cancelling booking' });
  }
});

app.patch('/api/bookings/:bookingId/extend', authenticateToken, async (req, res) => {
  try {
    const { additionalHours } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.bookingId)) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    if (!additionalHours || additionalHours < 1 || additionalHours > 12) {
      return res.status(400).json({ 
        success: false, 
        message: 'Additional hours must be between 1 and 12' 
      });
    }

    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (booking.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Can only extend active bookings' });
    }

    booking.duration += parseInt(additionalHours);
    await booking.save();

    await Notification.create({
      userId: booking.userId,
      title: 'Booking Extended',
      message: `Your booking at ${booking.zoneName} has been extended by ${additionalHours} hours`,
      type: 'success',
    });

    broadcast({
      type: 'notification',
      userId: booking.userId.toString(),
      title: 'Booking Extended',
      message: `Booking extended by ${additionalHours} hours`,
      notificationType: 'success'
    });

    res.json({ success: true, booking });
  } catch (error) {
    console.error('Extend booking error:', error);
    res.status(500).json({ success: false, message: 'Server error extending booking' });
  }
});

app.post('/api/bookings/checkin', authenticateToken, async (req, res) => {
  try {
    const { qrCode } = req.body;

    if (!qrCode || typeof qrCode !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid QR code required' });
    }

    const booking = await Booking.findOne({ qrCode, status: 'active' });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Invalid QR code or booking not active' });
    }

    if (booking.checkInTime) {
      return res.status(400).json({ success: false, message: 'Already checked in' });
    }

    booking.checkInTime = new Date();
    await booking.save();

    await Notification.create({
      userId: booking.userId,
      title: 'Check-in Successful',
      message: `You have checked in at ${booking.zoneName}`,
      type: 'success',
    });

    broadcast({
      type: 'notification',
      userId: booking.userId.toString(),
      title: 'Check-in Successful',
      message: `Checked in at ${booking.zoneName}`,
      notificationType: 'success'
    });

    res.json({ success: true, message: 'Check-in successful', booking });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ success: false, message: 'Server error during check-in' });
  }
});

app.post('/api/bookings/checkout', authenticateToken, async (req, res) => {
  try {
    const { qrCode } = req.body;

    if (!qrCode || typeof qrCode !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid QR code required' });
    }

    const booking = await Booking.findOne({ qrCode, status: 'active' });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Invalid QR code or booking not active' });
    }

    if (!booking.checkInTime) {
      return res.status(400).json({ success: false, message: 'Please check-in first' });
    }

    if (booking.checkOutTime) {
      return res.status(400).json({ success: false, message: 'Already checked out' });
    }

    const zoneId = booking.zoneId;
    const zoneName = booking.zoneName;

    booking.checkOutTime = new Date();
    booking.status = 'completed';
    await booking.save();

    await Notification.create({
      userId: booking.userId,
      title: 'Check-out Successful',
      message: `You have checked out from ${booking.zoneName}`,
      type: 'success',
    });

    const zoneData = await getZoneAvailability(zoneId);

    broadcast({
      type: 'zone_update',
      zoneId: zoneId,
      available: zoneData.available
    });

    broadcast({
      type: 'notification',
      userId: booking.userId.toString(),
      title: 'Check-out Successful',
      message: `Checked out from ${zoneName}`,
      notificationType: 'success'
    });

    res.json({ success: true, message: 'Check-out successful', booking });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ success: false, message: 'Server error during check-out' });
  }
});

app.get('/api/bookings/history', authenticateToken, async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    let query = { userId: req.user.id };

    if (status && ['active', 'completed', 'cancelled'].includes(status)) {
      query.status = status;
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.date = { $gte: start, $lte: end };
      }
    }

    const bookings = await Booking.find(query)
      .sort({ date: -1 })
      .populate('zoneId', 'name type')
      .limit(100);

    res.json({ success: true, bookings });
  } catch (error) {
    console.error('Get booking history error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching history' });
  }
});

// ===== NOTIFICATION ROUTES =====

app.get('/api/notifications/:userId', authenticateToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (req.user.id !== req.params.userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const notifications = await Notification.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const formattedNotifications = notifications.map((notif) => ({
      id: notif._id,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      time: getTimeAgo(notif.createdAt),
      read: notif.read,
      createdAt: notif.createdAt
    }));

    res.json(formattedNotifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notifications' });
  }
});

app.patch('/api/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.notificationId)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const notification = await Notification.findById(req.params.notificationId);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (notification.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    notification.read = true;
    await notification.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, message: 'Server error updating notification' });
  }
});

app.post('/api/notifications/send', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { userId, title, message, type } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId, title, and message are required' 
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const notification = new Notification({
      userId,
      title,
      message,
      type: type || 'info',
    });

    await notification.save();

    broadcast({
      type: 'notification',
      userId: userId,
      title: title,
      message: message,
      notificationType: type || 'info'
    });

    res.json({ success: true, notification });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ success: false, message: 'Server error sending notification' });
  }
});

app.post('/api/notifications/broadcast', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { title, message, type, role } = req.body;

    if (!title || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'title and message are required' 
      });
    }

    let query = {};
    if (role && ['student', 'staff', 'admin', 'visitor'].includes(role)) {
      query.role = role;
    }
    
    const users = await User.find(query).select('_id');

    if (users.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No users found matching criteria' 
      });
    }

    const notifications = users.map(user => ({
      userId: user._id,
      title,
      message,
      type: type || 'info',
    }));

    await Notification.insertMany(notifications);

    broadcast({
      type: 'notification',
      title: title,
      message: message,
      notificationType: type || 'info',
      broadcast: true
    });

    res.json({
      success: true,
      message: `Notification sent to ${users.length} users`,
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({ success: false, message: 'Server error broadcasting notification' });
  }
});

// ===== EVENT ROUTES =====

app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const events = await Event.find().sort({ date: 1 });

    const formattedEvents = events.map((event) => ({
      id: event._id,
      name: event.name,
      date: event.date ? event.date.toISOString().split('T')[0] : 'N/A',
      allocatedSlots: event.allocatedSlots,
      zone: event.zone,
      description: event.description,
    }));

    res.json(formattedEvents);
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching events' });
  }
});

app.post('/api/events', authenticateToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    if (req.user.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { name, date, allocatedSlots, zone, zoneId } = req.body;

    if (!name || !date || allocatedSlots === undefined) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'name, date, and allocatedSlots are required' 
      });
    }

    const allocatedSlotsNum = parseInt(allocatedSlots);
    if (isNaN(allocatedSlotsNum) || allocatedSlotsNum <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        message: 'allocatedSlots must be a positive number' 
      });
    }

    // Validate and update zone if provided
    let zoneDoc = null;
    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
      zoneDoc = await Zone.findById(zoneId).session(session);
      if (!zoneDoc) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: 'Selected zone does not exist' 
        });
      }

      // Check if zone has enough available slots
      const activeBookings = await Booking.countDocuments({
        zoneId: zoneId,
        status: 'active',
        date: { $gte: new Date() }
      }).session(session);

      const currentAvailable = Math.max(0, zoneDoc.totalSlots - activeBookings);

      if (currentAvailable < allocatedSlotsNum) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: `Not enough available slots in ${zone}. Available: ${currentAvailable}, Requested: ${allocatedSlotsNum}` 
        });
      }

      // Reduce zone availability by allocated slots
      // We don't actually change totalSlots, but the available count will reflect this
      // when calculating: available = totalSlots - activeBookings - allocatedSlots
    }

    const event = new Event({
      name,
      date,
      allocatedSlots: allocatedSlotsNum,
      zone,
      zoneId,
      description: req.body.description,
      organizer: req.user.id,
    });
    
    await event.save({ session });
    await session.commitTransaction();

    // Broadcast zone update if zone was specified
    if (zoneDoc) {
      const activeBookings = await Booking.countDocuments({
        zoneId: zoneId,
        status: 'active',
        date: { $gte: new Date() }
      });

      // Calculate new available considering event allocation
      const eventAllocations = await Event.aggregate([
        { $match: { zoneId: new mongoose.Types.ObjectId(zoneId), date: { $gte: new Date() } } },
        { $group: { _id: null, total: { $sum: '$allocatedSlots' } } }
      ]);
      const totalEventSlots = eventAllocations.length > 0 ? eventAllocations[0].total : 0;

      const newAvailable = Math.max(0, zoneDoc.totalSlots - activeBookings - totalEventSlots);

      broadcast({
        type: 'zone_update',
        zoneId: zoneId,
        available: newAvailable
      });
    }

    res.json({ success: true, event });
  } catch (error) {
    await session.abortTransaction();
    console.error('Create event error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error creating event' 
    });
  } finally {
    session.endSession();
  }
});

app.patch('/api/events/:eventId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) {
      return res.status(400).json({ success: false, message: 'Invalid event ID' });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.eventId,
      req.body,
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, event });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ success: false, message: 'Server error updating event' });
  }
});

app.delete('/api/events/:eventId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) {
      return res.status(400).json({ success: false, message: 'Invalid event ID' });
    }

    const event = await Event.findByIdAndDelete(req.params.eventId);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Broadcast zone update to restore availability
    if (event.zoneId) {
      const zone = await Zone.findById(event.zoneId);
      if (zone) {
        const activeBookings = await Booking.countDocuments({
          zoneId: event.zoneId,
          status: 'active',
          date: { $gte: new Date() }
        });

        // Recalculate event allocations (excluding the deleted event)
        const eventAllocations = await Event.aggregate([
          { $match: { zoneId: event.zoneId, date: { $gte: new Date() } } },
          { $group: { _id: null, total: { $sum: '$allocatedSlots' } } }
        ]);
        const totalEventSlots = eventAllocations.length > 0 ? eventAllocations[0].total : 0;

        const newAvailable = Math.max(0, zone.totalSlots - activeBookings - totalEventSlots);

        broadcast({
          type: 'zone_update',
          zoneId: event.zoneId.toString(),
          available: newAvailable
        });
      }
    }

    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting event' });
  }
});

// ===== ADMIN ROUTES =====

app.get('/api/admin/bookings', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { status, zoneId, startDate, endDate, page = 1, limit = 50 } = req.query;
    let query = {};

    if (status && ['active', 'completed', 'cancelled'].includes(status)) {
      query.status = status;
    }

    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
      query.zoneId = zoneId;
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        query.date = { $gte: start, $lte: end };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(query)
      .populate('userId', 'name email vehicleNumber')
      .populate('zoneId', 'name type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.json({ 
      success: true, 
      bookings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching bookings' });
  }
});

app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { role, page = 1, limit = 50 } = req.query;
    let query = {};
    
    if (role && ['student', 'staff', 'admin', 'visitor'].includes(role)) {
      query.role = role;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({ 
      success: true, 
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching users' });
  }
});

app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const [totalUsers, totalBookings, activeBookings, totalZones] = await Promise.all([
      User.countDocuments(),
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'active' }),
      Zone.countDocuments()
    ]);

    const revenue = totalBookings * 5;

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalBookings,
        activeBookings,
        totalZones,
        revenue,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
});

app.get('/api/analytics/overview', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      todayBookings,
      activeToday,
      totalBookings,
      totalUsers,
      totalZones,
      bookingsByZone,
      bookingsByStatus
    ] = await Promise.all([
      Booking.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
      Booking.countDocuments({ date: { $gte: today, $lt: tomorrow }, status: 'active' }),
      Booking.countDocuments(),
      User.countDocuments(),
      Zone.countDocuments(),
      Booking.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$zoneName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      Booking.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const totalRevenue = totalBookings * 5;

    res.json({
      success: true,
      analytics: {
        todayBookings,
        activeToday,
        totalBookings,
        totalUsers,
        totalZones,
        totalRevenue,
        bookingsByZone,
        bookingsByStatus,
      },
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching analytics' });
  }
});

// ===== USER PROFILE ROUTES =====

app.get('/api/users/:userId', authenticateToken, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (req.user.id !== req.params.userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const user = await User.findById(req.params.userId).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching user' });
  }
});

app.patch('/api/users/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, phone, vehicleNumber } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (vehicleNumber !== undefined) updateData.vehicleNumber = vehicleNumber;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
});

app.post('/api/users/:userId/push-token', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { pushToken } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (!pushToken) {
      return res.status(400).json({ success: false, message: 'Push token is required' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { pushToken },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`Push token registered for user ${user.email}: ${pushToken}`);
    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    console.error('Register push token error:', error);
    res.status(500).json({ success: false, message: 'Server error registering push token' });
  }
});

// Test endpoint to manually send push notification
app.post('/api/test/push-notification', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user || !user.pushToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'No push token found for user. Please login again to register token.' 
      });
    }

    await sendPushNotification(
      user.pushToken,
      'Test Notification 🔔',
      'This is a test push notification from Campus Parking!',
      { screen: 'notifications' }
    );

    res.json({ 
      success: true, 
      message: 'Test notification sent!',
      pushToken: user.pushToken
    });
  } catch (error) {
    console.error('Test push notification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error sending test notification',
      error: error.message
    });
  }
});

// ===== UTILITY ROUTES =====

app.get('/api/ws/status', (req, res) => {
  res.json({
    success: true,
    connectedClients: wss.clients.size,
    timestamp: new Date().toISOString(),
  });
});

// ===== SEED DATABASE =====

async function seedDatabase() {
  try {
    const existingZones = await Zone.countDocuments();
    if (existingZones > 0) {
      console.log('Database already seeded');
      return;
    }

    console.log('Seeding database...');

    const zones = [
      { 
        name: 'Zone A - Main Campus', 
        code: 'ZONE-A', 
        totalSlots: 50, 
        availableSlots: 50, 
        type: 'student', 
        location: { address: 'Building A' } 
      },
      { 
        name: 'Zone B - Faculty Block', 
        code: 'ZONE-B', 
        totalSlots: 30, 
        availableSlots: 30, 
        type: 'staff', 
        location: { address: 'Building B' } 
      },
      { 
        name: 'Zone C - Library', 
        code: 'ZONE-C', 
        totalSlots: 40, 
        availableSlots: 40, 
        type: 'general', 
        location: { address: 'Library' } 
      },
      { 
        name: 'Zone D - Visitor Parking', 
        code: 'ZONE-D', 
        totalSlots: 20, 
        availableSlots: 20, 
        type: 'visitor', 
        location: { address: 'Main Gate' } 
      },
    ];

    await Zone.insertMany(zones);
    console.log('✓ Parking zones created');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@campus.edu' });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        name: 'Admin User',
        email: 'admin@campus.edu',
        password: hashedPassword,
        role: 'admin',
        phone: '1234567890'
      });
      console.log('✓ Admin user created (email: admin@campus.edu, password: admin123)');
    } else {
      console.log('✓ Admin user already exists');
    }

    // Check if events already exist
    const existingEvents = await Event.countDocuments();
    if (existingEvents === 0) {
      const events = [
        {
          name: 'Tech Fest 2025',
          date: new Date('2025-10-15'),
          allocatedSlots: 100,
          zone: 'Zone E - Event Area',
          description: 'Annual technology festival',
        },
        {
          name: 'Sports Day',
          date: new Date('2025-10-20'),
          allocatedSlots: 75,
          zone: 'Zone F - Sports Complex',
          description: 'Inter-college sports competition',
        },
      ];

      await Event.insertMany(events);
      console.log('✓ Sample events created');
    } else {
      console.log('✓ Events already exist');
    }

    console.log('Database seeding completed!');
  } catch (error) {
    console.error('Seed error:', error);
  }
}

// ===== ADMIN REPORTS ROUTES =====

/**
 * @route GET /api/admin/reports
 * @description Get comprehensive admin reports with date range filtering
 * @access Private (Admin only)
 */
app.get('/api/admin/reports', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { startDate, endDate } = req.query;
    
    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date and end date are required' 
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid date format. Use ISO format (YYYY-MM-DD)' 
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be after end date'
      });
    }

    // Set end date to end of day
    end.setHours(23, 59, 59, 999);

    // Fetch users registered within date range (exclude admin users)
    const users = await User.find({
      createdAt: { $gte: start, $lte: end },
      role: { $ne: 'admin' }
    })
      .select('name email role phone vehicleNumber createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Fetch events within date range
    const events = await Event.find({
      date: { $gte: start, $lte: end }
    })
      .select('name date allocatedSlots zone description createdAt')
      .sort({ date: -1 })
      .lean();

    // Fetch bookings within date range
    const bookings = await Booking.find({
      date: { $gte: start, $lte: end }
    })
      .populate('userId', 'name email phone')
      .populate('zoneId', 'name type')
      .select('userId zoneId zoneName date duration vehicleNumber status qrCode checkInTime checkOutTime createdAt')
      .sort({ date: -1 })
      .lean();

    // Get active events count (events that haven't ended yet)
    const activeEvents = await Event.countDocuments({
      date: { $gte: new Date() }
    });

    // Format users data
    const formattedUsers = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department || 'N/A',
      phone: user.phone || 'N/A',
      vehicleNumber: user.vehicleNumber || 'N/A',
      registrationDate: user.createdAt
    }));

    // Format events data
    const formattedEvents = events.map(event => ({
      id: event._id,
      title: event.name,
      date: event.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      location: event.zone || 'N/A',
      allocatedSlots: event.allocatedSlots,
      description: event.description || ''
    }));

    // Format bookings data
    const formattedBookings = bookings.map(booking => ({
      id: booking._id,
      user: booking.userId?.name || 'Unknown User',
      userEmail: booking.userId?.email || 'N/A',
      zone: booking.zoneName || booking.zoneId?.name || 'N/A',
      spot: booking.zoneId?.type || 'N/A',
      date: booking.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      duration: `${booking.duration} hours`,
      vehicleNumber: booking.vehicleNumber || 'N/A',
      status: booking.status,
      qrCode: booking.qrCode,
      checkInTime: booking.checkInTime ? new Date(booking.checkInTime).toLocaleString() : 'Not checked in',
      checkOutTime: booking.checkOutTime ? new Date(booking.checkOutTime).toLocaleString() : 'Not checked out'
    }));

    // Calculate summary statistics
    const summary = {
      totalUsers: formattedUsers.length,
      totalBookings: formattedBookings.length,
      activeEvents: activeEvents,
      totalRevenue: formattedBookings.length * 5, // Assuming $5 per booking
      activeBookings: formattedBookings.filter(b => b.status === 'active').length,
      completedBookings: formattedBookings.filter(b => b.status === 'completed').length,
      cancelledBookings: formattedBookings.filter(b => b.status === 'cancelled').length
    };

    // Calculate bookings by zone
    const bookingsByZone = {};
    formattedBookings.forEach(booking => {
      const zoneName = booking.zone;
      if (!bookingsByZone[zoneName]) {
        bookingsByZone[zoneName] = 0;
      }
      bookingsByZone[zoneName]++;
    });

    // Calculate user statistics by role
    const usersByRole = {
      student: formattedUsers.filter(u => u.role === 'student').length,
      staff: formattedUsers.filter(u => u.role === 'staff').length,
      visitor: formattedUsers.filter(u => u.role === 'visitor').length
    };

    // Send response
    res.status(200).json({
      success: true,
      data: {
        summary: {
          ...summary,
          usersByRole,
          bookingsByZone
        },
        users: formattedUsers,
        events: formattedEvents,
        bookings: formattedBookings,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString()
        },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching admin reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route GET /api/admin/reports/summary
 * @description Get quick summary statistics for dashboard
 * @access Private (Admin only)
 */
app.get('/api/admin/reports/summary', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalUsers,
      totalBookings,
      activeBookings,
      todayBookings,
      totalZones,
      upcomingEvents
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'active' }),
      Booking.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
      Zone.countDocuments(),
      Event.countDocuments({ date: { $gte: today } })
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalBookings,
        activeBookings,
        todayBookings,
        totalZones,
        upcomingEvents,
        totalRevenue: totalBookings * 5
      }
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching summary data'
    });
  }
});

/**
 * @route GET /api/admin/reports/analytics
 * @description Get detailed analytics for charts and graphs
 * @access Private (Admin only)
 */
app.get('/api/admin/reports/analytics', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Bookings trend over time
    const bookingsTrend = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Bookings by zone
    const bookingsByZone = await Booking.aggregate([
      {
        $match: {
          status: 'active',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$zoneName',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Bookings by status
    const bookingsByStatus = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // User registrations trend
    const usersTrend = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          role: { $ne: 'admin' }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Peak booking hours
    const peakHours = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        bookingsTrend,
        bookingsByZone,
        bookingsByStatus,
        usersTrend,
        peakHours
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics data'
    });
  }
});

/**
 * @route GET /api/admin/reports/export
 * @description Export data for external processing
 * @access Private (Admin only)
 */
app.get('/api/admin/reports/export', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { startDate, endDate, type = 'all' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let data = {};

    if (type === 'users' || type === 'all') {
      data.users = await User.find({
        createdAt: { $gte: start, $lte: end },
        role: { $ne: 'admin' }
      })
        .select('-password')
        .lean();
    }

    if (type === 'bookings' || type === 'all') {
      data.bookings = await Booking.find({
        date: { $gte: start, $lte: end }
      })
        .populate('userId', 'name email')
        .populate('zoneId', 'name type')
        .lean();
    }

    if (type === 'events' || type === 'all') {
      data.events = await Event.find({
        date: { $gte: start, $lte: end }
      }).lean();
    }

    res.json({
      success: true,
      data,
      metadata: {
        exportedAt: new Date().toISOString(),
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        type
      }
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting data'
    });
  }
});

/**
 * @route GET /api/admin/reports/visitors/pdf
 * @description Generate a PDF report of visitors within a date range (returns base64)
 * @access Private (Admin only)
 */
app.get('/api/admin/reports/visitors/pdf', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date and end date are required' 
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid date format. Use YYYY-MM-DD' 
      });
    }

    // Get visitor users and their bookings
    const visitorUsers = await User.find({
      role: 'visitor',
      createdAt: { $gte: start, $lte: end }
    }).select('name email phone').lean();

    const visitorIds = visitorUsers.map(u => u._id);

    const visitorBookings = await Booking.find({
      userId: { $in: visitorIds },
      date: { $gte: start, $lte: end }
    })
    .populate('userId', 'name email phone')
    .populate('zoneId', 'name')
    .sort({ date: 1 })
    .lean();

    // Create PDF document with buffer
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const pdfBase64 = pdfBuffer.toString('base64');
      
      res.json({
        success: true,
        data: {
          pdf: pdfBase64,
          filename: `visitor-report-${new Date().toISOString().split('T')[0]}.pdf`,
          mimeType: 'application/pdf',
          totalVisitors: visitorUsers.length,
          totalBookings: visitorBookings.length
        }
      });
    });
    
    // Add title
    doc.fontSize(20).text('Visitor Parking Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(12).text(`Date Range: ${start.toDateString()} to ${new Date(end).toDateString()}`, { align: 'center' });
    doc.moveDown(2);
    
    doc.fontSize(10).text(`Report generated on: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown(2);
    
    if (visitorBookings.length === 0) {
      doc.fontSize(14).text('No visitor records found for the selected date range.', { align: 'center' });
    } else {
      let currentY = doc.y;
      
      doc.font('Helvetica-Bold');
      doc.text('Visitor Name', 50, currentY);
      doc.text('Email', 180, currentY);
      doc.text('Phone', 320, currentY);
      doc.text('Zone', 430, currentY);
      doc.text('Date', 520, currentY);
      
      currentY += 25;
      doc.moveTo(50, currentY).lineTo(580, currentY).stroke();
      
      doc.font('Helvetica');
      visitorBookings.forEach((booking) => {
        if (currentY > 700) {
          doc.addPage();
          currentY = 100;
          doc.font('Helvetica-Bold');
          doc.text('Visitor Name', 50, 50);
          doc.text('Email', 180, 50);
          doc.text('Phone', 320, 50);
          doc.text('Zone', 430, 50);
          doc.text('Date', 520, 50);
          doc.moveTo(50, 75).lineTo(580, 75).stroke();
          doc.font('Helvetica');
        }
        
        doc.text(booking.userId?.name || 'N/A', 50, currentY);
        doc.text(booking.userId?.email || 'N/A', 180, currentY);
        doc.text(booking.userId?.phone || 'N/A', 320, currentY);
        doc.text(booking.zoneId?.name || 'N/A', 430, currentY);
        doc.text(new Date(booking.date).toLocaleDateString(), 520, currentY);
        
        currentY += 20;
        doc.moveTo(50, currentY - 5).lineTo(580, currentY - 5).stroke();
        currentY += 10;
      });
      
      doc.addPage();
      doc.fontSize(16).text('Summary', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Total Visitor Bookings: ${visitorBookings.length}`);
      doc.text(`Total Unique Visitors: ${visitorUsers.length}`);
      
      const zoneCounts = {};
      visitorBookings.forEach(booking => {
        const zoneName = booking.zoneId?.name || 'Unknown';
        zoneCounts[zoneName] = (zoneCounts[zoneName] || 0) + 1;
      });
      
      doc.moveDown();
      doc.fontSize(14).text('Bookings by Zone:');
      doc.moveDown(0.5);
      
      Object.entries(zoneCounts).forEach(([zone, count]) => {
        doc.text(`${zone}: ${count}`, { indent: 20 });
      });
    }
    
    doc.end();
    
  } catch (error) {
    console.error('Error generating visitor report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate visitor report',
      error: error.message 
    });
  }
});

/**
 * @route GET /api/admin/reports/events/pdf
 * @description Generate a PDF report of events within a date range (returns base64)
 * @access Private (Admin only)
 */
app.get('/api/admin/reports/events/pdf', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date and end date are required' 
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid date format. Use YYYY-MM-DD' 
      });
    }

    // Get event data
    const events = await Event.find({
      date: { $gte: start, $lte: end }
    }).lean();

    // Create PDF document with buffer
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const pdfBase64 = pdfBuffer.toString('base64');
      
      res.json({
        success: true,
        data: {
          pdf: pdfBase64,
          filename: `event-report-${new Date().toISOString().split('T')[0]}.pdf`,
          mimeType: 'application/pdf',
          totalEvents: events.length
        }
      });
    });
    
    // Add title
    doc.fontSize(20).text('Event Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(12).text(`Date Range: ${start.toDateString()} to ${new Date(end).toDateString()}`, { align: 'center' });
    doc.moveDown(2);
    
    doc.fontSize(10).text(`Report generated on: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown(2);
    
    if (events.length === 0) {
      doc.fontSize(14).text('No events found for the selected date range.', { align: 'center' });
    } else {
      let currentY = doc.y;
      
      doc.font('Helvetica-Bold');
      doc.text('Event Name', 50, currentY);
      doc.text('Date', 180, currentY);
      doc.text('Zone', 320, currentY);
      doc.text('Description', 430, currentY);
      doc.text('Allocated Slots', 520, currentY);
      
      currentY += 25;
      doc.moveTo(50, currentY).lineTo(580, currentY).stroke();
      
      doc.font('Helvetica');
      events.forEach((event) => {
        if (currentY > 700) {
          doc.addPage();
          currentY = 100;
          doc.font('Helvetica-Bold');
          doc.text('Event Name', 50, 50);
          doc.text('Date', 180, 50);
          doc.text('Zone', 320, 50);
          doc.text('Description', 430, 50);
          doc.text('Allocated Slots', 520, 50);
          doc.moveTo(50, 75).lineTo(580, 75).stroke();
          doc.font('Helvetica');
        }
        
        doc.text(event.name, 50, currentY);
        doc.text(new Date(event.date).toLocaleDateString(), 180, currentY);
        doc.text(event.zone || 'N/A', 320, currentY);
        doc.text(event.description || 'N/A', 430, currentY);
        doc.text(event.allocatedSlots.toString(), 520, currentY);
        
        currentY += 20;
        doc.moveTo(50, currentY - 5).lineTo(580, currentY - 5).stroke();
        currentY += 10;
      });
      
      doc.addPage();
      doc.fontSize(16).text('Summary', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Total Events: ${events.length}`);
      
      const zoneCounts = {};
      events.forEach((event) => {
        const zoneName = event.zone || 'Unknown';
        zoneCounts[zoneName] = (zoneCounts[zoneName] || 0) + 1;
      });
      
      doc.moveDown();
      doc.fontSize(14).text('Events by Zone:');
      doc.moveDown(0.5);
      
      Object.entries(zoneCounts).forEach(([zone, count]) => {
        doc.text(`${zone}: ${count}`, { indent: 20 });
      });
    }
    
    doc.end();
    
  } catch (error) {
    console.error('Error generating event report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate event report',
      error: error.message 
    });
  }
});

/**
 * @route GET /api/admin/reports/combined/pdf
 * @description Generate a combined PDF report of bookings, users, and events within a date range (returns base64)
 * @access Private (Admin only)
 */
app.get('/api/admin/reports/combined/pdf', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Start date and end date are required' 
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid date format. Use YYYY-MM-DD' 
      });
    }

    // Get booking data
    const bookings = await Booking.find({
      date: { $gte: start, $lte: end }
    }).lean();

    // Get user data
    const users = await User.find({
      createdAt: { $gte: start, $lte: end }
    }).select('-password').lean();

    // Get event data
    const events = await Event.find({
      date: { $gte: start, $lte: end }
    }).lean();

    // Create PDF document with buffer
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const pdfBase64 = pdfBuffer.toString('base64');
      
      res.json({
        success: true,
        data: {
          pdf: pdfBase64,
          filename: `combined-report-${new Date().toISOString().split('T')[0]}.pdf`,
          mimeType: 'application/pdf',
          totalBookings: bookings.length,
          totalUsers: users.length,
          totalEvents: events.length
        }
      });
    });
    
    // Add title
    doc.fontSize(20).text('Combined Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(12).text(`Date Range: ${start.toDateString()} to ${new Date(end).toDateString()}`, { align: 'center' });
    doc.moveDown(2);
    
    doc.fontSize(10).text(`Report generated on: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown(2);
    
    // Format bookings data
    const formattedBookings = bookings.map(booking => ({
      id: booking._id,
      user: booking.userId?.name || 'Unknown User',
      userEmail: booking.userId?.email || 'N/A',
      zone: booking.zoneName || booking.zoneId?.name || 'N/A',
      spot: booking.zoneId?.type || 'N/A',
      date: booking.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      duration: `${booking.duration} hours`,
      vehicleNumber: booking.vehicleNumber || 'N/A',
      status: booking.status,
      qrCode: booking.qrCode,
      checkInTime: booking.checkInTime ? new Date(booking.checkInTime).toLocaleString() : 'Not checked in',
      checkOutTime: booking.checkOutTime ? new Date(booking.checkOutTime).toLocaleString() : 'Not checked out'
    }));

    // Format users data
    const formattedUsers = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department || 'N/A',
      phone: user.phone || 'N/A',
      vehicleNumber: user.vehicleNumber || 'N/A',
      registrationDate: user.createdAt
    }));

    // Format events data
    const formattedEvents = events.map(event => ({
      id: event._id,
      title: event.name,
      date: event.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      location: event.zone || 'N/A',
      allocatedSlots: event.allocatedSlots,
      description: event.description || ''
    }));

    // Calculate summary statistics
    const summary = {
      totalUsers: formattedUsers.length,
      totalBookings: formattedBookings.length,
      activeEvents: events.length,
      totalRevenue: formattedBookings.length * 5, // Assuming $5 per booking
      activeBookings: formattedBookings.filter(b => b.status === 'active').length,
      completedBookings: formattedBookings.filter(b => b.status === 'completed').length,
      cancelledBookings: formattedBookings.filter(b => b.status === 'cancelled').length
    };

    // Calculate bookings by zone
    const bookingsByZone = {};
    formattedBookings.forEach(booking => {
      const zoneName = booking.zone;
      if (!bookingsByZone[zoneName]) {
        bookingsByZone[zoneName] = 0;
      }
      bookingsByZone[zoneName]++;
    });

    // Calculate user statistics by role
    const usersByRole = {
      student: formattedUsers.filter(u => u.role === 'student').length,
      staff: formattedUsers.filter(u => u.role === 'staff').length,
      visitor: formattedUsers.filter(u => u.role === 'visitor').length
    };

    // Send response
    res.status(200).json({
      success: true,
      data: {
        summary: {
          ...summary,
          usersByRole,
          bookingsByZone
        },
        users: formattedUsers,
        events: formattedEvents,
        bookings: formattedBookings,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString()
        },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error generating combined report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating combined report',
      error: error.message
    });
  }
});

// ===== ERROR HANDLING =====

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found',
    path: req.path 
  });
});

// ===== AUTOMATED CLEANUP JOB =====

// Function to expire old bookings
async function expireOldBookings() {
  try {
    const now = new Date();
    
    // Find bookings that are past their endTime and still active
    const expiredBookings = await Booking.find({
      status: { $in: ['active', 'checked-in'] },
      endTime: { $lt: now }
    });

    if (expiredBookings.length > 0) {
      console.log(`Found ${expiredBookings.length} expired bookings to process`);

      for (const booking of expiredBookings) {
        // Mark as expired
        booking.status = 'expired';
        
        // Add violation if user never checked out
        if (booking.checkInTime && !booking.checkOutTime) {
          booking.violations.push({
            type: 'no-checkout',
            description: 'User failed to check out before booking expired',
            timestamp: now
          });
        } else if (!booking.checkInTime) {
          booking.violations.push({
            type: 'unauthorized',
            description: 'User never checked in - no-show',
            timestamp: now
          });
        }
        
        await booking.save();

        // Send notification to user
        await Notification.create({
          userId: booking.userId,
          title: 'Booking Expired',
          message: `Your parking booking at ${booking.zoneName} has expired`,
          type: 'warning',
        });

        // Broadcast zone update
        const zoneData = await getZoneAvailability(booking.zoneId);
        if (zoneData) {
          broadcast({
            type: 'zone_update',
            zoneId: booking.zoneId.toString(),
            available: zoneData.available
          });
        }
      }

      console.log(`✓ Expired ${expiredBookings.length} old bookings`);
    }
  } catch (error) {
    console.error('Error in expireOldBookings job:', error);
  }
}

// Function to send booking reminders
async function sendBookingReminders() {
  try {
    const now = new Date();
    
    // Reminder 1: 1 day before booking starts
    const oneDayFromNow = new Date(now);
    oneDayFromNow.setHours(now.getHours() + 24);
    oneDayFromNow.setMinutes(now.getMinutes() - 5, 0, 0); // 5-minute window
    
    const oneDayLater = new Date(oneDayFromNow);
    oneDayLater.setMinutes(oneDayLater.getMinutes() + 10);
    
    // Reminder 2: 1 hour before booking starts
    const oneHourFromNow = new Date(now);
    oneHourFromNow.setHours(now.getHours() + 1);
    oneHourFromNow.setMinutes(now.getMinutes() - 5, 0, 0);
    
    const oneHourLater = new Date(oneHourFromNow);
    oneHourLater.setMinutes(oneHourLater.getMinutes() + 10);
    
    // Reminder 3: 15 minutes before booking expires
    const fifteenMinutesFromNow = new Date(now);
    fifteenMinutesFromNow.setMinutes(now.getMinutes() + 15);
    fifteenMinutesFromNow.setSeconds(0, 0);
    
    const fifteenMinutesLater = new Date(fifteenMinutesFromNow);
    fifteenMinutesLater.setMinutes(fifteenMinutesLater.getMinutes() + 10);

    // Find bookings that need reminders
    const bookingsNeedingReminders = await Booking.find({
      status: 'active',
      $or: [
        // 1 day before start
        { startTime: { $gte: oneDayFromNow, $lte: oneDayLater } },
        // 1 hour before start
        { startTime: { $gte: oneHourFromNow, $lte: oneHourLater } },
        // 15 minutes before expiry
        { endTime: { $gte: fifteenMinutesFromNow, $lte: fifteenMinutesLater } }
      ]
    });

    for (const booking of bookingsNeedingReminders) {
      const timeDiffStart = booking.startTime - now;
      const timeDiffEnd = booking.endTime - now;
      
      let reminderType = '';
      let title = '';
      let message = '';
      
      // Determine which reminder to send
      if (timeDiffStart > 0 && timeDiffStart <= 24 * 60 * 60 * 1000 + 10 * 60 * 1000 && timeDiffStart >= 24 * 60 * 60 * 1000 - 5 * 60 * 1000) {
        // 1 day before
        reminderType = '1day';
        title = 'Parking Reminder - Tomorrow';
        message = `Your parking at ${booking.zoneName} is scheduled for tomorrow at ${booking.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      } else if (timeDiffStart > 0 && timeDiffStart <= 60 * 60 * 1000 + 10 * 60 * 1000 && timeDiffStart >= 60 * 60 * 1000 - 5 * 60 * 1000) {
        // 1 hour before
        reminderType = '1hour';
        title = 'Parking Reminder - 1 Hour';
        message = `Your parking at ${booking.zoneName} starts in 1 hour. Don't forget to check-in!`;
      } else if (timeDiffEnd > 0 && timeDiffEnd <= 15 * 60 * 1000 + 10 * 60 * 1000 && timeDiffEnd >= 15 * 60 * 1000) {
        // 15 minutes before expiry
        reminderType = 'expiring';
        title = 'Parking Expiring Soon';
        message = `Your parking at ${booking.zoneName} expires in 15 minutes. Please check out or extend your booking.`;
      }
      
      if (reminderType) {
        // Check if reminder already sent (to avoid duplicates)
        const existingReminder = await Notification.findOne({
          userId: booking.userId,
          title: title,
          createdAt: { $gte: new Date(now - 15 * 60 * 1000) } // Within last 15 minutes
        });
        
        if (!existingReminder) {
          await Notification.create({
            userId: booking.userId,
            title: title,
            message: message,
            type: reminderType === 'expiring' ? 'warning' : 'info',
            booking: booking._id
          });
          
          console.log(`✓ Sent ${reminderType} reminder for booking ${booking._id}`);
        }
      }
    }
    
    if (bookingsNeedingReminders.length > 0) {
      console.log(`✓ Processed ${bookingsNeedingReminders.length} booking reminders`);
    }
  } catch (error) {
    console.error('Error in sendBookingReminders job:', error);
  }
}

// Schedule cleanup job to run every hour
cron.schedule('0 * * * *', () => {
  console.log('Running automated booking cleanup job...');
  expireOldBookings();
});

// Schedule reminder job to run every 10 minutes
cron.schedule('*/10 * * * *', () => {
  console.log('Running booking reminder job...');
  sendBookingReminders();
});

// Run cleanup on startup
console.log('Running initial booking cleanup...');
expireOldBookings();

mongoose.connection.once('open', async () => {
  console.log('✓ Connected to MongoDB');
  await seedDatabase();
  
  server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  Campus Parking System - Server Running');
    console.log('═══════════════════════════════════════════════');
    console.log(`  HTTP API:    http://${localIP}:${PORT}/api`);
    console.log(`  WebSocket:   ws://${localIP}:${PORT}`);
    console.log(`  Health:      http://${localIP}:${PORT}/api/health`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('═══════════════════════════════════════════════');
    console.log('');
  });
});

mongoose.connection.on('error', (err) => {
  console.error('✗ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠ MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('\nReceived shutdown signal. Closing gracefully...');
  
  clearInterval(heartbeatInterval);
  
  wss.clients.forEach(client => {
    try {
      client.close(1000, 'Server shutting down');
    } catch (error) {
      console.error('Error closing WebSocket client:', error.message);
    }
  });
  
  server.close(async () => {
    console.log('✓ HTTP server closed');
    
    try {
      await mongoose.connection.close(false);
      console.log('✓ MongoDB connection closed');
      console.log('Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

module.exports = app;