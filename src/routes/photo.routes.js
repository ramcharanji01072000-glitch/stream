const express = require('express');
const { query, param } = require('express-validator');
const Photo = require('../models/Photo');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/photos
 * Get paginated photo feed
 */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const tag = req.query.tag;
    const search = req.query.search;

    let filter = {};
    if (tag) {
      filter.tags = tag;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const [photos, total] = await Promise.all([
      Photo.find(filter)
        .select('-favoritedBy')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Photo.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        photos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photos/:id
 * Get photo detail
 */
router.get('/:id', async (req, res, next) => {
  try {
    const photo = await Photo.findById(req.params.id).select('-favoritedBy');
    if (!photo) {
      return res.status(404).json({
        success: false,
        message: 'Photo not found.',
      });
    }

    res.json({
      success: true,
      data: { photo },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photos/:id/favorite
 * Toggle favorite on a photo
 */
router.post('/:id/favorite', authenticate, async (req, res, next) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) {
      return res.status(404).json({
        success: false,
        message: 'Photo not found.',
      });
    }

    const userId = req.user._id;
    const isFavorited = photo.favoritedBy.includes(userId);

    if (isFavorited) {
      photo.favoritedBy.pull(userId);
      photo.favoriteCount = Math.max(0, photo.favoriteCount - 1);
    } else {
      photo.favoritedBy.push(userId);
      photo.favoriteCount += 1;
    }

    await photo.save();

    res.json({
      success: true,
      message: isFavorited ? 'Removed from favorites' : 'Added to favorites',
      data: {
        isFavorited: !isFavorited,
        favoriteCount: photo.favoriteCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photos/user/favorites
 * Get user's favorite photos
 */
router.get('/user/favorites', authenticate, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [photos, total] = await Promise.all([
      Photo.find({ favoritedBy: req.user._id })
        .select('-favoritedBy')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Photo.countDocuments({ favoritedBy: req.user._id }),
    ]);

    res.json({
      success: true,
      data: {
        photos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
