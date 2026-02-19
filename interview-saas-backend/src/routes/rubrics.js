const express = require('express');
const { authenticateCompany } = require('../middleware/auth');
import { query } from '../db/index.js';
import RubricBuilderAgent from '../agents/RubricBuilderAgent.js';

const router = express.Router();

/**
 * POST /api/rubrics/generate
 * Generate a new rubric from job description using AI
 */
router.post('/generate', authenticateCompany, async (req, res) => {
  try {
    const { job_id } = req.body;
    
    if (!job_id) {
      return res.status(400).json({ error: 'job_id required' });
    }
    
    // Get job details
    const jobResult = await query(
      'SELECT * FROM jobs WHERE id = $1 AND company_id = $2',
      [job_id, req.company.id]
    );
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = jobResult.rows[0];
    
    // Use AI Rubric Builder Agent to generate questions
    const rubric = await RubricBuilderAgent.generateRubric(job, job.language || 'en');
    
    // Save rubric
    const result = await query(`
      INSERT INTO rubrics (job_id, competencies, question_bank, evaluation_criteria, created_by)
      VALUES ($1, $2, $3, $4, 'ai')
      RETURNING *
    `, [
      job_id,
      JSON.stringify(rubric.competencies),
      JSON.stringify(rubric.question_bank),
      JSON.stringify(rubric.evaluation_criteria)
    ]);
    
    res.status(201).json({
      message: 'Rubric generated successfully',
      rubric: result.rows[0]
    });
  } catch (error) {
    console.error('Generate rubric error:', error);
    res.status(500).json({ error: 'Failed to generate rubric' });
  }
});

/**
 * GET /api/rubrics/job/:job_id
 * Get all rubrics for a job
 */
router.get('/job/:job_id', authenticateCompany, async (req, res) => {
  try {
    // Verify job belongs to company
    const jobCheck = await query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [req.params.job_id, req.company.id]
    );
    
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const result = await query(
      'SELECT * FROM rubrics WHERE job_id = $1 ORDER BY created_at DESC',
      [req.params.job_id]
    );
    
    res.json({ rubrics: result.rows });
  } catch (error) {
    console.error('Get rubrics error:', error);
    res.status(500).json({ error: 'Failed to get rubrics' });
  }
});

/**
 * GET /api/rubrics/:id
 * Get a specific rubric
 */
router.get('/:id', authenticateCompany, async (req, res) => {
  try {
    const result = await query(`
      SELECT r.* 
      FROM rubrics r
      JOIN jobs j ON r.job_id = j.id
      WHERE r.id = $1 AND j.company_id = $2
    `, [req.params.id, req.company.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rubric not found' });
    }
    
    res.json({ rubric: result.rows[0] });
  } catch (error) {
    console.error('Get rubric error:', error);
    res.status(500).json({ error: 'Failed to get rubric' });
  }
});

/**
 * PUT /api/rubrics/:id
 * Update a rubric (manual editing)
 */
router.put('/:id', authenticateCompany, async (req, res) => {
  try {
    const { competencies, question_bank, evaluation_criteria } = req.body;
    
    const result = await query(`
      UPDATE rubrics r
      SET 
        competencies = $1,
        question_bank = $2,
        evaluation_criteria = $3,
        created_by = 'manual'
      FROM jobs j
      WHERE r.id = $4 AND r.job_id = j.id AND j.company_id = $5
      RETURNING r.*
    `, [
      JSON.stringify(competencies),
      JSON.stringify(question_bank),
      JSON.stringify(evaluation_criteria),
      req.params.id,
      req.company.id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rubric not found' });
    }
    
    res.json({
      message: 'Rubric updated successfully',
      rubric: result.rows[0]
    });
  } catch (error) {
    console.error('Update rubric error:', error);
    res.status(500).json({ error: 'Failed to update rubric' });
  }
});

/**
 * PATCH /api/rubrics/:id/activate
 * Set a rubric as active (deactivates others for same job)
 */
router.patch('/:id/activate', authenticateCompany, async (req, res) => {
  try {
    // Get rubric and verify ownership
    const rubricResult = await query(`
      SELECT r.*, j.company_id
      FROM rubrics r
      JOIN jobs j ON r.job_id = j.id
      WHERE r.id = $1
    `, [req.params.id]);
    
    if (rubricResult.rows.length === 0 || rubricResult.rows[0].company_id !== req.company.id) {
      return res.status(404).json({ error: 'Rubric not found' });
    }
    
    const rubric = rubricResult.rows[0];
    
    // Deactivate all rubrics for this job
    await query(
      'UPDATE rubrics SET is_active = false WHERE job_id = $1',
      [rubric.job_id]
    );
    
    // Activate this rubric
    await query(
      'UPDATE rubrics SET is_active = true WHERE id = $1',
      [req.params.id]
    );
    
    res.json({ message: 'Rubric activated successfully' });
  } catch (error) {
    console.error('Activate rubric error:', error);
    res.status(500).json({ error: 'Failed to activate rubric' });
  }
});

module.exports = router;  // ✅ NOT "export default router"
