// backend/routes/adminRoutes.js
// Location: CAMPUS-PARKING-APP/backend/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Zone = require('../models/ParkingZone');
const PDFDocument = require('pdfkit');
const { protect: auth } = require('../middleware/auth');

/**
 * @route   GET /api/admin/reports
 * @desc    Get comprehensive admin reports with date range filtering
 * @access  Private (Admin only)
 */
router.get('/reports', async (req, res) => {
  try {
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

    // Validate date objects
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
 * @route   GET /api/admin/reports/summary
 * @desc    Get quick summary statistics for dashboard
 * @access  Private (Admin only)
 */
router.get('/reports/summary', async (req, res) => {
  try {
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
 * @route   GET /api/admin/reports/analytics
 * @desc    Get detailed analytics for charts and graphs
 * @access  Private (Admin only)
 */
router.get('/reports/analytics', async (req, res) => {
  try {
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
 * @route   GET /api/admin/reports/export
 * @desc    Export data for external processing
 * @access  Private (Admin only)
 */
router.get('/reports/export', async (req, res) => {
  try {
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

// ===== PDF GENERATION HELPER FUNCTIONS =====

/**
 * Helper function to create PDF header
 */
function addPDFHeader(doc, title, dateRange) {
  doc.fontSize(20).text('Campus Parking Management System', 50, 50);
  doc.fontSize(16).text(title, 50, 80);
  
  if (dateRange) {
    doc.fontSize(12).text(`Report Period: ${dateRange.start} to ${dateRange.end}`, 50, 110);
  }
  
  doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, 50, 130);
  doc.moveTo(50, 150).lineTo(550, 150).stroke();
  
  return 170; // Return Y position for content start
}

/**
 * Helper function to add table headers
 */
function addTableHeaders(doc, headers, startY, columnWidths) {
  let currentX = 50;
  
  doc.fontSize(10).fillColor('black');
  headers.forEach((header, index) => {
    doc.rect(currentX, startY, columnWidths[index], 20).stroke();
    doc.text(header, currentX + 5, startY + 5, { width: columnWidths[index] - 10 });
    currentX += columnWidths[index];
  });
  
  return startY + 20;
}

/**
 * Helper function to add table row
 */
function addTableRow(doc, data, startY, columnWidths) {
  let currentX = 50;
  
  doc.fontSize(9).fillColor('black');
  data.forEach((cell, index) => {
    doc.rect(currentX, startY, columnWidths[index], 20).stroke();
    doc.text(String(cell || 'N/A'), currentX + 5, startY + 5, { 
      width: columnWidths[index] - 10,
      ellipsis: true 
    });
    currentX += columnWidths[index];
  });
  
  return startY + 20;
}

/**
 * @route   GET /api/admin/reports/visitors/pdf
 * @desc    Generate PDF report for visitors/users
 * @access  Private (Admin only)
 */
router.get('/reports/visitors/pdf', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Use default date range if not provided
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    // Fetch users data
    const users = await User.find({
      createdAt: { $gte: start, $lte: end },
      role: { $ne: 'admin' }
    })
      .select('name email role phone vehicleNumber createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="visitors_report.pdf"');
    
    // Pipe PDF to response
    doc.pipe(res);

    // Add header
    const contentStartY = addPDFHeader(doc, 'Visitors Report', {
      start: start.toLocaleDateString(),
      end: end.toLocaleDateString()
    });

    // Add summary
    doc.fontSize(12).text(`Total Visitors: ${users.length}`, 50, contentStartY + 20);
    
    const roleStats = {
      student: users.filter(u => u.role === 'student').length,
      staff: users.filter(u => u.role === 'staff').length,
      visitor: users.filter(u => u.role === 'visitor').length
    };
    
    doc.text(`Students: ${roleStats.student} | Staff: ${roleStats.staff} | Visitors: ${roleStats.visitor}`, 50, contentStartY + 40);

    // Add table
    const tableStartY = contentStartY + 80;
    const columnWidths = [150, 180, 80, 100, 90];
    const headers = ['Name', 'Email', 'Role', 'Phone', 'Vehicle'];

    let currentY = addTableHeaders(doc, headers, tableStartY, columnWidths);

    // Add user rows
    users.forEach((user, index) => {
      // Check if we need a new page
      if (currentY > 700) {
        doc.addPage();
        currentY = addTableHeaders(doc, headers, 50, columnWidths);
      }

      const rowData = [
        user.name || 'N/A',
        user.email || 'N/A',
        user.role || 'N/A',
        user.phone || 'N/A',
        user.vehicleNumber || 'N/A'
      ];

      currentY = addTableRow(doc, rowData, currentY, columnWidths);
    });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Error generating visitors PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF report'
    });
  }
});

/**
 * @route   GET /api/admin/reports/events/pdf
 * @desc    Generate PDF report for events
 * @access  Private (Admin only)
 */
router.get('/reports/events/pdf', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Use default date range if not provided
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    // Fetch events data
    const events = await Event.find({
      date: { $gte: start, $lte: end }
    })
      .select('name date allocatedSlots zone description createdAt')
      .sort({ date: -1 })
      .lean();

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="events_report.pdf"');
    
    // Pipe PDF to response
    doc.pipe(res);

    // Add header
    const contentStartY = addPDFHeader(doc, 'Events Report', {
      start: start.toLocaleDateString(),
      end: end.toLocaleDateString()
    });

    // Add summary
    doc.fontSize(12).text(`Total Events: ${events.length}`, 50, contentStartY + 20);
    
    const totalSlots = events.reduce((sum, event) => sum + (event.allocatedSlots || 0), 0);
    doc.text(`Total Allocated Slots: ${totalSlots}`, 50, contentStartY + 40);

    // Add table
    const tableStartY = contentStartY + 80;
    const columnWidths = [200, 100, 80, 120, 100];
    const headers = ['Event Name', 'Date', 'Slots', 'Zone', 'Status'];

    let currentY = addTableHeaders(doc, headers, tableStartY, columnWidths);

    // Add event rows
    events.forEach((event, index) => {
      // Check if we need a new page
      if (currentY > 700) {
        doc.addPage();
        currentY = addTableHeaders(doc, headers, 50, columnWidths);
      }

      const eventDate = new Date(event.date);
      const isUpcoming = eventDate > new Date();
      
      const rowData = [
        event.name || 'N/A',
        eventDate.toLocaleDateString(),
        event.allocatedSlots || '0',
        event.zone || 'N/A',
        isUpcoming ? 'Upcoming' : 'Completed'
      ];

      currentY = addTableRow(doc, rowData, currentY, columnWidths);
    });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Error generating events PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF report'
    });
  }
});

/**
 * @route   GET /api/admin/reports/combined/pdf
 * @desc    Generate combined PDF report with all data
 * @access  Private (Admin only)
 */
router.get('/reports/combined/pdf', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Use default date range if not provided
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    // Fetch all data
    const [users, events, bookings] = await Promise.all([
      User.find({
        createdAt: { $gte: start, $lte: end },
        role: { $ne: 'admin' }
      }).select('name email role phone vehicleNumber createdAt').sort({ createdAt: -1 }).lean(),
      
      Event.find({
        date: { $gte: start, $lte: end }
      }).select('name date allocatedSlots zone description').sort({ date: -1 }).lean(),
      
      Booking.find({
        bookingDate: { $gte: start, $lte: end }
      }).populate('user', 'name email').populate('zone', 'name type')
        .select('user zone qrCode bookingDate duration vehicleNumber status').sort({ bookingDate: -1 }).lean()
    ]);

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="combined_report.pdf"');
    
    // Pipe PDF to response
    doc.pipe(res);

    // Add header
    const contentStartY = addPDFHeader(doc, 'Combined Campus Report', {
      start: start.toLocaleDateString(),
      end: end.toLocaleDateString()
    });

    // Add executive summary
    doc.fontSize(14).text('Executive Summary', 50, contentStartY + 20);
    doc.fontSize(11)
      .text(`• Total Users: ${users.length}`, 70, contentStartY + 45)
      .text(`• Total Events: ${events.length}`, 70, contentStartY + 60)
      .text(`• Total Bookings: ${bookings.length}`, 70, contentStartY + 75)
      .text(`• Active Bookings: ${bookings.filter(b => b.status === 'active').length}`, 70, contentStartY + 90)
      .text(`• Revenue Generated: $${bookings.length * 5}`, 70, contentStartY + 105);

    // Users Section
    doc.addPage();
    let currentY = addPDFHeader(doc, 'Users Section', null);
    
    const userColumnWidths = [150, 180, 80, 90];
    const userHeaders = ['Name', 'Email', 'Role', 'Vehicle'];
    currentY = addTableHeaders(doc, userHeaders, currentY + 20, userColumnWidths);

    users.slice(0, 20).forEach((user) => { // Limit to first 20 users
      if (currentY > 700) {
        doc.addPage();
        currentY = addTableHeaders(doc, userHeaders, 50, userColumnWidths);
      }
      
      const rowData = [
        user.name || 'N/A',
        user.email || 'N/A',
        user.role || 'N/A',
        user.vehicleNumber || 'N/A'
      ];
      
      currentY = addTableRow(doc, rowData, currentY, userColumnWidths);
    });

    // Events Section
    doc.addPage();
    currentY = addPDFHeader(doc, 'Events Section', null);
    
    const eventColumnWidths = [200, 100, 80, 120];
    const eventHeaders = ['Event Name', 'Date', 'Slots', 'Zone'];
    currentY = addTableHeaders(doc, eventHeaders, currentY + 20, eventColumnWidths);

    events.forEach((event) => {
      if (currentY > 700) {
        doc.addPage();
        currentY = addTableHeaders(doc, eventHeaders, 50, eventColumnWidths);
      }
      
      const rowData = [
        event.name || 'N/A',
        new Date(event.date).toLocaleDateString(),
        event.allocatedSlots || '0',
        event.zone || 'N/A'
      ];
      
      currentY = addTableRow(doc, rowData, currentY, eventColumnWidths);
    });

    // Bookings Section
    doc.addPage();
    currentY = addPDFHeader(doc, 'Bookings Section', null);
    
    const bookingColumnWidths = [120, 120, 80, 100, 80];
    const bookingHeaders = ['User', 'Zone', 'Date', 'Vehicle', 'Status'];
    currentY = addTableHeaders(doc, bookingHeaders, currentY + 20, bookingColumnWidths);

    bookings.slice(0, 30).forEach((booking) => { // Limit to first 30 bookings
      if (currentY > 700) {
        doc.addPage();
        currentY = addTableHeaders(doc, bookingHeaders, 50, bookingColumnWidths);
      }
      
      const bookingDate = booking.bookingDate ? new Date(booking.bookingDate).toLocaleDateString() : 'N/A';
      
      const rowData = [
        booking.user?.name || 'Unknown',
        booking.zone?.name || 'N/A',
        bookingDate,
        booking.vehicleNumber || 'N/A',
        booking.status || 'N/A'
      ];
      
      currentY = addTableRow(doc, rowData, currentY, bookingColumnWidths);
    });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Error generating combined PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF report'
    });
  }
});

module.exports = router;