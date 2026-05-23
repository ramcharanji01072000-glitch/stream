const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: [true, 'Device ID is required'],
      trim: true,
      index: true,
    },
    deviceName: {
      type: String,
      required: [true, 'Device name is required'],
      trim: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      required: [true, 'Platform is required'],
    },
    socketId: {
      type: String,
      default: null,
    },
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    streamStatus: {
      type: String,
      enum: ['idle', 'pending', 'streaming'],
      default: 'idle',
    },
    activeStreamRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StreamRequest',
      default: null,
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

// Compound index for unique device per user
deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('Device', deviceSchema);
