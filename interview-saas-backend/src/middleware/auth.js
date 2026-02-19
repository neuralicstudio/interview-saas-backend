const jwt = require('jsonwebtoken');
const { query } = require('../db');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

/**
 * Authenticate using JWT token (NEW - for user authentication)
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to request
    req.company = {
      id: decoded.companyId || decoded.userId,
      email: decoded.email,
      role: decoded.role || 'admin'
    };

    next();
  } catch (error) {
    logger.error('Token authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Authenticate using API key (EXISTING - keep for backwards compatibility)
 */
const authenticateCompany = async (req, res, next) => {
  try {
    // Check for API key in header or query
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Validate API key
    const result = await query(
      'SELECT id, name, email FROM companies WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    // Attach company info to request
    req.company = result.rows[0];
    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Flexible authentication - accepts either JWT token OR API key
 */
const authenticateEither = async (req, res, next) => {
  // Try JWT first
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.company = {
        id: decoded.companyId || decoded.userId,
        email: decoded.email,
        role: decoded.role || 'admin'
      };
      return next();
    } catch (error) {
      // JWT failed, try API key
    }
  }

  // Try API key
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (apiKey) {
    try {
      const result = await query(
        'SELECT id, name, email FROM companies WHERE api_key = $1',
        [apiKey]
      );

      if (result.rows.length > 0) {
        req.company = result.rows[0];
        return next();
      }
    } catch (error) {
      logger.error('API key authentication error:', error);
    }
  }

  // Both failed
  return res.status(401).json({
    success: false,
    message: 'Authentication required (JWT token or API key)'
  });
};

/**
 * Optional authentication - doesn't block if no auth provided
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.company = {
        id: decoded.companyId || decoded.userId,
        email: decoded.email,
        role: decoded.role || 'admin'
      };
    } catch (error) {
      // Token invalid but we don't block
      logger.debug('Optional auth token invalid');
    }
  }

  next();
};

/**
 * Check if company has remaining interview quota
 */
const checkQuota = async (req, res, next) => {
  try {
    const { query } = require('../db');
    
    const result = await query(
      'SELECT interviews_limit, interviews_used FROM companies WHERE id = $1',
      [req.company.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    const { interviews_limit, interviews_used } = result.rows[0];

    // If no limit set, allow unlimited
    if (interviews_limit === null || interviews_limit === 0) {
      return next();
    }

    // Check if quota exceeded
    if (interviews_used >= interviews_limit) {
      return res.status(403).json({
        success: false,
        message: 'Interview quota exceeded. Please upgrade your plan.',
        quota: {
          used: interviews_used,
          limit: interviews_limit
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Quota check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check quota'
    });
  }
};

module.exports = {
  authenticateToken,
  authenticateCompany,
  authenticateEither,
  optionalAuth,
  checkQuota  // ✅ Add this
};

module.exports = {
  authenticateToken,      // NEW - JWT authentication
  authenticateCompany,    // EXISTING - API key authentication
  authenticateEither,     // NEW - Accept either JWT or API key
  optionalAuth           // NEW - Optional authentication
};
