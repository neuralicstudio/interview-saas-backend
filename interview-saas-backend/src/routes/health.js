const express = require('express');
const { query } = require('../db/index.js');  // ✅ Fixed

const router = express.Router();

/**
 * GET /api/health
 * Basic health check
 */
router.get('/', async (req, res) => {
  try {
    // Check database connection
    await query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        api: 'running'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

module.exports = router;
