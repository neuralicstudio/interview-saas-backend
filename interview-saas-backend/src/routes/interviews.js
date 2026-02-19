const express = require('express');
const { authenticateCompany, checkQuota } = require('../middleware/auth');
import { query, transaction } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import EmailService from '../services/EmailService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const createInterviewSchema = Joi.object({
  job_id: Joi.string().uuid().required(),
  candidate_id: Joi.string().uuid().required(),
  language: Joi.string().valid('en', 'es', 'ar', 'hi', 'fr').default('en'),
  duration_minutes: Joi.number().min(5).max(60).default(15),
  send_email: Joi.boolean().default(true)
});

/**
 * POST /api/interviews
 * Create a new interview and generate invite link
 */
router.post('/', authenticateCompany, checkQuota, async (req, res) => {
  try {
    const { error, value } = createInterviewSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { job_id, candidate_id, language, duration_minutes, send_email } = value;
    
    // Verify job belongs to company
    const jobCheck = await query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [job_id, req.company.id]
    );
    
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Verify candidate exists
    const candidateCheck = await query(
      'SELECT id, email FROM candidates WHERE id = $1',
      [candidate_id]
    );
    
    if (candidateCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    
    const result = await transaction(async (client) => {
      // Get active rubric for job
      const rubricResult = await client.query(
        'SELECT id FROM rubrics WHERE job_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
        [job_id]
      );
      
      const rubric_id = rubricResult.rows[0]?.id || null;
      
      // Create interview
      const interviewResult = await client.query(`
        INSERT INTO interviews (
          job_id, company_id, candidate_id, rubric_id, 
          language, duration_minutes, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
        RETURNING *
      `, [job_id, req.company.id, candidate_id, rubric_id, language, duration_minutes]);
      
      const interview = interviewResult.rows[0];
      
      // Generate invite token
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days
      
      const inviteResult = await client.query(`
        INSERT INTO interview_invites (interview_id, token, expires_at)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [interview.id, token, expiresAt]);
      
      // Increment company's interviews_used
      await client.query(
        'UPDATE companies SET interviews_used = interviews_used + 1 WHERE id = $1',
        [req.company.id]
      );
      
      return {
        interview,
        invite: inviteResult.rows[0],
        candidate_email: candidateCheck.rows[0].email
      };
    });
    
    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/interview/${result.invite.token}`;
    
    // Send email invite to candidate if enabled
    if (send_email) {
      try {
        // Get job and company details for email
        const jobDetails = await query(
          'SELECT j.title, c.name as company_name FROM jobs j JOIN companies c ON j.company_id = c.id WHERE j.id = $1',
          [job_id]
        );

        if (jobDetails.rows.length > 0) {
          const { title: jobTitle, company_name: companyName } = jobDetails.rows[0];

          await EmailService.sendInterviewInvite({
            candidateEmail: result.candidate_email,
            candidateName: candidateCheck.rows[0].full_name,
            companyName,
            jobTitle,
            inviteUrl,
            durationMinutes: duration_minutes,
            language
          });

          logger.info(`Email invite sent to ${result.candidate_email}`);
        }
      } catch (emailError) {
        // Log email error but don't fail the request
        logger.error('Failed to send email invite:', emailError);
      }
    }
    
    res.status(201).json({
      message: 'Interview created successfully',
      interview: result.interview,
      invite_url: inviteUrl,
      candidate_email: result.candidate_email,
      email_sent: send_email
    });
  } catch (error) {
    console.error('Create interview error:', error);
    res.status(500).json({ error: 'Failed to create interview' });
  }
});

/**
 * GET /api/interviews
 * List all interviews for company
 */
router.get('/', authenticateCompany, async (req, res) => {
  try {
    const { status, job_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let queryText = `
      SELECT 
        i.*,
        c.full_name as candidate_name,
        c.email as candidate_email,
        j.title as job_title
      FROM interviews i
      LEFT JOIN candidates c ON i.candidate_id = c.id
      LEFT JOIN jobs j ON i.job_id = j.id
      WHERE i.company_id = $1
    `;
    const params = [req.company.id];
    
    if (status) {
      queryText += ` AND i.status = $${params.length + 1}`;
      params.push(status);
    }
    
    if (job_id) {
      queryText += ` AND i.job_id = $${params.length + 1}`;
      params.push(job_id);
    }
    
    queryText += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await query(queryText, params);
    
    res.json({ interviews: result.rows });
  } catch (error) {
    console.error('List interviews error:', error);
    res.status(500).json({ error: 'Failed to list interviews' });
  }
});

/**
 * GET /api/interviews/:id
 * Get interview details and full report
 */
router.get('/:id', authenticateCompany, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        i.*,
        c.full_name as candidate_name,
        c.email as candidate_email,
        c.resume_text,
        c.resume_parsed,
        j.title as job_title,
        j.description as job_description
      FROM interviews i
      LEFT JOIN candidates c ON i.candidate_id = c.id
      LEFT JOIN jobs j ON i.job_id = j.id
      WHERE i.id = $1 AND i.company_id = $2
    `, [req.params.id, req.company.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }
    
    const interview = result.rows[0];
    
    // Get agent observations
    const observationsResult = await query(
      'SELECT * FROM agent_observations WHERE interview_id = $1 ORDER BY timestamp',
      [req.params.id]
    );
    
    res.json({
      interview,
      observations: observationsResult.rows
    });
  } catch (error) {
    console.error('Get interview error:', error);
    res.status(500).json({ error: 'Failed to get interview' });
  }
});

/**
 * GET /api/interviews/invite/:token
 * Get interview by invite token (public endpoint for candidates)
 */
router.get('/invite/:token', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        i.id,
        i.language,
        i.duration_minutes,
        i.status,
        j.title as job_title,
        c.name as company_name
      FROM interview_invites inv
      JOIN interviews i ON inv.interview_id = i.id
      JOIN jobs j ON i.job_id = j.id
      JOIN companies c ON i.company_id = c.id
      WHERE inv.token = $1 
      AND inv.expires_at > NOW()
    `, [req.params.token]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }
    
    // Mark as accessed
    await query(
      'UPDATE interview_invites SET accessed_at = NOW() WHERE token = $1',
      [req.params.token]
    );
    
    res.json({ interview: result.rows[0] });
  } catch (error) {
    console.error('Get invite error:', error);
    res.status(500).json({ error: 'Failed to get invite' });
  }
});

/**
 * POST /api/interviews/:id/start
 * Start an interview session
 */
router.post('/:id/start', async (req, res) => {
  try {
    const result = await query(`
      UPDATE interviews 
      SET status = 'in_progress', started_at = NOW()
      WHERE id = $1 AND status = 'scheduled'
      RETURNING *
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Interview cannot be started' });
    }
    
    res.json({
      message: 'Interview started',
      interview: result.rows[0]
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

/**
 * POST /api/interviews/:id/complete
 * Complete an interview and trigger report generation
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const result = await query(`
      UPDATE interviews 
      SET status = 'completed', completed_at = NOW()
      WHERE id = $1 AND status = 'in_progress'
      RETURNING *
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Interview cannot be completed' });
    }
    
    // TODO: Trigger report generation job here
    
    res.json({
      message: 'Interview completed',
      interview: result.rows[0]
    });
  } catch (error) {
    console.error('Complete interview error:', error);
    res.status(500).json({ error: 'Failed to complete interview' });
  }
});

/**
 * POST /api/interviews/:id/transcript
 * Add to interview transcript (called during interview)
 */
router.post('/:id/transcript', async (req, res) => {
  try {
    const { speaker, text, timestamp } = req.body;
    
    if (!speaker || !text) {
      return res.status(400).json({ error: 'Speaker and text required' });
    }
    
    const result = await query(`
      UPDATE interviews 
      SET transcript = transcript || $1::jsonb
      WHERE id = $2
      RETURNING id
    `, [JSON.stringify([{ speaker, text, timestamp: timestamp || new Date().toISOString() }]), req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }
    
    res.json({ message: 'Transcript updated' });
  } catch (error) {
    console.error('Update transcript error:', error);
    res.status(500).json({ error: 'Failed to update transcript' });
  }
});

/**
 * DELETE /api/interviews/:id
 * Cancel/delete an interview
 */
router.delete('/:id', authenticateCompany, async (req, res) => {
  try {
    const result = await query(
      'UPDATE interviews SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING id',
      ['cancelled', req.params.id, req.company.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }
    
    res.json({ message: 'Interview cancelled' });
  } catch (error) {
    console.error('Cancel interview error:', error);
    res.status(500).json({ error: 'Failed to cancel interview' });
  }
});

export default router;
