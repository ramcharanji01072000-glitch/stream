const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    tags: [{
      type: String,
      trim: true,
    }],
    width: {
      type: Number,
      default: 800,
    },
    height: {
      type: Number,
      default: 600,
    },
    photographer: {
      type: String,
      default: 'Unknown',
    },
    color: {
      type: String,
      default: '#333333',
    },
    favoritedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    favoriteCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

photoSchema.index({ tags: 1 });
photoSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Photo', photoSchema);
