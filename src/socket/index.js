const { authenticateSocket } = require('../middleware/auth');
const { Device, StreamRequest, ConsentLog } = require('../models');

/**
 * Initialize Socket.IO event handlers
 */
const initializeSocket = (io) => {
  // Authenticate all socket connections
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`🔌 Socket connected: ${user.name} (${user.role}) - ${socket.id}`);

    // Join role-based room
    socket.join(`role:${user.role}`);
    socket.join(`user:${user._id}`);

    /**
     * DEVICE REGISTRATION (User App)
     * Register device and mark as online
     */
    socket.on('device:register', async (data) => {
      try {
        const { deviceId, deviceName, platform } = data;

        if (!deviceId || !deviceName || !platform) {
          socket.emit('error', { message: 'Missing device registration data' });
          return;
        }

        const device = await Device.findOneAndUpdate(
          { userId: user._id, deviceId },
          {
            userId: user._id,
            deviceId,
            deviceName,
            platform,
            socketId: socket.id,
            isOnline: true,
            lastActiveAt: new Date(),
          },
          { upsert: true, new: true }
        );

        socket.deviceId = deviceId;
        socket.join(`device:${deviceId}`);

        socket.emit('device:registered', {
          success: true,
          device: device.toJSON(),
        });

        // Notify admins of device list update
        emitDeviceListToAdmins(io);

        console.log(`📱 Device registered: ${deviceName} (${deviceId})`);
      } catch (error) {
        console.error('Device registration error:', error.message);
        socket.emit('error', { message: 'Device registration failed' });
      }
    });

    /**
     * STREAM ACCEPTED (User App)
     * User explicitly accepts the stream request
     */
    socket.on('stream:accepted', async (data) => {
      try {
        const { requestId } = data;

        const streamRequest = await StreamRequest.findById(requestId);
        if (!streamRequest || streamRequest.userId.toString() !== user._id.toString()) {
          socket.emit('error', { message: 'Invalid stream request' });
          return;
        }

        if (streamRequest.status !== 'pending') {
          socket.emit('error', { message: 'Stream request is no longer pending' });
          return;
        }

        // Check if expired
        if (new Date() > streamRequest.expiresAt) {
          streamRequest.status = 'expired';
          await streamRequest.save();
          
          await Device.findOneAndUpdate(
            { deviceId: streamRequest.deviceId },
            { streamStatus: 'idle', activeStreamRequestId: null }
          );

          await ConsentLog.create({
            streamRequestId: streamRequest._id,
            userId: user._id,
            deviceId: streamRequest.deviceId,
            adminId: streamRequest.adminId,
            consentStatus: 'expired',
            ipAddress: socket.handshake.address,
          });

          socket.emit('stream:expired', { requestId });
          return;
        }

        // Update stream request
        streamRequest.status = 'accepted';
        streamRequest.respondedAt = new Date();
        await streamRequest.save();

        // Update device status
        await Device.findOneAndUpdate(
          { deviceId: streamRequest.deviceId },
          { streamStatus: 'streaming' }
        );

        // Log consent
        await ConsentLog.create({
          streamRequestId: streamRequest._id,
          userId: user._id,
          deviceId: streamRequest.deviceId,
          adminId: streamRequest.adminId,
          consentStatus: 'accepted',
          ipAddress: socket.handshake.address,
        });

        // Notify admin
        io.to(`user:${streamRequest.adminId}`).emit('admin:stream_status', {
          requestId: streamRequest._id,
          status: 'accepted',
          deviceId: streamRequest.deviceId,
          userId: user._id,
          userName: user.name,
        });

        // Notify admins of device list update
        emitDeviceListToAdmins(io);

        console.log(`✅ Stream accepted by ${user.name} for device ${streamRequest.deviceId}`);
      } catch (error) {
        console.error('Stream accept error:', error.message);
        socket.emit('error', { message: 'Failed to accept stream' });
      }
    });

    /**
     * STREAM REJECTED (User App)
     * User explicitly rejects the stream request
     */
    socket.on('stream:rejected', async (data) => {
      try {
        const { requestId, reason } = data;

        const streamRequest = await StreamRequest.findById(requestId);
        if (!streamRequest || streamRequest.userId.toString() !== user._id.toString()) {
          socket.emit('error', { message: 'Invalid stream request' });
          return;
        }

        // Update stream request
        streamRequest.status = 'rejected';
        streamRequest.respondedAt = new Date();
        await streamRequest.save();

        // Update device
        await Device.findOneAndUpdate(
          { deviceId: streamRequest.deviceId },
          { streamStatus: 'idle', activeStreamRequestId: null }
        );

        // Log consent
        await ConsentLog.create({
          streamRequestId: streamRequest._id,
          userId: user._id,
          deviceId: streamRequest.deviceId,
          adminId: streamRequest.adminId,
          consentStatus: 'rejected',
          ipAddress: socket.handshake.address,
        });

        // Notify admin
        io.to(`user:${streamRequest.adminId}`).emit('admin:stream_status', {
          requestId: streamRequest._id,
          status: 'rejected',
          deviceId: streamRequest.deviceId,
          reason: reason || 'User rejected the request',
        });

        emitDeviceListToAdmins(io);

        console.log(`❌ Stream rejected by ${user.name}`);
      } catch (error) {
        console.error('Stream reject error:', error.message);
        socket.emit('error', { message: 'Failed to reject stream' });
      }
    });

    /**
     * STREAM STOPPED (User App)
     * User stops an active stream
     */
    socket.on('stream:stopped', async (data) => {
      try {
        const { requestId } = data;

        const streamRequest = await StreamRequest.findById(requestId);
        if (!streamRequest) {
          socket.emit('error', { message: 'Stream request not found' });
          return;
        }

        streamRequest.status = 'stopped';
        streamRequest.stoppedAt = new Date();
        await streamRequest.save();

        await Device.findOneAndUpdate(
          { deviceId: streamRequest.deviceId },
          { streamStatus: 'idle', activeStreamRequestId: null }
        );

        await ConsentLog.create({
          streamRequestId: streamRequest._id,
          userId: user._id,
          deviceId: streamRequest.deviceId,
          adminId: streamRequest.adminId,
          consentStatus: 'stopped',
          ipAddress: socket.handshake.address,
        });

        // Notify admin
        io.to(`user:${streamRequest.adminId}`).emit('admin:stream_status', {
          requestId: streamRequest._id,
          status: 'stopped',
          deviceId: streamRequest.deviceId,
          stoppedBy: 'user',
        });

        emitDeviceListToAdmins(io);

        console.log(`🛑 Stream stopped by ${user.name}`);
      } catch (error) {
        console.error('Stream stop error:', error.message);
        socket.emit('error', { message: 'Failed to stop stream' });
      }
    });

    /**
     * ADMIN: REQUEST STREAM
     * Admin sends a camera stream request to a device
     */
    socket.on('admin:request_stream', async (data) => {
      try {
        if (user.role !== 'ADMIN') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        const { deviceId, userId: targetUserId } = data;

        const device = await Device.findOne({ deviceId, userId: targetUserId });
        if (!device || !device.isOnline) {
          socket.emit('admin:stream_status', {
            status: 'error',
            message: 'Device is not online',
          });
          return;
        }

        if (device.streamStatus !== 'idle') {
          socket.emit('admin:stream_status', {
            status: 'error',
            message: 'Device already has an active/pending stream',
          });
          return;
        }

        // Create stream request
        const streamRequest = new StreamRequest({
          adminId: user._id,
          userId: targetUserId,
          deviceId,
          status: 'pending',
        });
        await streamRequest.save();

        device.streamStatus = 'pending';
        device.activeStreamRequestId = streamRequest._id;
        await device.save();

        // Send request to user device
        if (device.socketId) {
          io.to(device.socketId).emit('stream:request_received', {
            requestId: streamRequest._id,
            adminId: user._id,
            adminName: user.name,
            message: 'Admin wants to start a live camera stream. Do you accept?',
          });
        }

        socket.emit('admin:stream_status', {
          requestId: streamRequest._id,
          status: 'pending',
          message: 'Request sent. Waiting for user consent.',
        });

        // Set expiry timeout
        setTimeout(async () => {
          const req = await StreamRequest.findById(streamRequest._id);
          if (req && req.status === 'pending') {
            req.status = 'expired';
            await req.save();

            await Device.findOneAndUpdate(
              { deviceId },
              { streamStatus: 'idle', activeStreamRequestId: null }
            );

            await ConsentLog.create({
              streamRequestId: req._id,
              userId: targetUserId,
              deviceId,
              adminId: user._id,
              consentStatus: 'expired',
            });

            io.to(`user:${user._id}`).emit('admin:stream_status', {
              requestId: req._id,
              status: 'expired',
              message: 'Request expired. User did not respond.',
            });

            if (device.socketId) {
              io.to(device.socketId).emit('stream:expired', {
                requestId: req._id,
              });
            }

            emitDeviceListToAdmins(io);
          }
        }, 60000); // 60 second timeout

        console.log(`📡 Admin ${user.name} requested stream from device ${deviceId}`);
      } catch (error) {
        console.error('Admin stream request error:', error.message);
        socket.emit('error', { message: 'Failed to send stream request' });
      }
    });

    /**
     * ADMIN: STOP STREAM
     */
    socket.on('admin:stop_stream', async (data) => {
      try {
        if (user.role !== 'ADMIN') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        const { requestId } = data;
        const streamRequest = await StreamRequest.findById(requestId);
        if (!streamRequest || streamRequest.status !== 'accepted') {
          socket.emit('error', { message: 'No active stream to stop' });
          return;
        }

        streamRequest.status = 'stopped';
        streamRequest.stoppedAt = new Date();
        await streamRequest.save();

        await Device.findOneAndUpdate(
          { deviceId: streamRequest.deviceId },
          { streamStatus: 'idle', activeStreamRequestId: null }
        );

        await ConsentLog.create({
          streamRequestId: streamRequest._id,
          userId: streamRequest.userId,
          deviceId: streamRequest.deviceId,
          adminId: user._id,
          consentStatus: 'stopped',
          ipAddress: socket.handshake.address,
        });

        // Notify user device
        const device = await Device.findOne({ deviceId: streamRequest.deviceId });
        if (device?.socketId) {
          io.to(device.socketId).emit('stream:stopped', {
            requestId: streamRequest._id,
            stoppedBy: 'admin',
          });
        }

        socket.emit('admin:stream_status', {
          requestId: streamRequest._id,
          status: 'stopped',
          stoppedBy: 'admin',
        });

        emitDeviceListToAdmins(io);
      } catch (error) {
        console.error('Admin stop stream error:', error.message);
        socket.emit('error', { message: 'Failed to stop stream' });
      }
    });

    /**
     * WebRTC SIGNALING
     * Relay WebRTC offers, answers, and ICE candidates between peers
     */
    socket.on('webrtc:offer', async (data) => {
      try {
        const { requestId, sdp } = data;
        const streamRequest = await StreamRequest.findById(requestId);
        if (!streamRequest || streamRequest.status !== 'accepted') return;

        // Forward offer to admin
        io.to(`user:${streamRequest.adminId}`).emit('webrtc:offer', {
          requestId,
          sdp,
          from: user._id,
        });
      } catch (error) {
        console.error('WebRTC offer error:', error.message);
      }
    });

    socket.on('webrtc:answer', async (data) => {
      try {
        const { requestId, sdp } = data;
        const streamRequest = await StreamRequest.findById(requestId);
        if (!streamRequest || streamRequest.status !== 'accepted') return;

        // Forward answer to user device
        const device = await Device.findOne({ deviceId: streamRequest.deviceId });
        if (device?.socketId) {
          io.to(device.socketId).emit('webrtc:answer', {
            requestId,
            sdp,
            from: user._id,
          });
        }
      } catch (error) {
        console.error('WebRTC answer error:', error.message);
      }
    });

    socket.on('webrtc:ice_candidate', async (data) => {
      try {
        const { requestId, candidate } = data;
        const streamRequest = await StreamRequest.findById(requestId);
        if (!streamRequest) return;

        if (user.role === 'ADMIN') {
          // Forward to user device
          const device = await Device.findOne({ deviceId: streamRequest.deviceId });
          if (device?.socketId) {
            io.to(device.socketId).emit('webrtc:ice_candidate', {
              requestId,
              candidate,
              from: user._id,
            });
          }
        } else {
          // Forward to admin
          io.to(`user:${streamRequest.adminId}`).emit('webrtc:ice_candidate', {
            requestId,
            candidate,
            from: user._id,
          });
        }
      } catch (error) {
        console.error('WebRTC ICE candidate error:', error.message);
      }
    });

    /**
     * DISCONNECT
     * Clean up device status when socket disconnects
     */
    socket.on('disconnect', async () => {
      try {
        console.log(`🔌 Socket disconnected: ${user.name} - ${socket.id}`);

        if (socket.deviceId) {
          const device = await Device.findOne({
            userId: user._id,
            deviceId: socket.deviceId,
          });

          if (device) {
            device.isOnline = false;
            device.socketId = null;
            device.lastActiveAt = new Date();

            // If streaming, stop the stream
            if (device.streamStatus === 'streaming' && device.activeStreamRequestId) {
              const streamRequest = await StreamRequest.findById(
                device.activeStreamRequestId
              );
              if (streamRequest && streamRequest.status === 'accepted') {
                streamRequest.status = 'stopped';
                streamRequest.stoppedAt = new Date();
                await streamRequest.save();

                await ConsentLog.create({
                  streamRequestId: streamRequest._id,
                  userId: user._id,
                  deviceId: socket.deviceId,
                  adminId: streamRequest.adminId,
                  consentStatus: 'stopped',
                  ipAddress: socket.handshake.address,
                });

                io.to(`user:${streamRequest.adminId}`).emit('admin:stream_status', {
                  requestId: streamRequest._id,
                  status: 'stopped',
                  stoppedBy: 'disconnect',
                });
              }

              device.activeStreamRequestId = null;
            }

            device.streamStatus = 'idle';
            await device.save();

            emitDeviceListToAdmins(io);
          }
        }
      } catch (error) {
        console.error('Disconnect cleanup error:', error.message);
      }
    });
  });
};

/**
 * Emit updated device list to all connected admins
 */
async function emitDeviceListToAdmins(io) {
  try {
    const devices = await Device.find()
      .populate('userId', 'name email role')
      .sort({ isOnline: -1, lastActiveAt: -1 });

    io.to('role:ADMIN').emit('admin:device_list', {
      devices: devices.map((d) => d.toJSON()),
    });
  } catch (error) {
    console.error('Error emitting device list:', error.message);
  }
}

module.exports = initializeSocket;
