'use strict';

const config = require('./config/env');
const logger = require('./config/logger');

// Capture unhandled errors
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason: reason?.message || reason });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { globalRateLimiter } = require('./middleware/rateLimiter');
const routes = require('./routes');
const prisma = require('./config/database');
const { initSocketIO } = require('./services/socketService');

const app = express();

// ─── Security ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));

// ─── Stripe Webhook (raw body, must be before JSON parser) ──────────────────
app.post('/api/webhook', express.raw({ type: 'application/json' }), require('./controllers/paymentController').webhook);

// ─── Body Parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('trust proxy', 1);

// ─── Rate Limiting ──────────────────────────────────────────────────────────
app.use(globalRateLimiter);

// ─── Health Check ───────────────────────────────────────────────────────────
app.all('/', (req, res) => {
  res.json({ status: 'ok', message: 'Kaaya API v2.0.0', timestamp: new Date().toISOString() });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── Error Handling ─────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Server Bootstrap ───────────────────────────────────────────────────────
const startServer = async () => {
  // Connect to database
  await prisma.$connect().then(() => logger.info('✅ Database connected')).catch((err) => {
    logger.error('❌ Database connection failed', { error: err.message });
  });

  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`🚀 Kaaya Backend v2.0.0 running on port ${config.port} [${config.nodeEnv}]`);
  });

  // Initialize Socket.io
  initSocketIO(server);

  // Initialize Raw WebSockets for Native Android Overlay
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url.split('?')[0];
    if (pathname === '/api/live/raw') {
      const urlParams = new URLSearchParams(request.url.split('?')[1] || '');
      const token = urlParams.get('token');
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, config.jwt.secret);
        request.userId = decoded.sub || decoded.id;
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } catch (err) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    }
    // DO NOT handle else block. socket.io handles other upgrades automatically.
  });

  wss.on('connection', (ws, request) => {
    const userId = request.userId;
    ws.on('message', (data) => {
      if (Buffer.isBuffer(data)) {
        // Route to Wake Word service!
        const io = getIO();
        if (io) {
          io.emit('wake_word:audio', { audio: data.toString('base64') });
        }
      }
    });
  });

  // Initialize WhatsApp (delayed so DB pool isn't exhausted)
  setTimeout(async () => {
    try {
      const { initWhatsApp } = require('./services/whatsappService');
      await initWhatsApp();
    } catch (err) {
      logger.error('WhatsApp init failed', { error: err.message });
    }
  }, 5000);

  // ─── Graceful Shutdown ──────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer().catch((err) => {
  logger.error('Server startup failed', { error: err.message });
  process.exit(1);
});

module.exports = app;
