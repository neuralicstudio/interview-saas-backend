const express = require('express');
const router = express.Router();
const { authenticateCompany } = require('../middleware/auth'); // ✅ FIXED
const VisionAnalysisService = require('../services/VisionAnalysisService');
const { query } = require('../db');

// ... rest of your code stays the same
import Joi from 'joi';

const analyzeFrameSchema = Joi.object({
  interview_id: Joi.string().uuid().required(),
  frames: Joi.array().items(Joi.string()).min(1).max(10).required(),
  context: Joi.string().optional()
});

/**
 * POST /api/vision/analyze
 * Analyze video frames from an interview
 */
router.post('/analyze', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = analyzeFrameSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { interview_id, frames, context } = value;

    // Verify interview belongs to company
    const interviewCheck = await query(
      'SELECT * FROM interviews WHERE id = $1 AND company_id = $2',
      [interview_id, req.company.id]
    );

    if (interviewCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Analyze frames
    const analysis = await VisionAnalysisService.analyzeMultipleFrames(frames, context);

    // Save analysis to database
    await query(`
      INSERT INTO vision_analyses (
        interview_id, 
        company_id, 
        analysis_data,
        frames_analyzed
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (interview_id) DO UPDATE
      SET analysis_data = EXCLUDED.analysis_data,
          frames_analyzed = EXCLUDED.frames_analyzed,
          analyzed_at = NOW()
    `, [
      interview_id,
      req.company.id,
      JSON.stringify(analysis),
      frames.length
    ]);

    res.json({
      message: 'Video analysis completed',
      analysis,
      cost_estimate: VisionAnalysisService.estimateCost(frames.length)
    });
  } catch (error) {
    console.error('Vision analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze video',
      message: error.message
    });
  }
});

/**
 * GET /api/vision/analysis/:interview_id
 * Get vision analysis for an interview
 */
router.get('/analysis/:interview_id', authenticateCompany, async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM vision_analyses
      WHERE interview_id = $1 AND company_id = $2
    `, [req.params.interview_id, req.company.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No vision analysis found for this interview' });
    }

    res.json({
      analysis: result.rows[0].analysis_data,
      frames_analyzed: result.rows[0].frames_analyzed,
      analyzed_at: result.rows[0].analyzed_at
    });
  } catch (error) {
    console.error('Get vision analysis error:', error);
    res.status(500).json({ error: 'Failed to get vision analysis' });
  }
});

/**
 * POST /api/vision/estimate-cost
 * Estimate cost for video analysis
 */
router.post('/estimate-cost', authenticateCompany, async (req, res) => {
  try {
    const { frame_count } = req.body;

    if (!frame_count || frame_count < 1) {
      return res.status(400).json({ error: 'Valid frame_count required' });
    }

    const estimate = VisionAnalysisService.estimateCost(frame_count);

    res.json(estimate);
  } catch (error) {
    console.error('Cost estimation error:', error);
    res.status(500).json({ error: 'Failed to estimate cost' });
  }
});

module.exports = router;  // ✅ Use this
