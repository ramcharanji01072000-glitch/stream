const mongoose = require('mongoose');

const consentLogSchema = new mongoose.Schema(
  {
    streamRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StreamRequest',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    consentStatus: {
      type: String,
      enum: ['accepted', 'rejected', 'stopped', 'expired'],
      required: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
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

module.exports = mongoose.model('ConsentLog', consentLogSchema);
