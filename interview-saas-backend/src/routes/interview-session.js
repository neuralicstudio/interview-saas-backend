const express = require('express');
import InterviewOrchestrator from '../agents/InterviewOrchestrator.js';
import { query } from '../db/index.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/interview-session/start/:interview_id
 * Start interview and get opening message
 */
router.post('/start/:interview_id', async (req, res) => {
  try {
    const { interview_id } = req.params;

    // Verify interview exists and is scheduled
    const check = await query(
      'SELECT status FROM interviews WHERE id = $1',
      [interview_id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (check.rows[0].status !== 'scheduled') {
      return res.status(400).json({ error: 'Interview already started or completed' });
    }

    // Update status to in_progress
    await query(
      'UPDATE interviews SET status = $1, started_at = NOW() WHERE id = $2',
      ['in_progress', interview_id]
    );

    // Create orchestrator and start interview
    const orchestrator = new InterviewOrchestrator(interview_id);
    const result = await orchestrator.startInterview();

    res.json({
      message: result.message,
      phase: result.phase,
      interview_id
    });
  } catch (error) {
    logger.error('Start interview session error:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

/**
 * POST /api/interview-session/respond/:interview_id
 * Process candidate response and get next question
 */
router.post('/respond/:interview_id', async (req, res) => {
  try {
    const { interview_id } = req.params;
    const { response } = req.body;

    if (!response || typeof response !== 'string') {
      return res.status(400).json({ error: 'Response text required' });
    }

    // Verify interview is in progress
    const check = await query(
      'SELECT status FROM interviews WHERE id = $1',
      [interview_id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (check.rows[0].status !== 'in_progress') {
      return res.status(400).json({ error: 'Interview not in progress' });
    }

    // Process response
    const orchestrator = new InterviewOrchestrator(interview_id);
    const result = await orchestrator.processResponse(response);

    if (result.completed) {
      res.json({
        message: result.message,
        completed: true,
        report_preview: {
          overall_fit: result.report.overall_fit,
          overall_score: result.report.overall_score,
          recommendation: result.report.recommendation
        }
      });
    } else {
      res.json({
        message: result.message,
        phase: result.phase,
        stress_level: result.stress_level,
        completed: false
      });
    }
  } catch (error) {
    logger.error('Process response error:', error);
    res.status(500).json({ error: 'Failed to process response' });
  }
});

/**
 * GET /api/interview-session/status/:interview_id
 * Get current interview status
 */
router.get('/status/:interview_id', async (req, res) => {
  try {
    const { interview_id } = req.params;

    const result = await query(`
      SELECT 
        i.id,
        i.status,
        i.language,
        i.started_at,
        i.completed_at,
        i.live_state,
        jsonb_array_length(i.transcript) as message_count
      FROM interviews i
      WHERE i.id = $1
    `, [interview_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    res.json({ interview: result.rows[0] });
  } catch (error) {
    logger.error('Get interview status error:', error);
    res.status(500).json({ error: 'Failed to get interview status' });
  }
});

/**
 * POST /api/interview-session/end/:interview_id
 * Manually end interview early
 */
router.post('/end/:interview_id', async (req, res) => {
  try {
    const { interview_id } = req.params;

    // Verify interview is in progress
    const check = await query(
      'SELECT status FROM interviews WHERE id = $1',
      [interview_id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    if (check.rows[0].status !== 'in_progress') {
      return res.status(400).json({ error: 'Interview not in progress' });
    }

    // End interview
    const orchestrator = new InterviewOrchestrator(interview_id);
    const result = await orchestrator.endInterview();

    res.json({
      message: result.message,
      completed: true,
      report_preview: {
        overall_fit: result.report.overall_fit,
        overall_score: result.report.overall_score,
        recommendation: result.report.recommendation
      }
    });
  } catch (error) {
    logger.error('End interview error:', error);
    res.status(500).json({ error: 'Failed to end interview' });
  }
});

export default router;
