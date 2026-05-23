const express = require('express');
const { body, validationResult } = require('express-validator');
const Device = require('../models/Device');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/devices/register
 * Register or update a device for the authenticated user
 */
router.post(
  '/register',
  authenticate,
  [
    body('deviceId').trim().notEmpty().withMessage('Device ID is required'),
    body('deviceName').trim().notEmpty().withMessage('Device name is required'),
    body('platform')
      .isIn(['android', 'ios', 'web'])
      .withMessage('Platform must be android, ios, or web'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array().map((e) => e.msg),
        });
      }

      const { deviceId, deviceName, platform } = req.body;

      // Upsert device
      const device = await Device.findOneAndUpdate(
        { userId: req.user._id, deviceId },
        {
          userId: req.user._id,
          deviceId,
          deviceName,
          platform,
          lastActiveAt: new Date(),
        },
        { upsert: true, new: true, runValidators: true }
      );

      res.status(201).json({
        success: true,
        message: 'Device registered successfully',
        data: { device },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/devices/my
 * Get authenticated user's devices
 */
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const devices = await Device.find({ userId: req.user._id })
      .sort({ lastActiveAt: -1 });

    res.json({
      success: true,
      data: { devices },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
