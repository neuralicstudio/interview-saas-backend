const express = require('express');
const router = express.Router();
const { authenticateCompany } = require('../middleware/auth');
const multer = require('multer');
const VisionAnalysisService = require('../services/VisionAnalysisService');

// Configure multer for handling image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  }
});

/**
 * POST /api/vision/analyze
 * Analyze body language from interview video frame
 */
router.post('/analyze', authenticateCompany, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const { interviewId, timestamp } = req.body;

    if (!interviewId) {
      return res.status(400).json({
        success: false,
        message: 'Interview ID is required'
      });
    }

    // Convert buffer to base64
    const base64Image = req.file.buffer.toString('base64');

    // Analyze with GPT-4 Vision
    const analysis = await VisionAnalysisService.analyzeBodyLanguage(base64Image);

    // Save analysis to database
    const { query } = require('../db');
    await query(
      `INSERT INTO vision_analyses (interview_id, timestamp, analysis, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [interviewId, timestamp || new Date(), JSON.stringify(analysis)]
    );

    res.status(200).json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Vision analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze image',
      error: error.message
    });
  }
});

/**
 * GET /api/vision/interview/:interviewId
 * Get all vision analyses for an interview
 */
router.get('/interview/:interviewId', authenticateCompany, async (req, res) => {
  try {
    const { interviewId } = req.params;

    const { query } = require('../db');
    const result = await query(
      `SELECT * FROM vision_analyses 
       WHERE interview_id = $1 
       ORDER BY timestamp ASC`,
      [interviewId]
    );

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching vision analyses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analyses',
      error: error.message
    });
  }
});

module.exports = router;
