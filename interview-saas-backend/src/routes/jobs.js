import express from 'express';
import { query } from '../db/index.js';
const { authenticateCompany } = require('../middleware/auth');
import Joi from 'joi';

const router = express.Router();

// Validation schema
const jobSchema = Joi.object({
  title: Joi.string().min(2).max(255).required(),
  description: Joi.string().min(10).required(),
  department: Joi.string().max(100).optional(),
  seniority_level: Joi.string().valid('junior', 'mid', 'senior', 'lead', 'principal').optional(),
  location: Joi.string().max(255).optional(),
  job_type: Joi.string().valid('remote', 'hybrid', 'onsite').optional(),
  required_skills: Joi.array().items(Joi.string()).optional(),
  nice_to_have_skills: Joi.array().items(Joi.string()).optional(),
  language: Joi.string().valid('en', 'es', 'ar', 'hi', 'fr').default('en')
});

/**
 * POST /api/jobs
 * Create a new job position
 */
router.post('/', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = jobSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const {
      title, description, department, seniority_level, location,
      job_type, required_skills, nice_to_have_skills, language
    } = value;
    
    const result = await query(`
      INSERT INTO jobs (
        company_id, title, description, department, seniority_level,
        location, job_type, required_skills, nice_to_have_skills, language
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      req.company.id, title, description, department, seniority_level,
      location, job_type, JSON.stringify(required_skills || []),
      JSON.stringify(nice_to_have_skills || []), language
    ]);
    
    res.status(201).json({
      message: 'Job created successfully',
      job: result.rows[0]
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

/**
 * GET /api/jobs
 * List all jobs for a company
 */
router.get('/', authenticateCompany, async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let queryText = `
      SELECT * FROM jobs 
      WHERE company_id = $1
    `;
    const params = [req.company.id];
    
    if (status !== 'all') {
      queryText += ` AND status = $2`;
      params.push(status);
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await query(queryText, params);
    
    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM jobs WHERE company_id = $1' + (status !== 'all' ? ' AND status = $2' : ''),
      status !== 'all' ? [req.company.id, status] : [req.company.id]
    );
    
    res.json({
      jobs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error('List jobs error:', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

/**
 * GET /api/jobs/:id
 * Get a specific job
 */
router.get('/:id', authenticateCompany, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM jobs WHERE id = $1 AND company_id = $2',
      [req.params.id, req.company.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ job: result.rows[0] });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

/**
 * PUT /api/jobs/:id
 * Update a job
 */
router.put('/:id', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = jobSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const {
      title, description, department, seniority_level, location,
      job_type, required_skills, nice_to_have_skills, language
    } = value;
    
    const result = await query(`
      UPDATE jobs SET
        title = $1, description = $2, department = $3, seniority_level = $4,
        location = $5, job_type = $6, required_skills = $7, 
        nice_to_have_skills = $8, language = $9
      WHERE id = $10 AND company_id = $11
      RETURNING *
    `, [
      title, description, department, seniority_level, location,
      job_type, JSON.stringify(required_skills || []),
      JSON.stringify(nice_to_have_skills || []), language,
      req.params.id, req.company.id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      message: 'Job updated successfully',
      job: result.rows[0]
    });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

/**
 * PATCH /api/jobs/:id/status
 * Update job status (active, paused, closed)
 */
router.patch('/:id/status', authenticateCompany, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['active', 'paused', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const result = await query(
      'UPDATE jobs SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *',
      [status, req.params.id, req.company.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      message: 'Job status updated',
      job: result.rows[0]
    });
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({ error: 'Failed to update job status' });
  }
});

/**
 * DELETE /api/jobs/:id
 * Delete a job
 */
router.delete('/:id', authenticateCompany, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM jobs WHERE id = $1 AND company_id = $2 RETURNING id',
      [req.params.id, req.company.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

export default router;
