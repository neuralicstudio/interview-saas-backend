import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pool from './db/index.js';
import { logger } from './utils/logger.js';
import WebSocketService from './services/WebSocketService.js';

// Import routes
import authRoutes from './routes/auth.js';
import jobRoutes from './routes/jobs.js';
import analyticsRoutes from './routes/analytics.js';
import candidateRoutes from './routes/candidates.js';
import interviewRoutes from './routes/interviews.js';
import rubricRoutes from './routes/rubrics.js';
import webhookRoutes from './routes/webhooks.js';
import healthRoutes from './routes/health.js';
import odooRoutes from './routes/odoo.js';
import interviewSessionRoutes from './routes/interview-session.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-run migrations on startup
async function runMigrations() {
  try {
    logger.info('🚀 Running database migrations...');
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    logger.info('✅ Database migrations completed successfully');
  } catch (error) {
    // If migration fails, check if tables already exist
    if (error.message && error.message.includes('already exists')) {
      logger.info('✅ Database tables already exist, skipping migration');
    } else {
      logger.error('❌ Migration failed:', error.message);
      // Don't exit - let the app start anyway for health checks
      logger.info('⚠️  App will start but database may not be initialized');
    }
  }
}

// Run migrations before starting server
await runMigrations();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server (needed for Socket.IO)
const httpServer = createServer(app);

// Initialize WebSocket service for voice interviews
const wsService = new WebSocketService(httpServer);
logger.info('🎤 WebSocket service initialized for voice interviews');

// IMPORTANT: Trust proxy for Render deployment
// This must come BEFORE rate limiting middleware
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
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
app.use('/api/interview-session', interviewSessionRoutes);

// Root endpoint
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server (use httpServer instead of app.listen for Socket.IO)
httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🎤 WebSocket ready for voice interviews`);
  logger.info(`🌍 Multi-lingual support: en, es, ar, hi, fr`);
});

export default app;
