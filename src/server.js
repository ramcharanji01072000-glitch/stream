const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const initializeSocket = require('./socket');
const authRoutes = require('./routes/auth.routes');
const deviceRoutes = require('./routes/device.routes');
const photoRoutes = require('./routes/photo.routes');
const adminRoutes = require('./routes/admin.routes');

const corsOptions = config.cors.origin === '*'
  ? { origin: true, methods: ['GET', 'POST'], credentials: true }
  : { origin: config.cors.origin, methods: ['GET', 'POST'], credentials: true };

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'StreamView API running', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});
app.use(errorHandler);

initializeSocket(io);

const startServer = async () => {
  await connectDB();
  server.listen(config.port, () => {
    console.log(`🚀 StreamView Backend running on port ${config.port} [${config.nodeEnv}]`);
  });
};

startServer();
module.exports = { app, server, io };
