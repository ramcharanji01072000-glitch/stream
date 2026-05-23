const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const { streamLimiter } = require('../middleware/rateLimiter');
const { User, Device, StreamRequest, ConsentLog } = require('../models');

const router = express.Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate, authorize('ADMIN'));

/**
 * GET /api/admin/dashboard
 * Dashboard statistics
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const [totalUsers, totalDevices, onlineDevices, activeStreams, recentRequests] =
      await Promise.all([
        User.countDocuments({ role: 'USER' }),
        Device.countDocuments(),
        Device.countDocuments({ isOnline: true }),
        StreamRequest.countDocuments({ status: 'accepted' }),
        StreamRequest.countDocuments({
          requestedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),
      ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalDevices,
          onlineDevices,
          activeStreams,
          recentRequests,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/users
 * List all users with pagination
 */
router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = req.query.search;

    let filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/devices
 * List all registered devices
 */
router.get('/devices', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const onlineOnly = req.query.online === 'true';

    let filter = {};
    if (onlineOnly) {
      filter.isOnline = true;
    }

    const [devices, total] = await Promise.all([
      Device.find(filter)
        .populate('userId', 'name email role')
        .sort({ isOnline: -1, lastActiveAt: -1 })
        .skip(skip)
        .limit(limit),
      Device.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        devices,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/devices/:id
 * Get device detail with stream history
 */
router.get('/devices/:id', async (req, res, next) => {
  try {
    const device = await Device.findById(req.params.id)
      .populate('userId', 'name email role');

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found.',
      });
    }

    const streamHistory = await StreamRequest.find({ deviceId: device.deviceId })
      .populate('adminId', 'name email')
      .sort({ requestedAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: { device, streamHistory },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/stream/request
 * Send a camera stream request to a device
 * NOTE: This only sends a REQUEST - user must explicitly accept
 */
router.post(
  '/stream/request',
  streamLimiter,
  [
    body('deviceId').trim().notEmpty().withMessage('Device ID is required'),
    body('userId').trim().notEmpty().withMessage('User ID is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => e.msg),
        });
      }

      const { deviceId, userId } = req.body;

      // Check device exists and is online
      const device = await Device.findOne({ deviceId, userId });
      if (!device) {
        return res.status(404).json({
          success: false,
          message: 'Device not found.',
        });
      }

      if (!device.isOnline) {
        return res.status(400).json({
          success: false,
          message: 'Device is offline. Cannot send stream request.',
        });
      }

      if (device.streamStatus !== 'idle') {
        return res.status(400).json({
          success: false,
          message: 'Device already has a pending or active stream.',
        });
      }

      // Check for existing pending request
      const existingRequest = await StreamRequest.findOne({
        deviceId,
        status: 'pending',
      });
      if (existingRequest) {
        return res.status(400).json({
          success: false,
          message: 'A stream request is already pending for this device.',
        });
      }

      // Create stream request
      const streamRequest = new StreamRequest({
        adminId: req.user._id,
        userId,
        deviceId,
        status: 'pending',
        requestedAt: new Date(),
      });

      await streamRequest.save();

      // Update device status
      device.streamStatus = 'pending';
      device.activeStreamRequestId = streamRequest._id;
      await device.save();

      // Emit socket event to the device
      const io = req.app.get('io');
      if (device.socketId) {
        io.to(device.socketId).emit('stream:request_received', {
          requestId: streamRequest._id,
          adminId: req.user._id,
          adminName: req.user.name,
          message: 'Admin wants to start a live camera stream. Do you accept?',
        });
      }

      res.status(201).json({
        success: true,
        message: 'Stream request sent to user. Waiting for consent.',
        data: { streamRequest },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/stream/stop
 * Stop an active stream
 */
router.post(
  '/stream/stop',
  [body('requestId').trim().notEmpty().withMessage('Request ID is required')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map((e) => e.msg),
        });
      }

      const { requestId } = req.body;

      const streamRequest = await StreamRequest.findById(requestId);
      if (!streamRequest) {
        return res.status(404).json({
          success: false,
          message: 'Stream request not found.',
        });
      }

      if (streamRequest.status !== 'accepted') {
        return res.status(400).json({
          success: false,
          message: 'Stream is not currently active.',
        });
      }

      // Update stream request
      streamRequest.status = 'stopped';
      streamRequest.stoppedAt = new Date();
      await streamRequest.save();

      // Update device
      await Device.findOneAndUpdate(
        { deviceId: streamRequest.deviceId },
        { streamStatus: 'idle', activeStreamRequestId: null }
      );

      // Log consent
      await ConsentLog.create({
        streamRequestId: streamRequest._id,
        userId: streamRequest.userId,
        deviceId: streamRequest.deviceId,
        adminId: req.user._id,
        consentStatus: 'stopped',
        ipAddress: req.ip,
      });

      // Notify user device to stop streaming
      const io = req.app.get('io');
      const device = await Device.findOne({ deviceId: streamRequest.deviceId });
      if (device?.socketId) {
        io.to(device.socketId).emit('stream:stopped', {
          requestId: streamRequest._id,
          stoppedBy: 'admin',
        });
      }

      res.json({
        success: true,
        message: 'Stream stopped successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/stream/history
 * Get stream request history
 */
router.get('/stream/history', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      StreamRequest.find()
        .populate('adminId', 'name email')
        .populate('userId', 'name email')
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(limit),
      StreamRequest.countDocuments(),
    ]);

    res.json({
      success: true,
      data: {
        requests,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/consent-logs
 * Get consent audit logs
 */
router.get('/consent-logs', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ConsentLog.find()
        .populate('userId', 'name email')
        .populate('adminId', 'name email')
        .populate('streamRequestId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ConsentLog.countDocuments(),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
