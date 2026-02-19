const express = require('express');
const { createServer } = require('http');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

// Local imports - Note: .js extensions are optional in CJS but kept for clarity
const pool = require('./db/index.js');
const visionRoutes = require('./routes/vision.js');
const { logger } = require('./utils/logger.js');
const WebSocketService = require('./services/WebSocketService.js');

// Route imports
const authRoutes = require('./routes/auth.js');
const jobRoutes = require('./routes/jobs.js');
const analyticsRoutes = require('./routes/analytics.js');
const candidateRoutes = require('./routes/candidates.js');
const interviewRoutes = require('./routes/interviews.js');
const rubricRoutes = require('./routes/rubrics.js');
const webhookRoutes = require('./routes/webhooks.js');
const healthRoutes = require('./routes/health.js');
const odooRoutes = require('./routes/odoo.js');
const interviewSessionRoutes = require('./routes/interview-session.js');

// In CommonJS, __dirname and __filename are available globally
// No need for fileURLToPath or import.meta.url

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Auto-run migrations on startup
async function runMigrations() {
  try {
    logger.info('🚀 Running database migrations...');
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    logger.info('✅ Database migrations completed successfully');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      logger.info('✅ Database tables already exist, skipping migration');
    } else {
      logger.error('❌ Migration failed:', error.message);
      logger.info('⚠️ App will start but database may not be initialized');
    }
  }
}

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket service
const wsService = new WebSocketService(httpServer);
logger.info('🎤 WebSocket service initialized for voice interviews');

app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/rubrics', rubricRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/odoo', odooRoutes);
app.use('/api/vision', visionRoutes);
app.use('/api/interview-session', interviewSessionRoutes);

app.get('/', (req, res) => {
  res.json({
    service: 'Interview SaaS Backend',
    version: '2.0.0',
    status: 'running',
    features: {
      voice_interviews: true,
      multi_lingual: true,
      ai_agents: 6
    },
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      jobs: '/api/jobs',
      candidates: '/api/candidates',
      interviews: '/api/interviews',
      rubrics: '/api/rubrics',
      webhooks: '/api/webhooks',
      interviewSession: '/api/interview-session'
    },
    websocket: {
      active_sessions: wsService.getActiveSessionCount(),
      url: '/socket.io/'
    }
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start logic wrapped to handle the migration promise
async function startServer() {
  await runMigrations();
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🎤 WebSocket ready for voice interviews`);
    logger.info(`🌍 Multi-lingual support: en, es, ar, hi, fr`);
  });
}

startServer();

module.exports = app;
