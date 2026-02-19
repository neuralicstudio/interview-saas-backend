const express = require('express');
const { authenticateCompany } = require('../middleware/auth');
const { query } = require('../db/index.js');  // ✅ Fixed
const { uploadResume, handleUploadError } = require('../middleware/upload.js');  // ✅ Fixed
const ResumeParserService = require('../services/ResumeParserService.js');  // ✅ Fixed
const Joi = require('joi');  // ✅ Fixed

const router = express.Router();

const candidateSchema = Joi.object({
  email: Joi.string().email().required(),
  full_name: Joi.string().min(2).max(255).required(),
  phone: Joi.string().max(50).optional(),
  linkedin_url: Joi.string().uri().optional(),
  resume_text: Joi.string().optional(),
  resume_parsed: Joi.object().optional(),
  source: Joi.string().max(100).optional()
});

/**
 * POST /api/candidates
 * Create a new candidate or return existing one
 */
router.post('/', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = candidateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { email, full_name, phone, linkedin_url, resume_text, resume_parsed, source } = value;
    
    // Check if candidate exists
    let result = await query('SELECT * FROM candidates WHERE email = $1', [email]);
    
    if (result.rows.length > 0) {
      // Update existing candidate
      result = await query(`
        UPDATE candidates SET
          full_name = $1, phone = $2, linkedin_url = $3,
          resume_text = $4, resume_parsed = $5
        WHERE email = $6
        RETURNING *
      `, [full_name, phone, linkedin_url, resume_text, JSON.stringify(resume_parsed), email]);
    } else {
      // Create new candidate
      result = await query(`
        INSERT INTO candidates (email, full_name, phone, linkedin_url, resume_text, resume_parsed, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [email, full_name, phone, linkedin_url, resume_text, JSON.stringify(resume_parsed), source]);
    }
    
    res.status(201).json({
      message: 'Candidate created successfully',
      candidate: result.rows[0]
    });
  } catch (error) {
    console.error('Create candidate error:', error);
    res.status(500).json({ error: 'Failed to create candidate' });
  }
});

/**
 * POST /api/candidates/upload-resume
 * Upload and parse resume
 */
router.post('/upload-resume', authenticateCompany, uploadResume, handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { email, full_name } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Parse resume
    const parsedResume = await ResumeParserService.parseResume(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    // Use name from resume if not provided
    const candidateName = full_name || parsedResume.parsed.personal?.name || 'Unknown';

    // Check if candidate exists
    let result = await query('SELECT * FROM candidates WHERE email = $1', [email]);

    if (result.rows.length > 0) {
      // Update existing candidate with parsed resume
      result = await query(`
        UPDATE candidates SET
          full_name = $1,
          phone = $2,
          linkedin_url = $3,
          resume_text = $4,
          resume_parsed = $5,
          updated_at = NOW()
        WHERE email = $6
        RETURNING *
      `, [
        candidateName,
        parsedResume.parsed.personal?.phone || result.rows[0].phone,
        parsedResume.parsed.personal?.linkedin || result.rows[0].linkedin_url,
        parsedResume.original_text,
        JSON.stringify(parsedResume.parsed),
        email
      ]);
    } else {
      // Create new candidate with parsed resume
      result = await query(`
        INSERT INTO candidates (
          email, full_name, phone, linkedin_url, 
          resume_text, resume_parsed, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        email,
        candidateName,
        parsedResume.parsed.personal?.phone,
        parsedResume.parsed.personal?.linkedin,
        parsedResume.original_text,
        JSON.stringify(parsedResume.parsed),
        'resume_upload'
      ]);
    }

    const candidate = result.rows[0];

    // Generate interview focus areas
    const focusAreas = ResumeParserService.generateInterviewFocusAreas(parsedResume.parsed);

    res.status(200).json({
      message: 'Resume parsed successfully',
      candidate: {
        id: candidate.id,
        email: candidate.email,
        full_name: candidate.full_name,
        phone: candidate.phone,
        linkedin_url: candidate.linkedin_url
      },
      parsed_data: {
        summary: parsedResume.parsed.summary,
        total_experience: parsedResume.parsed.total_years_experience,
        experience_level: ResumeParserService.calculateExperienceLevel(parsedResume.parsed),
        key_skills: parsedResume.parsed.all_skills?.slice(0, 10),
        experience_count: parsedResume.parsed.experience?.length || 0,
        education_count: parsedResume.parsed.education?.length || 0,
        certifications_count: parsedResume.parsed.certifications?.length || 0
      },
      interview_focus_areas: focusAreas,
      file_info: {
        name: parsedResume.file_name,
        size: parsedResume.file_size,
        parsed_at: parsedResume.parsed_at
      }
    });
  } catch (error) {
    console.error('Resume upload error:', error);
    res.status(500).json({ 
      error: 'Failed to parse resume',
      message: error.message 
    });
  }
});

/**
 * GET /api/candidates
 * List all candidates (across all interviews)
 */
router.get('/', authenticateCompany, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    
    let queryText = `
      SELECT DISTINCT c.* 
      FROM candidates c
      JOIN interviews i ON c.id = i.candidate_id
      WHERE i.company_id = $1
    `;
    const params = [req.company.id];
    
    if (search) {
      queryText += ` AND (c.full_name ILIKE $2 OR c.email ILIKE $2)`;
      params.push(`%${search}%`);
    }
    
    queryText += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await query(queryText, params);
    
    res.json({ candidates: result.rows });
  } catch (error) {
    console.error('List candidates error:', error);
    res.status(500).json({ error: 'Failed to list candidates' });
  }
});

/**
 * GET /api/candidates/:id
 * Get candidate details including interview history
 */
router.get('/:id', authenticateCompany, async (req, res) => {
  try {
    // Get candidate info
    const candidateResult = await query('SELECT * FROM candidates WHERE id = $1', [req.params.id]);
    
    if (candidateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    
    // Get interview history for this candidate with this company
    const interviewsResult = await query(`
      SELECT i.*, j.title as job_title
      FROM interviews i
      LEFT JOIN jobs j ON i.job_id = j.id
      WHERE i.candidate_id = $1 AND i.company_id = $2
      ORDER BY i.created_at DESC
    `, [req.params.id, req.company.id]);
    
    res.json({
      candidate: candidateResult.rows[0],
      interviews: interviewsResult.rows
    });
  } catch (error) {
    console.error('Get candidate error:', error);
    res.status(500).json({ error: 'Failed to get candidate' });
  }
});

/**
 * GET /api/candidates/:id/resume
 * Get parsed resume data for a candidate
 */
router.get('/:id/resume', authenticateCompany, async (req, res) => {
  try {
    const result = await query(
      'SELECT resume_text, resume_parsed FROM candidates WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const candidate = result.rows[0];

    if (!candidate.resume_parsed) {
      return res.status(404).json({ error: 'No resume data available for this candidate' });
    }

    res.json({
      resume_text: candidate.resume_text,
      resume_parsed: candidate.resume_parsed
    });
  } catch (error) {
    console.error('Get resume error:', error);
    res.status(500).json({ error: 'Failed to get resume data' });
  }
});

module.exports = router;
